import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueInfrastructureService } from './queue-infrastructure.service';
import { ExtensionAlertService } from '../platform/extension-alert.service';
import { ExtensionCleanupService } from '../platform/extension-cleanup.service';
import { ExtensionUpdateService } from '../platform/extension-update.service';
import { ExtensionsService } from '../platform/extensions.service';

@Injectable()
export class ExtensionWorkerProcessorService implements OnModuleInit {
  constructor(
    private readonly queues: QueueInfrastructureService,
    private readonly cleanup: ExtensionCleanupService,
    private readonly updates: ExtensionUpdateService,
    private readonly alerts: ExtensionAlertService,
    private readonly extensions: ExtensionsService,
  ) {}

  onModuleInit() {
    this.queues.createWorker('extensions', async (envelope) => {
      switch (envelope.type) {
        case 'extension.package.complete':
          return this.extensions.completePackageUpload(
            envelope.payload as { versionId: string; checksum: string; validationId: string },
            { userId: envelope.actor.id, role: envelope.actor.role, name: envelope.actor.name },
          );
        case 'extension.cleanup': return this.cleanup.run();
        case 'extension.update': return this.updates.run();
        case 'extension.alert.scan': return this.alerts.scan();
        default: throw new Error(`Unsupported extension job type: ${envelope.type}`);
      }
    });
  }
}
