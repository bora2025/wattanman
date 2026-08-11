import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsModule } from './jobs/jobs.module';
import { ExtensionWorkerProcessorService } from './jobs/extension-worker-processor.service';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [ScheduleModule.forRoot(), PlatformModule, JobsModule],
  providers: [ExtensionWorkerProcessorService],
})
export class ExtensionWorkerModule {}
