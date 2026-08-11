import { NotFoundException } from '@nestjs/common';
import { QueueInfrastructureService } from './queue-infrastructure.service';

const redisUrl = process.env.TEST_REDIS_URL;
const integration = redisUrl ? describe : describe.skip;

async function eventually<T>(operation: () => Promise<T>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try { return await operation(); }
    catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  throw lastError || new Error('Timed out waiting for queue state');
}

integration('dead-letter replay integration', () => {
  const original = process.env;
  const queueName = `rehearsal-${Date.now()}`;

  beforeAll(() => {
    process.env = {
      ...original,
      NODE_ENV: 'test',
      REDIS_URL: redisUrl,
      QUEUE_REPLAY_NAMES: queueName,
      QUEUE_JOB_ATTEMPTS: '1',
      QUEUE_JOB_BACKOFF_MS: '1',
    };
  });
  afterAll(() => { process.env = original; });

  it('recovers a terminal job from dead letter and delivers it', async () => {
    const failing = new QueueInfrastructureService();
    failing.createWorker(queueName, async () => { throw new Error('synthetic provider outage'); });
    const source = await failing.enqueue(queueName, {
      type: 'notification.email',
      tenant: { mode: 'SCOPED', schoolId: 'school-rehearsal' },
      actor: { role: 'SYSTEM' },
      idempotencyKey: `rehearsal-${Date.now()}`,
      payload: { to: 'admin@example.com', subject: 'Test', text: 'Test' },
    });
    const deadLetterJobId = `${source.id}-dead`;
    await eventually(() => failing.deadLetter(queueName, deadLetterJobId));
    await failing.onModuleDestroy();

    const recovering = new QueueInfrastructureService();
    let delivered = false;
    recovering.createWorker(queueName, async () => { delivered = true; return { delivered: true }; });
    await recovering.replayDeadLetter(queueName, deadLetterJobId);
    await eventually(async () => {
      if (!delivered) throw new NotFoundException('Replay not delivered yet');
      return true;
    });
    await expect(recovering.deadLetter(queueName, deadLetterJobId)).rejects.toBeInstanceOf(NotFoundException);
    await recovering.onModuleDestroy();
  }, 20_000);
});
