import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';
import { SchoolDeletionService } from './school-deletion.service';

@Injectable()
export class SchoolDeletionWorkerService implements OnModuleInit {
  constructor(private readonly queues: QueueInfrastructureService, private readonly deletions: SchoolDeletionService) {}

  onModuleInit() {
    if (process.env.WORKER_ROLE !== 'extension') return;
    this.queues.createWorker('school-deletions', async (envelope) => {
      if (envelope.type !== 'school.delete.execute') throw new Error(`Unsupported school deletion job type: ${envelope.type}`);
      return this.deletions.executeQueued((envelope.payload as { requestId: string }).requestId, envelope.attempt);
    });
  }
}
