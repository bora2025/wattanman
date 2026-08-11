import { Module } from '@nestjs/common';
import { QueueHealthMonitorService } from './queue-health-monitor.service';
import { QueueInfrastructureService } from './queue-infrastructure.service';

@Module({
  providers: [QueueInfrastructureService, QueueHealthMonitorService],
  exports: [QueueInfrastructureService, QueueHealthMonitorService],
})
export class JobsModule {}
