from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess  # nosec B404
import sys
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

DATABASE_KEYS = (
    "CORE_D1_DATABASE_NAME",
    "CONTACTS_D1_DATABASE_NAME",
    "OPS_D1_DATABASE_NAME",
    "HISTORY_D1_DATABASE_NAME",
)
CORE_EXPORT_TABLES = (
    "sellers",
    "marketplace_accounts",
    "seller_aliases",
    "score_components",
    "seller_product_links",
    "entity_resolution_decisions",
    "seller_merge_redirects",
    "seller_merge_link_audit",
)
DATABASE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


class CommandRunner(Protocol):
    def __call__(self, command: Sequence[str], *, cwd: Path) -> None: ...


@dataclass(frozen=True, slots=True)
class BackupEntry:
    binding: str
    database_name: str
    file: str
    sha256: str


@dataclass(frozen=True, slots=True)
class BackupManifest:
    schema_version: int
    environment: str
    exported_at: str
    databases: tuple[BackupEntry, ...]


def backup_databases(
    *,
    environment: str,
    workspace_root: Path,
    output_root: Path,
    env: Mapping[str, str],
    runner: CommandRunner | None = None,
    timestamp: datetime | None = None,
) -> Path:
    command_runner = runner or run_command
    root = workspace_root.resolve()
    output = output_root.resolve()
    _require_within(output, root, "backup output")
    exported_at = timestamp or datetime.now(UTC)
    backup_dir = output / f"{environment}-{exported_at.strftime('%Y%m%dT%H%M%SZ')}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    target_databases = database_names(env)
    validate_environment_database_names(environment, target_databases)
    entries: list[BackupEntry] = []

    for binding, database_name in target_databases.items():
        file_path = backup_dir / f"{binding.removesuffix('_D1_DATABASE_NAME').lower()}.sql"
        table_arguments = (
            [argument for table in CORE_EXPORT_TABLES for argument in ("--table", table)]
            if binding == "CORE_D1_DATABASE_NAME"
            else []
        )
        command_runner(
            [
                *wrangler_prefix(),
                "d1",
                "export",
                database_name,
                "--remote",
                "--skip-confirmation",
                *table_arguments,
                "--output",
                str(file_path),
            ],
            cwd=root,
        )
        if not file_path.is_file():
            raise RuntimeError(f"Wrangler did not create expected export: {file_path}")
        entries.append(
            BackupEntry(
                binding=binding,
                database_name=database_name,
                file=file_path.name,
                sha256=sha256_file(file_path),
            )
        )

    manifest = BackupManifest(
        schema_version=1,
        environment=environment,
        exported_at=exported_at.isoformat().replace("+00:00", "Z"),
        databases=tuple(entries),
    )
    manifest_path = backup_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(asdict(manifest), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest_path


def restore_databases(
    *,
    manifest_path: Path,
    workspace_root: Path,
    environment: str,
    env: Mapping[str, str],
    confirm_restore: bool,
    confirm_production: bool,
    runner: CommandRunner | None = None,
) -> None:
    if not confirm_restore:
        raise ValueError("Restore requires --confirm-restore.")
    if environment == "production" and not confirm_production:
        raise ValueError("Production restore requires --confirm-production.")
    root = workspace_root.resolve()
    resolved_manifest = manifest_path.resolve()
    _require_within(resolved_manifest, root, "backup manifest")
    manifest = load_manifest(resolved_manifest)
    if manifest.environment != environment:
        raise ValueError("Backup environment does not match the requested restore environment.")

    current_names = database_names(env)
    validate_environment_database_names(environment, current_names)
    command_runner = runner or run_command
    for entry in manifest.databases:
        expected_name = current_names.get(entry.binding)
        if expected_name is None or expected_name != entry.database_name:
            raise ValueError(f"Database mapping changed for {entry.binding}; restore stopped.")
        sql_path = (resolved_manifest.parent / entry.file).resolve()
        _require_within(sql_path, resolved_manifest.parent, "backup SQL file")
        if not sql_path.is_file() or sha256_file(sql_path) != entry.sha256:
            raise ValueError(f"Backup checksum failed for {entry.binding}.")
        command_runner(
            [
                *wrangler_prefix(),
                "d1",
                "execute",
                entry.database_name,
                "--remote",
                "--file",
                str(sql_path),
            ],
            cwd=root,
        )


def database_names(env: Mapping[str, str]) -> dict[str, str]:
    names: dict[str, str] = {}
    for key in DATABASE_KEYS:
        value = env.get(key, "").strip()
        if not value:
            raise ValueError(f"{key} is required.")
        if not DATABASE_NAME_PATTERN.fullmatch(value):
            raise ValueError(f"{key} contains an invalid database name.")
        names[key] = value
    return names


def validate_environment_database_names(
    environment: str, database_mapping: Mapping[str, str]
) -> None:
    environment_token = re.compile(rf"(?:^|[-_]){re.escape(environment)}(?:$|[-_])")
    mismatches = sorted(
        binding
        for binding, database_name in database_mapping.items()
        if environment_token.search(database_name.lower()) is None
    )
    if mismatches:
        joined = ", ".join(mismatches)
        raise ValueError(
            f"Database names do not match the {environment} environment: {joined}."
        )


def load_manifest(path: Path) -> BackupManifest:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema_version") != 1 or not isinstance(raw.get("databases"), list):
        raise ValueError("Unsupported backup manifest.")
    entries = tuple(BackupEntry(**entry) for entry in raw["databases"])
    if {entry.binding for entry in entries} != set(DATABASE_KEYS):
        raise ValueError("Backup manifest must contain all four D1 databases.")
    return BackupManifest(
        schema_version=1,
        environment=str(raw["environment"]),
        exported_at=str(raw["exported_at"]),
        databases=entries,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def wrangler_prefix() -> tuple[str, ...]:
    return ("npx.cmd", "wrangler") if os.name == "nt" else ("npx", "wrangler")


def run_command(command: Sequence[str], *, cwd: Path) -> None:
    subprocess.run(command, cwd=cwd, check=True)  # noqa: S603  # nosec B603


def _require_within(path: Path, root: Path, label: str) -> None:
    try:
        path.relative_to(root.resolve())
    except ValueError as error:
        raise ValueError(f"{label} must stay within the workspace.") from error


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Checksummed four-D1 backup and restore utility.")
    parser.add_argument("action", choices=("backup", "restore"))
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--workspace-root", type=Path, default=Path.cwd())
    parser.add_argument("--output-root", type=Path, default=Path(".sellerintel/backups"))
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--confirm-restore", action="store_true")
    parser.add_argument("--confirm-production", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    workspace = args.workspace_root.resolve()
    if args.action == "backup":
        output = (
            args.output_root
            if args.output_root.is_absolute()
            else workspace / args.output_root
        )
        manifest = backup_databases(
            environment=args.environment,
            workspace_root=workspace,
            output_root=output,
            env=os.environ,
        )
        print(manifest)
        return 0
    if args.manifest is None:
        raise ValueError("--manifest is required for restore.")
    manifest_path = args.manifest if args.manifest.is_absolute() else workspace / args.manifest
    restore_databases(
        manifest_path=manifest_path,
        workspace_root=workspace,
        environment=args.environment,
        env=os.environ,
        confirm_restore=args.confirm_restore,
        confirm_production=args.confirm_production,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(f"d1-transfer: {error}", file=sys.stderr)
        raise SystemExit(1) from error
