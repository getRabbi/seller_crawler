# Operations

Operations remain local while Phase 9 is active. Phases 0-8 are complete and
verified; Phase 10A is partial and provider activation is not ready. Do not
deploy, schedule live crawling, activate providers, or connect production
ingestion before their gates.

Solo Mode v1 keeps operations to one operator and one active runner at a time.
The launch target is one verified Zyte Student Scrapy Cloud unit plus one local
fallback runner. GitHub Actions crawler fallback, credit-backed fallback,
automatic provider orchestration, Zyte API, extra Scrapy Cloud units, Amazon,
AI summaries, outreach automation, team roles, advanced monitoring, and complex
approval workflows are post-launch deferrals.

R2 is optional for Solo v1. During launch, D1 evidence provenance is sufficient
when it includes source URL, canonical URL, masked evidence snippet or extraction
context, content hash, timestamps, parser version, and schema version. Full HTML
or screenshot archives can be added to R2 later.

Database migrations are D1-compatible SQL files tested through local SQLite.
Restore partitioned databases in this order: core, contacts, operations, then
history. After restoring core canonical tables, run
`database/queries/rebuild_core_fts_after_restore.sql` to recreate and rebuild
the FTS5 search table.

No production secrets, personal seed data, live source access, Cloudflare writes,
R2 writes, Zyte API use, or crawler provider activation is part of the current
local state.

Local ingestion tests use in-memory D1-compatible bindings and fixture payloads.
Real ingestion requires `INGESTION_HMAC_SECRET`, all four D1 bindings, a current
`X-SI-Timestamp`, a unique `X-SI-Nonce`, `X-SI-Signature`, `Idempotency-Key`,
and payloads that satisfy the strict ingestion contract. Replays must use the
same idempotency key with a new nonce; reusing a nonce is rejected.

The Worker writes core first, then contacts, operations, and history. If a later
partition write fails, the response is retryable and includes the completed
stages. The caller must replay the same idempotency key with a new nonce so
already accepted upserts remain idempotent.

The crawler ingestion client signs the compressed request body and generates a
fresh nonce per attempt. Temporary network, 408, 429, and 5xx failures are
retried with exponential backoff. If retries are exhausted, a local spool record
is written with the compressed body, checksum, idempotency key, endpoint, and
last error metadata. The HMAC secret and signatures are never stored in spool
records.

Contact extractor tests run against sanitized local fixtures. Extractor evidence
contexts are masked before being exposed to downstream code, and low-confidence
directory or personal-profile matches are rejected. Use:

```powershell
uv run pytest crawler/tests/test_contact_extractors.py --cov=crawler/sellerintel/extractors --cov-report=term-missing
```

The coverage gate is local only and does not access live sources.

Normalization utilities are deterministic and local. Use them before comparing
company identities, hashing contacts, storing public address snippets, or
building entity-resolution features. Address masking should be applied before
displaying or storing address evidence outside the encrypted/private evidence
path.

Source adapter policies are metadata and local request-planning scaffolding.
Feature flags and source policies must both allow an adapter before it is
returned by the registry. A blocked response, CAPTCHA/challenge marker, or
restricted terms/robots policy must stop that adapter path; do not rotate to
another provider to work around the block.

Official-site fixture execution runs the real Scrapy spider without network
access. It emits compact D1 evidence with canonical URL, source domain, page
title, masked snippet, content hash, detection time, and last-seen time. R2
writes do not occur. Local-live execution remains double-gated by runner mode
and `LIVE_CRAWL_ENABLED=true` plus explicit seeds.

Entity resolution runs in the crawler/runner layer, not in request-time Worker
queries. Use deterministic fixture tests for exact and fuzzy matching. Decisions
must include score components, use the fixed `>= 92`, `70-91`, and `< 70`
thresholds, and write or replay merge metadata idempotently by decision ID when
persistence is later connected. Merge rollback is forward-only: create a
rollback decision, restore source-seller links from audit metadata, and never
delete canonical or historical rows to undo a merge.

The dashboard is a static Next.js export in Phase 9. It uses local masked
fixture data and records intended Worker `/v1` route boundaries for future live
integration. Do not put secrets, direct D1/R2 bindings, raw contact values, or
Cloudflare Access configuration in browser code. The local dashboard validation
commands are:

```powershell
npm.cmd run lint --workspace @seller-intelligence/dashboard
npm.cmd run typecheck --workspace @seller-intelligence/dashboard
npm.cmd run test --workspace @seller-intelligence/dashboard
npm.cmd run build --workspace @seller-intelligence/dashboard
```

Phase 10A local runner readiness is partially complete and fixture-only by
default. The real spider and signed/spooled batch path work locally; Docker
verification remains. Runbook details are
in `docs/local-runner.md`. The local smoke command validates startup gates,
global kill switch state, one-job lock paths, spool paths, and forbidden browser
profile variables. Scheduling instructions for Windows Task Scheduler and Linux
cron are documented for later approval, but no schedule is enabled in this phase.

Solo v1 launch operations must add these before staging:

1. Worker-backed seller search, seller detail, contact, source health, review,
   suppression, and CSV export routes.
2. Single-user Cloudflare Access before any dashboard exposure.
3. Basic logical backup and local restore validation for core, contacts,
   operations, and history.
4. Local fallback verification with live crawling still disabled until the
   approved official-site crawl gate.
5. Zyte Phase 10B no-network smoke verification with exactly one Scrapy Cloud
   unit and `ZYTE_API_ENABLED=false`.
