import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { PlatformAdminsController } from './platform-admins.controller';
import { PlatformAdminsService } from './platform-admins.service';
import { SchoolAddonsController } from './school-addons.controller';
import { SchoolAddonsService } from './school-addons.service';
import { AddonDirectoryController } from './addon-directory.controller';
import { AddonDirectoryService } from './addon-directory.service';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me-in-production-use-a-strong-random-key',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [SchoolsController, PlatformAdminsController, SchoolAddonsController, AddonDirectoryController],
  providers: [SchoolsService, PlatformAdminsService, SchoolAddonsService, AddonDirectoryService],
})
export class PlatformModule {}
