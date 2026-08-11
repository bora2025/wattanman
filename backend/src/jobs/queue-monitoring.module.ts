import { Module } from '@nestjs/common';
import { JobsModule } from './jobs.module';
import { QueueHealthMonitorService } from './queue-health-monitor.service';

@Module({ imports: [JobsModule], providers: [QueueHealthMonitorService], exports: [QueueHealthMonitorService] })
export class QueueMonitoringModule {}
