import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { PortalManagerController } from './portal-manager.controller';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [PortalManagerController],
})
export class PortalManagerModule {}
