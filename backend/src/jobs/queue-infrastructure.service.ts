import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { tenantContext } from '../tenancy/tenant-context';
import { assertJobEnvelope, createJobEnvelope, JobEnvelope, JobTenantScope, JobActor } from './job-envelope';
import { assertProductionRedisUrl } from '../security/redis-url';

const DEFAULT_ATTEMPTS = 8;
const DEFAULT_BACKOFF_MS = 1_000;
const DEFAULT_LOCK_MS = 30_000;

@Injectable()
export class QueueInfrastructureService implements OnModuleDestroy {
  private readonly redis: IORedis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Set<Worker>();

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) throw new Error('REDIS_URL is required for queue infrastructure');
    assertProductionRedisUrl(url);
    this.redis = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: true });
  }

  async enqueue<T>(queueName: string, input: {
    type: string;
    tenant: JobTenantScope;
    actor: JobActor;
    traceId?: string;
    idempotencyKey: string;
    payload: T;
  }) {
    const envelope = createJobEnvelope(input);
    const jobId = createHash('sha256').update(`${queueName}:${input.idempotencyKey}`).digest('hex');
    return this.queue(queueName).add(envelope.type, envelope, {
      jobId,
      attempts: DEFAULT_ATTEMPTS,
      backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_MS, jitter: 0.5 },
      removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
      removeOnFail: false,
    });
  }

  createWorker(queueName: string, handler: (envelope: JobEnvelope) => Promise<unknown>) {
    const worker = new Worker(queueName, async (job: Job) => {
      assertJobEnvelope(job.data);
      const envelope = { ...job.data, attempt: job.attemptsMade + 1 } as JobEnvelope;
      const scope = { schoolId: envelope.tenant.schoolId, mode: envelope.tenant.mode === 'PLATFORM' ? 'unscoped' as const : 'scoped' as const };
      return tenantContext.run(scope, () => handler(envelope));
    }, {
      connection: this.redis.duplicate({ lazyConnect: true }),
      concurrency: Number(process.env.QUEUE_WORKER_CONCURRENCY || 5),
      lockDuration: Number(process.env.QUEUE_JOB_LOCK_MS || DEFAULT_LOCK_MS),
      stalledInterval: Number(process.env.QUEUE_STALLED_INTERVAL_MS || 15_000),
      maxStalledCount: 2,
    });
    worker.on('failed', async (job, error) => {
      if (!job || job.attemptsMade < (job.opts.attempts || DEFAULT_ATTEMPTS)) return;
      const deadLetter = this.queue(`${queueName}.dead-letter`);
      await deadLetter.add(job.name, {
        envelope: job.data,
        sourceQueue: queueName,
        sourceJobId: job.id,
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
        error: { name: error.name, message: error.message, stack: error.stack },
      }, { jobId: `${job.id || randomUUID()}-dead`, removeOnComplete: false, removeOnFail: false });
    });
    this.workers.add(worker);
    return worker;
  }

  async acquireLease(key: string, owner: string, ttlMs: number): Promise<boolean> {
    if (!key || !owner || ttlMs < 1_000) throw new Error('Invalid lease request');
    return (await this.redis.set(`lease:${key}`, owner, 'PX', ttlMs, 'NX')) === 'OK';
  }

  async renewLease(key: string, owner: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`,
      1, `lease:${key}`, owner, ttlMs,
    );
    return Number(result) === 1;
  }

  async releaseLease(key: string, owner: string): Promise<boolean> {
    const result = await this.redis.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
      1, `lease:${key}`, owner,
    );
    return Number(result) === 1;
  }

  async health(name: string) {
    const queue = this.queue(name);
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized');
    const oldest = (await queue.getJobs(['waiting', 'delayed', 'prioritized'], 0, 0, true))[0];
    return {
      queue: name,
      counts,
      depth: counts.waiting + counts.active + counts.delayed + counts.prioritized,
      oldestJobAgeMs: oldest?.timestamp ? Math.max(0, Date.now() - oldest.timestamp) : 0,
      checkedAt: new Date().toISOString(),
    };
  }

  async onModuleDestroy() {
    await Promise.all([...this.workers].map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.redis.quit().catch(() => undefined);
  }

  private queue(name: string) {
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(name)) throw new Error('Invalid queue name');
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.redis });
      this.queues.set(name, queue);
    }
    return queue;
  }
}
