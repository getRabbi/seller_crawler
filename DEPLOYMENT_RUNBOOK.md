# Solo Mode v1 Deployment Runbook

This runbook promotes the verified local Solo v1 build to staging and then
production. It does not authorize broad crawling, paid services, Zyte API,
additional Scrapy Cloud units, R2, or an automatic fallback. Execute one section
at a time and stop on any failed gate.

## Permanent Safety Baseline

Keep these values in every local, Cloudflare, CI, and Scrapy Cloud context:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
MAX_EXTERNAL_MONTHLY_SPEND_AUD=0
ALLOW_EXTRA_SCRAPY_UNITS=false
ENABLE_AMAZON=false
ENABLE_ALIBABA=false
ENABLE_1688=false
ENABLE_SEARCH_DISCOVERY=false
ENABLE_BUSINESS_REGISTRY=false
ENABLE_OFFICIAL_WEBSITE=true
ENABLE_AI_SUMMARY=false
ENABLE_OUTREACH=false
GITHUB_ACTIONS_CRAWLER_ENABLED=false
CREDIT_RUNNER_ENABLED=false
```

Keep these false except during the named controlled action:

```text
SCRAPY_CLOUD_DEPLOY_ENABLED=false
LIVE_CRAWL_ENABLED=false
```

Never store a Zyte API key. The Scrapy Cloud credential is a separate credential
and is used only for code deployment and the Jobs API.

## 1. Local Release Gate

From the repository root:

```powershell
uv sync --dev
npm.cmd install
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
docker build -t seller-intelligence-crawler:solo-v1 .
docker run --rm --network none seller-intelligence-crawler:solo-v1
```

The container must report `dry_run_complete`, eight fixture pages, four contacts,
and zero blocks/errors. No local or hosted gate permits a live URL here.

Apply the four local D1 partitions before a local Worker integration test:

```powershell
npx.cmd wrangler d1 migrations apply CORE_DB --local --config apps/worker-api/wrangler.toml
npx.cmd wrangler d1 migrations apply CONTACTS_DB --local --config apps/worker-api/wrangler.toml
npx.cmd wrangler d1 migrations apply OPS_DB --local --config apps/worker-api/wrangler.toml
npx.cmd wrangler d1 migrations apply HISTORY_DB --local --config apps/worker-api/wrangler.toml
```

Use an untracked `apps/worker-api/.dev.vars` for a local-only
`INGESTION_HMAC_SECRET`. Never pass a production secret on a command line.

## 2. Prepare Staging

Complete `OPERATOR_INPUTS_REQUIRED.md`. Create the four staging D1 databases,
the staging Pages project, and DNS hostnames. Protect the dashboard and Worker
query paths with a Cloudflare Access Allow policy containing exactly the
operator email. Configure an exact-path Access Bypass application/policy only
for `/v1/ingest/batch`; that route uses HMAC, timestamp, nonce, source-policy,
payload-schema, and idempotency validation and cannot use an interactive Access
session. Add the same exact-path HMAC bypass for `/v1/crawl/authorize`; this
signed read checks the persisted domain cooldown before a live job schedules a
seed. Do not bypass Access for health, search, CSV, or other `/v1` routes.

Create untracked files from the committed templates:

```text
.env.staging
apps/worker-api/wrangler.staging.toml
```

Replace every angle-bracket placeholder in the Wrangler file. Keep all safety
flags unchanged. Confirm there is no R2 binding. Configure secrets interactively:

```powershell
npx.cmd wrangler secret put INGESTION_HMAC_SECRET --config apps/worker-api/wrangler.staging.toml
npx.cmd wrangler secret put ACCESS_ALLOWED_EMAIL --config apps/worker-api/wrangler.staging.toml
npx.cmd wrangler secret put CONTACT_ENCRYPTION_KEYS --config apps/worker-api/wrangler.staging.toml
```

`TEAM_DOMAIN` must be the HTTPS `*.cloudflareaccess.com` team domain.
`POLICY_AUD` must be the Access application audience. The Worker validates the
JWT signature against the team JWKS, then validates issuer, audience, expiry,
and the exact allowed email.

## 3. Migrate And Deploy Staging Worker

Back up any existing staging data first. Then apply migrations in partition
order:

```powershell
npx.cmd wrangler d1 migrations apply CORE_DB --remote --config apps/worker-api/wrangler.staging.toml
npx.cmd wrangler d1 migrations apply CONTACTS_DB --remote --config apps/worker-api/wrangler.staging.toml
npx.cmd wrangler d1 migrations apply OPS_DB --remote --config apps/worker-api/wrangler.staging.toml
npx.cmd wrangler d1 migrations apply HISTORY_DB --remote --config apps/worker-api/wrangler.staging.toml
npx.cmd wrangler deploy --config apps/worker-api/wrangler.staging.toml
```

In an authenticated browser, open the Worker host once to establish its Access
session, then verify `GET /v1/health`. It must report all four D1
bindings ready and Access ready. An unauthenticated private API request must be
blocked by Access or return the Worker locked/unauthorized response.

Rollback: deploy the prior Worker commit. Never reverse a D1 migration by
deleting data; restore a checksummed export or add a forward migration.

## 4. Build And Deploy Staging Dashboard

Set only the public Worker base URL at build time:

```powershell
$env:NEXT_PUBLIC_WORKER_API_BASE_URL="https://<STAGING_WORKER_HOST>"
npm.cmd run build --workspace @seller-intelligence/dashboard
npx.cmd wrangler pages deploy apps/dashboard/out --project-name <STAGING_PAGES_PROJECT> --branch <STAGING_PAGES_PRODUCTION_BRANCH>
```

Before invoking Pages CLI, load `CLOUDFLARE_ACCOUNT_ID` from the repository's
ignored environment file into that process and verify `wrangler whoami` resolves
only to the repository-authorized account. Pages CLI may consult cached account
selection; an ambiguous or mismatched account is a hard stop. If account-safe
CLI selection cannot be proven, upload assets with a project-scoped upload token
and create the deployment through the explicit
`/accounts/<AUTHORIZED_ACCOUNT_ID>/pages/projects/<PROJECT>/deployments` API.
The branch must match the Pages project's configured production branch so the
custom staging domain serves the new deployment.

Do not put the HMAC secret, Cloudflare API token, Access token, Scrapy Cloud
credential, raw contact values, or D1 IDs in `NEXT_PUBLIC_*` variables. Confirm
the Access Allow policy protects the Pages hostname before sharing the URL. The
dashboard uses credentialed requests to the API origin, so both origins must be
in the intended Access and CORS configuration.

The dashboard sends cross-origin JSON requests, which require an unauthenticated
browser `OPTIONS` preflight. On the dashboard-facing Worker Access application,
enable **Bypass options requests to origin**. Do not add an Access Bypass policy
for `GET`, `POST`, or any API path. The Worker must retain its exact
`DASHBOARD_ORIGIN` check and credentialed CORS response. Verify an allowed-origin
preflight returns HTTP 204 with the expected CORS headers, while the same API
`POST` without an Access session still redirects to or is denied by Access.

Verify seller list/detail, masked contacts, duplicate review, crawl runs, search,
retry/empty/error states, and all three CSV exports: sellers, masked contacts,
and crawl runs. The crawl-run export must omit operator identity and secrets and
must not advance the one-unit queue as a side effect.

For sellers without an official domain, the dashboard may provide a
user-initiated Google verification link. Do not automate or scrape Google's
result pages. Automatic Google resolution requires an approved official API,
an explicit provider activation, and zero-charge quota enforcement; until then,
the operator must verify a domain and submit it through Known Websites mode.

## 5. Four-D1 Backup And Restore Drill

Load the four database-name variables for the target environment, then run:

```powershell
uv run --directory crawler python -m sellerintel.operations.d1_transfer backup --environment staging --workspace-root .. --output-root .sellerintel/backups
```

The utility requires every configured database name to contain the requested
`staging` or `production` environment token. A mismatch stops before any export
or restore command. Inspect the generated manifest and confirm all four
`database_name` values before treating the backup as valid.

The output directory contains four SQL files and a SHA-256 manifest under
`.sellerintel/backups`. Move the completed backup to operator-controlled,
encrypted storage. The repository does not upload backups to R2.

Cloudflare D1 cannot export a database while including an FTS5 virtual table.
The backup utility therefore exports every canonical core table explicitly and
excludes only the rebuildable `seller_search_fts` index. After any core restore,
run `database/queries/rebuild_core_fts_after_restore.sql`.

Restore only into the matching environment and database mapping:

```powershell
uv run --directory crawler python -m sellerintel.operations.d1_transfer restore --environment staging --workspace-root .. --manifest <MANIFEST_PATH> --confirm-restore
```

After a core restore, execute
`database/queries/rebuild_core_fts_after_restore.sql`, then re-run health, search,
seller detail, contacts, and CSV checks. Production additionally requires
`--confirm-production`.

## 6. One-Unit Scrapy Cloud Smoke

Do not use a Zyte API key and do not depend on custom project settings in the
Scrapy Cloud UI. Before every verification job, load these values from the
approved local environment. The controlled runner injects them into the
official `run.json` `job_settings` payload for that job only:

```text
INGESTION_ENDPOINT_URL=https://<STAGING_WORKER_HOST>/v1/ingest/batch
SOURCE_COOLDOWN_CHECK_URL=https://<STAGING_WORKER_HOST>/v1/crawl/authorize
INGESTION_HMAC_SECRET=<STAGING_INGESTION_HMAC_SECRET>
CONTACT_ENCRYPTION_KEYS=<STAGING_VERSIONED_KEYRING_JSON>
CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION=<ACTIVE_KEY_VERSION>
```

Treat the HMAC value and contact keyring as secrets. The runner sends them only
to the official Scrapy Cloud HTTPS endpoint, uses warning-level crawler logging,
and never prints the request payload. The official-site pipeline fails closed
if a required setting is absent, submits signed idempotent batches, stores only
receipt metadata as Scrapy Cloud items, and stops after a spooled ingestion
failure.

Open the deploy gate only in the controlled operator shell:

```powershell
$env:RUNNER_MODE="zyte_student_active"
$env:SCRAPY_CLOUD_DEPLOY_ENABLED="true"
$env:LIVE_CRAWL_ENABLED="false"
$env:ZYTE_STUDENT_ENTITLEMENT_CONFIRMED="true"
$env:SCRAPY_CLOUD_MAX_UNITS="1"
$env:ZYTE_API_ENABLED="false"
$env:PAID_SERVICES_ALLOWED="false"
$env:MAX_EXTERNAL_MONTHLY_SPEND_AUD="0"
$env:ALLOW_EXTRA_SCRAPY_UNITS="false"
$env:ENABLE_AMAZON="false"
$env:ENABLE_ALIBABA="false"
$env:ENABLE_1688="false"
$env:ENABLE_SEARCH_DISCOVERY="false"
$env:ENABLE_BUSINESS_REGISTRY="false"
$env:ENABLE_OFFICIAL_WEBSITE="true"
$env:INGESTION_ENDPOINT_URL="https://<STAGING_WORKER_HOST>/v1/ingest/batch"
$env:SOURCE_COOLDOWN_CHECK_URL="https://<STAGING_WORKER_HOST>/v1/crawl/authorize"
# INGESTION_HMAC_SECRET, CONTACT_ENCRYPTION_KEYS, and
# CONTACT_ENCRYPTION_ACTIVE_KEY_VERSION must already be loaded from the
# approved ignored local environment.
$env:SCRAPY_CLOUD_PROJECT_DIR="."
$env:SHUB_APIKEY=$env:SCRAPY_CLOUD_API_KEY
uv run --directory crawler python -m sellerintel.runtime.scrapy_cloud validate
uv run --with shub==2.18.1 --directory crawler python -m sellerintel.runtime.scrapy_cloud deploy --version solo-v1
Remove-Item Env:SHUB_APIKEY
uv run --directory crawler python -m sellerintel.runtime.scrapy_cloud start-smoke --job-id controlled-no-network-smoke
```

The returned run ID is safe to use for status and cancellation:

```powershell
uv run --directory crawler python -m sellerintel.runtime.scrapy_cloud status <PROJECT/SPIDER/JOB>
uv run --directory crawler python -m sellerintel.runtime.scrapy_cloud cancel <PROJECT/SPIDER/JOB>
```

Verify one started job, `units=1`, completion, and one controlled cancellation.
The smoke spider uses a `data:` URL and cannot crawl a network source. There must
be no schedule. Restore `SCRAPY_CLOUD_DEPLOY_ENABLED=false` and
`RUNNER_MODE=development_locked` after the check.

## 7. One Approved Official-Site Staging Smoke

This is the only step that temporarily opens the live gate. Obtain a seed URL
approved by the operator, confirm robots/policy suitability, and use a page
budget no greater than eight and depth no greater than two:

```powershell
$env:LIVE_CRAWL_ENABLED="true"
uv run --directory crawler python -m sellerintel.runtime.scrapy_cloud start-official --seed-url <APPROVED_HTTPS_SEED> --page-budget 8 --max-depth 2
$env:LIVE_CRAWL_ENABLED="false"
```

Immediately reset the live flag even if the command fails. Verify the run status,
signed ingestion, compact evidence, search, masked dashboard display, duplicate
handling, crawl status, and CSV export. Stop on robots denial, CAPTCHA, explicit
block, unexpected domain navigation, ingestion spool, or charge warning.

For a seller-linked acceptance test, open the seller directory, use the
operator-initiated search link to verify a credible public official domain, then
choose **Crawl verified website**. The New Crawl form must contain exactly one
HTTPS URL and the UUIDv7 seller ID. The Worker rejects unknown sellers and a
domain that conflicts with an already stored official domain. Do not paste a
search-result page URL; only the verified official company URL is a seed.

The operator API caps each run at 100 planned official pages. The spider's page
budget applies per domain; the Scrapy Cloud response cap adds only two bounded
responses per domain for robots and sitemap handling. Selected contact types
are enforced by the spider. A visible CAPTCHA, short challenge page, HTTP
401/403/407/429/451, robots denial, or explicit block must produce a blocked
operator status and must not trigger provider rotation.

Migration `operations/0006_crawl_run_contacts.sql` must be applied before the
new Worker is deployed. Verify `crawl_run_contacts` exists, repeated ingestion
does not increase the run's unique contact count, and no raw contact value is
present in the operations database.

## 8. Production Promotion

Production is allowed only after staging and backup verification pass. Use the
production templates and distinct D1 databases, Access audience, allowed-email
secret, and ingestion HMAC secret. Repeat the four migrations, Worker deploy,
Access checks, dashboard build/deploy, and backup in the same order.

Point Scrapy Cloud job settings at the production Worker endpoint and production
HMAC secret only after production health succeeds. Rotate the prior staging HMAC
if it is no longer needed. After authenticated queue acceptance passes,
`LIVE_CRAWL_ENABLED=true` may be used only with
`OPERATOR_CRAWL_ENABLED=true`, the one-active-slot constraint, `units=1`, and
the bounded operator API. A one-minute queue-pump cron may advance persisted
operator requests; it must never create broad crawl requests by itself.

## 9. Final Verification And Rollback

Record deployed commit hashes, Worker version, Pages deployment, D1 migration
versions, Access application audience, Scrapy Cloud deploy/job IDs, and backup
manifest path without recording secret values. A failed final gate rolls back
code to the prior commit while preserving databases. Stop specific jobs through
the runner CLI and leave all provider-selection automation disabled.

Rolling back application code does not require deleting
`crawl_run_contacts`. Leave the table and rows in place; older Workers ignore
them. If the linkage feature must be disabled, deploy a forward code change that
removes the seller-linked form action while preserving run/contact audit rows.
