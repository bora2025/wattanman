import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const MAX_CSS_BYTES = 2 * 1024 * 1024; // 2MB — generous for a stylesheet plus a handful of inlined images
const DISALLOWED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /@import\b/i, reason: '@import is not allowed — a theme package must be fully self-contained' },
  { pattern: /expression\s*\(/i, reason: 'CSS expression() is not allowed' },
];

/**
 * Validates and sanitizes the CSS text a platform admin's browser already
 * extracted from an uploaded theme package .zip (frontend/lib/appearance/
 * themePackage/parseZip.ts) — image/font assets are inlined as data URIs
 * client-side before this ever runs, so this service only ever sees plain
 * text, never a .zip or binary asset.
 */
@Injectable()
export class ThemePackagesService {
  constructor(private prisma: PrismaService) {}

  validateAndSanitizeCss(css: string): string {
    if (!css || !css.trim()) {
      throw new BadRequestException('The uploaded package has no usable CSS');
    }
    const byteLength = Buffer.byteLength(css, 'utf8');
    if (byteLength > MAX_CSS_BYTES) {
      throw new BadRequestException(`Theme package CSS is too large (${(byteLength / 1024 / 1024).toFixed(1)}MB — max 2MB). Try smaller/fewer images.`);
    }
    for (const { pattern, reason } of DISALLOWED_PATTERNS) {
      if (pattern.test(css)) {
        throw new BadRequestException(`Theme package rejected: ${reason}`);
      }
    }
    return css;
  }

  /** Merges the validated CSS into the addon's existing themeConfig JSON —
   * mode/primaryColor/secondaryColor/font/radius (Phase 19) are left
   * untouched, only customCss is set/replaced. */
  async applyToAddon(addonId: string, css: string) {
    const addon = await this.prisma.addonDefinition.findUnique({ where: { id: addonId } });
    if (!addon) throw new NotFoundException('Theme not found');
    if (addon.kind !== 'THEME') {
      throw new BadRequestException('Theme packages can only be uploaded to a THEME-kind listing');
    }
    const sanitized = this.validateAndSanitizeCss(css);
    const existingConfig = (addon.themeConfig as Record<string, unknown> | null) || {};
    return this.prisma.addonDefinition.update({
      where: { id: addonId },
      data: { themeConfig: { ...existingConfig, customCss: sanitized } },
    });
  }
}
