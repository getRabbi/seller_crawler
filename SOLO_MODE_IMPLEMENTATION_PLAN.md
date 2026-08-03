# Solo Mode Implementation Plan v1

Status: approved implementation overlay for Solo Mode v1 as of 2026-08-04.
Authoritative specification: `SELLER_INTELLIGENCE_MASTER_SPEC.md`.
Audit baseline: `PROJECT_STATUS_REPORT.md` and `STABILIZATION_REPORT.md`.
Current accepted phase state: Phases 0-6 complete and verified, Phase 7 active and partially complete, Phase 8 complete and verified ahead of order, Phase 9 partially complete, Phase 10A partially complete, Phase 10B and later provider phases not ready.

This plan converts the remaining implementation path into a single-operator launch profile. It does not delete, rewrite, or invalidate the already tested Phase 0-8 foundations. It narrows the first usable launch to the smallest private system that can collect official-website contact intelligence safely and without recurring charges.

The operator has authorized implementation of this scope. Deployment and live crawling
remain gated by credentials, no-network smoke verification, and explicit seed approval.

## 1. Exact Simplified Scope

Solo Mode v1 includes only:

| Area | Solo v1 scope |
|---|---|
| Operator model | One operator, one private dashboard user, single-user Cloudflare Access policy. |
| Primary runner | One verified Zyte Student Scrapy Cloud unit after Phase 10B gates. |
| Fallback runner | One local Docker/Scrapy fallback runner using the same crawler package and local spool. |
| Source scope | Official company websites only. No Amazon, marketplaces, supplier directories, paid search, or broad discovery crawling. |
| Crawl scope | Approved official-site homepage, about, contact, contact-us, support, wholesale, distributor, privacy, terms, and sitemap-discovered business pages within a strict page budget. |
| Extraction | Public business email, phone, WhatsApp, and WeChat extraction. |
| Normalization | Existing company, domain, country, address masking, phone, and hash normalization. |
| Entity resolution | Basic deterministic identity matching and review decisions from the existing Phase 8 engine. |
| Ingestion | Signed Worker `POST /v1/ingest/batch` with idempotency, schema validation, source policy, and four D1 partition writes. |
| Databases | Existing four D1 partitions: core, contacts, operations, and history. |
| Evidence | D1 stores source URL, canonical URL, evidence snippet or extraction context, content hash, first seen, last fetched, last success, parser version, and schema version. |
| R2 | Optional after launch for full HTML, screenshots, batch archives, and longer evidence retention. Solo v1 must work without full raw-evidence R2 storage. |
| Dashboard | Simple private searchable dashboard over Worker APIs: overview, seller search, seller detail, contacts, source/crawl health, review basics, suppression status, and export. |
| Export | CSV export for masked/allowed seller and contact fields, protected behind Cloudflare Access and explicit export action. |
| Backup | Basic logical D1 export and restore runbook for the four databases. R2 backup storage can be added later. |
| Authentication | Single-user Cloudflare Access in front of dashboard and private Worker routes. |

Solo v1 keeps these zero-charge controls locked:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
ALLOW_EXTRA_SCRAPY_UNITS=false
ENABLE_AMAZON=false
SCRAPY_CLOUD_DEPLOY_ENABLED=false until Phase 10B smoke is approved
LIVE_CRAWL_ENABLED=false until the first approved official-site crawl gate
```

## 2. Files And Spec Sections To Amend

Documentation amended by this planning pass:

- `SOLO_MODE_IMPLEMENTATION_PLAN.md`: creates the Solo Mode v1 launch profile and shortest implementation sequence.
- `README.md`: adds the Solo v1 minimum launch scope and deferred features.
- `CHANGELOG.md`: records the documentation-only Solo Mode planning overlay.
- `docs/architecture.md`: documents the Solo v1 architecture profile and R2 optionality.
- `docs/operations.md`: documents the single-operator operating model.
- `docs/data-sources.md`: narrows Solo v1 sources to official websites.
- `docs/local-runner.md`: clarifies the local runner as the only Solo v1 fallback.
- `infra/cloudflare/README.md`: clarifies Worker, D1, Pages, Access, backup, and optional R2 readiness.
- `infra/zyte/README.md`: clarifies the one-unit Solo v1 Zyte target and disabled Zyte API posture.
- `infra/local-runner/README.md`: clarifies the local fallback target without enabling scheduling or crawling.

Frozen specification sections that need a formal amendment before implementation treats Solo v1 as the authoritative delivery target:

- Section 1.1, final platform map: add Solo Mode v1 as a launch profile that keeps R2 optional for full raw evidence.
- Section 2.1, free recurring infrastructure: distinguish required Solo v1 resources from later optional R2/full archive resources.
- Section 7, crawler design: narrow Solo v1 scheduling to official websites only and one manually selected runner.
- Section 8, provider integrations: defer GitHub Actions burst, credit-backed container, automatic provider orchestration, and Zyte API.
- Section 15, Worker API routes: identify the minimum Solo v1 dashboard/search/export route set.
- Section 16, dashboard: narrow launch dashboard to simple private search, profile, contacts, source health, review basics, suppression, and CSV export.
- Section 17, Cloudflare deployment: make R2 optional for Solo v1 launch and require single-user Access before exposure.
- Section 28 and Section 41, backup and restore: allow a basic four-D1 logical backup first, with R2 archive/weekly restore automation after launch.
- Section 36, evidence: allow compact D1 evidence snippets and hashes for Solo v1 while deferring full raw HTML/screenshot archives.
- Section 42.3, coding order: align the shortest Solo v1 sequence with the accepted Phase 7 active state.
- Section 44 through Section 46, fallback matrix and provider activation runbooks: mark Actions, credit-backed container, and automatic orchestration as post-launch deferrals for Solo v1.

The master specification now contains a Solo Mode v1 amendment that authorizes this
launch overlay while preserving the larger post-launch architecture.

## 3. Existing Code Reused

Solo v1 should reuse these tested foundations:

| Capability | Reused implementation |
|---|---|
| Monorepo and rules | `AGENTS.md`, `README.md`, `pyproject.toml`, `package.json`, `pnpm-workspace.yaml`, `.github/workflows/*` |
| D1 schema | `database/migrations/core/*`, `database/migrations/contacts/*`, `database/migrations/operations/*`, `database/migrations/history/*` |
| Restore notes and FTS rebuild | `database/ROLLBACK.md`, `database/queries/rebuild_core_fts_after_restore.sql` |
| Worker ingestion | `apps/worker-api/src/ingestion/*`, `apps/worker-api/src/repositories/*`, `apps/worker-api/src/validation/startup.ts` |
| Shared contracts | `packages/contracts/ingestion-batch.schema.json`, `packages/shared-types/src/runtime.ts` |
| Crawler contracts and client | `crawler/sellerintel/schemas/ingestion.py`, `crawler/sellerintel/clients/serialization.py`, `crawler/sellerintel/clients/ingestion.py` |
| Spool and replay | `crawler/sellerintel/spool/*`, `crawler/sellerintel/runtime/local.py` |
| Contact extraction | `crawler/sellerintel/extractors/email.py`, `phone.py`, `whatsapp.py`, `wechat.py`, `contacts.py` |
| Normalization | `crawler/sellerintel/normalization/*` |
| Source adapter framework | `crawler/sellerintel/adapters/base.py`, `registry.py`, `crawler/sellerintel/config/sources.py` |
| Official-site planning | `crawler/sellerintel/adapters/official_site/enrichment.py` |
| Entity resolution | `crawler/sellerintel/entity_resolution/*`, `database/migrations/core/0004_entity_resolution.sql` |
| Static dashboard shell | `apps/dashboard/app/*`, `apps/dashboard/components/*`, `apps/dashboard/lib/dashboard-data.ts` |
| Local runner artifact | `Dockerfile`, `.dockerignore`, `docs/local-runner.md`, `infra/local-runner/README.md` |
| Safety configuration | `.env.example`, `apps/worker-api/wrangler.toml`, `Dockerfile`, `SECURITY.md` |

These foundations should be extended in place. Do not replace them with a separate one-off Solo implementation.

## 4. Work Still Required

Solo v1 still requires:

| Work item | Why it is required |
|---|---|
| Solo v1 architecture amendment | Completed in master specification version 2.1.0 before implementation. |
| Phase 7 official-site fetch execution | Current Phase 7 plans and enriches supplied HTML but does not fetch approved official-site pages or robots/sitemap data. |
| Phase 7 D1 compact evidence field support | Solo v1 needs source URL, evidence snippet/context, content hash, and timestamps in D1. Existing sources store URL/hash/timestamps but not a dedicated evidence snippet field. |
| Phase 7 evidence tests | Add local/mock tests for compact D1 evidence and any optional R2 boundary without live crawling. |
| Worker read APIs for dashboard | Dashboard currently uses static fixture data; Solo v1 needs Worker-backed seller search, seller detail, contacts, source/crawl health, review basics, suppression, and export routes. |
| CSV export implementation | Existing dashboard route is static; Solo v1 needs Worker-mediated CSV export with masking and suppression controls. |
| Single-user Cloudflare Access runbook/config notes | No Access resource is configured yet; staging must be protected before exposure. |
| Basic backup scripts or runbook validation | Solo v1 needs a tested logical export/restore path for all four D1 databases before launch. |
| Local fallback verification | Phase 10A dry-run works, but Docker artifact and real local Scrapy execution path still need verification before fallback-local launch. |
| Zyte Phase 10B no-network smoke path | Entitlement is configured, but Scrapy Cloud deployment remains blocked until a no-network smoke spider and one-unit verification are implemented. |
| Cloudflare staging proof | Worker, Pages, D1 bindings, Access, and secrets must be configured and tested before production. |
| Production hardening review | Required before production launch, even for single-user mode. |

## 5. Shortest Implementation Sequence To Working Solo v1

1. Finish Phase 7 for official websites only: robots-aware fetch planning, approved page fetch execution, page budget enforcement, content hash, compact D1 evidence snippet/context, and local/mock tests.
2. Add any required D1 migration and contract changes for compact evidence snippets, preserving existing source URL, content hash, timestamps, parser version, and schema version fields.
3. Connect Worker dashboard read APIs for seller search, seller detail, contacts, source/crawl health, review basics, suppression state, and CSV export.
4. Convert the dashboard from static fixture data to Worker-backed data while keeping masked contact display and no browser secrets.
5. Add a basic four-D1 backup and local restore validation command or runbook.
6. Verify the local Docker/Scrapy fallback artifact without live crawling, then run one approved local official-site dry-run path.
7. Configure Cloudflare staging resources manually: four D1 bindings, Worker, Pages, single-user Access, and `INGESTION_HMAC_SECRET`.
8. Run staging smoke tests with live crawling still disabled.
9. Implement Phase 10B no-network Zyte Scrapy Cloud smoke deployment, verify exactly one free unit, confirm no Zyte API usage, and keep Amazon disabled.
10. Run one tiny approved official-website Zyte test only after the no-network smoke and operator approval.
11. Complete production hardening, backup/restore check, zero-charge review, and launch gate.

The next immediate task is not provider activation. The next safe implementation task is the Phase 7 compact-evidence and official-site execution design, still local-safe and disabled by default.

## 6. Features Deferred Until After Launch

Deferred from Solo v1:

- Zyte API.
- Extra Scrapy Cloud units.
- GitHub Actions crawler fallback.
- Credit-backed fallback runner.
- Automatic provider orchestration.
- Automatic provider failover.
- Amazon, marketplace, supplier-directory, and broad search-discovery crawling.
- AI summaries.
- Outreach automation.
- Team roles.
- Advanced monitoring and alerts.
- Complex approval workflows.
- Full raw-evidence R2 storage.
- Screenshot archives.
- Long-term R2 history/archive automation.
- Paid search, paid proxy, paid email-verification, or paid business-registry services.

R2 can be added after launch for compressed HTML, screenshots, batch archives, and backup objects. Solo v1 should not depend on R2 to show basic evidence provenance in the dashboard.

## 7. Stop Conditions

Stop before any of the following:

- Live crawling without an explicit approved crawl task.
- Zyte deployment before Phase 10B no-network smoke scope is approved.
- Zyte API key creation or `ZYTE_API_ENABLED=true`.
- Extra Scrapy Cloud unit allocation.
- `PAID_SERVICES_ALLOWED=true`.
- `ALLOW_EXTRA_SCRAPY_UNITS=true`.
- `ENABLE_AMAZON=true`.
- Cloudflare deploy or resource creation.
- New feature phases outside the Solo v1 sequence.
- Removing or rewriting tested Phase 0-8 foundations.

## 8. Operator Actions Required Before Solo v1 Launch

- Provide `INGESTION_HMAC_SECRET` before non-dry-run ingestion.
- Create or confirm Cloudflare staging D1 databases, Worker, Pages, and Access only when the Cloudflare phase is reached.
- Confirm the single allowed Cloudflare Access user before dashboard exposure.
- Keep Zyte Scrapy Cloud at exactly one free unit and do not add a Zyte API key.
- Approve the first official-site live crawl seed list when the code reaches that gate.
