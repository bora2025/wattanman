import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [ScheduleModule.forRoot(), PlatformModule],
})
export class WorkerModule {}
