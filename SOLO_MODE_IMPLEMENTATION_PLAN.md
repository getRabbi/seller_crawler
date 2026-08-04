# Solo Mode Implementation Plan v1

Status: implemented locally; external staging/production handoff as of 2026-08-04.
Authoritative specification: `SELLER_INTELLIGENCE_MASTER_SPEC.md`.
Audit baseline: `PROJECT_STATUS_REPORT.md` and `STABILIZATION_REPORT.md`.
Current phase state: Phases 0-8, the Solo v1 Phase 9 API/dashboard surface, and
Phase 10A are complete and verified locally. Phase 10B code and exact one-unit
controls are complete; hosted deployment and job behavior remain blocked on the
consolidated external values in `OPERATOR_INPUTS_REQUIRED.md`. Later providers
remain deferred.

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
- Section 42.3, coding order: align the shortest Solo v1 sequence with the official-site-first launch path.
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
| Official-site crawler | `crawler/sellerintel/spiders/website_contacts.py`, `crawler/sellerintel/adapters/official_site/*`, `crawler/sellerintel/pipelines.py` |
| Entity resolution | `crawler/sellerintel/entity_resolution/*`, `database/migrations/core/0004_entity_resolution.sql` |
| Worker-backed static dashboard | `apps/dashboard/app/*`, `apps/dashboard/components/*`, `apps/dashboard/lib/api.ts`, `apps/dashboard/lib/use-api-resource.ts` |
| Local runner artifact | `Dockerfile`, `.dockerignore`, `docs/local-runner.md`, `infra/local-runner/README.md` |
| Safety configuration | `.env.example`, `apps/worker-api/wrangler.toml`, `Dockerfile`, `SECURITY.md` |

These foundations should be extended in place. Do not replace them with a separate one-off Solo implementation.

## 4. Work Still Required

Solo v1 still requires:

| Work item | Why it is required |
|---|---|
| Cloudflare resource values | Supply eight hosted D1 names/IDs, Worker and Pages hosts/projects, the zone, and staging/production routes. |
| Hosted secrets | Configure separate staging/production ingestion HMAC secrets and the exact Access allowed email without storing them in git. |
| Single-user Access deployment | Create the Access applications/policies, JWT audiences, team-domain configuration, and exact ingestion-path bypass described in the runbook. |
| Cloudflare staging proof | Apply all four remote migrations, deploy Worker/dashboard, and verify health, bindings, Access, search, detail, contacts, review, runs, and CSV. |
| Zyte external proof | Supply the verified project ID and Scrapy Cloud API credential, deploy the no-network spider, and verify one-unit start/status/completion/cancellation. |
| Approved seed | Supply one explicit policy-reviewed HTTPS seed for the tightly bounded staging smoke. |
| Backup drill | Export all four staging D1 databases, verify checksums, and complete the restore/FTS verification steps. |
| Production promotion | Repeat the verified staging sequence with distinct production databases, secrets, Access audience, and backup. |

## 5. Shortest Implementation Sequence To Working Solo v1

1. Complete the single checklist in `OPERATOR_INPUTS_REQUIRED.md`.
2. Populate untracked staging environment/Wrangler files and verify Cloudflare authentication.
3. Apply the four staging D1 migrations and deploy the Worker behind Access, with only the HMAC ingestion path bypassed.
4. Build/deploy the static dashboard and verify every Worker-backed state and CSV export.
5. Export the four staging D1 databases and verify the checksummed backup/restore procedure.
6. Deploy and run the no-network Scrapy Cloud smoke with exactly one unit; verify status, completion, and cancellation.
7. Temporarily open the live gate for one explicitly approved official-site seed, verify signed ingestion end to end, then close it immediately.
8. Promote the same verified build to production with distinct resources and secrets.

The next exact task is the consolidated external-input checklist, followed by
the staging sequence in `DEPLOYMENT_RUNBOOK.md`. No additional feature phase is
required for Solo v1 launch.

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
