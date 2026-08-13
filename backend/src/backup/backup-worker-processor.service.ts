import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';
import { BackupService } from './backup.service';

@Injectable()
export class BackupWorkerProcessorService implements OnModuleInit {
  constructor(private readonly queues: QueueInfrastructureService, private readonly backups: BackupService) {}

  onModuleInit() {
    if (process.env.WORKER_ROLE !== 'extension') return;
    this.queues.createWorker('operations', async (envelope) => {
      if (envelope.type !== 'backup.export') throw new Error(`Unsupported operations job type: ${envelope.type}`);
      return this.backups.executeExport((envelope.payload as { exportId: string }).exportId, envelope.attempt);
    });
  }
}
