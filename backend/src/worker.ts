import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'http';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn', 'log'] });
  const startedAt = new Date().toISOString();
  let ready = false;
  const port = Number(process.env.WORKER_HEALTH_PORT || 3002);
  const healthServer = createServer((request, response) => {
    if (!['/health', '/live', '/ready'].includes(request.url || '')) {
      response.writeHead(404).end('Not found');
      return;
    }
    const readinessProbe = request.url === '/ready';
    response.writeHead(readinessProbe && !ready ? 503 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      status: readinessProbe ? (ready ? 'ready' : 'starting') : 'ok',
      service: 'Wattaman Worker',
      startedAt,
      timestamp: new Date().toISOString(),
    }));
  });
  ready = true;
  await new Promise<void>((resolve, reject) => {
    healthServer.once('error', reject);
    healthServer.listen(port, '0.0.0.0', resolve);
  });
  logger.log(`Worker started; health endpoint listening on ${port}`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    ready = false;
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
