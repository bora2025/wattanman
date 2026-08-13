import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { DatabaseSnapshot, obsoleteTablesFromMigration, safeBackupName, sha256File, signRehearsalReport, validateDestructiveRehearsalConfig, verifyDestructiveSnapshots } from '../database/destructive-migration-rehearsal';

async function command(executable: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = 3 * 60 * 60_000) {
  const started = Date.now();
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const child = spawn(executable, args, { shell: false, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => { if (Buffer.concat(stdout).length < 1_000_000) stdout.push(Buffer.from(chunk)); });
  child.stderr.on('data', (chunk) => { if (Buffer.concat(stderr).length < 1_000_000) stderr.push(Buffer.from(chunk)); });
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, reject) => { child.once('error', reject); child.once('exit', (code, signal) => done({ code, signal })); }).finally(() => clearTimeout(timer));
  const evidence = { executable: executable.replace(/^.*[\\/]/, ''), durationMs: Date.now() - started, exitCode: result.code, signal: result.signal, stdoutSha256: createHash('sha256').update(Buffer.concat(stdout)).digest('hex'), stderrSha256: createHash('sha256').update(Buffer.concat(stderr)).digest('hex') };
  if (result.code !== 0) throw new Error(`${evidence.executable} failed with ${result.code ?? result.signal}`);
  return evidence;
}

async function clientAction<T>(url: string, action: (client: PrismaClient) => Promise<T>) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try { await client.$connect(); return await action(client); } finally { await client.$disconnect(); }
}

async function reset(url: string) {
  await clientAction(url, async (client) => {
    await client.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await client.$executeRawUnsafe('CREATE SCHEMA public');
  });
}

async function snapshot(url: string): Promise<DatabaseSnapshot> {
  return clientAction(url, async (client) => {
    const size = await client.$queryRawUnsafe<Array<{ bytes: bigint }>>('SELECT pg_database_size(current_database())::bigint AS bytes');
    const rows = await client.$queryRawUnsafe<Array<{ tablename: string }>>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    const tables: Record<string, number> = {};
    for (const row of rows) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(row.tablename)) throw new Error('Database returned an unsafe table identifier');
      const count = await client.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*)::bigint AS count FROM "${row.tablename}"`);
      tables[row.tablename] = Number(count[0]?.count || 0);
    }
    return { databaseBytes: Number(size[0]?.bytes || 0), tables };
  });
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error('Usage: node rehearse-destructive-migration.js <signed-report.json>');
  const config = validateDestructiveRehearsalConfig({ targetUrl: process.env.DESTRUCTIVE_REHEARSAL_DATABASE_URL, runtimeUrl: process.env.DATABASE_URL, backupPath: process.env.DESTRUCTIVE_REHEARSAL_BACKUP_PATH, authorization: process.env.DESTRUCTIVE_REHEARSAL_AUTHORIZATION, minimumBytes: Number(process.env.DESTRUCTIVE_REHEARSAL_MIN_BYTES || 1024 * 1024 * 1024) });
  const migrationPath = resolve('prisma/migrations/20260810000011_remove_legacy_feature_schema/migration.sql');
  const obsoleteTables = obsoleteTablesFromMigration(readFileSync(migrationPath, 'utf8'));
  const target = new URL(config.targetUrl);
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!databaseName) throw new Error('Rehearsal database name is required');
  const connectionArgs = ['--host', target.hostname, '--port', target.port || '5432', '--username', decodeURIComponent(target.username), '--dbname', databaseName];
  const environment = { ...process.env, PGPASSWORD: decodeURIComponent(target.password), ...(target.searchParams.get('sslmode') ? { PGSSLMODE: target.searchParams.get('sslmode')! } : {}) };
  delete environment.DATABASE_URL;
  const steps: unknown[] = [];
  let cleaned = false;
  try {
    await reset(config.targetUrl);
    steps.push(await command(process.env.PG_RESTORE_EXECUTABLE || 'pg_restore', ['--list', config.backupPath], environment, 10 * 60_000));
    steps.push(await command(process.env.PG_RESTORE_EXECUTABLE || 'pg_restore', [...connectionArgs, '--exit-on-error', '--no-owner', '--no-privileges', config.backupPath], environment));
    const before = await snapshot(config.targetUrl);
    steps.push(await command(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', resolve('prisma/schema.prisma')], { ...process.env, DATABASE_URL: config.targetUrl }));
    const after = await snapshot(config.targetUrl);
    await reset(config.targetUrl);
    steps.push(await command(process.env.PG_RESTORE_EXECUTABLE || 'pg_restore', [...connectionArgs, '--exit-on-error', '--no-owner', '--no-privileges', config.backupPath], environment));
    const restored = await snapshot(config.targetUrl);
    const verification = verifyDestructiveSnapshots(before, after, restored, obsoleteTables, config.minimumBytes);
    await reset(config.targetUrl);
    cleaned = true;
    const payload = { schemaVersion: 1, outcome: 'PASSED', runId: `destructive-rehearsal-${Date.now()}`, backup: { fileName: safeBackupName(config.backupPath), sha256: await sha256File(config.backupPath), restoredDatabaseBytes: before.databaseBytes }, migration: '20260810000011_remove_legacy_feature_schema', verification, cleanupVerified: true, commandEvidence: steps, completedAt: new Date().toISOString() };
    const report = signRehearsalReport(payload, process.env.DESTRUCTIVE_REHEARSAL_SIGNING_PRIVATE_KEY_PEM || '', process.env.DESTRUCTIVE_REHEARSAL_SIGNING_KEY_ID || '');
    const output = resolve(outputPath); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ outcome: 'PASSED', runId: payload.runId, report: output, backupSha256: payload.backup.sha256 })}\n`);
  } finally {
    if (!cleaned) await reset(config.targetUrl).catch(() => undefined);
  }
}

main().catch((error) => { process.stderr.write(`${error?.message || error}\n`); process.exitCode = 1; });
