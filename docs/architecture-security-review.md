# Architecture and security review evidence

The Stage 0 review gate requires two independent people: one trusted `ARCHITECTURE_OWNER` and one trusted `SECURITY_OWNER`. Approval is bound to the current Git commit and SHA-256 hashes of the six ADRs, architecture governance, data retention, extension threat model, roadmap, TODO, and root architecture documentation.

1. Copy `docs/architecture-review-input.example.json`, record reviewed residual risks, confirm there are no open critical or high findings, and set the actual review time.
2. From `backend`, prepare the immutable payload:

```powershell
npm.cmd run build
npm.cmd run architecture:review:prepare -- ..\evidence\review-input.json ..\evidence\review-payload.json
```

3. Each reviewer independently signs on a trusted workstation with a separate Ed25519 key. Never exchange private keys:

```powershell
$env:ARCHITECTURE_REVIEW_PRIVATE_KEY_PEM = Get-Content .\reviewer-private.pem -Raw
npm.cmd run architecture:review:sign -- ..\evidence\review-payload.json reviewer-id ARCHITECTURE_OWNER ..\evidence\architecture-approval.json
Remove-Item Env:ARCHITECTURE_REVIEW_PRIVATE_KEY_PEM
```

The security owner repeats the command with `SECURITY_OWNER`. Combine the unchanged payload and both approval objects into:

```json
{ "payload": {}, "approvals": [{}, {}] }
```

4. Verify against a trusted reviewer registry maintained outside the application repository:

```powershell
npm.cmd run architecture:review:verify -- ..\evidence\review-document.json ..\protected\architecture-reviewers.json
```

Verification fails for stale commits, changed artifacts, review dates older than 30 days, open critical/high findings, inactive or role-mismatched reviewers, duplicate identities, invalid signature times, and altered signatures. Archive the document, verifier output, reviewer registry version, and residual-risk tickets. Keep the TODO gate open until the two real reviewers approve and verification passes.
