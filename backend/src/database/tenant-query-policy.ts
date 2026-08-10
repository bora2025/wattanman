import { Prisma } from '@prisma/client';

export type OwnershipLookup = (
  modelName: string,
  where: Record<string, unknown>,
  schoolId: string,
) => Promise<boolean>;

export function flattenUniqueWhere(where: Record<string, unknown>): Record<string, unknown> {
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

export async function applyTenantQueryPolicy(
  params: Prisma.MiddlewareParams,
  schoolId: string,
  owns: OwnershipLookup,
) {
  const modelName = params.model;
  if (!modelName) return;
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
      params.args.data = {
        ...(params.args.data ?? {}),
        schoolId: params.args.data?.schoolId ?? schoolId,
      };
      break;

    case 'createMany':
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
    case 'delete':
      if (!(await owns(modelName, flattenUniqueWhere(params.args.where ?? {}), schoolId))) {
        throw new Prisma.PrismaClientKnownRequestError(
          `An operation failed because it depends on one or more records that were required but not found. No '${modelName}' record found for the given where (or it belongs to another school).`,
          { code: 'P2025', clientVersion: Prisma.prismaVersion.client },
        );
      }
      break;

    case 'upsert':
      if (!(await owns(modelName, flattenUniqueWhere(params.args.where ?? {}), schoolId))) {
        params.args.create = { ...(params.args.create ?? {}), schoolId };
      }
      break;
  }
}
