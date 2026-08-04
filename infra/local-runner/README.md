# Local Runner Infra

The local runner is complete and verified in fixture-only dry-run mode,
including signed/spooled ingestion tests and a Docker smoke with networking
disabled. Live crawling, scheduling, provider deployment, and production
ingestion remain disabled.

Solo Mode v1 keeps this as the only fallback runner. It should remain
fixture-only and dry-run until one explicit official-site seed is approved for
the staging smoke. It must not become an automatic provider failover path.
