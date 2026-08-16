# Controlled Staging Seed

This directory is the public, synthetic official-site fixture used only for the
bounded Scrapy Cloud staging smoke. It contains no real person or customer data.

Deployed hostname: `seed-stg.scalemyprints.com`

Cloudflare staging resources:

- Pages project: `seller-intelligence-seed-staging`
- Production deployment: `ee706dc5-268d-463b-8880-98d5e2360f33`
- DNS: CNAME to `seller-intelligence-seed-staging.pages.dev`, DNS-only
- Pages custom-domain status: active

Safety properties:

- `robots.txt` explicitly allows this fixture.
- Pages send `X-Robots-Tag: noindex, nofollow` to avoid search indexing.
- Contact values are reserved synthetic examples.
- The crawl remains limited to this exact hostname, at most four pages, depth
  two, one Scrapy Cloud unit, and no Zyte API.

DNS-only is intentional for this public synthetic fixture: an additional
orange-cloud layer produced intermittent Pages `522` responses, while direct
Pages custom-host routing was stable. No private origin IP is exposed because
the target remains Cloudflare Pages.

Rollback is a Pages deployment rollback. Full decommission additionally removes
the exact custom-domain association and DNS CNAME after verifying each target
in the permitted Cloudflare account. The fixture has no Access application; it
is public by design and protected from indexing with response headers.
