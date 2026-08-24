# Official-domain and contact enrichment production report

Date: 2026-08-24 (Asia/Dhaka)

## Outcome

The bounded production flow now resolves an existing Amazon seller identity to
its verified official domain and extracts supported public business contacts
from that official site. The final acceptance seller, `Watersybottle`, is linked
to `watersybottle.com` and has five active contact records: two email channels,
two phone channels, and one public contact-form channel. This report contains no
unmasked contact value, credential, Access token, cookie, or ingestion secret.

The first production diagnostic run proved domain resolution but exposed two
issues: corroborated contacts on a verified dealer/wholesale page scored below
the storage threshold, and consecutive stages reused a completion idempotency
key. Both issues were fixed, tested, deployed, and re-verified in production.

## Immutable release identifiers

- Crawler source and Scrapy Cloud artifact:
  `57266b132b94c15b1cf519939063555dc1ebe65d`
- Worker contact-summary source:
  `5b6b4969aefd7b013d5d152ad54c87035312a010`
- Production Worker version:
  `7a6a78a9-9a37-4220-b099-e95f7ccee77e`
- Scrapy Cloud project: `871778`; deployed spiders: 4; maximum units: 1
- Production Pages immutable deployment:
  `https://43be5a7d.seller-intelligence-production.pages.dev`
- Production dashboard: `https://dashboard.scalemyprints.com`
- Production API: `https://api.scalemyprints.com`

The dashboard source did not change in this corrective release. Its earlier
production build already includes responsive layouts, required-field labels,
contact-form labels, crawl-run CSV export, and the Access-session recovery link.

## Cloudflare account safety

Every production Cloudflare mutation was gated before and after against the
repository `.env` and authenticated Wrangler identity.

- Allowed account: `b63e426431b63ec9db33d7c421d01b42`
- Forbidden account `5c06252f18014fafe3ceed6acd45e82a`: absent
- Production Worker and affected version were verified in the allowed account
- Cloudflare Access returned a valid production API application session
- No Cloudflare credential or Access JWT was printed or stored in the repository

## Live production evidence

### Domain-resolution diagnostic

- Operator run: `01a032f7-2ec9-71a1-ad6f-754ac986b239`
- Domain-verification job: `871778/4/4`
- Initial enrichment job: `871778/1/23`
- Result: the exact canonical seller ID was preserved and the verified domain
  `watersybottle.com` was attached
- The old enrichment release returned `no_public_contacts_found`; public source
  evidence and a local masked extractor check showed this was a false negative,
  which triggered the corrective release rather than being reported as success

### Final contact-enrichment acceptance

- Operator run: `01a0330d-f86e-7d7c-8741-03af5200f4c3`
- Scrapy Cloud job: `871778/1/24`
- Mode: `known_websites`, linked to the existing canonical seller
- Status/stage: `completed` / `completed`
- Enriched sellers: 1
- Run-linked contacts: 5
- Warnings: 0
- Errors: 0
- Active/queued crawls after completion: 0 / 0
- Recent failures: 0

Authoritative Scrapy Cloud metadata reported:

- state `finished`, reason `closespider_pagecount`
- exact artifact `57266b132b94c15b1cf519939063555dc1ebe65d`
- one unit
- 19 requests and 19 responses
- eight HTTP 200 responses, nine canonical-host redirects, and two expected
  optional-path HTTP 404 responses
- five accepted ingestion batches
- no ingestion rejection, completion rejection, policy block, crawler error,
  warning/error log event, completion HTTP 409, or deprecated pipeline signature

### Canonical contact aggregates

The production API, Seller Directory search, seller detail, crawl-run summary,
and crawl-run seller snapshot now all report contact count 5 and contact types
`email`, `phone`, and `contact_form`.

Safe D1 aggregates show:

| Contact type | Parser | Classification | Active records |
| --- | --- | --- | ---: |
| `contact_form` | `contact-form-extractor-v1` | `business_public_contact_form` | 1 |
| `email` | `contact-extractor-v1` | `business_verified` | 1 |
| `email` | `contact-extractor-v1` | `business_public_manual_review` | 1 |
| `phone` | `contact-extractor-v1` | `business_verified` | 2 |

All five records have `schema_version=1`. Operations D1 contains five distinct
contact links for this run, one seller, and no plaintext contact value. The
verification queries wrote zero rows.

## Export and UI verification

- Crawl Runs API contains the final acceptance run with status `completed` and
  contact count 5.
- Crawl Runs CSV contains the same run and includes bounded fields for mode,
  job type, seller counts, `contacts_found`, status, stage, provider job ID,
  warnings, and error metadata.
- The production dashboard build was inspected at desktop width and 390x844
  mobile width. The New Crawl form stacks without apparent horizontal overflow,
  required fields remain visible, contact types wrap correctly, and the contact
  form label is human-readable.
- Cloudflare Access remains in front of both production dashboard and API.

## Tests and security gates

- Python: 151 tests passed
- Corrective Python tests: 15 passed
- Worker/dashboard: 70 tests passed
- Contact-summary Worker tests: 29 passed
- Ruff: clean
- Strict mypy: clean
- ESLint: clean
- TypeScript and Next route type generation: clean
- Bandit: clean
- `pip-audit`: no known vulnerabilities
- production `npm audit`: zero vulnerabilities

Security review findings:

- No CAPTCHA or authentication bypass was added.
- Robots, same-domain network guards, page/depth budgets, source cooldowns, and
  explicit-block stop behavior remain enforced.
- The crawler does not submit contact forms.
- Free-mail contacts require both a labeled value and a verified official
  contact-intent page; otherwise the existing deduction and review threshold
  remain active.
- Amazon discovery, domain verification, and official enrichment now use
  distinct reserved completion batch numbers, preserving idempotency across a
  shared operator run.
- Scrapy's crawler-owned spider API is used by the ingestion pipeline, removing
  the cloud runtime's deprecated spider-argument warnings.
- No provider rotation, automated Google result scraping, paid provider, Zyte
  API, GitHub Actions crawler, or credit runner was enabled.

## Database and quota impact

No database migration was required. Contact type storage is already versioned
and unconstrained, and the existing `operations/0006_crawl_run_contacts.sql`
migration provides idempotent run/contact linkage. The master specification was
clarified before the confidence-policy code changed.

The production runtime remains zero-charge locked:

- `PAID_SERVICES_ALLOWED=false`
- `ZYTE_API_ENABLED=false`
- `SCRAPY_CLOUD_MAX_UNITS=1`
- one active operator slot; no concurrent provider execution
- one target seller and eight planned official pages in the acceptance run

There is no hard-coded promise of a fixed number of sellers per day. Daily
throughput is intentionally bounded by one sequential Student unit, operator
run page budgets, source robots/rate policies, and free-tier availability. This
acceptance used one seller and 19 total network responses including robots,
sitemap, redirects, and optional paths. D1 verification reads were small and
wrote zero rows.

## Backup, rollback, and recovery

The verified pre-promotion four-D1 backup is:

`E:\seller_crawler\.sellerintel\backups\production-20260824T082037Z\manifest.json`

Its manifest covers all four production partitions and verified SHA-256
checksums in the allowed Cloudflare account. Signed backup URLs were never
reported or committed.

Rollback choices:

1. For only the summary-hydration change, redeploy Worker version
   `66c4e505-35e4-4a21-9f6c-03a9dc5637fb` while leaving the crawler artifact
   pinned to `57266b132b94c15b1cf519939063555dc1ebe65d`.
2. For the full corrective crawler release, restore the prior crawler pin
   `31a09197dfe6b1aef72de0d5742701d663534adc` together with its compatible
   prior Worker release.
3. Preserve all canonical seller, source, contact, idempotency, run-link, and
   historical rows. Suppress or correct a bad record through a documented
   forward operation; never delete canonical or historical data during rollback.
4. Use the verified four-D1 backup only through the documented restore workflow
   after re-validating the exact allowed Cloudflare account.

The production acceptance is complete. Sites that publish no supported direct
business contact may still correctly return only a contact form or no contact;
the platform must report that truthfully rather than inventing data or switching
providers.
