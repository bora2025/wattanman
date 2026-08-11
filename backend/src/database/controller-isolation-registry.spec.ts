import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const CLASSIFIED_CONTROLLERS = [
  'app.controller.ts',
  'audit/audit.controller.ts',
  'auth/auth.controller.ts',
  'backup/backup.controller.ts',
  'platform/extension-installations.controller.ts',
  'platform/extension-runtime.controller.ts',
  'platform/extensions.controller.ts',
  'platform/platform-admins.controller.ts',
  'platform/queue-operations.controller.ts',
  'platform/school-metrics.controller.ts',
  'platform/schools.controller.ts',
  'posts/posts.controller.ts',
  'site-settings/site-settings.controller.ts',
].sort();

function controllers(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return controllers(path);
    return entry.endsWith('.controller.ts') ? [relative(join(process.cwd(), 'src'), path).replace(/\\/g, '/')] : [];
  });
}

describe('controller tenant-isolation registry', () => {
  it('requires every retained controller to be explicitly classified', () => {
    expect(controllers(join(process.cwd(), 'src')).sort()).toEqual(CLASSIFIED_CONTROLLERS);
  });

  it('keeps platform controllers behind platform scope and tenant controllers in E2E coverage', () => {
    for (const controller of CLASSIFIED_CONTROLLERS.filter((path) => path.startsWith('platform/') && path !== 'platform/extension-runtime.controller.ts')) {
      const source = require('fs').readFileSync(join(process.cwd(), 'src', controller), 'utf8');
      expect(source).toContain('PlatformScopeGuard');
    }
    const e2e = require('fs').readFileSync(join(process.cwd(), 'test', 'tenant-isolation.e2e-spec.ts'), 'utf8');
    for (const route of ['/audit/logs', '/auth/users', '/backup/export', '/posts', '/site-settings', '/extensions/installations', '/extensions/${extensionKey}/resources/rewards']) {
      expect(e2e).toContain(route);
    }
  });
});
