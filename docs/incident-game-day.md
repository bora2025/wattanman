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

Prepare the bounded record with `npm run game-day:evidence:prepare -- input.json payload.json`. Use safe procedure-step
identifiers rather than raw shell commands and never include tenant data or credentials. The incident commander and a
different observer sign the same payload with their own Ed25519 keys through `game-day:evidence:sign`; verify both
against the active reviewer registry with `game-day:evidence:verify`. The verifier requires all four responder roles,
staging-only execution, ordered timestamps, observed alerts, cleanup, RPO at or below 15 minutes, RTO at or below 60
minutes, and resolution of every critical or high finding.
