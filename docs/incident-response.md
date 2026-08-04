# Incident Response

Pause affected adapters or runners after source blocks, policy concerns, quota
warnings, credential exposure, or incorrect personal-data exposure. The current
local phases have no active production adapters or runners.

The current release candidate remains local-only at the external deployment
boundary. Pause local smoke or spool replay if the runner lock appears stale, a
spool checksum fails, a replayed batch is rejected by validation, or a forbidden
browser profile/cookie path is detected. After deployment, revoke the affected
secret or Access session first, stop the specific job, and keep all provider
switching disabled. Do not delete canonical or historical data during incident
recovery.
