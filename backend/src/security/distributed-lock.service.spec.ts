import { ConflictException } from '@nestjs/common';
import { DistributedLockService } from './distributed-lock.service';

describe('DistributedLockService', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original, NODE_ENV: 'test', REDIS_URL: '' };
  });

  afterAll(() => {
    process.env = original;
  });

  it('serializes the same tenant resource and allows different resources', async () => {
    const locks = new DistributedLockService();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const first = locks.run('school-a:installation:one', async () => waiting);
    await Promise.resolve();

    await expect(locks.run('school-a:installation:one', async () => 'blocked'))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(locks.run('school-a:installation:two', async () => 'parallel'))
      .resolves.toBe('parallel');
    release();
    await first;
  });

  it('releases ownership after a failed command', async () => {
    const locks = new DistributedLockService();
    await expect(locks.run('school-a:installation:one', async () => {
      throw new Error('failed');
    })).rejects.toThrow('failed');
    await expect(locks.run('school-a:installation:one', async () => 'retried'))
      .resolves.toBe('retried');
  });
});
