# Cloudflare Infra

No Cloudflare resources have been created by repository commands. The Worker,
four D1 bindings, static Pages dashboard, Access JWT verification, environment
examples, and backup tooling are prepared and verified locally. Hosted resource
existence and deployment remain unknown until the operator completes
`OPERATOR_INPUTS_REQUIRED.md` and follows `DEPLOYMENT_RUNBOOK.md`.

Solo Mode v1 Cloudflare scope is Worker ingestion and read APIs, the existing
four D1 databases, a static Pages dashboard, single-user Cloudflare Access, CSV
export, and basic four-D1 backup/restore. R2 is optional for launch; use D1 for
compact evidence provenance first, then add R2 later for full HTML, screenshots,
batch archives, and longer backup retention.
