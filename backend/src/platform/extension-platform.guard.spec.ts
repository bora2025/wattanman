import { NotFoundException } from '@nestjs/common';
import { ExtensionPlatformGuard } from './extension-platform.guard';

describe('ExtensionPlatformGuard', () => {
  const guard = new ExtensionPlatformGuard();
  const previous = process.env.EXTENSION_PLATFORM_ENABLED;

  afterEach(() => {
    if (previous === undefined) delete process.env.EXTENSION_PLATFORM_ENABLED;
    else process.env.EXTENSION_PLATFORM_ENABLED = previous;
  });

  it('keeps versioned extension routes enabled by default', () => {
    delete process.env.EXTENSION_PLATFORM_ENABLED;
    expect(guard.canActivate()).toBe(true);
  });

  it('returns a non-enumerating 404 when rollback disables the new path', () => {
    process.env.EXTENSION_PLATFORM_ENABLED = 'false';
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });
});
