import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationWorkerProcessorService } from './jobs/notification-worker-processor.service';

@Module({
  imports: [AuthModule, JobsModule],
  providers: [NotificationWorkerProcessorService],
})
export class NotificationWorkerModule {}
