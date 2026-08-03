import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import JSZip from 'jszip';

const MAX_FILES = 200;
const MAX_EXTRACTED_BYTES = 10 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const MAX_PATH_DEPTH = 8;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const THEME_FONTS = ['inter', 'poppins', 'nunito', 'manrope', 'roboto'];
const THEME_RADII = ['sharp', 'soft', 'round'];
const THEME_SPACING = ['compact', 'comfortable', 'spacious'];
const THEME_SHADOWS = ['none', 'soft', 'elevated'];
const THEME_SURFACES = ['flat', 'bordered', 'glass'];
const MODULE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'REPORTER', 'EMPLOYEE', 'PARENT', 'STUDENT']);
const MODULE_COMPONENTS = new Set(['stats', 'form', 'table', 'details', 'chart']);
const APPROVED_THEME_SELECTORS = new Set([
  ':root', 'body', '.dark body', '.card', '.stat-card', '.dark .card', '.dark .stat-card',
  '.btn-primary', '.btn-primary:hover', '.btn-outline', '.btn-outline:hover', '.page-shell',
  '.page-content', '.page-header', '.page-body', '.sidebar',
]);
const EXECUTABLE_EXTENSIONS = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'exe', 'dll', 'so', 'dylib', 'sh', 'bat', 'cmd', 'ps1']);
const ALLOWED_EXTENSIONS = new Set(['json', 'md', 'txt', 'css', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'woff', 'woff2', 'ttf', 'otf']);

export interface PackageValidationResult {
  valid: boolean;
  manifest?: Record<string, any>;
  errors: Array<{ code: string; path?: string; message: string }>;
  warnings: Array<{ code: string; path?: string; message: string }>;
  files: Array<{ path: string; size: number; checksum: string; mimeType: string; contents: Buffer }>;
}

function normalizedPath(entry: JSZip.JSZipObject): string | null {
  const original = (entry.unsafeOriginalName || entry.name).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!original || original.startsWith('/') || /^[a-zA-Z]:\//.test(original)) return null;
  const parts = original.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..') || parts.length > MAX_PATH_DEPTH) return null;
  return parts.join('/');
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
}

function detectMime(path: string, contents: Buffer): string | null {
  const extension = extensionOf(path);
  const starts = (...bytes: number[]) => bytes.every((byte, index) => contents[index] === byte);
  if (extension === 'png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ? 'image/png' : null;
  if (extension === 'jpg' || extension === 'jpeg') return starts(0xff, 0xd8, 0xff) ? 'image/jpeg' : null;
  if (extension === 'gif') return contents.subarray(0, 4).toString('ascii') === 'GIF8' ? 'image/gif' : null;
  if (extension === 'webp') return contents.subarray(0, 4).toString('ascii') === 'RIFF' && contents.subarray(8, 12).toString('ascii') === 'WEBP' ? 'image/webp' : null;
  if (extension === 'woff') return contents.subarray(0, 4).toString('ascii') === 'wOFF' ? 'font/woff' : null;
  if (extension === 'woff2') return contents.subarray(0, 4).toString('ascii') === 'wOF2' ? 'font/woff2' : null;
  if (extension === 'ttf') return starts(0x00, 0x01, 0x00, 0x00) || contents.subarray(0, 4).toString('ascii') === 'true' ? 'font/ttf' : null;
  if (extension === 'otf') return contents.subarray(0, 4).toString('ascii') === 'OTTO' ? 'font/otf' : null;
  if (contents.includes(0)) return null;
  if (extension === 'json') return 'application/json';
  if (extension === 'css') return 'text/css';
  if (extension === 'md') return 'text/markdown';
  if (extension === 'txt') return 'text/plain';
  return null;
}

function scopeThemeCss(css: string): { css?: string; error?: string } {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@[a-z-]+/i.test(withoutComments)) return { error: 'CSS at-rules are not allowed in theme packages' };
  let cursor = 0;
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of withoutComments.matchAll(rulePattern)) {
    if (match.index !== cursor && withoutComments.slice(cursor, match.index).trim()) return { error: 'CSS contains malformed or nested rules' };
    cursor = (match.index || 0) + match[0].length;
    const selectors = match[1].split(',').map((selector) => selector.trim());
    if (selectors.some((selector) => !APPROVED_THEME_SELECTORS.has(selector))) {
      return { error: `CSS selector is not approved: ${selectors.find((selector) => !APPROVED_THEME_SELECTORS.has(selector))}` };
    }
    if (/behavior\s*:|-moz-binding\s*:|position\s*:\s*fixed/i.test(match[2])) return { error: 'CSS contains a restricted declaration' };
    const scoped = selectors.map((selector) => selector === ':root'
      ? '.wattaman-theme'
      : selector === 'body'
        ? '.wattaman-theme'
        : selector.startsWith('.dark ')
          ? selector === '.dark body' ? '.wattaman-theme.dark' : `.wattaman-theme.dark ${selector.slice(6)}`
          : `.wattaman-theme ${selector}`).join(',\n');
    blocks.push(`${scoped} {${match[2]}}`);
  }
  if (withoutComments.slice(cursor).trim()) return { error: 'CSS contains malformed rules' };
  return { css: blocks.join('\n\n') };
}

@Injectable()
export class ExtensionPackageValidatorService {
  async validate(file: Express.Multer.File, extension: { key: string; runtimeType: string }, expectedVersion: string): Promise<PackageValidationResult> {
    const result: PackageValidationResult = { valid: false, errors: [], warnings: [], files: [] };
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file.buffer, { createFolders: false });
    } catch {
      result.errors.push({ code: 'INVALID_ZIP', message: 'Package is not a valid ZIP archive' });
      return result;
    }

    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    if (!entries.length) result.errors.push({ code: 'EMPTY_PACKAGE', message: 'Package contains no files' });
    if (entries.length > MAX_FILES) result.errors.push({ code: 'TOO_MANY_FILES', message: `Package contains more than ${MAX_FILES} files` });

    const paths = new Map<string, JSZip.JSZipObject>();
    for (const entry of entries.slice(0, MAX_FILES + 1)) {
      const path = normalizedPath(entry);
      if (!path) {
        result.errors.push({ code: 'UNSAFE_PATH', path: entry.unsafeOriginalName || entry.name, message: 'Path is absolute, traverses the archive root, or is too deeply nested' });
        continue;
      }
      const lowerPath = path.toLowerCase();
      if (paths.has(lowerPath)) {
        result.errors.push({ code: 'DUPLICATE_PATH', path, message: 'Package contains duplicate normalized paths' });
        continue;
      }
      paths.set(lowerPath, entry);

      const unixMode = typeof entry.unixPermissions === 'number' ? entry.unixPermissions : 0;
      if ((unixMode & 0o170000) === 0o120000) {
        result.errors.push({ code: 'SYMLINK', path, message: 'Symbolic links are not allowed' });
      }
      const extensionName = extensionOf(path);
      if (EXECUTABLE_EXTENSIONS.has(extensionName)) {
        result.errors.push({ code: 'EXECUTABLE_FILE', path, message: 'Executable source or binary files are not allowed in declarative packages' });
      } else if (!ALLOWED_EXTENSIONS.has(extensionName)) {
        result.errors.push({ code: 'UNSUPPORTED_FILE', path, message: `Unsupported package file type: .${extensionName || '(none)'}` });
      }

      const metadata = (entry as any)._data;
      const compressedSize = Number(metadata?.compressedSize || 0);
      const uncompressedSize = Number(metadata?.uncompressedSize || 0);
      if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
        result.errors.push({ code: 'COMPRESSION_RATIO', path, message: `File exceeds the ${MAX_COMPRESSION_RATIO}:1 compression-ratio limit` });
      }
    }

    let totalBytes = 0;
    for (const [path, entry] of paths) {
      let contents = await entry.async('nodebuffer');
      totalBytes += contents.length;
      if (totalBytes > MAX_EXTRACTED_BYTES) {
        result.errors.push({ code: 'EXTRACTED_SIZE', message: 'Package exceeds the 10MB extracted-size limit' });
        break;
      }
      const mimeType = detectMime(path, contents);
      if (!mimeType) {
        result.errors.push({ code: 'MIME_SIGNATURE', path, message: 'File content does not match its approved extension' });
        continue;
      }
      if (mimeType === 'text/css') {
        const css = contents.toString('utf8');
        if (/@import\b|expression\s*\(|javascript\s*:/i.test(css) || /url\(\s*['"]?(?:https?:)?\/\//i.test(css)) {
          result.errors.push({ code: 'UNSAFE_CSS', path, message: 'CSS imports, expressions, JavaScript URLs, and external asset URLs are not allowed' });
          continue;
        }
        if (extension.runtimeType === 'THEME') {
          const scoped = scopeThemeCss(css);
          if (!scoped.css) {
            result.errors.push({ code: 'UNAPPROVED_CSS', path, message: scoped.error || 'Theme CSS is not approved' });
            continue;
          }
          contents = Buffer.from(scoped.css, 'utf8');
        }
      }
      if (mimeType === 'text/markdown' && /<\s*script\b|javascript\s*:|onerror\s*=/i.test(contents.toString('utf8'))) {
        result.errors.push({ code: 'UNSAFE_MARKDOWN', path, message: 'README contains unsafe script or event-handler content' });
        continue;
      }
      result.files.push({ path, size: contents.length, checksum: createHash('sha256').update(contents).digest('hex'), mimeType, contents });
    }

    const manifestName = extension.runtimeType === 'THEME' ? 'theme.json' : 'extension.json';
    const manifestMatches = [...paths.entries()].filter(([path]) => path.split('/').pop() === manifestName);
    if (manifestMatches.length !== 1) {
      result.errors.push({ code: 'MANIFEST_COUNT', message: `Package must contain exactly one ${manifestName}` });
    } else {
      const [manifestPath, manifestEntry] = manifestMatches[0];
      try {
        const manifest = JSON.parse(await manifestEntry.async('text'));
        result.manifest = manifest;
        this.validateManifest(manifest, manifestPath, extension, expectedVersion, result);
        if (Array.isArray(manifest.assets)) {
          for (const declaredPath of manifest.assets) {
            if (typeof declaredPath !== 'string' || !paths.has(declaredPath.replace(/\\/g, '/').toLowerCase())) {
              result.errors.push({ code: 'MISSING_DECLARED_ASSET', path: manifestPath, message: `Declared asset is missing: ${String(declaredPath)}` });
            }
          }
        }
      } catch {
        result.errors.push({ code: 'INVALID_MANIFEST_JSON', path: manifestPath, message: `${manifestName} is not valid JSON` });
      }
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  private validateManifest(manifest: Record<string, any>, path: string, extension: { key: string; runtimeType: string }, expectedVersion: string, result: PackageValidationResult) {
    const error = (code: string, message: string) => result.errors.push({ code, path, message });
    if (manifest.schemaVersion !== 1) error('MANIFEST_SCHEMA', 'schemaVersion must be 1');
    if (manifest.key !== extension.key) error('MANIFEST_KEY', `Manifest key must match ${extension.key}`);
    if (!VERSION_PATTERN.test(manifest.version || '') || manifest.version !== expectedVersion) error('MANIFEST_VERSION', `Manifest version must match ${expectedVersion}`);
    if (manifest.runtimeType !== extension.runtimeType) error('MANIFEST_RUNTIME', `Manifest runtimeType must match ${extension.runtimeType}`);
    if (typeof manifest.name !== 'string' || !manifest.name.trim()) error('MANIFEST_NAME', 'Manifest name is required');

    if (extension.runtimeType === 'THEME') {
      const allowedKeys = new Set(['schemaVersion', 'key', 'name', 'version', 'runtimeType', 'mode', 'tokens', 'assets']);
      for (const key of Object.keys(manifest)) {
        if (!allowedKeys.has(key) && !key.startsWith('x-')) error('UNKNOWN_MANIFEST_PROPERTY', `Unknown theme manifest property: ${key}`);
      }
      if (result.files.filter((file) => file.path.split('/').pop() === 'style.css').length !== 1) error('THEME_STYLESHEET', 'Theme package requires exactly one style.css');
      const tokens = manifest.tokens;
      if (!tokens || typeof tokens !== 'object') return error('THEME_TOKENS', 'Theme manifest requires a tokens object');
      if (manifest.mode !== 'light' && manifest.mode !== 'dark') error('THEME_MODE', "Theme mode must be 'light' or 'dark'");
      if (!HEX_PATTERN.test(tokens.primaryColor || '')) error('THEME_PRIMARY', 'tokens.primaryColor must be a six-digit hex color');
      if (!HEX_PATTERN.test(tokens.secondaryColor || '')) error('THEME_SECONDARY', 'tokens.secondaryColor must be a six-digit hex color');
      if (!THEME_FONTS.includes(tokens.font)) error('THEME_FONT', `tokens.font must be one of ${THEME_FONTS.join(', ')}`);
      if (!THEME_RADII.includes(tokens.radius)) error('THEME_RADIUS', `tokens.radius must be one of ${THEME_RADII.join(', ')}`);
      if (tokens.spacing !== undefined && !THEME_SPACING.includes(tokens.spacing)) error('THEME_SPACING', `tokens.spacing must be one of ${THEME_SPACING.join(', ')}`);
      if (tokens.shadow !== undefined && !THEME_SHADOWS.includes(tokens.shadow)) error('THEME_SHADOW', `tokens.shadow must be one of ${THEME_SHADOWS.join(', ')}`);
      if (tokens.surface !== undefined && !THEME_SURFACES.includes(tokens.surface)) error('THEME_SURFACE', `tokens.surface must be one of ${THEME_SURFACES.join(', ')}`);
    }

    if (extension.runtimeType === 'DECLARATIVE_MODULE' && !Array.isArray(manifest.permissions)) {
      error('MODULE_PERMISSIONS', 'Declarative module manifest requires a permissions array');
    }
    if (extension.runtimeType === 'DECLARATIVE_MODULE') {
      const allowedKeys = new Set(['schemaVersion', 'key', 'name', 'version', 'runtimeType', 'permissions', 'navigation', 'pages', 'resources', 'assets', 'dependencies', 'conflicts', 'migrations', 'defaultLocale', 'translations']);
      for (const key of Object.keys(manifest)) {
        if (!allowedKeys.has(key) && !key.startsWith('x-')) error('UNKNOWN_MANIFEST_PROPERTY', `Unknown module manifest property: ${key}`);
      }
      if (!Array.isArray(manifest.navigation)) error('MODULE_NAVIGATION', 'Declarative module requires a navigation array');
      if (!Array.isArray(manifest.pages) || !manifest.pages.length) error('MODULE_PAGES', 'Declarative module requires at least one page');
      if (!manifest.resources || typeof manifest.resources !== 'object' || Array.isArray(manifest.resources)) error('MODULE_RESOURCES', 'Declarative module requires a resources object');
      const pageKeys = new Set((manifest.pages || []).map((page: any) => page?.key).filter(Boolean));
      for (const item of manifest.navigation || []) {
        if (!item || typeof item.label !== 'string' || !pageKeys.has(item.pageKey) || !Array.isArray(item.roles) || item.roles.some((role: string) => !MODULE_ROLES.has(role))) error('MODULE_NAV_ITEM', 'Each navigation item requires label, valid pageKey, and approved roles');
      }
      for (const page of manifest.pages || []) {
        if (!page || typeof page !== 'object') {
          error('MODULE_PAGE', 'Each page must be an object');
          continue;
        }
        if (!page?.key || !page?.title || !page?.resource || !Array.isArray(page.roles) || page.roles.some((role: string) => !MODULE_ROLES.has(role)) || !Array.isArray(page.fields)) {
          error('MODULE_PAGE', 'Each page requires key, title, resource, roles, and fields');
        }
        if (!manifest.resources?.[page.resource]) error('MODULE_PAGE_RESOURCE', `Page ${page.key} references an undeclared resource`);
        for (const field of page.fields || []) {
          if (!field?.key || !field?.label || !['text', 'number', 'date', 'boolean'].includes(field?.type)) error('MODULE_FIELD', `Page ${page.key} contains an invalid field`);
        }
        for (const component of page.components || []) {
          if (!component || !MODULE_COMPONENTS.has(component.type)) {
            error('MODULE_COMPONENT', `Page ${page.key} uses an unapproved component`);
            continue;
          }
          if (component.type === 'stats' && (!Array.isArray(component.metrics) || component.metrics.some((metric: any) => !metric?.key || !metric?.label || !['count', 'sum', 'average'].includes(metric.aggregate) || (metric.aggregate !== 'count' && !page.fields.some((field: any) => field.key === metric.field && field.type === 'number'))))) error('MODULE_STATS', `Page ${page.key} has invalid stats metrics`);
          if (component.type === 'form' && component.actions?.some((action: string) => !['create', 'update'].includes(action))) error('MODULE_FORM', `Page ${page.key} has invalid form actions`);
          if (component.type === 'table' && component.columns?.some((key: string) => !page.fields.some((field: any) => field.key === key))) error('MODULE_COLUMNS', `Page ${page.key} references an unknown column`);
          if (component.type === 'details' && component.fields?.some((key: string) => !page.fields.some((field: any) => field.key === key))) error('MODULE_DETAILS', `Page ${page.key} references an unknown detail field`);
          if (component.type === 'table' && component.actions?.some((action: string) => !['view', 'edit', 'delete'].includes(action))) error('MODULE_TABLE', `Page ${page.key} has invalid table actions`);
          if (component.type === 'chart' && (!page.fields.some((field: any) => field.key === component.categoryField) || !page.fields.some((field: any) => field.key === component.valueField && field.type === 'number') || (component.aggregate && !['sum', 'average'].includes(component.aggregate)))) error('MODULE_CHART', `Page ${page.key} has an invalid chart definition`);
        }
      }
      if (manifest.defaultLocale !== undefined && !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(manifest.defaultLocale)) error('MODULE_LOCALE', 'defaultLocale must use a locale such as en or km');
      if (manifest.translations !== undefined) {
        if (!manifest.translations || typeof manifest.translations !== 'object' || Array.isArray(manifest.translations)) error('MODULE_TRANSLATIONS', 'translations must be a locale dictionary');
        else {
          for (const [locale, messages] of Object.entries(manifest.translations)) {
            if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale) || !messages || typeof messages !== 'object' || Array.isArray(messages) || Object.values(messages as Record<string, unknown>).some((message) => typeof message !== 'string')) error('MODULE_TRANSLATIONS', `Invalid translations for ${locale}`);
          }
          if (manifest.defaultLocale && !manifest.translations[manifest.defaultLocale]) error('MODULE_TRANSLATION_FALLBACK', 'translations must include defaultLocale');
        }
      }
      for (const permission of manifest.permissions || []) {
        if (typeof permission !== 'string' || !/^[a-z][a-z0-9_-]*:(read|write)$/.test(permission)) error('MODULE_PERMISSION', `Invalid capability: ${String(permission)}`);
      }
      const dependencyKeys = new Set<string>();
      for (const dependency of manifest.dependencies || []) {
        if (!dependency || typeof dependency.key !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(dependency.key) || dependency.key === manifest.key || typeof dependency.optional !== 'boolean' || (dependency.versionRange !== undefined && !/^(?:>=|>)\d+\.\d+\.\d+(?:\s+(?:<=|<)\d+\.\d+\.\d+)?$/.test(dependency.versionRange))) {
          error('MODULE_DEPENDENCY', `Invalid dependency: ${JSON.stringify(dependency)}`);
          continue;
        }
        if (dependencyKeys.has(dependency.key)) error('MODULE_DEPENDENCY_DUPLICATE', `Duplicate dependency: ${dependency.key}`);
        dependencyKeys.add(dependency.key);
      }
      const conflictKeys = new Set<string>();
      for (const conflict of manifest.conflicts || []) {
        if (typeof conflict !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(conflict) || conflict === manifest.key || dependencyKeys.has(conflict)) error('MODULE_CONFLICT', `Invalid conflict: ${String(conflict)}`);
        if (conflictKeys.has(conflict)) error('MODULE_CONFLICT_DUPLICATE', `Duplicate conflict: ${conflict}`);
        conflictKeys.add(conflict);
      }
      for (const migration of manifest.migrations || []) {
        if (!migration || !VERSION_PATTERN.test(migration.fromVersion || '') || migration.toVersion !== expectedVersion || !Array.isArray(migration.operations) || !migration.operations.length) {
          error('MODULE_MIGRATION', 'Each migration requires a semantic fromVersion, the current toVersion, and operations');
          continue;
        }
        for (const operation of migration.operations) {
          const validResource = typeof operation?.resource === 'string' && /^[a-z][a-z0-9_-]*$/.test(operation.resource) && manifest.resources?.[operation.resource];
          const validField = typeof operation?.field === 'string' && /^[a-z][a-zA-Z0-9_]*$/.test(operation.field);
          const validRename = operation?.type === 'renameField' && /^[a-z][a-zA-Z0-9_]*$/.test(operation?.from || '') && /^[a-z][a-zA-Z0-9_]*$/.test(operation?.to || '') && operation.from !== operation.to;
          const validDefault = operation?.type === 'setDefault' && validField && Object.prototype.hasOwnProperty.call(operation, 'value');
          const validRemove = operation?.type === 'removeField' && validField;
          if (!validResource || (!validRename && !validDefault && !validRemove)) error('MODULE_MIGRATION_OPERATION', `Invalid migration operation: ${JSON.stringify(operation)}`);
        }
      }
    }
  }
}
