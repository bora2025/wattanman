import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenantHostMiddleware } from './tenancy/tenant-host.middleware';
import { DatabaseModule } from './database/database.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RequiresAddonGuard } from './school-addons/requires-addon.guard';
import { ModuleRegistrySeedService } from './module-registry/module-registry-seed.service';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AttendanceModule } from './attendance/attendance.module';
import { NotificationModule } from './notification/notification.module';
import { ReportsModule } from './reports/reports.module';
import { ClassesModule } from './classes/classes.module';
import { SessionConfigModule } from './session-config/session-config.module';
import { HolidaysModule } from './holidays/holidays.module';
import { DepartmentsModule } from './departments/departments.module';
import { StudyYearsModule } from './study-years/study-years.module';
import { CardTemplatesModule } from './card-templates/card-templates.module';
import { TimetableModule } from './timetable/timetable.module';
import { ScoringModule } from './scoring/scoring.module';
import { FeesModule } from './fees/fees.module';
import { SalaryModule } from './salary/salary.module';
import { BusModule } from './bus/bus.module';
import { ExamModule } from './exam/exam.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { CoursesModule } from './courses/courses.module';
import { ParentModule } from './parent/parent.module';
import { BackupModule } from './backup/backup.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationPreferenceModule } from './notification-preference/notification-preference.module';
import { AuditModule } from './audit/audit.module';
import { CardAliasesModule } from './card-aliases/card-aliases.module';
import { SiteSettingsModule } from './site-settings/site-settings.module';
import { PostsModule } from './posts/posts.module';
import { ClassRegistrationsModule } from './class-registrations/class-registrations.module';
import { StaffCvModule } from './staff-cv/staff-cv.module';
import { PlatformModule } from './platform/platform.module';
import { SchoolAddonsModule } from './school-addons/school-addons.module';
import { PortalManagerModule } from './portal-manager/portal-manager.module';
import { AddonPackagesModule } from './addon-packages/addon-packages.module';

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
    AttendanceModule,
    NotificationModule,
    ReportsModule,
    ClassesModule,
    SessionConfigModule,
    HolidaysModule,
    DepartmentsModule,
    StudyYearsModule,
    CardTemplatesModule,
    TimetableModule,
    ScoringModule,
    FeesModule,
    SalaryModule,
    BusModule,
    ExamModule,
    AssignmentsModule,
    CoursesModule,
    ParentModule,
    BackupModule,
    AnnouncementsModule,
    NotificationPreferenceModule,
    CardAliasesModule,
    SiteSettingsModule,
    PostsModule,
    ClassRegistrationsModule,
    StaffCvModule,
    PlatformModule,
    SchoolAddonsModule,
    PortalManagerModule,
    AddonPackagesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantHostMiddleware,
    // Apply rate limiting globally to all endpoints
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Phase 22 — global so a newly-gated controller only ever needs
    // @RequiresAddon('KEY') added, not a hand-typed guard list too. A
    // no-op on any route without that decorator (RequiresAddonGuard
    // returns true immediately when no metadata is present).
    { provide: APP_GUARD, useClass: RequiresAddonGuard },
    // Phase 24 — self-seeds MODULE_REGISTRY's catalog rows on every boot,
    // replacing the old standalone seed-module-registry.ts script.
    ModuleRegistrySeedService,
  ],
})
export class AppModule implements NestModule {
  // Resolves the tenant (School) from the request Host before anything else runs —
  // including pre-auth routes like /auth/login. See tenancy/tenant-host.middleware.ts.
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantHostMiddleware).forRoutes('*');
  }
}
