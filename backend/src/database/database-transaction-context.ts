import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

export interface DatabaseTransactionStore {
  client: Prisma.TransactionClient;
  schoolId: string;
  active: boolean;
}

export const databaseTransactionContext = new AsyncLocalStorage<DatabaseTransactionStore>();
