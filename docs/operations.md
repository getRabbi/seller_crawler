# Operations

Operations remain local at the external deployment boundary. The Solo v1
crawler, Worker APIs, four local D1 partitions, dashboard, local runner, Docker
artifact, backups, and one-unit provider controls are implemented and verified
locally. No hosted resource or provider job has been deployed.

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

Entity resolution runs in the Worker ingestion path using the deterministic
exact/domain/contact and fuzzy-name scoring rules. Decisions
must include score components, use the fixed `>= 92`, `70-91`, and `< 70`
thresholds, and write or replay merge metadata idempotently by decision ID.
Merge rollback is forward-only: restore only source-seller links recorded for
the decision, preserve audit history, and never delete canonical or historical
rows to undo a merge.

The dashboard is a static Next.js export backed by Worker `/v1` APIs. Contacts
remain masked, and Access configuration is enforced at the Worker rather than
embedded in browser code. Do not put secrets, direct D1/R2 bindings, raw contact
values, or Access credentials in browser code. The local dashboard validation
commands are:

```powershell
npm.cmd run lint --workspace @seller-intelligence/dashboard
npm.cmd run typecheck --workspace @seller-intelligence/dashboard
npm.cmd run test --workspace @seller-intelligence/dashboard
npm.cmd run build --workspace @seller-intelligence/dashboard
```

The official-site queue is bounded to 100 planned pages per operator run.
Robots and sitemap overhead stays inside the Scrapy Cloud close limit, and only
one Student unit may be active. The `crawl_run_contacts` operations table makes
contact counters unique by `(crawl_run_id, contact_id)`; it stores identifiers
and timestamps only, never contact ciphertext or plaintext. At current one-unit
throughput its free-tier D1 impact is proportional to verified contacts and
stays inside the existing ingestion write envelope. Archive or retention must
be a documented forward operation.

Find Sellers exposes one sizing value: 100, 200, or 300 seller records. The
dashboard derives Amazon result pages as `ceil(target / (24 * keyword_count))`,
bounded to 15 pages per keyword, and uses crawl depth 2. A 300-seller run has a
hard discovery close limit of 700 responses; the later sequential stages still
allow no more than 25 deterministic domain-candidate pages, 25 verified official
sites, and 100 official content pages. These are ceilings, not yield guarantees. Repeated merchants,
filters, robots decisions, cooldowns, public-result availability, and explicit
blocks can stop below the selected target. One Student unit remains the only
active unit, and no paid-service or provider flag changes.

Operations migration `0007_operator_search_deduplication.sql` stores one
nullable SHA-256 search fingerprint and a unique index for each original Amazon
search. The signature normalizes the keyword set, marketplace, country scope,
and seller filters; it intentionally ignores target size and hidden page/depth
budgets. The create API also compares pre-migration rows, so an equivalent
historical search is returned with `skipped=true` and no external launch. A
terminal run can be repeated only through the existing explicit Retry action.
The fingerprint contains no secret or contact value, raw queries remain under
the existing Access-protected operations policy, and application logs continue
to exclude raw personal contacts. Free-tier impact is one 64-character value
and one index entry per original search plus one indexed lookup per create.

Amazon operator runs may add a sequential official-domain verification stage.
It checks no more than two deterministic candidates per seller and 25 candidates
per run, one homepage page per domain plus bounded robots and same-domain redirect
handling. Candidate outcomes reuse versioned source/review records; the separate
additive search-fingerprint migration does not alter candidate evidence.
The candidate stage does not consume Zyte API or a second unit. A failed or
ambiguous candidate is not linked; a parked page, private response address,
cross-domain redirect, robots denial, or explicit block is never bypassed.
Every external job uses a unique `operator:<run-id>:<stage>` tag. If a Worker
execution ends after Scrapy Cloud accepts a job but before D1 stores its ID, the
next queue pump recovers that exact tagged stage. Missing, duplicate, or
unverifiable tag results never cause an automatic relaunch.
Existing sellers with no official domain can be re-entered through
`resolve_seller`; the run starts at `resolving`, remains one-seller/one-unit, and
continues to enrichment only after acceptance. This uses the existing tables and
requires no D1 migration. If disabled, deploy the prior application code and
preserve all run, source, review, seller, and contact records.

Phase 10A local runner readiness is complete and fixture-only by default. The
real spider, signed/spooled ingestion path, and offline Docker smoke work
locally. Runbook details are in `docs/local-runner.md`. The local smoke command validates startup gates,
global kill switch state, one-job lock paths, spool paths, and forbidden browser
profile variables. Scheduling instructions for Windows Task Scheduler and Linux
cron are documented for later approval, but no schedule is enabled in this phase.

Solo v1 launch operations now require external setup only: populate the
staging/production Wrangler files, create and migrate the existing four D1
partitions per environment, deploy the Worker and static dashboard behind one
single-user Access application, and verify the one-unit Zyte no-network smoke.
Follow `DEPLOYMENT_RUNBOOK.md`; live crawling remains disabled until the
explicit approved-seed step.
