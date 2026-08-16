# Seller Intelligence Solo Mode v1 — Final Production Report

Report date: 2026-08-17 (Asia/Dhaka)

## Executive verdict

Solo Mode v1 implementation and local/CI validation are complete. The immutable
implementation artifact is commit
`464888d9e837146336e6e0da027950cf0e924823`, and that exact artifact is deployed
to the staging Worker and staging dashboard.

Staging infrastructure, ingestion, encrypted persistence, entity-resolution
review creation, spool replay, cooldown enforcement, and disposable four-D1
restore have passed. Solo Mode v1 is **not yet fully production-ready** because
two external acceptance gates still require operator-side authenticated UI
state:

1. Complete a Cloudflare Access login as the configured single allowed
   operator so the authenticated dashboard/API/reveal/duplicate-action suite can
   be exercised remotely.
2. Add the new cooldown URL and versioned contact-encryption settings to the
   existing Scrapy Cloud project's private custom settings. The available
   Scrapy Cloud API credential can read project settings, but the provider's
   undocumented write endpoint returns success while silently ignoring new
   settings; the supported web UI is therefore required.

Production provisioning, Zyte deployment, and the final production crawl have
not been started because staging acceptance must be green first.

## Final commit SHA

- Immutable implementation/release-candidate SHA:
  `464888d9e837146336e6e0da027950cf0e924823`
- Branch: `main`
- Remote branch at the same SHA before this report-only commit: `origin/main`
- Staging deployments use the immutable implementation SHA above.

## GitHub CI status

Both required workflows passed for the immutable implementation SHA:

| Workflow | Run ID | Result |
| --- | ---: | --- |
| CI Python | 31969844806 | success |
| CI Web | 31969844781 | success |

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

## Local validation results

| Check | Result |
| --- | --- |
| `uv run ruff check crawler` | pass |
| `uv run mypy crawler/sellerintel crawler/tests` | pass, 92 files |
| `uv run pytest crawler/tests` | pass, 110 tests |
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

A Git-only checkout was created from the immutable SHA. From that checkout:

- Python dependency sync passed.
- All 110 Python tests passed.
- Ruff passed.
- `npm ci` passed.
- Web lint, typecheck, all 43 tests, and static build passed.
- Production npm audit is clean.
- The temporary checkout was removed after verification.

The crawler Docker image also built successfully from the Git-controlled
context. No required source is ignored, and generated runtime/build/backup
artifacts remain ignored.

## Staging verification results

### Cloudflare Worker and dashboard

- Worker project: `seller-intelligence-api-staging`
- Worker route: `api-stg.scalemyprints.com/*`
- Code deployment version: `fe699a02-7a57-4880-8dc1-8be4f38872b6`
- Current version after secret-only updates:
  `e286ba57-4b2a-459c-ab71-90421f859112`
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

A bounded synthetic official-site run used only
`https://seed-stg.scalemyprints.com/`, a four-page budget, depth one, the local
fallback, no browser profile/cookies, no provider fallback, no Zyte API, and no
paid service.

Result: accepted, five signed batches including completion, four pages, four
contacts, zero blocks, zero errors, and no spool.

### Staging database observations

After the bounded crawl and duplicate fixture ingestion:

- All six contact records use the current staging key version.
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

- Checksummed staging backup manifest:
  `.sellerintel/backups/staging-20260816T204546Z/manifest.json`
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

Not run yet. The existing Student project and credential are present, but its
private custom settings currently contain only the ingestion endpoint and HMAC
secret. These settings are still required before deployment/smoke:

- `SOURCE_COOLDOWN_CHECK_URL`
- `CONTACT_ENCRYPTION_KEYS`
- `CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION`

The next key version must be installed in both the Zyte project and the staging
Worker secret store, followed by one bounded re-encryption/upsert pass. No new
project or unit is needed.

No-network smoke, status/completion/cancel, and crawler artifact deployment are
pending. Exactly one unit remains the hard limit; Zyte API remains disabled.

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
- Six staging contact ciphertexts use the current staging key version.
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

Security verdict: **SAFE, with production promotion blocked until the two
external acceptance gates pass.**

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

No Zyte job, new unit, new Zyte project, paid provider, or automatic fallback
was invoked. Zero-charge verdict: **SAFE**.

## Remaining blockers

1. Operator must authenticate once at the staging dashboard with the configured
   allowed email so remote dashboard/API/reveal/duplicate/CSV acceptance can run.
2. Operator must use the existing Scrapy Cloud project's Settings UI to add the
   cooldown URL and a new versioned contact keyring/active version. The same
   keyring must be supplied through the approved local environment so the
   staging Worker can be updated without exposing the value.

These are external UI/session inputs, not missing implementation.

## Exact next sequence

1. Complete the two operator actions above without posting any secret in chat.
2. Synchronize the new keyring to the staging Worker secret store and re-run the
   four-page synthetic staging upsert.
3. Execute the authenticated staging API/dashboard/reveal/duplicate/CSV suite.
4. Deploy the immutable crawler artifact to the existing Student project, run
   one no-network smoke, and verify completion plus cancel with one unit.
5. Only after all staging gates pass, create the four production D1 databases,
   production Worker, Pages project, Access applications, bindings, and secrets.
6. Apply production migrations, deploy the exact accepted artifact, and verify
   health, auth, search, dashboard, reveal, duplicate actions, CSV, and backup.
7. Run exactly one tiny official-site crawl for the approved
   `https://scalemyprints.com/` seed with one Student unit, strict limits, no
   Zyte API, no paid service, and no fallback; verify end to end.

## Exact current Git status

Immediately before creating this report:

- branch: `main`
- HEAD: `464888d9e837146336e6e0da027950cf0e924823`
- origin/main: same SHA
- tracked working tree: clean
- required implementation: committed and pushed
- generated build, crawl, spool, and backup artifacts: ignored

This report is the only new tracked deliverable after that clean checkpoint.

## Final readiness answer

Solo Mode v1 code is complete, reproducible, locally verified, CI-green, and
substantially staging-verified. It is **not fully production-ready yet**. The
only current launch blockers are the authenticated Access acceptance session and
the three private Zyte project settings. Production must remain untouched until
those gates pass.
