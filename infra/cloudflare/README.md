# Cloudflare Infra

Staging and production Cloudflare resources are deployed in the repository's
sole authorized account. Production includes four D1 bindings, the Worker API,
static Pages dashboard, custom DNS, and single-operator Access. All D1
migrations and a sequential four-part restore drill pass. Exact resource and
release evidence is recorded in `PRODUCTION_PROMOTION_REPORT.md`.

Solo Mode v1 Cloudflare scope is Worker ingestion and read APIs, the existing
four D1 databases, a static Pages dashboard, single-user Cloudflare Access, CSV
export, and basic four-D1 backup/restore. R2 is optional for launch; use D1 for
compact evidence provenance first, then add R2 later for full HTML, screenshots,
batch archives, and longer backup retention.
