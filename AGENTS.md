# AGENTS.md

## Mission
Build and maintain the Seller Intelligence Platform defined in
SELLER_INTELLIGENCE_MASTER_SPEC.md.

## Non-negotiable constraints
- No CAPTCHA bypass.
- No credential or cookie harvesting.
- Respect robots and source adapters' risk policies.
- Stop an adapter after an explicit source block; do not rotate around it.
- Keep PAID_SERVICES_ALLOWED=false unless the frozen specification is explicitly amended.
- Do not enable Zyte API unless the explicit budget flags are set.
- Do not activate or switch crawler providers automatically.
- Never allocate more than one Scrapy Cloud unit.
- Never expose production secrets.
- Never log unmasked personal contact data.
- Never delete canonical or historical data without a documented retention operation.
- All database changes require a migration.
- All external payloads require schema validation.
- All writes require idempotency.
- Every extracted record must include schema_version and parser_version.
- Modify no more than one subsystem in one pull request unless the task explicitly approves a cross-cutting change.
- Do not change frozen architecture without first updating the master specification.
- Run tests before declaring a task complete.

## Architecture
- Provider-neutral Python Scrapy crawler package.
- Preferred runner: verified Zyte Student Scrapy Cloud unit.
- Guaranteed fallback: local Docker/Scrapy runner.
- Disabled bounded fallbacks: GitHub Actions burst and credit-backed container.
- TypeScript Cloudflare Worker API.
- Partitioned Cloudflare D1 databases for core, contacts, operations, and recent history.
- Cloudflare R2 evidence and archive storage.
- Next.js static dashboard on Cloudflare Pages.
- Cloudflare Access authentication.

## Definition of done
- Implementation complete.
- Tests added and passing.
- Required migration added and tested.
- Documentation and changelog updated.
- Security implications reviewed.
- Free-tier quota impact documented.
- Rollback or recovery path documented.
- No unrelated changes.
