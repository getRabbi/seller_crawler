# Project Status Report

Audit date: 2026-08-03
Repository: `E:\seller_crawler`
Authoritative specification: `SELLER_INTELLIGENCE_MASTER_SPEC.md`
Specification SHA-256: `A86789C17196585AF384A4EA9ADBE4B5094DDD1B10F58572293EDC46414F9D38`
Audit mode: read-only implementation audit; no deploy, live crawl, Zyte API call, commit, or push.

## 1. Executive summary

The repository has a strong local-only foundation with passing Python, TypeScript, Worker, dashboard, contract, migration, security, and build checks. The committed git history contains only the Phase 0 bootstrap commit, while most Phase 1 through Phase 10A work is present as uncommitted working-tree changes.

Audit-determined status differs from the documented status. `README.md` says the current phase is `10A - local runner readiness`, and `CHANGELOG.md` marks phases through 10A as implemented. Against the frozen master specification, the first incomplete phase is Phase 7 because official-site enrichment builds local crawl plans and evidence object keys but does not perform evidence upload and does not implement live crawling. Phase 9 and Phase 10A are also partial. Phase 8 appears complete and verified, but it was implemented ahead of the first incomplete phase.

All safe validation commands that were available locally passed. The aggregate `make test` target could not be run because `make` is not installed in this Windows environment; its component commands were run directly and passed.

Zero-charge posture is `SAFE WITH WARNINGS`. The repo enforces `PAID_SERVICES_ALLOWED=false`, `SCRAPY_CLOUD_MAX_UNITS=1`, and `ZYTE_API_ENABLED=false`. The warning is that the confirmed Zyte Student entitlement is not reflected in repo defaults: `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED` is still `false` in `.env.example` and `apps/worker-api/wrangler.toml`.

## 2. Current project stage

Documented project stage: Phase 10A local runner readiness (`README.md`, `CHANGELOG.md`, `docs/local-runner.md`).

Audit-determined stage: Phase 7 is the current active phase because it is the first phase that is not complete against the master spec.

Deployment stage: local only. There is no repository evidence of deployed Cloudflare Worker, Pages, D1, R2, Cloudflare Access, Zyte Scrapy Cloud job, scheduled crawler, or production secret configuration.

## 3. Last fully completed phase

Last fully completed phase in strict phase order: Phase 6 - Source adapter framework.

Reason: Phases 0 through 6 are implemented and verified by passing tests/checks. Phase 7 is only partially complete.

## 4. Current active phase

Audit-determined active phase: Phase 7 - Official website enrichment.

Documented active phase: Phase 10A - Local runner production readiness.

This mismatch should be corrected before continuing implementation so future work does not rely on an incorrectly completed phase chain.

## 5. Recommended next phase

Recommended next safe phase: finish Phase 7 in a local-safe way, or explicitly amend the frozen master specification if the intended Phase 7 acceptance is local-only evidence planning rather than actual evidence upload.

The next safe task is not Zyte activation. Zyte Student entitlement has been confirmed by the operator, but the repo has not yet encoded that fact, the Scrapy Cloud runner is a placeholder, the deploy workflow is deliberately blocked, and earlier phase drift remains.

## 6. Phase-by-phase status matrix

| Phase | Status | Specification requirements | Completed work | Incomplete work / blockers | Evidence | Verification / commits | Recommended next action |
|---|---|---|---|---|---|---|---|
| 0 - Repository bootstrap | COMPLETE AND VERIFIED | Monorepo skeleton, Python package, Worker skeleton, dashboard skeleton, migrations dir, CI, AGENTS, no crawl/deploy. | Foundation exists, CI workflows exist, lock defaults present. | None blocking. | `AGENTS.md`, `README.md`, `pyproject.toml`, `package.json`, `.github/workflows/ci-python.yml`, `.github/workflows/ci-web.yml`, `apps/worker-api/src/index.ts`, `apps/dashboard/app/page.tsx`. | Commit `d8c2850ca58952cd33008d6498c3beeb75a1c25d`; local checks passed. | Keep as baseline. |
| 1 - Database foundation and migrations | COMPLETE AND VERIFIED | Partitioned D1 migrations for core, contacts, operations, history; UUIDv7 text IDs; indexes/FTS; no cross-db FKs; rollback notes; migration tests. | SQL migrations and restore notes exist; local migration tests pass. | No Cloudflare D1 resources deployed, but deployment is later phase. | `database/migrations/core/*`, `database/migrations/contacts/*`, `database/migrations/operations/*`, `database/migrations/history/*`, `database/ROLLBACK.md`, `database/queries/rebuild_core_fts_after_restore.sql`, `apps/worker-api/src/repositories/*`. | Uncommitted working tree; `uv run pytest crawler/tests` passed 70 tests including migration tests. | Commit once audit follow-up scope is approved. |
| 2 - Secure ingestion | COMPLETE AND VERIFIED | POST `/v1/ingest/batch`, gzip, schema validation, HMAC, timestamp, nonce replay, idempotency, batch limits, masked logs, structured errors, ordered partition writes. | Worker ingestion route, HMAC, nonce, idempotency, binding validation, source policy validation, unit-of-work implemented. | No deployed Worker or real D1 bindings. | `apps/worker-api/src/ingestion/*`, `apps/worker-api/src/repositories/unit-of-work.ts`, `apps/worker-api/test/ingestion.test.ts`. | Uncommitted; `npm.cmd run test` passed 20 tests. | Add deployment resources only in Cloudflare phase. |
| 3 - Crawler contracts | COMPLETE AND VERIFIED | Pydantic records, deterministic serialization/gzip, signed batching, retry/backoff, local spool, no secret logs, tests. | Pydantic schemas, deterministic JSON/gzip, ingestion client, spool writer/replay, contract schema. | Live Worker integration not run because no production credentials. | `crawler/sellerintel/schemas/ingestion.py`, `crawler/sellerintel/clients/ingestion.py`, `crawler/sellerintel/clients/serialization.py`, `crawler/sellerintel/spool/*`, `packages/contracts/ingestion-batch.schema.json`. | Uncommitted; `uv run pytest crawler/tests/test_ingestion_contracts.py` included in passing suite. | Keep local-only until Worker staging exists. |
| 4 - Contact extractors | COMPLETE AND VERIFIED | Email, phone, WhatsApp, WeChat extraction; multilingual labels; evidence context; normalization; confidence; false positives; no SMTP probing; >=90% coverage. | Extractors and fixtures implemented; coverage gate passed. | None found for local scope. | `crawler/sellerintel/extractors/*`, `crawler/tests/fixtures/extractors/*`, `crawler/tests/test_contact_extractors.py`. | Uncommitted; coverage 95.36%. | Keep fixtures as regression suite. |
| 5 - Company normalization | COMPLETE AND VERIFIED | Normalize company/address/country/domain/phone/text, NFKC, suffixes, canonical domains, E.164, deterministic hashes, address masking. | Normalization modules and tests implemented. | None found for local scope. | `crawler/sellerintel/normalization/*`, `crawler/tests/test_normalization.py`. | Uncommitted; Python suite passed. | Keep adding fixtures as adapters mature. |
| 6 - Source adapter framework | COMPLETE AND VERIFIED | SourceAdapter protocol/registry; risk, robots, terms, concurrency, cooldown, block detection, feature flags, Amazon disabled, no evasion. | Policy-backed adapter framework and default policies implemented; marketplaces/search disabled by default. | No real marketplace adapter implementations, but Phase 6 framework requirement is met. | `crawler/sellerintel/adapters/base.py`, `crawler/sellerintel/adapters/registry.py`, `crawler/sellerintel/config/sources.py`, `crawler/tests/test_source_adapters.py`. | Uncommitted; Python suite passed. | Keep Amazon disabled unless spec changes. |
| 7 - Official website enrichment | PARTIALLY COMPLETE | Official website discovery/contact-page crawling; allowed business pages; same-domain/page budget; canonical URL; content hash; evidence upload; contact confidence. | Local crawl-plan builder, URL allowlist, canonicalization, content hash, evidence object-key envelope, contact extraction from supplied HTML. | No actual fetch/crawl execution, no robots fetch, no R2 evidence upload; `crawler/sellerintel/clients/r2.py` raises disabled error. | `crawler/sellerintel/adapters/official_site/enrichment.py`, `crawler/sellerintel/clients/r2.py`, `crawler/tests/test_official_site_enrichment.py`, `docs/data-sources.md`. | Uncommitted; local enrichment tests pass. | Complete evidence upload abstraction and tests without enabling live crawling, or amend spec. |
| 8 - Entity resolution | COMPLETE AND VERIFIED | Exact/fuzzy scoring, transparent breakdown, auto-merge >=92, review 70-91, no merge <70, audit trail, rollback support, deterministic tests. | Resolver, score components, thresholds, decision payloads, review queue payload, merge audit trail, migrations. | Actual production merge execution is not deployed. | `crawler/sellerintel/entity_resolution/*`, `database/migrations/core/0004_entity_resolution.sql`, `crawler/tests/test_entity_resolution.py`. | Uncommitted; Python suite passed. | Do not treat as phase-order complete until Phase 7 is resolved. |
| 9 - Dashboard | PARTIALLY COMPLETE | Authenticated internal dashboard; Overview, Sellers, Seller detail, Contacts, Review queue, Crawl health, Sources, Suppression, Export; data only through Worker API; no secrets in browser; masked contacts; reveal audit; responsive states. | Routes, layout, masked fixture data, runtime lock panels, static build, dashboard tests. | No Cloudflare Access enforcement; no live Worker API calls; Worker dashboard endpoints do not exist; data is local fixture arrays. | `apps/dashboard/app/*`, `apps/dashboard/components/*`, `apps/dashboard/lib/dashboard-data.ts`, `apps/dashboard/tests/runtime.test.ts`. | Uncommitted; `npm.cmd run build` and `npm.cmd run test` passed. | Add Worker dashboard APIs and Access boundary before marking complete. |
| 10A - Local runner production readiness | PARTIALLY COMPLETE | Provider-neutral local Docker/Scrapy runner, shared artifact, scheduler runbooks, one-job lock, durable spool/replay, signed ingestion, kill switch, dry-run/fixture-only, no browser cookies/profiles, local smoke. | `LocalRunner`, dry-run smoke, lock, spool replay, Dockerfile, runbook, forbidden browser-profile guard. | Scrapy spiders are placeholders; Docker build was not run; no real Scrapy crawl path; scheduling remains documentation only; shared artifact not verified by Docker. | `crawler/sellerintel/runtime/local.py`, `Dockerfile`, `docs/local-runner.md`, `crawler/tests/test_local_runner.py`, `crawler/sellerintel/spiders/*`. | Uncommitted; dry-run smoke returned `state=dry_run_complete`. | Verify Docker artifact and integrate real Scrapy runner only after earlier phase drift is fixed. |
| 10B - Zyte Student Scrapy Cloud activation | BLOCKED | Blocked until entitlement confirmed; then one-unit deploy config, non-network smoke spider, verify no paid/Zyte API, job status/cancel/export/rollback, Amazon disabled. | Operator has confirmed entitlement outside repo. Repo already caps units at 1 and disables Zyte API/paid services. | Repo defaults still set `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=false`; Scrapy Cloud deploy workflow exits 1; Zyte runner is placeholder; no deploy config/smoke/job scripts. | `.env.example`, `apps/worker-api/wrangler.toml`, `crawler/scrapy.cfg`, `.github/workflows/deploy-scrapy-cloud.yml`, `crawler/sellerintel/runtime/scrapy_cloud.py`. | No Zyte command run by audit. | After phase-order reconciliation, update config for confirmed entitlement and implement no-network 10B smoke only. |
| 10C - GitHub Actions burst fallback | BLOCKED | Disabled manual fallback workflow, `workflow_dispatch` only, strict timeout/page budget, no auto schedule, confirmation input, warning. | CI exists; fallback docs say disabled. | No crawler burst workflow with confirmation input/page budget exists. Operator approval and included-minute confirmation missing. | `.github/workflows/ci-python.yml`, `.github/workflows/ci-web.yml`, `infra/github-actions-runner/README.md`, `crawler/sellerintel/runtime/github_actions.py`. | No Actions run triggered. | Keep disabled until spec-approved fallback work. |
| 10D - Credit-backed fallback | BLOCKED | Disabled deployment profile only, active credit, hard AUD 0 cap until amended, no paid add-ons, shutdown date, no CI deploy without approval. | Placeholder runtime and docs indicate disabled. | No provider config, budget enforcement beyond startup gates, or deployment profile. Requires explicit operator approval and credit facts. | `infra/credit-runner/README.md`, `crawler/sellerintel/runtime/credit_container.py`, `.env.example`. | Startup gates tested. | Keep prohibited unless master spec and budget flags are amended. |
| 11 - Provider-neutral orchestration | NOT STARTED | RunnerProvider sequential orchestration, one active production provider, status/fail/cancel, no provider switching, crawl_runs provider/status, daily summary, safe rerun, local fallback runbook. | Protocol exists. | No orchestrator implementation, no daily summary, no provider status integration. | `crawler/sellerintel/runtime/base.py`, `crawler/sellerintel/runtime/selector.py`. | No dedicated tests found. | Implement only after 10A/10B provider readiness. |
| 12 - Quota protection | PARTIALLY COMPLETE | D1/Worker/R2 estimates, stop before hard threshold, archive old history at 70%, dashboard warnings, tests. | `quota_state` schema exists; batch limits and zero-charge startup gates exist. | No quota accounting/circuit breaker, history archive automation, R2 op tracking, or dashboard quota warnings. | `database/migrations/operations/0002_runtime_controls.sql`, `apps/worker-api/src/ingestion/config.ts`, `apps/worker-api/src/validation/startup.ts`. | Startup/ingestion tests pass. | Build quota accounting before production ingestion. |
| 13 - Production hardening | NOT STARTED | Review auth/authz/secrets/HMAC/input/SQLi/XSS/SSRF/URL allowlist/source policy/masking/audit/retention/backups/free tier/incident; fix critical/high with tests. | Several security controls exist from earlier phases. | No formal Phase 13 review, no deployed auth/access, no backups, no production incident exercises. | `SECURITY.md`, `docs/incident-response.md`, `apps/worker-api/src/ingestion/*`, `crawler/sellerintel/config/features.py`. | Bandit and audits pass locally. | Run only after staging is functionally ready. |

## 7. Component implementation matrix

| Component | Implemented | Tested | Locally working | Staging deployed | Production deployed | Incomplete | Blocked | Evidence |
|---|---:|---:|---:|---:|---:|---|---|---|
| Repository and monorepo foundation | Yes | Yes | Yes | No | No | Uncommitted phase work | No | `package.json`, `pyproject.toml`, `pnpm-workspace.yaml`, `Makefile` |
| AGENTS.md rules | Yes | N/A | Yes | N/A | N/A | None found | No | `AGENTS.md` |
| Python crawler package | Partial | Yes | Yes for local modules | No | No | No live Scrapy implementation | Phase order/provider gates | `crawler/sellerintel/*` |
| Scrapy spiders | Partial | No dedicated live tests | No live crawl | No | No | Placeholder `LIVE_CRAWL_IMPLEMENTED=False` files | Live crawling disabled | `crawler/sellerintel/spiders/*` |
| Source adapters | Partial | Yes | Framework works | No | No | Real source implementations mostly absent | Source policy gates | `crawler/sellerintel/adapters/*` |
| Provider-neutral runner interface | Partial | Partial | Protocol exists | No | No | No orchestrator | Provider phases blocked | `crawler/sellerintel/runtime/base.py` |
| Zyte Scrapy Cloud runner | No | No | No | No | No | Placeholder only | Repo entitlement false; deploy blocked | `crawler/sellerintel/runtime/scrapy_cloud.py`, `.github/workflows/deploy-scrapy-cloud.yml` |
| Local runner | Partial | Yes | Dry-run smoke works | No | No | Docker not verified; no real Scrapy job | Live crawl disabled | `crawler/sellerintel/runtime/local.py`, `docs/local-runner.md` |
| GitHub Actions fallback runner | No | Startup gates only | No | No | No | No fallback workflow | Approval/minutes required | `infra/github-actions-runner/README.md`, `crawler/sellerintel/runtime/github_actions.py` |
| Credit-backed fallback runner | No | Startup gates only | No | No | No | No deployment profile | Prohibited without spec/budget change | `infra/credit-runner/README.md`, `crawler/sellerintel/runtime/credit_container.py` |
| Extraction and normalization | Yes | Yes | Yes | No | No | Source coverage will need expansion | No | `crawler/sellerintel/extractors/*`, `crawler/sellerintel/normalization/*` |
| Seller/entity resolution | Yes | Yes | Yes | No | No | No deployed merge execution | Phase-order drift | `crawler/sellerintel/entity_resolution/*` |
| Confidence and quality scoring | Partial | Partial | Contact and entity scores work | No | No | Full seller quality/manufacturer/trader scoring not implemented | No | `crawler/sellerintel/extractors/models.py`, `crawler/sellerintel/entity_resolution/resolver.py`, `crawler/sellerintel/scoring/__init__.py` |
| Contact extraction | Yes | Yes | Yes | No | No | None for fixture scope | No | `crawler/sellerintel/extractors/*` |
| Evidence handling | Partial | Yes for hash/object key | Local only | No | No | R2 upload disabled | R2/Cloudflare phase | `crawler/sellerintel/adapters/official_site/enrichment.py`, `crawler/sellerintel/clients/r2.py` |
| Spool and retry handling | Yes | Yes | Yes | No | No | No production replay ops | No | `crawler/sellerintel/spool/*`, `crawler/sellerintel/clients/ingestion.py` |
| Cloudflare Worker API | Partial | Yes | Health/ingest tests work | No | No | Dashboard/search/evidence APIs missing | Cloudflare config missing | `apps/worker-api/src/*` |
| Dashboard | Partial | Yes | Static build works | No | No | No Access/live API | Cloudflare Access missing | `apps/dashboard/*` |
| Contracts and shared types | Partial | Yes | Yes | No | No | Shared types minimal; schema generation process not documented | No | `packages/contracts/ingestion-batch.schema.json`, `packages/shared-types/src/runtime.ts` |
| Core D1 database | Yes locally | Yes | SQLite migration tests | Unknown | Unknown | Not provisioned from repo evidence | Cloudflare phase | `database/migrations/core/*` |
| Contacts D1 database | Yes locally | Yes | SQLite migration tests | Unknown | Unknown | Not provisioned from repo evidence | Cloudflare phase | `database/migrations/contacts/*` |
| Operations D1 database | Yes locally | Yes | SQLite migration tests | Unknown | Unknown | Not provisioned from repo evidence | Cloudflare phase | `database/migrations/operations/*` |
| History D1 database | Yes locally | Yes | SQLite migration tests | Unknown | Unknown | Not provisioned from repo evidence | Cloudflare phase | `database/migrations/history/*` |
| Migrations | Yes locally | Yes | Yes | No | No | No Wrangler migration binding config | Cloudflare phase | `database/migrations/*` |
| FTS/search | Partial | Yes locally | FTS migration/rebuild exists | No | No | No Worker search route | Cloudflare/API phase | `database/migrations/core/0003_search_fts.sql`, `database/queries/rebuild_core_fts_after_restore.sql` |
| R2 storage | No | No | No | Unknown | Unknown | Upload client disabled | Cloudflare phase | `crawler/sellerintel/clients/r2.py` |
| Authentication and Cloudflare Access | No | No | No | Unknown | Unknown | No Access config or app auth | Cloudflare phase | `infra/cloudflare/README.md`, `apps/dashboard/app/layout.tsx` |
| CI | Yes | Not run remotely | Local equivalent passed | GitHub configured | Unknown remote runs | Deployment workflows stale/blocked | No | `.github/workflows/ci-python.yml`, `.github/workflows/ci-web.yml` |
| Deployment workflows | Partial | No | Disabled by design | No | No | Worker/Pages/DB workflows exit 1 with stale Phase 0 text | Approval required | `.github/workflows/deploy-*.yml`, `.github/workflows/database-migrations.yml` |
| Monitoring | Partial | Yes for health payload | Local health test works | No | No | No deployed health checks/alerts | Deployment missing | `apps/worker-api/src/observability/health.ts`, `.github/workflows/daily-health-check.yml` |
| Backup and restore | Partial | Migration restore docs | FTS SQL exists | No | No | No automated backups/export jobs | Cloudflare phase | `database/ROLLBACK.md`, `database/queries/rebuild_core_fts_after_restore.sql` |
| Documentation | Partial | N/A | Yes | N/A | N/A | Some stale Phase 0 docs and incorrect phase status | No | `README.md`, `CHANGELOG.md`, `docs/*`, `infra/*` |
| Security controls | Partial | Yes locally | Yes | No | No | No Access, encryption/key management, prod hardening | Production phase | `SECURITY.md`, `apps/worker-api/src/ingestion/*`, `crawler/sellerintel/config/features.py` |
| Zero-charge controls | Yes | Yes | Yes | No | No | Entitlement fact not reflected | Zyte 10B config | `.env.example`, `apps/worker-api/wrangler.toml`, `crawler/sellerintel/config/features.py` |

## 8. Completed features

- Phase 0 monorepo bootstrap and local validation foundation.
- Partitioned local D1-compatible schema migrations for core, contacts, operations, and history.
- Local migration tests including FTS restore coverage.
- Worker health route and secure ingestion route with HMAC, nonce replay protection, idempotency, batch limits, gzip support, and structured errors.
- Python ingestion contracts, deterministic serialization/gzip, signed client, retry/backoff, and spool/replay handling.
- Contact extractors for email, phone, WhatsApp, and WeChat with fixture coverage above 90%.
- Company, address, country, domain, phone, text, and hash normalization.
- Source adapter policy framework and startup gates.
- Entity-resolution scoring, thresholds, review payloads, and rollback audit metadata.
- Static dashboard screens with masked fixture data and successful static build.
- Zero-charge startup gates for Python and Worker runtime state.

## 9. Partially completed features

- Official-site enrichment: local URL planning, canonicalization, content hash, and evidence object keys exist; R2 upload and live crawl execution do not.
- Dashboard: pages exist, but authentication, live Worker data, and dashboard Worker endpoints do not.
- Local runner: dry-run and lock/spool readiness exist; real Scrapy runner/Docker verification is not complete.
- Quota protection: schema and batch limits exist; quota accounting, threshold enforcement, archive automation, and dashboard warnings do not.
- Security: local HMAC/masking/gates exist; Cloudflare Access, key management, production hardening, and backup validation are not complete.

## 10. Not-started features

- Zyte Scrapy Cloud deploy/run/status/cancel/export workflow.
- GitHub Actions crawler burst fallback workflow.
- Credit-backed fallback runner deployment profile.
- Provider-neutral production orchestrator and daily summary.
- Cloudflare Access configuration.
- R2 evidence upload.
- Worker dashboard/search/export/suppression/reveal APIs.
- Staging and production deployment.

## 11. Blockers

- Phase status drift: documentation says Phase 10A, but Phase 7 is the first incomplete master-spec phase.
- R2 evidence upload is explicitly disabled in `crawler/sellerintel/clients/r2.py`.
- Scrapy spiders are placeholders and no live source crawling is implemented.
- Dashboard is static fixture-based and unauthenticated.
- Zyte Student entitlement is confirmed by the operator but not reflected in repo defaults.
- Cloudflare D1/R2/Pages/Access resources are not proven to exist from repo evidence.
- The working tree is dirty; only Phase 0 is committed.
- `make` is not installed, so the aggregate Makefile target cannot be run in this environment.
- `crawler/requirements.txt` is stale relative to `pyproject.toml`.

## 12. Architecture drift and specification conflicts

- `README.md` and `CHANGELOG.md` mark later phases as active/implemented, but Phase 7, Phase 9, and Phase 10A are partial against the frozen specification.
- `SELLER_INTELLIGENCE_MASTER_SPEC.md.md` duplicates the authoritative spec byte-for-byte. It is not harmful, but it creates a second spec-shaped file that should not become a competing source of truth.
- `infra/cloudflare/README.md`, `.github/workflows/deploy-worker.yml`, `.github/workflows/deploy-pages.yml`, and `.github/workflows/database-migrations.yml` still contain Phase 0 blocker wording after local Phase 1+ implementation.
- `crawler/requirements.txt` lists only `pydantic`, while `pyproject.toml` also requires `phonenumbers`.
- The architecture calls for a Scrapy crawler package, but spiders are placeholders and Scrapy is not yet a runtime dependency.
- The dashboard spec requires data through the Worker API and authentication; current dashboard code imports local fixture arrays and has no auth boundary.
- Phase 7 requires evidence upload; current code creates object keys but disables upload.
- The confirmed Zyte Student entitlement is not reflected by `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true` in repo configuration.

## 13. Git and commit history summary

- Branch: `main`.
- Remote: `origin https://github.com/getRabbi/seller_crawler.git`.
- HEAD: `d8c2850ca58952cd33008d6498c3beeb75a1c25d`.
- Commit history: one commit, `Phase 0 repository bootstrap`.
- Tags: none.
- Working tree: many modified and untracked files representing uncommitted implementation beyond Phase 0.
- Relevant commit hashes: only Phase 0 has a commit hash. Phases 1 through 10A implementation evidence is in the uncommitted working tree and cannot be tied to individual commits.

## 14. Full environment-variable inventory

Actual process-environment scan during audit: all project-specific variables in this inventory were `MISSING`. The table's current state describes repository/default state: `SET` means an explicit safe default exists in tracked config; `PLACEHOLDER` means a blank/example value exists; `MISSING` means code reads it but repo default config does not define it; `UNUSED` means it appears in config/docs but no code read was found.

| Variable | Component using it | Exact file paths where read or referenced | Purpose | Secret | Required | Scope | Current state | Safe default | Obtain from | Configure in | Fails without it | Security notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `APP_ENV` | Worker ingestion/source policy | `.env.example`; `apps/worker-api/wrangler.toml`; `apps/worker-api/src/ingestion/config.ts`; `apps/worker-api/src/ingestion/source-policy.ts` | Local/staging/production behavior selection. | No | Now for Worker defaults | Local/staging/prod/CI | SET | `local` | Operator | `.env`, Wrangler vars, CI | No for health; affects source policy | Production with sources requires allowed domains. |
| `RUNNER_MODE` | Python/Worker startup gates | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts`; `Dockerfile` | Select locked/local/Zyte/fallback runtime. | No | Now | Local/staging/prod/CI | SET | `development_locked` | Operator | `.env`, Wrangler vars, runtime env | Invalid value fails startup validation | Can activate provider paths if changed. |
| `LIVE_CRAWL_ENABLED` | Python/Worker gates; local runner | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts`; `Dockerfile`; `docs/local-runner.md` | Global live-crawl switch. | No | Now | All | SET | `false` | Operator | `.env`, Wrangler vars, runtime env | Startup blocks true in development mode | Must remain false until approved phase. |
| `PAID_SERVICES_ALLOWED` | Python/Worker gates | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts`; `Dockerfile`; `SECURITY.md` | Master paid-service lock. | No | Now | All | SET | `false` | Operator | `.env`, Wrangler vars, CI/runtime | No; false is accepted | Must remain false unless spec amended. |
| `MAX_EXTERNAL_MONTHLY_SPEND_AUD` | Python/Worker gates | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Hard zero spend assertion. | No | Now | All | SET | `0` | Operator | `.env`, Wrangler vars | Startup blocks nonzero while paid locked | Must remain 0. |
| `ALLOW_EXTRA_SCRAPY_UNITS` | Python/Worker gates | `.env.example`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Permit more than one Scrapy Cloud unit. | No | Later/prohibited | All | SET | `false` | Operator/spec amendment | `.env`, CI/runtime | Startup blocks true while paid locked | Must remain false. |
| `ALLOW_PAID_GITHUB_ACTIONS_MINUTES` | Python/Worker gates | `.env.example`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Permit paid Actions minutes. | No | Later/prohibited | CI | SET | `false` | Operator/spec amendment | CI vars | Startup blocks true while paid locked | Must remain false. |
| `ALLOW_PAID_ADDONS` | Python/Worker gates | `.env.example`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Permit paid add-ons. | No | Later/prohibited | All | SET | `false` | Operator/spec amendment | `.env`, CI/runtime | Startup blocks true while paid locked | Must remain false. |
| `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED` | Python/Worker Zyte gate | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Confirms one free Scrapy Cloud unit. | No | Required for Phase 10B | Local/CI/Zyte | SET but wrong value | `true` after confirmed support fact | Zyte Support/operator | `.env`, Wrangler vars, CI/runtime | Zyte mode blocks if false | Current repo default is false, conflicting with operator fact. |
| `SCRAPY_CLOUD_DEPLOY_ENABLED` | Python/Worker Zyte gate | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts`; `Dockerfile` | Permit Scrapy Cloud deployment. | No | Later Phase 10B | CI/Zyte | SET | `false` | Operator after Phase 10B approval | CI/runtime | Zyte mode blocks if false | Keep false until non-network 10B smoke is ready. |
| `SCRAPY_CLOUD_MAX_UNITS` | Python/Worker zero-charge gate | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Enforce exactly one Scrapy Cloud unit. | No | Required for Phase 10B | CI/Zyte | SET | `1` | Operator/Zyte dashboard | `.env`, CI/runtime | Startup blocks >1 while paid locked; Zyte mode blocks not equal 1 | Correctly reflects confirmed one-unit fact. |
| `ZYTE_API_ENABLED` | Python/Worker gates; optional client | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts`; `crawler/sellerintel/clients/optional_zyte_api.py`; `Dockerfile` | Blocks PAYG Zyte API. | No | Now/prohibited | All | SET | `false` | Operator/spec amendment only | `.env`, CI/runtime | Startup blocks true while paid locked | Must remain false. |
| `ZYTE_API_DAILY_REQUEST_BUDGET` | Python/Worker gates | `.env.example`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Zyte API request budget. | No | Prohibited now | All | SET | `0` | Operator/spec amendment only | `.env`, CI/runtime | Startup blocks nonzero while paid locked | Must remain 0. |
| `ZYTE_API_MONTHLY_BUDGET_USD` | Python/Worker gates | `.env.example`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Zyte API spend budget. | No | Prohibited now | All | SET | `0` | Operator/spec amendment only | `.env`, CI/runtime | Startup blocks nonzero while paid locked | Must remain 0. |
| `GITHUB_ACTIONS_CRAWLER_ENABLED` | Python/Worker gates | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts`; `Dockerfile` | Enable Actions crawler fallback. | No | Later optional | CI | SET | `false` | Operator | CI vars | No while false | Could create CI usage; keep false. |
| `GITHUB_ACTIONS_INCLUDED_MINUTES_CONFIRMED` | Python/Worker gates | `.env.example`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Confirm no paid Actions minutes. | No | Later optional | CI | SET | `false` | GitHub plan/operator | CI vars | Fallback mode blocks if false | Required before 10C. |
| `CREDIT_RUNNER_ENABLED` | Python/Worker gates | `.env.example`; `apps/worker-api/wrangler.toml`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts`; `Dockerfile` | Enable credit-backed fallback. | No | Later/prohibited | CI/runtime | SET | `false` | Operator/spec amendment | CI/runtime | Startup blocks true while paid locked | Must remain false. |
| `CREDIT_RUNNER_MONTHLY_CAP_AUD` | Python/Worker gates | `.env.example`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Credit runner cap. | No | Later/prohibited | CI/runtime | SET | `0` | Operator/spec amendment | CI/runtime | Not currently blocking if false | Must remain 0 until amended. |
| `CREDIT_RUNNER_AUTO_SHUTDOWN` | Python/Worker gates | `.env.example`; `crawler/sellerintel/config/features.py`; `apps/worker-api/src/validation/startup.ts` | Auto-shutdown guard. | No | Later optional | CI/runtime | SET | `true` | Operator | CI/runtime | No while runner false | Required if 10D ever enabled. |
| `ENABLE_AMAZON` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py`; `crawler/sellerintel/config/sources.py` | Amazon adapter flag. | No | Prohibited now | Runtime | SET | `false` | Operator/spec amendment | `.env`/runtime | No while false | Must remain false; Amazon disabled by spec. |
| `ENABLE_ALIBABA` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py`; `crawler/sellerintel/config/sources.py` | Alibaba adapter flag. | No | Later optional | Runtime | SET | `false` | Operator | `.env`/runtime | No while false | Live source risk. |
| `ENABLE_1688` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py`; `crawler/sellerintel/config/sources.py` | 1688 adapter flag. | No | Later optional | Runtime | SET | `false` | Operator | `.env`/runtime | No while false | Live source risk. |
| `ENABLE_BUSINESS_REGISTRY` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py`; `crawler/sellerintel/config/sources.py` | Business registry adapter flag. | No | Later | Runtime | SET | `true` | Operator | `.env`/runtime | No | No live implementation yet. |
| `ENABLE_OFFICIAL_WEBSITE` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py`; `crawler/sellerintel/config/sources.py` | Official website adapter flag. | No | Phase 7 | Runtime | SET | `true` | Operator | `.env`/runtime | No | Does not enable live crawling by itself. |
| `ENABLE_SEARCH_DISCOVERY` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py`; `crawler/sellerintel/config/sources.py` | Search discovery adapter flag. | No | Later optional | Runtime | SET | `false` | Operator/spec approval | `.env`/runtime | No | Could cause source discovery crawl risk. |
| `ENABLE_LOCAL_PLAYWRIGHT` | Python local runner gate | `.env.example`; `crawler/sellerintel/config/features.py`; `crawler/sellerintel/runtime/local.py` | Allow local browser automation. | No | Later optional | Local | SET | `false` | Operator | `.env` | Local smoke blocks true | Keep false for fixture smoke. |
| `ENABLE_EMAIL_EXTRACTION` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py` | Email extraction toggle. | No | Now | Runtime | SET | `true` | Operator | `.env` | No | Safe local parsing. |
| `ENABLE_PHONE_EXTRACTION` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py` | Phone extraction toggle. | No | Now | Runtime | SET | `true` | Operator | `.env` | No | Safe local parsing. |
| `ENABLE_WHATSAPP_EXTRACTION` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py` | WhatsApp extraction toggle. | No | Now | Runtime | SET | `true` | Operator | `.env` | No | Safe local parsing. |
| `ENABLE_WECHAT_EXTRACTION` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py` | WeChat extraction toggle. | No | Now | Runtime | SET | `true` | Operator | `.env` | No | Safe local parsing. |
| `ENABLE_AI_SUMMARY` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py` | AI summary toggle. | No | Later/prohibited | Runtime | SET | `false` | Operator/spec amendment | `.env` | No | Could activate paid API if implemented; keep false. |
| `ENABLE_OUTREACH` | Python feature flags | `.env.example`; `crawler/sellerintel/config/features.py` | Outreach toggle. | No | Later/prohibited | Runtime | SET | `false` | Operator/spec approval | `.env` | No | Must not expose/contact people accidentally. |
| `GLOBAL_CRAWL_KILL_SWITCH` | Python feature/local runner | `.env.example`; `crawler/sellerintel/config/features.py`; `crawler/sellerintel/runtime/local.py` | Emergency crawl stop. | No | Now | All runtime | SET | `false` | Operator | `.env`/runtime | Local smoke blocks if true | Set true to pause crawling. |
| `INGESTION_API_URL` | Local runner | `.env.example`; `crawler/sellerintel/runtime/local.py` | Legacy/fallback ingestion endpoint name. | No | Later local non-dry-run | Local | SET | local Worker URL | Operator/local Worker | `.env` | No in dry-run | Duplicate with `INGESTION_ENDPOINT_URL`. |
| `INGESTION_ENDPOINT_URL` | Local runner | `.env.example`; `crawler/sellerintel/runtime/local.py` | Primary ingestion endpoint URL. | No | Later local non-dry-run | Local/staging/prod | SET | local Worker URL | Worker deployment/operator | `.env`/runtime | Required when `LOCAL_RUNNER_DRY_RUN=false` | Could submit data if non-dry-run. |
| `INGESTION_HMAC_SECRET` | Worker ingestion/local runner | `.env.example`; `crawler/sellerintel/runtime/local.py`; `apps/worker-api/src/ingestion/config.ts`; `apps/worker-api/src/ingestion/route.ts` | HMAC signing secret for ingestion. | Yes | Required for non-dry-run ingestion/staging/prod | Local/staging/prod/CI secrets | PLACEHOLDER | blank in examples | Operator secret generator | `.env`, Wrangler secret, CI secret | Worker ingest returns 503 if missing; local non-dry-run blocks if missing | Never expose to dashboard/logs. |
| `INGESTION_ALLOWED_SOURCE_DOMAINS` | Worker source policy | `.env.example`; `apps/worker-api/wrangler.toml`; `apps/worker-api/src/ingestion/config.ts`; `apps/worker-api/src/ingestion/source-policy.ts` | Comma-separated allowed source domains in production. | No | Required when production ingests sources | Staging/prod | PLACEHOLDER | blank local | Operator/source policy | Wrangler vars/CI | Production source batches fail if blank with sources | Prevents broad source ingestion. |
| `INGESTION_SPOOL_DIR` | None found | `.env.example` | Intended spool directory name. | No | Not required | Local | UNUSED | `spool/ingestion` | N/A | N/A | No | Code uses `LOCAL_SPOOL_DIR` instead. |
| `SELLERINTEL_WORKSPACE_ROOT` | Local runner | `.env.example`; `crawler/sellerintel/runtime/local.py` | Root used to constrain lock/spool paths. | No | Optional local | Local | SET | `.` | Operator | `.env`/runtime | No | Prevents path escape. |
| `LOCAL_SPOOL_DIR` | Local runner/spool | `.env.example`; `crawler/sellerintel/runtime/local.py` | Durable local spool directory. | No | Now for local runner | Local | SET | `.sellerintel/spool` | Operator | `.env`/runtime | No | Must stay within workspace. |
| `LOCAL_RUNNER_LOCK_PATH` | Local runner | `.env.example`; `crawler/sellerintel/runtime/local.py` | Exclusive one-job lock path. | No | Now for local runner | Local | SET | `.sellerintel/local-runner.lock` | Operator | `.env`/runtime | No | Must stay within workspace. |
| `LOCAL_RUNNER_FIXTURE_ONLY` | Local runner | `.env.example`; `crawler/sellerintel/runtime/local.py`; `docs/local-runner.md` | Fixture-only guard. | No | Now | Local | SET | `true` | Operator | `.env`/runtime | Development mode blocks false | Keep true until approved live mode. |
| `LOCAL_RUNNER_DRY_RUN` | Local runner | `.env.example`; `crawler/sellerintel/runtime/local.py`; `Dockerfile`; `docs/local-runner.md` | Avoid Worker submission. | No | Now | Local | SET | `true` | Operator | `.env`/runtime | No; false needs endpoint/HMAC | False can submit data. |
| `MAX_BATCH_SELLERS` | Worker ingestion | `.env.example`; `apps/worker-api/wrangler.toml`; `apps/worker-api/src/ingestion/config.ts` | Batch seller limit. | No | Now | Worker | SET | `25` | Operator | Wrangler vars | No; default used | Prevents oversized writes. |
| `MAX_BATCH_CONTACTS` | Worker ingestion | `.env.example`; `apps/worker-api/wrangler.toml`; `apps/worker-api/src/ingestion/config.ts` | Batch contact limit. | No | Now | Worker | SET | `100` | Operator | Wrangler vars | No; default used | Prevents oversized writes. |
| `MAX_BATCH_D1_STATEMENTS` | Worker ingestion | `.env.example`; `apps/worker-api/wrangler.toml`; `apps/worker-api/src/ingestion/config.ts` | Max records/statements per batch. | No | Now | Worker | SET | `20` | Operator | Wrangler vars | No; default used | Protects D1 quotas. |
| `MAX_COMPRESSED_BODY_BYTES` | Worker ingestion | `.env.example`; `apps/worker-api/wrangler.toml`; `apps/worker-api/src/ingestion/config.ts` | Max compressed request body. | No | Now | Worker | SET | `262144` | Operator | Wrangler vars | No; default used | Protects Worker memory. |
| `MAX_UNCOMPRESSED_BODY_BYTES` | Worker ingestion | `.env.example`; `apps/worker-api/wrangler.toml`; `apps/worker-api/src/ingestion/config.ts` | Max decompressed request body. | No | Now | Worker | SET | `1048576` | Operator | Wrangler vars | No; default used | Protects Worker memory. |
| `R2_UPLOAD_URL_OR_SIGNING_ROUTE` | None found | `.env.example` | Future R2 upload/signing route placeholder. | Depends on implementation | Later | Staging/prod | UNUSED | blank | Cloudflare/operator | Future env/secret | No | Do not expose signing capability to dashboard. |
| `BROWSER_PROFILE_PATH` | Local runner forbidden-env guard | `crawler/sellerintel/runtime/local.py` | Detect forbidden browser profile use. | Yes/path-sensitive | Prohibited | Local | MISSING | unset | Do not obtain | Do not configure | Local runner blocks if set | Must remain unset; no credential/cookie harvesting. |
| `CHROME_USER_DATA_DIR` | Local runner forbidden-env guard | `crawler/sellerintel/runtime/local.py` | Detect forbidden Chrome profile use. | Yes/path-sensitive | Prohibited | Local | MISSING | unset | Do not obtain | Do not configure | Local runner blocks if set | Must remain unset. |
| `FIREFOX_PROFILE_PATH` | Local runner forbidden-env guard | `crawler/sellerintel/runtime/local.py` | Detect forbidden Firefox profile use. | Yes/path-sensitive | Prohibited | Local | MISSING | unset | Do not obtain | Do not configure | Local runner blocks if set | Must remain unset. |
| `COOKIE_FILE` | Local runner forbidden-env guard | `crawler/sellerintel/runtime/local.py` | Detect forbidden cookie-file use. | Yes | Prohibited | Local | MISSING | unset | Do not obtain | Do not configure | Local runner blocks if set | Must remain unset; no cookie harvesting. |
| `CORE_DB` | Worker D1 binding | `apps/worker-api/src/validation/startup.ts`; `apps/worker-api/src/ingestion/route.ts` | Core database binding. | Binding name no; data sensitive | Required for ingestion deploy | Local tests/staging/prod | MISSING | test mock only | Cloudflare D1 | `wrangler.toml` D1 binding, CI/cloud env | Ingest returns 503 if missing | Never expose direct DB access. |
| `CONTACTS_DB` | Worker D1 binding | `apps/worker-api/src/validation/startup.ts`; `apps/worker-api/src/ingestion/route.ts` | Contacts database binding. | Binding name no; data sensitive | Required for ingestion deploy | Local tests/staging/prod | MISSING | test mock only | Cloudflare D1 | `wrangler.toml` D1 binding | Ingest returns 503 if missing | Contains personal contact data; access tightly. |
| `OPS_DB` | Worker D1 binding | `apps/worker-api/src/validation/startup.ts`; `apps/worker-api/src/ingestion/route.ts` | Operations database binding. | Binding name no | Required for ingestion deploy | Local tests/staging/prod | MISSING | test mock only | Cloudflare D1 | `wrangler.toml` D1 binding | Ingest returns 503 if missing | Stores idempotency/nonces/source controls. |
| `HISTORY_DB` | Worker D1 binding | `apps/worker-api/src/validation/startup.ts`; `apps/worker-api/src/ingestion/route.ts` | Recent history database binding. | Binding name no; data sensitive | Required for ingestion deploy | Local tests/staging/prod | MISSING | test mock only | Cloudflare D1 | `wrangler.toml` D1 binding | Ingest returns 503 if missing | Retention policy required before prod. |
| `PYTHONUNBUFFERED` | Docker runtime | `Dockerfile` | Python stdout behavior in container. | No | Local Docker/future runners | Local/CI/Zyte/fallback | SET | `1` | Dockerfile | Dockerfile/runtime | No | Safe. |
| `PYTHONDONTWRITEBYTECODE` | Docker runtime | `Dockerfile` | Avoid pyc writes in container. | No | Local Docker/future runners | Local/CI/Zyte/fallback | SET | `1` | Dockerfile | Dockerfile/runtime | No | Safe. |
| `PYTHONPATH` | Docker/local runner docs | `Dockerfile`; `docs/local-runner.md` | Make `crawler/sellerintel` importable. | No | Local runner if not using `uv --directory` | Local/Docker | SET in Docker, manual locally | `/app/crawler` or `crawler` | Operator | shell/Dockerfile | Local module run may fail without it | Safe path only. |

Environment inventory notes:

- Referenced in code but missing from `.env.example`: `CORE_DB`, `CONTACTS_DB`, `OPS_DB`, `HISTORY_DB`, `BROWSER_PROFILE_PATH`, `CHROME_USER_DATA_DIR`, `FIREFOX_PROFILE_PATH`, `COOKIE_FILE`. The D1 bindings belong in Wrangler configuration, not `.env.example`; the browser/cookie variables are intentionally absent and prohibited.
- Present in `.env.example` but unused by code: `INGESTION_SPOOL_DIR`, `R2_UPLOAD_URL_OR_SIGNING_ROUTE`.
- Duplicate/conflicting endpoint names: `INGESTION_ENDPOINT_URL` and `INGESTION_API_URL`; code prefers `INGESTION_ENDPOINT_URL` then falls back to `INGESTION_API_URL`.
- Deprecated variables: none explicitly marked deprecated.
- Variables that can accidentally enable live crawling: `LIVE_CRAWL_ENABLED`, `RUNNER_MODE`, `LOCAL_RUNNER_DRY_RUN`, `LOCAL_RUNNER_FIXTURE_ONLY`, `ENABLE_OFFICIAL_WEBSITE`, `ENABLE_BUSINESS_REGISTRY`, `ENABLE_ALIBABA`, `ENABLE_1688`, `ENABLE_SEARCH_DISCOVERY`, `ENABLE_LOCAL_PLAYWRIGHT`, `SCRAPY_CLOUD_DEPLOY_ENABLED`, `GITHUB_ACTIONS_CRAWLER_ENABLED`, `CREDIT_RUNNER_ENABLED`.
- Variables that can activate paid services: `PAID_SERVICES_ALLOWED`, `MAX_EXTERNAL_MONTHLY_SPEND_AUD`, `ALLOW_EXTRA_SCRAPY_UNITS`, `SCRAPY_CLOUD_MAX_UNITS`, `ZYTE_API_ENABLED`, `ZYTE_API_DAILY_REQUEST_BUDGET`, `ZYTE_API_MONTHLY_BUDGET_USD`, `ALLOW_PAID_GITHUB_ACTIONS_MINUTES`, `ALLOW_PAID_ADDONS`, `CREDIT_RUNNER_ENABLED`, `CREDIT_RUNNER_MONTHLY_CAP_AUD`.
- Variables that should remain false now: `LIVE_CRAWL_ENABLED`, `PAID_SERVICES_ALLOWED`, `ALLOW_EXTRA_SCRAPY_UNITS`, `ALLOW_PAID_GITHUB_ACTIONS_MINUTES`, `ALLOW_PAID_ADDONS`, `SCRAPY_CLOUD_DEPLOY_ENABLED`, `ZYTE_API_ENABLED`, `GITHUB_ACTIONS_CRAWLER_ENABLED`, `CREDIT_RUNNER_ENABLED`, `ENABLE_AMAZON`, `ENABLE_ALIBABA`, `ENABLE_1688`, `ENABLE_SEARCH_DISCOVERY`, `ENABLE_LOCAL_PLAYWRIGHT`, `ENABLE_AI_SUMMARY`, `ENABLE_OUTREACH`.
- Values that must never be exposed to the dashboard: `INGESTION_HMAC_SECRET`, any future Cloudflare API token, any future Scrapy Cloud credential, raw contact values, contact ciphertext, contact hashes when not needed, D1 direct access credentials, browser profile paths, cookie-file paths.

## 15. Copy-ready ENV setup checklist

Required immediately for local development:

```text
APP_ENV=local
RUNNER_MODE=development_locked
LIVE_CRAWL_ENABLED=false
PAID_SERVICES_ALLOWED=false
MAX_EXTERNAL_MONTHLY_SPEND_AUD=0
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
LOCAL_RUNNER_FIXTURE_ONLY=true
LOCAL_RUNNER_DRY_RUN=true
LOCAL_SPOOL_DIR=.sellerintel/spool
LOCAL_RUNNER_LOCK_PATH=.sellerintel/local-runner.lock
```

Required for Cloudflare staging:

```text
APP_ENV=staging
RUNNER_MODE=development_locked
LIVE_CRAWL_ENABLED=false
PAID_SERVICES_ALLOWED=false
ZYTE_API_ENABLED=false
SCRAPY_CLOUD_MAX_UNITS=1
INGESTION_HMAC_SECRET=<set as Wrangler secret>
INGESTION_ALLOWED_SOURCE_DOMAINS=<comma-separated approved domains if source ingestion is enabled>
CORE_DB=<D1 binding>
CONTACTS_DB=<D1 binding>
OPS_DB=<D1 binding>
HISTORY_DB=<D1 binding>
```

Required for Cloudflare production:

```text
APP_ENV=production
RUNNER_MODE=<approved production runner mode only>
LIVE_CRAWL_ENABLED=false until approved
PAID_SERVICES_ALLOWED=false
MAX_EXTERNAL_MONTHLY_SPEND_AUD=0
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
INGESTION_HMAC_SECRET=<production Wrangler secret>
INGESTION_ALLOWED_SOURCE_DOMAINS=<approved production source domains>
CORE_DB=<production D1 binding>
CONTACTS_DB=<production D1 binding>
OPS_DB=<production D1 binding>
HISTORY_DB=<production D1 binding>
```

Required for the one free Zyte Student unit:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
ALLOW_EXTRA_SCRAPY_UNITS=false
ZYTE_API_DAILY_REQUEST_BUDGET=0
ZYTE_API_MONTHLY_BUDGET_USD=0
ENABLE_AMAZON=false
```

Required for CI now:

```text
No production secrets are required for the current lint/type/test/build CI.
Keep all provider/deploy flags false.
```

Required only for optional fallback runners:

```text
GITHUB_ACTIONS_CRAWLER_ENABLED=false
GITHUB_ACTIONS_INCLUDED_MINUTES_CONFIRMED=false
ALLOW_PAID_GITHUB_ACTIONS_MINUTES=false
CREDIT_RUNNER_ENABLED=false
CREDIT_RUNNER_MONTHLY_CAP_AUD=0
CREDIT_RUNNER_AUTO_SHUTDOWN=true
```

Currently prohibited or intentionally disabled:

```text
PAID_SERVICES_ALLOWED=false
LIVE_CRAWL_ENABLED=false
ZYTE_API_ENABLED=false
ALLOW_EXTRA_SCRAPY_UNITS=false
ALLOW_PAID_GITHUB_ACTIONS_MINUTES=false
ALLOW_PAID_ADDONS=false
ENABLE_AMAZON=false
ENABLE_LOCAL_PLAYWRIGHT=false
ENABLE_AI_SUMMARY=false
ENABLE_OUTREACH=false
BROWSER_PROFILE_PATH unset
CHROME_USER_DATA_DIR unset
FIREFOX_PROFILE_PATH unset
COOKIE_FILE unset
```

Confirmed Zyte setup controls:

| Intended value | Exists in repo | Enforced | Audit result |
|---|---:|---:|---|
| `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true` | Yes, but default is `false` | Yes in Python/Worker Zyte mode | Not correctly reflected. |
| `SCRAPY_CLOUD_MAX_UNITS=1` | Yes | Yes | Correct. |
| `ZYTE_API_ENABLED=false` | Yes | Yes | Correct. |
| `PAID_SERVICES_ALLOWED=false` | Yes | Yes | Correct. |

## 16. Full MCP and external-tool inventory

No repository MCP configuration file was found. `.codex` does not exist. `.agents` exists but is empty. The only Codex-related project file found is `docs/codex-prompts.md`.

| MCP/tool/integration | Configured or missing | Required or optional | Purpose | Phase needed | Installation/configuration method | Auth method | Permission scopes | Required env vars | Local config location | Test command | Security risks | Can Codex continue without it |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Repository filesystem/shell | Configured by Codex session | Required | Local audit, tests, file edits | All | Built into workspace | Session sandbox | Workspace read/write | None | N/A | `Get-ChildItem -Force` | Accidental file changes | No for local work |
| Git CLI | Configured | Required | Status/history/diffs/commit later | All | Installed CLI | Local repo credentials for remote | Repo read/write when pushing | None | `.git`, remote `origin` | `git status --short --branch` | Accidental push/reset | Yes for code edits, not for final delivery |
| GitHub remote/Actions | Configured remote; Actions workflows present | Required for CI/PR later | CI and future fallback | Phase 0, 10C | GitHub repo + workflows | GitHub auth/token | Repo/actions scopes | Future CI secrets only | `.github/workflows/*` | `gh auth status` or GitHub UI, not run in audit | Paid minutes if fallback misused | Yes until PR/CI work |
| GitHub MCP/app | Not found in repo config | Optional | PR/issue automation | Collaboration only | Codex plugin/session, not repo | GitHub OAuth/token | Repo read/write depending task | None in repo | None | App-specific | Overbroad repo access | Yes |
| Python 3.12 | Configured/working | Required | Crawler/tests | All Python phases | Install Python 3.12 | None | Local execution | `PYTHONPATH` sometimes | `pyproject.toml` | `python --version` | Local code execution | No for crawler work |
| uv | Configured/working | Required | Python dependency/test runner | All Python phases | Install `uv` | None | Local package install | None | `pyproject.toml`, `uv.lock` | `uv run pytest crawler/tests` | Dependency supply chain | No for Python checks |
| Node/npm | Configured/working | Required | Worker/dashboard/packages | Worker/dashboard phases | Install Node/npm | None | Local package install | None | `package.json`, `package-lock.json` | `npm.cmd run test` | Dependency supply chain | No for web checks |
| pnpm | Workspace file exists, no lockfile | Optional/not currently used | Alternate workspace manager | None now | Install pnpm if project standardizes | None | Local package install | None | `pnpm-workspace.yaml` | `pnpm --version` | Lockfile drift | Yes |
| Make | Missing | Optional aggregate | Run grouped local checks | All local validation | Install GNU Make or use direct commands | None | Local execution | None | `Makefile` | `make test` | None beyond command execution | Yes; direct commands passed |
| Docker | Dockerfile present; not verified in audit | Required later for shared runner artifact | Local/Zyte/Actions/credit runner image | 10A+ | Install Docker Desktop/Engine | Local Docker daemon | Build/run containers | Dockerfile env vars | `Dockerfile`, `.dockerignore` | `docker info`, `docker build -t sellerintel-crawler:local .` | Image secrets, networked builds | Yes until artifact verification |
| Cloudflare Wrangler | Config file present; CLI/auth not verified | Required for staging/prod | Worker, D1, R2, Pages deploy/config | 9, 12, 13, deploy phases | Install Wrangler via npm | `wrangler login` or API token | Workers, D1, R2, Pages, Access as needed | Wrangler secrets and D1 bindings | `apps/worker-api/wrangler.toml`, `infra/cloudflare/README.md` | `wrangler whoami` after auth | Secret leakage, accidental deploy | Yes for local-only work |
| Cloudflare Worker API | Configured local source only | Required for app | Ingestion and future dashboard APIs | 2, 9+ | Wrangler deploy later | Cloudflare account | Worker/D1/R2 bindings | `INGESTION_HMAC_SECRET`, D1 bindings | `apps/worker-api/wrangler.toml` | `npm.cmd run health:worker` locally | Exposed endpoints if unauthenticated | Yes until deploy |
| Cloudflare D1 | Migrations only; resources unknown | Required for staging/prod | Core/contacts/ops/history storage | 1+ deploy | Create D1 DBs and bindings | Cloudflare account/API token | D1 create/edit | D1 bindings | `database/migrations/*` | Local migration tests; Wrangler D1 later | Contact data exposure | Yes for local tests |
| Cloudflare R2 | Missing/disabled | Required for evidence upload | Evidence/archive storage | 7+ deploy | Create bucket/bindings later | Cloudflare account/API token | R2 object read/write | Future binding/secret not defined | `crawler/sellerintel/clients/r2.py` | Future R2 integration tests | Evidence leakage, signed URL exposure | Yes until Phase 7 upload |
| Cloudflare Access | Missing | Required for internal dashboard | Dashboard authentication | 9+ deploy | Configure Access app/policies | Cloudflare Access identity | Access app/admin scopes | None in repo | `infra/cloudflare/README.md` only | Access policy test after deploy | Dashboard exposure | Yes for local-only audit |
| Zyte Scrapy Cloud | Partially configured by `scrapy.cfg`; deploy blocked | Required for Phase 10B | One free Scrapy Cloud unit runner | 10B | Zyte/Scrapy Cloud project and deploy CLI | Scrapy Cloud account/API credential | One project, one unit only | No credential var defined in repo | `crawler/scrapy.cfg`, `infra/zyte/README.md` | Future no-network smoke/job status command | Charges if extra unit or Zyte API | Yes until 10B |
| Zyte API | Intentionally not connected | Prohibited | Paid extraction/proxy API | Not applicable unless spec amended | Do not configure | N/A | N/A | `ZYTE_API_ENABLED=false` only | `crawler/sellerintel/clients/optional_zyte_api.py` | Startup gate tests | Direct paid usage | Yes; should remain disconnected |
| Browser automation/Playwright | Not repo-required; optional Codex/browser skill available in session | Optional for UI QA | Visual/manual dashboard checks | Dashboard QA | Install/use Playwright only for local UI tests | None for local | Browser automation | `ENABLE_LOCAL_PLAYWRIGHT=false` for crawler | No repo Playwright config found | `npx.cmd playwright --version` if needed | Browser profiles/cookies must not be used | Yes |
| SQLite/local DB test harness | Configured through tests | Required for migration validation | Validate D1-compatible SQL locally | Phase 1+ | Python stdlib/test harness | None | Local files/memory | None | `crawler/tests/test_database_migrations.py` | `uv run pytest crawler/tests/test_database_migrations.py` | None significant | No for DB phase tests |

Minimum MCP/tool set required to finish the project:

- Required MCPs: none found. The project can be completed with ordinary CLIs/APIs.
- Required ordinary tools: Git, Python 3.12, uv, Node/npm, Docker, Cloudflare Wrangler, Scrapy Cloud deployment tooling, and GitHub Actions access.
- Optional tools: GitHub MCP/app for PR automation, browser automation for UI QA, pnpm if the package manager is standardized.
- Services that should not be connected now: Zyte API, paid proxy services, paid fallback containers, personal browser profiles/cookies.

## 17. Copy-ready MCP setup checklist

Required MCPs now:

```text
None. No repository MCP configuration is present or required for the next safe local implementation work.
```

Required ordinary CLI/tool setup now:

```text
Python 3.12
uv
Node.js/npm
Git
```

Optional local tooling:

```text
GNU Make, only if the operator wants `make test` instead of direct commands.
Docker, before verifying the Phase 10A shared runner artifact.
Browser automation, only for local UI QA and never with personal profiles/cookies.
```

Cloudflare setup steps for later staging:

```text
1. Create separate Cloudflare D1 databases for core, contacts, operations, and history.
2. Add D1 bindings to Wrangler config without committing secret values.
3. Create an R2 bucket only when Phase 7 evidence upload is implemented.
4. Create a Cloudflare Access app/policy before exposing the dashboard.
5. Store `INGESTION_HMAC_SECRET` as a Wrangler secret.
6. Use least-privilege Cloudflare API tokens in CI; do not commit them.
```

Zyte/Scrapy Cloud setup steps for Phase 10B:

```text
1. Keep Zyte API disabled.
2. Keep Scrapy Cloud max units at exactly 1.
3. Record `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true` in approved runtime config after a scoped config change.
4. Add only a no-network smoke deployment first.
5. Verify job status/cancel/export manually against the one free unit.
6. Do not add a second Scrapy Cloud unit.
```

## 18. Test, lint, type-check, and build results

| Area | Command | Exit result | Result summary | Blocks next phase | Safe fix if failed/skipped |
|---|---|---:|---|---|---|
| Python lint | `uv run ruff check crawler` | 0 | `All checks passed!` | No | N/A |
| Python type checking | `uv run mypy crawler/sellerintel crawler/tests` | 0 | `Success: no issues found in 74 source files` | No | N/A |
| Python tests | `uv run pytest crawler/tests` | 0 | 70 passed | No | N/A |
| Contact extractor coverage | `uv run pytest crawler/tests/test_contact_extractors.py --cov=crawler/sellerintel/extractors --cov-report=term-missing` | 0 | 5 passed; coverage 95.36%; required 90% reached | No | N/A |
| Python security scan | `uv run bandit -r crawler/sellerintel` | 0 | No issues identified; 3116 lines scanned | No | N/A |
| Python dependency audit | `uv run pip-audit` | 0 | No known vulnerabilities found | No | N/A |
| TypeScript lint | `npm.cmd run lint` | 0 | ESLint completed without errors | No | N/A |
| TypeScript type checking | `npm.cmd run typecheck` | 0 | Shared types, Worker API, and dashboard TypeScript checks passed | No | N/A |
| Worker tests | `npm.cmd run test` | 0 | Vitest: 4 files passed, 20 tests passed, including Worker tests | No | N/A |
| Worker health smoke | `npm.cmd run health:worker` | 0 | 1 file passed, 3 tests passed | No | N/A |
| Dashboard tests | `npm.cmd run test` | 0 | Dashboard runtime test included, 5 tests passed | No | N/A |
| Dashboard build | `npm.cmd run build` | 0 | Next.js 15.5.22 build/export succeeded; 14 static pages generated | No | Add Next ESLint plugin config to remove warning |
| Contract validation | `uv run pytest crawler/tests/test_ingestion_contracts.py` via full suite | 0 | Contract tests passed in Python suite | No | N/A |
| Migration validation | `uv run pytest crawler/tests/test_database_migrations.py` via full suite | 0 | Migration tests passed in Python suite | No | N/A |
| Security checks | `uv run bandit -r crawler/sellerintel`; `uv run pip-audit`; `npm.cmd run audit:prod` | 0 | No Bandit issues, no pip-audit vulnerabilities, npm prod audit found 0 vulnerabilities | No | N/A |
| Unified project check | `make test` | Skipped | `make` command not installed; component commands were executed directly and passed | No for implementation; yes for exact Makefile target | Install GNU Make or continue using direct documented commands on Windows |
| Local runner smoke | `uv run --directory crawler python -m sellerintel.runtime.local` | 0 | JSON state `dry_run_complete`, `fixture_only=true`, `dry_run=true`, `accepted=false`, `spooled=false` | No | N/A |
| Git status | `git status --short --branch` | 0 | Dirty working tree with uncommitted modified/untracked phase work | Yes before release/PR | Commit in scoped PR after audit follow-up |

Dashboard build warning:

```text
The Next.js plugin was not detected in your ESLint configuration.
```

No skipped or disabled tests were found by the skipped-test search.

## 19. Deployment and infrastructure status

| Resource | Status | Evidence | Notes |
|---|---|---|---|
| Cloudflare Worker | Configured but not deployed | `apps/worker-api/wrangler.toml`, `apps/worker-api/src/index.ts` | `workers_dev=false`; no deployed resource evidence. |
| Pages/dashboard | Configured/buildable but not deployed | `apps/dashboard/next.config.ts`, `npm.cmd run build` | Static export builds locally; no Pages project evidence. |
| D1 databases | Local migrations only; deployed existence unknown | `database/migrations/*`, `apps/worker-api/src/repositories/*` | No D1 database IDs/bindings in Wrangler config. |
| R2 buckets | Not configured/deployed | `crawler/sellerintel/clients/r2.py`, `infra/cloudflare/README.md` | R2 upload client disabled. |
| Cloudflare Access | Missing/unknown | `infra/cloudflare/README.md` | No Access policy/app config. |
| Zyte Scrapy Cloud project | Partially configured; deployed existence unknown | `crawler/scrapy.cfg`, `infra/zyte/README.md` | Operator confirmed one free unit outside repo; no CLI verification run. |
| GitHub Actions | Configured | `.github/workflows/ci-python.yml`, `.github/workflows/ci-web.yml` | CI workflows active on push/PR; deployment workflows blocked/manual. |
| Fallback runners | Disabled/placeholders | `infra/github-actions-runner/README.md`, `infra/credit-runner/README.md`, `crawler/sellerintel/runtime/*` | No automatic fallback. |
| Scheduled jobs | Not deployed/enabled | `.github/workflows/daily-health-check.yml`, `docs/local-runner.md` | Daily health workflow is manual only; scheduler examples are docs only. |
| Secrets configuration | Unknown/not present | `.env.example`, `.gitignore`, `apps/worker-api/wrangler.toml` | No production secret values were read or printed. |

## 20. Zyte Student-unit readiness

Known operator fact: Zyte Support confirmed the GitHub Student Scrapy Cloud unit is applied; exactly one Scrapy Cloud unit is free; jobs using that one unit will not be charged; no paid Scrapy Cloud subscription is enabled; charges are possible only if an additional unit is added or Zyte API is used.

Repository reflection of that fact:

- `SCRAPY_CLOUD_MAX_UNITS=1`: present in `.env.example` and `apps/worker-api/wrangler.toml`; enforced by `crawler/sellerintel/config/features.py` and `apps/worker-api/src/validation/startup.ts`.
- `ZYTE_API_ENABLED=false`: present and enforced.
- `PAID_SERVICES_ALLOWED=false`: present and enforced.
- `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true`: not reflected. Repo defaults still set it to `false`.

Readiness verdict: not ready for a one-unit Zyte test deployment. Entitlement has been confirmed externally, but repo configuration and implementation still need Phase 10B work: entitlement default change, no-network smoke spider/deploy config, job status/cancel/export checks, and rollback documentation.

## 21. Cloudflare readiness

Cloudflare local readiness is partial:

- Worker health and ingestion tests pass locally.
- Dashboard static build passes.
- D1-compatible migrations pass local tests.

Cloudflare staging readiness is not complete:

- No D1 database IDs or bindings are configured.
- No R2 bucket/binding is configured.
- No Cloudflare Access app/policy is configured.
- Worker dashboard APIs are missing.
- `INGESTION_HMAC_SECRET` is not configured.

Cloudflare production readiness is not complete:

- No staging proof exists.
- No production hardening review has been completed.
- No backup/restore exercise exists against deployed D1/R2.
- No Access-protected dashboard is deployed.

## 22. Security review

Implemented controls:

- HMAC-signed ingestion with timestamp and nonce replay protection.
- Idempotency keys and ordered partition writes.
- Gzip body limits and batch write limits.
- Startup gates for paid services, Zyte API, extra Scrapy Cloud units, and fallback runners.
- Contact masking in dashboard fixtures and contact records.
- Local runner rejects personal browser profile and cookie-file env vars.
- Source adapter policy rejects credentials in URLs, localhost/private hosts, blocked responses, and restricted policies.
- `.gitignore` excludes `.env`, `.dev.vars`, `.wrangler`, spool, logs, caches, and dependency dirs.
- Bandit, pip-audit, and npm production audit passed.

Open risks:

- No Cloudflare Access or app-level dashboard authentication.
- No production secret configuration or rotation process.
- Contact field is named `contact_value_ciphertext`, but no production encryption/key-management implementation was audited.
- No R2 evidence upload security boundary.
- No production SSRF review for future live fetching because live fetch is not implemented.
- No production backup/restore test.
- No formal Phase 13 hardening review.

## 23. Zero-charge review

Final zero-charge status: SAFE WITH WARNINGS.

Safe findings:

- `PAID_SERVICES_ALLOWED=false` exists and is enforced.
- `MAX_EXTERNAL_MONTHLY_SPEND_AUD=0` exists and is enforced.
- `SCRAPY_CLOUD_MAX_UNITS=1` exists and is enforced.
- `ALLOW_EXTRA_SCRAPY_UNITS=false` exists and is enforced while paid services are locked.
- `ZYTE_API_ENABLED=false` exists and is enforced.
- Zyte API request/spend budgets default to 0 and are enforced.
- GitHub Actions crawler and credit runner default false.
- Deployment workflows are manual and deliberately fail.
- No scheduled live crawling was found.
- No paid proxy services were found.
- No automatic provider switching was found.
- No automatic upgrade/provisioning script was found.

Warnings:

- `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED` remains false in repo defaults despite the operator-confirmed support fact.
- `SCRAPY_CLOUD_DEPLOY_ENABLED` can be set by env; gates require entitlement and exactly one unit, but the actual deploy workflow remains a placeholder.
- Cloudflare costs cannot be fully assessed from repo evidence because deployed resource plans/quotas are unknown.
- Docker build was not run in this audit, so image behavior was not independently verified.

No unsafe charge path was found in the current default configuration.

## 24. Technical debt and TODO inventory

Unfinished-marker search results:

| Marker/evidence | File path | Meaning |
|---|---|---|
| Workflow placeholders | `CHANGELOG.md` | Historical note; not implementation code. |
| Stale Phase 0 local runner wording | `infra/local-runner/README.md` | Documentation drift; Phase 10A code now exists. |
| UI placeholder text | `apps/dashboard/app/sellers/page.tsx` | Benign input placeholder attribute. |
| Client package placeholder | `crawler/sellerintel/clients/__init__.py` | External clients incomplete. |
| R2 upload not implemented | `crawler/sellerintel/clients/r2.py` | Blocks Phase 7 completion. |
| Scoring package placeholder | `crawler/sellerintel/scoring/__init__.py` | Full scoring incomplete. |
| Spider placeholders | `crawler/sellerintel/spiders/__init__.py`, `crawler/sellerintel/spiders/*.py` | Live Scrapy crawling not implemented. |

Skipped/disabled tests: none found by search across `crawler/tests`, `apps/worker-api/test`, and `apps/dashboard/tests`.

Generated/untracked audit artifacts already present in working tree:

- `.coverage` is untracked and generated by coverage runs.
- Build/test caches and dependency directories exist but are ignored by `.gitignore`.

## 25. Exact next-step plan

1. Reconcile documentation and phase status so the repo no longer claims Phase 10A as current if Phase 7 remains incomplete.
2. Decide whether Phase 7 truly requires implemented R2 evidence upload now. If yes, implement a disabled-by-default R2 evidence upload boundary with fixture tests and no live crawl. If no, amend the frozen master specification first.
3. Re-run the full validation suite after the Phase 7 fix.
4. Reassess Phase 8 as already implemented ahead of order and keep its tests.
5. Complete Phase 9 by adding Worker dashboard APIs and Cloudflare Access design/config before exposing the dashboard.
6. Complete Phase 10A by verifying the Docker artifact and integrating a real local Scrapy runner path without enabling live crawling.
7. Only after prior phase drift is fixed, perform a Phase 10B config-only Zyte readiness change: set `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true`, keep `SCRAPY_CLOUD_MAX_UNITS=1`, keep `ZYTE_API_ENABLED=false`, and add a no-network smoke deployment path.

## 26. Operator actions required

Immediate:

- Decide whether the audit-determined phase state is accepted.
- Approve a follow-up scope to correct phase documentation/status drift.
- Install GNU Make only if the exact `make test` aggregate target is required on this machine.

Before non-dry-run local ingestion:

- Generate and configure `INGESTION_HMAC_SECRET`.
- Start/configure a local Worker-compatible endpoint.
- Keep `LOCAL_RUNNER_DRY_RUN=true` unless intentionally testing ingestion.

Before Cloudflare staging:

- Create D1 databases and Wrangler bindings for `CORE_DB`, `CONTACTS_DB`, `OPS_DB`, and `HISTORY_DB`.
- Configure `INGESTION_HMAC_SECRET` as a secret.
- Configure Cloudflare Access before dashboard exposure.
- Add R2 only after evidence upload implementation exists.

Before Zyte Phase 10B:

- Encode the confirmed entitlement in repo/runtime config as `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true`.
- Keep `SCRAPY_CLOUD_MAX_UNITS=1`.
- Keep `ZYTE_API_ENABLED=false`.
- Do not add another Scrapy Cloud unit.
- Do not enable Amazon.

## 27. Commands executed

Inspection commands executed included:

```powershell
Get-Content SELLER_INTELLIGENCE_MASTER_SPEC.md
Get-FileHash SELLER_INTELLIGENCE_MASTER_SPEC.md -Algorithm SHA256
Get-FileHash SELLER_INTELLIGENCE_MASTER_SPEC.md.md -Algorithm SHA256
rg --files -uu ...
git status --short --branch
git branch --all --verbose --no-abbrev
git tag --list
git log --oneline --decorate --graph --max-count=20
git remote -v
git rev-parse HEAD
Get-ChildItem -Force
Get-ChildItem -Force .codex
Get-ChildItem -Force .agents
rg -n "process\.env|os\.environ|source\.get\(|_read_bool\(|_read_int\(|env\."
rg -n "TODO|FIXME|HACK|NotImplemented|skip\(|skipif|disabled|temporary mock|placeholder|stub|not implemented"
rg -n "CREATE TABLE|CREATE INDEX|CREATE VIRTUAL TABLE|TRIGGER|CHECK|FOREIGN KEY|DROP TABLE"
rg -n "fetch\(|workerApiPaths|Authorization|CF-Access|Access|auth|cookies|headers\("
```

Safe validation commands executed:

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
uv run --directory crawler python -m sellerintel.runtime.local
Get-Command make -ErrorAction SilentlyContinue
```

Commands intentionally not run:

- No live crawling command.
- No Zyte API command.
- No Scrapy Cloud deploy/job command.
- No Cloudflare deploy/migration command.
- No Docker build/run command.
- No GitHub Actions workflow trigger.
- No commit or push.

One mistaken inspection command attempted to read non-existent top-level files `crawler/sellerintel/evidence.py`, `crawler/sellerintel/spool.py`, and `crawler/sellerintel/entity_resolution.py`; it failed read-only and was corrected by reading the actual package paths.

## 28. Current git status

Final `git status --short --branch` after writing this report:

```text
## main...origin/main
 M .env.example
 M .gitignore
 M CHANGELOG.md
 M README.md
 M SECURITY.md
 M apps/dashboard/app/globals.css
 M apps/dashboard/app/layout.tsx
 M apps/dashboard/app/page.tsx
 M apps/dashboard/package.json
 M apps/dashboard/tests/runtime.test.ts
 M apps/worker-api/src/auth.ts
 M apps/worker-api/src/index.ts
 M apps/worker-api/src/validation/startup.ts
 M apps/worker-api/wrangler.toml
 M crawler/requirements.txt
 M crawler/sellerintel/adapters/__init__.py
 M crawler/sellerintel/adapters/base.py
 M crawler/sellerintel/adapters/official_site/__init__.py
 M crawler/sellerintel/adapters/registry.py
 M crawler/sellerintel/clients/ingestion.py
 M crawler/sellerintel/clients/r2.py
 M crawler/sellerintel/config/sources.py
 M crawler/sellerintel/entity_resolution/__init__.py
 M crawler/sellerintel/extractors/__init__.py
 M crawler/sellerintel/items.py
 M crawler/sellerintel/normalization/__init__.py
 M crawler/sellerintel/pipelines.py
 M crawler/sellerintel/runtime/__init__.py
 M crawler/sellerintel/runtime/local.py
 D crawler/sellerintel/schemas/.gitkeep
 M crawler/sellerintel/spiders/__init__.py
 M docs/architecture.md
 M docs/data-sources.md
 M docs/incident-response.md
 M docs/operations.md
 M pyproject.toml
 M uv.lock
?? .coverage
?? .dockerignore
?? Dockerfile
?? PROJECT_STATUS_REPORT.md
?? apps/dashboard/app/contacts/
?? apps/dashboard/app/crawl-health/
?? apps/dashboard/app/export/
?? apps/dashboard/app/review-queue/
?? apps/dashboard/app/sellers/
?? apps/dashboard/app/sources/
?? apps/dashboard/app/suppression/
?? apps/dashboard/components/
?? apps/dashboard/lib/dashboard-data.ts
?? apps/worker-api/src/ingestion/
?? apps/worker-api/src/repositories/
?? apps/worker-api/test/ingestion.test.ts
?? apps/worker-api/test/repositories.test.ts
?? crawler/sellerintel/adapters/official_site/enrichment.py
?? crawler/sellerintel/clients/serialization.py
?? crawler/sellerintel/entity_resolution/models.py
?? crawler/sellerintel/entity_resolution/resolver.py
?? crawler/sellerintel/extractors/common.py
?? crawler/sellerintel/extractors/contacts.py
?? crawler/sellerintel/extractors/email.py
?? crawler/sellerintel/extractors/models.py
?? crawler/sellerintel/extractors/phone.py
?? crawler/sellerintel/extractors/wechat.py
?? crawler/sellerintel/extractors/whatsapp.py
?? crawler/sellerintel/normalization/address.py
?? crawler/sellerintel/normalization/company.py
?? crawler/sellerintel/normalization/country.py
?? crawler/sellerintel/normalization/domain.py
?? crawler/sellerintel/normalization/hashing.py
?? crawler/sellerintel/normalization/phone.py
?? crawler/sellerintel/normalization/text.py
?? crawler/sellerintel/schemas/__init__.py
?? crawler/sellerintel/schemas/ingestion.py
?? crawler/tests/fixtures/
?? crawler/tests/test_contact_extractors.py
?? crawler/tests/test_database_migrations.py
?? crawler/tests/test_entity_resolution.py
?? crawler/tests/test_ingestion_client.py
?? crawler/tests/test_ingestion_contracts.py
?? crawler/tests/test_local_runner.py
?? crawler/tests/test_normalization.py
?? crawler/tests/test_official_site_enrichment.py
?? crawler/tests/test_source_adapters.py
?? database/ROLLBACK.md
?? database/migrations/contacts/0001_initial.sql
?? database/migrations/contacts/0002_audit.sql
?? database/migrations/core/0001_initial.sql
?? database/migrations/core/0002_indexes.sql
?? database/migrations/core/0003_search_fts.sql
?? database/migrations/core/0004_entity_resolution.sql
?? database/migrations/history/0001_initial.sql
?? database/migrations/history/0002_retention.sql
?? database/migrations/operations/0001_initial.sql
?? database/migrations/operations/0002_runtime_controls.sql
?? database/migrations/operations/0003_ingestion_nonce_replay.sql
?? database/queries/rebuild_core_fts_after_restore.sql
?? docs/local-runner.md
?? packages/contracts/ingestion-batch.schema.json
```

Dirty working-tree summary:

- Modified tracked files include `.env.example`, `.gitignore`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, Worker API files, dashboard files, crawler modules, docs, `pyproject.toml`, and `uv.lock`.
- Deleted tracked file: `crawler/sellerintel/schemas/.gitkeep`.
- Untracked implementation files include `Dockerfile`, `.dockerignore`, dashboard routes/components/lib files, Worker ingestion/repository tests, crawler extractor/normalization/entity-resolution/spool/schema files, database migrations, `database/ROLLBACK.md`, `database/queries/rebuild_core_fts_after_restore.sql`, `docs/local-runner.md`, and `packages/contracts/ingestion-batch.schema.json`.
- Untracked generated file: `.coverage`.
- This report file, `PROJECT_STATUS_REPORT.md`, was created by the audit and will appear as an untracked file unless added later.

Commit state:

```text
* d8c2850 (HEAD -> main, origin/main) Phase 0 repository bootstrap
```

## 29. Final verdict

How much of the complete project is finished?

The local foundation is substantial, but the production project is not close to complete. Strictly by phase order, Phases 0 through 6 are complete and verified; Phase 8 is also implemented and verified ahead of order; Phase 7, Phase 9, Phase 10A, and Phase 12 are partial; provider/deployment/production phases are blocked or not started. Overall completion is roughly 40-50% of the full production specification, with most completed work concentrated in local contracts, schema, ingestion, extraction, normalization, and tests.

Which phase is currently active?

Audit-determined active phase: Phase 7 - Official website enrichment. Documented active phase: Phase 10A - Local runner readiness. The documented phase status is ahead of the implementation.

What is the next safe task?

Reconcile phase drift, then complete Phase 7 evidence upload/crawl-enrichment requirements in a disabled-by-default, local-safe way without live crawling or paid services.

Which ENV values must the operator provide now?

None are required for the default local dry-run validation path. `INGESTION_HMAC_SECRET` is required before any non-dry-run ingestion. D1 bindings and Cloudflare secrets are required before staging.

Which ENV values can wait?

Cloudflare D1 bindings, Cloudflare Access/R2-related values, Zyte/Scrapy Cloud deployment credentials, GitHub fallback flags, and credit-runner values can wait until their phases.

Which MCPs or tools must be configured now?

No MCPs are required now. The currently necessary ordinary tools are Python 3.12, uv, Node/npm, and Git, all of which were sufficient for this audit's checks.

Which MCPs are optional?

GitHub MCP/app and browser automation are optional. Wrangler, Docker, and Scrapy Cloud tooling are ordinary CLIs/services needed later, not MCP requirements.

Is the project currently safe from charges?

Yes, with warnings. Default repo configuration is safe from charges because paid services, Zyte API, extra Scrapy Cloud units, Actions crawler fallback, and credit runner are disabled and enforced. The warning is that the confirmed Zyte Student entitlement is not reflected in repo defaults.

Is it ready for a one-unit Zyte test deployment?

No. The external entitlement fact is confirmed, but repo config still has `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=false`, the deploy workflow intentionally exits 1, and the Zyte runner is a placeholder.

Is it ready for staging?

No. Cloudflare D1 bindings, HMAC secret, Access, R2, dashboard APIs, and deployment validation are missing.

Is it ready for production?

No. Production requires staging proof, provider readiness, Cloudflare Access, quotas, backups, R2 evidence, production hardening, and phase-order reconciliation.
