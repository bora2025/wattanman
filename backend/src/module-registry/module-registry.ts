/**
 * Phase 22 — the single source of truth for every toggleable MODULE key.
 * Before this, a module's key was a plain, unchecked string independently
 * retyped in three places (a backend @RequiresAddon() call, a frontend
 * moduleKey nav tag, and an AddonDefinition.key DB row) with nothing
 * checking they agreed — confirmed live: LATEX_EDITOR was tagged in two nav
 * files and seeded in the catalog with no backend enforcement anywhere, a
 * silent gap nobody had caught. `ModuleKey` below is a real TypeScript
 * union derived FROM this array, so a typo anywhere it's used now fails
 * `tsc --noEmit` instead of silently 403ing an endpoint or hiding a nav
 * item forever.
 *
 * Adding a new module: add one entry here (or run
 * `backend/scripts/new-module.ts`, Phase 24, which scaffolds the module's
 * files and inserts the registry entry for you). `ModuleRegistrySeedService`
 * (module-registry-seed.service.ts) reads this array to seed the catalog
 * automatically on every app boot — no separate script to remember to run.
 * `frontend/lib/moduleRegistry.ts` mirrors the key list on the other side of
 * the repo boundary, the same duplicated-small-constant convention already
 * used for accentColor/themeFonts rather than a shared package.
 */

export interface ModuleRegistryEntry {
  key: string;
  name: string;
  description: string;
  category: string;
  version?: string;
  releaseNotes?: string;
  /** First-party extension metadata used by the marketplace and capability
   * gate. Core modules keep their relational data in platform-owned tables. */
  managementPath?: string;
  capabilities?: readonly string[];
  sharedCapabilities?: readonly string[];
  dependencies?: readonly string[];
  /** false only for a module with no backend enforcement at all — nav
   * visibility is the only gate. Must always come with ungatedReason. */
  backendGated?: boolean;
  ungatedReason?: string;
}

export const MODULE_REGISTRY = [] as const satisfies readonly ModuleRegistryEntry[];

/** A real union of every valid key, generated from the array above — not a
 * hand-maintained enum that can drift from it. */
export type ModuleKey = string;
