# Zyte Infra

Zyte Support has confirmed the GitHub Student Scrapy Cloud entitlement and
exactly one free Scrapy Cloud unit. Project `871778` is configured and the
immutable production artifact is deployed. The Phase 10B runner, no-network
spider, one-unit workflow, status, and cancellation controls are locally and
remotely tested. Zyte API remains disabled and must not be provisioned. Do not
add an extra Scrapy Cloud unit.

Solo Mode v1 uses Zyte only as the preferred one-unit runner after the
no-network smoke gate and explicit operator approval. Keep:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
ALLOW_EXTRA_SCRAPY_UNITS=false
ENABLE_AMAZON=true
```

From the repository root, use
`uv run --directory crawler python -m sellerintel.runtime.scrapy_cloud` for
controlled validation, deployment, smoke start, status, and cancellation. This
does not depend on a shell-persistent `PYTHONPATH`. Before deployment, map the
ignored `SCRAPY_CLOUD_API_KEY` to process-only `SHUB_APIKEY`, and remove that
alias immediately afterward. Do not create a Zyte API key, add another Scrapy
Cloud unit, enable a paid path, or start a crawl outside the bounded
authenticated operator gate in `DEPLOYMENT_RUNBOOK.md`.
