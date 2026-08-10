import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';

/**
 * Cached set of verified, routed custom domains, refreshed on
 * an interval rather than queried per-request — CORS preflight is latency
 * sensitive, and this is the "cached, not a per-request DB hit" requirement
 * from the conversion plan's Phase 2a-ii. A school's own `*.wattaman.app`
 * subdomain doesn't need this cache at all — it's recognized by shape (see
 * isOwnDomainShape below), no DB lookup required either way.
 */
let customDomainCache = new Set<string>();

async function refreshCustomDomainCache(prisma: PrismaService) {
  try {
    const domains = await prisma.schoolDomain.findMany({
      where: { type: 'CUSTOM', status: 'VERIFIED', routingStatus: 'READY' },
      select: { hostname: true },
    });
    customDomainCache = new Set(domains.map((domain) => domain.hostname.toLowerCase()));
  } catch {
    // Transient DB error — keep serving the last known-good cache rather than
    // rejecting every custom-domain origin until the next refresh.
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['log', 'error', 'warn'],
  });

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 1);
  app.getHttpAdapter().getInstance().set(
    'trust proxy',
    Number.isFinite(trustProxyHops) && trustProxyHops >= 0
      ? trustProxyHops
      : 1,
  );

  // Fallback mapping for well-known Prisma errors (P2025 -> 404, P2002 -> 409)
  // that no controller-level try/catch already handles — see the conversion
  // plan's Phase 4d for how this was found (PrismaService's tenant-scoping
  // middleware throws a real P2025 on a cross-school update/delete miss, same
  // as Prisma does natively for a genuinely-missing id, and nothing was
  // catching it).
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Security headers (X-Frame-Options, X-Content-Type-Options, HSTS, etc.)
  app.use(helmet());

  // Parse cookies (needed for HttpOnly token cookies)
  app.use(cookieParser());

  // Body size limits to prevent DoS via large payloads
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Compress all responses
  app.use(compression());

  // Global input validation — strips unknown properties, rejects invalid data
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // CORS — use env var in production
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:3004'];
  // Root domain that school subdomains live under, e.g. "wattaman.app" so
  // "greenhill.wattaman.app" is recognized without a per-school DB entry —
  // School *existence* is still verified per-request by TenantHostMiddleware,
  // this only needs to know the origin SHAPE is ours (Phase 2a-ii).
  const schoolRootDomain = (process.env.SCHOOL_ROOT_DOMAIN || '').toLowerCase().replace(/^\./, '');

  const prismaForCors = app.get(PrismaService);
  await refreshCustomDomainCache(prismaForCors);
  setInterval(() => refreshCustomDomainCache(prismaForCors), 60_000).unref();

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server, curl)
      if (!origin) return callback(null, true);
      // Allow configured origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow any Railway subdomain
      if (origin.endsWith('.up.railway.app')) return callback(null, true);
      // Allow Vercel deployments
      if (origin.endsWith('.vercel.app')) return callback(null, true);

      let hostname = '';
      try {
        hostname = new URL(origin).hostname.toLowerCase();
      } catch {
        return callback(new Error('Not allowed by CORS'));
      }
      // Our own domain (platform host or any <slug>.wattaman.app school subdomain)
      if (schoolRootDomain && (hostname === schoolRootDomain || hostname.endsWith(`.${schoolRootDomain}`))) {
        return callback(null, true);
      }
      // A school's registered custom domain (e.g. portal.someschool.com)
      if (customDomainCache.has(hostname)) return callback(null, true);

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`API server running on port ${port}`);
}
bootstrap();
