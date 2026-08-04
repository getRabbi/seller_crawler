# Zyte Infra

Zyte Support has confirmed the GitHub Student Scrapy Cloud entitlement and
exactly one free Scrapy Cloud unit. The repository records that fact while Zyte
Scrapy Cloud deployment remains blocked on the operator project ID and Scrapy
Cloud credential. The Phase 10B runner, no-network spider, one-unit workflow,
status, and cancellation controls are implemented and locally tested. Zyte API
remains disabled and must not be provisioned. Do not add an extra Scrapy Cloud
unit.

Solo Mode v1 uses Zyte only as the preferred one-unit runner after the
no-network smoke gate and explicit operator approval. Keep:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
ALLOW_EXTRA_SCRAPY_UNITS=false
ENABLE_AMAZON=false
```

Use `python -m sellerintel.runtime.scrapy_cloud` for controlled validation,
deployment, smoke start, status, and cancellation. Do not create a Zyte API key,
add another Scrapy Cloud unit, deploy a live spider, or run an official-site
crawl until the corresponding gate in `DEPLOYMENT_RUNBOOK.md` is reached.
