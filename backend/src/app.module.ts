import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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

@Module({
  imports: [
    // Rate limiting: max 60 requests per 60 seconds per IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply rate limiting globally to all endpoints
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}