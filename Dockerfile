FROM python:3.12-slim AS crawler-runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/crawler \
    RUNNER_MODE=development_locked \
    LIVE_CRAWL_ENABLED=false \
    PAID_SERVICES_ALLOWED=false \
    ALLOW_EXTRA_SCRAPY_UNITS=false \
    ZYTE_STUDENT_ENTITLEMENT_CONFIRMED=true \
    SCRAPY_CLOUD_MAX_UNITS=1 \
    ZYTE_API_ENABLED=false \
    SCRAPY_CLOUD_DEPLOY_ENABLED=false \
    GITHUB_ACTIONS_CRAWLER_ENABLED=false \
    CREDIT_RUNNER_ENABLED=false \
    ENABLE_AMAZON=false \
    ENABLE_ALIBABA=false \
    ENABLE_1688=false \
    ENABLE_SEARCH_DISCOVERY=false \
    ENABLE_BUSINESS_REGISTRY=false \
    ENABLE_OFFICIAL_WEBSITE=true \
    ENABLE_AI_SUMMARY=false \
    ENABLE_OUTREACH=false \
    LOCAL_RUNNER_FIXTURE_ONLY=true \
    LOCAL_RUNNER_DRY_RUN=true

COPY pyproject.toml uv.lock ./
RUN python -m pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev

COPY crawler ./crawler

CMD ["uv", "run", "--no-sync", "python", "-m", "sellerintel.runtime.local"]
