import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  imports: [DatabaseModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
