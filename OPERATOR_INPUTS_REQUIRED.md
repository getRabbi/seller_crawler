# Operator Inputs Required

> Historical pre-production inventory. The required runtime values and hosted
> resources were configured on 2026-08-23. See
> `PRODUCTION_PROMOTION_REPORT.md` for authoritative current state. No secret
> value is recorded here. The only remaining acceptance action is the operator's
> interactive Cloudflare Access dashboard walkthrough.

Solo v1 is blocked at the consolidated external-resource boundary. No secret
values are stored in this file. `SET` means only that the current audit shell
contained a non-empty value; it does not prove the credential has sufficient
permissions. `MISSING` means the operator must supply the value before staging.

## Cloudflare Account

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Non-secret | SET | Cloudflare dashboard account overview | Operator shell; optional GitHub environment variable | Identify the intended account | Staging/production |
| `CLOUDFLARE_API_TOKEN` | Secret | SET, auth unverified | Cloudflare API Tokens | Operator secret store/shell; optional GitHub environment secret | Workers Scripts edit, D1 edit, Pages edit; Zone read/routes edit when using routes | Staging/production |
| `CLOUDFLARE_ZONE_NAME` | Non-secret | MISSING | Cloudflare DNS zone | Both untracked Wrangler files | Select the approved zone only | Staging/production |

The read-only `wrangler whoami` check did not complete in the current environment.
Re-run it before any resource or deployment command.

## Four Staging D1 Databases

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `CORE_D1_DATABASE_NAME`, `CORE_D1_DATABASE_ID` | Non-secret | MISSING | Staging core D1 resource | `.env.staging`; `wrangler.staging.toml` `CORE_DB` | D1 read/write/migrate | Staging |
| `CONTACTS_D1_DATABASE_NAME`, `CONTACTS_D1_DATABASE_ID` | Non-secret | MISSING | Staging contacts D1 resource | `.env.staging`; `wrangler.staging.toml` `CONTACTS_DB` | D1 read/write/migrate | Staging |
| `OPS_D1_DATABASE_NAME`, `OPS_D1_DATABASE_ID` | Non-secret | MISSING | Staging operations D1 resource | `.env.staging`; `wrangler.staging.toml` `OPS_DB` | D1 read/write/migrate | Staging |
| `HISTORY_D1_DATABASE_NAME`, `HISTORY_D1_DATABASE_ID` | Non-secret | MISSING | Staging history D1 resource | `.env.staging`; `wrangler.staging.toml` `HISTORY_DB` | D1 read/write/migrate | Staging |

## Four Production D1 Databases

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `CORE_D1_DATABASE_NAME`, `CORE_D1_DATABASE_ID` | Non-secret | MISSING | Production core D1 resource | `.env.production`; `wrangler.production.toml` `CORE_DB` | D1 read/write/migrate | Production |
| `CONTACTS_D1_DATABASE_NAME`, `CONTACTS_D1_DATABASE_ID` | Non-secret | MISSING | Production contacts D1 resource | `.env.production`; `wrangler.production.toml` `CONTACTS_DB` | D1 read/write/migrate | Production |
| `OPS_D1_DATABASE_NAME`, `OPS_D1_DATABASE_ID` | Non-secret | MISSING | Production operations D1 resource | `.env.production`; `wrangler.production.toml` `OPS_DB` | D1 read/write/migrate | Production |
| `HISTORY_D1_DATABASE_NAME`, `HISTORY_D1_DATABASE_ID` | Non-secret | MISSING | Production history D1 resource | `.env.production`; `wrangler.production.toml` `HISTORY_DB` | D1 read/write/migrate | Production |

Database names are repeated intentionally because staging and production must
use distinct resources and values.

## Worker

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `CLOUDFLARE_WORKER_NAME` | Non-secret | MISSING; template default exists | Operator naming decision | `.env.*`; matching Wrangler `name` | Workers deploy | Staging/production |
| `CLOUDFLARE_WORKER_ROUTE` / Worker API hostname | Non-secret | MISSING | Approved DNS/Worker route | `.env.*`; Wrangler `routes` | Zone route edit | Staging/production |
| `DASHBOARD_ORIGIN` | Non-secret | MISSING | Final protected dashboard origin | Wrangler vars | Exact CORS origin | Staging/production |
| `INGESTION_ALLOWED_SOURCE_DOMAINS` | Non-secret | STAGING CONFIGURED (`seed-stg.scalemyprints.com`) | Approved seed-domain list | Wrangler vars | Restrict ingestion source URLs | Staging/production |

## Dashboard And Pages

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `CLOUDFLARE_PAGES_PROJECT` | Non-secret | MISSING; template default exists | Pages project | `.env.*`; Pages deploy command | Pages deploy | Staging/production |
| Dashboard hostname/origin | Non-secret | MISSING | Pages/custom-domain setup | Access app; `DASHBOARD_ORIGIN` | DNS/Pages read | Staging/production |
| `NEXT_PUBLIC_WORKER_API_BASE_URL` | Non-secret | MISSING | Final Worker API origin | Dashboard build environment | Public API base URL only | Staging/production |

## Cloudflare Access Allowed Email

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `ACCESS_ALLOWED_EMAIL` | Personal secret | MISSING | Single operator identity | Wrangler secret and exact Access Allow policy | One email only | Staging/production |
| `TEAM_DOMAIN` | Non-secret | MISSING | Cloudflare Zero Trust team domain | Wrangler vars as `https://<team>.cloudflareaccess.com` | JWKS/issuer validation | Staging/production |
| `POLICY_AUD` | Sensitive non-secret | MISSING | Access application overview | Wrangler vars | JWT audience validation | Separate staging/production value |

Protect dashboard and Worker query/health routes with an Allow policy containing
only `ACCESS_ALLOWED_EMAIL`. Add an exact-path Access Bypass application/policy
only for `/v1/ingest/batch`, which is independently HMAC-authenticated. No other
Worker route may bypass Access.

## Ingestion HMAC Secrets

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `INGESTION_HMAC_SECRET` (staging) | Secret | WORKER AND PRIVATE SCRAPY CLOUD SETTING CONFIGURED | Generated securely | Staging Worker secret; Scrapy Cloud project setting | Sign/verify ingestion only | Staging |
| `INGESTION_HMAC_SECRET` (production) | Secret | MISSING | Generate separately | Production Worker secret; Scrapy Cloud project setting after production promotion | Sign/verify ingestion only | Production |

Do not reuse the staging secret in production. Never put either value in a
dashboard variable, command argument, repository file, log, or job-scheduling
request.

## Zyte Scrapy Cloud Project And Credential

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `SCRAPY_CLOUD_PROJECT_ID` | Non-secret | CONFIGURED (`871778`) | Verified Student Scrapy Cloud project URL/dashboard | Ignored repository `.env`; optional GitHub input/variable | One entitled project | Staging smoke/production runner |
| `SCRAPY_CLOUD_API_KEY` / `SHUB_APIKEY` | Secret | CONFIGURED IN IGNORED `.env` | Scrapy Cloud account API key | Operator secret store/shell or `scrapy-cloud` GitHub environment secret | Deploy project; start/read/stop jobs; read logs | Staging smoke/production runner |
| `INGESTION_ENDPOINT_URL` project setting | Non-secret | STAGING CONFIGURED | Current protected Worker ingestion URL | Scrapy Cloud project custom setting | Outbound HTTPS to Worker | Staging, then production |
| `INGESTION_HMAC_SECRET` project setting | Secret | STAGING CONFIGURED; VALUE NOT RECORDED | Matching target Worker secret above | Scrapy Cloud private project custom setting | Sign ingestion only | Staging, then rotate to production |

The Scrapy Cloud API key is not a Zyte API key. Do not create or configure a
Zyte API key. Confirm in the dashboard that only the one Student unit exists.

## GitHub Actions Deployment Secrets, Only If Used

GitHub Actions is not required for the first operator-led launch. The local
GitHub CLI is authenticated, but no repository secret or environment value was
inspected.

| Variable/value | Type | State | Obtain from | Configure in | Required scope | Environment |
|---|---|---:|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Secret | UNKNOWN | Cloudflare API Tokens | Protected `staging`/`production` GitHub environments | Same least-privilege deploy scope above | Optional deployment CI |
| `CLOUDFLARE_ACCOUNT_ID` | Non-secret | UNKNOWN | Cloudflare dashboard | Protected GitHub environments | Identify account | Optional deployment CI |
| `SCRAPY_CLOUD_API_KEY` | Secret | UNKNOWN | Scrapy Cloud account | Protected `scrapy-cloud` GitHub environment | Deploy one project only | Optional Zyte deployment CI |
| `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED` | Non-secret variable | UNKNOWN | Confirmed operator fact | GitHub environment variable | Must equal `true` | Optional Zyte deployment CI |
| `SCRAPY_CLOUD_DEPLOY_ENABLED` | Non-secret variable | UNKNOWN | Operator release decision | GitHub environment variable | Set `true` only for controlled dispatch | Optional Zyte deployment CI |

Do not configure crawler fallback, Zyte API, extra-unit, paid-service, R2, or
scheduled-crawl secrets.

## Boundary Exit Checklist

- [x] `npx.cmd wrangler whoami` succeeds exclusively for the repository-authorized account.
- [ ] Eight distinct D1 resource names/IDs are recorded across staging and production.
- [ ] Staging and production Worker/API and dashboard hostnames are final.
- [ ] Separate staging and production HMAC secrets are configured without display.
- [ ] One operator email, team domain, and both Access audiences are available.
- [x] The entitled Scrapy Cloud project ID and Scrapy Cloud API credential are available.
- [x] The controlled runner and job metadata confirm exactly one unit; Zyte API is disabled.
- [x] The synthetic HTTPS seed `seed-stg.scalemyprints.com` is approved and its bounded staging smoke completed.

After this checklist is complete, the next command is:

```powershell
npx.cmd wrangler whoami
```

Then follow `DEPLOYMENT_RUNBOOK.md` from **Prepare Staging** without skipping a
gate.
