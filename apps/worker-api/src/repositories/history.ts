import { nullable, runStatement, type D1Database, type D1Result } from "./d1";
import { assertUuidV7Compatible } from "./ids";
import type { FieldHistoryWrite, RecentDiffMetadataWrite } from "./types";

export class HistoryRepository {
  constructor(private readonly db: D1Database) {}

  async insertFieldHistory(record: FieldHistoryWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    return runStatement(
      this.db,
      `INSERT INTO field_history (
         id, entity_type, entity_id, field_name, old_value_hash, new_value_hash,
         old_value_masked, new_value_masked, source_id, observed_at, crawl_run_id,
         actor_type, actor_id, change_reason, diff_json, schema_version
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        record.id,
        record.entityType,
        record.entityId,
        record.fieldName,
        nullable(record.oldValueHash),
        nullable(record.newValueHash),
        nullable(record.oldValueMasked),
        nullable(record.newValueMasked),
        nullable(record.sourceId),
        record.observedAt,
        nullable(record.crawlRunId),
        record.actorType ?? "crawler",
        nullable(record.actorId),
        nullable(record.changeReason),
        nullable(record.diffJson),
        record.schemaVersion ?? 1
      ]
    );
  }

  async upsertRecentDiffMetadata(record: RecentDiffMetadataWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    if (record.latestFieldHistoryId) {
      assertUuidV7Compatible(record.latestFieldHistoryId, "latest_field_history_id");
    }

    return runStatement(
      this.db,
      `INSERT INTO recent_diff_metadata (
         id, entity_type, entity_id, latest_field_history_id, diff_count_30d,
         last_observed_at, schema_version, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         latest_field_history_id = excluded.latest_field_history_id,
         diff_count_30d = excluded.diff_count_30d,
         last_observed_at = excluded.last_observed_at,
         schema_version = excluded.schema_version,
         updated_at = excluded.updated_at`,
      [
        record.id,
        record.entityType,
        record.entityId,
        nullable(record.latestFieldHistoryId),
        record.diffCount30d ?? 0,
        record.lastObservedAt,
        record.schemaVersion ?? 1,
        record.updatedAt
      ]
    );
  }
}
