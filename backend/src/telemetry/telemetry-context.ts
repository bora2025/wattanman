import { AsyncLocalStorage } from 'async_hooks';

export interface TelemetryContext {
  requestId: string;
  traceId: string;
  jobId?: string;
  schoolId?: string;
  userId?: string;
  extensionId?: string;
  versionId?: string;
  installationId?: string;
  releaseId?: string;
}

const storage = new AsyncLocalStorage<TelemetryContext>();

export const telemetryContext = {
  run<T>(context: TelemetryContext, callback: () => T): T {
    return storage.run(context, callback);
  },
  current(): TelemetryContext | undefined {
    return storage.getStore();
  },
};
