# Seller Intelligence Platform

Phase 0 repository bootstrap for the zero-cost hybrid runner architecture in
`SELLER_INTELLIGENCE_MASTER_SPEC.md`.

## Current Phase

- Phase: `0 - repository bootstrap`
- Runner mode: `development_locked`
- Live crawling: disabled
- Zyte API: disabled
- Scrapy Cloud deploy: disabled
- GitHub Actions crawler: disabled
- Credit runner: disabled
- Deployment: disabled

## Local Setup Commands

Run these commands from the repository root.

```powershell
uv sync --dev
npm.cmd install
```

## Required Validation Commands

```powershell
uv run ruff check crawler
uv run mypy crawler/sellerintel crawler/tests
uv run pytest crawler/tests
uv run bandit -r crawler/sellerintel
uv run pip-audit
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run health:worker
npm.cmd run build
```

`npm.cmd run health:worker` executes the local Worker health smoke test and
asserts that `GET /v1/health` returns HTTP 200 in the default locked
configuration.

## Stop Conditions

Do not run live crawling, deploy Cloudflare resources, use Zyte API, activate a
provider, start Phase 1, push, or commit during Phase 0.

## Rollback Or Recovery

Phase 0 contains only repository scaffolding and local tests. Roll back by
removing the files added in this bootstrap before any deployment or data
migration exists.

## Free-Tier Impact

This phase has no external infrastructure use and no recurring cost. Local
dependency installation may download development packages, but no Cloudflare,
Zyte, crawling, R2, D1, or provider runtime is activated.
