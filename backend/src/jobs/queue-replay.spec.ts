import { BadRequestException, ConflictException } from '@nestjs/common';
import { createJobEnvelope } from './job-envelope';
import { QueueInfrastructureService } from './queue-infrastructure.service';

describe('dead-letter replay controls', () => {
  const envelope = createJobEnvelope({
    type: 'notification.email',
    tenant: { mode: 'SCOPED', schoolId: 'school-1' },
    actor: { role: 'SYSTEM' },
    traceId: 'trace-1',
    idempotencyKey: 'email-1',
    payload: { to: 'admin@example.com' },
  });

  function fixture() {
    const sourceJob = { getState: jest.fn().mockResolvedValue('failed'), remove: jest.fn().mockResolvedValue(undefined) };
    const deadJob = {
      id: 'source-1-dead', name: envelope.type, timestamp: Date.now(),
      data: { envelope, sourceQueue: 'notifications', sourceJobId: 'source-1' },
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const target = { getJob: jest.fn().mockResolvedValue(sourceJob), add: jest.fn().mockResolvedValue({ id: 'source-1' }) };
    const dead = { getJob: jest.fn().mockResolvedValue(deadJob) };
    const service = Object.create(QueueInfrastructureService.prototype) as QueueInfrastructureService;
    (service as any).queue = jest.fn((name: string) => name === 'notifications.dead-letter' ? dead : target);
    service.acquireLease = jest.fn().mockResolvedValue(true);
    service.releaseLease = jest.fn().mockResolvedValue(true);
    return { service, sourceJob, deadJob, target };
  }

  it('removes the terminal source, requeues the original envelope, then removes dead letter', async () => {
    const { service, sourceJob, deadJob, target } = fixture();

    await expect(service.replayDeadLetter('notifications', 'source-1-dead')).resolves.toEqual(expect.objectContaining({ replayed: true, jobId: 'source-1' }));

    expect(sourceJob.remove).toHaveBeenCalledTimes(1);
    expect(target.add).toHaveBeenCalledWith(envelope.type, envelope, expect.objectContaining({ jobId: 'source-1', attempts: 8 }));
    expect(deadJob.remove).toHaveBeenCalledTimes(1);
  });

  it('rejects concurrent replay and non-approved queues', async () => {
    const { service } = fixture();
    (service.acquireLease as jest.Mock).mockResolvedValue(false);
    await expect(service.replayDeadLetter('notifications', 'source-1-dead')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.replayDeadLetter('arbitrary', 'source-1-dead')).rejects.toBeInstanceOf(BadRequestException);
  });
});
