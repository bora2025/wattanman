import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { tenantContext } from '../tenancy/tenant-context';
import { assertJobEnvelope, createJobEnvelope, JobEnvelope, JobTenantScope, JobActor } from './job-envelope';
import { assertProductionRedisUrl } from '../security/redis-url';
import { telemetryContext } from '../telemetry/telemetry-context';
import { context as otelContext, propagation, SpanStatusCode, trace } from '@opentelemetry/api';

const DEFAULT_ATTEMPTS = 8;
const DEFAULT_BACKOFF_MS = 1_000;
const DEFAULT_LOCK_MS = 30_000;

function jobAttempts() {
  const value = Number(process.env.QUEUE_JOB_ATTEMPTS || DEFAULT_ATTEMPTS);
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('QUEUE_JOB_ATTEMPTS must be an integer from 1 to 100');
  return value;
}

function jobBackoffMs() {
  const value = Number(process.env.QUEUE_JOB_BACKOFF_MS || DEFAULT_BACKOFF_MS);
  if (!Number.isInteger(value) || value < 1 || value > 60 * 60_000) throw new Error('QUEUE_JOB_BACKOFF_MS must be an integer from 1 to 3600000');
  return value;
}

@Injectable()
export class QueueInfrastructureService implements OnModuleDestroy {
  private readonly redis: IORedis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Set<Worker>();
  private readonly workerConnections = new Set<IORedis>();

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
    const activeSpan = trace.getSpan(otelContext.active())?.spanContext();
    const carrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), carrier);
    const envelope = createJobEnvelope({
      ...input,
      traceId: input.traceId || activeSpan?.traceId || telemetryContext.current()?.traceId,
      traceparent: carrier.traceparent,
    });
    const jobId = createHash('sha256').update(`${queueName}:${input.idempotencyKey}`).digest('hex');
    return this.queue(queueName).add(envelope.type, envelope, {
      jobId,
      attempts: jobAttempts(),
      backoff: { type: 'exponential', delay: jobBackoffMs(), jitter: 0.5 },
      removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
      removeOnFail: false,
    });
  }

  createWorker(queueName: string, handler: (envelope: JobEnvelope) => Promise<unknown>) {
    const connection = this.redis.duplicate({ lazyConnect: true });
    const worker = new Worker(queueName, async (job: Job) => {
      assertJobEnvelope(job.data);
      const envelope = { ...job.data, attempt: job.attemptsMade + 1 } as JobEnvelope;
      const scope = { schoolId: envelope.tenant.schoolId, mode: envelope.tenant.mode === 'PLATFORM' ? 'unscoped' as const : 'scoped' as const };
      const parent = envelope.traceparent
        ? propagation.extract(otelContext.active(), { traceparent: envelope.traceparent })
        : otelContext.active();
      return trace.getTracer('wattaman-jobs').startActiveSpan(`job ${envelope.type}`, {
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.destination.name': queueName,
          'messaging.operation.name': 'process',
          'wattaman.job.id': envelope.jobId,
          'wattaman.school.id': envelope.tenant.schoolId,
          'wattaman.job.attempt': envelope.attempt,
        },
      }, parent, async (span) => {
        try {
          return await tenantContext.run(scope, () => telemetryContext.run({
            requestId: envelope.jobId,
            traceId: span.spanContext().traceId || envelope.traceId,
            jobId: envelope.jobId,
            schoolId: envelope.tenant.schoolId,
            userId: envelope.actor.id,
          }, () => handler(envelope)));
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
          throw error;
        } finally {
          span.end();
        }
      });
    }, {
      connection,
      concurrency: Number(process.env.QUEUE_WORKER_CONCURRENCY || 5),
      lockDuration: Number(process.env.QUEUE_JOB_LOCK_MS || DEFAULT_LOCK_MS),
      stalledInterval: Number(process.env.QUEUE_STALLED_INTERVAL_MS || 15_000),
      maxStalledCount: 2,
    });
    worker.on('failed', async (job, error) => {
      if (!job || job.attemptsMade < (job.opts.attempts || jobAttempts())) return;
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
    this.workerConnections.add(connection);
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

  async deadLetter(queueName: string, deadLetterJobId: string) {
    this.assertReplayQueue(queueName);
    if (!deadLetterJobId || deadLetterJobId.length > 200) throw new BadRequestException('Invalid dead-letter job ID');
    const job = await this.queue(`${queueName}.dead-letter`).getJob(deadLetterJobId);
    if (!job) throw new NotFoundException('Dead-letter job not found');
    return {
      id: job.id,
      name: job.name,
      timestamp: job.timestamp,
      data: job.data,
    };
  }

  async replayDeadLetter(queueName: string, deadLetterJobId: string) {
    this.assertReplayQueue(queueName);
    if (!deadLetterJobId || deadLetterJobId.length > 200) throw new BadRequestException('Invalid dead-letter job ID');
    const owner = randomUUID();
    const leaseKey = `dead-letter-replay:${queueName}:${deadLetterJobId}`;
    if (!(await this.acquireLease(leaseKey, owner, 30_000))) throw new ConflictException('Dead-letter replay is already in progress');
    try {
      const deadQueue = this.queue(`${queueName}.dead-letter`);
      const deadJob = await deadQueue.getJob(deadLetterJobId);
      if (!deadJob) throw new NotFoundException('Dead-letter job not found');
      const data = deadJob.data as { envelope?: JobEnvelope; sourceQueue?: string; sourceJobId?: string };
      if (data.sourceQueue !== queueName || !data.sourceJobId || !data.envelope) throw new BadRequestException('Dead-letter payload is invalid');
      assertJobEnvelope(data.envelope);
      const target = this.queue(queueName);
      const sourceJob = await target.getJob(data.sourceJobId);
      if (sourceJob) {
        const state = await sourceJob.getState();
        if (state !== 'failed') throw new ConflictException(`Source job cannot be replayed from state ${state}`);
        await sourceJob.remove();
      }
      const replayed = await target.add(data.envelope.type, data.envelope, {
        jobId: data.sourceJobId,
        attempts: jobAttempts(),
        backoff: { type: 'exponential', delay: jobBackoffMs(), jitter: 0.5 },
        removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
        removeOnFail: false,
      });
      await deadJob.remove();
      return { replayed: true, queue: queueName, jobId: replayed.id, deadLetterJobId };
    } finally {
      await this.releaseLease(leaseKey, owner).catch(() => false);
    }
  }

  async onModuleDestroy() {
    await Promise.all([...this.workers].map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await Promise.all([...this.workerConnections].map((connection) => connection.quit().catch(() => undefined)));
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

  private assertReplayQueue(name: string) {
    const allowed = new Set((process.env.QUEUE_REPLAY_NAMES || 'extensions,operations,notifications').split(',').map((item) => item.trim()).filter(Boolean));
    if (!allowed.has(name)) throw new BadRequestException('Queue is not approved for operator replay');
  }
}
