import { Module } from '@nestjs/common';
import { RequestTelemetryInterceptor } from './request-telemetry.interceptor';

@Module({ providers: [RequestTelemetryInterceptor], exports: [RequestTelemetryInterceptor] })
export class TelemetryModule {}
