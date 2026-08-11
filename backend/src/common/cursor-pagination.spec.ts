import { BadRequestException } from '@nestjs/common';
import { dateIdPage, decodeDateIdCursor, parsePageLimit } from './cursor-pagination';

describe('cursor pagination', () => {
  it('creates an opaque cursor only when another page exists', () => {
    const rows = [1, 2, 3].map((id) => ({ id: String(id), createdAt: new Date(`2026-01-0${id}T00:00:00Z`) }));
    const page = dateIdPage(rows, 2);
    expect(page.items).toHaveLength(2);
    expect(decodeDateIdCursor(page.nextCursor!)).toEqual(rows[1]);
  });

  it('rejects invalid cursors and unbounded limits', () => {
    expect(() => decodeDateIdCursor('not-json')).toThrow(BadRequestException);
    expect(() => parsePageLimit('101')).toThrow(BadRequestException);
    expect(parsePageLimit(undefined)).toBe(50);
  });
});
