# Zyte Infra

Zyte Support has confirmed the GitHub Student Scrapy Cloud entitlement and
exactly one free Scrapy Cloud unit. The repository records that fact while Zyte
Scrapy Cloud deployment remains blocked until Phase 10B. Zyte API remains
disabled in the zero-cost baseline and must not be provisioned here. Do not add
an extra Scrapy Cloud unit.

Solo Mode v1 uses Zyte only as the preferred one-unit runner after the Phase 10B
no-network smoke gate and explicit operator approval. Keep:

```text
ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true
SCRAPY_CLOUD_MAX_UNITS=1
ZYTE_API_ENABLED=false
PAID_SERVICES_ALLOWED=false
ALLOW_EXTRA_SCRAPY_UNITS=false
ENABLE_AMAZON=false
```

Do not create a Zyte API key, add another Scrapy Cloud unit, deploy a live
spider, or run an approved official-site crawl until the corresponding phase
gate is reached.
