import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { ExtensionsController } from './extensions.controller';
import { ExtensionsService } from './extensions.service';
import { ExtensionAlertService } from './extension-alert.service';

class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = req.headers['x-test-role'];
    if (!role) throw new UnauthorizedException();
    req.user = { userId: 'test-user', role };
    return true;
  }
}

describe('ExtensionsController authorization and upload', () => {
  let app: INestApplication;
  const extensions = {
    list: jest.fn().mockResolvedValue([]),
    uploadPackage: jest.fn().mockResolvedValue({ id: 'version-1', lifecycleStatus: 'VALIDATED' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExtensionsController],
      providers: [
        { provide: ExtensionsService, useValue: extensions },
        { provide: ExtensionAlertService, useValue: { list: jest.fn(), scan: jest.fn(), setStatus: jest.fn() } },
        RolesGuard,
        PlatformScopeGuard,
        JwtAuthGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('rejects unauthenticated callers', () => request(app.getHttpServer()).get('/platform/extensions').expect(401));

  it('rejects authenticated school administrators', () => request(app.getHttpServer()).get('/platform/extensions').set('x-test-role', 'ADMIN').expect(403));

  it('accepts a platform-admin multipart package upload', async () => {
    await request(app.getHttpServer())
      .post('/platform/extensions/versions/version-1/package')
      .set('x-test-role', 'PLATFORM_ADMIN')
      .attach('file', Buffer.from('zip-content'), { filename: 'extension.zip', contentType: 'application/zip' })
      .expect(201)
      .expect(({ body }) => expect(body.lifecycleStatus).toBe('VALIDATED'));

    expect(extensions.uploadPackage).toHaveBeenCalledWith(
      'version-1',
      expect.objectContaining({ originalname: 'extension.zip', buffer: expect.any(Buffer) }),
      expect.objectContaining({ role: 'PLATFORM_ADMIN' }),
    );
  });
});
