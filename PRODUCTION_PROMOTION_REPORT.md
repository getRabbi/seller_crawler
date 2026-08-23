# Production Promotion Report

## Contact enrichment hardening promotion — 2026-08-23

Release code commit: `51feb4f99e934addc184b01bb172e589eb998874`

The Amazon-to-official-website contact workflow is promoted. An operator can
take an existing canonical seller, verify one public HTTPS website, and launch a
bounded official-site crawl whose seller, source, and contact records remain
linked to that existing seller ID. Contact selections are enforced by the
crawler, crawl-run contact counts are idempotent, explicit source challenges
stop the adapter, and a completed crawl with no supported public contacts is
reported with a warning rather than a false success.

### Promotion evidence

| Gate | Verified result |
|---|---|
| Local/CI | 137 Python tests and 64 web tests passed; Ruff, mypy, ESLint, TypeScript, Bandit, pip-audit, npm audit, staging build, and production build passed; GitHub CI Python and CI Web passed |
| Scrapy Cloud | Project `871778`, immutable artifact `51feb4f99e934addc184b01bb172e589eb998874`, three spiders, one-unit ceiling |
| Staging acceptance | Job `871778/1/17`, crawl run `01a02f92-a986-79a9-a5ec-6f2932b44f83`, 9/9 successful responses, four verified contact types, zero blocks/errors, and zero active jobs afterward |
| Contact privacy | All four staging contacts remained attached to seller `f85c6ff9-e98e-7ef3-88dd-bef50311f516`; every row had ciphertext, a masked display value, schema version 1, and parser `contact-extractor-v1` |
| Operations migration | `0006_crawl_run_contacts.sql` applied and read back in staging and production; production reports no pending migrations |
| Staging Worker | Version `d5d26d95-9c3a-4540-aec0-51a1faa2166f` at 100% |
| Staging Pages | Deployment `291a0ab6-e0c8-4d2f-a282-f4d18a1d5ce6` on production branch `main` |
| Production Worker | Version `b524684d-815b-4287-8fa9-bb91e96d1182` at 100% |
| Production Pages | Deployment `b80a8bd0-6a54-43ef-b054-a223908c8a2f` on production branch `main` |
| Access boundary | Health/dashboard/private export redirect unauthenticated requests; dashboard-origin preflight returns 204; unauthenticated API POST redirects; unsigned ingest/cooldown calls are rejected by the Worker |
| Access policies | API, dashboard, Pages root, and Pages preview each have one exact-email Allow policy; only the exact ingest and cooldown machine paths have Bypass policies; API audience matches the Worker configuration |
| Free-tier locks | Eight D1 databases, no active/queued operator run, no active Scrapy Cloud job, `SCRAPY_CLOUD_MAX_UNITS=1`, paid services and Zyte API disabled |

Checksummed backups were created before migration:

- staging: `.sellerintel/backups/staging-20260823T165550Z/manifest.json`
- production: `.sellerintel/backups/production-20260823T170715Z/manifest.json`

The production Access login requires an interactive operator email session.
Neither the in-app browser connection nor the local Access CLI had an active
session during this promotion, so no credential, cookie, OTP, or CAPTCHA
workaround was attempted. The exact-email policies, application audience,
redirect boundary, machine-path isolation, CORS preflight, local desktop/mobile
UI, and previously working operator flow were verified independently.

Rollback keeps migration `0006` and its audit links in place. Redeploy Worker
version `d86c6c69-8deb-47ca-872e-7466f85f0201`, Pages deployment
`e7b3475c-1369-40b5-ac8e-c527cebde64b`, and crawler artifact
`6bc8b45b05f5561adec15fefbf87ff435b931f0c` if application rollback is needed.
Restore the checksummed production backup only for a documented data-recovery
event; normal rollback uses a forward migration and never deletes canonical or
historical data.

Date: 2026-08-23  
Release commit: `6bc8b45b05f5561adec15fefbf87ff435b931f0c`  
Branch: `main`

## Verdict

Seller Intelligence Solo Mode v1 is deployed and ready for controlled
single-operator production use. Amazon discovery and official-site enrichment
can be launched only through the Access-authenticated operator queue. The queue
pump runs once per minute, but it does not create broad or autonomous crawl
requests. The one-active-slot database constraint and `units=1` runner request
remain enforced.

No paid service, Zyte API, extra Scrapy Cloud unit, automatic provider switch,
GitHub Actions crawler, credit runner, Alibaba, 1688, generic search discovery,
or CAPTCHA/evasion path is enabled.

One acceptance action cannot be automated from the current agent environment:
an interactive Cloudflare Access email login and visual walkthrough. The public
Access boundary, exact-email policies, signed machine-route boundaries, API
audience, dashboard build, and deployed resources were verified independently.
The operator should perform the short login walkthrough before relying on the
dashboard for the first production crawl.

## Immutable release evidence

| Component | Production evidence |
|---|---|
| Git | `main` at `6bc8b45b05f5561adec15fefbf87ff435b931f0c` |
| Scrapy Cloud | project `871778`, artifact `6bc8b45b05f5561adec15fefbf87ff435b931f0c`, 3 spiders |
| Scrapy Cloud smoke | job `871778/2/8`, `solo_no_network_smoke`, finished, 0 errors, no active jobs afterward |
| Worker | `seller-intelligence-api-production`, version `6ac22769-125c-410c-9fae-af6c113c81ff` |
| Pages | `seller-intelligence-production`, deployment `https://8898060f.seller-intelligence-production.pages.dev` |
| Custom domains | `https://api.scalemyprints.com`, `https://dashboard.scalemyprints.com` |
| GitHub CI | CI Python and CI Web both passed for the release commit |

The production Worker has a one-minute queue-pump cron and references the exact
Scrapy Cloud release artifact. Its five required secret names are present:
Access email, ingestion HMAC, versioned contact keyring, active encryption key
version, and Scrapy Cloud API key. Production HMAC and AES-256-GCM keys were
rotated separately from staging; their values were never printed or persisted
in repository files.

## Cloudflare account and data plane

Every Cloudflare mutation was guarded before and after against the sole allowed
account ID `b63e426431b63ec9db33d7c421d01b42`. The forbidden account was never used.

| Partition | Production D1 ID | Migration state |
|---|---|---|
| Core | `944a961f-2c78-43cf-91f0-985176c1c016` | current |
| Contacts | `8f8dcfb7-c374-43d5-b978-2bb115a3c04e` | current |
| Operations | `0223e197-5587-4370-be3f-094d79d54a19` | current through `0005_operator_crawl_control.sql` |
| Recent history | `2c1fb427-450e-4414-b81b-3c9492f9d736` | current |

Production and staging remain distinct, for eight D1 databases total. The
account stays under Cloudflare Free's ten-database limit. Restore verification
created only one disposable database at a time and deleted each verified target
after use; the final account count returned to eight.

## Access and security acceptance

- Unauthenticated production health and dashboard requests return Cloudflare
  Access HTTP 302 redirects.
- The production API Access application bypasses authentication only for
  browser `OPTIONS` preflight. A live dashboard-origin preflight returns HTTP
  204 with the exact allowed origin, credentials, `content-type`, and
  `GET, POST, OPTIONS`; an unauthenticated API `POST` still returns an Access
  HTTP 302 redirect.
- API, dashboard, Pages root, and Pages preview Access policies allow exactly
  the configured operator email.
- Only exact machine paths `/v1/ingest/batch` and `/v1/crawl/authorize` bypass
  Access; both remain independently HMAC-signed.
- Unsigned ingestion and cooldown requests return HTTP 400.
- The production Worker Access audience matches its deployed configuration.
- Browser contact values remain masked; reveal requires authenticated POST,
  operator reason, and an audit record.
- `pip` is locked to `26.2.1`, clearing `PYSEC-2026-3721`. Python and npm
  production audits report no known vulnerabilities.

## Amazon staging acceptance used for promotion

The bounded live staging run `01a02d6f-b60a-7c4d-a04c-89d610eb7604` / Scrapy
Cloud job `871778/3/2` persisted four public Amazon seller identities, four
marketplace accounts, and four product links. A representative source request
for ASIN `B0DFBJQBZH` matched the stored product URL and masked merchant token
`A29D...KYH7`; the stored title, brand, seller display name, product-to-seller
relationship, and source provenance matched the public response.

That run also exposed a JSON-shaped seller-response selector exception. The
parser now fails safe on non-HTML responses, does not create false seller-page
evidence, counts product-page merchant identity toward the bounded target, caps
one-target fan-out, and hard-sets one Amazon retry per job. The final release
tests cover those conditions. Later bounded source checks demonstrated
intermittent Amazon 503/no-data behavior; no evasion occurred and no further
Amazon request is authorized by this promotion.

Amazon remains identity-only. Public email, phone, WhatsApp, and WeChat are
collected only from a credibly resolved official public website.

## Backup and restore acceptance

The valid post-migration production manifest is:

`E:\seller_crawler\.sellerintel\backups\production-20260823T074625Z\manifest.json`

It contains four non-empty SQL exports, explicit production database names, and
matching SHA-256 checksums. Core, contacts, operations, and history were restored
in that order into sequential disposable remote D1 databases. Expected schemas
and row-count queries passed; the core FTS table was rebuilt and queried. All
four disposable databases were then deleted and their absence verified.

Two earlier local manifests created during this promotion were discovered to be
mislabeled because the old utility accepted staging database names with a
production label. They are not production backups and must not be used. The
release adds an environment-token guard to both backup and restore; mismatched
names now stop before Wrangler runs. The valid manifest above should be copied
to operator-controlled encrypted storage; repository automation intentionally
does not upload it.

## Test evidence

- Ruff passed; mypy passed for 95 source files.
- Pytest: 132 passed.
- Contact extractor coverage: 95.36% against a 90% requirement.
- Bandit and `pip-audit`: clean.
- ESLint and TypeScript typecheck: passed.
- Vitest: 56 passed; Worker health suite: 5 passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Next.js production export: 11 static pages generated.
- Docker build passed; `--network none` smoke crawled 8 fixture pages, found 4
  contacts, and reported 0 errors/blocks/spool writes.
- GitHub CI Python and CI Web passed on the immutable release commit.

## Quota and rollback

- D1: eight persistent databases; no disposable restore database remains.
- Scrapy Cloud: the existing Student project only, `units=1`, no active jobs.
- Zyte API and every paid-service budget remain zero/disabled.
- R2 evidence/archive expansion remains deferred; no paid storage path was
  activated.

Rollback preserves all canonical and historical data. Re-deploy the prior
Worker version and Pages deployment, or the prior Scrapy artifact
`376084e994eadf6fd383514ccc1ceb413674ad5d`; do not reverse migration `0005` by
deleting tables. Use a forward migration for schema repair and the checksummed
backup for disaster recovery.

For the Access preflight configuration specifically, rollback is to disable
**Bypass options requests to origin** on the production API Access application.
That restores the previous fail-closed behavior but also prevents browser crawl
creation until another authenticated preflight design is deployed.

## Operator login walkthrough

1. Open `https://dashboard.scalemyprints.com` and complete Cloudflare Access
   login with the configured single operator email.
2. Confirm overview, sellers, seller detail, masked contacts, review queue,
   crawl health, and both CSV exports load without an Access/API error.
3. Open New Crawl and confirm Amazon and known-website modes are available.
4. Do not launch another Amazon source request merely for acceptance. The next
   production crawl must be an intentional operator job with its normal bounded
   target and stop conditions.
