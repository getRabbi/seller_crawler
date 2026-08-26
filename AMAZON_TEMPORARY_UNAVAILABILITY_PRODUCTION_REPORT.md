# Amazon Temporary-Unavailability Production Report

Date: 2026-08-26 (Asia/Dhaka)  
Release commit: `25c3fb9c66e552a54345d38372dd308bcb242553`  
Branch: `main`

## Verdict

The repeated Amazon HTTP 503 handling fix is implemented, tested, CI-green, and
promoted to staging and production. A retry-exhausted 503 is now a temporary
source outage with a persistent marketplace cooldown, not a successful empty
seller search. Retries during the active cooldown do not launch a Scrapy Cloud
job. The dashboard shows a human-readable cause and retry instruction and no
longer claims that official-site enrichment was unavailable when seller
discovery itself did not complete.

No CAPTCHA bypass, proxy or provider rotation, request-identity change, paid
service, Zyte API, extra unit, or automatic provider switch was added. No live
Amazon request was launched for release acceptance.

## Incident confirmed

Production operator run `01a03d1c-eb50-7371-8b5c-34c599cafa19`, Scrapy Cloud
job `871778/3/9`, finished with zero sellers after three responses: robots HTTP
200 and the Amazon search HTTP 503 twice (one initial request and the one safe
retry). The previous job `871778/3/8` had the same response pattern. Neither run
contained a 401, 403, 429, CAPTCHA, or explicit source-block signal.

The prior code counted the final 503 only as `crawler_errors`, then the Worker
added `official_website_unavailable`. The Amazon spider also called the signed
preflight with the default `official_site` adapter, so it checked
`official_site:amazon.com` instead of the registry key it persisted,
`amazon:amazon.com`.

## Production behavior

- The Amazon adapter still retries eligible HTTP failures exactly once.
- A final HTTP 503 stops that Amazon stage and stores versioned source evidence.
- The existing operations `source_registry` receives an idempotent
  `amazon:<marketplace>` upsert with a one-hour cooldown. A longer valid
  `Retry-After` is honored up to the existing seven-day maximum.
- The crawler completion status remains `cooldown`; an explicit challenge/block
  remains the separate `paused_by_policy`/`blocked` path.
- The signed authorization route accepts only `official_site` and `amazon` and
  reads the corresponding allowlisted registry key.
- Before claiming/launching external work, the Worker checks the active Amazon
  cooldown. It records `amazon_temporarily_unavailable`, the ISO retry time, and
  an audited terminal cooldown without calling Scrapy Cloud.
- A newly observed 503 outcome transitions directly to cooldown and never adds
  `official_website_unavailable`.
- New Crawl and Crawl Health translate warning codes into operator-facing text.
  Historical zero-seller `crawler_errors` runs are labelled incomplete source
  failures and their misleading website warning/activity is suppressed in the
  presentation layer without rewriting audit history.

Master specification version `2.1.4` authorizes this cross-cutting refinement.
The existing ingestion and source-registry contracts are sufficient, so no D1
migration was required.

## Verification evidence

| Gate | Result |
|---|---|
| Python | 156 tests passed; Ruff and strict mypy passed |
| Extractors | 8 tests passed; 95.03% coverage (90% required) |
| Web | 85 tests passed; ESLint and TypeScript passed |
| Worker health | 5/5 tests passed |
| Security | Bandit found zero issues; pip-audit and production npm audit found no known vulnerabilities |
| Dashboard | Production static build passed; New Crawl and Crawl Health returned HTTP 200 through a local static server |
| Container | Docker no-network smoke returned `dry_run_complete`, 8 fixture pages, 4 contacts, 0 blocks/errors |
| CI | Python run `32950795815` and Web run `32950795787` passed for the release commit |
| Scrapy Cloud | Project `871778`, four spiders, artifact `25c3fb9c66e552a54345d38372dd308bcb242553` |
| Cloud smoke | Job `871778/2/10` finished at the one-page close limit and stored one `{smoke: ok, network: none, units: 1}` item; active jobs returned to zero |
| Staging Worker | Version `21549226-a10f-448f-b612-cbb38059e8e9`, artifact pin read back at 100% |
| Staging Pages | Deployment `f1cca8ee-765e-4599-bafb-4f4990b3a76f`, production branch `main`, source `25c3fb9` |
| Production Worker | Version `e57ebaa4-42ad-4b92-b45f-a3ccf1d07cb5`, artifact pin read back at 100% |
| Production Pages | Deployment `cf633d70-859a-43e1-b329-21fdc15687d4`, production branch `main`, source `25c3fb9` |
| Edge boundary | Staging and production private dashboard/API returned Access 302; dashboard-origin CORS preflight returned 204 |

The in-app browser connector was unavailable. No standalone browser or
credential workaround was used; rendered component tests, production builds,
local HTTP responses, Pages deployment read-back, custom-domain Access, and
CORS checks supplied UI/deployment evidence.

A signed production cooldown probe using the local ingestion secret returned
401 and failed closed before nonce persistence because that local value did not
match the deployed Worker secret. No secret was exposed and no alternate
credential path was attempted. The exact route behavior is covered by three
Worker cooldown tests plus crawler-client tests; production operator launches
receive the matching secret directly from the Worker secret binding.

## Security, quota, and recovery

Every Cloudflare mutation was guarded immediately before execution and verified
afterward against only `Uprightseo24@gmail.com's Account`, account ID
`b63e426431b63ec9db33d7c421d01b42`. The forbidden account ID
`5c06252f18014fafe3ceed6acd45e82a` was not used. No production secret or raw
contact value was printed, logged, committed, or added to a public browser
bundle.

Quota impact is one source and source-registry upsert only after a final 503 and
fewer external launches while cooldown is active. The one-unit ceiling remains
enforced; the only release job was the no-network smoke. Paid budgets remain
zero and D1 schema/storage topology is unchanged.

Application rollback is to redeploy production Worker version
`7c022ade-4b04-4cf9-ac33-7e669317a26d`, Pages deployment
`5326eb15-830f-4102-b87f-71d0824363ac`, and crawler artifact
`294a37f438e82101ccf1b253cc3be9d4245b8614`. Persisted cooldowns should expire
naturally; an early change requires an audited operations procedure. Never
delete or rewrite canonical or historical records as part of rollback.
