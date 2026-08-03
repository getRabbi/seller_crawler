# Seller Intelligence Platform

Local-only Seller Intelligence implementation for the zero-cost hybrid runner
architecture in `SELLER_INTELLIGENCE_MASTER_SPEC.md`.

## Current Phase Status

- Active phase: `7 - official website enrichment`
- Phase 7 status: partially complete
- Phases 0-6: complete and verified
- Phase 8: complete and verified ahead of order
- Phase 9: partially complete
- Phase 10A: partially complete
- Phase 10B and later provider phases: not ready
- Runner mode: `development_locked`
- Live crawling: disabled
- Zyte API: disabled
- Scrapy Cloud deploy: disabled
- GitHub Actions crawler: disabled
- Credit runner: disabled
- Deployment: disabled

Zyte Support has confirmed that the GitHub Student Scrapy Cloud entitlement is
applied and that exactly one Scrapy Cloud unit is free. Repository defaults now
record that entitlement while still keeping Scrapy Cloud deployment, live
crawling, Zyte API, extra units, Amazon, and paid services disabled.

## Solo Mode v1 Launch Profile

Solo Mode v1 is the single-operator minimum launch path documented in
`SOLO_MODE_IMPLEMENTATION_PLAN.md`. It preserves the tested Phase 0-8
foundations and narrows launch to one verified Zyte Student Scrapy Cloud unit,
one local fallback runner, official-website crawling, public business email,
phone, WhatsApp, and WeChat extraction, normalization, basic entity resolution,
Worker ingestion, the existing four D1 databases, a simple searchable private
dashboard, CSV export, basic backup, and single-user Cloudflare Access.

R2 is optional for Solo v1. The launch profile stores source URL, evidence
snippet or masked extraction context, content hash, parser/schema versions, and
timestamps in D1. Full HTML, screenshot archives, batch archives, and longer R2
retention are deferred until after launch.

Deferred from Solo v1: Zyte API, extra Scrapy Cloud units, GitHub Actions
crawler fallback, credit-backed fallback, automatic provider orchestration, AI
summaries, outreach automation, team roles, advanced monitoring, complex
approval workflows, full raw-evidence R2 storage, Amazon, marketplaces, supplier
directories, and broad search discovery.

Required safety posture remains:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
ALLOW_EXTRA_SCRAPY_UNITS=false
ENABLE_AMAZON=false
```

## Local Setup Commands

Run these commands from the repository root.

```powershell
uv sync --dev
npm.cmd install
```

## Required Validation Commands

```powershell
uv run ruff check crawler
uv run mypy crawler/sellerintel crawler/tests
uv run pytest crawler/tests
uv run pytest crawler/tests/test_contact_extractors.py --cov=crawler/sellerintel/extractors --cov-report=term-missing
uv run bandit -r crawler/sellerintel
uv run pip-audit
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run health:worker
npm.cmd run audit:prod
npm.cmd run build
```

`npm.cmd run health:worker` executes the local Worker health smoke test and
asserts that `GET /v1/health` returns HTTP 200 in the default locked
configuration.

## Database

Phase 1 adds D1-compatible migrations under `database/migrations` for the four
partitions: core, contacts, operations, and history. The migrations are tested
locally with SQLite, including the core FTS5 search table and the post-restore
rebuild script at `database/queries/rebuild_core_fts_after_restore.sql`.

No seed data is included. No Cloudflare D1 database is created or modified by
local validation.

## Ingestion

Phase 2 implements `POST /v1/ingest/batch` in the Worker API. The route requires
local D1-compatible bindings, `INGESTION_HMAC_SECRET`, gzip or identity JSON,
`X-SI-Timestamp`, `X-SI-Nonce`, `X-SI-Signature`, and `Idempotency-Key`.

The Worker verifies HMAC-SHA256 signatures, a five-minute timestamp window,
persistent nonce replay state, the strict ingestion payload contract, source URL
policy, batch limits, and idempotency before ordered partition writes. Logs only
include masked operational identifiers, not raw contact values.

## Crawler Contracts

Phase 3 adds Pydantic models for the ingestion batch and extracted crawler
records under `crawler/sellerintel/schemas`; versioned records require explicit
`schema_version` and `parser_version` values. The crawler client serializes
batches with stable JSON key ordering, deterministic gzip headers, HMAC-SHA256
signatures over the compressed body, fresh nonces per attempt, and the Worker
idempotency key format `<crawl-run-id>:<batch-number>`.

Retryable network, 408, 429, and 5xx failures use exponential backoff. If all
attempts fail, the compressed batch is written to a local spool file under the
configured spool directory without storing the HMAC secret or signature.

## Contact Extractors

Phase 4 adds local, fixture-driven extractors for public business email, phone,
WhatsApp, and WeChat contacts under `crawler/sellerintel/extractors`. The
extractors parse sanitized HTML, normalize values, keep masked evidence context,
assign confidence components, classify candidates, and reject low-confidence
false positives. Phone and WhatsApp normalization uses `phonenumbers`; no SMTP,
mailbox probing, QR decoding, live crawling, or provider access is performed.

## Normalization

Phase 5 adds deterministic normalization under `crawler/sellerintel/normalization`
for company names, domains, country codes, E.164 phone values, hashes, and
addresses. Company normalization applies Unicode NFKC, punctuation removal,
whitespace collapse, and English/Chinese suffix handling. Address masking
redacts street-level detail before downstream display or history use.

## Source Adapter Framework

Phase 6 adds policy-backed source adapter scaffolding under
`crawler/sellerintel/adapters` and source policy defaults under
`crawler/sellerintel/config/sources.py`. Each adapter carries risk level, robots
policy, terms risk/review status, per-domain concurrency, minimum delay,
blocked-page cooldown, and a feature flag. Marketplace, supplier-directory, and
search-discovery adapters remain disabled by default.

## Official Website Enrichment

Phase 7 is the active phase and is partially complete. It adds local
official-site crawl planning and page enrichment under
`crawler/sellerintel/adapters/official_site`. Crawl plans canonicalize the seed
URL, enforce same-domain URLs, apply the official-site page budget, include only
homepage/about/contact/support/wholesale/distributor/privacy/terms paths plus
sitemap-discovered business pages, and reject blocked account/cart/login paths.

Page enrichment computes a deterministic content hash, builds a local evidence
envelope with the intended R2 object key, and runs the Phase 4 contact
extractors with masked evidence and confidence scoring. This phase does not
perform live fetching, sitemap retrieval, R2 upload, or provider activation.
The remaining Phase 7 requirements are evidence upload and approved crawling
behavior; they are intentionally not implemented by this stabilization pass.

## Entity Resolution

Phase 8 is complete and verified ahead of the first incomplete phase. It adds
runner-side exact and fuzzy entity resolution under
`crawler/sellerintel/entity_resolution`. Decisions include transparent score
components, deterministic IDs, and fixed thresholds: auto-merge at `>= 92`,
review queue at `70-91`, and no merge below `70`.

The core migration `database/migrations/core/0004_entity_resolution.sql` adds
`entity_resolution_decisions` and `seller_merge_redirects` so merge decisions
can be audited and rolled back without deleting canonical or historical data.
The implementation only prepares deterministic decisions, review payloads,
merge audit metadata, and rollback steps; it does not perform live writes,
automatic production merging, or dashboard review actions.

## Dashboard

Phase 9 is partially complete. It replaces the bootstrap screen with a static
internal Next.js dashboard
under `apps/dashboard`. It includes Overview, Sellers, Seller detail, Contacts,
Review queue, Crawl health, Sources, Suppression, and Export routes. Local
fixture data stays masked in the browser, review items expose only score and
audit metadata, and route data boundaries are represented as `/v1` Worker API
paths for later live integration.

The dashboard remains a static export in this phase. It does not read
production secrets, call live Worker endpoints, reveal raw contact values,
deploy Cloudflare Pages, or activate Cloudflare Access.

## Local Runner Readiness

Phase 10A is partially complete. It adds the provider-neutral local runner
readiness layer under
`crawler/sellerintel/runtime/local.py`, a shared crawler `Dockerfile`, and the
runbook at `docs/local-runner.md`. The runner validates startup gates, honors the
global kill switch, rejects personal browser profile and cookie inputs, enforces
one-job execution with an exclusive lock, and supports fixture-only dry-run smoke
batches.

Durable spool replay verifies stored checksums, re-signs the same compressed body
with a fresh nonce and timestamp, preserves the idempotency key, and deletes a
spool file only after a 2xx Worker response. Defaults stay locked:
`development_locked`, `LIVE_CRAWL_ENABLED=false`, `LOCAL_RUNNER_FIXTURE_ONLY=true`,
and `LOCAL_RUNNER_DRY_RUN=true`.

## Stop Conditions

Do not run live crawling, deploy Cloudflare resources, use Zyte API, activate a
provider, start Phase 10B/10C/10D provider activation, or push. Checkpoint
commits are allowed only after the safe local validation suite passes.

## Rollback Or Recovery

The validated local implementation contains local migrations, tests, Worker
repository classes, the secure ingestion route, crawler contracts, contact
extractors, normalization utilities, source adapter framework, official-site
crawl planning/enrichment, fixtures, a local entity-resolution engine, the static
dashboard, and the fixture-only local runner readiness layer. Before production
data exists, rollback is file-level. After data exists, use a forward migration
and follow
`database/ROLLBACK.md`; never delete canonical or historical data without a
documented retention operation.

## Free-Tier Impact

The current local state has no external infrastructure use and no recurring
cost. Local dependency installation may download development packages, but no
Cloudflare, Zyte, crawling, R2, hosted D1, or provider runtime is activated.
Local SQLite migration tests, Worker ingestion tests, crawler client tests,
extractor fixture tests, normalization tests, adapter policy tests,
official-site enrichment tests, entity-resolution fixture tests, dashboard
tests, local runner smoke/replay tests, and migration tests consume only
workstation disk and CPU. Local spool files are ignored by git.
