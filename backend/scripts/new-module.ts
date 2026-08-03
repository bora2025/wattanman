/**
 * Phase 24 — local scaffolding tool for adding a new MODULE. Dev-only: never
 * run in production, never imported by the app itself (same category as the
 * one-off backfill/seed scripts under prisma/).
 *
 * What it does NOT do, on purpose: there is no "upload and run" path for
 * module code anywhere in this project, by design — a module is always
 * first-party code, written locally and shipped via git push, same as
 * everything else in this repo. This script only removes the *wiring*
 * toil (the boilerplate + the four scattered edits a new module used to
 * need by hand) — it doesn't change who authors a module or how it ships.
 *
 * Usage:
 *   npx ts-node scripts/new-module.ts --key=LIBRARY --name="Library" \
 *     --category=Academics --description="Book lending and catalog management."
 *
 * --category and --description are optional (sensible defaults below).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const BACKEND_ROOT = path.join(__dirname, '..');
const FRONTEND_ROOT = path.join(BACKEND_ROOT, '..', 'frontend');

interface Args {
  key: string;
  name: string;
  category: string;
  description: string;
}

function parseArgs(): Args {
  const raw: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) raw[match[1]] = match[2];
  }
  const key = (raw.key || '').trim().toUpperCase();
  const name = (raw.name || '').trim();
  if (!key || !name) {
    console.error('Usage: npx ts-node scripts/new-module.ts --key=LIBRARY --name="Library" [--category=Academics] [--description="..."]');
    process.exit(1);
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    console.error(`Invalid --key "${key}" — must start with a letter and contain only A-Z, 0-9, underscore (matches every existing MODULE_REGISTRY key).`);
    process.exit(1);
  }
  return {
    key,
    name,
    category: (raw.category || 'Tools').trim(),
    description: (raw.description || `${name}.`).trim(),
  };
}

function toPascalCase(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join('');
}

function toKebabCase(key: string): string {
  return key.toLowerCase().replace(/_/g, '-');
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------- file templates ----------

function moduleFileTemplate(pascal: string, kebab: string): string {
  return `import { Module } from '@nestjs/common';
import { ${pascal}Controller } from './${kebab}.controller';
import { ${pascal}Service } from './${kebab}.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [${pascal}Controller],
  providers: [${pascal}Service],
})
export class ${pascal}Module {}
`;
}

function controllerFileTemplate(pascal: string, kebab: string, key: string): string {
  return `import { Controller, Get, UseGuards } from '@nestjs/common';
import { ${pascal}Service } from './${kebab}.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequiresAddon } from '../school-addons/requires-addon.decorator';

// RequiresAddonGuard runs globally (see app.module.ts's APP_GUARD
// registration, Phase 22) — this decorator is the only gating needed here,
// no per-controller guard list required.
@Controller('${kebab}')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresAddon('${key}')
export class ${pascal}Controller {
  constructor(private ${lowerFirst(pascal)}Service: ${pascal}Service) {}

  @Roles('ADMIN')
  @Get()
  async getAll() {
    return this.${lowerFirst(pascal)}Service.getAll();
  }
}
`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function serviceFileTemplate(pascal: string): string {
  return `import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ${pascal}Service {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    // Stub — replace with real logic. PrismaService auto-scopes every
    // query to the current tenant (see tenancy/prisma.service.ts), so a
    // plain findMany() here is already tenant-safe with no extra work.
    return [];
  }
}
`;
}

function pageFileTemplate(pascal: string, name: string, kebab: string): string {
  return `'use client'

import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { useAccentColor } from '../../../lib/appearance/accentColor'

export default function ${pascal}Page() {
  const { accentColor } = useAccentColor()

  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <div className="page-shell">
        <Sidebar title="Admin" navItems={adminNav} accentColor={accentColor} />
        <div className="page-content">
          <div className="h-14 lg:hidden" />
          <div className="page-header">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">${name}</h1>
          </div>
          <div className="page-body">
            {/* Stub — replace with the real ${kebab} UI. */}
            <div className="empty-state py-10">
              <p className="text-sm text-slate-500 dark:text-slate-400">${name} — nothing here yet.</p>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
`;
}

// ---------- anchor-based insertions ----------
// Each of these anchors on one unique, stable string already in the target
// file and inserts exactly one new line next to it — never a full-file
// rewrite or regex pass over the whole document. A real incident earlier
// this project (an external tool corrupted app.module.ts mid-edit) is
// exactly the failure mode this is written to avoid.

function insertBeforeAnchor(filePath: string, anchor: string, newLine: string, label: string): void {
  const content = fs.readFileSync(filePath, 'utf8');
  // Some files in this repo (app.module.ts, confirmed live) are CRLF —
  // found by this script's own first test run failing on an anchor that
  // matched fine in the editor but not via a plain LF indexOf. Match
  // either line-ending style rather than assuming one.
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n');
  const match = new RegExp(escaped).exec(content);
  if (!match) {
    throw new Error(`Could not find the expected anchor for ${label} in ${filePath} — the file may have changed shape. Aborting rather than guessing.`);
  }
  const idx = match.index;
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const bareLfCount = (content.match(/[^\r]\n/g) || []).length;
  const insertedLine = crlfCount > bareLfCount ? newLine.replace(/\n/g, '\r\n') : newLine;
  const updated = content.slice(0, idx) + insertedLine + content.slice(idx);
  fs.writeFileSync(filePath, updated);
}

async function main() {
  const { key, name, category, description } = parseArgs();
  const pascal = toPascalCase(key);
  const kebab = toKebabCase(key);

  const backendModuleDir = path.join(BACKEND_ROOT, 'src', kebab);
  const frontendPageDir = path.join(FRONTEND_ROOT, 'app', 'admin', kebab);
  const registryPath = path.join(BACKEND_ROOT, 'src', 'module-registry', 'module-registry.ts');
  const frontendRegistryPath = path.join(FRONTEND_ROOT, 'lib', 'moduleRegistry.ts');
  const appModulePath = path.join(BACKEND_ROOT, 'src', 'app.module.ts');

  if (fs.existsSync(backendModuleDir)) {
    console.error(`${backendModuleDir} already exists — pick a different --key or remove it first.`);
    process.exit(1);
  }
  const registryContent = fs.readFileSync(registryPath, 'utf8');
  if (registryContent.includes(`key: '${key}'`)) {
    console.error(`"${key}" is already in MODULE_REGISTRY — pick a different key.`);
    process.exit(1);
  }

  console.log('\nAbout to create:');
  console.log(`  backend/src/${kebab}/${kebab}.module.ts`);
  console.log(`  backend/src/${kebab}/${kebab}.controller.ts`);
  console.log(`  backend/src/${kebab}/${kebab}.service.ts`);
  console.log(`  frontend/app/admin/${kebab}/page.tsx`);
  console.log('\nAnd insert one line into each of:');
  console.log('  backend/src/module-registry/module-registry.ts (MODULE_REGISTRY)');
  console.log('  frontend/lib/moduleRegistry.ts (MODULE_KEYS)');
  console.log('  backend/src/app.module.ts (import + imports array)');
  console.log(`\nkey=${key}  name="${name}"  category="${category}"  description="${description}"\n`);

  const ok = await confirm('Proceed?');
  if (!ok) {
    console.log('Cancelled — nothing written.');
    return;
  }

  fs.mkdirSync(backendModuleDir, { recursive: true });
  fs.writeFileSync(path.join(backendModuleDir, `${kebab}.module.ts`), moduleFileTemplate(pascal, kebab));
  fs.writeFileSync(path.join(backendModuleDir, `${kebab}.controller.ts`), controllerFileTemplate(pascal, kebab, key));
  fs.writeFileSync(path.join(backendModuleDir, `${kebab}.service.ts`), serviceFileTemplate(pascal));

  fs.mkdirSync(frontendPageDir, { recursive: true });
  fs.writeFileSync(path.join(frontendPageDir, 'page.tsx'), pageFileTemplate(pascal, name, kebab));

  const escapedDescription = description.replace(/'/g, "\\'");
  const escapedName = name.replace(/'/g, "\\'");
  insertBeforeAnchor(
    registryPath,
    '] as const satisfies readonly ModuleRegistryEntry[];',
    `  { key: '${key}', name: '${escapedName}', description: '${escapedDescription}', category: '${category}' },\n`,
    'MODULE_REGISTRY entry',
  );

  insertBeforeAnchor(
    frontendRegistryPath,
    '] as const;',
    `  '${key}',\n`,
    'MODULE_KEYS entry',
  );

  // Anchors below deliberately start with real, visible text — never a bare
  // leading \n. A bare leading \n's match position lands wherever that
  // newline byte happens to be, which is only safe to insert-before when
  // there's a buffering blank line already there (there was for @Module(,
  // there wasn't for the imports array's closing bracket) — found live by
  // this script's own second test run corrupting app.module.ts's imports
  // array. Anchoring on the visible line content itself sidesteps the
  // ambiguity entirely: the match always starts exactly where the new line
  // should be inserted, regardless of what precedes it.
  insertBeforeAnchor(
    appModulePath,
    '@Module({',
    `import { ${pascal}Module } from './${kebab}/${kebab}.module';\n`,
    'app.module.ts import',
  );
  insertBeforeAnchor(
    appModulePath,
    '  ],\n  controllers: [AppController],',
    `    ${pascal}Module,\n`,
    'app.module.ts imports array entry',
  );

  console.log('\nDone. Remaining manual steps (product decisions, not wiring):');
  console.log(`  1. Tag the relevant lib/*-nav.ts entries with moduleKey: '${key}' so it shows in the sidebar.`);
  console.log(`  2. Write the real logic in ${kebab}.controller.ts / ${kebab}.service.ts / app/admin/${kebab}/page.tsx.`);
  console.log('  3. The catalog row is created automatically on next boot (module-registry-seed.service.ts) — no manual seed step.');
  console.log('  4. Run tsc --noEmit / nest build / next build, then commit and push as usual.\n');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
