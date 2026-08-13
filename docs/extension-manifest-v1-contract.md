# Extension Manifest V1 Contract

**Status:** Frozen  
**Effective:** 2026-08-13  
**Schemas:** `backend/src/platform/schemas/extension-manifest-v1.schema.json` and `backend/src/platform/schemas/theme-manifest-v1.schema.json`

## Versioning and compatibility

- `schemaVersion: 1` selects this contract. A package using another value fails validation.
- Published package versions are immutable semantic versions. Package replacement under an existing version is forbidden.
- Platform compatibility is declared separately on each release with a bounded comparator range such as `>=1.0.0 <2.0.0`.
- Additive platform behavior may ship without changing manifest v1 only when every existing valid manifest retains the same meaning.
- A new required property, removed property, narrowed accepted value, changed default, changed permission meaning, or changed data semantics requires manifest v2.
- The frozen schema files are protected by SHA-256 contract tests. Their bytes cannot change silently; future contract work must add new schema files and validators.
- Manifest v1 remains accepted for at least 24 months after a successor becomes generally available. Deprecation is announced at least 180 days before rejection. Emergency security blocking may be immediate and is audited.
- `x-` properties are publisher metadata only. The runtime ignores them and they cannot grant behavior or capability.

## Declarative module identity

Required top-level properties are `schemaVersion`, `key`, `name`, `version`, `runtimeType`, `permissions`, `navigation`, `pages`, and `resources`.

- `key` is a stable uppercase identifier and cannot be reassigned.
- `runtimeType` is exactly `DECLARATIVE_MODULE`.
- `permissions` contains explicit `<resource>:read` or `<resource>:write` capabilities. Missing capability means deny.
- `dependencies` identify exact extension keys, optionality, and an optional semantic range. Self-dependencies, duplicate dependencies, cycles, and dependency/conflict overlap are rejected.
- `conflicts` lists extension keys that cannot be active together.
- `assets` must resolve to approved files inside the same package.
- `migrations` contain only approved declarative operations targeting declared resources and the package's current version.

## Navigation and pages

- Navigation entries require a literal fallback `label`, a valid `pageKey`, and at least one approved role.
- `pageKey` must reference a page in the same manifest. Navigation never accepts an arbitrary URL.
- Pages require a stable key, literal fallback title, declared resource, approved roles, and field list.
- `labelKey` and `titleKey` may select translated text; literal labels remain mandatory fallback content.
- `ariaLabel` provides an accessible page name when the visible title is insufficient.
- Role lists are visibility hints plus server-enforced authorization inputs; the browser is never the authorization boundary.

## Components and actions

The v1 registry is closed: `stats`, `form`, `table`, `details`, and `chart`.

- Unknown component types and unknown properties fail validation.
- `stats` accepts bounded metrics using `count`, `sum`, or `average`; numeric aggregates must reference numeric fields.
- `form` actions are `create` and `update` only.
- `table` actions are `view`, `edit`, and `delete` only; columns must reference declared fields.
- `details` fields must reference declared fields.
- `chart` category/value fields must exist, the value must be numeric, and aggregation is `sum` or `average`.
- Actions map to capability-checked API operations. A rendered control never grants permission by itself.

## Fields and validation

- Field keys are stable resource-local identifiers.
- V1 field types are `text`, `number`, `date`, and `boolean`.
- `required: true` rejects absent or null values.
- Unknown input fields are rejected. Values must match the declared type; date values must parse as dates.
- Schema changes use a new package version and, when stored data changes, an explicit declarative migration.

## Locale and accessibility

- `defaultLocale` uses `ll` or `ll-RR` form and must exist in `translations` when translations are provided.
- Resolution order is requested locale, default locale, then the required literal label/title.
- Translation values are plain text, not HTML.
- Every input is associated with its field label; pages and component regions expose accessible names.
- Runtime tables use captions, column headers, and keyboard-native buttons and form controls.
- Extensions cannot remove focus visibility, inject script, provide arbitrary HTML, or introduce unapproved global CSS.
- Publishers must test supported pages at mobile, tablet, and desktop widths and with keyboard-only navigation before review approval.

## Extension-owned records

- A resource key is local to one extension. Pages may reference only resources declared by that extension.
- Every stored record is owned by exactly one `schoolId`, `extensionId`, `versionId`, installation, and resource key at the server boundary.
- Package code receives no database access. Records are read and mutated only through the capability gateway.
- Record data is a JSON object validated against the declared page/resource fields. Unknown fields and wrong types fail closed.
- Platform metadata (`id`, tenant/extension identity, byte size, timestamps, schema version, and concurrency version) is server-owned and cannot be supplied by a manifest action.
- Queries are bounded and cursor-paginated. Storage and record quotas apply per school and extension.
- Upgrade migrations create backups before mutation. Uninstall retains data for the configured grace period; purge removes records and emits signed evidence.

## Theme manifest

Required properties are `schemaVersion`, `key`, `name`, `version`, `runtimeType`, `mode`, and `tokens`.

- `runtimeType` is exactly `THEME`; `mode` is `light` or `dark`.
- Required tokens are primary/secondary six-digit colors, an approved font, and an approved radius.
- Optional spacing, shadow, and surface tokens use closed enums.
- Theme v1 is standalone and has no parent inheritance.
- CSS is optional, limited to approved selectors/declarations, rewritten under `.wattaman-theme`, and cannot import or fetch external assets.
- Theme assets use the same package path, MIME, size, checksum, quarantine, review, and signing controls as modules.

## Deprecation workflow

1. Publish a successor contract and migration guide.
2. Keep validation and runtime support for v1 during the support window.
3. Warn publishers and platform operators before the announced deadline.
4. Prevent new v1 publication only after the deadline; existing signed releases remain installable only while policy permits.
5. Block immediately only for a documented security issue, preserve audit evidence, and provide rollback or replacement guidance.
