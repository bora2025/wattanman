# School Bus Operations

Installable Wattaman declarative module for school transport administration.

## Included workflows

- Fleet and driver register
- Routes and route performance
- Ordered stops with coordinates and pickup/drop-off times
- Student rider and guardian handoff records
- Weekly route schedules

All records are stored by Wattaman's extension runtime and scoped to the installing school. Administrators and employees can manage transport records; teachers receive read access to schedules.

## Current platform boundary

Declarative extension schema v1 does not permit executable JavaScript, custom React components, WebSockets, background GPS ingestion, or access to core student/user tables. Therefore this release does not provide a live moving map or relational student dropdowns. Those features require future approved platform capabilities or an isolated code-extension runtime.

## Upload values

- Key: `SCHOOL_BUS`
- Name: `School Bus Operations`
- Runtime: `Declarative module`
- Commercial type: `Module`
- Version: `1.0.0`
- Platform range: `>=1.0.0 <2.0.0`
