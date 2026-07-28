.PHONY: python-check web-check test build health

python-check:
	uv run ruff check crawler
	uv run mypy crawler/sellerintel crawler/tests
	uv run pytest crawler/tests
	uv run bandit -r crawler/sellerintel
	uv run pip-audit

web-check:
	npm.cmd run lint
	npm.cmd run typecheck
	npm.cmd run test

test: python-check web-check

health:
	npm.cmd run health:worker

build:
	npm.cmd run build
