import { NotificationWorkerModule } from './notification-worker.module';
import { bootstrapWorker } from './worker-bootstrap';

bootstrapWorker(NotificationWorkerModule, { role: 'notification', service: 'Wattaman Notification Worker', defaultPort: 3004 }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
