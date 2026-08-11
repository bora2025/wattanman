import { readFileSync } from 'fs';
import { resolve } from 'path';

const CURSOR_COLLECTIONS = [
  ['GET /auth/users', 'auth/auth.controller.ts', "getUsers(@Query('role') role?: string, @Query('roles') roles?: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string)"],
  ['GET /posts', 'posts/posts.controller.ts', "listAll(@Query('cursor') cursor?: string, @Query('limit') limit?: string)"],
  ['GET /posts/published', 'posts/posts.controller.ts', "listPublished(@Query('cursor') cursor?: string, @Query('limit') limit?: string)"],
  ['GET /audit/logs', 'audit/audit.controller.ts', "@Query('cursor') cursorValue?: string, @Query('limit') limitValue?: string"],
  ['GET /platform/schools', 'platform/schools.controller.ts', "list(@Query('cursor') cursor?: string, @Query('limit') limit?: string"],
  ['GET /platform/school-metrics', 'platform/school-metrics.controller.ts', "@Query('cursor') cursor?: string, @Query('limit') limit?: string"],
  ['GET /platform/admins', 'platform/platform-admins.controller.ts', "list(@Query('cursor') cursor?: string, @Query('limit') limit?: string)"],
  ['GET /platform/extensions', 'platform/extensions.controller.ts', 'list(@Query("cursor") cursor?: string, @Query("limit") limit?: string'],
  ['GET /platform/extensions/publishers', 'platform/extensions.controller.ts', 'publishers(@Query("cursor") cursor?: string, @Query("limit") limit?: string)'],
  ['GET /platform/extensions/catalog-collections', 'platform/extensions.controller.ts', 'catalogCollections(@Query("cursor") cursor?: string, @Query("limit") limit?: string)'],
  ['GET /platform/extensions/publishers/:id/signing-keys', 'platform/extensions.controller.ts', '@Query("cursor") cursor?: string, @Query("limit") limit?: string'],
  ['GET /platform/extensions/alerts', 'platform/extensions.controller.ts', 'alertsList(@Query("cursor") cursor?: string, @Query("limit") limit?: string)'],
  ['GET /platform/extensions/versions/:id/validations', 'platform/extensions.controller.ts', 'validations(@Param("versionId") versionId: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string)'],
  ['GET /platform/extensions/versions/:id/reviews', 'platform/extensions.controller.ts', 'reviewHistory(@Param("versionId") versionId: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string)'],
  ['GET /platform/extension-installations', 'platform/extension-installations.controller.ts', 'list(@Query("schoolId") schoolId?: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string)'],
  ['GET /extensions/directory', 'platform/extension-installations.controller.ts', 'directory( @Query("cursor") cursor?: string, @Query("limit") limit?: string'],
  ['GET /extensions/installations', 'platform/extension-installations.controller.ts', 'list(@Query("cursor") cursor?: string, @Query("limit") limit?: string)'],
  ['GET /extensions/:key/resources/:resource', 'platform/extension-runtime.controller.ts', "@Query('cursor') cursor?: string, @Query('limit') limit?: string"],
] as const;

describe('growing collection pagination registry', () => {
  it('requires every registered collection handler to expose cursor and limit', () => {
    expect(new Set(CURSOR_COLLECTIONS.map(([route]) => route)).size).toBe(CURSOR_COLLECTIONS.length);
    for (const [route, controller, signature] of CURSOR_COLLECTIONS) {
      const source = readFileSync(resolve(process.cwd(), 'src', controller), 'utf8').replace(/\s+/g, ' ');
      expect({ route, present: source.includes(signature.replace(/\s+/g, ' ')) }).toEqual({ route, present: true });
      expect(signature).toContain('cursor');
      expect(signature).toContain('limit');
    }
  });

  it('keeps the shared page boundary at 100 records', () => {
    const source = readFileSync(resolve(process.cwd(), 'src', 'common', 'cursor-pagination.ts'), 'utf8');
    expect(source).toContain('maxLimit = 100');
    expect(source).toContain('rows.length > limit');
  });
});
