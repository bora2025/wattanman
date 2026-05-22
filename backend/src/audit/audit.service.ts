import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type AuditAction =
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'EXPORT'
  | 'IMPORT'
  | 'ROLE_CHANGE'
  | 'PASSWORD_RESET'
  | 'PERMISSION_CHANGE'
  | 'BACKUP'
  | 'RESTORE'
  | string;

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  resource: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  /** Pass before+after objects; the service will diff them automatically. */
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  /** Or pre-computed changes. Takes precedence over before/after. */
  changes?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  success?: boolean;
  errorMessage?: string | null;
}

/**
 * Append-only audit logger. Writes are best-effort: a failure here must never
 * break the user-facing request.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /** Fire-and-forget audit write. Returns a promise but never rejects. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      const changes =
        entry.changes ??
        (entry.before || entry.after
          ? this.diff(entry.before ?? null, entry.after ?? null)
          : undefined);

      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorRole: entry.actorRole ?? null,
          actorName: entry.actorName ?? null,
          actorEmail: entry.actorEmail ?? null,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId ?? null,
          resourceLabel: entry.resourceLabel ?? null,
          changes: changes ?? undefined,
          metadata: (entry.metadata as any) ?? undefined,
          method: entry.method ?? null,
          path: entry.path ?? null,
          statusCode: entry.statusCode ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          success: entry.success ?? true,
          errorMessage: entry.errorMessage ?? null,
        },
      });
    } catch (err: any) {
      // Never throw from the audit pipeline; just log it.
      this.logger.warn(`Failed to write audit log: ${err?.message ?? err}`);
    }
  }

  /**
   * Build a compact diff of two snapshots. Only keys whose values differ are
   * included. Sensitive fields are redacted defensively.
   */
  private diff(
    before: Record<string, any> | null,
    after: Record<string, any> | null,
  ): { before: Record<string, any>; after: Record<string, any> } | undefined {
    if (!before && !after) return undefined;
    const SENSITIVE = new Set(['password', 'hashedPassword', 'token', 'refreshToken', 'accessToken']);
    const redact = (v: any) => (typeof v === 'string' && v.length > 0 ? '[REDACTED]' : v);
    const keys = new Set<string>([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {}),
    ]);
    const b: Record<string, any> = {};
    const a: Record<string, any> = {};
    for (const k of keys) {
      const bv = before?.[k];
      const av = after?.[k];
      if (JSON.stringify(bv) === JSON.stringify(av)) continue;
      if (SENSITIVE.has(k)) {
        if (bv !== undefined) b[k] = redact(bv);
        if (av !== undefined) a[k] = redact(av);
      } else {
        if (bv !== undefined) b[k] = bv;
        if (av !== undefined) a[k] = av;
      }
    }
    if (Object.keys(b).length === 0 && Object.keys(a).length === 0) return undefined;
    return { before: b, after: a };
  }
}
