import { randomUUID } from 'crypto';

export const JOB_ENVELOPE_VERSION = 1;

export interface JobTenantScope {
  mode: 'SCOPED' | 'PLATFORM';
  schoolId: string;
}

export interface JobActor {
  id?: string;
  role: string;
  name?: string;
}

export interface JobEnvelope<T = unknown> {
  schemaVersion: typeof JOB_ENVELOPE_VERSION;
  jobId: string;
  type: string;
  tenant: JobTenantScope;
  actor: JobActor;
  traceId: string;
  idempotencyKey: string;
  attempt: number;
  createdAt: string;
  payload: T;
}

export function createJobEnvelope<T>(input: {
  type: string;
  tenant: JobTenantScope;
  actor: JobActor;
  traceId?: string;
  idempotencyKey: string;
  payload: T;
}): JobEnvelope<T> {
  if (!input.type?.trim()) throw new Error('Job type is required');
  if (!input.tenant?.schoolId?.trim()) throw new Error('Job tenant schoolId is required');
  if (!input.actor?.role?.trim()) throw new Error('Job actor role is required');
  if (!input.idempotencyKey?.trim()) throw new Error('Job idempotencyKey is required');
  return {
    schemaVersion: JOB_ENVELOPE_VERSION,
    jobId: randomUUID(),
    type: input.type.trim(),
    tenant: input.tenant,
    actor: input.actor,
    traceId: input.traceId?.trim() || randomUUID(),
    idempotencyKey: input.idempotencyKey.trim(),
    attempt: 0,
    createdAt: new Date().toISOString(),
    payload: input.payload,
  };
}

export function assertJobEnvelope(value: unknown): asserts value is JobEnvelope {
  const envelope = value as Partial<JobEnvelope> | null;
  if (!envelope || envelope.schemaVersion !== JOB_ENVELOPE_VERSION) throw new Error('Unsupported job envelope version');
  if (!envelope.jobId || !envelope.type || !envelope.traceId || !envelope.idempotencyKey || !envelope.createdAt) throw new Error('Invalid job envelope identity');
  if (!envelope.tenant?.schoolId || !['SCOPED', 'PLATFORM'].includes(envelope.tenant.mode)) throw new Error('Invalid job tenant scope');
  if (!envelope.actor?.role) throw new Error('Invalid job actor');
}
