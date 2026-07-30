import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { tenantContext } from '../tenancy/tenant-context';
import { TENANT_SCOPED_MODELS } from '../tenancy/scoped-models';

function toDelegateName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

/**
 * update/delete/upsert's `where` is Prisma's WhereUniqueInput — either a flat
 * scalar (`{ id }`) or one level of compound-unique nesting (`{ schoolId_addonKey:
 * { schoolId, addonKey } }`). findFirst's WhereInput has no idea what a
 * synthetic compound-key field name means, so passing a compound `where`
 * straight through to the ownership-check findFirst below throws
 * "Unknown argument". Flatten one level so the check runs on the real
 * columns instead. Safe specifically because WhereUniqueInput (unlike a
 * general filter) can never contain a relation filter at this position, so
 * "nested plain object → flatten it" has no other case to collide with.
 */
function flattenUniqueWhere(where: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flat, value as Record<string, unknown>);
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Only log errors and slow queries (saves CPU on verbose logging)
      log: process.env.NODE_ENV === 'production'
        ? [{ level: 'error', emit: 'stdout' }]
        : [
            { level: 'error', emit: 'stdout' },
            { level: 'warn', emit: 'stdout' },
          ],
    });

    this.registerTenantScopingMiddleware();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Tenant-isolation guardrail — see the multi-tenant conversion plan's Phase 2c.
   *
   * Deliberately uses Prisma's client middleware (`$use`) rather than the newer
   * `$extends` Client Extensions API. `$extends` returns a *new*, differently-typed
   * wrapped client instance, which would force every one of the ~30 existing
   * modules to inject a different token/type instead of this same `PrismaService`
   * class — exactly the ripple this guardrail exists to avoid (most modules should
   * need zero source changes). `$use` patches this same instance's query pipeline
   * in place, so every existing `constructor(private prisma: PrismaService)`
   * across the codebase keeps working unchanged. `$use` is deprecated in favor of
   * extensions but fully functional on the pinned Prisma 5.22 (backend/package.json)
   * — revisit this if the project ever upgrades past the version where it's
   * removed.
   *
   * For any tenant-scoped model (TENANT_SCOPED_MODELS — everything except
   * `School` itself), every query run while a scoped tenant context is open
   * (established per-request by TenantHostMiddleware, see
   * backend/src/tenancy/tenant-host.middleware.ts) is auto-scoped:
   *
   *  - findMany / findFirst(OrThrow) / count / aggregate / groupBy / updateMany /
   *    deleteMany — `schoolId` is merged into `where` (these all accept an
   *    arbitrary, non-unique-shaped where already, so this is a plain merge)
   *  - create — `schoolId` is merged into `data` (without overwriting an
   *    explicitly-set value — a caller setting a different schoolId is a bug
   *    worth surfacing loudly in review, not silently masking)
   *  - createMany — `schoolId` is merged into every row in `data`
   *  - findUnique(OrThrow) — rewritten to findFirst so schoolId can be merged
   *    into an otherwise unique-shaped `where` (Prisma's generated findUnique
   *    type won't accept extra fields)
   *  - update / delete — preceded by a scoped existence check; on a miss, throws
   *    the same PrismaClientKnownRequestError (P2025) shape Prisma throws
   *    natively on a not-found, so existing `catch` blocks need no changes. On a
   *    hit, the original operation runs untouched — the unique `where` already
   *    identifies a row now confirmed to belong to this school.
   *  - upsert — same existence check; on a miss, `schoolId` is merged into
   *    `create` before the native upsert runs (which will then take its create
   *    branch); on a hit, runs untouched, same reasoning as update/delete.
   *
   * Known, deliberate limitations (see the conversion plan's Phase 2c / Phase 4
   * for the enumerated real call sites each of these implies auditing by hand):
   *  - Nested writes (e.g. `user.create({ data: { studentProfile: { create: {} } } })`)
   *    are NOT intercepted — Prisma middleware only fires on the top-level
   *    model.action call, never on nested create/connect blocks.
   *  - Raw SQL ($queryRaw/$executeRaw) bypasses this entirely.
   *  - If no tenant context is open (e.g. a script run outside an HTTP request,
   *    like prisma/seed.ts or a future backfill script), queries pass through
   *    unscoped. Request-path code always has a context by the time it reaches a
   *    service, since TenantHostMiddleware runs before all routing.
   *  - `mode: 'unscoped'` (set only by PlatformScopeGuard, see
   *    ../tenancy/platform-scope.guard.ts) bypasses all of the above — reserved
   *    for genuine cross-school Platform-tier aggregates.
   */
  private registerTenantScopingMiddleware() {
    this.$use(async (params, next) => {
      const modelName = params.model;
      if (!modelName || !TENANT_SCOPED_MODELS.has(modelName)) {
        return next(params);
      }

      const store = tenantContext.getStore();
      if (!store || store.mode === 'unscoped') {
        return next(params);
      }

      const schoolId = store.schoolId;
      params.args = params.args ?? {};

      switch (params.action) {
        case 'findMany':
        case 'findFirst':
        case 'findFirstOrThrow':
        case 'count':
        case 'aggregate':
        case 'groupBy':
        case 'updateMany':
        case 'deleteMany':
          params.args.where = { ...(params.args.where ?? {}), schoolId };
          break;

        case 'create':
          params.args.data = { ...(params.args.data ?? {}), schoolId: params.args.data?.schoolId ?? schoolId };
          break;

        case 'createMany':
          // Preserve an explicitly-set schoolId per row (same "don't silently mask a
          // caller's explicit value" reasoning as `create` above) — row spreads first,
          // schoolId only fills in if the row didn't already set one.
          if (Array.isArray(params.args.data)) {
            params.args.data = params.args.data.map((row: Record<string, unknown>) => ({
              ...row,
              schoolId: (row.schoolId as string | undefined) ?? schoolId,
            }));
          }
          break;

        case 'findUnique':
        case 'findUniqueOrThrow':
          params.action = 'findFirst';
          params.args.where = { ...(params.args.where ?? {}), schoolId };
          break;

        case 'update':
        case 'delete': {
          const delegate = (this as any)[toDelegateName(modelName)];
          const found = await delegate.findFirst({
            where: { ...flattenUniqueWhere(params.args.where ?? {}), schoolId },
            select: { id: true },
          });
          if (!found) {
            throw new Prisma.PrismaClientKnownRequestError(
              `An operation failed because it depends on one or more records that were required but not found. No '${modelName}' record found for the given where (or it belongs to another school).`,
              { code: 'P2025', clientVersion: Prisma.prismaVersion.client },
            );
          }
          break; // ownership confirmed — let the original, still-unique-keyed op run natively
        }

        case 'upsert': {
          const delegate = (this as any)[toDelegateName(modelName)];
          const found = await delegate.findFirst({
            where: { ...flattenUniqueWhere(params.args.where ?? {}), schoolId },
            select: { id: true },
          });
          if (!found) {
            params.args.create = { ...(params.args.create ?? {}), schoolId };
          }
          // else: row confirmed to belong to this school — native upsert's update
          // branch will resolve to it correctly, no rewrite needed.
          break;
        }

        default:
          break;
      }

      return next(params);
    });
  }
}
