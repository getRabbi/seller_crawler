# Local Runner Readiness

Phase 10A is partially complete and prepares the provider-neutral local runner
without enabling live crawling, scheduling, provider deployment, or paid
services. The reconciled active phase is Phase 9.

In Solo Mode v1, the local runner is the only launch fallback. It must use the
same crawler package, contracts, local spool, and signed ingestion path as the
verified one-unit Zyte runner. GitHub Actions crawler fallback, credit-backed
fallback, automatic provider orchestration, browser profiles, cookies, and Zyte
API remain out of scope.

## Default Smoke Command

Run from the repository root with `PYTHONPATH=crawler` set in the shell:

```powershell
$env:PYTHONPATH="crawler"
uv run python -m sellerintel.runtime.local
```

The default mode is fixture-only and dry-run:

```text
RUNNER_MODE=development_locked
LIVE_CRAWL_ENABLED=false
LOCAL_RUNNER_FIXTURE_ONLY=true
LOCAL_RUNNER_DRY_RUN=true
```

The smoke command validates startup gates, the global kill switch, local lock
path, spool path, and forbidden personal browser profile variables. It then
runs the real official-site Scrapy spider against sanitized fixtures, producing
all four supported contact types and compact evidence without network access.
It does not call the Worker unless `LOCAL_RUNNER_DRY_RUN` is explicitly set to
`false` with ingestion endpoint and HMAC settings.

## Docker Artifact

`Dockerfile` is the shared crawler runtime artifact for local, Zyte, Actions,
and credit-backed runners after their separate activation gates pass. The image
defaults are locked to development, fixture-only dry-run mode:

```powershell
docker build -t sellerintel-crawler:local .
docker run --rm sellerintel-crawler:local
```

Do not add secrets to the image. Use runtime environment variables only after an
approved non-dry-run mode is reached.

## Sequential Lock

The local runner writes `LOCAL_RUNNER_LOCK_PATH`, defaulting to
`.sellerintel/local-runner.lock`, with exclusive creation. If the file already
exists, the run exits as `busy`. Remove a stale lock only after confirming no
local runner process is active.

## Spool Replay

Temporary ingestion failures are stored under `LOCAL_SPOOL_DIR`, defaulting to
`.sellerintel/spool`. Replay reads the stored compressed body, verifies its
checksum, signs the same body with a fresh nonce and timestamp, keeps the same
idempotency key, and deletes the spool file only after a 2xx Worker response.

## Windows Task Scheduler

Scheduling remains blocked until operator approval. When approved, schedule one
fixture or fallback-local runner command at a time with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$env:PYTHONPATH='crawler'; uv run python -m sellerintel.runtime.local"
```

Keep `LOCAL_RUNNER_LOCK_PATH` on the same local disk as the runner workspace so
overlapping jobs fail closed.

## Linux Cron

Scheduling remains blocked until operator approval. When approved, use a single
cron entry that sets `PYTHONPATH`, changes to the repository root, and runs the
same module:

```cron
*/30 * * * * cd /srv/seller_crawler && PYTHONPATH=crawler uv run python -m sellerintel.runtime.local
```

Do not configure a cron schedule for marketplace crawling, browser profiles,
cookies, paid providers, Zyte API, or automatic fallback.
