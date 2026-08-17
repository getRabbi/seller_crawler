# Amazon Operator Workflow Final Report

Date: 2026-08-17  
Application/deployment commit: `ff3ade8696857c011742a7aa8fd177bdd256e163`  
Baseline: `1844bc6c699d76e9c301a65ff83e06f86b80199c`  
Branch: `main`

## Executive verdict

The Amazon operator workflow is implemented, tested, CI-green, and deployed to
staging. The authenticated dashboard can create bounded Amazon or known-site
runs without a developer changing flags, the Worker enforces one active Scrapy
Cloud job, later runs queue, and cancel/retry use the existing Student project.
Official-site enrichment, encrypted contact persistence, masked APIs/CSV,
audited reveal, search, duplicate actions, and crawl history are working in
staging.

The system is **not promoted to production and is not yet fully
production-ready**. The one permitted real Amazon staging verification reached
Amazon, but Amazon returned HTTP 503 for both bounded search attempts. No
product or seller page was served, so no Amazon identity could be validated and
the live Amazon-to-official-site handoff could not occur. The source was not
retried beyond the bounded job, no evasion was attempted, and production
promotion correctly stopped at this staging gate.

This is an external source-availability limitation, not a paid-service or
credential issue. The Amazon parser and persistence path are covered by
sanitized executable tests; live Amazon data correctness remains unaccepted.

## Amazon implementation verdict before changes

At baseline `1844bc6`, the repository had Amazon policy/feature scaffolding but
no complete executable public-page identity-discovery path. Interfaces,
feature flags, and fixtures did not prove a real search -> product -> seller ->
ingestion workflow. Amazon and operator discovery were also disabled in the
deployed Solo staging runtime.

## Amazon implementation completed

- Real `amazon_discovery` Scrapy spider and isolated Amazon source adapter.
- Public keyword/product search for eight supported marketplaces.
- Bounded pagination, product identity, ASIN, title, brand/category, product to
  seller relationship, merchant token, seller/storefront identity, public
  business location, and credible explicitly displayed official-site URL.
- Deterministic normalization and IDs for sellers, marketplace accounts,
  products, aliases, and source evidence.
- Signed, idempotent Worker ingestion into the four D1 partitions.
- Exact-domain and seller-country evidence filtering. Marketplace is never
  treated as seller country.
- Robots enforcement, one-request-per-domain concurrency, delay, request/page
  limits, safe retry, explicit 401/403/429/CAPTCHA/block stop, Retry-After
  cooldown persistence, and pre-run cooldown authorization.
- No Amazon contact scraping. Email, phone, WhatsApp, and WeChat remain an
  official-public-site enrichment responsibility.
- No logged-in account, cookies, CAPTCHA solving, hidden/private API, proxy
  rotation, Zyte API, paid fallback, or provider switching.

Primary implementation evidence:

- `crawler/sellerintel/adapters/amazon/parser.py`
- `crawler/sellerintel/adapters/amazon/records.py`
- `crawler/sellerintel/spiders/marketplace_seller.py`
- `crawler/sellerintel/runtime/scrapy_cloud.py`
- `crawler/tests/test_amazon_adapter.py`
- `apps/worker-api/src/operator-crawl/service.ts`
- `apps/worker-api/src/operator-crawl/routes.ts`
- `database/migrations/operations/0005_operator_crawl_control.sql`

## Bounded real Amazon staging test

The sole approved real Amazon test used:

| Property | Value |
|---|---|
| Operator run | `01a00f0e-5b88-76ed-825e-848c80a7a3ec` |
| Scrapy Cloud job | `871778/3/1` |
| Project | existing Student project `871778` |
| Artifact | `96c1dfe38bf788b73dd9dc3f4a67da500cebdcbb` |
| Query | `stainless steel bottle` |
| Marketplace | `amazon.com` |
| Target | 1 seller |
| Search pages | 1 |
| Units requested | exactly 1 |
| Zyte API / paid services | disabled |
| Outcome | `completed_with_warnings` |

Safe request-storage evidence:

- `GET https://www.amazon.com/robots.txt` -> HTTP 200.
- Bounded public search request -> HTTP 503.
- One permitted retry of that search request -> HTTP 503.
- 3 response records, 0 items, 1 persisted crawl error.
- No 401, 403, 429, CAPTCHA, bot-challenge, or source-block signal.
- No Amazon source record, marketplace account, product relationship, or
  seller was persisted because Amazon did not serve a usable search page.
- No further Amazon request was made after the one approved verification.

Scrapy Cloud `run.json` supports per-job settings and an explicit `units`
parameter; the implementation sends `units=1` and injects secrets only through
backend job settings. See the official [Zyte Jobs API](https://docs.zyte.com/scrapy-cloud/usage/reference/http/jobs.html)
and [Logs API](https://docs.zyte.com/scrapy-cloud/usage/reference/http/logs.html).

## Live Amazon field verification

These classifications apply to the bounded live test, not the sanitized parser
fixtures.

| Expected field | Result | Evidence |
|---|---|---|
| Marketplace | PASS | `amazon.com` persisted on the operator run |
| Query relationship | PASS | query persisted and used for the bounded search job |
| ASIN/product identifier | MISSING | Amazon search returned HTTP 503 |
| Product title | MISSING | no public product result was served |
| Brand | MISSING | no public product result was served |
| Product -> seller relationship | MISSING | no product page could be scheduled |
| Seller display name | MISSING | no seller page could be scheduled |
| Merchant/seller ID | MISSING | no seller page could be scheduled |
| Business/company name | MISSING | no seller page could be scheduled |
| Storefront/seller URL | MISSING | no seller page could be scheduled |
| Public seller location | NOT_PUBLIC | no seller business page was served in this test |
| Source URL/provenance | PARTIAL | operator/job/request provenance exists; no ingestible Amazon source row exists |
| Crawl timestamp | PASS | operator/job timestamps persisted |
| Evidence object | MISSING | no compliant public result content was received |
| Normalization result | MISSING | no live Amazon identity existed to normalize |

Sanitized fixtures separately verify search/product/seller parsing, ASIN,
brand, merchant token, business name/location, storefront URL, public official
website evidence, country filtering, normalization, persistence payloads, and
429 cooldown behavior. They are implementation evidence, not a substitute for
the failed live source response.

## Official-site enrichment and contacts

The final controlled staging verification used the current immutable artifact:

| Property | Value |
|---|---|
| Operator run | `01a00f28-9722-7539-afb9-c738d0644f7a` |
| Scrapy Cloud job | `871778/1/13` |
| Artifact | `ff3ade8696857c011742a7aa8fd177bdd256e163` |
| Seed | controlled staging official-site fixture |
| Outcome | Completed |
| Seller enriched | 1 |
| Contacts ingested | 4 |
| Errors | 0 |

The run persisted the canonical company/domain, evidence source, and one each
of email, phone, WhatsApp, and WeChat. All four contact rows use the versioned
`si-aesgcm:v1` AES-256-GCM envelope and all four list/CSV values are masked.
An authenticated reveal returned a non-empty decrypted value without printing
or persisting it in this report, and a `contact_revealed` audit event was
written with the operator reason.

The live test also exposed and fixed a timestamp defect: operator-launched
official-site jobs could turn a missing `SELLERINTEL_OBSERVED_AT` override into
the literal string `None`. The Worker now injects a per-job ISO timestamp and
the spider has a UTC fallback. Final D1 verification found zero seller rows
with `None` timestamps; the representative row has valid UTC `last_seen_at`
and `updated_at` values.

Automatic Amazon -> official-site enrichment is implemented and integration
tested, but it was **not live-verified in the Amazon job** because no Amazon
seller or credible domain was returned by the HTTP 503 source response.

## New Crawl architecture

The authenticated single-operator flow is:

1. Dashboard posts a validated, idempotent request to the Worker.
2. OPS_DB persists the request, event trail, queue status, filters, limits, and
   immutable artifact version.
3. A unique active-slot index permits one active job. Additional requests stay
   `queued`.
4. The Worker launches the existing project with `units=1`, required secrets in
   backend-only `job_settings`, and every paid/provider fallback locked.
5. Amazon discovery ingests normalized identity batches. Credible official
   domains are then handed to `official_website` on the same unit.
6. Signed ingestion updates CORE_DB, CONTACTS_DB, OPS_DB, and HISTORY_DB.
7. The Worker refreshes job status and exposes results, events, cancel, and
   retry through Access-authenticated APIs.

Direct mode accepts only credential-free public HTTPS URLs, rejects local,
private, reserved, port-bearing, query-bearing, or fragment-bearing targets,
and applies server-side page/depth limits. DNS-rebinding resolution is not
performed at Worker request-validation time; the crawler still enforces the
approved host, same-domain, robots, and source-policy boundaries.

## Supported marketplaces and country semantics

Supported marketplaces are exactly:

- Amazon.com
- Amazon.co.uk
- Amazon.ca
- Amazon.com.au
- Amazon.de
- Amazon.fr
- Amazon.it
- Amazon.es

The UI exposes Bangladesh, China, India, Vietnam, Pakistan, United States,
United Kingdom, Canada, Australia, Germany, France, Italy, and Spain. Empty
means All. Filtering uses publicly displayed seller/business country evidence;
unknown evidence does not silently inherit marketplace geography.

Target seller count accepts a custom integer from 1 to 100, with 10, 25, 50,
and 100 suggestions. Amazon result pages are limited to 1-3, official pages per
seller to 1-25, crawl depth to 0-3, keywords to five, and direct URLs to twenty.
All limits are independently enforced by the Worker.

## Queue, cancel, and retry verification

- First Amazon run acquired the only slot and started job `871778/3/1`.
- Direct run `01a00f0e-c531-788b-a334-2e1fef9b3b46` was created while it was
  active and remained `queued`; no second job/unit was started.
- After the Amazon run finished, that queued request advanced on the same slot
  as job `871778/1/9`.
- Active cancel run `01a00f13-452f-7c71-9bd0-fa62c846e694` launched job
  `871778/1/10`; operator cancel produced Scrapy Cloud close reason `cancelled`.
- Retry created new audited run `01a00f14-0881-7150-b7d0-efb0797f3b3f` and job
  `871778/1/11`; it was immediately cancelled for bounded verification.
- Final state: 6 operator runs, 0 active slots, and 0 running Scrapy Cloud jobs.

## Worker, D1, and dashboard verification

Authenticated staging responses returned HTTP 200 for:

- health
- sellers and seller detail data path
- contacts
- search
- duplicate review
- crawl runs
- metrics
- masked seller CSV
- masked contact CSV

Staging D1 evidence after acceptance:

| Partition | Evidence |
|---|---|
| CORE_DB | 3 sellers, 1 official domain, 3 FTS rows; Amazon marketplace/product rows remain 0 after source 503 |
| CONTACTS_DB | 4 contacts, 4 AES-GCM envelopes, 4 masked values; audited reveal present |
| OPS_DB | 6 operator runs; 2 cancelled, 3 completed, 1 completed with warnings; 0 active slots |
| HISTORY_DB | bound and queryable; no material field-history changes were generated by the idempotent fixture refresh |

FTS search returned HTTP 200 and indexes all three sellers. Duplicate state and
audits prove real merge followed by rollback, keep-separate, and ignore:

- decision states: 1 `rolled_back`, 1 `kept_separate`, 1 `ignored`
- audit events: `duplicate_merge`, `duplicate_rollback`,
  `duplicate_keep_separate`, and `duplicate_ignore`

## Dashboard changes

- Primary **New Crawl** navigation and operational form.
- Find Sellers and Crawl Known Websites modes.
- Multiple keyword queries, marketplace/country selection, category, brand,
  seller name, location/site requirements, manufacturer/trader likelihood,
  custom bounded target count, contacts, result pages, site pages, and depth.
- Server-backed Sellers and Contacts filters, active chips, sorting, and clear.
- Operational Crawl Runs with status, counts, warnings/errors, cancel, retry,
  details, and result links.
- Overview metrics and truthful runtime badges.
- Dark existing visual language retained.
- Production build fails closed without an HTTPS Worker origin. Localhost is
  available only in explicit development.

The deployed custom domain is Access-protected and the deployed New Crawl JS
contains `https://api-stg.scalemyprints.com`, contains the custom target
control, and contains no `127.0.0.1:8787` fallback.

## Staging deployment inventory

| Resource | Final state |
|---|---|
| Cloudflare account | approved account `b63e426431b63ec9db33d7c421d01b42`, guarded before/after mutations |
| Worker | `seller-intelligence-api-staging` |
| Worker version | `009a9577-2403-43eb-aaba-61e00f6d3f05` |
| Worker route | `https://api-stg.scalemyprints.com` |
| Pages project | `seller-intelligence-staging` |
| Pages deployment | `c05bcd09-9951-49fe-98a7-9db9f2e76a21` |
| Pages immutable URL | `https://c05bcd09.seller-intelligence-staging.pages.dev` |
| Dashboard custom domain | `https://dashboard-stg.scalemyprints.com` |
| Scrapy Cloud project | existing project `871778` |
| Crawler version | `ff3ade8696857c011742a7aa8fd177bdd256e163` |
| Spiders | `amazon_discovery`, `official_website`, `solo_no_network_smoke` |
| Active Scrapy jobs at close | 0 |

No Wear The Mood account/resource was accessed or modified.

## Automated validation

| Check | Result |
|---|---|
| `uv run ruff check crawler` | pass |
| `uv run mypy crawler/sellerintel crawler/tests` | pass, 95 source files |
| `uv run pytest crawler/tests` | pass, 127 tests |
| extractor coverage | pass, 5 tests, 95.36% |
| `uv run bandit -r crawler/sellerintel` | pass, 0 findings |
| `uv run pip-audit` | pass, no known vulnerabilities |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test` | pass, 52 tests in 8 files |
| `npm run health:worker` | pass, 5 tests |
| `npm run audit:prod` | pass, 0 vulnerabilities |
| staging static dashboard build | pass, 11 static pages |
| local fixture runner | pass, 8 pages / 4 contacts / 0 errors |
| clean-context Docker build | pass |
| Docker `--network none` smoke | pass, 8 pages / 4 contacts / 0 errors |

Dedicated coverage includes Amazon parsing and product-to-seller relationships,
country semantics, page limits, explicit blocks/429 cooldown, official-site
handoff, encryption, reveal authorization, entity resolution, duplicate
actions/rollback, job creation, one-unit queue, cancel/retry, SSRF validation,
runtime flag classification, API client, non-local build configuration, and
the missing-observation-time regression.

GitHub CI for the immutable application commit:

- CI Python `32017434247`: success.
- CI Web `32017434220`: success. The only annotation is GitHub's upstream
  Node 20 action deprecation notice; it does not fail or weaken the build.

## Changed files since the accepted dashboard baseline

```text
.dockerignore
.env.example
.gitignore
CHANGELOG.md
README.md
SOLO_V1_FINAL_PRODUCTION_REPORT.md
apps/dashboard/app/contacts/page.tsx
apps/dashboard/app/crawl-health/page.tsx
apps/dashboard/app/crawls/new/page.tsx
apps/dashboard/app/globals.css
apps/dashboard/app/page.tsx
apps/dashboard/app/sellers/page.tsx
apps/dashboard/components/dashboard-shell.tsx
apps/dashboard/components/status.tsx
apps/dashboard/lib/dashboard-data.ts
apps/dashboard/lib/runtime.ts
apps/dashboard/tests/runtime.test.ts
apps/worker-api/src/dashboard/repository.ts
apps/worker-api/src/dashboard/routes.ts
apps/worker-api/src/index.ts
apps/worker-api/src/ingestion/route.ts
apps/worker-api/src/ingestion/source-policy.ts
apps/worker-api/src/observability/health.ts
apps/worker-api/src/operator-crawl/routes.ts
apps/worker-api/src/operator-crawl/service.ts
apps/worker-api/src/validation/startup.ts
apps/worker-api/test/dashboard.test.ts
apps/worker-api/test/health.test.ts
apps/worker-api/test/operator-crawl.test.ts
apps/worker-api/wrangler.production.toml.example
apps/worker-api/wrangler.staging.toml.example
apps/worker-api/wrangler.toml
crawler/sellerintel/adapters/amazon/__init__.py
crawler/sellerintel/adapters/amazon/parser.py
crawler/sellerintel/adapters/amazon/records.py
crawler/sellerintel/config/features.py
crawler/sellerintel/config/sources.py
crawler/sellerintel/normalization/country.py
crawler/sellerintel/pipelines.py
crawler/sellerintel/runtime/scrapy_cloud.py
crawler/sellerintel/spiders/marketplace_seller.py
crawler/sellerintel/spiders/website_contacts.py
crawler/tests/fixtures/amazon/blocked.html
crawler/tests/fixtures/amazon/product.html
crawler/tests/fixtures/amazon/search.html
crawler/tests/fixtures/amazon/seller.html
crawler/tests/test_amazon_adapter.py
crawler/tests/test_cloud_ingestion_pipeline.py
crawler/tests/test_database_migrations.py
crawler/tests/test_official_site_spider.py
crawler/tests/test_scrapy_cloud_runner.py
crawler/tests/test_source_adapters.py
crawler/tests/test_startup_gates.py
database/migrations/operations/0005_operator_crawl_control.sql
packages/shared-types/src/dashboard.ts
```

No secret value is in these files or this report. The real staging Wrangler
configuration and `.env` remain ignored operator configuration.

## Functional and safety flag classification

`ENABLE_SEARCH_DISCOVERY=false` refers to the separate generic/paid discovery
provider. Amazon/public-source keyword discovery is represented by
`ENABLE_AMAZON=true` plus operator control and is active.

| Setting / capability | Classification | Accepted staging | Production intended after gate | Reason |
|---|---|---|---|---|
| Runner mode | FUNCTIONAL | `zyte_student_active` | `zyte_student_active` | Existing Student runner |
| Live crawl | FUNCTIONAL | operator controlled / true | operator controlled / true | Dashboard-launched bounded jobs |
| Amazon discovery | FUNCTIONAL | ACTIVE | ACTIVE | Required identity discovery |
| Amazon/public keyword discovery | FUNCTIONAL | ACTIVE | ACTIVE | Required New Crawl workflow |
| Generic/paid search provider | SAFETY/BILLING | OFF | OFF | Not needed; no approved free provider |
| Official-site enrichment | FUNCTIONAL | ACTIVE | ACTIVE | Required company/contact enrichment |
| Email extraction | FUNCTIONAL | ACTIVE | ACTIVE | Required contact type |
| Phone extraction | FUNCTIONAL | ACTIVE | ACTIVE | Required contact type |
| WhatsApp extraction | FUNCTIONAL | ACTIVE | ACTIVE | Required contact type |
| WeChat extraction | FUNCTIONAL | ACTIVE | ACTIVE | Required contact type |
| Operator crawl API | FUNCTIONAL | ACTIVE | ACTIVE | Dashboard-driven launch/control |
| Global emergency kill switch | SAFETY | NOT TRIGGERED | NOT TRIGGERED | Emergency pause remains available |
| Zyte API | SAFETY/BILLING | OFF | OFF | Prohibited paid API path |
| Extra Scrapy Cloud unit | SAFETY/BILLING | OFF | OFF | Exactly one Student unit |
| Paid services | SAFETY/BILLING | OFF | OFF | Zero-charge requirement |
| Maximum external spend | SAFETY/BILLING | AUD 0 | AUD 0 | Zero-charge requirement |
| Paid add-ons | SAFETY/BILLING | OFF | OFF | Prohibited |
| GitHub Actions crawler | SAFETY/BILLING | OFF | OFF | No crawler fallback |
| Credit runner | SAFETY/BILLING | OFF | OFF | No paid fallback |
| Alibaba/1688 | DEFERRED | OFF | OFF | Outside this workflow |
| AI/outreach/team features | DEFERRED | OFF | OFF | Outside Solo operator scope |

The accepted staging environment is not `development_locked`; its health
response reports Zyte Student active, live crawl operator controlled, Amazon
active, discovery active, official enrichment active, unit 1/1, paid services
locked, and zero violations.

The checked-in production example has that same intended functional state with
all safety locks. The real ignored production configuration remains locked and
unpromoted because the live Amazon staging gate did not pass; it is not an
accepted production runtime yet.

## Security and zero-charge status

- Cloudflare Access exact-email authentication remains required.
- Secrets exist only in Worker/Scrapy Cloud secret settings or the ignored
  approved local environment.
- Contact encryption keyring, HMAC secret, Access material, and Scrapy Cloud
  credential were never printed or committed.
- Contact APIs and CSV are masked by default; reveal is authenticated,
  reasoned, decrypted backend-side, and audited.
- HMAC ingestion includes idempotency and replay/nonce protection.
- No personal browser profile/cookie harvesting was used. Existing
  `cloudflared access curl` authentication was used for acceptance.
- No Zyte API, paid add-on, paid fallback, second unit, new Zyte project, R2,
  marketplace credentials, CAPTCHA bypass, or source evasion was used.
- Exactly one active unit is enforced; staging closed with zero running jobs.

Zero-charge verdict: **SAFE**.

## Real staging acceptance result

| Gate | Result |
|---|---|
| Dashboard -> authenticated Worker | PASS |
| New Crawl form/build/API origin | PASS |
| Parameter validation and hard limits | PASS |
| Existing one-unit launch | PASS |
| Second-run queue | PASS |
| Cancel and retry | PASS |
| Official-site enrichment | PASS |
| Contact encryption/masking/reveal | PASS |
| Four-D1 persistence/bindings | PASS |
| Search/FTS | PASS |
| Duplicate actions/audit/rollback | PASS |
| Crawl history and CSV | PASS |
| Amazon public request attempted | PASS |
| Live Amazon seller field extraction | **BLOCKED: Amazon HTTP 503** |
| Live Amazon -> official handoff | **NOT REACHED** |
| Production promotion | **NOT STARTED; staging gate incomplete** |

## Genuine remaining limitations and blocker

1. The sole approved live Amazon test did not return usable public search data.
   A future operator-approved bounded staging retry, after the source is
   available, must extract and compare at least one Amazon product/seller
   identity before promotion.
2. Because no live Amazon identity was obtained, live country filtering and
   automatic Amazon-to-official-site handoff are proven only by deterministic
   tests, not by the bounded external sample.
3. Production D1/Worker/Pages/Access resources were not provisioned or promoted
   in this sequence because the required staging Amazon data gate was not met.
4. The prior four-D1 backup/restore drill remains valid for the earlier staging
   checkpoint; a fresh post-`0005` production-shaped restore should be executed
   during the eventual production promotion.
5. Source availability cannot be guaranteed. The implementation correctly
   remains operator-ready and bounded, but it does not evade a source failure.

## Production readiness verdict

Implementation readiness: **COMPLETE** for the requested bounded operator
architecture. Staging platform readiness: **PASS except live Amazon data
acceptance**. Production launch readiness: **BLOCKED**.

Amazon is operational as a dashboard-launchable, one-unit, policy-controlled
capability, but a successful live seller result is not yet proven. Keyword
discovery is operational through the Amazon/public-source path. Official-site
enrichment and all four contact extractors are operational. Paid paths remain
locked.

The exact next action is: perform one newly approved, one-page, one-seller
Amazon staging retry when Amazon public search is available; compare the
source-visible product/seller fields to D1/dashboard output. Only if that passes
may the same immutable application be promoted to production infrastructure.
Do not broaden the crawl, add a unit, enable Zyte API, or enable a paid fallback.
