import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import { AppService } from './app.service';
import { Response } from 'express';
import { PrismaService } from './database/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): object {
    return this.getLiveness();
  }

  @Get('live')
  getLiveness(): object {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'SchoolSync API',
      version: process.env.npm_package_version || '1.0.0',
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || process.env.GIT_COMMIT?.slice(0, 7) || 'unknown',
      deployedAt: process.env.RAILWAY_DEPLOYMENT_DRAINING_TIMEOUT_SECONDS
        ? undefined
        : (process.env.RAILWAY_SNAPSHOT_ID || process.env.RAILWAY_DEPLOYMENT_ID || 'local'),
      railwayProjectName: process.env.RAILWAY_PROJECT_NAME || null,
      railwayServiceName: process.env.RAILWAY_SERVICE_NAME || null,
    };
  }

  @Get('ready')
  async getReadiness(): Promise<object> {
    const startedAt = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ready',
      service: 'SchoolSync API',
      dependencies: { database: 'ready' },
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('proxy-image')
  async proxyImage(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      throw new BadRequestException('url query parameter is required');
    }

    // Only allow http/https image URLs
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Only HTTP/HTTPS URLs are allowed');
    }

    // Block private/internal IPs to prevent SSRF
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      throw new BadRequestException('Cannot proxy internal URLs');
    }

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'SchoolSync-ImageProxy/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        res.status(response.status).send('Failed to fetch image');
        return;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        throw new BadRequestException('URL does not point to an image');
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(buffer);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      res.status(502).send('Failed to fetch image');
    }
  }
}
