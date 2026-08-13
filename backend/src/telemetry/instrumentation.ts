import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_NAMESPACE, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | undefined;

export function startTelemetry() {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true') return sdk;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() || process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return undefined;
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || process.env.RAILWAY_SERVICE_NAME || process.env.SERVICE_NAME || 'wattaman-api',
      [ATTR_SERVICE_NAMESPACE]: 'wattaman',
      [ATTR_SERVICE_VERSION]: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.npm_package_version || 'unknown',
      'deployment.environment.name': process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
      'service.instance.id': process.env.RAILWAY_REPLICA_ID || process.pid.toString(),
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request) => ['/health', '/live', '/ready'].includes((request.url || '').split('?')[0]),
      },
    })],
  });
  sdk.start();
  return sdk;
}

export async function stopTelemetry() {
  if (!sdk) return;
  const current = sdk;
  sdk = undefined;
  await current.shutdown();
}

startTelemetry();
