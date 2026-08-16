# Solo Mode v1 Production Report

> Historical local-release checkpoint (2026-08-04). Cloudflare staging was
> deployed on 2026-08-16; see `STAGING_DEPLOYMENT_REPORT.md` for current hosted
> state and remaining gates.

Report date: 2026-08-04
Implementation checkpoint: `e6fac2d`
Authoritative specification: `SELLER_INTELLIGENCE_MASTER_SPEC.md`

## Final Outcome

Solo Mode v1 is implementation-complete and verified locally. The repository is
at the single consolidated external-credentials and hosted-resource boundary.
No Cloudflare resource, Scrapy Cloud deployment/job, live crawl, production
secret, R2 object, commit push, or paid service was created or used.

The code is ready for the operator-led staging sequence in
`DEPLOYMENT_RUNBOOK.md`. It is not yet a deployed production system because the
hosted resource IDs, routes, Access values, ingestion secrets, Scrapy Cloud
project credential, and one approved seed are unavailable.

## Fully Working Locally

- A real Scrapy official-site spider accepts explicit seeds, obeys robots.txt,
  stays on the approved domain, discovers bounded contact/about/company and
  sitemap pages, canonicalizes/deduplicates URLs, and stops after explicit
  blocks.
- Strict page, depth, domain-concurrency, delay, timeout, retry, response-size,
  cookie, private-host, and provider-selection gates are enforced.
- Email, phone, WhatsApp, and WeChat extraction, normalization, masked compact
  evidence, confidence scoring, deterministic seller/contact/source records,
  and basic entity resolution are implemented.
- Compact D1 evidence includes source/canonical URL, page title, masked snippet,
  content hash, `detected_at`, `last_seen_at`, schema version, and parser version.
- Signed HMAC ingestion is deterministic, idempotent, replay-protected, schema
  validated, source-policy checked, bounded, retried, and locally spooled.
- Worker APIs implement health, ingestion, seller list/detail, masked contacts,
  duplicate review, crawl runs, FTS search, and masked seller/contact CSV export.
- The four D1 partitions and migrations are wired for core, contacts,
  operations, and history.
- The static dashboard uses Worker APIs and implements seller list/detail,
  contacts, duplicate review, crawl status, search, CSV export, and loading,
  empty, failure, retry, and locked states.
- Hosted dashboard routes require a cryptographically verified Cloudflare Access
  JWT: signature, issuer, audience, expiry, and exact allowed email. A missing
  `APP_ENV` cannot activate the local bypass.
- The local runner, durable spool replay, offline Docker artifact, four-D1
  checksummed backup/restore utility, no-network cloud spider, and controlled
  Scrapy Cloud deploy/start/status/cancel CLI are implemented.
- Cloud official-site jobs enable the signed ingestion pipeline only for that
  explicit job. The scheduler request contains no ingestion secret, accepted
  cloud items are reduced to receipts, and an ingestion spool stops the spider.

## Deployment Status

| Target | Status | Evidence |
|---|---|---|
| Local Python crawler | Working and verified | 97 tests; local and Docker fixture smoke |
| Local Worker and four D1 databases | Working and verified | Real local Wrangler migrations and signed integration |
| Local dashboard | Built and tested | 6 dashboard tests; static production build |
| Cloudflare staging | Not deployed | External D1 IDs, routes, Access values, and secrets missing |
| Cloudflare production | Not deployed | Production resources and secrets missing |
| Zyte Scrapy Cloud code | Ready locally | Runner/pipeline/no-network tests pass |
| Zyte no-network hosted smoke | Not deployed or run | Project ID and Scrapy Cloud API credential missing |
| Live official-site smoke | Not run | No explicitly approved seed; live gate remains false |

## Validation Results

All final pass claims below correspond to commands actually executed.

| Gate | Command | Result |
|---|---|---|
| Python lint | `uv run ruff check crawler` | PASS, no findings |
| Python types | `uv run mypy crawler/sellerintel crawler/tests` | PASS, 84 source files |
| Python tests | `uv run pytest crawler/tests` | PASS, 97 tests |
| Extractor coverage | `uv run pytest crawler/tests/test_contact_extractors.py --cov=crawler/sellerintel/extractors --cov-report=term-missing` | PASS, 5 tests, 95.36% coverage, 90% gate |
| Python security | `uv run bandit -r crawler/sellerintel` | PASS, 0 findings |
| Python dependencies | `uv run pip-audit` | PASS, no known vulnerabilities |
| TypeScript lint | `npm.cmd run lint` | PASS |
| TypeScript types | `npm.cmd run typecheck` | PASS; Next route types generated before `tsc` |
| Unified web tests | `npm.cmd run test` | PASS, 32 tests in 5 files |
| Worker tests | `npm.cmd run test --workspace @seller-intelligence/worker-api` | PASS, 26 tests in 4 files |
| Dashboard tests | `npm.cmd run test --workspace @seller-intelligence/dashboard` | PASS, 6 tests |
| Worker health | `npm.cmd run health:worker` | PASS, 5 tests |
| Dashboard build | `npm.cmd run build` | PASS, 7 user-facing routes plus the not-found route |
| Production npm audit | `npm.cmd run audit:prod` | PASS, 0 vulnerabilities |
| Docker build | `docker build -t seller-intelligence-crawler:solo-v1 .` | PASS from final crawler tree |
| Docker offline smoke | `docker run --rm --network none seller-intelligence-crawler:solo-v1` | PASS, 8 pages, 4 contacts, 0 blocks/errors |
| Local fixture runner | `uv run --directory crawler python -m sellerintel.runtime.local` | PASS, `dry_run_complete`, 8 pages, 4 contacts |
| Diff validation | `git diff --check` | PASS |
| Secret-pattern scan | Staged diff credential-pattern scan | PASS, no credential material found |

The first production npm audit attempt could not reach npm's advisory endpoint
inside the restricted sandbox. The required read-only retry with network access
completed successfully with zero vulnerabilities.

The in-app browser automation backend was unavailable. Automated dashboard tests,
route-aware TypeScript checks, and the production static build passed; interactive
desktop/mobile staging verification remains in the deployment runbook.

## Local End-To-End Proof

The real local Wrangler runtime was migrated with four core migrations, two
contacts migrations, four operations migrations, and two history migrations.
A temporary local-only HMAC value was used without being committed or printed.

The real fixture crawler submitted nine signed batches through the local Worker:

- eight official-site pages crawled;
- four contacts extracted: email, phone, WhatsApp, and WeChat;
- one seller returned through list, detail, and FTS search;
- compact masked evidence returned from seller detail;
- duplicate review returned an empty valid result;
- crawl completion returned nine requests, nine successful responses, and four
  verified contacts;
- seller and contact CSV exports were valid and masked;
- no spool, explicit block, crawler error, raw WhatsApp number, or residual
  unmasked evidence was observed.

Temporary `.dev.vars`, local Wrangler state, crawl output, build output, and test
artifacts were removed after verification.

## D1 Migration Status

| Database | Local | Staging | Production |
|---|---|---|---|
| Core | Applied and verified | Not created/applied | Not created/applied |
| Contacts | Applied and verified | Not created/applied | Not created/applied |
| Operations | Applied and verified | Not created/applied | Not created/applied |
| History | Applied and verified | Not created/applied | Not created/applied |

Migration tests validate all four local/staging/production Wrangler binding
definitions, migration directories, SQLite compatibility, strict contracts, and
the absence of an R2 launch binding.

## Dashboard Status

The dashboard is API-connected and production-buildable. Contacts and CSV remain
masked; no ingestion, provider, Cloudflare, D1, or Access secret is browser
visible. Cloudflare Access is implemented at the Worker validation boundary but
cannot be externally verified until the dashboard/API hostnames, team domain,
audience, and allowed email are supplied.

## Backup Status

The backup utility exports all four named remote D1 databases through Wrangler,
writes a versioned SHA-256 manifest, validates all database mappings and files,
and requires explicit restore and production confirmations. Four backup/restore
tests pass. No remote backup was run because no hosted D1 database exists. Full
HTML/screenshot R2 archives remain deliberately deferred.

## Zyte One-Unit Status

The operator fact confirms one free GitHub Student Scrapy Cloud unit is applied,
no paid Scrapy Cloud subscription is enabled, and charges are possible only if
another unit is added or Zyte API is used.

Repository enforcement is complete:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
MAX_EXTERNAL_MONTHLY_SPEND_AUD=0
ALLOW_EXTRA_SCRAPY_UNITS=false
ENABLE_AMAZON=false
SCRAPY_CLOUD_DEPLOY_ENABLED=false
LIVE_CRAWL_ENABLED=false
```

The runner validates those controls, rejects reserved/sensitive job arguments,
uses only official HTTPS API hosts, sends `units=1`, and has no automatic
provider switch. Deployment, hosted start/status/completion/cancellation, and
the one approved live seed remain unverified because external values are
missing. No Zyte API call was made.

## Cloudflare Status

The current process reported `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` as set, but `wrangler whoami` did not complete in the
current CLI environment, so authentication and permissions are unverified.
Eight hosted D1 values, zone/routes, Worker and Pages targets, Access values, and
secrets remain missing. No resource was listed, created, migrated, or deployed.

Staging/production environment and Wrangler examples contain placeholders only.
They bind exactly four D1 databases, require Access, contain no R2 binding, and
keep all charge/live/provider flags locked.

## Security Status

- Access header presence is not trusted; JWT cryptography and claims are checked.
- Missing hosted Access configuration fails closed.
- Ingestion uses separate HMAC authentication and an exact-path Access bypass;
  private query, health, search, and CSV routes must remain Access-protected.
- External payloads are schema validated and writes are idempotent.
- Contact evidence, list responses, logs, cloud items, and CSV are masked.
- Scrapy Cloud transport is restricted to `app.zyte.com` and `storage.zyte.com`
  over HTTPS.
- Browser profiles, cookies, credentials in seeds, local/private seed hosts,
  CAPTCHA bypass, provider rotation, and automatic fallback are rejected or
  absent.
- No secret value is present in committed examples, reports, or staged diff.

## Charge-Safety Status

**SAFE** in the current repository and runtime state.

- Exactly one unit is hard-coded in every Scrapy Cloud job request.
- Zyte API, extra units, paid services, paid add-ons, paid Actions minutes,
  credit runner, Amazon, Actions crawler fallback, and automatic switching are
  disabled.
- Cloudflare deploy/migration workflows remain manual fail-closed handoffs.
- The Zyte workflow is manual, confirmation-gated, environment-gated, and has no
  schedule.
- No crawler, cloud deployment, provisioning, upgrade, R2, or periodic job runs
  automatically.

The operator must continue to refuse any extra Scrapy Cloud unit or Zyte API
activation. External Cloudflare quota/plan state cannot be proven from the
repository and must be checked before deployment.

## Exact Remaining Blocker

The missing values are consolidated in `OPERATOR_INPUTS_REQUIRED.md`:

- verified Cloudflare CLI access and zone;
- four staging and four production D1 names/IDs;
- staging/production Worker routes and Pages projects/hosts;
- dashboard origins and approved ingestion source domains;
- one allowed Access email, team domain, and staging/production audiences;
- distinct staging and production ingestion HMAC secrets;
- the entitled Scrapy Cloud project ID and Scrapy Cloud API credential;
- one explicit, policy-reviewed HTTPS seed for the bounded staging smoke.

GitHub deployment secrets are optional for the first operator-led release.
Zyte API keys, R2, crawler fallback, and paid-service values are prohibited or
deferred.

## Exact Next Command

After the operator completes the boundary checklist, run:

```powershell
npx.cmd wrangler whoami
```

Then begin **Prepare Staging** in `DEPLOYMENT_RUNBOOK.md`. Do not skip directly
to Zyte or production.

## Git Status And Checkpoints

Validated implementation checkpoints:

- `344afbb` - adopt Solo Mode v1 delivery scope
- `f38c8bf` - complete Solo v1 official-site crawling
- `427e9e4` - add Solo dashboard Worker APIs
- `b93cccd` - connect Solo dashboard to Worker APIs
- `e71eced` - prepare one-unit cloud runner and D1 backups
- `e6fac2d` - harden Solo v1 production handoff

Earlier stabilization checkpoint: `e86661b`.

No commit was pushed. The commit containing this report is recorded in the final
operator response because a file cannot contain its own Git hash. The working
tree is expected to be clean after that report commit.

## Verdict

- **Fully working:** Solo v1 engine, local/Docker runner, extraction,
  normalization, entity resolution, compact evidence, signed ingestion, four
  local D1 partitions, query/export APIs, API-connected dashboard, Access JWT
  validation, backup tooling, and one-unit cloud control code.
- **Deployed:** nothing.
- **Ready for one-unit Zyte test deployment:** code/config yes; externally no,
  pending project ID and Scrapy Cloud API credential.
- **Ready for Cloudflare staging:** code/config yes; externally no, pending
  hosted resources, routes, Access values, and secrets.
- **Ready for production:** no; staging, hosted one-unit smoke, bounded approved
  crawl, Access, migrations, dashboard, and backup must pass first.
- **Remaining feature work before staging:** none in Solo v1 scope.
- **Remaining blocker:** consolidated external operator inputs only.
