from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sellerintel.operations.d1_transfer import backup_databases, restore_databases

DATABASE_ENV = {
    "CORE_D1_DATABASE_NAME": "seller-core-staging",
    "CONTACTS_D1_DATABASE_NAME": "seller-contacts-staging",
    "OPS_D1_DATABASE_NAME": "seller-ops-staging",
    "HISTORY_D1_DATABASE_NAME": "seller-history-staging",
}


class FakeWrangler:
    def __init__(self) -> None:
        self.commands: list[tuple[str, ...]] = []

    def __call__(self, command: Sequence[str], *, cwd: Path) -> None:
        assert cwd.is_absolute()
        self.commands.append(tuple(command))
        if "export" in command:
            output = Path(command[command.index("--output") + 1])
            output.write_text("CREATE TABLE fixture (id TEXT);\n", encoding="utf-8")


def test_backup_exports_all_four_databases_and_writes_checksums(tmp_path: Path) -> None:
    runner = FakeWrangler()
    manifest_path = backup_databases(
        environment="staging",
        workspace_root=tmp_path,
        output_root=tmp_path / "backups",
        env=DATABASE_ENV,
        runner=runner,
        timestamp=datetime(2026, 8, 4, tzinfo=UTC),
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert len(runner.commands) == 4
    assert all("--remote" in command and "d1" in command for command in runner.commands)
    assert {entry["binding"] for entry in manifest["databases"]} == set(DATABASE_ENV)
    assert all(len(entry["sha256"]) == 64 for entry in manifest["databases"])


def test_restore_verifies_manifest_and_requires_explicit_confirmation(tmp_path: Path) -> None:
    backup_runner = FakeWrangler()
    manifest_path = backup_databases(
        environment="staging",
        workspace_root=tmp_path,
        output_root=tmp_path / "backups",
        env=DATABASE_ENV,
        runner=backup_runner,
        timestamp=datetime(2026, 8, 4, tzinfo=UTC),
    )
    restore_runner = FakeWrangler()

    with pytest.raises(ValueError, match="confirm-restore"):
        restore_databases(
            manifest_path=manifest_path,
            workspace_root=tmp_path,
            environment="staging",
            env=DATABASE_ENV,
            confirm_restore=False,
            confirm_production=False,
            runner=restore_runner,
        )

    restore_databases(
        manifest_path=manifest_path,
        workspace_root=tmp_path,
        environment="staging",
        env=DATABASE_ENV,
        confirm_restore=True,
        confirm_production=False,
        runner=restore_runner,
    )

    assert len(restore_runner.commands) == 4
    assert all("execute" in command and "--file" in command for command in restore_runner.commands)


def test_production_restore_requires_second_confirmation(tmp_path: Path) -> None:
    production_env = {
        key: value.replace("staging", "production")
        for key, value in DATABASE_ENV.items()
    }
    manifest_path = backup_databases(
        environment="production",
        workspace_root=tmp_path,
        output_root=tmp_path / "backups",
        env=production_env,
        runner=FakeWrangler(),
        timestamp=datetime(2026, 8, 4, tzinfo=UTC),
    )

    with pytest.raises(ValueError, match="confirm-production"):
        restore_databases(
            manifest_path=manifest_path,
            workspace_root=tmp_path,
            environment="production",
            env=production_env,
            confirm_restore=True,
            confirm_production=False,
            runner=FakeWrangler(),
        )


def test_restore_stops_on_checksum_mismatch(tmp_path: Path) -> None:
    manifest_path = backup_databases(
        environment="staging",
        workspace_root=tmp_path,
        output_root=tmp_path / "backups",
        env=DATABASE_ENV,
        runner=FakeWrangler(),
        timestamp=datetime(2026, 8, 4, tzinfo=UTC),
    )
    sql_path = next(manifest_path.parent.glob("*.sql"))
    sql_path.write_text("tampered", encoding="utf-8")

    with pytest.raises(ValueError, match="checksum"):
        restore_databases(
            manifest_path=manifest_path,
            workspace_root=tmp_path,
            environment="staging",
            env=DATABASE_ENV,
            confirm_restore=True,
            confirm_production=False,
            runner=FakeWrangler(),
        )
