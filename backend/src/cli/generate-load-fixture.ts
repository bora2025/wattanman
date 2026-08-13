import { createWriteStream, mkdirSync, writeFileSync } from 'fs';
import { once } from 'events';
import { resolve } from 'path';
import { CERTIFICATION_SCALE, fixtureManifest, FixtureScale, schoolFixture } from '../load-test/synthetic-fixture';

function integer(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  return value;
}

async function main() {
  const seed = process.env.LOAD_FIXTURE_SEED?.trim() || 'wattaman-certification-v1';
  const scale: FixtureScale = {
    schools: integer('LOAD_FIXTURE_SCHOOLS', CERTIFICATION_SCALE.schools, 1, 1000),
    usersPerSchool: integer('LOAD_FIXTURE_USERS_PER_SCHOOL', CERTIFICATION_SCALE.usersPerSchool, 1, 1000),
    extensionsPerSchool: integer('LOAD_FIXTURE_EXTENSIONS_PER_SCHOOL', CERTIFICATION_SCALE.extensionsPerSchool, 0, 50),
    recordsPerExtension: integer('LOAD_FIXTURE_RECORDS_PER_EXTENSION', CERTIFICATION_SCALE.recordsPerExtension, 0, 1000),
    auditsPerSchool: integer('LOAD_FIXTURE_AUDITS_PER_SCHOOL', CERTIFICATION_SCALE.auditsPerSchool, 0, 5000),
    assetsPerSchool: integer('LOAD_FIXTURE_ASSETS_PER_SCHOOL', CERTIFICATION_SCALE.assetsPerSchool, 0, 1000),
  };
  const output = resolve(process.env.LOAD_FIXTURE_OUTPUT || 'load-fixtures');
  mkdirSync(output, { recursive: true });
  const names = ['schools', 'users', 'installations', 'records', 'audits', 'assets'] as const;
  const streams = Object.fromEntries(names.map((name) => [name, createWriteStream(resolve(output, `${name}.ndjson`), { encoding: 'utf8' })])) as Record<typeof names[number], ReturnType<typeof createWriteStream>>;
  const write = async (name: typeof names[number], row: unknown) => { if (!streams[name].write(`${JSON.stringify(row)}\n`)) await once(streams[name], 'drain'); };
  for (let schoolIndex = 0; schoolIndex < scale.schools; schoolIndex += 1) {
    const fixture = schoolFixture(seed, schoolIndex, scale);
    await write('schools', fixture.school);
    for (const name of ['users', 'installations', 'records', 'audits', 'assets'] as const) for (const row of fixture[name]) await write(name, row);
  }
  await Promise.all(Object.values(streams).map(async (stream) => { stream.end(); await once(stream, 'finish'); }));
  const manifest = fixtureManifest(seed, scale);
  writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ outcome: 'GENERATED', output, ...manifest })}\n`);
}

main().catch((error) => { process.stderr.write(`${error?.message || error}\n`); process.exitCode = 1; });
