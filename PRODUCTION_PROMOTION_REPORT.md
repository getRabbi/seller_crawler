# Production Promotion Report

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
- Vitest: 52 passed; Worker health suite: 5 passed.
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

## Operator login walkthrough

1. Open `https://dashboard.scalemyprints.com` and complete Cloudflare Access
   login with the configured single operator email.
2. Confirm overview, sellers, seller detail, masked contacts, review queue,
   crawl health, and both CSV exports load without an Access/API error.
3. Open New Crawl and confirm Amazon and known-website modes are available.
4. Do not launch another Amazon source request merely for acceptance. The next
   production crawl must be an intentional operator job with its normal bounded
   target and stop conditions.
