# Architecture

The frozen architecture is provider-neutral: runners emit signed idempotent
batches to a Cloudflare Worker API, while D1 owns canonical state and R2 owns
evidence. Phase 0 only creates the repository skeleton.
