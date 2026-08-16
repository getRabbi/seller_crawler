# Seller Intelligence Platform

Seller Intelligence Solo Mode v1 release candidate for the zero-cost hybrid
runner architecture in `SELLER_INTELLIGENCE_MASTER_SPEC.md`.

## Current Phase Status

- Active milestone: authenticated dashboard acceptance and production promotion
- Phases 0-8: complete and verified for Solo v1
- Phase 9: Cloudflare staging deployed; authenticated feature verification and
  production promotion remain pending
- Phase 10A: complete and verified locally, including the Docker artifact
- Phase 10B: code deployed to Scrapy Cloud; one-unit no-network completion,
  controlled cancellation, and bounded signed-ingestion crawl verified
- Post-launch provider phases: deferred
- Runner mode: `development_locked`
- Live crawling: disabled
- Zyte API: disabled
- Scrapy Cloud deploy: disabled
- GitHub Actions crawler: disabled
- Credit runner: disabled
- Cloudflare staging and Scrapy Cloud code: deployed; the controlled synthetic
  seed crawl completed on one unit with signed D1 ingestion. Production and
  broad live crawling have not started.

The current hosted inventory, verification evidence, security review, quota
impact, and recovery path are recorded in `STAGING_DEPLOYMENT_REPORT.md`.

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

Phase 7 is complete and verified for Solo v1. The real `official_website`
Scrapy spider accepts explicit seeds, obeys robots.txt, stays on the approved
domain, discovers bounded business/contact pages and sitemaps, canonicalizes
and deduplicates URLs, stops a domain after explicit blocks, and applies strict
page, depth, concurrency, retry, timeout, response-size, and cookie limits.

The no-network fixture transport exercises the same spider and produces
deterministic seller, contact, source/evidence, and crawl-run batches. Compact
D1 evidence includes source URL, page title, masked evidence snippet, content
hash, `detected_at`, and `last_seen_at`. Full raw-evidence R2 storage remains
deferred by the Solo v1 amendment. Live crawling and provider activation remain
disabled.

## Entity Resolution

Phase 8 is complete and verified. The existing deterministic scorer is connected
to the Worker ingestion/persistence path. Decisions include transparent score
components, deterministic IDs, and fixed thresholds: auto-merge at `>= 92`,
review queue at `70-91`, and no merge below `70`.

The core migration `database/migrations/core/0004_entity_resolution.sql` adds
`entity_resolution_decisions`, `seller_merge_redirects`, and decision-scoped row
link audit metadata so merge decisions can be applied idempotently and rolled
back without deleting canonical or historical data. The single-operator API and
dashboard support merge, keep-separate, and ignore decisions; rollback restores
only rows recorded for the selected merge.

## Dashboard

Phase 9 is complete and verified locally for Solo v1. The static Next.js
dashboard under `apps/dashboard` calls versioned Worker `/v1` APIs for overview,
seller list/detail, contacts, duplicate review, crawl runs, search, and CSV
export. It has loading, empty, failure, retry, and locked states. Browser-visible
contacts remain masked and no browser bundle contains an ingestion, Cloudflare,
contact-encryption, or provider secret. Individual raw values require an
authenticated POST reveal with an operator reason; every successful reveal is
audited. Contact CSV remains masked by design.

The Worker validates Cloudflare Access JWT signatures, issuer, audience,
expiration, and the single allowed email before serving private API routes.
Cloudflare Pages and Access are configured by examples and the deployment
runbook, but no hosted resource has been deployed.

## Local Runner Readiness

Phase 10A is complete and verified locally for Solo v1. The provider-neutral
local runner under `crawler/sellerintel/runtime/local.py`, shared `Dockerfile`,
and `docs/local-runner.md` validate startup gates, honor the global kill switch,
reject personal browser profile and cookie inputs, enforce one-job execution,
and execute the real official-site spider. The image builds successfully and
passes a fixture-only smoke with `--network none`.

Durable spool replay verifies stored checksums, re-signs the same compressed body
with the required crawler User-Agent, ingestion headers, fresh nonce and timestamp,
preserves the idempotency key, and deletes a
spool file only after a 2xx Worker response. Defaults stay locked:
`development_locked`, `LIVE_CRAWL_ENABLED=false`, `LOCAL_RUNNER_FIXTURE_ONLY=true`,
and `LOCAL_RUNNER_DRY_RUN=true`.

Phase 10B provides a controlled Scrapy Cloud runner and CLI for deploy,
no-network smoke start, official-site start, status, and cancellation. Every job
sets `units=1`; the official-site action additionally requires the separate live
crawl gate. Repository defaults keep deployment false, so external verification
cannot begin until the operator supplies the Scrapy Cloud project and credential
and explicitly opens only the deployment gate.

## Stop Conditions

Do not run live crawling, use Zyte API, add a Scrapy Cloud unit, activate a
fallback provider, or push. Do not deploy until the consolidated values in
`OPERATOR_INPUTS_REQUIRED.md` are supplied and the appropriate runbook gate is
followed. Keep broad live crawling disabled after deployment until the single
approved-seed smoke has passed end to end.

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

The current release candidate has no hosted infrastructure use and no recurring
cost. Local dependency installation and Docker image creation may download
packages, but no Cloudflare, Zyte job, live crawl, R2, hosted D1, or provider
runtime has been activated.
Local SQLite migration tests, Worker ingestion tests, crawler client tests,
extractor fixture tests, normalization tests, adapter policy tests,
official-site enrichment tests, entity-resolution fixture tests, dashboard
tests, local runner smoke/replay tests, and migration tests consume only
workstation disk and CPU. Local spool files are ignored by git.
