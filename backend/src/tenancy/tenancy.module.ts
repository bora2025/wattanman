import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolDomainService } from './school-domain.service';

@Module({
  imports: [DatabaseModule],
  providers: [SchoolDomainService],
  exports: [SchoolDomainService],
})
export class TenancyModule {}
