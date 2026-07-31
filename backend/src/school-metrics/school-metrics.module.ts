import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolMetricsService } from './school-metrics.service';

@Module({
  imports: [DatabaseModule],
  providers: [SchoolMetricsService],
  exports: [SchoolMetricsService],
})
export class SchoolMetricsModule {}
