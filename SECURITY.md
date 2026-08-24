# Security

This project is private internal software. Never place production secrets in
source files, examples, issues, screenshots, logs, CI output, or Codex prompts.

## Required Defaults

- `ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true`
- `PAID_SERVICES_ALLOWED=false`
- `LIVE_CRAWL_ENABLED=false`
- `ZYTE_API_ENABLED=false`
- `SCRAPY_CLOUD_DEPLOY_ENABLED=false`
- `GITHUB_ACTIONS_CRAWLER_ENABLED=false`
- `CREDIT_RUNNER_ENABLED=false`

## Sensitive Data Rules

- Mask email addresses and phone numbers in logs and list views.
- Ingestion logs may include only masked idempotency keys, error codes, stage
  names, and counts; never log raw contact values, signatures, HMAC secrets, or
  request bodies.
- Do not collect private personal profiles or residential-looking addresses for
  publication.
- Do not bypass CAPTCHA, authentication, robots restrictions, explicit blocks,
  or source risk policies.

## Ingestion Authentication

`POST /v1/ingest/batch` requires `INGESTION_HMAC_SECRET`, `X-SI-Timestamp`,
`X-SI-Nonce`, `X-SI-Signature`, and `Idempotency-Key`. The HMAC secret must be
stored only in the selected deployment environment. `.env.example` intentionally
leaves the value blank.

Crawler spool records may contain compressed accepted payloads and masked or
encrypted contact values. They must stay local or in access-controlled storage.
They must not contain HMAC secrets, generated signatures, provider credentials,
cookies, or unmasked personal contact data.

Contact extractor evidence contexts must remain masked. Extractor code must not
perform SMTP mailbox enumeration, QR decoding of unlabeled images, CAPTCHA
bypass, or live source fetching during local fixture phases.

Address masking must be applied before street-level address evidence is shown in
logs, dashboards, history rows, or review payloads. Full evidence belongs only in
access-controlled evidence storage.

Source adapter activation requires both feature-flag enablement and source
policy approval. Blocked-page detection and restricted robots/terms policies are
stop signals, not prompts to switch providers or evade access controls.

Challenge detection evaluates HTTP status and user-visible page content. A
theme's non-visible script token alone is not an explicit block when a
substantive public page is available, but a visible verification message, a
short script-only challenge, robots denial, or blocked HTTP status remains a
hard stop. The crawler never executes a CAPTCHA or challenge script.

Official-site enrichment must stay inside canonical same-domain crawl plans and
the configured page budget. Do not fetch live pages, retrieve sitemaps, upload
R2 evidence, follow account/cart/login paths, bypass access controls, or expand
to another provider during the local enrichment phase.

Automatic official-domain verification may use only bounded deterministic
identity candidates authorized for the current operator run. It must not scrape
search-result pages, enumerate subdomains, probe private/reserved response
addresses, or follow a redirect to a different canonical domain. Auto-linking
requires both an exact normalized domain identity and prominent on-page identity;
parked/for-sale and lower-confidence candidates remain unlinked. Decision evidence
contains scores and signal names only, never raw contact values.
The crawler DNS resolver must reject a non-public address before returning it to
the downloader; response-address validation remains a second guard.
Existing-seller automatic resolution requires an active canonical UUIDv7 seller
with no stored official domain. The server loads the seller name from core D1;
the browser cannot supply or override the identity used for candidate scoring.

Seller-linked website runs accept one existing UUIDv7 seller and one verified
public HTTPS URL. The Worker validates the canonical seller and rejects domain
conflicts; the crawler may update missing official-domain evidence but
repository upserts preserve stronger existing identity fields. Run/contact
linkage stores identifiers and counts only, never contact plaintext.

Entity-resolution output must keep only public identifiers, normalized values,
and contact hashes in score payloads. Do not include raw contact values in review
payloads. Automatic merge requires a score of at least `92`; scores from `70` to
`91` require manual review, and lower scores must not merge. Merge rollback must
be recorded as a new audit/decision operation rather than deleting history.

Dashboard code must never contain production secrets, direct D1/R2 bindings, or
raw contact values. Browser-visible contact fields must remain masked, reveal
metadata must be audit-only, and data must pass through authenticated Worker
`/v1` routes rather than direct provider or storage calls. Outside local mode,
the Worker must cryptographically validate the Cloudflare Access token signature,
issuer, audience, expiry, and exact single allowed email; header presence alone
is not authentication.

Local runner smoke mode must remain fixture-only and dry-run unless an approved
operator action supplies ingestion settings. Do not pass browser profile paths,
cookie files, personal user-data directories, provider credentials, or production
secrets to the local runner. Spool replay may sign stored compressed bodies with
a runtime HMAC secret, but it must never store that secret or generated
signatures.

## Reporting

Report suspected credential exposure or policy violations by opening a private
security issue and pausing affected adapters or runners immediately.
