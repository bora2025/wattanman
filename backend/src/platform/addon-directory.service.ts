import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const VALID_KINDS = ['MODULE', 'ADDON'];

function slugifyToKey(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/**
 * Platform tier's Modules & Add-ons Directory — the catalog itself
 * (WordPress-plugin-directory-shaped): a PLATFORM_ADMIN creates/prices/
 * retires listings here, independent of any one school. Covers both free
 * opt-in-at-creation MODULEs (Phase 9) and paid opt-in-after-creation ADDONs
 * (Phase 7a) — one catalog, one management surface, distinguished by `kind`.
 * Per-school enabling of a listing is a separate concern, handled by
 * SchoolAddonsService (backend/src/platform/school-addons.service.ts) — this
 * service only ever touches AddonDefinition rows, never SchoolAddon.
 */
@Injectable()
export class AddonDirectoryService {
  constructor(private prisma: PrismaService) {}

  /** Every listing, active or retired — the platform admin's own management
   * view, as opposed to SchoolAddonsService.list() which filters retired
   * listings out for schools that don't already have them. */
  list() {
    return this.prisma.addonDefinition.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async create(data: { name: string; kind?: string; description?: string; category?: string; icon?: string; price?: number; priceNote?: string }) {
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('Name is required');
    const kind = data.kind || 'ADDON';
    if (!VALID_KINDS.includes(kind)) {
      throw new BadRequestException(`kind must be one of ${VALID_KINDS.join(', ')}`);
    }

    const key = slugifyToKey(name);
    if (!key || !KEY_PATTERN.test(key)) {
      throw new BadRequestException('Could not derive a valid key from that name — use at least one letter');
    }
    const existing = await this.prisma.addonDefinition.findUnique({ where: { key } });
    if (existing) throw new ConflictException(`An entry with key "${key}" already exists (derived from this name)`);

    return this.prisma.addonDefinition.create({
      data: {
        key,
        kind,
        name,
        description: data.description?.trim() || undefined,
        category: data.category?.trim() || undefined,
        icon: data.icon?.trim() || undefined,
        // MODULE listings are always free — ignore any price sent for one,
        // rather than trusting the client not to send stale form state.
        price: kind === 'MODULE' ? undefined : data.price ?? undefined,
        priceNote: kind === 'MODULE' ? undefined : data.priceNote?.trim() || undefined,
      },
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string; category?: string; icon?: string; price?: number | null; priceNote?: string; isActive?: boolean },
  ) {
    const existing = await this.prisma.addonDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Add-on not found');

    return this.prisma.addonDefinition.update({
      where: { id },
      data: {
        name: data.name?.trim() || undefined,
        description: data.description !== undefined ? data.description.trim() || null : undefined,
        category: data.category !== undefined ? data.category.trim() || null : undefined,
        icon: data.icon !== undefined ? data.icon.trim() || null : undefined,
        price: data.price === null ? null : data.price,
        priceNote: data.priceNote !== undefined ? data.priceNote.trim() || null : undefined,
        isActive: data.isActive,
      },
    });
  }

  /** Hard delete — only when nothing references it. Retiring (isActive:
   * false via update()) is the normal "remove from the store" action;
   * this is for cleaning up a listing nobody ever actually adopted. */
  async remove(id: string) {
    const existing = await this.prisma.addonDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Add-on not found');

    const inUse = await this.prisma.schoolAddon.count({ where: { addonKey: existing.key } });
    if (inUse > 0) {
      throw new ConflictException(
        `Cannot delete — ${inUse} school${inUse === 1 ? '' : 's'} still ${inUse === 1 ? 'has' : 'have'} a record of this add-on. Retire it instead (turn it off) to hide it from new schools without breaking existing ones.`,
      );
    }
    await this.prisma.addonDefinition.delete({ where: { id } });
    return { deleted: true, id };
  }
}
