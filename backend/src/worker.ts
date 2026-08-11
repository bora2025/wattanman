import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'http';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn', 'log'] });
  const startedAt = new Date().toISOString();
  const port = Number(process.env.WORKER_HEALTH_PORT || 3002);
  const healthServer = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'Wattaman Worker', startedAt, timestamp: new Date().toISOString() }));
  });
  await new Promise<void>((resolve, reject) => {
    healthServer.once('error', reject);
    healthServer.listen(port, '0.0.0.0', resolve);
  });
  logger.log(`Worker started; health endpoint listening on ${port}`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.log(`Received ${signal}; stopping worker gracefully.`);
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
    await app.close();
    process.exitCode = 0;
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
