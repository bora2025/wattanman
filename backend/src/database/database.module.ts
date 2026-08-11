import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDatabaseInterceptor } from './tenant-database.interceptor';

@Module({
  providers: [PrismaService, TenantDatabaseInterceptor],
  exports: [PrismaService, TenantDatabaseInterceptor],
})
export class DatabaseModule {}
