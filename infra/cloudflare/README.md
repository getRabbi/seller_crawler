# Cloudflare Infra

No Cloudflare resources are created by the current local implementation. Worker,
D1, R2, Pages, and Access activation require later phase approval and the
release flow in the master spec. Phase 9 dashboard work is only a static local
export, and Phase 7 R2 evidence upload is not implemented.

Solo Mode v1 Cloudflare scope is Worker ingestion and read APIs, the existing
four D1 databases, a static Pages dashboard, single-user Cloudflare Access, CSV
export, and basic four-D1 backup/restore. R2 is optional for launch; use D1 for
compact evidence provenance first, then add R2 later for full HTML, screenshots,
batch archives, and longer backup retention.
