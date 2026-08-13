import { assertJobEnvelope, createJobEnvelope, JOB_ENVELOPE_VERSION } from './job-envelope';

describe('job envelope', () => {
  it('creates a versioned tenant and trace-aware envelope', () => {
    const envelope = createJobEnvelope({
      type: 'extension.validate',
      tenant: { mode: 'SCOPED', schoolId: 'school-a' },
      actor: { id: 'admin-a', role: 'ADMIN' },
      traceId: 'trace-1',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      idempotencyKey: 'version-1',
      payload: { versionId: 'version-1' },
    });
    expect(envelope).toEqual(expect.objectContaining({
      schemaVersion: JOB_ENVELOPE_VERSION,
      type: 'extension.validate',
      traceId: 'trace-1',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      idempotencyKey: 'version-1',
      attempt: 0,
    }));
    expect(() => assertJobEnvelope(envelope)).not.toThrow();
  });

  it('rejects unsupported or tenant-less jobs', () => {
    expect(() => assertJobEnvelope({ schemaVersion: 2 })).toThrow('Unsupported');
    expect(() => createJobEnvelope({
      type: 'backup.create',
      tenant: { mode: 'SCOPED', schoolId: '' },
      actor: { role: 'ADMIN' },
      idempotencyKey: 'backup-1',
      payload: {},
    })).toThrow('schoolId');
  });
});
