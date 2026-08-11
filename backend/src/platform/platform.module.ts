import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { SchoolMetricsModule } from '../school-metrics/school-metrics.module';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { PlatformAdminsController } from './platform-admins.controller';
import { PlatformAdminsService } from './platform-admins.service';
import { SchoolMetricsController } from './school-metrics.controller';
import { RailwayDomainService } from './railway-domain.service';
import { ExtensionsController } from './extensions.controller';
import { ExtensionsService } from './extensions.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { ExtensionPackageValidatorService } from './extension-package-validator.service';
import { ExtensionInstallationsService } from './extension-installations.service';
import { PlatformExtensionInstallationsController, SchoolExtensionsController } from './extension-installations.controller';
import { ExtensionCleanupService } from './extension-cleanup.service';
import { ExtensionRuntimeController } from './extension-runtime.controller';
import { ExtensionRuntimeService } from './extension-runtime.service';
import { ExtensionSigningService } from './extension-signing.service';
import { ExtensionUpdateService } from './extension-update.service';
import { ExtensionAlertService } from './extension-alert.service';
import { ExtensionApiMetricsService } from './extension-api-metrics.service';
import { ExtensionApiMetricsInterceptor } from './extension-api-metrics.interceptor';
import { ExtensionPlatformGuard } from './extension-platform.guard';
import { ExtensionValidationRunnerService } from './extension-validation-runner.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { JobsModule } from '../jobs/jobs.module';
import { QueueOperationsController } from './queue-operations.controller';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    SchoolMetricsModule,
    TenancyModule,
    AuthModule,
    SecurityModule,
    JobsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me-in-production-use-a-strong-random-key',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [SchoolsController, PlatformAdminsController, SchoolMetricsController, ExtensionsController, PlatformExtensionInstallationsController, SchoolExtensionsController, ExtensionRuntimeController, QueueOperationsController],
  providers: [SchoolsService, PlatformAdminsService, RailwayDomainService, ExtensionsService, R2StorageService, ExtensionPackageValidatorService, ExtensionValidationRunnerService, ExtensionInstallationsService, ExtensionCleanupService, ExtensionRuntimeService, ExtensionSigningService, ExtensionUpdateService, ExtensionAlertService, ExtensionApiMetricsService, ExtensionPlatformGuard, { provide: APP_INTERCEPTOR, useClass: ExtensionApiMetricsInterceptor }],
  exports: [ExtensionsService, ExtensionCleanupService, ExtensionUpdateService, ExtensionAlertService],
})
export class PlatformModule {}
