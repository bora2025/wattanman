import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { getCurrentSchoolId } from '../tenancy/tenant-context';
import { BadRequestException } from '@nestjs/common';
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageLimit } from '../common/cursor-pagination';

export interface CreatePostDto {
  title: string;
  excerpt?: string;
  body?: string;
  type?: 'text' | 'image' | 'video';
  imageUrl?: string;
  videoUrl?: string;
  published?: boolean;
  pinned?: boolean;
  tags?: string[];
  authorId?: string;
}

export type UpdatePostDto = Partial<CreatePostDto>;

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  /** Admin: list all posts (any status). */
  async listAll(input: { cursor?: string; limit?: string } = {}) {
    return this.listPage(false, input);
  }

  async listPublished(input: { cursor?: string; limit?: string } = {}) {
    return this.listPage(true, input);
  }

  private async listPage(publishedOnly: boolean, input: { cursor?: string; limit?: string }) {
    const limit = parsePageLimit(input.limit, publishedOnly ? 12 : 50);
    const raw = decodeOpaqueCursor(input.cursor);
    const cursor = raw ? { pinned: raw.pinned === true, createdAt: new Date(raw.createdAt), id: String(raw.id || '') } : null;
    if (cursor && (!cursor.id || Number.isNaN(cursor.createdAt.getTime()))) throw new BadRequestException('Invalid pagination cursor');
    const boundary = cursor
      ? cursor.pinned
        ? { OR: [{ pinned: true, createdAt: { lt: cursor.createdAt } }, { pinned: true, createdAt: cursor.createdAt, id: { lt: cursor.id } }, { pinned: false }] }
        : { pinned: false, OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
      : {};
    const posts = await this.prisma.post.findMany({
      where: { ...(publishedOnly ? { published: true } : {}), ...boundary },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = posts.length > limit;
    const items = (hasMore ? posts.slice(0, limit) : posts).map((post) => this.deserialize(post));
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? encodeOpaqueCursor({ pinned: last.pinned, createdAt: last.createdAt, id: last.id }) : null, limit };
  }

  /** Get single post by id. */
  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return this.deserialize(post);
  }

  /** Create a post. */
  async create(dto: CreatePostDto) {
    const post = await this.prisma.post.create({
      data: {
        schoolId: getCurrentSchoolId(),
        title: dto.title,
        excerpt: dto.excerpt ?? '',
        body: dto.body ?? '',
        type: dto.type ?? 'text',
        imageUrl: dto.imageUrl ?? '',
        videoUrl: dto.videoUrl ?? '',
        published: dto.published ?? false,
        pinned: dto.pinned ?? false,
        tags: JSON.stringify(dto.tags ?? []),
        authorId: dto.authorId,
      },
    });
    return this.deserialize(post);
  }

  /** Update a post. */
  async update(id: string, dto: UpdatePostDto) {
    await this.findOne(id); // throws if not found
    const data: Record<string, unknown> = { ...dto };
    if (dto.tags !== undefined) data.tags = JSON.stringify(dto.tags);
    const post = await this.prisma.post.update({ where: { id }, data });
    return this.deserialize(post);
  }

  /** Delete a post. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  private deserialize(post: any) {
    return {
      ...post,
      tags: this.parseJson(post.tags, []),
    };
  }

  private parseJson<T>(value: string, fallback: T): T {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
}
