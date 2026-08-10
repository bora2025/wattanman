import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenantHostMiddleware } from './tenancy/tenant-host.middleware';
import { DatabaseModule } from './database/database.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BackupModule } from './backup/backup.module';
import { AuditModule } from './audit/audit.module';
import { SiteSettingsModule } from './site-settings/site-settings.module';
import { PostsModule } from './posts/posts.module';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [
    // Rate limiting: max 300 requests per 60 seconds per IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    ScheduleModule.forRoot(),
    // Needed directly here (not just transitively via feature modules) so
    // TenantHostMiddleware — registered as a provider below — can inject
    // PrismaService; Nest's DI doesn't resolve middleware dependencies through
    // other modules' imports the way it does for controllers/services.
    DatabaseModule,
    AuditModule,
    AuthModule,
    BackupModule,
    SiteSettingsModule,
    PostsModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantHostMiddleware,
    // Apply rate limiting globally to all endpoints
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  // Resolves the tenant (School) from the request Host before anything else runs —
  // including pre-auth routes like /auth/login. See tenancy/tenant-host.middleware.ts.
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantHostMiddleware)
      .exclude({ path: 'health', method: RequestMethod.GET })
      .forRoutes('*');
  }
}
