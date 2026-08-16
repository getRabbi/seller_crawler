# Solo Mode v1 Staging Deployment Report

Report date: 2026-08-17

## Outcome

The requested staging crawler path is complete. Cloudflare infrastructure,
private Scrapy Cloud ingestion settings, a controlled public seed, one-unit
bounded crawling, signed ingestion, D1 persistence, and a checksummed four-D1
backup were verified end to end.

All Cloudflare resources are in `Uprightseo24@gmail.com's Account`
(`b63e426431b63ec9db33d7c421d01b42`) and the active `scalemyprints.com` zone.
Repository defaults are locked again: live crawl and deploy are false, runner
mode is `development_locked`, maximum units is one, and Zyte API and paid
services remain disabled.

This is not production approval. Authenticated dashboard acceptance, a restore
into disposable staging databases, and production promotion remain separate
gates.

## Deployed Resources

| Resource | Staging value | Verified state |
|---|---|---|
| Core D1 | `seller-intelligence-core-staging` (`b68cd00c-c6eb-40e4-a459-dc1e1236975d`) | 4 migrations; seed seller schema/parser valid |
| Contacts D1 | `seller-intelligence-contacts-staging` (`e4ec7f9a-4a09-4ef2-9cf5-304b590b6cfc`) | 2 migrations; 4 encrypted/masked synthetic contact types |
| Operations D1 | `seller-intelligence-operations-staging` (`d1f08206-0a63-41ae-b8ae-994c09a2c8d7`) | 4 migrations; final run completed and linked |
| History D1 | `seller-intelligence-history-staging` (`db0be23b-dab4-4a58-82bc-95c901c3984a`) | 2 migrations; history stage accepted |
| Worker | `seller-intelligence-api-staging` | Four D1 bindings, two secret bindings, exact seed allowlist |
| Worker route | `api-stg.scalemyprints.com/*` (`907f234acf374bc89b4ddb9a86bc7de3`) | Active on proxied originless DNS |
| Dashboard Pages | `seller-intelligence-staging` | Deployment `66fecfb0-0dc7-4406-b5db-0bd9af372316` succeeded |
| Dashboard domain | `dashboard-stg.scalemyprints.com` | Active and Access-protected |
| Seed Pages | `seller-intelligence-seed-staging` | Deployment `ee706dc5-268d-463b-8880-98d5e2360f33` succeeded |
| Seed domain | `seed-stg.scalemyprints.com` | Active DNS-only CNAME to Pages; public, synthetic, noindex |
| Dashboard Access | `seller-intelligence-dashboard-staging` (`b2149f98-8614-48aa-b61a-e28e30e00f90`) | Exact-email Allow |
| API Access | `seller-intelligence-api-staging` (`be349f58-b446-4820-9d31-79a5b79617f9`) | Exact-email Allow |
| Ingest Access | `seller-intelligence-ingest-staging` (`c48c05f7-d9c9-449c-a7f4-5f162a70c392`) | Exact-path Bypass; HMAC still required |
| Pages root Access | `seller-intelligence-pages-root-staging` (`72f64aca-23ea-42de-9da9-dff8bf857b68`) | Exact-email Allow |
| Pages preview Access | `seller-intelligence-pages-previews-staging` (`97dc0b04-835b-4a6d-afb0-6cc2763c2b59`) | Wildcard preview Allow |
| Scrapy Cloud project | `871778` | Deploy `solo-v1-staging-20260817-1`; 2 spiders |
| Hosted no-network smoke | `871778/2/1` | 1 unit, 1 response, 1 item, 0 errors |
| Cancellation smoke | `871778/2/2` | Terminal `cancelled`, 0 errors |
| Final official-site smoke | `871778/1/3` | 1 unit, 6 responses, 2 receipts, 0 errors |

The seed CNAME is DNS-only intentionally. Direct custom-host Pages routing was
stable, while an additional proxied layer produced intermittent `522` errors.
The fixture exposes no private origin; its target is still Cloudflare Pages.

## Final Crawl Evidence

- Seed: `https://seed-stg.scalemyprints.com/contact/`.
- `robots.txt` explicitly allows `/`; the fixture sends `X-Robots-Tag:
  noindex, nofollow` and restrictive security headers.
- Job `871778/1/3` used crawler version `solo-v1-staging-20260817-1`, exactly one
  unit, page budget 4, depth 2, and finished via `closespider_pagecount`.
- The job received 6 responses, stored 2 compact receipt-only items, and had 0
  errors, 0 blocked/CAPTCHA signals, 0 spooled batches, and 0 rejected batches.
- Job settings explicitly kept Zyte API, paid services, and extra units off.
  `INGESTION_HMAC_SECRET` was absent from the scheduling request.
- Operations D1 records crawl run `01a00bc8-aaf3-7b2a-85e1-2706541d7571` as
  `completed`, linked to `871778/1/3`, with 6 requests/responses, 2 candidates,
  4 verified contacts, and 0 blocked/errors.
- Three idempotency keys for that crawl returned `202`: two page batches and one
  completion batch.
- Core D1 has one active seller for the seed domain with schema version 1 and
  parser `official-site-v1`; no `None` timestamp remains.
- Contacts D1 has one each of email, phone, WhatsApp, and WeChat. Every row has
  ciphertext, a masked display value, schema version 1, parser
  `contact-extractor-v1`, and `outreach_eligible=0`. Values were not printed.
- Post-run checks found zero running, pending, or periodic Scrapy Cloud jobs.

Run `871778/1/1` is retained as failure evidence. It exposed two integration
defects: Cloudflare rejected the default Python urllib User-Agent, and the cloud
runner did not set an observation timestamp. The crawler now sends an explicit
product User-Agent, creates a UTC observation timestamp, emits only safe receipt
metadata on non-retryable rejection, forwards explicit deploy versions, and
persists `SHUB_JOBKEY`. Runs `871778/1/2` and `871778/1/3` then completed with
zero errors; the latter verifies the D1 job link.

## Cloudflare Verification

- The repository `.env` account ID and the authenticated account were checked
  before every Cloudflare mutation, and each affected resource was read back
  from the same permitted account.
- The Worker binding `INGESTION_ALLOWED_SOURCE_DOMAINS` is exactly
  `seed-stg.scalemyprints.com`.
- Unauthenticated Worker health and dashboard requests redirect to Access.
- An unsigned invalid request to `/v1/ingest/batch` returns Worker JSON `400`,
  confirming the exact ingest path bypasses interactive Access but still
  enforces ingestion authentication.
- The public seed returned stable `200` responses after DNS-only routing and its
  Pages domain reports `active`.
- The default and immutable dashboard Pages hostnames remain Access-protected.

## Backup And Recovery

A checksummed staging backup is retained under the ignored path
`.sellerintel/backups/staging-20260816T181901Z/manifest.json`.

- The manifest has schema version 1 and exactly four non-empty SQL exports.
- All four SHA-256 values match their files.
- Cloudflare D1 cannot export FTS5 virtual tables. The core export therefore
  includes all seven canonical core tables and excludes only the rebuildable
  `seller_search_fts` index.
- Restore mapping, explicit-confirmation, production double-confirmation, and
  checksum-failure guards are covered by tests.
- No restore was run over active staging. For a recovery drill, restore into
  disposable matching databases and then run
  `database/queries/rebuild_core_fts_after_restore.sql`.

Rollback paths:

- Redeploy a prior Worker or Scrapy Cloud version without changing D1 data.
- Roll Pages back to a known-good deployment.
- Decommission the synthetic seed by removing its exact custom-domain
  association and DNS record after recording both targets.
- After seed decommission, remove it from the Worker ingestion allowlist and
  redeploy the Worker.
- D1 schema rollback remains forward-only; restore data from the checksummed
  export or add a forward migration.
- Rotate Worker/Scrapy Cloud HMAC settings together if compromise is suspected.

## Security And Quota Review

- HMAC and provider credentials remain only in ignored `.env`, Worker secret
  storage, and private Scrapy Cloud settings. Their values were not committed.
- The seed contains reserved synthetic data only. No real personal contact was
  crawled or logged.
- Rejection handling now prevents Scrapy from logging raw item payloads.
- The public seed is noindex/nofollow, has no forms, and is not outreach-eligible.
- No CAPTCHA bypass, cookie/credential harvesting, source rotation, marketplace
  adapter, Zyte API, R2, paid service, second unit, or periodic job was used.
- All Scrapy Cloud jobs were sequential and each requested exactly one unit.

## Final Verification

- Python: `100 passed`; Ruff clean; strict mypy clean across 85 source files.
- TypeScript: `32 passed`; ESLint and TypeScript checks clean.
- The Next.js static production build completed for all dashboard routes.
- Bandit, `pip-audit`, and the production npm audit reported no known
  vulnerabilities.
- All four ignored backup exports are non-empty and match the SHA-256 values in
  the schema-version-1 manifest.
- Final read-back reconfirmed the permitted Cloudflare account and zone, a
  successful seed Pages deployment, the expected Worker route, the finished
  Scrapy Cloud job, and zero running or pending jobs.
- Five consecutive seed requests returned `200`; `robots.txt` returned `200`,
  Access-protected API/dashboard requests returned `302`, and unsigned ingest
  returned `400`.

## Remaining Gates

1. Complete one authenticated browser acceptance session for dashboard routes,
   search, masked contacts, retry/empty/error states, and CSV exports.
2. Restore the backup into disposable staging D1 databases and rebuild FTS;
   never overwrite active staging for a drill.
3. Keep production promotion blocked until production-specific secrets,
   databases, hostnames, Access audiences, and operator approval are ready.
