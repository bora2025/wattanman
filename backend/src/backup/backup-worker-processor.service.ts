import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';
import { BackupService } from './backup.service';
import { Cron } from '@nestjs/schedule';
import { ScheduledTaskGuardService } from '../security/scheduled-task-guard.service';

@Injectable()
export class BackupWorkerProcessorService implements OnModuleInit {
  constructor(private readonly queues: QueueInfrastructureService, private readonly backups: BackupService, private readonly schedules: ScheduledTaskGuardService) {}

  onModuleInit() {
    if (process.env.WORKER_ROLE !== 'extension') return;
    this.queues.createWorker('operations', async (envelope) => {
      if (envelope.type === 'backup.export') return this.backups.executeExport((envelope.payload as { exportId: string }).exportId, envelope.attempt);
      if (envelope.type === 'backup.restore.verify') return this.backups.verifyRestore((envelope.payload as { restoreId: string }).restoreId, envelope.attempt);
      if (envelope.type === 'backup.restore.execute') {
        const payload = envelope.payload as { restoreId: string; changeTicket: string };
        return this.backups.executeRestore(payload.restoreId, envelope.attempt, payload.changeTicket);
      }
      throw new Error(`Unsupported operations job type: ${envelope.type}`);
    });
  }

  @Cron('30 2 * * *')
  async retain() {
    if (process.env.WORKER_ROLE !== 'extension') return;
    if (!(await this.schedules.acquire('backup-data-retention', 24 * 60 * 60_000))) return;
    return this.backups.runRetention();
  }
}
