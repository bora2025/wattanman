import { Module } from '@nestjs/common';
import { QueueInfrastructureService } from './queue-infrastructure.service';

@Module({
  providers: [QueueInfrastructureService],
  exports: [QueueInfrastructureService],
})
export class JobsModule {}
