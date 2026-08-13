# Incident game-day

Run the technical rehearsal after every incident-control or runbook change:

```powershell
Set-Location backend
npm.cmd run build
npm.cmd run incident:rehearse
```

The command fails unless all six runbooks contain ownership, containment, recovery, and verification guidance, contain no obvious embedded connection/private-key material, and the live alert evaluator maps database, Redis, R2, no-worker queue, and API-SLO failure scenarios to critical pages. Its bounded JSON output is CI/release evidence and contains no tenant data.

At least quarterly, an incident commander, operations responder, communications owner, and observer run one scenario in a non-production environment using only the runbooks. Record scenario, participants, start/detection/containment/recovery times, expected and observed alerts, commands used, unsafe or missing instructions, RPO/RTO where applicable, and follow-up owners. Never inject faults into production.

Technical automation does not satisfy the human on-call gate. That gate closes only when named responders complete the quarterly exercise and attach the exercise record to the release evidence.
