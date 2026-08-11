import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueInfrastructureService } from './queue-infrastructure.service';
import { ExtensionAlertService } from '../platform/extension-alert.service';
import { ExtensionCleanupService } from '../platform/extension-cleanup.service';
import { ExtensionUpdateService } from '../platform/extension-update.service';

@Injectable()
export class ExtensionWorkerProcessorService implements OnModuleInit {
  constructor(
    private readonly queues: QueueInfrastructureService,
    private readonly cleanup: ExtensionCleanupService,
    private readonly updates: ExtensionUpdateService,
    private readonly alerts: ExtensionAlertService,
  ) {}

  onModuleInit() {
    this.queues.createWorker('extensions', async (envelope) => {
      switch (envelope.type) {
        case 'extension.cleanup': return this.cleanup.run();
        case 'extension.update': return this.updates.run();
        case 'extension.alert.scan': return this.alerts.scan();
        default: throw new Error(`Unsupported extension job type: ${envelope.type}`);
      }
    });
  }
}
