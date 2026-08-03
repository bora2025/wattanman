# Student Rewards

Wattaman's first declarative extension pilot. It adds role-filtered navigation and a schema-driven rewards page without shipping React, JavaScript, backend code, or SQL.

The package requests only `rewards:read` and `rewards:write` capabilities. All records are stored by Wattaman with the current request's tenant `schoolId`.

Validate the generated package locally from `backend`:

```bash
npm run extension:validate -- ../examples/extension-packages/student-rewards.zip STUDENT_REWARDS DECLARATIVE_MODULE 1.0.0
```
