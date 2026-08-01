import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const VALID_KINDS = ['MODULE', 'ADDON', 'THEME'];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
// Mirror frontend/lib/appearance/themeFonts.ts and themeRadius.ts's curated
// lists — kept as small local duplicates rather than a shared package,
// matching this codebase's existing convention for small cross-cutting
// constants (see the old VALID_ACCENT_COLORS this replaces, same reasoning).
const VALID_THEME_FONTS = ['inter', 'poppins', 'nunito', 'manrope', 'roboto'];
const VALID_THEME_RADII = ['sharp', 'soft', 'round'];

interface ThemeConfigInput {
  mode?: string;
  primaryColor?: string;
  secondaryColor?: string;
  font?: string;
  radius?: string;
}

/** Phase 19 shape — `accentColor` (a fixed 10-name enum, Sidebar-only) is
 * retired in favor of `primaryColor` alone now driving both the dashboard
 * and the public site consistently; `secondaryColor`/`font`/`radius` are new.
 * Older stored rows may still carry a leftover `accentColor` key in their
 * JSON blob from before this change — harmless, just unused, never read. */
function validateThemeConfig(themeConfig: ThemeConfigInput | null | undefined) {
  if (!themeConfig) throw new BadRequestException('themeConfig is required for THEME listings');
  if (themeConfig.mode !== 'light' && themeConfig.mode !== 'dark') {
    throw new BadRequestException("themeConfig.mode must be 'light' or 'dark'");
  }
  if (!themeConfig.primaryColor || !HEX_COLOR_PATTERN.test(themeConfig.primaryColor)) {
    throw new BadRequestException('themeConfig.primaryColor must be a hex color, e.g. #4f46e5');
  }
  if (!themeConfig.secondaryColor || !HEX_COLOR_PATTERN.test(themeConfig.secondaryColor)) {
    throw new BadRequestException('themeConfig.secondaryColor must be a hex color, e.g. #0284c7');
  }
  if (!themeConfig.font || !VALID_THEME_FONTS.includes(themeConfig.font)) {
    throw new BadRequestException(`themeConfig.font must be one of ${VALID_THEME_FONTS.join(', ')}`);
  }
  if (!themeConfig.radius || !VALID_THEME_RADII.includes(themeConfig.radius)) {
    throw new BadRequestException(`themeConfig.radius must be one of ${VALID_THEME_RADII.join(', ')}`);
  }
  return {
    mode: themeConfig.mode,
    primaryColor: themeConfig.primaryColor,
    secondaryColor: themeConfig.secondaryColor,
    font: themeConfig.font,
    radius: themeConfig.radius,
  };
}

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

  async create(data: { name: string; kind?: string; description?: string; detailDescription?: string; screenshotUrl?: string; category?: string; icon?: string; price?: number; priceNote?: string; themeConfig?: ThemeConfigInput }) {
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
        detailDescription: data.detailDescription?.trim() || undefined,
        screenshotUrl: data.screenshotUrl?.trim() || undefined,
        category: data.category?.trim() || undefined,
        icon: data.icon?.trim() || undefined,
        // MODULE listings are always free — ignore any price sent for one,
        // rather than trusting the client not to send stale form state.
        price: kind === 'MODULE' ? undefined : data.price ?? undefined,
        priceNote: kind === 'MODULE' ? undefined : data.priceNote?.trim() || undefined,
        // THEME-only preset payload — validated and force-null otherwise,
        // same reasoning as price/priceNote being MODULE-null above.
        themeConfig: kind === 'THEME' ? validateThemeConfig(data.themeConfig) : undefined,
      },
    });
  }

  /**
   * `kind` is editable here (e.g. turning a free MODULE like Attendance into
   * a priced ADDON once the business decides to charge for it). Schools that
   * already have the key `enabled: true` are unaffected — RequiresAddonGuard
   * and the enabled-key list only ever check `SchoolAddon.enabled`, never
   * `kind`, so an existing school's access is grandfathered automatically,
   * with no SchoolAddon rows to touch. The only real effects of the switch:
   * the school-creation wizard stops offering it as a free pick, the
   * school's own Add-ons page moves it into the "Paid Add-ons" section
   * (still shown Enabled if it already was), and new schools now have to
   * request it and wait for platform-admin approval, same as any other
   * paid add-on.
   */
  async update(
    id: string,
    data: { name?: string; kind?: string; description?: string; detailDescription?: string; screenshotUrl?: string | null; category?: string; icon?: string; price?: number | null; priceNote?: string; isActive?: boolean; themeConfig?: ThemeConfigInput },
  ) {
    const existing = await this.prisma.addonDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Add-on not found');

    if (data.kind !== undefined && !VALID_KINDS.includes(data.kind)) {
      throw new BadRequestException(`kind must be one of ${VALID_KINDS.join(', ')}`);
    }
    const nextKind = data.kind ?? existing.kind;

    // THEME-only preset payload — force-null when switching away from THEME
    // (same reasoning as price/priceNote below); when staying/becoming
    // THEME, validate a freshly-sent themeConfig, or leave the existing one
    // untouched if this call didn't include one (e.g. just editing price).
    const themeConfig =
      nextKind !== 'THEME'
        ? null
        : data.themeConfig !== undefined
          ? validateThemeConfig(data.themeConfig)
          : undefined;

    return this.prisma.addonDefinition.update({
      where: { id },
      data: {
        name: data.name?.trim() || undefined,
        kind: data.kind,
        description: data.description !== undefined ? data.description.trim() || null : undefined,
        detailDescription: data.detailDescription !== undefined ? data.detailDescription.trim() || null : undefined,
        screenshotUrl: data.screenshotUrl !== undefined ? (data.screenshotUrl?.trim() || null) : undefined,
        category: data.category !== undefined ? data.category.trim() || null : undefined,
        icon: data.icon !== undefined ? data.icon.trim() || null : undefined,
        // A MODULE is always free — clear any price the form still had
        // lying around rather than trusting stale client state, same
        // reasoning as create().
        price: nextKind === 'MODULE' ? null : (data.price === null ? null : data.price),
        priceNote: nextKind === 'MODULE' ? null : (data.priceNote !== undefined ? data.priceNote.trim() || null : undefined),
        themeConfig,
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
