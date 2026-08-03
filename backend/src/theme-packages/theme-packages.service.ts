import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import JSZip from 'jszip';

const MAX_CSS_BYTES = 2 * 1024 * 1024; // 2MB — generous for a stylesheet plus a handful of inlined images
const MAX_PACKAGE_FILES = 200;
const MAX_EXTRACTED_BYTES = 10 * 1024 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_PATH_DEPTH = 8;
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const DISALLOWED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /@import\b/i, reason: '@import is not allowed — a theme package must be fully self-contained' },
  { pattern: /expression\s*\(/i, reason: 'CSS expression() is not allowed' },
  { pattern: /javascript\s*:/i, reason: 'javascript: URLs are not allowed' },
  { pattern: /<\s*script\b/i, reason: 'script markup is not allowed' },
];

function normalizePackagePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw new BadRequestException(`Theme package contains an invalid path: ${path}`);
  }
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new BadRequestException(`Theme package contains an unsafe path: ${path}`);
  }
  if (parts.length > MAX_PATH_DEPTH) {
    throw new BadRequestException(`Theme package path is too deeply nested: ${path}`);
  }
  return parts.join('/');
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
}

function resolveAssetPath(stylePath: string, reference: string): string {
  const base = stylePath.includes('/') ? stylePath.slice(0, stylePath.lastIndexOf('/')) : '';
  const parts = [...base.split('/').filter(Boolean), ...reference.replace(/\\/g, '/').split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!resolved.length) throw new BadRequestException(`Theme asset escapes the package root: ${reference}`);
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return normalizePackagePath(resolved.join('/'));
}

/**
 * Validates theme CSS and server-side package extraction. The legacy CSS
 * endpoint remains available during migration, but ZIP uploads use this
 * service as the security boundary rather than trusting browser extraction.
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

  async extractCssFromZip(file: Express.Multer.File): Promise<string> {
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Theme package must be a .zip file');
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file.buffer, { createFolders: false });
    } catch {
      throw new BadRequestException('Theme package is not a valid ZIP archive');
    }

    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    if (!entries.length) throw new BadRequestException('Theme package is empty');
    if (entries.length > MAX_PACKAGE_FILES) {
      throw new BadRequestException(`Theme package contains too many files (max ${MAX_PACKAGE_FILES})`);
    }

    const entriesByPath = new Map<string, JSZip.JSZipObject>();
    for (const entry of entries) {
      const originalPath = entry.unsafeOriginalName || entry.name;
      const normalized = normalizePackagePath(originalPath);
      const lookupKey = normalized.toLowerCase();
      if (entriesByPath.has(lookupKey)) {
        throw new BadRequestException(`Theme package contains a duplicate path: ${normalized}`);
      }
      const extension = extensionOf(normalized);
      if (normalized.split('/').pop()?.toLowerCase() !== 'style.css' && !MIME_BY_EXTENSION[extension]) {
        throw new BadRequestException(`Unsupported theme package file: ${normalized}`);
      }
      entriesByPath.set(lookupKey, entry);
    }

    const styleEntries = [...entriesByPath.entries()].filter(([path]) => path.split('/').pop() === 'style.css');
    if (styleEntries.length !== 1) {
      throw new BadRequestException('Theme package must contain exactly one style.css file');
    }

    const [stylePath, styleEntry] = styleEntries[0];
    const styleBytes = await styleEntry.async('nodebuffer');
    if (styleBytes.length > MAX_CSS_BYTES) throw new BadRequestException('style.css exceeds the 2MB limit');
    let extractedBytes = styleBytes.length;
    let css = styleBytes.toString('utf8');

    const references = new Set<string>();
    CSS_URL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CSS_URL_PATTERN.exec(css))) {
      const reference = match[2].trim();
      if (!reference || reference.startsWith('data:')) continue;
      if (/^(https?:)?\/\//i.test(reference)) {
        throw new BadRequestException(`External theme asset URLs are not allowed: ${reference}`);
      }
      references.add(reference);
    }

    for (const reference of references) {
      const assetPath = resolveAssetPath(stylePath, reference);
      const assetEntry = entriesByPath.get(assetPath.toLowerCase());
      if (!assetEntry) throw new BadRequestException(`Theme asset is missing from the package: ${reference}`);
      const mime = MIME_BY_EXTENSION[extensionOf(assetPath)];
      if (!mime) throw new BadRequestException(`Unsupported theme asset: ${assetPath}`);
      const asset = await assetEntry.async('nodebuffer');
      if (asset.length > MAX_ASSET_BYTES) throw new BadRequestException(`Theme asset exceeds the 2MB limit: ${assetPath}`);
      extractedBytes += asset.length;
      if (extractedBytes > MAX_EXTRACTED_BYTES) {
        throw new BadRequestException('Theme package exceeds the 10MB extracted-size limit');
      }
      const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      css = css.replace(
        new RegExp(`url\\(\\s*(['"]?)${escapedReference}\\1\\s*\\)`, 'g'),
        `url(data:${mime};base64,${asset.toString('base64')})`,
      );
    }

    return this.validateAndSanitizeCss(css);
  }

  async applyZipToAddon(addonId: string, file: Express.Multer.File) {
    const css = await this.extractCssFromZip(file);
    return this.applyToAddon(addonId, css);
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
