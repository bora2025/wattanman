import { Module } from '@nestjs/common';
import { RequestTelemetryInterceptor } from './request-telemetry.interceptor';
import { TelemetryMetricsService } from './telemetry-metrics.service';

@Module({ providers: [RequestTelemetryInterceptor, TelemetryMetricsService], exports: [RequestTelemetryInterceptor, TelemetryMetricsService] })
export class TelemetryModule {}
