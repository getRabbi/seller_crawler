import sqlite3
import tomllib
from collections.abc import Iterator
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"
RESTORE_CORE_FTS = ROOT / "database" / "queries" / "rebuild_core_fts_after_restore.sql"

EXPECTED_TABLES = {
    "core": {
        "sellers",
        "marketplace_accounts",
        "seller_aliases",
        "score_components",
        "seller_product_links",
        "seller_search_fts",
        "entity_resolution_decisions",
        "seller_merge_redirects",
        "seller_merge_link_audit",
    },
    "contacts": {
        "contacts",
        "suppression_list",
        "outreach_state",
        "audit_events",
    },
    "operations": {
        "sources",
        "crawl_runs",
        "review_queue",
        "source_registry",
        "idempotency_keys",
        "ingestion_nonces",
        "quota_state",
        "feature_flags",
        "operator_crawl_runs",
        "operator_crawl_events",
        "operator_crawl_idempotency",
        "crawl_run_sellers",
        "crawl_run_contacts",
    },
    "history": {
        "field_history",
        "recent_diff_metadata",
        "history_retention_jobs",
    },
}

PRIMARY_KEYS = {
    "core": {
        "sellers": "id",
        "marketplace_accounts": "id",
        "seller_aliases": "id",
        "score_components": "id",
        "seller_product_links": "id",
        "entity_resolution_decisions": "id",
        "seller_merge_redirects": "source_seller_id",
    },
    "contacts": {
        "contacts": "id",
        "suppression_list": "id",
        "outreach_state": "id",
        "audit_events": "id",
    },
    "operations": {
        "sources": "id",
        "crawl_runs": "id",
        "review_queue": "id",
        "source_registry": "adapter_name",
        "idempotency_keys": "idempotency_key",
        "ingestion_nonces": "nonce",
        "quota_state": "quota_name",
        "feature_flags": "flag_name",
        "operator_crawl_runs": "id",
        "operator_crawl_events": "id",
        "operator_crawl_idempotency": "idempotency_key",
    },
    "history": {
        "field_history": "id",
        "recent_diff_metadata": "id",
        "history_retention_jobs": "id",
    },
}


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def sql_files(partition: str) -> Iterator[Path]:
    yield from sorted((MIGRATIONS / partition).glob("*.sql"))


def apply_partition_migrations(partition: str) -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.execute("PRAGMA foreign_keys = ON")

    for path in sql_files(partition):
        connection.executescript(path.read_text(encoding="utf-8"))

    return connection


def table_names(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {row[0] for row in rows}


@pytest.mark.parametrize("partition", ["core", "contacts", "operations", "history"])
def test_partition_migrations_apply(partition: str) -> None:
    connection = apply_partition_migrations(partition)

    assert EXPECTED_TABLES[partition].issubset(table_names(connection))


@pytest.mark.parametrize("partition", ["core", "contacts", "operations", "history"])
def test_primary_keys_are_text_identifiers(partition: str) -> None:
    connection = apply_partition_migrations(partition)

    for table, primary_key in PRIMARY_KEYS[partition].items():
        columns = connection.execute(f"PRAGMA table_info({quote_identifier(table)})").fetchall()
        matching = [column for column in columns if column[1] == primary_key]

        assert matching, f"{table}.{primary_key} is missing"
        assert matching[0][2].upper() == "TEXT"
        assert matching[0][5] > 0


@pytest.mark.parametrize("partition", ["core", "contacts", "operations", "history"])
def test_foreign_keys_do_not_cross_database_partitions(partition: str) -> None:
    connection = apply_partition_migrations(partition)
    local_tables = table_names(connection)

    for table in EXPECTED_TABLES[partition]:
        foreign_keys = connection.execute(f"PRAGMA foreign_key_list({quote_identifier(table)})")
        for foreign_key in foreign_keys:
            referenced_table = foreign_key[2]
            assert referenced_table in local_tables


@pytest.mark.parametrize("partition", ["core", "contacts", "operations", "history"])
def test_migrations_do_not_seed_personal_data(partition: str) -> None:
    connection = apply_partition_migrations(partition)

    for table in PRIMARY_KEYS[partition]:
        row_count = connection.execute(
            f"SELECT COUNT(*) FROM {quote_identifier(table)}"
        ).fetchone()[0]
        assert row_count == 0


def test_core_fts_indexes_sellers_aliases_and_brands() -> None:
    connection = apply_partition_migrations("core")
    seller_id = "018f2d5e-7b3c-7a1d-8f2e-123456789abc"

    insert_core_fixture(connection, seller_id)

    rows = connection.execute(
        "SELECT seller_id FROM seller_search_fts WHERE seller_search_fts MATCH ?",
        ("precision OR fixtures",),
    ).fetchall()

    assert rows == [(seller_id,)]


def test_core_restore_script_recreates_and_rebuilds_fts() -> None:
    connection = apply_partition_migrations("core")
    seller_id = "018f2d5e-7b3c-7a1d-8f2e-123456789abc"

    insert_core_fixture(connection, seller_id)
    connection.execute("DROP TABLE seller_search_fts")
    connection.executescript(RESTORE_CORE_FTS.read_text(encoding="utf-8"))

    restored_rows = connection.execute(
        "SELECT seller_id FROM seller_search_fts WHERE seller_search_fts MATCH ?",
        ("precision OR fixtures",),
    ).fetchall()
    assert restored_rows == [(seller_id,)]

    connection.execute(
        """
        INSERT INTO seller_aliases (
            id, seller_id, alias, normalized_alias, alias_type, first_seen_at, last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "018f2d5e-7b3c-7a1d-8f2e-123456789abf",
            seller_id,
            "Restored Search Alias",
            "restored search alias",
            "business_name",
            "2026-07-31T00:00:00Z",
            "2026-07-31T00:00:00Z",
        ),
    )

    updated_rows = connection.execute(
        "SELECT seller_id FROM seller_search_fts WHERE seller_search_fts MATCH ?",
        ("restored",),
    ).fetchall()
    assert updated_rows == [(seller_id,)]


def test_core_entity_resolution_tables_store_audit_and_rollback_metadata() -> None:
    connection = apply_partition_migrations("core")

    decision_columns = table_columns(connection, "entity_resolution_decisions")
    redirect_columns = table_columns(connection, "seller_merge_redirects")
    link_columns = table_columns(connection, "seller_merge_link_audit")

    assert {
        "score_breakdown_json",
        "merge_audit_json",
        "rollback_plan_json",
        "parser_version",
        "schema_version",
    }.issubset(decision_columns)
    assert {"decision_id", "reason", "rollback_status", "rollback_decision_id"}.issubset(
        redirect_columns
    )
    assert {
        "decision_id",
        "table_name",
        "row_id",
        "original_seller_id",
        "target_seller_id",
        "rolled_back_at",
    }.issubset(link_columns)


def test_operations_sources_store_solo_v1_compact_evidence() -> None:
    connection = apply_partition_migrations("operations")

    assert {
        "source_url",
        "page_title",
        "evidence_snippet",
        "content_hash",
        "detected_at",
        "last_seen_at",
    }.issubset(table_columns(connection, "sources"))


def test_operator_search_fingerprints_are_unique_for_original_runs() -> None:
    connection = apply_partition_migrations("operations")

    assert "search_fingerprint" in table_columns(connection, "operator_crawl_runs")
    indexes = {
        row[1]: row[2]
        for row in connection.execute("PRAGMA index_list(operator_crawl_runs)").fetchall()
    }
    assert indexes["ux_operator_crawl_search_fingerprint"] == 1


def test_worker_configs_bind_exactly_four_partition_migration_directories() -> None:
    config_paths = [
        ROOT / "apps" / "worker-api" / "wrangler.toml",
        ROOT / "apps" / "worker-api" / "wrangler.staging.toml.example",
        ROOT / "apps" / "worker-api" / "wrangler.production.toml.example",
    ]
    expected_bindings = {"CORE_DB", "CONTACTS_DB", "OPS_DB", "HISTORY_DB"}

    for config_path in config_paths:
        config = tomllib.loads(config_path.read_text(encoding="utf-8"))
        bindings = config["d1_databases"]
        assert {binding["binding"] for binding in bindings} == expected_bindings
        assert len({binding["migrations_dir"] for binding in bindings}) == 4
        assert "r2_buckets" not in config


def insert_core_fixture(connection: sqlite3.Connection, seller_id: str) -> None:
    connection.execute(
        """
        INSERT INTO sellers (
            id, canonical_name, normalized_name, legal_name, country_code, city,
            official_domain, parser_version, first_seen_at, last_seen_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            seller_id,
            "Acme Industrial",
            "acme industrial",
            "Acme Industrial Limited",
            "US",
            "Austin",
            "example.invalid",
            "parser-1",
            "2026-07-31T00:00:00Z",
            "2026-07-31T00:00:00Z",
            "2026-07-31T00:00:00Z",
            "2026-07-31T00:00:00Z",
        ),
    )
    connection.execute(
        """
        INSERT INTO seller_aliases (
            id, seller_id, alias, normalized_alias, alias_type, first_seen_at, last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "018f2d5e-7b3c-7a1d-8f2e-123456789abd",
            seller_id,
            "Precision Supply Co",
            "precision supply co",
            "business_name",
            "2026-07-31T00:00:00Z",
            "2026-07-31T00:00:00Z",
        ),
    )
    connection.execute(
        """
        INSERT INTO seller_product_links (
            id, seller_id, product_name, normalized_product_name, brand, normalized_brand,
            category, first_seen_at, last_seen_at, parser_version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "018f2d5e-7b3c-7a1d-8f2e-123456789abe",
            seller_id,
            "Test Fixture",
            "test fixture",
            "FixtureBrand",
            "fixturebrand",
            "fixtures",
            "2026-07-31T00:00:00Z",
            "2026-07-31T00:00:00Z",
            "parser-1",
        ),
    )


def table_columns(connection: sqlite3.Connection, table: str) -> set[str]:
    columns = connection.execute(f"PRAGMA table_info({quote_identifier(table)})").fetchall()
    return {column[1] for column in columns}
