# Seller Intelligence Platform — Zero-Cost Hybrid Runner Master Specification v2.0

**Document status:** FROZEN FOR IMPLEMENTATION WITH SOLO MODE V1 AMENDMENT
**Specification version:** 2.1.1
**Target builder:** OpenAI Codex  
**Primary use:** Internal B2B product and supplier research  
**Target throughput:** Up to 500 useful new or materially updated intelligence events per day  
**Hosting objective:** No recurring hosting charge while the system remains inside free-tier, student-credit, and operator-approved limits  
**Primary crawler runtime:** Zyte Scrapy Cloud Student unit, only after entitlement confirmation  
**Guaranteed fallback runtime:** Local Docker/Scrapy runner using the same codebase  
**Additional bounded fallbacks:** GitHub Actions burst runner and operator-approved credit-backed container  
**Current activation state:** `ZYTE_STUDENT_CONFIRMED`; deploy and live-crawl gates disabled
**Freeze date:** 28 July 2026  
**Solo Mode amendment date:** 4 August 2026
**Official-domain resolution refinement:** 24 August 2026
**Change authority:** Architecture changes require an explicit specification amendment before code changes  

---

## Solo Mode v1 implementation amendment

This amendment authorizes the single-operator launch scope in
`SOLO_MODE_IMPLEMENTATION_PLAN.md`. It supersedes conflicting v2.0 requirements only
for the Solo Mode v1 launch. The tested Phase 0-8 foundations remain valid and the
larger v2.0 architecture remains the post-launch roadmap.

Solo Mode v1 requires:

- official company website crawling from explicit operator-approved seed URLs;
- email, phone, WhatsApp, and WeChat extraction;
- company/contact normalization and basic deterministic entity resolution;
- signed, idempotent Worker ingestion into the existing core, contacts, operations,
  and history D1 databases;
- compact D1 evidence containing source URL, page title, short evidence snippet,
  content hash, `detected_at`, and `last_seen_at`;
- a simple searchable private dashboard, CSV export, basic four-D1 backup/restore,
  and single-user Cloudflare Access;
- one verified Zyte Student Scrapy Cloud unit and one local Docker/Scrapy fallback,
  selected manually and never active through automatic provider switching.

R2 is optional for Solo Mode v1. Full HTML, screenshots, long-term raw evidence,
and R2-hosted backup archives are deferred. Compact evidence in D1 is sufficient for
the initial launch. Sections that require immediate R2 evidence upload or raw-evidence
viewer support apply after Solo Mode v1 unless a later amendment restores them to the
launch gate.

The following are deferred until after Solo Mode v1: Zyte API, extra Scrapy Cloud
units, GitHub Actions crawler fallback, credit-backed fallback, automatic provider
orchestration, marketplace and supplier-directory crawlers, AI summaries, outreach
automation, team roles, advanced monitoring, complex approval workflows, and full
raw-evidence R2 storage.

Confirmed zero-charge controls are:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
MAX_EXTERNAL_MONTHLY_SPEND_AUD=0
ALLOW_EXTRA_SCRAPY_UNITS=false
ENABLE_AMAZON=false
```

`SCRAPY_CLOUD_DEPLOY_ENABLED` and `LIVE_CRAWL_ENABLED` remain false until their
controlled smoke-test gates. No implementation step may allocate a second unit,
call Zyte API, or select a provider automatically.

The older entitlement-pending statements below are retained as historical context
from the 28 July freeze. Zyte Support confirmed the Student entitlement on 4 August
2026: exactly one Scrapy Cloud unit is free, no paid Scrapy Cloud subscription is
enabled, and charges are possible only if another unit is added or Zyte API is used.

### Phase 7 production refinement: deterministic official-domain resolution

This refinement stays inside the frozen provider-neutral Phase 7 architecture. It
does not activate the separately deferred search-discovery adapter and does not
add a crawler provider, paid API, browser automation, CAPTCHA handling, or an
additional Scrapy Cloud unit.

After bounded Amazon identity discovery, unresolved canonical sellers may enter a
sequential `resolving` stage on the same one-unit slot. The Worker derives at most
two HTTPS candidates per seller and at most 25 candidates per run from already
collected public seller names and seller aliases. Product brands alone are not
official-domain identity evidence because a reseller may carry unrelated brands.
Candidate construction is deterministic, limited to compact or hyphenated exact identity labels and the
marketplace country suffix plus `.com`; it is not a DNS wildcard scan or search
engine query.

Each candidate is subject to robots.txt, cooldown, same-domain redirect, public
response-address, one-request-per-domain, response-size, timeout, and explicit-block
controls. Automatic acceptance requires a score of at least 80 and both independent
identity conditions: exact normalized domain-label match and exact normalized
prominent-page identity match. Parked or for-sale pages are rejected. Scores from
55 to 79 may be recorded for review; lower scores are rejected. Only accepted
candidates may update `sellers.official_domain` and enter the existing contact-page
crawl. Candidate evidence uses existing versioned `sources` and `review_queue`
records with no raw contact value, so no database migration is required.

The maximum discovery overhead is 25 candidate pages plus bounded robots handling.
The existing 100-page official-enrichment cap, one active unit, zero-charge lock,
and disabled `ENABLE_SEARCH_DISCOVERY`/Zyte API/paid-service gates remain unchanged.
Each external stage has a unique run/stage tag so a stale uncertain launch can be
recovered authoritatively without starting a duplicate job; an unprovable outcome
fails closed.
Rollback is an application-code rollback or forward feature disable; accepted
canonical, source, review, contact, and historical records are preserved.

---

## 0. বাংলা সিদ্ধান্ত

এই document আগের provider-independent zero-cost plan এবং পরের Zyte-first plan-কে একত্র করে একটি **single hybrid architecture** বানায়। System-এর database, API, dashboard, crawler contracts, deduplication, history এবং evidence pipeline কোনো একটি crawler host-এর ওপর নির্ভর করবে না।

Final execution order:

1. **Development and tests:** Local fixtures + local Docker/Scrapy runner
2. **Preferred production runner:** Verified GitHub Student Zyte Scrapy Cloud unit
3. **Fallback A:** Operator-owned PC/server-এ local scheduled runner
4. **Fallback B:** GitHub Actions manual/low-frequency burst runner, included minutes-এর ভেতরে
5. **Fallback C:** Existing student credit-backed container, such as an already-claimed Heroku student credit, only with an explicit hard spending guard
6. **Control and data plane:** Cloudflare Worker + D1 + R2 + Pages/Access সব runner-এর জন্য একই থাকবে

### Current Zyte account state

28 July 2026-এর visible account UI অনুযায়ী account এখন `Free Unit Plan` দেখাচ্ছে, যেখানে 1-hour job runtime এবং 1-week retention দেখা যাচ্ছে। GitHub Student offer publicly advertises one free unit with purchased-unit benefits, including unlimited crawl time and 120-day retention. Zyte support confirmation pending থাকায় Codex must treat the student entitlement as **not yet verified**.

Therefore:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=false
SCRAPY_CLOUD_DEPLOY_ENABLED=false
LIVE_CRAWL_ENABLED=false
```

Entitlement confirmation না আসা পর্যন্ত Phase 0–9 local/mock mode-এ implement করা যাবে; কোনো Zyte deploy বা real crawl করা যাবে না।

### গুরুত্বপূর্ণ সীমাবদ্ধতা

- GitHub Student Zyte benefit হলো Scrapy Cloud unit; এটি Zyte API subscription নয়।
- Zyte API signup trial আলাদা PAYG product। It must remain disabled and absent from runtime secrets unless the operator explicitly authorizes a non-zero budget.
- Scrapy Cloud job retention system-of-record নয়; every accepted batch and evidence object must be exported immediately to D1/R2.
- Free public proxy lists core architecture নয়। তারা unreliable এবং risky; block evasion-এর জন্য ব্যবহার নিষিদ্ধ।
- CAPTCHA bypass, login-cookie harvesting, fingerprint evasion, access-control bypass, hidden API abuse, private-data collection এবং automated spam নিষিদ্ধ।
- Amazon is an optional, isolated identity-discovery adapter and remains disabled by default.
- Daily 500 একটি engineering target, guarantee নয়।


# 1. Executive architecture decision

## 1.1 Final platform map

```text
                         ┌──────────────────────────────┐
                         │ Private GitHub Monorepo      │
                         │ Frozen Spec + Codex + CI     │
                         └──────────────┬───────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │ Runner Controller            │
                         │ Manual provider selection    │
                         │ No automatic paid fallback   │
                         └───────┬────────┬────────┬─────┘
                                 │        │        │
                 ┌───────────────┘        │        └────────────────┐
                 ▼                        ▼                         ▼
┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
│ Primary                │  │ Guaranteed fallback    │  │ Bounded fallbacks      │
│ Zyte Scrapy Cloud      │  │ Local Docker/Scrapy    │  │ GitHub Actions burst   │
│ Student unit, verified │  │ Task Scheduler / cron  │  │ Credit-backed container│
└───────────┬────────────┘  └───────────┬────────────┘  └───────────┬────────────┘
            └────────────────────────────┼───────────────────────────┘
                                         │ signed idempotent batches
                                         ▼
                         ┌──────────────────────────────┐
                         │ Cloudflare Worker /v1 API    │
                         │ Validation + Auth + Search   │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────┴───────────────┐
                         ▼                              ▼
              ┌──────────────────────┐       ┌──────────────────────┐
              │ Cloudflare D1        │       │ Cloudflare R2        │
              │ Canonical + history  │       │ Evidence + archives  │
              └──────────┬───────────┘       └──────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Cloudflare Pages     │
              │ Private dashboard    │
              │ Cloudflare Access    │
              └──────────────────────┘
```


## 1.2 Why this is the final choice

### Provider-independent control and data plane

The durable platform does not live inside Zyte, GitHub Actions, a laptop, or a temporary credit host. Every runner emits the same versioned batch contract to the same Worker API. D1 owns canonical state; R2 owns evidence and archives. A runner can be replaced without rewriting business logic or migrating seller data.

### Zyte Scrapy Cloud as preferred runner

After student entitlement confirmation, one student unit is the preferred remote runner because it provides managed deployment, scheduling, logs, and a cloud job slot without recurring crawler-hosting cost. All jobs remain sequential and use exactly one unit. Extra units are prohibited unless the specification and budget are amended.

### Local Docker/Scrapy as guaranteed fallback

The local runner is the only fallback that does not depend on another vendor entitlement. It uses the exact same package, spiders, contracts, spool, and ingestion client. It can run on Windows Task Scheduler, Linux cron, or a manually started Docker Compose profile. The device must remain powered and connected; therefore it is operationally less convenient but architecturally complete.

### GitHub Actions as bounded burst fallback

GitHub Actions may run small manual or low-frequency recovery batches within the account's currently included minutes. It is not the permanent crawler and must never silently consume paid minutes. It is disabled by default and cannot be selected automatically after another provider fails.

### Credit-backed container as emergency fallback

An already-available student credit host may run the same Docker image during a temporary outage. This mode is not guaranteed forever and must include a hard operator-defined spend ceiling, no paid add-ons, and automatic shutdown before credit expiry.

### Cloudflare D1 instead of Supabase

Cloudflare D1 Free currently provides 5 GB total storage across the account, a maximum of 500 MB per Free database, up to 10 Free databases, 5 million rows read per day, and 100,000 rows written per day. The design uses multiple logical databases and external R2 archives. Cross-database integrity is enforced by ordered idempotent writes and reconciliation.

Supabase remains a documented migration alternative, not a hot standby. It is not used simultaneously because dual writes would increase complexity and free-tier consumption.

### Cloudflare R2

R2 Standard free allocation is used for compressed HTML evidence, JSONL batches, reports, and backups. Scrapy Cloud retention is never trusted as durable storage.

### Cloudflare Pages and Workers

Pages hosts the static dashboard. Workers provides the thin API, validation, authentication boundary, and indexed queries. Heavy parsing remains inside the selected crawler runner.

## 1.3 Non-negotiable provider rule

```text
A provider failure may pause crawling.
It may not trigger an automatic paid upgrade,
extra Scrapy Cloud unit,
Zyte API call,
or paid proxy purchase.
```

Every provider transition requires an explicit operator action and an audit event.


# 2. Reality check: what “fully free” means

## 2.1 Free recurring infrastructure

The following can remain at AUD 0 while all quotas are respected:

| Component | Free resource used | Purpose |
|---|---:|---|
| Zyte Scrapy Cloud | 1 Student unit after verification | Preferred scheduled Python crawler |
| Cloudflare Pages | Free | Static dashboard |
| Cloudflare Worker | Free | API and secure ingestion |
| Cloudflare D1 | Free | Structured data |
| Cloudflare R2 | Free | Evidence and archives |
| Cloudflare Access | Free plan | Private dashboard |
| GitHub | Student/Pro benefits | Private repository |
| GitHub Actions | Included minutes | CI/deployment and disabled burst fallback |
| Codex | Existing ChatGPT plan entitlement | Development |

## 2.2 Not automatically free

The following must be treated as optional:

- Zyte API browser requests
- Zyte automatic extraction
- Paid residential proxies
- Paid search APIs
- Paid email-verification APIs
- Paid business registry APIs
- Paid CAPTCHA-solving services
- Paid third-party Amazon data providers

The system must work without these. Where optional credits exist, they can be enabled behind feature flags.

## 2.3 Throughput expectation

The system target is:

```text
900–1,200 seller candidates/day
        ↓
700–900 valid identities
        ↓
450–650 public business contact matches
        ↓
up to 500 accepted new or materially updated records/day
```

A strict guarantee of 500 fully verified new contacts every day is not realistic on a permanent zero-cost basis. The correct KPI is:

```text
new accepted sellers
+ materially updated sellers
+ newly verified contacts
= 500 useful daily intelligence events
```

---


## 2.4 Execution modes and state machine

Allowed states:

```text
development_locked
zyte_entitlement_pending
zyte_student_active
fallback_local
fallback_actions_burst
fallback_credit_container
paused_by_operator
paused_by_policy
paused_by_quota
```

Initial state:

```text
RUNNER_MODE=development_locked
LIVE_CRAWL_ENABLED=false
PAID_SERVICES_ALLOWED=false
```

Transition rules:

| From | To | Requirement |
|---|---|---|
| development_locked | fallback_local | Local tests, ingestion, and source approval pass |
| zyte_entitlement_pending | zyte_student_active | Written/account-level confirmation and one-unit zero-charge verification |
| any active runner | paused_by_policy | 401, 403, CAPTCHA, terms concern, or operator kill switch |
| any active runner | paused_by_quota | D1/R2/Worker/runner circuit breaker |
| zyte_student_active | fallback_local | Explicit operator action; no automatic failover |
| fallback_local | fallback_actions_burst | Explicit operator action and included-minute budget available |
| any active runner | fallback_credit_container | Explicit operator action, active credit, and zero-overage guard |

Only one production runner mode may be active at a time. Development jobs may run locally with fixtures while production crawling is paused.


# 3. Compliance and operating boundaries

## 3.1 Allowed operating model

The platform may collect:

- Public business identity information
- Publicly displayed company names
- Public business addresses
- Public official website URLs
- Public business email addresses
- Public business WhatsApp links
- Public business WeChat IDs
- Public supplier or manufacturer profile URLs
- Product and brand relationships needed for internal research
- Source URL, timestamps, and evidence required to verify each field

## 3.2 Restricted behavior

The platform must not:

- Bypass CAPTCHA or bot challenges
- Circumvent authentication
- Harvest logged-in account data
- Steal or reuse browser cookies
- Abuse hidden or private APIs
- Rotate IPs to defeat an explicit block
- Impersonate human browser fingerprints to evade controls
- Scrape private personal profiles
- Enrich residential addresses for public publication
- Collect breached, leaked, or purchased private databases
- Send automated bulk spam
- Continue crawling a domain after an explicit stop request
- Ignore robots rules or platform terms without documented approval

## 3.3 Amazon-specific rule

Amazon seller pages can help identify a seller, but Amazon commonly directs users to Buyer–Seller Messaging instead of publishing seller email or phone. Amazon service terms may restrict data mining, robots, and commercial extraction.

Therefore:

- The Amazon connector is an isolated adapter.
- It is disabled by default in production until the operator accepts the documented legal and platform risk.
- The system must prefer permitted APIs, manually supplied URLs, licensed data, public search results, and third-party company websites.
- Contacts are enriched from the seller’s official public business sources, not assumed from Amazon.
- Any blocked Amazon request causes a cooldown, not an evasion attempt.

## 3.4 Privacy controls

Store contact type as one of:

```text
business_generic
business_named
personal_unverified
suppressed
```

Default outreach eligibility:

```text
business_generic      eligible after source verification
business_named        manual review required
personal_unverified   not eligible
suppressed            never eligible
```

Never expose raw street address in a public UI. The dashboard is private. Add a `do_not_contact` suppression system from day one.

---

# 4. Monorepo specification

```text
seller-intelligence/
├── AGENTS.md
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── LICENSE
├── pyproject.toml
├── package.json
├── pnpm-workspace.yaml
├── Makefile
├── .env.example
├── .editorconfig
├── .gitignore
├── .github/
│   ├── workflows/
│   │   ├── ci-python.yml
│   │   ├── ci-web.yml
│   │   ├── deploy-worker.yml
│   │   ├── deploy-pages.yml
│   │   ├── deploy-scrapy-cloud.yml
│   │   ├── database-migrations.yml
│   │   └── daily-health-check.yml
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── apps/
│   ├── dashboard/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── public/
│   │   ├── tests/
│   │   ├── next.config.ts
│   │   └── package.json
│   └── worker-api/
│       ├── src/
│       │   ├── index.ts
│       │   ├── auth.ts
│       │   ├── routes/
│       │   ├── repositories/
│       │   ├── validation/
│       │   └── observability/
│       ├── test/
│       ├── wrangler.toml
│       └── package.json
├── crawler/
│   ├── scrapy.cfg
│   ├── setup.py
│   ├── requirements.txt
│   ├── sellerintel/
│   │   ├── settings.py
│   │   ├── items.py
│   │   ├── pipelines.py
│   │   ├── middlewares.py
│   │   ├── extensions.py
│   │   ├── config/
│   │   │   ├── features.py
│   │   │   ├── sources.py
│   │   │   └── environments.py
│   │   ├── adapters/
│   │   │   ├── base.py
│   │   │   ├── registry.py
│   │   │   ├── amazon/
│   │   │   ├── alibaba/
│   │   │   ├── official_site/
│   │   │   ├── business_registry/
│   │   │   └── search/
│   │   ├── spiders/
│   │   │   ├── seed_discovery.py
│   │   │   ├── marketplace_seller.py
│   │   │   ├── website_discovery.py
│   │   │   ├── website_contacts.py
│   │   │   ├── supplier_directory.py
│   │   │   └── revalidation.py
│   │   ├── extractors/
│   │   │   ├── email.py
│   │   │   ├── phone.py
│   │   │   ├── whatsapp.py
│   │   │   ├── wechat.py
│   │   │   ├── company.py
│   │   │   └── address.py
│   │   ├── normalization/
│   │   ├── scoring/
│   │   ├── entity_resolution/
│   │   ├── clients/
│   │   │   ├── ingestion.py
│   │   │   ├── r2.py
│   │   │   └── optional_zyte_api.py
│   │   ├── runtime/
│   │   │   ├── base.py
│   │   │   ├── selector.py
│   │   │   ├── local.py
│   │   │   ├── scrapy_cloud.py
│   │   │   ├── github_actions.py
│   │   │   └── credit_container.py
│   │   ├── spool/
│   │   │   ├── writer.py
│   │   │   ├── replay.py
│   │   │   └── checksums.py
│   │   └── schemas/
│   ├── scripts/
│   │   ├── orchestrate.py
│   │   ├── archive_history.py
│   │   ├── daily_summary.py
│   │   └── requeue_failures.py
│   └── tests/
├── packages/
│   ├── contracts/
│   │   ├── seller.schema.json
│   │   ├── contact.schema.json
│   │   ├── evidence.schema.json
│   │   └── ingestion-batch.schema.json
│   └── shared-types/
├── database/
│   ├── migrations/
│   │   ├── core/
│   │   │   ├── 0001_initial.sql
│   │   │   ├── 0002_indexes.sql
│   │   │   └── 0003_search_fts.sql
│   │   ├── contacts/
│   │   │   ├── 0001_initial.sql
│   │   │   └── 0002_audit.sql
│   │   ├── operations/
│   │   │   ├── 0001_initial.sql
│   │   │   └── 0002_source_registry.sql
│   │   └── history/
│   │       ├── 0001_initial.sql
│   │       └── 0002_retention.sql
│   ├── seeds/
│   └── queries/
├── infra/
│   ├── cloudflare/
│   ├── zyte/
│   ├── local-runner/
│   ├── github-actions-runner/
│   ├── credit-runner/
│   └── scripts/
└── docs/
    ├── architecture.md
    ├── data-sources.md
    ├── compliance.md
    ├── operations.md
    ├── incident-response.md
    ├── codex-prompts.md
    └── decisions/
```

---

# 5. Core data model

## 5.0 Canonical identity rule

Every seller receives an internally generated UUIDv7-compatible text ID. Marketplace merchant IDs, domains, registration numbers, emails, and phone numbers are external identifiers linked to that canonical ID; none of them becomes the primary seller ID. This allows one company to be linked to Amazon, Alibaba, 1688, an official website, and registries without changing its internal identity.

All extracted records carry both `schema_version` and `parser_version`. Confidence measures how strongly a field is supported; quality measures how complete and useful the overall seller profile is.

## 5.1 `sellers`

```sql
CREATE TABLE sellers (
    id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    legal_name TEXT,
    legal_name_local TEXT,
    country_code TEXT,
    province TEXT,
    city TEXT,
    address_private TEXT,
    address_public_masked TEXT,
    official_domain TEXT,
    china_confidence INTEGER NOT NULL DEFAULT 0,
    identity_confidence INTEGER NOT NULL DEFAULT 0,
    manufacturer_score INTEGER NOT NULL DEFAULT 0,
    trader_score INTEGER NOT NULL DEFAULT 0,
    quality_score INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 1,
    parser_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_material_change_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## 5.2 `marketplace_accounts`

```sql
CREATE TABLE marketplace_accounts (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    merchant_token TEXT,
    display_name TEXT,
    profile_url TEXT,
    storefront_url TEXT,
    rating REAL,
    feedback_count INTEGER,
    positive_feedback_percent REAL,
    country_hint TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
);

CREATE UNIQUE INDEX ux_marketplace_token
ON marketplace_accounts(marketplace, merchant_token)
WHERE merchant_token IS NOT NULL;
```

## 5.3 `contacts`

```sql
CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    contact_type TEXT NOT NULL,
    contact_value_ciphertext TEXT NOT NULL,
    normalized_hash TEXT NOT NULL,
    display_value_masked TEXT,
    classification TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    source_id TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_verified_at TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    parser_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    outreach_eligible INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX ix_contacts_seller ON contacts(seller_id);
CREATE INDEX ix_contacts_hash ON contacts(normalized_hash);
```

## 5.4 `sources`

```sql
CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    seller_id TEXT,
    source_url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    source_type TEXT NOT NULL,
    robots_status TEXT,
    terms_risk TEXT,
    http_status INTEGER,
    content_hash TEXT,
    r2_object_key TEXT,
    first_seen_at TEXT NOT NULL,
    last_fetched_at TEXT,
    last_success_at TEXT,
    next_allowed_at TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    parser_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);
```

## 5.5 `field_history`

```sql
CREATE TABLE field_history (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    old_value_hash TEXT,
    new_value_hash TEXT,
    old_value_masked TEXT,
    new_value_masked TEXT,
    source_id TEXT,
    observed_at TEXT NOT NULL,
    crawl_run_id TEXT,
    actor_type TEXT NOT NULL DEFAULT 'crawler',
    actor_id TEXT,
    change_reason TEXT,
    diff_json TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1
);
```

Only masked or hashed sensitive values belong in long-term D1 history. Full evidence belongs in access-controlled R2.

## 5.6 `crawl_runs`

```sql
CREATE TABLE crawl_runs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    zyte_job_id TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    requests_total INTEGER NOT NULL DEFAULT 0,
    responses_success INTEGER NOT NULL DEFAULT 0,
    candidates_found INTEGER NOT NULL DEFAULT 0,
    records_created INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    contacts_verified INTEGER NOT NULL DEFAULT 0,
    blocked_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT
);
```

## 5.7 `suppression_list`

```sql
CREATE TABLE suppression_list (
    id TEXT PRIMARY KEY,
    seller_id TEXT,
    contact_hash TEXT,
    domain TEXT,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT
);
```

## 5.8 `review_queue`

```sql
CREATE TABLE review_queue (
    id TEXT PRIMARY KEY,
    review_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 2,
    payload_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT
);
```

## 5.9 `seller_aliases` — core database

```sql
CREATE TABLE seller_aliases (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    language_code TEXT,
    alias_type TEXT NOT NULL,
    source_id TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
);

CREATE INDEX ix_alias_normalized ON seller_aliases(normalized_alias);
```

## 5.10 `score_components` — core database

```sql
CREATE TABLE score_components (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    score_type TEXT NOT NULL,
    rule_code TEXT NOT NULL,
    points INTEGER NOT NULL,
    evidence_source_id TEXT,
    explanation TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
);
```

## 5.11 `source_registry` — operations database

```sql
CREATE TABLE source_registry (
    adapter_name TEXT PRIMARY KEY,
    source_family TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL,
    robots_policy TEXT NOT NULL,
    terms_review_status TEXT NOT NULL,
    daily_request_budget INTEGER NOT NULL DEFAULT 0,
    concurrency_per_domain INTEGER NOT NULL DEFAULT 1,
    minimum_delay_seconds REAL NOT NULL DEFAULT 2.5,
    blocked_until TEXT,
    parser_version TEXT NOT NULL,
    last_success_at TEXT,
    last_failure_at TEXT,
    operator_notes TEXT
);
```

## 5.12 `audit_events` — contacts database

```sql
CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    actor_id TEXT,
    old_value_hash TEXT,
    new_value_hash TEXT,
    old_value_masked TEXT,
    new_value_masked TEXT,
    reason TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL
);
```

## 5.13 `idempotency_keys` and `quota_state` — operations database

```sql
CREATE TABLE idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE quota_state (
    quota_name TEXT PRIMARY KEY,
    window_start TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    soft_limit INTEGER NOT NULL,
    hard_limit INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);
```

## 5.14 Database assignment and integrity

| Database | Tables |
|---|---|
| core | sellers, marketplace_accounts, seller_aliases, score_components, compact products, FTS5 search |
| contacts | contacts, suppression_list, audit_events, outreach state |
| operations | sources, crawl_runs, review_queue, source_registry, idempotency_keys, quota_state |
| history | field_history and recent diff metadata |

Foreign keys are used only between tables inside the same D1 database. Cross-database seller references are plain canonical IDs and are checked by the Worker before writes. A nightly reconciliation job detects missing parent IDs, duplicate hashes, and incomplete multi-database batches.

---

# 6. Storage budget

## 6.1 D1 free-tier partition plan

Cloudflare D1 Free permits up to 10 databases, but each database is limited to 500 MB. Use these cloud databases:

| Database | Maximum operating target | Contents |
|---|---:|---|
| `si-prod-core` | 350 MB | sellers, marketplace accounts, aliases, compact product links, FTS5 search index |
| `si-prod-contacts` | 350 MB | contacts, suppression, reveal audit, outreach state |
| `si-prod-ops` | 250 MB | crawl runs, idempotency, quotas, source health, feature flags, review queue |
| `si-prod-history` | 300 MB | recent field diffs and manual-edit audit only |
| `si-stg-core` | 50 MB | staging canonical/search data |
| `si-stg-contacts` | 50 MB | staging contacts and audit |
| `si-stg-ops` | 50 MB | staging jobs, sources, quotas, review |
| `si-stg-history` | 50 MB | staging recent diffs |

This uses eight of the ten Free-plan database slots and leaves two spare. Development uses local D1/SQLite and consumes no cloud database slot.

No cross-database foreign keys or atomic transactions are available. Write order is:

```text
1. upsert canonical seller in core
2. confirm canonical seller write
3. upsert contact/operations/history records
4. if a later write fails, retain the retryable batch and use idempotency on replay
5. nightly orphan-reconciliation job removes or repairs inconsistent references
```

## 6.2 Retention policy

- Canonical seller records: retained while useful and lawful
- Active contacts: retained while lawful and useful
- Compact product links: latest state plus limited recent observations
- `field_history`: 30 days in D1, not 90 days
- Older history: compressed JSONL or Parquet in R2
- Raw HTML evidence: default 30 days
- High-confidence evidence: maximum 180 days unless a documented need exists
- Failed pages: 7 days
- Idempotency keys: 7 days
- Reveal audit: 180 days
- Scrapy Cloud job data: operational debugging only, never permanent storage

## 6.3 R2 object layout

```text
evidence/
  2026/
    07/
      27/
        <source-id>.html.gz

batches/
  2026/
    07/
      27/
        sellers-0001.jsonl.gz

archives/
  history/
    2026-07.parquet

backups/
  core/
  contacts/
  operations/
  history/

reports/
  daily/
    2026-07-27.json
```

## 6.4 Capacity circuit breakers

At 60% of any D1 database limit, issue a warning. At 70%, archive aggressively. At 80%, stop nonessential writes. At 90%, stop ingestion for that database and require operator action. Never rely only on the account-wide 5 GB figure.

---

# 7. Crawler design

## 7.0 Provider-neutral job contract

Every runner executes the same immutable job definition:

```python
class CrawlJob(TypedDict):
    job_id: str
    job_type: str
    source_adapter: str
    seed_location: str
    page_budget: int
    deadline_at: str
    parser_version: str
    schema_version: str
    dry_run: bool
```

Every job writes locally to a durable spool first. The spool is then posted to the Worker with an idempotency key and retained until the Worker acknowledges the checksum. Runner logs are never the only copy of results.

## 7.1 Sequential execution model

Only one production crawl job runs at a time, regardless of provider:

```text
01 seed_discovery
02 marketplace_seller
03 website_discovery
04 website_contacts
05 entity_resolution
06 revalidation
07 archive_history
08 daily_summary
```

The provider-neutral orchestrator starts the next job only after the prior job reaches a terminal state and its output is acknowledged or safely spooled.

## 7.2 Daily schedule

Timezone: Asia/Dhaka

```text
00:05  seed_discovery
01:00  marketplace_seller
04:00  website_discovery
07:00  website_contacts
11:00  supplier_directory
15:00  entity_resolution
17:00  revalidation
20:00  archive_history
21:00  daily_summary
```

This schedule is a target, not a promise. The selected runner may use Scrapy Cloud scheduling, Windows Task Scheduler, cron, or a manually approved GitHub Actions dispatch. Overlap is forbidden.

## 7.3 Request policy

Default Scrapy settings:

```python
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 2.5
RANDOMIZE_DOWNLOAD_DELAY = True
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 2.0
AUTOTHROTTLE_MAX_DELAY = 60.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 0.5
RETRY_TIMES = 2
DOWNLOAD_TIMEOUT = 30
ROBOTSTXT_OBEY = True
HTTPCACHE_ENABLED = True
```

For sensitive or frequently blocked domains:

```python
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 8.0
RETRY_TIMES = 0
```

A 403, 429, CAPTCHA marker, or explicit block updates `next_allowed_at` and stops the domain adapter for the configured cooldown. A different runner or proxy must not be used to evade the stop.

## 7.4 No-browser default

1. Use regular Scrapy HTTP requests first.
2. Parse public JSON-LD and embedded page data.
3. Use lightweight HTML extraction.
4. Local Playwright may be enabled only for an approved public source and never to defeat a block.
5. Zyte API browser mode remains disabled unless the operator explicitly authorizes a non-zero paid budget.
6. Do not include Playwright in the default Scrapy Cloud image.

## 7.5 Durable local spool

Required spool states:

```text
created
validated
uploading
acknowledged
quarantined
expired_after_archive
```

The spool uses compressed JSONL plus a SHA-256 manifest. Replay must be idempotent. A provider shutdown or network loss must not lose accepted records.

---

# 8. Execution provider integrations

## 8.1 Common runner interface

```python
class RunnerProvider(Protocol):
    name: str

    def validate_configuration(self) -> ValidationResult: ...
    def deploy(self, artifact: BuildArtifact) -> DeploymentResult: ...
    def start(self, job: CrawlJob) -> RunHandle: ...
    def status(self, handle: RunHandle) -> RunStatus: ...
    def cancel(self, handle: RunHandle) -> None: ...
    def fetch_logs(self, handle: RunHandle) -> Iterable[LogEvent]: ...
```

Provider-specific IDs never enter seller or contact schemas.

## 8.2 Zyte Scrapy Cloud provider

Secrets:

```text
SCRAPY_CLOUD_API_KEY
SCRAPY_CLOUD_PROJECT_ID
SCRAPY_CLOUD_TARGET
```

Activation conditions:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_DEPLOY_ENABLED=true
RUNNER_MODE=zyte_student_active
SCRAPY_CLOUD_MAX_UNITS=1
PAID_SERVICES_ALLOWED=false
```

Current account UI showing `Free Unit Plan` is not sufficient to assume purchased-unit student benefits. Until entitlement confirmation, deploy and scheduling remain blocked.

When active:

- allocate exactly one unit
- run one job at a time
- export job output to R2/D1 immediately
- never depend on 120-day retention
- never click or automate `Upgrade` or `Add Scrapy Cloud`
- stop if plan or unit status changes

## 8.3 Optional Zyte API provider

Zyte API is a separate PAYG service and is not included in the Student Pack.

```text
ZYTE_API_KEY=
ZYTE_API_ENABLED=false
ZYTE_API_DAILY_REQUEST_BUDGET=0
ZYTE_API_MONTHLY_BUDGET_USD=0
```

The code must reject all Zyte API calls unless every gate is explicitly non-zero and enabled. In the zero-cost baseline, the key should not be provisioned to any runner.

## 8.4 Local Docker/Scrapy provider

This is the guaranteed fallback.

Requirements:

- same Docker image and Python lockfile as cloud runners
- Windows and Linux instructions
- local SQLite/JSONL spool
- signed ingestion to Worker
- Task Scheduler and cron examples
- manual pause and kill switch
- no inbound public port required
- no credentials or cookies from a personal browser profile

Operational limitation: the machine must remain powered, connected, and within the operator's electricity/network budget.

## 8.5 GitHub Actions burst provider

Disabled by default:

```text
GITHUB_ACTIONS_CRAWLER_ENABLED=false
```

Permitted use:

- manual `workflow_dispatch`
- fixture validation
- recovery of a small approved queue
- low-frequency, time-bounded jobs within currently included minutes

Forbidden use:

- permanent 24/7 crawling
- unbounded matrix jobs
- automatic retry loops
- paid-minute overage
- provider failover without approval
- storing raw evidence only as workflow artifacts

## 8.6 Credit-backed container provider

This provider may use an existing student credit, including an already-claimed Heroku student credit, but is never assumed permanent or automatically free.

Required gates:

```text
CREDIT_RUNNER_ENABLED=false
CREDIT_RUNNER_MONTHLY_CAP_AUD=0
CREDIT_RUNNER_AUTO_SHUTDOWN=true
PAID_ADDONS_ALLOWED=false
```

The provider must stop before credit expiry and must not attach paid add-ons. Card charge protection is an operator prerequisite.

## 8.7 Provider selection

```text
RUNNER_MODE=development_locked
```

Selection is manual and validated at process startup. Unknown values cause a hard failure. No code path may select a more expensive provider based on errors, blocking, timeouts, or queue size.

---


# 9. Source adapters

Every source implements:

```python
class SourceAdapter(Protocol):
    name: str
    risk_level: str

    def is_allowed(self, url: str) -> bool: ...
    def build_requests(self, seed: Seed) -> Iterable[Request]: ...
    def parse_identity(self, response) -> list[IdentityCandidate]: ...
    def parse_contacts(self, response) -> list[ContactCandidate]: ...
    def cooldown_for(self, response) -> timedelta: ...
```

## 9.1 Adapter categories

### A. Marketplace identity adapters

Purpose:

- seller display name
- merchant identifier
- business name
- marketplace storefront URL
- product relationship
- public business location where lawfully displayed

### B. Official company website adapters

Purpose:

- company legal identity
- sales email
- export email
- phone
- WhatsApp
- WeChat
- OEM/ODM claims
- address
- social profiles

### C. Supplier directory adapters

Purpose:

- manufacturer/trader evidence
- product categories
- certifications
- public business contacts
- company website link

### D. Registry adapters

Purpose:

- legal name verification
- registration status
- registered locality
- alternate company names

### E. Search discovery adapters

Purpose:

- discover official domain candidates
- discover supplier profile URLs

Use licensed or permitted search endpoints. Do not scrape a search engine in a way that violates its terms.

---

# 10. Contact extraction

## 10.1 Email

Extract candidates from:

- visible text
- `mailto:`
- JSON-LD
- contact cards
- obfuscated text only where decoding is clearly intended for public display

Preferred local parts:

```text
sales
export
business
wholesale
info
contact
support
marketing
service
```

Validation:

1. syntax
2. normalized lowercase
3. domain has MX or valid mail-routing evidence
4. source context contains business intent
5. domain identity matches seller evidence

Do not perform intrusive SMTP mailbox enumeration.

## 10.2 WhatsApp

Recognize:

```text
wa.me/
api.whatsapp.com/send
whatsapp:
WhatsApp number
```

Normalize to E.164 where possible.

## 10.3 WeChat

Recognize labels:

```text
WeChat
Wechat ID
微信
微信号
客服微信
商务微信
```

A nearby QR image alone is not enough unless the QR content is extracted by a safe local decoder and the page clearly labels it as a public business contact. Store the source screenshot or image only if permitted and necessary.

## 10.4 Phone

Use `phonenumbers` for parsing and E.164 normalization.

## 10.5 Confidence score

```text
+45 official contact page
+35 official domain footer
+25 legal company name match
+20 business address match
+15 marketplace store link match
+15 brand match
+10 public supplier profile
+10 business-intent context
-20 free-mail domain without corroboration
-30 directory-only result
-40 conflicting legal name
-50 personal-profile context
```

Accept automatically at `>= 80`.

Manual review at `55–79`.

Reject below `55`.

---

# 11. Chinese seller identification

## 11.1 Score

```text
+40 mainland China registered/business address
+25 Chinese legal company name
+20 verified Chinese registry evidence
+15 +86 business phone
+10 official Chinese-language company domain
+10 public WeChat business contact
+10 supplier profile identifies mainland China
-25 conflicting non-China registry
-20 seller identity cannot be matched
```

Classification:

```text
80–100  confirmed_china
55–79   probable_china
30–54   possible_china
0–29    unverified
```

Keep Hong Kong, Macau, Taiwan, and mainland China distinct.

---

# 12. Manufacturer versus trader model

```text
+30 official factory/manufacturer declaration
+25 verified manufacturer directory evidence
+20 factory address or production facility evidence
+15 OEM/ODM language
+10 production certifications
+10 coherent product category
+10 factory media with corroboration

-25 unrelated product categories
-20 trading/commerce-only legal name
-15 no production evidence
-10 multiple unrelated storefront brands
```

Output:

```text
likely_manufacturer
manufacturer_and_exporter
brand_owner
trading_company
unknown
```

The score is deterministic. AI may summarize evidence but must not silently determine identity.

---

# 13. Entity resolution

## 13.1 Exact keys

Auto-link using:

- marketplace + merchant token
- official domain
- registration number
- normalized phone hash
- normalized email hash
- exact normalized legal name + locality

## 13.2 Fuzzy evidence

Use:

- Unicode-normalized company name
- Chinese/English transliteration
- address token overlap
- brand overlap
- domain similarity
- phone suffix
- supplier profile identity

## 13.3 Merge threshold

```text
>= 92       auto merge
70–91       manual review
< 70        keep separate
```

Every merge produces an audit record and supports rollback.

---

# 14. Ingestion API

## 14.1 Batch endpoint

```http
POST /v1/ingest/batch
```

Headers:

```text
X-SI-Timestamp
X-SI-Nonce
X-SI-Signature
Content-Encoding: gzip
Content-Type: application/json
```

Signature:

```text
HMAC-SHA256(secret, timestamp + "." + nonce + "." + sha256(body))
```

Worker verifies:

- timestamp within five minutes
- nonce not previously used
- valid HMAC
- compressed body limit
- JSON Schema
- batch record limit
- source URL allowlist/risk policy
- idempotency key

## 14.2 Batch limits

```text
maximum 25 sellers per request
maximum 100 contacts per request
maximum compressed body 256 KB
maximum uncompressed body 1 MB
maximum 20 D1 statements per batch call where practical
```

This keeps the Workers Free 10 ms CPU budget realistic. The Worker performs validation, routing, and small indexed writes only; crawling, parsing, scoring, diff construction, and compression remain in the currently selected runner.

## 14.3 Idempotency

```text
Idempotency-Key: <crawl-run-id>:<batch-number>
```

D1 stores processed keys for seven days.

---

# 15. Cloudflare Worker API routes

```text
GET    /v1/health
GET    /v1/stats/daily
GET    /v1/sellers
GET    /v1/sellers/:id
GET    /v1/sellers/:id/history
GET    /v1/sellers/:id/evidence
GET    /v1/sellers/:id/confidence
GET    /v1/duplicates
GET    /v1/review-queue
POST   /v1/review-queue/:id/decision
POST   /v1/duplicates/:id/decision
POST   /v1/manual-edits
POST   /v1/ingest/batch
POST   /v1/suppression
POST   /v1/export
```

The dashboard is protected by Cloudflare Access. Ingestion uses service authentication and HMAC.

---

# 16. Dashboard

## 16.1 Main views

1. Daily overview
2. Seller search
3. Seller profile
4. New contacts
5. Review queue
6. Crawl health
7. Source health
8. Possible duplicates
9. Evidence viewer
10. Suppression list
11. Export
12. System settings

## 16.2 Search filters

```text
country
province
city
marketplace
category
brand
minimum feedback
minimum confidence
contact type
WeChat available
WhatsApp available
official website available
manufacturer class
first seen
last seen
new today
updated today
outreach status
```

## 16.3 Seller profile

Display:

- canonical company identity
- aliases
- marketplaces
- products and brands
- public business contacts
- evidence links
- confidence explanation with positive and negative score components
- separate completeness/quality score
- manufacturer/trader score
- first seen and last seen
- change timeline with old/new field diff
- evidence viewer for raw snapshot, parsed JSON, and extracted fields
- internal notes
- outreach status
- suppression controls

## 16.4 Privacy UI

- Mask email and phone by default
- Reveal only after an authenticated user action
- Log reveal events
- Never show residential-looking street addresses in list results
- Export requires explicit confirmation
- Suppressed contacts cannot be exported

---

# 17. Cloudflare deployment

## 17.1 Resources

Create:

```text
Production D1:
  si-prod-core
  si-prod-contacts
  si-prod-ops
  si-prod-history

Staging D1:
  si-stg-core
  si-stg-contacts
  si-stg-ops
  si-stg-history

R2 buckets or isolated prefixes:
  seller-intelligence-evidence-prod
  seller-intelligence-evidence-stg

Workers:
  seller-intelligence-api-prod
  seller-intelligence-api-stg

Pages projects:
  seller-intelligence-dashboard-prod
  seller-intelligence-dashboard-stg

Access applications:
  intelligence.<domain>
  intelligence-stg.<domain>
```

## 17.2 `wrangler.toml`

```toml
name = "seller-intelligence-api-prod"
main = "src/index.ts"
compatibility_date = "2026-07-01"

[[d1_databases]]
binding = "CORE_DB"
database_name = "si-prod-core"
database_id = "<CORE_D1_DATABASE_ID>"

[[d1_databases]]
binding = "CONTACTS_DB"
database_name = "si-prod-contacts"
database_id = "<CONTACTS_D1_DATABASE_ID>"

[[d1_databases]]
binding = "OPS_DB"
database_name = "si-prod-ops"
database_id = "<OPS_D1_DATABASE_ID>"

[[d1_databases]]
binding = "HISTORY_DB"
database_name = "si-prod-history"
database_id = "<HISTORY_D1_DATABASE_ID>"

[[r2_buckets]]
binding = "EVIDENCE"
bucket_name = "seller-intelligence-evidence-prod"

[vars]
APP_ENV = "production"
MAX_BATCH_SELLERS = "25"
MAX_BATCH_CONTACTS = "100"
```

Staging uses an environment-specific Wrangler configuration with the four `si-stg-*` database bindings. Never point a staging Worker at a production binding.

Secrets:

```bash
wrangler secret put INGESTION_HMAC_SECRET
wrangler secret put EXPORT_ENCRYPTION_KEY
```

## 17.3 Pages

Use Next.js static output where possible.

```ts
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true
  }
};

export default nextConfig;
```

Do not place secrets in frontend environment variables.

---

# 18. GitHub Actions

## 18.1 CI policy

Every pull request runs:

Python:

```text
ruff
mypy
pytest
bandit
pip-audit
```

TypeScript:

```text
eslint
tsc --noEmit
vitest
npm audit --omit=dev
```

Integration:

```text
D1 local migration
Worker API contract tests
crawler-to-ingestion signed batch test
```

## 18.2 Deployment policy

```text
main branch:
  tests
  security checks
  deploy Worker after environment approval
  migrate D1 after migration approval
  deploy Pages after environment approval
  build the provider-neutral crawler artifact
  do not activate any crawler provider automatically
  run non-network smoke tests
```

Provider deployment is a separate manual workflow. Zyte, GitHub Actions burst, or a credit-backed container may be activated only after its provider-specific gate and GitHub Environment approval.

## 18.3 GitHub Actions crawler boundary

GitHub Actions is primarily CI/CD. A separate burst workflow may exist as a disabled fallback, but it must be `workflow_dispatch` by default, enforce a short job timeout, consume a bounded page budget, upload every accepted batch to the normal ingestion API, and stop before included minutes are exhausted.

It must never become the implicit permanent crawler and must never enable paid-minute overage.


# 19. Secrets

## 19.1 GitHub secrets

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CORE_D1_DATABASE_ID
CONTACTS_D1_DATABASE_ID
OPS_D1_DATABASE_ID
HISTORY_D1_DATABASE_ID
STG_CORE_D1_DATABASE_ID
STG_CONTACTS_D1_DATABASE_ID
STG_OPS_D1_DATABASE_ID
STG_HISTORY_D1_DATABASE_ID
SCRAPY_CLOUD_API_KEY             only after entitlement confirmation
SCRAPY_CLOUD_PROJECT_ID          only after entitlement confirmation
INGESTION_HMAC_SECRET
ZYTE_API_KEY                     optional; absent in zero-cost mode
CREDIT_RUNNER_TOKEN              optional; disabled by default
```

## 19.2 Runner settings

```text
RUNNER_MODE
LIVE_CRAWL_ENABLED
PAID_SERVICES_ALLOWED
INGESTION_API_URL
INGESTION_HMAC_SECRET
R2_UPLOAD_URL_OR_SIGNING_ROUTE
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED
SCRAPY_CLOUD_DEPLOY_ENABLED
SCRAPY_CLOUD_MAX_UNITS
GITHUB_ACTIONS_CRAWLER_ENABLED
CREDIT_RUNNER_ENABLED
CREDIT_RUNNER_MONTHLY_CAP_AUD
ZYTE_API_ENABLED
ZYTE_API_KEY
```

Production must fail closed when a selected provider lacks its required secret. Disabled providers must not receive their secrets.

Never store production secrets in `.env.example`, source files, issues, screenshots, logs, or Codex prompts.

---

# 20. Monitoring

## 20.1 Daily health indicators

```text
last successful job
job duration
requests sent
success rate
403 count
429 count
CAPTCHA marker count
new sellers
updated sellers
verified contacts
duplicate rate
D1 size estimate
R2 storage estimate
queue backlog
```

## 20.2 Alerts

A daily GitHub Action calls `/v1/health`.

Open a GitHub issue when:

```text
no successful crawl in 30 hours
success rate < 70%
blocked rate > 15%
zero new intelligence events for 24 hours
D1 estimated usage > 80%
R2 estimated usage > 80%
ingestion signature failures > 5
```

## 20.3 Logging rules

Never log:

- raw API keys
- full email addresses
- full phone numbers
- session cookies
- authorization headers
- unmasked residential addresses

---

# 21. Free-tier protection

## 21.1 Hard limits

Create a `quota_state` table and stop before limits.

```text
D1 writes soft limit       70,000/day
D1 writes hard limit       85,000/day
D1 reads soft limit        3,500,000/day
Worker requests soft       70,000/day
R2 Class A soft            25,000/day average
Queue operations soft      7,000/day
```

## 21.2 Batch writes

Use D1 transactions and batch ingestion. Do not perform many tiny writes.

## 21.3 Indexed queries

All dashboard filters must use indexed columns. Ban unrestricted full-table scans in API code.

## 21.4 Archive before quota pressure

At 70% D1 capacity:

1. archive old history
2. delete expired idempotency records
3. delete old review payloads
4. compact source metadata
5. preserve canonical records

---

# 22. Testing plan

## 22.1 Unit tests

- email extractor
- phone normalization
- WhatsApp extraction
- WeChat extraction
- address masking
- company-name normalization
- Chinese seller score
- manufacturer score
- entity match score
- HMAC signing
- idempotency

## 22.2 Fixture tests

Store sanitized HTML fixtures for:

- official company contact page
- multilingual contact page
- marketplace seller page
- supplier directory
- empty page
- CAPTCHA page
- 403 page
- changed layout
- misleading contact directory

## 22.3 Integration tests

- spider emits valid contract
- pipeline batches records
- Worker validates batch
- Worker writes D1
- Worker writes R2 evidence
- dashboard queries seller
- suppression blocks export

## 22.4 End-to-end acceptance

A seed should result in:

```text
candidate discovered
identity normalized
official domain matched
contact extracted
confidence calculated
seller deduplicated
history recorded
dashboard visible
source evidence accessible
```

---

# 23. Codex operating model

Codex can work across CLI, IDE, app, cloud tasks, and GitHub-connected workflows. Use repository documentation as the permanent system of record.

## 23.1 Required `AGENTS.md`

```markdown
# AGENTS.md

## Mission
Build and maintain the Seller Intelligence Platform defined in
SELLER_INTELLIGENCE_MASTER_SPEC.md.

## Non-negotiable constraints
- No CAPTCHA bypass.
- No credential or cookie harvesting.
- Respect robots and source adapters' risk policies.
- Stop an adapter after an explicit source block; do not rotate around it.
- Keep PAID_SERVICES_ALLOWED=false unless the frozen specification is explicitly amended.
- Do not enable Zyte API unless the explicit budget flags are set.
- Do not activate or switch crawler providers automatically.
- Never allocate more than one Scrapy Cloud unit.
- Never expose production secrets.
- Never log unmasked personal contact data.
- Never delete canonical or historical data without a documented retention operation.
- All database changes require a migration.
- All external payloads require schema validation.
- All writes require idempotency.
- Every extracted record must include schema_version and parser_version.
- Modify no more than one subsystem in one pull request unless the task explicitly approves a cross-cutting change.
- Do not change frozen architecture without first updating the master specification.
- Run tests before declaring a task complete.

## Architecture
- Provider-neutral Python Scrapy crawler package.
- Preferred runner: verified Zyte Student Scrapy Cloud unit.
- Guaranteed fallback: local Docker/Scrapy runner.
- Disabled bounded fallbacks: GitHub Actions burst and credit-backed container.
- TypeScript Cloudflare Worker API.
- Partitioned Cloudflare D1 databases for core, contacts, operations, and recent history.
- Cloudflare R2 evidence and archive storage.
- Next.js static dashboard on Cloudflare Pages.
- Cloudflare Access authentication.

## Definition of done
- Implementation complete.
- Tests added and passing.
- Required migration added and tested.
- Documentation and changelog updated.
- Security implications reviewed.
- Free-tier quota impact documented.
- Rollback or recovery path documented.
- No unrelated changes.
```

## 23.2 Codex task rule

Never ask Codex to “build the whole platform” in one task.

Each task must include:

```text
goal
allowed files
out-of-scope items
acceptance criteria
required tests
commands to run
security constraints
documentation update
```

---

# 24. Codex implementation prompts

## Phase 0 — Repository bootstrap

```text
Read SELLER_INTELLIGENCE_MASTER_SPEC.md and create the initial monorepo.

Implement only:
- root configuration
- Python package skeleton
- Cloudflare Worker skeleton
- Next.js dashboard skeleton
- database migration directory
- AGENTS.md
- CI workflows

Do not implement crawling or production deployment yet.

Acceptance:
- Python lint, type check, and tests pass.
- TypeScript lint, type check, and tests pass.
- Local Worker health endpoint returns 200.
- Dashboard builds successfully.
- README contains exact local setup commands.
```

## Phase 1 — Database

```text
Implement Cloudflare D1 migrations for the complete partitioned data model in the
master specification.

Requirements:
- separate migration directories for core, contacts, operations, and history
- text UUIDv7-compatible canonical IDs
- required indexes and FTS5 in core
- foreign keys only inside the same database
- no cross-database foreign-key declarations
- idempotency and quota tables in operations
- audit table in contacts
- source registry in operations
- rollback notes
- local migration tests for all four databases
- restore script recreates FTS5 after canonical import
- no seed data containing personal information

Create repository classes and a cross-database unit-of-work coordinator in apps/worker-api.
```

## Phase 2 — Secure ingestion

```text
Implement POST /v1/ingest/batch.

Requirements:
- gzip body support
- JSON Schema validation
- HMAC-SHA256 verification
- timestamp window
- nonce replay protection
- idempotency key
- maximum batch limits
- ordered idempotent writes across partitioned D1 databases
- compensating retry/reconciliation behavior instead of claiming cross-database transactions
- masked logs
- structured error responses
- tests for valid, invalid, replayed, expired, and oversized requests
```

## Phase 3 — Crawler contracts

```text
Implement crawler item schemas and the signed ingestion client.

Requirements:
- Pydantic models
- deterministic serialization
- gzip batching
- retry with exponential backoff
- local spool file if ingestion temporarily fails
- no secret values in logs
- unit and integration tests against the local Worker
```

## Phase 4 — Contact extractors

```text
Implement email, phone, WhatsApp, and WeChat extraction.

Requirements:
- multilingual labels
- context-window evidence
- normalization
- confidence components
- classification
- false-positive fixtures
- no SMTP mailbox enumeration
- at least 90% test coverage for extractor modules
```

## Phase 5 — Company normalization

```text
Implement company-name, address, country, and domain normalization.

Include:
- Unicode NFKC
- Chinese company suffix normalization
- English company suffix normalization
- punctuation removal
- whitespace normalization
- domain canonicalization
- E.164 phone normalization
- deterministic hashes
- address masking
```

## Phase 6 — Source adapter framework

```text
Implement the SourceAdapter protocol and adapter registry.

Requirements:
- adapter risk level
- robots policy
- terms-risk field
- per-domain concurrency
- cooldown behavior
- blocked-page detection
- feature flags
- Amazon/marketplace adapter disabled by default
- no access-control evasion
```

## Phase 7 — Official website enrichment

```text
Implement official website discovery and contact-page crawling.

Crawl only:
- homepage
- about
- contact
- contact-us
- support
- wholesale
- distributor
- privacy
- terms
- sitemap-discovered business pages

Add:
- same-domain restriction
- page budget
- canonical URL handling
- content hash
- evidence upload
- contact confidence
```

## Phase 8 — Entity resolution

```text
Implement exact and fuzzy entity resolution.

Requirements:
- transparent score breakdown
- auto-merge >= 92
- review queue 70–91
- no merge below 70
- merge audit trail
- rollback support
- deterministic fixture tests
```

## Phase 9 — Dashboard

```text
Build the authenticated internal dashboard.

Pages:
- Overview
- Sellers
- Seller detail
- Contacts
- Review queue
- Crawl health
- Sources
- Suppression
- Export

Requirements:
- server data only through Worker API
- no secrets in browser
- masked contact values
- reveal audit event
- responsive mobile and desktop layouts
- loading, empty, and error states
- accessible forms and tables
```

## Phase 10A — Local runner production readiness

```text
Implement the provider-neutral local Docker/Scrapy runner.

Requirements:
- same build artifact used by all providers
- Windows Task Scheduler and Linux cron runbooks
- one-job sequential lock
- durable local spool and replay
- signed ingestion
- kill switch
- dry-run and fixture-only modes
- no personal browser cookies or profiles
- end-to-end local smoke test
```

## Phase 10B — Zyte Scrapy Cloud activation

```text
BLOCKED until ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true.

After written/account-level confirmation:
- add pinned deployment configuration
- deploy a non-network smoke spider first
- verify exactly one unit
- verify no paid subscription or Zyte API usage
- verify job status and cancellation
- export output immediately to R2/D1
- document rollback to local runner
- do not enable Amazon
```

## Phase 10C — GitHub Actions burst fallback

```text
Create a disabled manual fallback workflow.

Requirements:
- workflow_dispatch only by default
- strict timeout and page budget
- no automatic schedule until separately approved
- no paid-minute overage
- same contracts and spool behavior
- explicit operator confirmation input
- visible usage warning
```

## Phase 10D — Credit-backed container fallback

```text
Create documentation and a disabled deployment profile only.

Requirements:
- operator-supplied active credit
- hard monthly cap of AUD 0 until amended
- no paid add-ons
- automatic shutdown date
- no deployment from CI without environment approval
- same Docker image and health check
```

## Phase 11 — Provider-neutral orchestration

```text
Implement sequential orchestration through RunnerProvider.

Requirements:
- start next job only after previous completion
- only one active production provider
- detect failed and canceled jobs
- retry once for transient failures
- no retry on explicit domain block
- no automatic provider switching
- write crawl_runs status and provider identity
- daily summary
- safe manual rerun command
- local fallback runbook
```


## Phase 12 — Quota protection

```text
Implement free-tier quota accounting and circuit breakers.

Requirements:
- daily D1 read/write estimates
- Worker request estimate
- R2 operation estimate
- stop ingestion before hard threshold
- archive old history at 70% capacity
- visible dashboard warnings
- tests for threshold behavior
```

## Phase 13 — Production hardening

```text
Perform a production-readiness review.

Check:
- authentication
- authorization
- secret handling
- HMAC replay safety
- input validation
- SQL injection
- XSS
- SSRF
- URL allowlisting
- source policy
- data masking
- audit logs
- retention
- suppression
- backups
- free-tier limits
- incident response

Fix all critical and high findings and add regression tests.
```

---

# 25. Implementation milestones

## Milestone A — Foundation

Deliver:

- monorepo
- D1 schema
- Worker health endpoint
- static dashboard shell
- provider-neutral no-network smoke job
- CI

Exit condition: all deployments work without real seller collection.

## Milestone B — First valid seller

Deliver:

- one enabled low-risk source adapter
- identity extraction
- official-domain enrichment
- one verified public business contact
- dashboard profile
- evidence record

Exit condition: one complete record flows end to end.

## Milestone C — 50/day

Deliver:

- scheduling
- batch ingestion
- source cooldown
- dedupe
- daily reporting
- review queue

Exit condition: seven stable days averaging 50 intelligence events/day.

## Milestone D — 200/day

Deliver:

- multiple source adapters
- robust contact extractors
- entity resolution
- storage retention
- health alerts

Exit condition: seven stable days averaging 200 events/day with less than 10% duplicate acceptance.

## Milestone E — 500/day

Deliver:

- optimized seed rotation
- source prioritization
- incremental recrawl
- archive automation
- quota protection
- operator review workflow

Exit condition:

```text
7-day average >= 500 useful intelligence events/day
accepted duplicate rate <= 5%
blocked request rate <= 15%
verified-source coverage >= 80%
no free-tier hard-limit breach
```

---

# 26. Daily collection strategy

## 26.1 Priority formula

```text
priority =
  category_value
+ seller_novelty
+ missing_contact_bonus
+ stale_record_bonus
+ high_feedback_bonus
+ official_domain_probability
- recent_failure_penalty
- source_risk_penalty
- quota_cost_penalty
```

## 26.2 Recrawl cadence

```text
high-value active seller       14 days
normal active seller           30 days
no public contact              45 days
blocked source                 30–90 days
invalid seller                 180 days
suppressed seller              no contact enrichment
```

## 26.3 Delta crawling

Do not fetch unchanged pages unnecessarily.

Store:

```text
ETag
Last-Modified
content hash
last successful timestamp
next allowed timestamp
```

---

# 27. Outreach boundary

The platform is a research database, not an autonomous spam system.

Outreach module may store:

```text
not_contacted
queued_for_manual_review
contacted
replied
interested
not_interested
invalid
do_not_contact
```

Safe defaults:

- No automatic WhatsApp or WeChat messaging
- No automatic email sending in MVP
- Manual review before first contact
- One first contact per seller
- Maximum two follow-ups
- Immediate suppression after opt-out
- Message must identify the sender and business purpose
- Contact source and lawful basis must be documented where required

---

# 28. Backup and recovery

## 28.1 Daily

- export changed canonical records to R2 JSONL
- export D1 schema
- store crawl summary
- verify latest archive object exists

## 28.2 Weekly

- full logical export where size permits
- encrypted archive
- restore test into local D1
- generate restore report

## 28.3 Recovery objectives

```text
RPO: 24 hours
RTO: 4 hours for core search
```

---

# 29. Incident response

## Blocking spike

1. stop affected adapter
2. record response signatures
3. increase cooldown
4. do not rotate around the block
5. review source terms
6. re-enable only after operator approval

## Secret exposure

1. revoke secret
2. rotate all dependent secrets
3. inspect logs
4. invalidate nonces/tokens
5. document incident
6. add prevention test

## Incorrect personal-data exposure

1. disable export
2. suppress affected records
3. remove public display
4. investigate source and classification
5. apply retention/deletion requirement
6. document corrective action

---

# 30. Launch checklist

## Accounts and control plane

- [ ] GitHub private repository created
- [ ] Cloudflare account active
- [ ] Domain added to Cloudflare
- [ ] Four production and four staging D1 databases created
- [ ] R2 Standard bucket created
- [ ] Pages project created
- [ ] Worker created
- [ ] Cloudflare Access policy created

## Runner readiness

- [ ] Local runner passes end-to-end smoke test
- [ ] Durable spool and replay tested
- [ ] Exactly one production runner mode selected
- [ ] Zyte Student benefit confirmed before Zyte activation, when used
- [ ] Scrapy Cloud project and key created only for Phase 10B, when used
- [ ] GitHub Actions burst remains disabled unless separately approved
- [ ] Credit-backed runner remains disabled unless actual credit and shutdown guard are verified

## Security

- [ ] HMAC secret generated
- [ ] Cloudflare API token least-privileged
- [ ] Runner secrets stored only in their selected environment
- [ ] Paid-services lock enabled
- [ ] Zyte API disabled by default
- [ ] dashboard protected
- [ ] exports protected
- [ ] suppression system tested
- [ ] contact masking tested

## Operations

- [ ] selected-runner schedule tested
- [ ] one-job overlap lock tested
- [ ] manual provider switch tested
- [ ] automatic provider failover confirmed absent
- [ ] blocked-domain cooldown tested
- [ ] quota circuit breakers tested
- [ ] archive restore tested
- [ ] health alert tested


# 31. Final technical verdict

The strongest zero-recurring-cost architecture for this project is not a single crawler host. It is a durable Cloudflare control/data plane plus a replaceable runner layer:

```text
Provider-neutral Python/Scrapy crawler
        +
Preferred verified Zyte Student unit
        +
Guaranteed local Docker fallback
        +
Disabled bounded Actions/credit fallbacks
        +
Cloudflare Pages + Worker + D1 + R2 + Access
        +
Private GitHub repository + Codex
```

Zyte is the preferred managed execution host only after entitlement confirmation. It is not required for development, data ownership, parsing logic, dashboard operation, or long-term recovery. The system remains functional through the local runner if Zyte is unavailable.

The 500/day goal is technically feasible for lightweight, sequential extraction and enrichment when:

- candidate URLs are available,
- adapters remain permitted and accessible,
- most pages are HTTP-readable,
- duplication is controlled,
- records and evidence are archived immediately,
- free-tier quotas remain available,
- and the selected runner has enough operating time.

It is not responsible to promise permanent 500/day verified Amazon seller contacts using only free resources. The system is designed to maximize legitimate public-source yield while stopping safely when a source blocks access, a provider changes, or quotas approach their limits.


# 32. Specification freeze, environments, and release strategy

## 32.1 Frozen architecture

Version 2.0.0 is the coding baseline. Codex may refine implementation details but must not replace the provider-neutral runner contract, Cloudflare Worker, partitioned D1, R2, Pages, Access, manual activation gates, or zero-charge lock without an approved amendment. Zyte is preferred but not an architectural single point of failure.

## 32.2 Environments

```text
local
  local D1/SQLite
  local R2 emulator or filesystem fixtures
  local Docker/Scrapy runner
  mocked provider and source responses
  no production secrets
  live crawling disabled by default

staging
  separate Worker and Pages deployment
  four si-stg-* D1 databases matching production bindings
  staging R2 prefix/bucket
  local or manually selected staging runner
  no automatic production crawl
  sanitized fixtures or low-volume approved sources

production
  production Worker, Pages, Access, D1 databases, and R2
  exactly one manually selected runner provider
  provider-specific activation gate
  protected GitHub Environment approval
  no automatic paid fallback
```


## 32.3 Release flow

```text
feature branch
→ pull request
→ CI and security checks
→ staging deployment
→ migration dry run
→ smoke test
→ manual production approval
→ production deployment
→ post-deploy health check
```

Use semantic releases:

```text
MAJOR: incompatible API/schema behavior
MINOR: backward-compatible feature
PATCH: backward-compatible fix
```

API paths start at `/v1/`. A future incompatible API uses `/v2/`; never silently change `/v1/` contracts.

---

# 33. Feature flags and source adapter registry

## 33.1 Required feature flags

```text
ENABLE_AMAZON=false
ENABLE_ALIBABA=false
ENABLE_1688=false
ENABLE_BUSINESS_REGISTRY=true
ENABLE_OFFICIAL_WEBSITE=true
ENABLE_SEARCH_DISCOVERY=false
ENABLE_ZYTE_API=false
ENABLE_LOCAL_PLAYWRIGHT=false
ENABLE_EMAIL_EXTRACTION=true
ENABLE_PHONE_EXTRACTION=true
ENABLE_WHATSAPP_EXTRACTION=true
ENABLE_WECHAT_EXTRACTION=true
ENABLE_AI_SUMMARY=false
ENABLE_OUTREACH=false
GLOBAL_CRAWL_KILL_SWITCH=false
```

Environment variables provide boot-time defaults. The `source_registry` table provides runtime enable/disable, risk level, crawl budget, cooldown, parser version, and operator notes.

## 33.2 Registry fields

```text
adapter_name
source_family
enabled
risk_level
robots_policy
terms_review_status
daily_request_budget
concurrency_per_domain
minimum_delay_seconds
blocked_until
parser_version
last_success_at
last_failure_at
operator_notes
```

The global kill switch stops all new crawl scheduling but allows ingestion retries, health checks, and recovery jobs.

---

# 34. Identity, confidence, quality, and versioning

## 34.1 Confidence versus quality

`confidence_score` answers: “How strongly is this identity or field supported?”

`quality_score` answers: “How complete and useful is the seller profile?”

Example:

```text
confidence: 96
quality: 42
reason: official email is strongly verified, but registry, phone, product range, and manufacturer evidence are missing
```

## 34.2 Explainable scoring

Store score components, not only the total:

```json
{
  "total": 91,
  "positive": [
    {"rule": "official_domain", "points": 30},
    {"rule": "legal_name_match", "points": 25},
    {"rule": "address_match", "points": 20},
    {"rule": "business_email_context", "points": 16}
  ],
  "negative": [
    {"rule": "minor_address_conflict", "points": -5}
  ]
}
```

## 34.3 Parser and schema versioning

Every emitted item includes:

```text
schema_version
parser_version
adapter_name
extraction_timestamp
```

A parser upgrade must not silently overwrite evidence. It creates a new observation and a diff.

---

# 35. Search and indexing

## 35.1 Core indexes

Create exact indexes for:

```text
normalized_name
official_domain
country_code
city
last_seen_at
merchant_token
contact normalized_hash
source_domain
review status
```

## 35.2 Full-text search

D1 supports SQLite FTS5. Create an FTS5 virtual table in `si-prod-core` covering:

```text
canonical_name
legal_name
legal_name_local
aliases
brands
official_domain
city
```

Use prefix search and normalized aliases. Perform expensive fuzzy entity resolution in the selected crawler runner, not in the request-time Cloudflare Worker.

Because D1 exports do not include virtual tables, backup/restore scripts must recreate and rebuild the FTS5 table after restoring canonical tables.

## 35.3 Search safety

- minimum query length: 2 characters
- bounded result limit: maximum 100
- indexed filters only
- no unrestricted `%term%` scan over large tables
- record D1 `rows_read` metadata for expensive-query detection

---

# 36. Snapshot diff, evidence, and audit

## 36.1 Diff engine

The crawler generates a deterministic field-level diff before ingestion:

```text
field
old masked value
new masked value
change type: added | removed | changed | reverified
source
observed_at
parser_version
```

Contacts removed from a page are marked `possibly_removed` first. They become inactive only after two independent observations or one high-confidence operator decision.

## 36.2 Evidence viewer

The private dashboard provides:

- source URL and capture time
- sanitized/raw HTML snapshot from private R2
- parsed structured JSON
- highlighted extraction context
- content hash
- parser version
- robots and source-risk status

Evidence access uses a short-lived signed Worker route. R2 is never made publicly browsable.

## 36.3 Manual edit audit

Every manual change records:

```text
actor identity
old value hash and masked value
new value hash and masked value
reason
created_at
related review item
```

Manual edits never erase crawler history.

---

# 37. Retry, failure handling, and operational metrics

## 37.1 Error matrix

| Failure | Default action |
|---|---|
| DNS/transient connection | Retry twice with exponential backoff |
| Timeout | Retry once, then increase source cooldown |
| HTTP 404/410 | Mark source missing; no immediate retry |
| HTTP 401 | Stop adapter and require operator review |
| HTTP 403 | Stop affected adapter/domain and apply long cooldown |
| HTTP 429 | Respect `Retry-After`; otherwise exponential cooldown |
| CAPTCHA/challenge marker | Stop adapter/domain; no bypass |
| Parser produced zero fields | Save diagnostic fixture candidate and open review item |
| Ingestion 5xx | Spool locally and replay with idempotency |
| Ingestion 4xx validation | Quarantine batch; do not endlessly retry |
| D1 quota/capacity warning | Stop nonessential writes and archive |

## 37.2 Required metrics

```text
new sellers
updated sellers
new verified contacts
seller-to-contact yield
source success rate
blocked rate
parser-empty rate
duplicate candidate rate
auto-merge rate
manual review backlog
average discovery time
average enrichment time
D1 rows read/written
D1 size by database
R2 storage and operations
Worker request and error count
runner mode and provider
runner deployment version
runner job duration and memory peak
local spool backlog and oldest item age
GitHub Actions included-minute budget state
credit-runner remaining credit and shutdown date
Zyte plan/unit status when enabled
```

Dashboard metrics must clearly distinguish candidates, accepted records, verified contacts, and useful intelligence events.

---

# 38. Duplicate review workflow

The dashboard provides a `Possible duplicates` queue with side-by-side:

- canonical and legal names
- aliases and transliterations
- addresses
- domains
- phones/emails as masked values
- brands and marketplaces
- exact/fuzzy score explanation
- source evidence

Actions:

```text
merge
keep separate
ignore for 30 days
mark permanently unrelated
```

A merge writes an audit record, redirects linked external identifiers, and supports rollback. No record is permanently deleted during a merge.

---

# 39. Optional AI summary

AI summary is disabled by default and is never part of identity truth. When enabled, it may summarize already-collected evidence into:

```text
likely business type
main product categories
manufacturer/trader signals
best verified contact channel
missing evidence
risk notes
recommended manual research step
```

Requirements:

- no unverified facts
- every statement links to existing evidence
- deterministic scores remain authoritative
- no personal-data inference
- zero-cost operation must not depend on AI summary

---

# 40. Risk register

| Risk | Probability | Impact | Required mitigation |
|---|---|---|---|
| Source HTML changes | High | Medium | Adapter fixtures, parser-empty alert, versioned parsers |
| Amazon or another source blocks access | High | High | Stop adapter, cooldown, permitted alternatives; no evasion |
| Public contact coverage below target | High | Medium | Broaden lawful source mix; measure useful events rather than guaranteed contacts |
| Zyte student benefit is delayed, changes, or expires | Medium | High | Provider-neutral runtime, local guaranteed fallback, immediate R2 export, manual activation gate |
| One active runner becomes bottleneck | Medium | Medium | Sequential jobs, delta crawling, source prioritization, page budgets; never auto-buy capacity |
| D1 500 MB per-database limit | High over time | High | Partition from day one, archive at 70%, hard circuit breakers |
| Workers 10 ms CPU limit | Medium | High | Small batches, thin API, heavy work in the selected crawler runner |
| D1 cross-database inconsistency | Medium | Medium | Ordered idempotent writes, reconciliation, retry spool |
| Duplicate company merge error | Medium | High | Explainable scores, review threshold, rollback |
| Personal contact misclassified as business | Medium | High | Classification, masking, manual review, suppression |
| Public/free proxy compromise or poor reputation | High | High | Disabled by default; never use credentials/cookies; never use for block evasion; not core infrastructure |
| D1/R2 quota exhaustion | Medium | High | Daily metrics, soft/hard stops, retention and archive jobs |
| Secret leakage | Low | Critical | Least privilege, rotation, secret scanning, redacted logs |
| Legal/terms complaint | Medium | High | Source registry, evidence, kill switch, suppression and deletion procedure |
| Backup cannot restore | Low | High | Weekly automated restore test and checksum report |
| Codex architecture drift | Medium | High | Frozen spec, AGENTS.md, single-subsystem PRs, approval gates |
| GitHub Actions consumes paid minutes | Low | High | Disabled burst workflow, timeout, minute budget check, no automatic schedule |
| Credit-backed host charges card after credits | Medium | High | AUD 0 hard cap until amended, no add-ons, shutdown date, operator billing lock |
| Runner output lost at shutdown | Medium | High | Local spool, checksums, idempotent replay, immediate R2 archive |
| Automatic failover causes policy or cost breach | Low | Critical | Manual-only provider selection and fail-closed startup validation |

---

# 41. Backup restore verification

A backup is not considered valid until restored.

Weekly job:

```text
1. export canonical tables without FTS virtual tables
2. calculate SHA-256 checksums
3. create temporary local D1/SQLite database
4. import schema and data
5. recreate FTS5 tables
6. run row-count and referential-consistency checks
7. run sample seller/contact/search queries
8. write restore report to R2
9. alert on any mismatch
```

The production restore runbook must identify which database restores first: core → contacts → operations → recent history.

---

# 42. Coding start gate and final definition of done

## 42.1 Before the first Codex implementation task

- [ ] Place this file at repository root as `SELLER_INTELLIGENCE_MASTER_SPEC.md`
- [ ] Create `AGENTS.md` from section 23
- [ ] Keep `RUNNER_MODE=development_locked`
- [ ] Keep every live source, Zyte deploy, Zyte API, Actions crawler, and credit runner flag disabled
- [ ] Implement local fixtures, schemas, API, dashboard, extraction, normalization, scoring, and local runner before provider activation
- [ ] Do not require Zyte confirmation to complete Phases 0–9
- [ ] Require Zyte confirmation before Phase 10B only
- [ ] Create Cloudflare account resources only after naming is finalized and operator approves
- [ ] Keep R2 on Standard storage for free-tier eligibility
- [ ] Generate least-privileged secrets
- [ ] Start with sanitized fixtures and one low-risk official-site adapter
- [ ] Do not enable Amazon collection during bootstrap
- [ ] Do not create an automatic paid fallback


## 42.2 Task completion standard

A Codex task is complete only when all applicable items are done:

```text
code
unit tests
integration tests
migration
fixture updates
documentation
changelog
security review
quota impact
rollback/recovery note
CI passing
no unrelated changes
```

## 42.3 Coding order

Safe before Zyte confirmation:

```text
Phase 0 — repository bootstrap
Phase 1 — local D1 schema and migrations
Phase 2 — secure local ingestion contract
Phase 3 — crawler contracts
Phase 4 — contact extractors with fixtures
Phase 5 — company normalization
Phase 6 — source adapter framework
Phase 7 — approved official-site enrichment with fixtures/local tests
Phase 8 — entity resolution
Phase 9 — dashboard
Phase 10A — local runner readiness
```

Blocked until provider-specific approval:

```text
Phase 10B — Zyte deployment
Phase 10C — GitHub Actions burst activation
Phase 10D — credit-backed container activation
real marketplace crawling
production schedules
```


# 43. v1.1 inherited final-audit changelog

Added or corrected:

1. Correct D1 Free limit: 500 MB per database, 5 GB account total.
2. Partitioned D1 architecture and cross-database consistency rules.
3. Lower ingestion batch limits for Workers Free CPU constraints.
4. Source adapter registry and runtime feature flags.
5. Global crawl kill switch.
6. Canonical UUID identity independent of marketplaces.
7. Separate confidence and profile-quality scores.
8. Explainable score components.
9. Schema and parser versioning.
10. D1 FTS5 search design and restore caveat.
11. Snapshot diff engine.
12. Private evidence viewer.
13. Manual-edit audit trail.
14. Duplicate review and rollback workflow.
15. Error-specific retry/cooldown matrix.
16. Complete operational metrics.
17. Local, staging, and production environments.
18. Semantic release and `/v1/` API versioning.
19. Optional evidence-grounded AI summary.
20. Weekly restore verification.
21. Formal risk register.
22. Stricter Codex constraints and definition of done.
23. Coding start gate and safe first-day order.

This inherited v1.1 audit remains valid except where v2.0 provider-neutral sections supersede runner-specific assumptions.

---


# 44. Hybrid fallback matrix

| Capability | Zyte Student | Local Docker | GitHub Actions burst | Credit-backed container |
|---|---|---|---|---|
| Recurring cloud hosting cost | AUD 0 after verified entitlement | AUD 0 cloud cost | AUD 0 only inside included minutes | AUD 0 only while credit remains |
| Always-on without operator device | Yes | No | No | Yes while active |
| Long-running jobs | Yes after verified student benefit | Yes while device stays on | Not recommended | Provider-dependent |
| Scheduling | Scrapy Cloud | Task Scheduler / cron | Manual; optional bounded schedule | Platform scheduler |
| One codebase | Yes | Yes | Yes | Yes |
| Durable output | D1/R2 | D1/R2 + local spool | D1/R2 + temporary spool | D1/R2 + local spool |
| Default enabled | No, pending confirmation | Development only | No | No |
| Automatic failover allowed | No | No | No | No |
| Paid upgrade allowed | No | Not applicable | No paid-minute overage | No overage/add-ons |

Selection priority after all gates are satisfied:

```text
zyte_student_active
    ↓ explicit operator switch only
fallback_local
    ↓ explicit operator switch only
fallback_actions_burst
    ↓ explicit operator switch only
fallback_credit_container
```

This ordering is not automatic failover logic. It is an operator decision guide.

# 45. Zero-charge enforcement

Global flags:

```text
PAID_SERVICES_ALLOWED=false
MAX_EXTERNAL_MONTHLY_SPEND_AUD=0
ALLOW_EXTRA_SCRAPY_UNITS=false
ALLOW_PAID_GITHUB_ACTIONS_MINUTES=false
ALLOW_PAID_ADDONS=false
ZYTE_API_ENABLED=false
```

Required startup assertions:

```text
if PAID_SERVICES_ALLOWED is false:
    reject any non-zero external budget
    reject Scrapy Cloud units > 1
    reject Zyte API enablement
    reject credit runner without confirmed remaining credit
    reject Actions runner when included-minute state is unknown
```

The dashboard must show a red `PAID SERVICES LOCKED` badge and provider activation audit history. A provider cannot be enabled only by editing a frontend setting; server-side configuration and operator approval are required.

# 46. Provider activation runbooks

## 46.1 Zyte Student activation

1. Obtain written or account-level confirmation that the GitHub Student unit is applied.
2. Verify the account is not merely on the standard low-resource Free Unit Plan.
3. Verify one-unit jobs have the promised student runtime benefit.
4. Confirm no paid Scrapy Cloud subscription and no Zyte API spending limit are enabled.
5. Set secrets only in the deployment environment.
6. Deploy a no-network smoke spider.
7. Run one approved public-page job with a tiny page budget.
8. Verify usage, unit count, logs, R2 archive, and D1 ingestion.
9. Set `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true` only after evidence is stored.
10. Keep `ZYTE_API_ENABLED=false`.

## 46.2 Local fallback activation

1. Build the pinned Docker image.
2. Run all tests and fixture smoke tests.
3. Verify the local spool directory and free disk threshold.
4. Verify signed ingestion and offline replay.
5. Set `RUNNER_MODE=fallback_local` and a small page budget.
6. Schedule only after the manual run succeeds.

## 46.3 GitHub Actions burst activation

1. Confirm current included-minute balance.
2. Keep the workflow manual unless a separate amendment allows a schedule.
3. Set a strict timeout, page budget, and concurrency of one.
4. Require an operator confirmation input.
5. Stop the workflow when the remaining included-minute guard is reached.

## 46.4 Credit-backed container activation

1. Confirm actual active credit and expiry date.
2. Confirm card/overage protection.
3. Set an automatic shutdown date before credit expiry.
4. Use no paid add-on.
5. Set a hard spend cap; baseline remains AUD 0.
6. Deploy the same tested Docker image.

# 47. v2.0 merge changelog

This version combines the earlier provider-independent plan with the Zyte-first plan and supersedes v1.1.

Added or changed:

1. Provider-neutral runner contract and manual state machine.
2. Zyte Student as preferred but non-required runtime.
3. Local Docker/Scrapy as guaranteed operational fallback.
4. GitHub Actions as a disabled, bounded burst fallback.
5. Existing student-credit container as an optional emergency fallback.
6. Durable local spool with checksums and idempotent replay.
7. Immediate D1/R2 export independent of Scrapy Cloud retention.
8. Current Zyte entitlement-pending state recorded explicitly.
9. Zero-charge global lock and startup assertions.
10. No automatic provider escalation or paid failover.
11. Provider-specific Phase 10A–10D implementation gates.
12. Updated risks, monitoring, secrets, and activation runbooks.
13. Free public proxies removed from core architecture.
14. Phase 0–10A allowed before Zyte confirmation.

# 48. Official references

1. GitHub Student Developer Pack — Zyte offer  
   https://education.github.com/pack

2. Zyte Student Scrapy Cloud benefit  
   https://www.zyte.com/scrapy-cloud-student-backpack/

3. Scrapy Cloud pricing: standard Free Unit versus purchased/student-unit benefits  
   https://docs.zyte.com/scrapy-cloud/pricing.html

4. Scrapy Cloud units  
   https://docs.zyte.com/scrapy-cloud/usage/units.html

5. Zyte API pricing and trial suspension behavior  
   https://docs.zyte.com/zyte-api/pricing.html

6. Cloudflare Workers limits  
   https://developers.cloudflare.com/workers/platform/limits/

7. Cloudflare D1 limits  
   https://developers.cloudflare.com/d1/platform/limits/

8. Cloudflare D1 pricing  
   https://developers.cloudflare.com/d1/platform/pricing/

9. Cloudflare R2 pricing  
   https://developers.cloudflare.com/r2/pricing/

10. Cloudflare Pages limits  
    https://developers.cloudflare.com/pages/platform/limits/

11. GitHub Actions billing and included usage  
    https://docs.github.com/en/billing/concepts/product-billing/github-actions

12. OpenAI Codex documentation  
    https://developers.openai.com/codex/

---

**End of frozen hybrid master specification v2.0.0**
