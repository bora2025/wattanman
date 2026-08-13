import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { JobsModule } from '../jobs/jobs.module';
import { AuditModule } from '../audit/audit.module';
import { R2StorageService } from '../storage/r2-storage.service';
import { BackupWorkerProcessorService } from './backup-worker-processor.service';

@Module({
  imports: [DatabaseModule, JobsModule, AuditModule],
  controllers: [BackupController],
  providers: [BackupService, R2StorageService, BackupWorkerProcessorService],
  exports: [BackupService, R2StorageService],
})
export class BackupModule {}
