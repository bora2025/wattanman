import { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'http';
import { tenantContext } from './tenancy/tenant-context';
import { JsonLogger } from './telemetry/json-logger';

export async function bootstrapWorker(module: Type<unknown>, options: { role: string; service: string; defaultPort: number }) {
  process.env.WORKER_ROLE = options.role;
  tenantContext.enterWith({ schoolId: 'PLATFORM', mode: 'unscoped' });
  const logger = new JsonLogger();
  const app = await NestFactory.createApplicationContext(module, { logger });
  const startedAt = new Date().toISOString();
  let ready = true;
  const port = Number(process.env.PORT || process.env.WORKER_HEALTH_PORT || options.defaultPort);
  const server = createServer((request, response) => {
    if (!['/health', '/live', '/ready'].includes(request.url || '')) return void response.writeHead(404).end('Not found');
    const readiness = request.url === '/ready';
    response.writeHead(readiness && !ready ? 503 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: readiness ? (ready ? 'ready' : 'stopping') : 'ok', service: options.service, role: options.role, startedAt, timestamp: new Date().toISOString() }));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  logger.log({ event: 'service_ready', port, role: options.role }, `${options.service}Bootstrap`);
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true; ready = false; logger.log({ event: 'service_stopping', signal }, `${options.service}Bootstrap`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}
