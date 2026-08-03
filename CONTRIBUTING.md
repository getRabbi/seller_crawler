# Contributing

Follow `SELLER_INTELLIGENCE_MASTER_SPEC.md` and `AGENTS.md` for all changes.

## Scope Control

Keep each task to one subsystem unless the task explicitly approves a
cross-cutting change. Do not change the frozen architecture without an explicit
specification amendment.

## Validation

Run the Python and TypeScript validation commands in `README.md` before
declaring a task complete.

## Provider Safety

Provider activation is out of scope while Phase 7 remains partially complete.
Do not deploy, crawl, use Zyte API, enable Amazon, add an extra Scrapy Cloud
unit, or add an automatic paid fallback.
