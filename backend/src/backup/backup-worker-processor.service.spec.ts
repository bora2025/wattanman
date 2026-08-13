import { BackupWorkerProcessorService } from './backup-worker-processor.service';

describe('BackupWorkerProcessorService', () => {
  it('runs retention once per distributed daily window on the extension worker', async () => {
    const queues: any = { createWorker: jest.fn() };
    const backups: any = { runRetention: jest.fn().mockResolvedValue({ exportsExpired: 1 }) };
    const schedules: any = { acquire: jest.fn().mockResolvedValue(true) };
    const service = new BackupWorkerProcessorService(queues, backups, schedules);
    process.env.WORKER_ROLE = 'extension';
    await expect(service.retain()).resolves.toEqual({ exportsExpired: 1 });
    expect(schedules.acquire).toHaveBeenCalledWith('backup-data-retention', 24 * 60 * 60_000);
    delete process.env.WORKER_ROLE;
  });
});
