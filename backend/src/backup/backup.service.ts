import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TENANT_SCOPED_MODELS } from '../tenancy/scoped-models';
import { getCurrentSchoolId } from '../tenancy/tenant-context';

/**
 * Backup / restore service — scoped to the current school only.
 *
 * Rewritten for multi-tenancy (conversion plan Phase 3a). Before this, both
 * `exportAll()` and `restore()` operated on the ENTIRE database with zero
 * filtering — safe when there was exactly one school, but once other schools'
 * data lives in the same tables, that was a live cross-tenant exfiltration
 * (export) and wipe (restore's TRUNCATE) vector for any single school's ADMIN.
 * This version is scoped by construction, not by convention: every read/write
 * below goes through the SAME PrismaService whose query middleware
 * auto-injects `schoolId` (see backend/src/database/prisma.service.ts) — there
 * is no separate "scoped" code path to accidentally bypass.
 *
 * Deliberately NOT covered here: a true whole-database export/restore for
 * disaster recovery. That capability existed before this rewrite (as an
 * unscoped ADMIN-only endpoint) and doesn't exist again until Phase 6 adds a
 * PLATFORM_ADMIN-only, explicitly `mode:'unscoped'` equivalent under
 * `/platform/backup/*`. Until then, disaster recovery relies on the hosting
 * provider's own database-level backups (e.g. Railway's automatic Postgres
 * backups) — this is a deliberate, temporary capability trade against closing
 * the security hole immediately, not an oversight.
 *
 * The shape of an export file is unchanged:
 *   { "version": 1, "exportedAt": "<ISO date>", "models": [...], "data": { "User": [...], ... } }
 * — except `models`/`data` now only cover tenant-scoped models, minus a small
 * exclusion list of live session/security artifacts that don't belong in a
 * downloadable file at all (see BACKUP_EXCLUDED_MODELS).
 */

/** Live session/security artifacts — never worth exporting or restoring, even
 * scoped to one school. A backup is meant to preserve *data*, not active
 * sessions or in-flight password-reset links. */
const BACKUP_EXCLUDED_MODELS = new Set<string>(['RefreshToken', 'PasswordResetToken']);

const BACKUP_MODEL_NAMES = [...TENANT_SCOPED_MODELS].filter((m) => !BACKUP_EXCLUDED_MODELS.has(m));

@Injectable()
export class BackupService {
  constructor(private prisma: PrismaService) {}

  private camel(modelName: string): string {
    return modelName.charAt(0).toLowerCase() + modelName.slice(1);
  }

  /** Export every tenant-scoped model's rows for the CURRENT school. Scoping
   * is implicit — `findMany()` is called with no `where` at all, and
   * PrismaService's middleware merges `schoolId` in automatically, exactly
   * like any other call site in the codebase. */
  async exportAll() {
    const data: Record<string, any[]> = {};
    for (const name of BACKUP_MODEL_NAMES) {
      const delegate = (this.prisma as any)[this.camel(name)];
      if (delegate?.findMany) {
        try {
          data[name] = await delegate.findMany();
        } catch (e) {
          // Some Prisma helpers (e.g. internal models) may not be queryable —
          // skip them rather than fail the whole export.
          data[name] = [];
        }
      }
    }
    return {
      version: 2, // bumped: v1 files were whole-database dumps, not school-scoped — see importFromV1Warning below
      exportedAt: new Date().toISOString(),
      models: BACKUP_MODEL_NAMES,
      data,
    };
  }

  async restore(payload: any) {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
      throw new BadRequestException('Invalid backup file: expected { version, data: {...} }');
    }
    if (payload.version === 1) {
      // A pre-multi-tenancy whole-database export. Restoring it here would
      // silently drop every row's original schoolId in favor of the current
      // tenant (see the schoolId-stripping below), which is almost certainly
      // not what the operator intends for what was originally a full-DB
      // snapshot. Refuse rather than guess.
      throw new BadRequestException(
        'This backup file predates multi-tenancy (version 1) and cannot be restored through this endpoint. Contact support.',
      );
    }

    const schoolId = getCurrentSchoolId();

    // Use a transaction with a generous timeout; large backups may take a while.
    return this.prisma.$transaction(
      async (tx) => {
        // Disable FK enforcement for the duration — we delete/recreate a school's
        // rows across many tables whose insert order would otherwise matter.
        await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);

        // 1. Wipe this school's existing rows in every model being restored.
        //    Each deleteMany() is auto-scoped to `schoolId` by the same
        //    PrismaService middleware as everything else — no raw SQL, no
        //    table-name interpolation, and structurally incapable of touching
        //    another school's rows.
        for (const name of BACKUP_MODEL_NAMES) {
          const delegate = (tx as any)[this.camel(name)];
          if (delegate?.deleteMany) {
            await delegate.deleteMany({});
          }
        }

        // 2. Re-insert, forcing every row's schoolId to the CURRENT tenant —
        //    deliberately NOT trusting whatever schoolId (if any) is present in
        //    the uploaded file. Without this, a backup file from a different
        //    school (or a tampered one) could plant rows still tagged with a
        //    foreign schoolId: invisible to this school afterward, but real
        //    write-side contamination of another tenant's data. Stripping it
        //    here means PrismaService's `create`/`createMany` middleware falls
        //    back to its default (fill in the current tenant) exactly as it
        //    would for any ordinary, schoolId-less call elsewhere in the app.
        let inserted = 0;
        for (const name of BACKUP_MODEL_NAMES) {
          const rows = payload.data[name];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          const delegate = (tx as any)[this.camel(name)];
          if (!delegate?.createMany) continue;

          const parsed = rows.map((r: any) => {
            const { schoolId: _ignoredForeignSchoolId, ...rest } = this.parseDates(name, r);
            return rest;
          });

          // createMany doesn't return inserted rows, just a count.
          // Use chunks to avoid hitting parameter limits on huge tables.
          const CHUNK = 500;
          for (let i = 0; i < parsed.length; i += CHUNK) {
            const chunk = parsed.slice(i, i + CHUNK);
            await delegate.createMany({ data: chunk, skipDuplicates: true });
            inserted += chunk.length;
          }
        }

        await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);

        return { ok: true, schoolId, models: BACKUP_MODEL_NAMES.length, inserted };
      },
      { timeout: 5 * 60 * 1000, maxWait: 60 * 1000 },
    );
  }

  /** JSON cannot represent Date — Prisma export emits ISO strings. Convert
   *  fields that the schema declares as DateTime back into Date objects. */
  private parseDates(modelName: string, row: any): any {
    // @ts-ignore — runtime DMMF
    const m = (Prisma.dmmf?.datamodel?.models ?? []).find((x: any) => x.name === modelName);
    if (!m) return row;
    const dateFields = ((m as any).fields as any[])
      .filter(f => f.type === 'DateTime' && f.kind === 'scalar')
      .map(f => f.name);
    if (dateFields.length === 0) return row;
    const out: any = { ...row };
    for (const f of dateFields) {
      if (out[f] != null && typeof out[f] === 'string') {
        const d = new Date(out[f]);
        if (!isNaN(d.getTime())) out[f] = d;
      }
    }
    return out;
  }
}
