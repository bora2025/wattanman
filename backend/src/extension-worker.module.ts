import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsModule } from './jobs/jobs.module';
import { ExtensionWorkerProcessorService } from './jobs/extension-worker-processor.service';
import { PlatformModule } from './platform/platform.module';
import { BackupModule } from './backup/backup.module';

@Module({
  imports: [ScheduleModule.forRoot(), PlatformModule, JobsModule, BackupModule],
  providers: [ExtensionWorkerProcessorService],
})
export class ExtensionWorkerModule {}
