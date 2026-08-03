import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5MB — generous headroom over what client-side compression produces
const MAX_README_BYTES = 200 * 1024; // 200KB of markdown/text is a very long README

/**
 * Richer catalog authoring for a listing (module, paid add-on, or theme) —
 * a platform admin uploads a .zip bundling a screenshot and a README
 * instead of typing/pasting them field by field, mirroring how theme
 * extension packages (`platform/extension-package-validator.service.ts`) work for themes. Deliberately
 * metadata-only: this can only ever change what's *shown* about a listing
 * (AddonDefinition.screenshotUrl/detailDescription, both plain columns
 * already), never what it *does* — no code, no new functionality. The zip
 * is parsed entirely client-side (frontend/lib/addonPackage/parseZip.ts);
 * this only ever sees the already-extracted text/data-URI values.
 */
@Injectable()
export class AddonPackagesService {
  constructor(private prisma: PrismaService) {}

  async applyToAddon(addonId: string, data: { screenshotUrl?: string; detailDescription?: string }) {
    const addon = await this.prisma.addonDefinition.findUnique({ where: { id: addonId } });
    if (!addon) throw new NotFoundException('Listing not found');

    if (data.screenshotUrl !== undefined && data.screenshotUrl) {
      const byteLength = Buffer.byteLength(data.screenshotUrl, 'utf8');
      if (byteLength > MAX_SCREENSHOT_BYTES) {
        throw new BadRequestException(`Screenshot is too large (${(byteLength / 1024 / 1024).toFixed(1)}MB — max 5MB). Try a smaller image.`);
      }
    }
    if (data.detailDescription !== undefined && data.detailDescription) {
      const byteLength = Buffer.byteLength(data.detailDescription, 'utf8');
      if (byteLength > MAX_README_BYTES) {
        throw new BadRequestException(`README is too large (${(byteLength / 1024).toFixed(0)}KB — max 200KB).`);
      }
    }

    return this.prisma.addonDefinition.update({
      where: { id: addonId },
      data: {
        screenshotUrl: data.screenshotUrl !== undefined ? data.screenshotUrl || null : undefined,
        detailDescription: data.detailDescription !== undefined ? data.detailDescription || null : undefined,
      },
    });
  }
}
