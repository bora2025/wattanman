# Controlled rollout evidence

Stage 7 is an operational release, not a code deployment. The verifier requires ordered production cohorts of internal,
10, 50, 250, 500, and 1,000 schools. Every non-internal cohort must remain stable for at least seven full days before
the next cohort starts. Each wave must have approved SLO, support, security, cost, and rollback-readiness reviews, zero
tenant-isolation failures, zero critical incidents, and an auditable change ticket.

After the 1,000-school hold, publish HTTPS operating-limit and support-procedure documents. Prepare evidence with
`npm run rollout:evidence:prepare -- input.json payload.json`, then obtain independent Ed25519 signatures from the
product, reliability, and security owners using `ROLLOUT_EVIDENCE_PRIVATE_KEY_PEM`. Combine the payload and approvals
and run `npm run rollout:evidence:verify -- document.json trusted-reviewers.json`.

Do not store school names, user data, credentials, private keys, support tickets, or incident contents in the evidence.
The Stage 7 TODO items remain open until actual production wave evidence verifies.
