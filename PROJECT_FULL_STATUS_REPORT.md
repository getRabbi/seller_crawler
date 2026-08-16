# Seller Intelligence Solo Mode v1 — Full Status Report

Audit date: 2026-08-17 (Asia/Dhaka)  
Audit mode: read-only, except creation of this report  
Repository: E:\seller_crawler  
Audited branch and HEAD: main at a6aea18cdc1857291c30d9be1d1d721d47c47ad5

This report uses the frozen master specification with the Solo Mode v1 amendment as the scope authority. Documentation claims were treated as evidence only when corroborated by code, tests, configuration, Git history, local artifacts, or safe read-only endpoint checks. No Cloudflare or GitHub setting was changed, no deployment was performed, no live crawl was started, and no Zyte API was called.

## 1. Executive summary

Seller Intelligence Solo Mode v1 is not production-ready.

The real current state is a successful staging pilot built from a dirty, mostly unpushed working tree. The official-site crawler, four contact extractors, normalization, signed Worker ingestion, four-D1 schema, dashboard read APIs, static dashboard, local runner, Docker runner, and one-unit Scrapy Cloud path all exist and pass the available local checks. Staging evidence also shows four D1 databases, a Worker route, Pages dashboard, Cloudflare Access, a synthetic seed site, a one-unit no-network Scrapy Cloud smoke, and one bounded synthetic official-site crawl.

The strongest historical claim — “Solo v1 implementation complete” — is false in the current repository state. The main launch blockers are:

1. The complete crawler/sellerintel/spool package is ignored by Git and is absent from HEAD and origin. Local tests pass only because those hidden source files exist in this working directory. The remote Python CI already failed for this exact missing import.
2. Contact records do not contain recoverable ciphertext. The official-site adapter writes redacted-sha256:<hash> into contact_value_ciphertext, irreversibly discarding the extracted contact value.
3. The entity-resolution engine is unit-tested but not connected to crawl/ingestion persistence; the duplicate queue has no end-to-end producer or decision actions.
4. HTTP 429 is not treated as a domain stop by the live spider, Retry-After is not honored, and source cooldown is not persisted.
5. Spool replay omits the explicit crawler User-Agent that was required to get staging ingestion through the current edge policy.
6. package.json uses Windows-only npm.cmd inside scripts that run on ubuntu-latest. Local Windows checks pass, but GitHub CI fails on Linux.
7. The working tree is dirty, eight commits are not pushed, staging hardening/evidence is uncommitted, .env.example is deleted, and the staging deployment is not tied to an immutable pushed commit.
8. A four-D1 staging backup exists and its checksums match, but it has never been restored. The master specification explicitly says a backup is not valid until restored.
9. Staging Access redirects are live, but the authenticated single-user dashboard acceptance flow was not completed. No production Worker, Pages project, Access application, or four production D1 resources are proven to exist.
10. During this audit, a diagnostic output exposed three current staging credentials. Their values are intentionally omitted here. The Cloudflare API token, ingestion HMAC secret, and Scrapy Cloud API key must be treated as compromised and rotated before any further external operation.

External staging claims are supported by STAGING_DEPLOYMENT_REPORT.md, the ignored staging Wrangler file, a checksummed four-D1 export, and public endpoint behavior. This audit did not query Cloudflare management APIs or Zyte APIs, so it does not independently reconfirm account billing, resource ownership, authenticated dashboard data, or current Zyte job inventory.

## 2. Completion percentages

| Measure | Estimate | Why it is not 100% |
|---|---:|---|
| Implementation completion | 80% | Most subsystems exist and pass working-tree tests, but the spool package is not in Git; contact encryption/recovery is absent; entity resolution and duplicate decisions are not wired; 429/cooldown and replay behavior are incomplete; dashboard review is read-only; Linux CI scripts are broken. |
| Production launch readiness | 45% | Staging infrastructure and a bounded synthetic crawl are evidenced, but current credentials must be rotated, the artifact is not reproducible from Git, CI is not green, production resources/configuration are unproven, backup restore and authenticated acceptance are incomplete, and several launch-critical code gaps remain. |

These are weighted engineering estimates, not documentation phase counts. Passing local tests against an unreproducible working tree receives partial rather than full production credit.

## 3. Current project stage

Current stage: post-staging remediation and pre-production hardening.

- Highest individually COMPLETE AND VERIFIED phase: Phase 5 — Company normalization.
- Last uninterrupted completed phase prefix: none. Phase 0 has regressed because repository/CI acceptance is no longer satisfied, and Phase 3 depends on ignored source files.
- Current active phase: Phase 13 — Production hardening, with mandatory backfill work in Phases 0, 3, 6, 7, 8, 9, 10A, and 10B.
- Work implemented ahead of order: Phase 7 official crawling, Phase 9 dashboard/API, Phase 10A local/Docker, and Phase 10B staging activation were built and exercised while earlier artifact-integrity and entity-resolution gaps remained.
- Staging milestone: one bounded synthetic official-site crawl completed through one Scrapy Cloud unit and wrote two accepted ingestion batches plus completion status, according to the staging report.
- Production milestone: not reached.

False or stale completion claims:

- README.md simultaneously claims staging is deployed and later says no hosted resource has been deployed.
- docs/operations.md, docs/data-sources.md, docs/architecture.md, infra/cloudflare/README.md, SOLO_MODE_IMPLEMENTATION_PLAN.md, and SOLO_V1_PRODUCTION_REPORT.md contain local-only or pre-staging state that is superseded by the untracked staging report.
- README.md and prior reports call Phase 8 complete even though README.md itself says decisions are prepared but live writes are not performed.
- Prior reports call contact storage encrypted, but the adapter stores a prefixed hash, not ciphertext.
- Prior “all important work committed” implications are false because the spool source package is ignored, staging changes are dirty, and origin/main still contains only the Phase 0 commit.

Architecture drift:

- contact_value_ciphertext does not contain ciphertext.
- Entity-resolution decisions and review actions are not integrated.
- ENABLE_BUSINESS_REGISTRY defaults to true even though Solo v1 is official-site only.
- The live spider does not implement the master error matrix for HTTP 429 and Retry-After.
- The cloud fallback’s “durable local spool” is not proven durable on an ephemeral Scrapy Cloud job.
- Windows-only npm.cmd package scripts conflict with the Linux CI architecture.
- Staging was deployed from a dirty, unpushed tree instead of an immutable release artifact.
- R2 absence is not drift: the Solo amendment explicitly defers R2.

## 4. Phase-by-phase matrix

| Phase | Classification | Required Solo v1 outcome | Completed work and proof | Tests proving it | Deployment/configuration state | Remaining work or blocker | Recommended next action |
|---|---|---|---|---|---|---|---|
| Phase 0 — Repository bootstrap | PARTIALLY COMPLETE | Reproducible monorepo, passing Python/Web CI, Worker/dashboard skeletons, setup docs | pyproject.toml, package.json, apps, crawler, database, Dockerfile, .github/workflows | All local checks pass | Remote main is only d8c2850 and both remote CI runs failed | Ignored spool source; dirty tree; .env.example deleted; npm.cmd breaks Linux CI; eight commits unpushed | Restore reproducibility, make scripts cross-platform, run clean-clone CI, then commit/push |
| Phase 1 — Database | COMPLETE AND VERIFIED | Four partitioned D1 schemas, indexes/FTS, repository layer, rollback/restore tooling | database/migrations/core 0001-0004; contacts 0001-0002; operations 0001-0004; history 0001-0002; Worker repositories; database/ROLLBACK.md; d1_transfer.py | 21 migration tests plus repository and transfer tests pass | Four staging D1s and all migrations are evidenced; production unknown | Actual restore acceptance belongs to launch hardening, not schema implementation | Keep migrations unchanged; perform disposable restore before production |
| Phase 2 — Secure ingestion | COMPLETE AND VERIFIED | Gzip/schema/HMAC/timestamp/nonce/idempotency/bounds/ordered writes/masked errors | Worker ingestion body, config, crypto, schema, route, source-policy, repositories and unit-of-work | Worker ingestion and repository tests pass; staging receipts corroborate | Deployed in staging; production unknown | Current HMAC credential is compromised and must be rotated | Rotate secret, redeploy from a committed artifact, re-run signed staging acceptance |
| Phase 3 — Crawler contracts | PARTIALLY COMPLETE | Pydantic contracts, deterministic gzip/signing, retries, durable spool/replay | schemas/ingestion.py, clients/serialization.py, clients/ingestion.py, local spool files | Ingestion client/contract tests pass in this working tree | Signed staging ingestion worked; replay was not remotely exercised | Entire spool package is ignored/uncommitted; replay UA gap; clean clone fails | Track spool package, fix replay headers, add a clean-clone and remote replay test |
| Phase 4 — Contact extractors | COMPLETE AND VERIFIED | Email, phone, WhatsApp, WeChat extraction with evidence, normalization/classification and false positives | crawler/sellerintel/extractors and sanitized fixtures | 5 extractor tests pass; 95.36% coverage | Deployed crawler found all four synthetic contact types | Downstream persistence loses the usable raw value, but extractor implementation itself is complete | Preserve extractor behavior; fix downstream encryption/storage |
| Phase 5 — Company normalization | COMPLETE AND VERIFIED | Company/domain/country/address/phone normalization and deterministic hashes | crawler/sellerintel/normalization | 8 normalization tests pass; also exercised by crawler tests | Included in staging crawler | No implementation blocker found | No action beyond regression protection |
| Phase 6 — Source adapter framework | PARTIALLY COMPLETE | Policy registry, flags, robots/risk/concurrency/cooldown/block semantics | adapters/base.py, adapters/registry.py, config/sources.py, config/features.py | 6 source-adapter tests pass | Official-site policy deployed; enterprise adapters disabled | 429 cooldown is a library return value but not enforced/persisted by the live spider; business registry default is out of scope | Treat 429 as a stop, honor Retry-After, persist cooldown, default registry adapter off |
| Phase 7 — Official website enrichment | PARTIALLY COMPLETE | Explicit seeds, same-domain robots-respecting bounded crawl, four contacts, compact evidence | spiders/website_contacts.py, adapters/official_site, settings.py, middlewares.py, records.py | 4 spider, 4 enrichment, 2 staging-seed tests pass; local and Docker smoke pass | One bounded synthetic Scrapy Cloud crawl succeeded | 429 behavior incomplete; “ciphertext” is only a hash; production real seed not approved/verified | Fix policy and contact persistence, then repeat staging on an immutable artifact |
| Phase 8 — Entity resolution | PARTIALLY COMPLETE | Basic deterministic dedupe plus explainable decisions, review queue, audit/rollback | entity_resolution models/resolver, core migration 0004, dashboard duplicate query | 6 entity-resolution unit tests pass | Code may be present in deployed package but is not invoked; staging duplicate data not proven | Resolver is library-only; no crawl/ingestion producer, persistence path, or decision actions | Wire exact/domain and fuzzy resolution into ingestion and implement idempotent review decisions |
| Phase 9 — Dashboard | PARTIALLY COMPLETE | Private searchable dashboard, seller/contact/search/run views, duplicate review, CSV | dashboard app/lib/components; Worker dashboard routes/repository/csv/auth | 32 web tests total; lint/typecheck/build pass on Windows | Staging dashboard and API routes redirect through Access; authenticated acceptance not done | Duplicate review is read-only; no decision API; contact values cannot be recovered; Sources/Suppression master pages absent; production absent | Complete minimal review/contact usability, verify authenticated staging flow, then deploy production |
| Phase 10A — Local runner | PARTIALLY COMPLETE | One local fallback, Docker artifact, lock, dry-run, signed ingestion, durable spool/replay | runtime/local.py, runtime/scrapy_engine.py, Dockerfile, docs/local-runner.md, spool package | Local runner and Docker no-network smoke pass | Local only; no schedule enabled, as intended | Spool code not tracked; replay UA bug; Docker success depends on dirty build context | Fix/track spool and prove the image from a clean Git archive |
| Phase 10B — Zyte Scrapy Cloud | PARTIALLY COMPLETE | Exactly one Student unit, no-network smoke, bounded official crawl, status/cancel, D1 delivery | runtime/scrapy_cloud.py, cloud smoke spider, scrapinghub.yml, setup.py, deploy workflow, infra/zyte | 10 runner tests, 3 smoke-spider tests, offline config validate pass | Project 871778, deploy version and one-unit jobs are documented; staging crawl succeeded | Current API key compromised; provider/account state not independently queried; deployed artifact not in Git; cloud spool failure recovery unverified | Rotate key, publish reproducible artifact, redeploy same project, rerun one-unit no-network smoke |
| Phase 10C — GitHub Actions crawler fallback | DEFERRED FROM SOLO V1 | None for launch | Disabled runtime/documentation skeleton only | Startup gates cover disabled state | No crawler activation or schedule | Explicit Solo deferral | Leave disabled |
| Phase 10D — Credit-backed fallback | DEFERRED FROM SOLO V1 | None for launch | Disabled runtime/documentation skeleton only | Startup gates cover disabled state | Not deployed | Explicit Solo deferral | Leave disabled |
| Phase 11 — Provider orchestration | DEFERRED FROM SOLO V1 | Manual choice only; no automatic switching | Base interfaces and selector scaffolding exist | Startup tests cover fail-closed selection | No orchestrator/schedule deployed | Automatic orchestration is explicitly deferred | Do not implement for launch |
| Phase 12 — Full quota protection/advanced monitoring | DEFERRED FROM SOLO V1 | Only hard zero-charge startup controls are required for launch | Python/Worker startup gates and dashboard paid-lock badge exist | Startup and health tests pass | Staging safe defaults documented | Full D1/R2 accounting, warnings, and archive automation are advanced monitoring | Keep deferred; retain hard safety flags |
| Phase 13 — Production hardening | PARTIALLY COMPLETE | Close high findings, restore proof, secure immutable production release | SECURITY.md, runbook, tests/audits, staging report, backup tooling | Current local suites/audits pass | Staging only; production resources unproven | Credential incident, code gaps, failed CI, no restore, no authenticated acceptance, no production deployment | Execute Sections 19 and 21 in order |

## 5. Component matrix

Yes means directly evidenced. Partial means implemented or exercised only in part. “Remote” refers to staging unless explicitly stated; no production component is production-verified.

| Component | Coded | Tested | Locally working | Remotely configured | Deployed | Production verified | Current finding |
|---|---|---|---|---|---|---|---|
| Scrapy crawler engine | Yes | Yes | Yes | Yes | Yes, staging | No | Bounded fixture and staging execution work |
| Official-site crawler | Yes | Yes | Yes | Yes | Yes, staging | No | Real spider, not a placeholder |
| Seed URL/domain handling | Yes | Yes | Yes | Yes | Yes, staging | No | Explicit URLs, private-host and credential rejection; production seed not set |
| robots.txt enforcement | Yes | Yes | Yes | Yes | Yes, staging | No | Scrapy ROBOTSTXT_OBEY plus allowed synthetic robots |
| Same-domain enforcement | Yes | Yes | Yes | Yes | Yes, staging | No | Canonical per-domain queue |
| Page/depth/concurrency limits | Yes | Yes | Yes | Yes | Yes, staging | No | Budget 1-25, depth 0-3, global 4/domain 1, delay/autothrottle |
| Retry/timeouts/block detection | Partial | Partial | Partial | Yes | Yes, staging | No | 401/403/challenge stops; 429/Retry-After/cooldown integration incomplete |
| Contact-page discovery | Yes | Yes | Yes | Yes | Yes, staging | No | Static paths, links, sitemap business pages |
| Email extraction | Yes | Yes | Yes | Yes | Yes, staging | No | Synthetic staging result present |
| Phone extraction | Yes | Yes | Yes | Yes | Yes, staging | No | Synthetic staging result present |
| WhatsApp extraction | Yes | Yes | Yes | Yes | Yes, staging | No | Synthetic staging result present |
| WeChat extraction | Yes | Yes | Yes | Yes | Yes, staging | No | Synthetic staging result present |
| Normalization | Yes | Yes | Yes | Yes | Yes, staging | No | Deterministic implementation |
| Entity resolution/dedupe | Partial | Yes, unit | Partial | No | Unused code only | No | Domain-derived IDs dedupe exact domains; scoring engine not wired |
| Evidence provenance | Yes | Yes | Yes | Yes | Yes, staging | No | Compact D1 source/evidence records; R2 intentionally deferred |
| HMAC-signed ingestion | Yes | Yes | Yes | Yes | Yes, staging | No | Implementation sound; credential must rotate |
| Idempotency | Yes | Yes | Yes | Yes | Yes, staging | No | Stable keys and idempotent writes |
| Nonce/replay protection | Yes | Yes | Yes | Yes | Yes, staging | No | Persistent operations D1 nonce table |
| Local spool/retry | Partial | Yes in dirty tree | Yes in dirty tree | No | Unproven on cloud failure | No | Source package ignored; replay UA missing; cloud durability unproven |
| Local runner | Yes | Yes | Yes | Not applicable | Not applicable | No | Fixture-only dry-run works |
| Docker runner | Yes | Yes | Yes | Not applicable | Local image only | No | No-network container passes; build context includes ignored spool files |
| Zyte Scrapy Cloud runner | Yes | Yes | Yes, offline validate | Yes | Yes, staging | No | One-unit smoke and synthetic crawl documented |
| Worker API | Yes | Yes | Yes in tests | Yes | Yes, staging | No | Custom route protected by Access |
| Seller APIs | Yes | Yes | Yes in tests | Yes | Yes, staging | No | List/detail |
| Contact APIs | Partial | Yes | Yes in tests | Yes | Yes, staging | No | Masked list only; no recoverable/reveal path |
| Search | Yes | Yes | Yes in tests | Yes | Yes, staging | No | FTS-backed bounded search |
| Duplicate review | Partial | Partial | Read-only | Yes | Yes, staging | No | Queue query only; no producer/action workflow |
| Crawl-run status | Yes | Yes | Yes in tests | Yes | Yes, staging | No | Completion status written in staged crawl |
| CSV export | Yes | Yes | Yes in tests | Yes | Yes, staging | No | Masked, suppression-aware, max 1,000 |
| Dashboard | Partial | Yes | Yes | Yes | Yes, staging | No | Static UI works; review/contact usability and authenticated acceptance incomplete |
| Dashboard live API integration | Yes | Yes | Yes at build/test level | Yes | Yes, staging | No | Credentialed browser fetch to Worker base URL |
| Authentication/Access | Yes in Worker | Yes | Yes in unit tests | Yes | Yes, staging | No | Unauthenticated 302 proven; authenticated single-user acceptance not proven |
| Four D1 databases | Yes, schema | Yes | Yes via SQLite/D1 mocks | Yes, staging | Yes, staging | No | Production four-D1 set unknown |
| Migrations | Yes | Yes | Yes | Yes, staging | Applied staging | No | 4 core, 2 contacts, 4 operations, 2 history |
| Backup/export/restore | Partial | Yes, guards | Export/checksum only | Staging export | Backup exists | No | Restore never executed |
| Production configuration | Templates only | No | No | Unknown | No evidence | No | Concrete production env/Wrangler files absent |
| Charge-safety controls | Yes | Yes | Yes | Yes, staging | Yes | No | Code defaults safe; exposed credentials make present operational verdict unsafe |

## 6. Fully completed work

- Four partitioned D1 schemas and migration tests.
- Worker gzip ingestion validation, HMAC verification logic, timestamp window, persistent nonce replay protection, idempotency, bounded writes, and structured errors.
- Email, phone, WhatsApp, and WeChat extractors with sanitized multilingual/false-positive fixtures and 95.36% extractor coverage.
- Company, domain, country, address, text, phone, and hash normalization.
- Real official-site Scrapy crawl planning, canonical same-domain queues, robots middleware, page/depth/concurrency caps, contact discovery, compact evidence, and deterministic records, excluding the specific gaps listed below.
- Worker seller list/detail, masked contacts, search, crawl runs, duplicate listing, and CSV read APIs.
- Static dashboard build and Worker API client integration.
- Local fixture runner and no-network Docker execution in this working tree.
- Four staging D1 exports with matching SHA-256 checksums.
- One documented staging Scrapy Cloud no-network smoke and one documented bounded synthetic official-site job using one unit.
- Deferred enterprise providers/features remain disabled.

## 7. Partially completed work

- Reproducible source artifact and CI.
- Durable spool/replay.
- Live block/cooldown behavior for 429.
- Recoverable contact storage and operator contact use.
- End-to-end entity resolution and duplicate review actions.
- Dashboard authenticated acceptance and review workflow.
- Backup restore acceptance.
- Zyte release reproducibility and failure recovery.
- Production Cloudflare environment.
- Production acceptance and rollback proof.

## 8. Remaining code work

### A. Code work still required

1. Narrow the root spool ignore rule and add crawler/sellerintel/spool/__init__.py, checksums.py, writer.py, and replay.py to version control.
2. Add User-Agent: seller-intelligence-crawler/1.0 to spool replay and test it against the same edge expectations as normal ingestion.
3. Replace redacted-sha256:<hash> in contact_value_ciphertext with actual authenticated encryption and key/version handling, or explicitly amend the frozen specification to a hash-only product. For a usable contact dashboard/CSV, implement a strictly audited reveal/decrypt path; never send the key to the frontend.
4. Wire deterministic entity resolution into the crawl/ingestion flow, persist decision/review records idempotently, and add minimal merge/keep-separate/ignore actions with audit/rollback semantics.
5. Treat HTTP 429 as a stop/cooldown event, honor Retry-After, and persist source/domain cooldown before another run.
6. Replace Windows-only npm.cmd references inside package.json scripts with cross-platform npm invocation; prove both CI workflows from a clean Linux checkout.
7. Decide and document how a failed Scrapy Cloud ingestion spool survives job shutdown without adding deferred R2 complexity. At minimum, make the job fail visibly and provide a verified retrieval/replay path.
8. Restore a sanitized .env.example consistent with current code and remove stale/contradictory status claims.
9. Set ENABLE_BUSINESS_REGISTRY=false for Solo v1 runtime examples unless the master specification is amended.

No Amazon, Alibaba/1688, R2, AI, outreach, extra runner, or orchestration work is required for launch.

## 9. Cloudflare status

Only account b63e426431b63ec9db33d7c421d01b42 is permitted. This audit did not access the forbidden old account or any of its resources.

### Resource classification

| Resource | Name/route | State | Evidence and limitation |
|---|---|---|---|
| Staging Worker | seller-intelligence-api-staging | VERIFIED WORKING | Staging report records deployment and signed ingestion; https://api-stg.scalemyprints.com/v1/health returns 302 to Access. Authenticated health was not repeated. |
| Worker custom route | api-stg.scalemyprints.com/* | VERIFIED WORKING | Route responds and staging ingestion receipts are documented |
| Worker workers.dev URL | Disabled by workers_dev=false | NOT CREATED | Deliberately not exposed |
| Worker Git integration | No proven connection | UNKNOWN | Repository workflow is a manual fail-closed handoff that exits 1; staging appears operator/CLI deployed |
| Staging Pages dashboard | seller-intelligence-staging | DEPLOYED | Custom and pages.dev URLs return 302 through Access; authenticated content not repeated |
| Pages Git integration | No proven connection | UNKNOWN | Deployment report identifies a deployment ID, not a Git connector |
| Staging synthetic seed Pages | seller-intelligence-seed-staging | VERIFIED WORKING | Custom host and robots.txt return 200; default pages.dev host also returns 200 |
| Dashboard custom domain | dashboard-stg.scalemyprints.com | CONFIGURED | Access redirect is live |
| API custom domain | api-stg.scalemyprints.com | CONFIGURED | Access redirect is live; ingestion bypass is documented |
| Seed custom domain | seed-stg.scalemyprints.com | VERIFIED WORKING | Public synthetic/noindex fixture returns 200 |
| Cloudflare Access | Staging dashboard/API applications plus ingest bypass | CONFIGURED | 302 protection verified; exact authenticated operator acceptance remains outstanding |
| Four staging D1 resources | core, contacts, operations, history staging | VERIFIED WORKING | IDs/bindings/migration counts recorded and a nonempty checksummed four-file export exists |
| Staging D1 bindings | CORE_DB, CONTACTS_DB, OPS_DB, HISTORY_DB | CONFIGURED | Concrete ignored Wrangler config has all four allowed-account IDs |
| Staging Worker secrets | Ingestion HMAC and allowed operator identity | CONFIGURED | Current HMAC must be rotated after audit disclosure |
| Intended production Worker | seller-intelligence-api-production | UNKNOWN | Template name only; no concrete config or external evidence |
| Intended production Pages | seller-intelligence-production | UNKNOWN | Template name only; no concrete config or external evidence |
| Four production D1 resources | Intended core/contacts/operations/history production | UNKNOWN | No concrete IDs or external proof |
| Production Access/custom domains | Not finalized in repository | UNKNOWN | No external proof |

Staging D1 evidence:

| Binding | Staging database | Resource ID | Applied migrations |
|---|---|---|---:|
| CORE_DB | seller-intelligence-core-staging | b68cd00c-c6eb-40e4-a459-dc1e1236975d | 4 |
| CONTACTS_DB | seller-intelligence-contacts-staging | e4ec7f9a-4a09-4ef2-9cf5-304b590b6cfc | 2 |
| OPS_DB | seller-intelligence-operations-staging | d1f08206-0a63-41ae-b8ae-994c09a2c8d7 | 4 |
| HISTORY_DB | seller-intelligence-history-staging | db0be23b-dab4-4a58-82bc-95c901c3984a | 2 |

Build and deploy configuration:

- Worker bundle/deploy command: npx.cmd wrangler deploy --config apps/worker-api/wrangler.staging.toml. Wrangler bundles src/index.ts; there is no separate production Worker build artifact.
- Pages build command: npm.cmd run build --workspace @seller-intelligence/dashboard.
- Pages output directory: apps/dashboard/out because next.config.ts sets output: export.
- Pages deploy command: npx.cmd wrangler pages deploy apps/dashboard/out --project-name <project> --branch <production-branch>.
- Hosted D1 migration commands are explicit and ordered core, contacts, operations, history.
- Git workflows for Worker, Pages, and hosted migrations intentionally fail and do not deploy.

scalemyprints.com dependency:

- The zone is already being used for staging API, dashboard, and synthetic seed subdomains in the permitted account.
- This satisfies the staging domain dependency.
- Production hostnames, DNS/routes, Access applications, and resource creation remain operator-controlled work.
- The infrastructure zone name does not automatically make https://scalemyprints.com/ a crawl seed. It should be added only if it is the intended official business site and is explicitly approved in the production source allowlist.

## 10. Zyte status

| Item | Status |
|---|---|
| Student entitlement | Documented confirmed |
| Project ID | Present locally; project 871778 is recorded |
| Scrapy Cloud credential | Present locally but now compromised; rotate |
| Deploy configuration | Ready in scrapinghub.yml, setup.py, requirements.txt, runtime/scrapy_cloud.py |
| Offline config validation | Pass, exit 0, with one-unit safe activation values and no network |
| No-network smoke | Repository-ready and documented remotely successful as job 871778/2/1 using one unit |
| Status/cancel | Coded/tested; cancellation job 871778/2/2 documented |
| Bounded official crawl | Documented successful as 871778/1/3 using one unit |
| Ingestion endpoint readiness | Staging path worked, but HMAC rotation and reproducible redeploy are now required |
| Live production crawl readiness | No |

The intended values are present in the ignored local configuration and enforced by tests:

| Variable | Verified intended value |
|---|---|
| ZYTE_STUDENT_ENTITLEMENT_CONFIRMED | true |
| SCRAPY_CLOUD_MAX_UNITS | 1 |
| ZYTE_API_ENABLED | false |
| PAID_SERVICES_ALLOWED | false |
| ALLOW_EXTRA_SCRAPY_UNITS | false |

Remaining Zyte blocker: rotate the exposed Scrapy Cloud key, publish the complete crawler artifact, redeploy the same project from an immutable version, and repeat only the one-unit no-network smoke. Do not create a project, unit, Zyte API key, or schedule.

## 11. Dashboard status

- Coded routes: Overview, Sellers, Seller detail, Contacts, Duplicate Review, Crawl Health, Export.
- Worker data paths: seller list/detail, masked contacts, duplicate list, crawl runs, search, CSV.
- State handling: loading, empty, failure, retry, and locked states are implemented.
- Frontend exposure: only NEXT_PUBLIC_WORKER_API_BASE_URL is used; no Worker, D1, HMAC, Cloudflare, Access, or Scrapy secret is bundled.
- Local validation: lint, typecheck, 6 dashboard tests, and static production build pass on Windows.
- Staging: custom and pages.dev URLs are live behind Access.
- Not verified: successful login as the one allowed operator, authenticated API data, search, seller detail, contacts, crawl status, duplicates, and CSV in a real browser session.
- Functional gaps: duplicate review has no decision actions; contact values are masked and the stored “ciphertext” cannot be decrypted; Sources and Suppression master-spec pages are absent. The last two are not necessary for the narrowed launch UI if suppression remains enforced server-side.
- Production dashboard: not proven created or deployed.

## 12. D1/database status

- Core: four migrations, including indexes, FTS5, entity-resolution decisions, and redirects.
- Contacts: two migrations, including contacts, suppression, outreach state, and audit.
- Operations: four migrations, including sources, crawl runs, review queue, runtime controls, idempotency, nonce replay, and compact evidence.
- History: two migrations, including field history and retention indexes.
- Local migration verification: 21 database tests pass.
- Staging: all twelve migration files are reported applied across the four concrete D1 databases.
- Production: four resource IDs, bindings, and applied migrations are unknown.
- Backup: .sellerintel/backups/staging-20260816T181901Z contains core.sql, contacts.sql, ops.sql, history.sql and a manifest; all four current hashes match the manifest.
- Restore: not executed. Per master specification Section 41, the backup is not yet valid.
- Restore order: core, contacts, operations, history; rebuild core FTS after canonical import.
- Data concern: contact_value_ciphertext currently stores a hash marker, not encrypted contact data.

## 13. ENV and secrets inventory

Status language:

- Present local means present in ignored .env without showing the value.
- Staging configured means present in the ignored staging Wrangler file or bound remotely.
- Placeholder means an example/template only.
- Missing intentional means the variable must not be set in the current mode.
- Compromised means the current credential must be rotated.

### Runtime and feature controls

| Variable | Component | Secret | Required/scope | State | Safe expected value/configuration | Consequence if missing or changed |
|---|---|---|---|---|---|---|
| APP_ENV | Worker | No | Now; local/staging/prod | Present local; staging configured | local locally, staging remotely, production later | Wrong value changes auth/source-policy behavior |
| RUNNER_MODE | Python/Worker | No | Now; all | Present local | development_locked except explicit runner operation | Invalid mode fails; active mode can permit crawling |
| LIVE_CRAWL_ENABLED | Python/Worker/crawler | No | Now; all | Present local/staging | false except one approved bounded job | True with an active runner permits live crawl |
| PAID_SERVICES_ALLOWED | Python/Worker | No | Now; all | Present local/staging | false | True weakens paid-service lock |
| MAX_EXTERNAL_MONTHLY_SPEND_AUD | Python/Worker | No | Now; all | Present local/staging | 0 | Nonzero is rejected while paid services are locked |
| ALLOW_EXTRA_SCRAPY_UNITS | Python/Worker | No | Now; all | Present local/staging | false | True can allow charge exposure |
| ALLOW_PAID_GITHUB_ACTIONS_MINUTES | Python/Worker | No | Deferred/CI | Present local/staging | false | True weakens zero-charge controls |
| ALLOW_PAID_ADDONS | Python/Worker | No | Deferred/all | Present local/staging | false | True weakens zero-charge controls |
| ZYTE_STUDENT_ENTITLEMENT_CONFIRMED | Python/Worker/Zyte | No | Before Zyte | Present local/staging | true | Zyte mode blocks if false |
| SCRAPY_CLOUD_DEPLOY_ENABLED | Python/Worker/Zyte | No | Temporary during approved deploy | Present local/staging | false at rest; true only in controlled process | Zyte operation blocks if false; persistent true increases risk |
| SCRAPY_CLOUD_MAX_UNITS | Python/Worker/Zyte | No | Before Zyte | Present local/staging | 1 | Any other value blocks safe Zyte mode |
| ZYTE_API_ENABLED | Python/Worker | No | Must remain disabled | Present local/staging | false | True violates Solo scope and may incur charges |
| ZYTE_API_DAILY_REQUEST_BUDGET | Python/Worker | No | Must remain disabled | Present local/staging | 0 | Nonzero violates zero-charge gate |
| ZYTE_API_MONTHLY_BUDGET_USD | Python/Worker | No | Must remain disabled | Present local/staging | 0 | Nonzero violates zero-charge gate |
| GITHUB_ACTIONS_CRAWLER_ENABLED | Python/Worker | No | Deferred | Present local/staging | false | True activates deferred runner path |
| GITHUB_ACTIONS_INCLUDED_MINUTES_CONFIRMED | Python/Worker | No | Deferred | Present local | false | Required only if deferred fallback returns |
| CREDIT_RUNNER_ENABLED | Python/Worker | No | Deferred | Present local/staging | false | True violates current zero-charge scope |
| CREDIT_RUNNER_MONTHLY_CAP_AUD | Python/Worker | No | Deferred | Present local | 0 | Nonzero creates spend exposure |
| CREDIT_RUNNER_AUTO_SHUTDOWN | Python/Worker | No | Deferred | Present local | true | Required only if deferred runner is ever approved |
| ENABLE_AMAZON | Python/Worker | No | Must remain disabled | Present local/staging | false | Worker gate rejects true; source is out of scope |
| ENABLE_ALIBABA | Python | No | Deferred | Present local | false | Would enable deferred adapter policy |
| ENABLE_1688 | Python | No | Deferred | Present local | false | Would enable deferred adapter policy |
| ENABLE_BUSINESS_REGISTRY | Python | No | Not needed Solo v1 | Present local, unsafe scope default | false for Solo v1 | Currently enables registry metadata despite no implementation |
| ENABLE_OFFICIAL_WEBSITE | Python | No | Now | Present local | true | False disables the only Solo source |
| ENABLE_SEARCH_DISCOVERY | Python | No | Deferred | Present local | false | True broadens source discovery |
| ENABLE_LOCAL_PLAYWRIGHT | Python/local runner | No | Deferred | Present local | false | Fixture runner blocks it |
| ENABLE_EMAIL_EXTRACTION | Python | No | Now | Present local | true | Disables email extraction if false |
| ENABLE_PHONE_EXTRACTION | Python | No | Now | Present local | true | Disables phone extraction if false |
| ENABLE_WHATSAPP_EXTRACTION | Python | No | Now | Present local | true | Disables WhatsApp extraction if false |
| ENABLE_WECHAT_EXTRACTION | Python | No | Now | Present local | true | Disables WeChat extraction if false |
| ENABLE_AI_SUMMARY | Python | No | Deferred | Present local | false | True would broaden scope |
| ENABLE_OUTREACH | Python | No | Deferred | Present local | false | True would broaden scope and contact people |
| GLOBAL_CRAWL_KILL_SWITCH | Python | No | Now | Present local | false during approved run; true to stop | True blocks crawler |

### Crawler, ingestion, and Zyte variables

| Variable | Component | Secret | Required/scope | State | Safe expected value/configuration | Consequence |
|---|---|---|---|---|---|---|
| INGESTION_ENDPOINT_URL | Local/cloud crawler | No | Non-dry-run staging/prod | Present local | Exact HTTPS Worker ingest path | Submission blocks without it |
| INGESTION_HMAC_SECRET | Worker/crawler | Yes | Non-dry-run staging/prod | Present and staging configured; COMPROMISED | Rotated high-entropy secret in Worker secret store and runner only | Worker 503 or signing failure if missing/mismatched |
| INGESTION_ALLOWED_SOURCE_DOMAINS | Worker | No | Staging/prod ingestion | Present local/staging | Exact approved domains only | Production source batches reject if empty/unmatched |
| SELLERINTEL_WORKSPACE_ROOT | Local runner | No | Optional local | Present local | Repository/runner workspace | Used to prevent path escape |
| LOCAL_SPOOL_DIR | Local/cloud crawler | No | Local fallback and failures | Present local | Private durable path inside workspace | Defaults if absent; durability may be wrong |
| LOCAL_RUNNER_LOCK_PATH | Local runner | No | Local fallback | Present local | Private path inside workspace | Defaults if absent; prevents overlap |
| LOCAL_RUNNER_FIXTURE_ONLY | Local runner | No | Local smoke | Present local | true until live fallback approved | False requires fallback_local plus live gate |
| LOCAL_RUNNER_DRY_RUN | Local runner | No | Local smoke | Present local | true until signed submission test | False submits to Worker |
| OFFICIAL_SITE_SEED_URLS | Local runner/spider | No | Every crawl | Present local fixture value | Explicit approved HTTPS URLs | Runner blocks with no seed |
| OFFICIAL_SITE_FIXTURE_DIR | Local runner | No | Fixture smoke | Present local | Sanitized fixture directory | Fixture validation fails if absent |
| OFFICIAL_SITE_PAGE_BUDGET | Local/Zyte spider | No | Every crawl | Present local | 1-25; staging used a tiny bound | Out of range blocks |
| OFFICIAL_SITE_MAX_DEPTH | Local/Zyte spider | No | Every crawl | Present local | 0-3 | Out of range blocks |
| OFFICIAL_SITE_DEFAULT_REGION | Extractor normalization | No | Optional | Present local | Approved country hint | Phone normalization may be less accurate |
| LOCAL_CRAWL_OUTPUT_PATH | Local runner | No | Local crawl | Present local | Private workspace path | Runner blocks if missing/escaping |
| CRAWL_RUN_ID | Local runner | No | Optional | Blank/local-generated | UUIDv7 or generated value | Generated if blank |
| SCRAPY_CLOUD_PROJECT_ID | Zyte runner | No | Before Zyte smoke | Present local | Existing numeric project only | Validation blocks if missing |
| SCRAPY_CLOUD_API_KEY | Zyte runner | Yes | Before Zyte operation | Present local; COMPROMISED | Rotated key in secret store/process only | Validation/deploy/status blocks if missing |
| SCRAPY_CLOUD_PROJECT_DIR | Zyte deploy | No | Before deploy | Present local | Correct crawler directory for current cwd | Validation/deploy fails if wrong |
| SHUB_APIKEY | shub CLI workflow | Yes | Deploy process only | GitHub state unknown | Map rotated Scrapy key process-only | shub deploy fails if missing |
| SHUB_JOBKEY | Scrapy Cloud pipeline | Sensitive identifier | Provider runtime | Provider-injected | Do not configure manually | Crawl run lacks provider job link if absent |
| SELLERINTEL_OBSERVED_AT | Spider setting | No | Cloud official job | Runtime-injected | Current UTC timestamp | Missing/invalid setting blocks deterministic record time |
| ZYTE_API_KEY | Reserved forbidden argument | Yes | Not required | Missing intentional | Unset | Presence is unnecessary; Zyte API stays disabled |
| BROWSER_PROFILE_PATH | Local guard | Sensitive path | Prohibited | Missing intentional | Unset | Runner blocks if set |
| CHROME_USER_DATA_DIR | Local guard | Sensitive path | Prohibited | Missing intentional | Unset | Runner blocks if set |
| FIREFOX_PROFILE_PATH | Local guard | Sensitive path | Prohibited | Missing intentional | Unset | Runner blocks if set |
| COOKIE_FILE | Local guard | Secret/sensitive | Prohibited | Missing intentional | Unset | Runner blocks if set |

### Worker, dashboard, D1, and Cloudflare variables

| Variable | Component | Secret | Required/scope | State | Safe expected value/configuration | Consequence |
|---|---|---|---|---|---|---|
| CORE_DB | Worker binding | No | Staging/prod | Staging configured | D1 binding, not shell secret | Ingest and seller/search APIs fail if absent |
| CONTACTS_DB | Worker binding | Sensitive data | Staging/prod | Staging configured | D1 binding | Contact API/ingestion fails if absent |
| OPS_DB | Worker binding | Sensitive data | Staging/prod | Staging configured | D1 binding | Nonce/idempotency/run APIs fail if absent |
| HISTORY_DB | Worker binding | Sensitive data | Staging/prod | Staging configured | D1 binding | Ingestion history stage fails if absent |
| MAX_BATCH_SELLERS | Worker | No | Now | Present local/staging | 25 | Default used; raising it increases D1/CPU risk |
| MAX_BATCH_CONTACTS | Worker | No | Now | Present local/staging | 100 | Default used; raising it increases D1/CPU risk |
| MAX_BATCH_D1_STATEMENTS | Worker | No | Now | Present local/staging | 20 | Default used; protects D1 operations |
| MAX_COMPRESSED_BODY_BYTES | Worker | No | Now | Present local/staging | 262144 | Default used; protects memory |
| MAX_UNCOMPRESSED_BODY_BYTES | Worker | No | Now | Present local/staging | 1048576 | Default used; protects memory |
| ACCESS_AUTH_REQUIRED | Worker | No | Staging/prod | Local false; staging true | true outside local | Worker health fails readiness/auth if false remotely |
| ACCESS_ALLOWED_EMAIL | Worker | Sensitive identifier | Staging/prod | Present local/staging | Exactly one operator address | Auth fails closed if absent/mismatch |
| TEAM_DOMAIN | Worker | Sensitive config | Staging/prod | Present local/staging | Exact Cloudflare Access issuer | JWT verification fails if absent/wrong |
| POLICY_AUD | Worker | Sensitive config | Staging/prod | Present local/staging | Exact Access application audience | JWT verification fails if absent/wrong |
| DASHBOARD_ORIGIN | Worker CORS | No | Staging/prod | Present local/staging | Exact dashboard origin | Browser CORS requests fail |
| NEXT_PUBLIC_WORKER_API_BASE_URL | Dashboard | No/public | Build time | Present local/staging build evidence | Exact Worker origin; no path secret | Dashboard points to localhost/default if absent |
| CLOUDFLARE_ACCOUNT_ID | Operator tooling | No | Before every CF mutation | Present local | Must equal b63e426431b63ec9db33d7c421d01b42 | Hard stop on mismatch/ambiguity |
| CLOUDFLARE_API_TOKEN | Operator tooling | Yes | CF operator action | Present local; COMPROMISED | Rotate; least privilege; never frontend | No deploy/migration if missing; exposure permits unauthorized mutation |
| CLOUDFLARE_WORKER_NAME | Operator config | No | Deployment | Present staging; production template | Environment-specific fixed name | Wrong name deploys wrong project |
| CLOUDFLARE_WORKER_ROUTE | Operator config | No | Deployment | Present staging; production missing | Exact approved hostname route | Worker not reachable or wrong route |
| CLOUDFLARE_ZONE_NAME | Operator config | No | Deployment | Present staging | scalemyprints.com only | Hard stop if wrong/unknown account zone |
| CLOUDFLARE_PAGES_PROJECT | Operator config | No | Pages deployment | Present staging; production template | Environment-specific fixed project | Could deploy to wrong Pages project |
| CORE_D1_DATABASE_NAME / CORE_D1_DATABASE_ID | Backup/operator config | No | Staging/prod | Staging present; production placeholder | Exact environment resource pair | Backup/deploy targets fail or hit wrong DB |
| CONTACTS_D1_DATABASE_NAME / CONTACTS_D1_DATABASE_ID | Backup/operator config | No | Staging/prod | Staging present; production placeholder | Exact environment resource pair | Backup/deploy targets fail or hit wrong DB |
| OPS_D1_DATABASE_NAME / OPS_D1_DATABASE_ID | Backup/operator config | No | Staging/prod | Staging present; production placeholder | Exact environment resource pair | Backup/deploy targets fail or hit wrong DB |
| HISTORY_D1_DATABASE_NAME / HISTORY_D1_DATABASE_ID | Backup/operator config | No | Staging/prod | Staging present; production placeholder | Exact environment resource pair | Backup/deploy targets fail or hit wrong DB |

### Build/runtime variables

| Variable | Component | Secret | Required | State | Safe value | Consequence |
|---|---|---|---|---|---|---|
| PYTHONUNBUFFERED | Docker | No | Container | Set in Dockerfile | 1 | Only affects log buffering |
| PYTHONDONTWRITEBYTECODE | Docker | No | Container | Set in Dockerfile | 1 | Only affects pyc writes |
| PYTHONPATH | Docker | No | Container/imports | Set in Dockerfile | /app/crawler | Imports fail if artifact layout differs |

Inventory anomalies:

- .env.example is tracked at HEAD but deleted in the working tree; current docs still refer to it.
- The old names INGESTION_API_URL, INGESTION_SPOOL_DIR, and R2_UPLOAD_URL_OR_SIGNING_ROUTE are stale/spec-report references and are not read by current code.
- The master-spec STG_* D1 names are not used by the current deployment tooling; current files use environment-specific CORE_D1_DATABASE_* and peers.
- There is no contact-encryption key variable or encryption implementation.
- ENABLE_BUSINESS_REGISTRY=true is unnecessary Solo v1 scope drift.
- ACCESS_AUTH_REQUIRED=false in local .env is safe only because APP_ENV=local; the remote staging Wrangler value is true.
- An ignored file named .env.cloudflare.servicerabbi exists locally. It was not opened or used. It belongs to the forbidden/out-of-scope account context and should not participate in this repository’s account selection.

### Required now

- Rotate CLOUDFLARE_API_TOKEN, INGESTION_HMAC_SECRET, and SCRAPY_CLOUD_API_KEY.
- Keep local APP_ENV=local, RUNNER_MODE=development_locked, LIVE_CRAWL_ENABLED=false, LOCAL_RUNNER_FIXTURE_ONLY=true, LOCAL_RUNNER_DRY_RUN=true.
- Track the spool source package and restore a safe .env.example.

### Required before Cloudflare production

- Allowed-account CLOUDFLARE_ACCOUNT_ID and a newly rotated least-privilege token.
- Concrete production Worker/route/zone/Pages names.
- Four production D1 name/ID pairs and all four bindings.
- Rotated production INGESTION_HMAC_SECRET.
- ACCESS_AUTH_REQUIRED=true, one allowed operator address, TEAM_DOMAIN, POLICY_AUD.
- Exact DASHBOARD_ORIGIN, NEXT_PUBLIC_WORKER_API_BASE_URL, ingestion endpoint, and approved source-domain allowlist.

### Required before Zyte smoke

- Rotated SCRAPY_CLOUD_API_KEY, existing project ID, correct project directory.
- ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true.
- SCRAPY_CLOUD_MAX_UNITS=1.
- Temporary process-only SCRAPY_CLOUD_DEPLOY_ENABLED=true only for the approved operation.
- PAID_SERVICES_ALLOWED=false, ALLOW_EXTRA_SCRAPY_UNITS=false, ZYTE_API_ENABLED=false, budgets zero.
- Immutable committed deployment version.

### Optional/deferred

- GitHub Actions crawler variables.
- Credit runner variables.
- Zyte API key/budgets.
- R2 settings.
- Amazon/Alibaba/1688/search discovery, Playwright, AI, outreach.

### Must remain disabled

- PAID_SERVICES_ALLOWED=false.
- MAX_EXTERNAL_MONTHLY_SPEND_AUD=0.
- ALLOW_EXTRA_SCRAPY_UNITS=false.
- ALLOW_PAID_GITHUB_ACTIONS_MINUTES=false.
- ALLOW_PAID_ADDONS=false.
- ZYTE_API_ENABLED=false with both budgets 0.
- GITHUB_ACTIONS_CRAWLER_ENABLED=false.
- CREDIT_RUNNER_ENABLED=false with cap 0.
- ENABLE_AMAZON=false, ENABLE_ALIBABA=false, ENABLE_1688=false, ENABLE_SEARCH_DISCOVERY=false.
- ENABLE_LOCAL_PLAYWRIGHT=false, ENABLE_AI_SUMMARY=false, ENABLE_OUTREACH=false.
- LIVE_CRAWL_ENABLED=false except one explicit bounded job.
- Browser profile and cookie variables unset.

## 14. Git status/history

| Item | Audit result |
|---|---|
| Branch | main |
| HEAD | a6aea18cdc1857291c30d9be1d1d721d47c47ad5 |
| Origin | https://github.com/getRabbi/seller_crawler.git |
| Remote main | d8c2850ca58952cd33008d6498c3beeb75a1c25d, confirmed by git ls-remote |
| Ahead/behind | 8 ahead, 0 behind |
| Working tree | Dirty |
| Tracked changes | 17 files: 222 insertions, 133 deletions; includes deleted .env.example |
| Untracked visible files | STAGING_DEPLOYMENT_REPORT.md, staging seed test, and staging seed site files |
| Ignored source files | Four crawler/sellerintel/spool Python files plus pycache |
| Generated artifacts | Ignored node_modules, .next, out, .coverage/caches, local .sellerintel outputs; local Docker image sellerintel-crawler:audit |
| Important implementation committed | No |
| Deployment-related changes pushed | No |
| Remote CI | Only two Phase 0 runs; both failed |

Commits after stabilization checkpoint e86661b:

1. 344afbb — adopt Solo Mode v1 delivery scope.
2. f38c8bf — official-site crawling.
3. 427e9e4 — dashboard Worker APIs.
4. b93cccd — dashboard API integration.
5. e71eced — one-unit cloud runner and D1 backups.
6. e6fac2d — production handoff hardening.
7. a6aea18 — production-readiness documentation.

The stabilization checkpoint itself and all seven later commits are absent from origin/main.

Remote failure evidence:

- Python CI failed because sellerintel.spool.checksums was missing from the checkout.
- Web CI failed because package.json invoked npm.cmd on Ubuntu.
- Current working-tree local checks do not replace clean-checkout CI.

## 15. Test/build results

All commands below were executed during this audit. Exit 0 means the command itself passed; it does not erase the clean-clone and end-to-end limitations described above.

| Command | Exit | Result | Warnings/failures | Production blocker |
|---|---:|---|---|---|
| uv run ruff check crawler | 0 | All checks passed | None | No |
| uv run mypy crawler/sellerintel crawler/tests | 0 | 85 source files, no issues | Uses ignored spool files in working tree | Yes, artifact reproducibility |
| uv run pytest crawler/tests | 0 | 100 passed in 5.10s | Includes 2 untracked staging-seed tests | No locally; yes for clean clone |
| uv run pytest crawler/tests/test_contact_extractors.py --cov=crawler/sellerintel/extractors --cov-report=term-missing | 0 | 5 passed; 95.36% coverage | 18 uncovered statements; threshold is 90% | No |
| uv run bandit -r crawler/sellerintel | 0 | No issues | 6 explicitly suppressed checks were skipped | No, but keep suppressions reviewed |
| uv run pip-audit | 0 | No known vulnerabilities | None | No |
| npm.cmd run lint | 0 | ESLint pass | Windows command only | No locally |
| npm.cmd run typecheck | 0 | Shared, Worker, dashboard typecheck pass | package script calls npm.cmd and will fail on Linux | Yes |
| npm.cmd run test | 0 | 5 files, 32 tests passed | None | No locally |
| npm.cmd run health:worker | 0 | 5 tests passed | Unit health test, not hosted authenticated health | No |
| npm.cmd run audit:prod | 0 | 0 production vulnerabilities | None | No |
| npm.cmd run build | 0 | Next.js 15.5.22 static export; 8 routes | Build skips lint internally; separate lint passed; script is Windows-specific | Yes for CI portability |
| uv run --directory crawler python -m sellerintel.runtime.local | 0 | dry_run_complete; 8 pages; 4 contacts; 0 block/error | Uses hidden spool package and generated local files | Yes for reproducibility |
| docker info --format {{.ServerVersion}} | 0 | Docker 29.3.1 available | None | No |
| docker build -t sellerintel-crawler:audit . | 0 | Image built | Build context contains ignored spool source | Yes for clean artifact |
| docker run --rm --network none sellerintel-crawler:audit | 0 | dry_run_complete; 8 pages; 4 contacts | No network; same dirty-context caveat | No locally |
| Scrapy Cloud runner validate, process-only safe values | 0 | errors empty, ok true | No network/API call; does not prove account state | No for config; remote proof separate |
| Four-file backup checksum verification | 0 | All 4 hashes match manifest | No restore performed | Yes |
| curl GET staging seed root | 0 | HTTP 200 | Public synthetic site | No |
| curl GET staging seed robots.txt | 0 | HTTP 200 | None | No |
| curl GET staging Worker health | 0 | HTTP 302 | Proves Access edge, not authenticated Worker response | Yes, acceptance pending |
| curl GET staging dashboard custom domain | 0 | HTTP 302 | Authenticated UI not inspected | Yes, acceptance pending |
| curl GET staging dashboard pages.dev | 0 | HTTP 302 | Protected default domain | No |
| curl GET staging seed pages.dev | 0 | HTTP 200 | Public synthetic/noindex | No |
| git status --short --branch | 0 | main ahead 8 and dirty | Important hidden/untracked work | Yes |
| git log --oneline --decorate -20 | 0 | Local phase commits present | Not pushed | Yes |
| git ls-remote origin refs/heads/main | 0 | Remote remains d8c2850 | Confirms no later push | Yes |
| gh run list/view, read-only | 0 | Two historical runs, both failed | Python missing spool; Web npm.cmd on Linux | Yes |

No live crawl, Worker write, D1 write, Cloudflare management call, Zyte API call, Zyte job call, deployment, commit, or push occurred.

## 16. Security review

Positive findings:

- No current local secret value matched any committed HEAD file or non-.env working-tree file.
- .env, staging Wrangler, backups, and the old local credential file are ignored.
- The frontend exposes only the public Worker base URL.
- HMAC verification, timestamp bounds, nonce replay protection, idempotency, source allowlisting, gzip bounds, and schema validation are coded and tested.
- Worker Access JWT verification checks signature, issuer, audience, expiry, and the exact allowed identity outside local mode.
- Contact list/search/export responses are masked and suppression-aware.
- Cookies are disabled in Scrapy; local runner rejects personal browser profile and cookie paths.
- No CAPTCHA bypass, credential harvesting, provider rotation, Zyte API client activation, or automated paid fallback was found.

High/critical findings:

- Credential incident: a diagnostic command during this audit printed the current staging Cloudflare API token, ingestion HMAC secret, and Scrapy Cloud API key in tool output. Treat all three as compromised. Revoke/rotate them before any further external operation.
- Contact “ciphertext” is an irreversible hash marker. This is data-loss-by-design relative to the schema and prevents audited recovery/use.
- Ignored runtime source makes the committed artifact incomplete and defeats CI/security review of spool code.
- Staging deployment came from an uncommitted tree, so source-to-deployment provenance is weak.
- Spool replay lacks the explicit User-Agent and cloud spool durability is unproven.
- The ignored old-account credential filename remains in the workspace. It was not opened or used, but keeping unrelated account material beside this repository increases selection risk.

Security verdict for launch: not acceptable until credentials are rotated and the critical artifact/data-handling findings are closed.

## 17. Zero-charge review

Code/configuration controls are correctly designed at rest:

- one Scrapy Cloud unit only;
- Zyte API disabled with zero budgets;
- paid services locked and external spend set to zero;
- extra units, paid Actions minutes, paid add-ons, credit runner, Amazon, other marketplaces, browser mode, AI, and outreach disabled;
- no automatic provider switching;
- no schedule or live crawl enabled by default;
- R2 is not required for Solo v1;
- staging and local runs are bounded.

No evidence was found of an extra Scrapy Cloud unit, Zyte API use, paid fallback activation, or accidental live local crawl.

Final charge-safety verdict: UNSAFE.

Reason: the exposed Scrapy Cloud credential can potentially be used outside repository startup gates, and the exposed Cloudflare API token can potentially mutate resources outside the code’s zero-charge assertions. The implementation defaults are safe, but current credentials cannot be trusted. After revocation/rotation, allowed-account verification, and confirmation that the Student account still has exactly one unit and no paid services, the expected verdict can return to SAFE WITH WARNINGS until production quotas are observed.

## 18. Deployment readiness

| Area | Readiness |
|---|---|
| Local working tree | High for fixture operation |
| Clean Git artifact | Not ready |
| Linux CI | Not ready |
| Staging Cloudflare | Deployed and partially verified |
| Staging authenticated acceptance | Not ready |
| Staging backup recovery | Not ready |
| Zyte one-unit staging | Previously exercised; credentials now unsafe |
| Production Cloudflare | Not proven created |
| Production D1 | Not proven created/migrated |
| Production dashboard | Not deployed/proven |
| Production crawler | Not ready |
| Rollback/recovery | Documented, not fully exercised |

No enterprise feature is blocking launch. The blockers are core Solo v1 integrity, security, usability, and operator deployment work.

## 19. Current blockers

### A. Code/repository blockers

- Ignored/uncommitted spool package.
- Missing replay User-Agent and unproven cloud spool durability.
- No recoverable contact encryption/storage.
- Entity resolution/review flow not integrated.
- 429/Retry-After/cooldown policy incomplete.
- Windows-only package scripts and failed Linux CI.
- Dirty/unpushed artifact and missing .env.example.

### B. Cloudflare operator/config blockers

- Revoke/rotate the exposed Cloudflare API token and ingestion HMAC.
- Re-verify exact permitted account before every mutation.
- Complete authenticated staging dashboard/API acceptance.
- Perform a disposable restore.
- Create/configure production Worker, Pages, four D1s, Access, DNS/routes, bindings, secrets, and migrations.

### C. Zyte operator/config blockers

- Rotate the exposed Scrapy Cloud key.
- Confirm the same project/account still has exactly one free Student unit and no Zyte API/paid subscription.
- Redeploy only the corrected immutable artifact.
- Repeat one no-network smoke; do not create another unit.

### D. Testing/verification blockers

- Clean-clone Python and Linux Web CI.
- Replay against staging edge with rotated secrets.
- End-to-end entity-resolution and review-decision tests.
- Contact encrypt/decrypt/reveal authorization tests.
- 429/Retry-After and persisted cooldown tests.
- Authenticated dashboard route and CSV acceptance.
- Full four-D1 restore, FTS rebuild, row-count/referential/search checks.
- Production health, auth, ingestion, dashboard, CSV, backup, and rollback smoke.

### E. Optional post-launch work

- R2 evidence/archive.
- Marketplace and supplier sources.
- Advanced quota telemetry/monitoring.
- All other deferred items in Section 20.

## 20. Deferred Solo v1 features

Confirmed deferred and not launch blockers:

- R2 evidence archive and raw HTML/screenshots.
- Amazon.
- Alibaba and 1688 unless a later explicit amendment restores them.
- Zyte API.
- Extra Scrapy Cloud units.
- GitHub Actions crawler fallback.
- Credit-backed fallback.
- Automatic provider switching/orchestration.
- AI summaries.
- Outreach automation.
- Team roles.
- Advanced monitoring and full quota dashboards.
- Complex approval workflows.
- Marketplace, supplier-directory, broad search-discovery, revalidation, and seed-discovery spiders.

Placeholder spiders and disabled provider classes for these features are not evidence that the features are implemented.

## 21. Exact next production sequence

1. Immediately revoke and rotate the exposed Cloudflare API token, staging ingestion HMAC secret, and Scrapy Cloud API key. Pause all external operations until rotation is verified.
2. Fix only the launch-critical repository gaps: track spool source, replay User-Agent, contact encryption/recovery, entity-resolution/review integration, 429/cooldown behavior, cross-platform npm scripts, safe .env.example, and official-only defaults.
3. Run the full audit suite from a clean clone on Linux/CI and the no-network Docker smoke from a Git-only build context.
4. Commit the complete scoped artifact, push it, and require green Python and Web CI. Record the immutable commit/deploy version.
5. Redeploy staging Worker/dashboard/crawler from that version using only the permitted Cloudflare account and the same Zyte project; reapply rotated secrets without exposing them.
6. Run one one-unit Zyte no-network smoke. Do not start a second unit or call Zyte API.
7. Complete authenticated staging acceptance for health, seller list/detail, contacts, search, duplicate decisions, crawl status, and CSV. Exercise a forced retry/spool/replay path.
8. Restore the four-file staging backup into disposable databases, rebuild FTS, verify counts/references/sample queries, and retain a restore report.
9. Create the four production D1 databases, apply migrations, create the production Worker/Pages/Access/custom-domain configuration, set rotated production secrets, and deploy the same immutable artifact.
10. Verify production health and Access first; then run one approved, tiny official-site crawl with one Zyte unit and exact source allowlisting.
11. Verify D1 records, dashboard/search/contact usability, CSV, crawl status, backup, and rollback; keep all deferred features and paid paths disabled.

## 22. Operator inputs still required

- New rotated values for the three compromised credentials, stored only in ignored local/secret-manager/provider environments.
- Confirmation that Cloudflare authentication resolves exactly to account b63e426431b63ec9db33d7c421d01b42 before every write.
- Production Worker/API hostname and Pages/dashboard hostname on scalemyprints.com.
- Four production D1 names/IDs.
- Production Access application/audience and exactly one allowed operator identity.
- Production HMAC secret and source-domain allowlist.
- Explicit approved production crawl seed. If the intended seller site is scalemyprints.com, record https://scalemyprints.com/ explicitly; do not infer it merely from the infrastructure zone.
- Final operator approval for the one-unit no-network smoke and, separately, the tiny production official-site crawl.

Already available and not a current input blocker:

- The existing Zyte project ID.
- Confirmed one-unit Student entitlement.
- Staging Worker/Pages/D1 names and IDs.
- The staging synthetic seed URL.

## 23. Final verdict

| Question | Definitive answer |
|---|---|
| Is the engine implementation complete? | No. Core crawling works, but contact encryption, integrated entity resolution/review, 429/cooldown, tracked spool/replay, and cloud failure durability are incomplete. |
| Is local verification complete? | The requested working-tree checks are complete and pass. Reproducible clean-clone/Linux verification is not complete. |
| Is Cloudflare deployment complete? | Staging is deployed/evidenced. Production is not proven created or deployed. |
| Is the dashboard live? | A staging dashboard URL is live behind Access, but authenticated acceptance is incomplete. No production dashboard is proven live. |
| Are the four production databases ready? | No. Four staging databases are evidenced; production resources and migrations are unknown. |
| Is Zyte ready? | The code and staging one-unit path were demonstrated, but the key must be rotated and the complete artifact redeployed before another run. |
| Is one-unit Zyte deployment safe? | The code enforces one unit and disables Zyte API, but it is not currently safe while the exposed key remains valid. It should be safe after rotation and account verification. |
| Is any important code still missing? | Yes: tracked spool/replay correction, contact encryption/recovery, entity-resolution persistence/review actions, 429 cooldown handling, Linux-safe scripts, and possibly a durable cloud-failure retrieval path. |
| What exactly prevents production launch right now? | Compromised credentials, incomplete Git artifact/failed CI, the listed code gaps, no restore acceptance, no authenticated staging acceptance, and no proven production Cloudflare/D1 deployment. |
| What is the single next action? | Revoke and rotate the exposed staging Cloudflare token, ingestion HMAC, and Scrapy Cloud key as one credential-incident response. |
| Is the project safe from accidental charges? | UNSAFE until credential rotation; the code defaults themselves are zero-charge and fail-closed. |
| Is the repository clean and safely committed? | No. It is dirty, eight commits ahead of origin, contains visible untracked staging work, hides critical ignored spool source, and has no green remote CI for current code. |

Final decision: do not launch production and do not run another Zyte or Cloudflare operation until credential rotation is complete. After that, close the small set of core Solo v1 gaps, prove a clean immutable artifact, complete staging acceptance/restore, and deploy only the narrowed production scope.
