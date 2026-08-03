# Local Runner Infra

Local runner activation is not enabled. Phase 10A readiness is partially
implemented for fixture-only dry-run smoke and spool replay, but live crawling,
scheduling, provider deployment, and production ingestion remain disabled.

Solo Mode v1 keeps this as the only fallback runner. It should remain
fixture-only and dry-run until the official-website Phase 7 crawl gate is
approved. It must not become an automatic provider failover path.
