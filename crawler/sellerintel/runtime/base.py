from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ValidationResult:
    ok: bool
    errors: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class BuildArtifact:
    version: str
    path: str


@dataclass(frozen=True, slots=True)
class DeploymentResult:
    deployed: bool
    provider: str


@dataclass(frozen=True, slots=True)
class CrawlJob:
    job_id: str
    page_budget: int
    spider_name: str = "official_website"
    arguments: tuple[tuple[str, str], ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class RunHandle:
    provider: str
    run_id: str


@dataclass(frozen=True, slots=True)
class RunStatus:
    state: str


@dataclass(frozen=True, slots=True)
class LogEvent:
    level: str
    message: str


class RunnerProvider(Protocol):
    name: str

    def validate_configuration(self) -> ValidationResult: ...

    def deploy(self, artifact: BuildArtifact) -> DeploymentResult: ...

    def start(self, job: CrawlJob) -> RunHandle: ...

    def status(self, handle: RunHandle) -> RunStatus: ...

    def cancel(self, handle: RunHandle) -> None: ...

    def fetch_logs(self, handle: RunHandle) -> Iterable[LogEvent]: ...
