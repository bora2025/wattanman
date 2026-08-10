# Architecture Governance

## Approved Reliability Targets

- Core monthly availability: 99.9%.
- Recovery point objective: 15 minutes.
- Recovery time objective: 60 minutes.
- Capacity baseline: 1,000 schools, 500,000 registered users, 10,000 normal concurrent users, and 1,000 sustained API requests per second.

These targets are accepted engineering baselines for architecture and load gates. Changes require an ADR with measured evidence.

## Accountable Roles

Until named staff assignments are maintained in the operations system, accountability belongs to these mandatory roles:

| Area | Accountable role |
| --- | --- |
| Platform and tenancy | Platform Engineering Owner |
| Marketplace governance | Marketplace Product Owner |
| Extension runtime | Runtime Engineering Owner |
| Infrastructure and database | Infrastructure Owner |
| Security and incident response | Security Owner |
| Reliability and capacity | Reliability Owner |

Every production release record must resolve these roles to named on-call people. A release is blocked when any role is unassigned.
