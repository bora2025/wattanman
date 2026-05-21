import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Backup / restore service.
 *
 * The shape of an export file is:
 *   {
 *     "version": 1,
 *     "exportedAt": "<ISO date>",
 *     "models": ["User", "Class", ...],
 *     "data": { "User": [...], "Class": [...], ... }
 *   }
 *
 * Restore strategy (Postgres):
 *   1. Disable FK enforcement for the current session (`session_replication_role
 *      = 'replica'`) so we can repopulate tables in any order without worrying
 *      about cycles or self-references.
 *   2. TRUNCATE every table CASCADE + RESTART IDENTITY.
 *   3. createMany() each model from the backup JSON.
 *   4. Re-enable FK enforcement.
 *
 * The whole thing runs inside one `$transaction` so a failure rolls back to
 * the previous state and never leaves the DB half-restored.
 */
@Injectable()
export class BackupService {
  constructor(private prisma: PrismaService) {}

  /** Names of all Prisma models in the data model, in dmmf-declaration order. */
  private getModelNames(): string[] {
    // @ts-ignore — Prisma.dmmf is exposed at runtime
    const models = (Prisma.dmmf?.datamodel?.models ?? []) as { name: string }[];
    return models.map(m => m.name);
  }

  private camel(modelName: string): string {
    return modelName.charAt(0).toLowerCase() + modelName.slice(1);
  }

  /** Map a Prisma model name to its underlying Postgres table name. Prisma
   *  defaults to the PascalCase model name unless overridden with @@map. */
  private getTableName(modelName: string): string {
    // @ts-ignore — Prisma.dmmf is exposed at runtime
    const m = (Prisma.dmmf?.datamodel?.models ?? []).find((x: any) => x.name === modelName);
    return (m as any)?.dbName || modelName;
  }

  async exportAll() {
    const modelNames = this.getModelNames();
    const data: Record<string, any[]> = {};
    for (const name of modelNames) {
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
      version: 1,
      exportedAt: new Date().toISOString(),
      models: modelNames,
      data,
    };
  }

  async restore(payload: any) {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
      throw new BadRequestException('Invalid backup file: expected { version, data: {...} }');
    }
    const modelNames = this.getModelNames();
    const tables = modelNames
      .map(n => `"${this.getTableName(n)}"`)
      .join(', ');

    // Use a transaction with a generous timeout; large backups may take a while.
    return this.prisma.$transaction(
      async (tx) => {
        // 1. Disable FK enforcement (requires DB owner / superuser; Railway grants this).
        await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);

        // 2. Wipe.
        if (tables.length > 0) {
          await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
        }

        // 3. Re-insert. Iterate in declared order — order doesn't matter
        //    because FKs are disabled, but parents-first is friendlier to logs.
        let inserted = 0;
        for (const name of modelNames) {
          const rows = payload.data[name];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          const delegate = (tx as any)[this.camel(name)];
          if (!delegate?.createMany) continue;

          // Convert ISO date strings back to Date objects where Prisma expects them.
          const parsed = rows.map((r: any) => this.parseDates(name, r));

          // createMany doesn't return inserted rows, just a count.
          // Use chunks to avoid hitting parameter limits on huge tables.
          const CHUNK = 500;
          for (let i = 0; i < parsed.length; i += CHUNK) {
            const chunk = parsed.slice(i, i + CHUNK);
            await delegate.createMany({ data: chunk, skipDuplicates: true });
            inserted += chunk.length;
          }
        }

        // 4. Re-enable FK enforcement.
        await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);

        return { ok: true, models: modelNames.length, inserted };
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
