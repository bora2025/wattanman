# Pilot extensions

Wattaman maintains two reference packages for the declarative runtime:

- `STUDENT_REWARDS` is the complete business-extension pilot. It declares role-filtered navigation, accessible stats, form, chart, table, and detail components, tenant-owned records, typed fields, translations, and only `rewards:read` and `rewards:write` capabilities.
- `AURORA_KHMER` is the complete theme pilot. It declares bounded appearance tokens and scoped CSS for public and authenticated school surfaces without JavaScript or replacement markup.

The distributable ZIP is the release artifact. Rebuild it whenever a source manifest, stylesheet, or README changes, then validate the ZIP rather than only validating the source directory.

```powershell
Compress-Archive -Path examples/extension-packages/student-rewards/* -DestinationPath examples/extension-packages/student-rewards.zip -Force
npm.cmd --prefix backend run extension:validate -- ../examples/extension-packages/student-rewards.zip STUDENT_REWARDS DECLARATIVE_MODULE 1.0.0
npm.cmd --prefix backend run extension:validate -- ../examples/theme-packages/aurora-khmer-versioned/aurora-khmer-versioned.zip AURORA_KHMER THEME 1.0.2
```

## Lifecycle acceptance

Before promoting a pilot release, verify:

1. Upload, validate, review, publish, request, approve, install, and activate.
2. Disable removes runtime navigation and access without deleting records.
3. Upgrade applies declared data or theme changes and preserves school-owned overrides.
4. Rollback restores the prior package and reversible data state.
5. Uninstall disables the package and starts the configured purge grace period.
6. Re-requesting an uninstalled package creates a clean request on the retained installation history.
7. Purge deletes extension records and installation history, reconciles quota counters, and records a purge report.
8. A second extension with overlapping labels remains namespaced by extension and page keys; capabilities remain scoped to the owning manifest.

Rollback an unhealthy pilot to its previous published version. If the problem affects core administration, activate the narrowest emergency control and follow `docs/extension-incident-runbook.md`.
