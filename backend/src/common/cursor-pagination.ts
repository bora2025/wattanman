import { BadRequestException } from '@nestjs/common';

export type CursorPage<T> = { items: T[]; nextCursor: string | null; limit: number };
export type DateIdCursor = { createdAt: Date; id: string };

export function parsePageLimit(value?: string, defaultLimit = 50, maxLimit = 100) {
  if (value === undefined || value === '') return defaultLimit;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new BadRequestException(`limit must be an integer from 1 to ${maxLimit}`);
  return limit;
}

export function encodeDateIdCursor(value: DateIdCursor) {
  return Buffer.from(JSON.stringify({ createdAt: value.createdAt.toISOString(), id: value.id })).toString('base64url');
}

export function decodeDateIdCursor(value?: string): DateIdCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const createdAt = new Date(parsed.createdAt);
    if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error('invalid');
    return { createdAt, id: String(parsed.id) };
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
}

export function dateIdPage<T extends { id: string; createdAt: Date }>(rows: T[], limit: number): CursorPage<T> {
  return dateIdPageBy(rows, limit, (row) => row.createdAt);
}

export function dateIdPageBy<T extends { id: string }>(rows: T[], limit: number, date: (row: T) => Date): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeDateIdCursor({ id: last.id, createdAt: date(last) }) : null, limit };
}
