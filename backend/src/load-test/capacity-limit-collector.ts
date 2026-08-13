import { createHash } from 'crypto';
import { assertLoadTestHttpTarget } from './database-safety';

type Snapshot = {
  dependencies?: {
    database?: { status?: string; totalConnections?: number; maxConnections?: number };
    redis?: { status?: string; memoryUtilizationPct?: number | null };
    r2?: { status?: string; errorRatePct?: number };
  };
  queues?: Array<{ status?: string; oldestJobAgeMs?: number; workers?: number }>;
};

function finite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Missing or invalid ${label}`);
  return value;
}

export function summarizeCapacitySnapshots(snapshots: Snapshot[]) {
  if (!snapshots.length) throw new Error('At least one capacity snapshot is required');
  let databasePoolMaxPct = 0;
  let redisMemoryMaxPct = 0;
  let queueOldestJobSeconds = 0;
  let minimumWorkers = Number.POSITIVE_INFINITY;
  let r2ErrorRatePct = 0;
  for (const snapshot of snapshots) {
    const database = snapshot.dependencies?.database;
    const redis = snapshot.dependencies?.redis;
    const r2 = snapshot.dependencies?.r2;
    if (database?.status !== 'healthy' || redis?.status !== 'healthy' || r2?.status !== 'healthy') throw new Error('Dependency became unhealthy during capacity sampling');
    const total = finite(database.totalConnections, 'database total connections');
    const maximum = finite(database.maxConnections, 'database maximum connections');
    if (maximum <= 0) throw new Error('Database maximum connections must be positive');
    databasePoolMaxPct = Math.max(databasePoolMaxPct, Number(((total / maximum) * 100).toFixed(3)));
    redisMemoryMaxPct = Math.max(redisMemoryMaxPct, finite(redis.memoryUtilizationPct, 'Redis memory utilization'));
    r2ErrorRatePct = Math.max(r2ErrorRatePct, finite(r2.errorRatePct, 'R2 error rate'));
    if (!snapshot.queues?.length) throw new Error('Queue capacity snapshots are required');
    for (const queue of snapshot.queues) {
      if (queue.status === 'unhealthy') throw new Error('Queue became unhealthy during capacity sampling');
      queueOldestJobSeconds = Math.max(queueOldestJobSeconds, Number((finite(queue.oldestJobAgeMs, 'queue oldest job age') / 1000).toFixed(3)));
      minimumWorkers = Math.min(minimumWorkers, finite(queue.workers, 'queue workers'));
    }
  }
  return { databasePoolMaxPct, redisMemoryMaxPct, queueOldestJobSeconds, minimumWorkers, r2ErrorRatePct };
}

export async function collectCapacityLimits(input: { target: string; token: string; samples: number; intervalMs: number }) {
  const target = assertLoadTestHttpTarget(input.target);
  if (!input.token) throw new Error('LOAD_TEST_OPERATOR_TOKEN is required');
  if (!Number.isInteger(input.samples) || input.samples < 2 || input.samples > 720) throw new Error('Capacity samples must be between 2 and 720');
  if (!Number.isInteger(input.intervalMs) || input.intervalMs < 1000 || input.intervalMs > 60_000) throw new Error('Capacity sample interval must be between 1 and 60 seconds');
  const snapshots: Snapshot[] = [];
  const snapshotHashes: string[] = [];
  for (let index = 0; index < input.samples; index += 1) {
    const response = await fetch(`${target}/platform/observability?minutes=5`, { headers: { Authorization: `Bearer ${input.token}`, 'X-Load-Test-Run': process.env.LOAD_TEST_RUN_ID || 'capacity' }, signal: AbortSignal.timeout(30_000) });
    if (response.status !== 200) throw new Error(`Observability snapshot returned ${response.status}`);
    const text = await response.text();
    let snapshot: Snapshot;
    try { snapshot = JSON.parse(text); } catch { throw new Error('Observability snapshot was not valid JSON'); }
    snapshots.push(snapshot);
    snapshotHashes.push(createHash('sha256').update(text).digest('hex'));
    if (index + 1 < input.samples) await new Promise((resolve) => setTimeout(resolve, input.intervalMs));
  }
  return {
    schemaVersion: 1,
    runId: process.env.LOAD_TEST_RUN_ID || null,
    target,
    startedAt: new Date(Date.now() - (input.samples - 1) * input.intervalMs).toISOString(),
    completedAt: new Date().toISOString(),
    sampleCount: snapshots.length,
    sampleIntervalMs: input.intervalMs,
    snapshotHashes,
    limits: summarizeCapacitySnapshots(snapshots),
  };
}
