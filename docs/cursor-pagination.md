# Cursor Pagination

Collection endpoints use opaque, URL-safe keyset cursors and bounded page
limits. The shared default is 50 and the hard maximum is 100. Invalid cursors
or limits return `400`; offset pagination is not used for growing operational
tables.

The platform school directory orders by
`createdAt DESC, id DESC`, applies the cursor as a strict keyset boundary, and
returns:

```json
{ "items": [], "nextCursor": null, "limit": 50 }
```

Search and status filters execute server-side and must be repeated unchanged
when following `nextCursor`. The platform UI resets the cursor when either
filter changes and exposes an explicit load-more action.

The platform extension catalog, platform installation queue, school extension
marketplace, and school installation manager also return bounded cursor pages.
Their existing dashboards consume pages through `apiCursorItems`, which follows
at most 100 pages and fails rather than looping indefinitely on a malformed
cursor response. Installation cursors use `updatedAt, id`; catalog cursors use
`createdAt, id`.

School users are ordered by `updatedAt, id`. Admin and public post feeds use a
compound `pinned, createdAt, id` cursor so pinned content remains first across
page boundaries rather than being reordered or duplicated. Existing school UI
consumers use the bounded cursor loader; the public homepage reads the first
published page only.

Remaining retained collection endpoints must adopt this same contract before
the platform-wide TODO can be marked complete. Rollback for an individual
endpoint restores its former array response and matching frontend consumer in
the same deployment.
