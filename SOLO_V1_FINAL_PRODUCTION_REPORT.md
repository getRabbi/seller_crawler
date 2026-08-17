# Seller Intelligence Solo Mode v1 — Final Production Report

> Historical Solo launch checkpoint. The later explicitly approved Amazon and
> dashboard operator-control extension supersedes its statements that Amazon,
> operator crawling, and public-source keyword discovery must remain disabled.
> See `AMAZON_OPERATOR_WORKFLOW_FINAL_REPORT.md` for the current acceptance and
> deployment state once that workflow is promoted.

Report date: 2026-08-17 (Asia/Dhaka)

## Executive verdict

Solo Mode v1 implementation and local/CI validation are complete. The final
immutable crawler artifact is commit
`a1268d6476f2e35925fda750be0378d40a98b18d`. That exact artifact is deployed to
the existing Scrapy Cloud Student project. The staging Worker and dashboard
remain on the previously accepted application artifact because the final
changes affect only the crawler runner and spider.

Staging infrastructure, one-unit Scrapy Cloud deployment, no-network smoke,
completion/cancel paths, bounded root-seed crawling, signed ingestion, v5
encrypted persistence, entity-resolution review creation, spool replay,
cooldown enforcement, and disposable four-D1 restore have passed. Scrapy Cloud
custom project settings are no longer required; every verification job uses the
official `run.json` `job_settings` mechanism with values read from the approved
local secret environment.

Solo Mode v1 is **not yet fully production-ready** because one external
acceptance gate still requires operator-side authenticated UI state:

1. Complete a Cloudflare Access login as the configured single allowed
   operator so the authenticated dashboard/API/reveal/duplicate-action suite can
   be exercised remotely.
Production provisioning and the final production crawl have not been started
because authenticated staging acceptance must be green first.

## Final commit SHA

- Immutable crawler release-candidate SHA:
  `a1268d6476f2e35925fda750be0378d40a98b18d`
- Branch: `main`
- Remote branch at the same SHA before this report-only update: `origin/main`
- Scrapy Cloud deploy version matches the immutable SHA exactly.

## GitHub CI status

Both required workflows passed for the immutable implementation SHA:

| Workflow | Run ID | Result |
| --- | ---: | --- |
| CI Python | 32000661657 | success |
| CI Web | 32000661661 | success |

No production deployment was attempted before these checks became green.

## Launch-critical fixes completed

- The full `crawler/sellerintel/spool` package is tracked by Git.
- Spool replay sends the same explicit crawler User-Agent and signed ingestion
  headers as normal ingestion.
- Contacts use versioned AES-256-GCM authenticated encryption with contextual
  AAD. The keyring remains backend-only; default API/dashboard/CSV responses are
  masked, and reveal requires the single authenticated operator, an exact
  Origin, and an audit reason.
- Entity resolution is wired into ingestion. Deterministic scoring, persisted
  decisions, review records, idempotent merge/keep-separate/ignore, audit trail,
  link mapping, and rollback are implemented and tested.
- HTTP 429 handling stops the domain, honors `Retry-After`, persists cooldown,
  and prevents a new run until the cooldown expires.
- npm scripts are Linux-compatible and contain no nested `npm.cmd` calls.
- `.env.example` is restored, sanitized, current, and dangerous flags default
  off.
- Official-source defaults are correct: official website enabled; business
  registry, Amazon, Alibaba, 1688, search discovery, Zyte API, paid services,
  AI summaries, and outreach disabled.
- Stale launch documentation was updated without adding deferred features.
- Scrapy Cloud jobs receive the ingestion endpoint/HMAC, cooldown endpoint, and
  encryption keyring/version through per-job `run.json` settings. Credentials
  and keyrings are excluded from repr, CLI output, items, and crawler logs.
- The conflicting built-in Scrapy depth counter is disabled for this spider;
  deterministic page budget, logical depth, same-domain, and robots controls
  remain authoritative after sitemap and redirect responses.

## Local validation results

| Check | Result |
| --- | --- |
| `uv run ruff check crawler` | pass |
| `uv run mypy crawler/sellerintel crawler/tests` | pass, 92 files |
| `uv run pytest crawler/tests` | pass, 113 tests |
| extractor coverage command | pass, 5 tests, 95.36% |
| `uv run bandit -r crawler/sellerintel` | pass, 0 issues |
| `uv run pip-audit` | pass, no known vulnerabilities |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test` | pass, 43 tests |
| `npm run health:worker` | pass, 5 tests |
| `npm run audit:prod` | pass, 0 production vulnerabilities |
| `npm run build` | pass, static dashboard export |
| targeted encryption/spool/429/entity tests | pass, 16 tests |
| targeted Worker entity/cooldown/dashboard/ingest tests | pass, 29 tests |
| exact local runner command | pass, 8 pages, 4 contacts, no errors/blocks |
| Docker build | pass |
| Docker no-network fixture run | pass, 8 pages, 4 contacts, no errors |

## Clean-clone results

A Git-only checkout was created during launch remediation. From that checkout:

- Python dependency sync passed.
- All then-current Python tests passed.
- Ruff passed.
- `npm ci` passed.
- Web lint, typecheck, all 43 tests, and static build passed.
- Production npm audit is clean.
- The temporary checkout was removed after verification.

The crawler Docker image also built successfully from the Git-controlled
context. The final SHA subsequently passed both clean GitHub workflows with all
113 Python tests and the full web build. No required source is ignored, and
generated runtime/build/backup artifacts remain ignored.

## Staging verification results

### Cloudflare Worker and dashboard

- Worker project: `seller-intelligence-api-staging`
- Worker route: `api-stg.scalemyprints.com/*`
- Code deployment version: `fe699a02-7a57-4880-8dc1-8be4f38872b6`
- Current version after secret-only updates:
  `4577d2d0-0a74-465d-baf7-9c924a08a60a`
- Pages project: `seller-intelligence-staging`
- Pages deployment: `4bfc2370-bbdc-4cc6-b3ef-70002a849414`
- Pages deployment URL:
  `https://4bfc2370.seller-intelligence-staging.pages.dev`
- Pages source metadata points to commit `464888d`.
- Custom dashboard and API hostnames are protected by Cloudflare Access.
- Unauthenticated health and dashboard requests return Access redirects.
- Exact HMAC routes for ingestion and cooldown bypass Access and reject unsigned
  requests at the Worker.

### Access

- Single-operator allow policy matches the configured allowed email for the API,
  custom dashboard, Pages root, and Pages preview applications.
- Exact-path bypass applications exist only for signed ingestion and signed
  cooldown authorization.
- Required Worker secrets exist by name: allowed operator email, ingestion HMAC,
  and contact encryption keyring.
- An authenticated browser session was not available to this execution
  environment, so the remote user-flow acceptance remains pending.

### Bounded staging ingestion

The final Scrapy Cloud verification used only
`https://seed-stg.scalemyprints.com/`, an eight-page budget, logical depth two,
same-domain enforcement, robots enforcement, one Student unit, no browser
profile/cookies, no provider fallback, no Zyte API, and no paid service.

Result: six receipt items accepted, four contacts across all four Solo v1
contact types, zero blocks, zero errors, zero spool, and no rejection. D1
recorded the final job as completed with six source batches and four verified
contacts. The final job used artifact
`a1268d6476f2e35925fda750be0378d40a98b18d`.

### Staging database observations

After the bounded crawl and the operator-approved staging encryption reset:

- All four current contact records use `staging-2026-08-v5`; no ciphertext uses
  another key version.
- Six superseded synthetic v4 rows were removed under a persisted retention
  audit before the Worker keyring changed.
- A real entity-resolution decision exists with action `review_queue`, score 75,
  and pending status.
- A corresponding `possible_duplicate_seller` review record exists.
- FTS contains a row for every current seller after ingestion/rebuild checks.

## Spool replay result

A transport failure was forced without changing the production code path. The
batch was written to the local spool, replayed to the staging Worker, accepted
with newly signed headers and the required crawler User-Agent, removed only
after acceptance, and the temporary spool directory was verified empty and
deleted.

Result: one attempted, one accepted, zero retained.

## 429/cooldown result

Without generating abusive traffic, a synthetic 90-second official-site
cooldown was ingested. The signed cooldown preflight denied the domain and
returned a persisted `blocked_until`; a clearing update was then ingested, and
the next signed preflight allowed the domain.

This remotely verifies persistence and pre-run enforcement. Deterministic unit
tests separately verify delta-seconds and HTTP-date `Retry-After` parsing and
that a real 429 stops further requests for that domain.

## Backup and restore result

- Current checksummed v5 staging backup manifest:
  `.sellerintel/backups/staging-20260817T061845Z/manifest.json`
- Four of four current SQL checksums passed. The contacts export contains four
  v5 ciphertexts and no keyring value.
- The earlier disposable restore acceptance used manifest
  `.sellerintel/backups/staging-20260816T204546Z/manifest.json`.
- Four of four SQL checksums verified before restore.
- Four uniquely named disposable D1 databases were created in the approved
  account.
- Core, contacts, operations, and history SQL exports restored successfully.
- Core secondary indexes were restored.
- Core FTS and its triggers were rebuilt from canonical data.
- Every canonical table count matched the corresponding staging source table.
- Cross-database contact/source/entity-resolution seller references resolved to
  restored core sellers.
- A representative FTS query returned results.
- All four disposable databases were deleted by exact ID and verified absent.

Result: **PASS**.

## Zyte one-unit smoke result

**PASS.** Manual custom project settings are no longer a dependency.

- Existing Scrapy Cloud project only; no new project or unit was created.
- Deployed version:
  `a1268d6476f2e35925fda750be0378d40a98b18d`.
- Deployment contains exactly the two Solo v1 spiders.
- `run.json` pins `units=1` and injects the endpoint/HMAC, cooldown endpoint,
  and contact encryption keyring/version from the approved local environment.
- No-network smoke job `871778/2/3` finished with one item reporting
  `network=none` and `units=1`; it had zero error logs and a clean secret scan.
- Cancel-path job `871778/2/4` finished with `close_reason=cancelled`.
- Final bounded root-seed job `871778/1/7` finished on the exact final SHA with
  six accepted receipts, no rejection/spool/error, and a clean secret scan.
- Exactly one unit remains the hard limit; Zyte API and paid services remained
  disabled throughout.

## Production resource status

Production resources were intentionally not created because staging has not
passed its authenticated operator and Zyte gates.

| Resource/check | Status |
| --- | --- |
| Four production D1 databases | not created |
| Production Worker | not created/deployed |
| Production Pages/dashboard | not created/deployed |
| Production Access | not configured |
| Production bindings/secrets | not configured |
| Production migrations | not applied |
| Production dashboard | not live |
| Production contact reveal | not tested |
| Production duplicate workflow | not tested |
| Final bounded production crawl | not run |

## Dashboard and API acceptance status

Implemented and locally/CI tested:

- health, sellers, seller detail, contacts, secure reveal, search, duplicate
  review/actions/rollback, crawl status, masked CSV, and dashboard API wiring.

Remotely proven without operator login:

- Pages deployment, Access redirect/protection, HMAC ingestion, cooldown route,
  D1 writes, encrypted storage, entity-review creation, FTS, and backup restore.

Still requiring the authenticated Access session:

- health response through Access
- sellers and seller detail
- masked contacts and audited secure reveal
- search
- duplicate merge, keep-separate, ignore, and rollback
- crawl status
- CSV export
- representative dashboard navigation

## Contact reveal status

- Encryption and decryption tests: pass.
- Authorization, Origin, masked-default, CSV, and audit tests: pass.
- Four staging contact ciphertexts use the current v5 key version.
- Remote single-operator reveal: pending authenticated Access session.

## Duplicate workflow status

- Integration and decision/rollback tests: pass.
- Real staging review decision and review-queue record: present.
- Remote merge/keep-separate/ignore/rollback via API: pending authenticated
  Access session.

## Security status

- No secret was added to Git or frontend configuration.
- Actual contact values are encrypted at rest with AES-256-GCM.
- Default API/dashboard/CSV surfaces remain masked.
- Reveal is backend-only, origin-restricted, single-operator restricted, and
  audited.
- Ingestion and cooldown preflight use HMAC, timestamps, nonces, replay
  protection, exact User-Agent validation, and idempotency.
- No personal browser profile or cookie file was used.
- No CAPTCHA bypass or source-block bypass exists.
- No live crawl remains enabled after a bounded job.

Security verdict: **SAFE, with production promotion blocked until the remaining
authenticated Access acceptance gate passes.**

## Zero-charge status

Enforced values remain:

- one confirmed Student Scrapy Cloud unit maximum
- Zyte API disabled
- paid services and paid add-ons disabled
- maximum external monthly spend zero
- extra Scrapy units disabled
- paid GitHub Actions minutes disabled
- GitHub crawler fallback disabled
- credit runner disabled
- Amazon, Alibaba, 1688, search discovery, business registry, AI summaries, and
  outreach disabled
- official website enabled
- live crawl disabled except inside an explicitly bounded process

Only explicitly bounded jobs ran on the existing one-unit Student project. No
new unit, new Zyte project, Zyte API request, paid provider, or automatic
fallback was invoked. Zero-charge verdict: **SAFE**.

## Remaining blockers

1. Operator must authenticate once at the staging dashboard with the configured
   allowed email so remote dashboard/API/reveal/duplicate/CSV acceptance can run.

This is an external Access session input, not missing implementation. Zyte UI
settings are no longer a blocker.

## Exact next sequence

1. Complete the authenticated staging API/dashboard/reveal/duplicate/CSV suite
   through Cloudflare Access.
2. Only after that final staging gate passes, create the four production D1 databases,
   production Worker, Pages project, Access applications, bindings, and secrets.
3. Apply production migrations, deploy the exact accepted application and
   crawler artifacts, and verify
   health, auth, search, dashboard, reveal, duplicate actions, CSV, and backup.
4. Run exactly one tiny official-site crawl for the approved
   `https://scalemyprints.com/` seed with one Student unit, strict limits, no
   Zyte API, no paid service, and no fallback; verify end to end.

## Exact current Git status

Immediately before creating this report:

- branch: `main`
- HEAD: `a1268d6476f2e35925fda750be0378d40a98b18d`
- origin/main: same SHA
- tracked working tree: clean
- required implementation: committed and pushed
- generated build, crawl, spool, and backup artifacts: ignored

This report is the only new tracked deliverable after that clean checkpoint.

## Final readiness answer

Solo Mode v1 code is complete, reproducible, locally verified, CI-green, and
substantially staging-verified. The engine, one-unit Scrapy Cloud deployment,
per-job secret injection, no-network smoke, cancel path, bounded root-seed
crawl, encrypted D1 persistence, and current backup are complete. It is **not
fully production-ready yet**. The only current launch blocker is the
authenticated Access acceptance session. Production must remain untouched until
that gate passes.
