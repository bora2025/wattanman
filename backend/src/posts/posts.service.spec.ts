import { PostsService } from './posts.service';
import { decodeOpaqueCursor } from '../common/cursor-pagination';

describe('PostsService cursor pagination', () => {
  const rows = [
    { id: 'p3', pinned: true, createdAt: new Date('2026-03-03'), tags: '[]' },
    { id: 'p2', pinned: true, createdAt: new Date('2026-03-02'), tags: '[]' },
    { id: 'p1', pinned: false, createdAt: new Date('2026-03-01'), tags: '[]' },
  ];

  it('preserves pinned ordering and emits a compound continuation cursor', async () => {
    const prisma = { post: { findMany: jest.fn().mockResolvedValue(rows) } };
    const page = await new PostsService(prisma as any).listAll({ limit: '2' });
    expect(page.items.map((post) => post.id)).toEqual(['p3', 'p2']);
    expect(decodeOpaqueCursor(page.nextCursor!)).toEqual({ pinned: true, createdAt: rows[1].createdAt.toISOString(), id: 'p2' });
    expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] }));
  });

  it('uses the cursor to include remaining pinned rows and then unpinned rows', async () => {
    const prisma = { post: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new PostsService(prisma as any);
    const first = await new PostsService({ post: { findMany: jest.fn().mockResolvedValue(rows) } } as any).listAll({ limit: '2' });
    await service.listAll({ cursor: first.nextCursor!, limit: '2' });
    const where = prisma.post.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ pinned: false }]));
  });
});
