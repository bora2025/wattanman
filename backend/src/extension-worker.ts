import './telemetry/instrumentation';
import { ExtensionWorkerModule } from './extension-worker.module';
import { bootstrapWorker } from './worker-bootstrap';

bootstrapWorker(ExtensionWorkerModule, { role: 'extension', service: 'Wattaman Extension Worker', defaultPort: 3003 }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
