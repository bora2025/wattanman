import './telemetry/instrumentation';
import { WorkerModule } from './worker.module';
import { bootstrapWorker } from './worker-bootstrap';

bootstrapWorker(WorkerModule, { role: 'operations', service: 'Wattaman Operations Worker', defaultPort: 3002 }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
