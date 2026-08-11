import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module';
import { SchoolMetricsModule } from './school-metrics/school-metrics.module';
import { QueueMonitoringModule } from './jobs/queue-monitoring.module';

@Module({
  imports: [ScheduleModule.forRoot(), AuditModule, SchoolMetricsModule, QueueMonitoringModule],
})
export class WorkerModule {}
