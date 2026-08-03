# Student Rewards

Wattaman's first declarative extension pilot. It adds role-filtered navigation and a schema-driven rewards page without shipping React, JavaScript, backend code, or SQL.

The package requests only `rewards:read` and `rewards:write` capabilities. All records are stored by Wattaman with the current request's tenant `schoolId`.
