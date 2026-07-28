# Security

This project is private internal software. Never place production secrets in
source files, examples, issues, screenshots, logs, CI output, or Codex prompts.

## Required Defaults

- `PAID_SERVICES_ALLOWED=false`
- `LIVE_CRAWL_ENABLED=false`
- `ZYTE_API_ENABLED=false`
- `SCRAPY_CLOUD_DEPLOY_ENABLED=false`
- `GITHUB_ACTIONS_CRAWLER_ENABLED=false`
- `CREDIT_RUNNER_ENABLED=false`

## Sensitive Data Rules

- Mask email addresses and phone numbers in logs and list views.
- Do not collect private personal profiles or residential-looking addresses for
  publication.
- Do not bypass CAPTCHA, authentication, robots restrictions, explicit blocks,
  or source risk policies.

## Reporting

Report suspected credential exposure or policy violations by opening a private
security issue and pausing affected adapters or runners immediately.
