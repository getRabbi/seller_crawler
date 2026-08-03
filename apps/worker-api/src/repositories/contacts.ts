import { nullable, runStatement, type D1Database, type D1Result } from "./d1";
import { assertUuidV7Compatible } from "./ids";
import type { AuditEventWrite, ContactWrite, OutreachStateWrite, SuppressionWrite } from "./types";

export class ContactsRepository {
  constructor(private readonly db: D1Database) {}

  async upsertContact(record: ContactWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    assertUuidV7Compatible(record.sellerId, "seller_id");
    return runStatement(
      this.db,
      `INSERT INTO contacts (
         id, seller_id, contact_type, contact_value_ciphertext, normalized_hash,
         display_value_masked, classification, confidence, source_id, first_seen_at,
         last_seen_at, last_verified_at, schema_version, parser_version, status,
         outreach_eligible
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         contact_value_ciphertext = excluded.contact_value_ciphertext,
         normalized_hash = excluded.normalized_hash,
         display_value_masked = excluded.display_value_masked,
         classification = excluded.classification,
         confidence = excluded.confidence,
         source_id = excluded.source_id,
         last_seen_at = excluded.last_seen_at,
         last_verified_at = excluded.last_verified_at,
         schema_version = excluded.schema_version,
         parser_version = excluded.parser_version,
         status = excluded.status,
         outreach_eligible = excluded.outreach_eligible`,
      [
        record.id,
        record.sellerId,
        record.contactType,
        record.contactValueCiphertext,
        record.normalizedHash,
        nullable(record.displayValueMasked),
        record.classification,
        record.confidence,
        record.sourceId,
        record.firstSeenAt,
        record.lastSeenAt,
        nullable(record.lastVerifiedAt),
        record.schemaVersion ?? 1,
        record.parserVersion,
        record.status ?? "active",
        record.outreachEligible ? 1 : 0
      ]
    );
  }

  async upsertSuppression(record: SuppressionWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    if (record.sellerId) {
      assertUuidV7Compatible(record.sellerId, "seller_id");
    }

    return runStatement(
      this.db,
      `INSERT INTO suppression_list (
         id, seller_id, contact_hash, domain, reason, created_at, expires_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         seller_id = excluded.seller_id,
         contact_hash = excluded.contact_hash,
         domain = excluded.domain,
         reason = excluded.reason,
         expires_at = excluded.expires_at`,
      [
        record.id,
        nullable(record.sellerId),
        nullable(record.contactHash),
        nullable(record.domain),
        record.reason,
        record.createdAt,
        nullable(record.expiresAt)
      ]
    );
  }

  async upsertOutreachState(record: OutreachStateWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    assertUuidV7Compatible(record.sellerId, "seller_id");
    if (record.contactId) {
      assertUuidV7Compatible(record.contactId, "contact_id");
    }

    return runStatement(
      this.db,
      `INSERT INTO outreach_state (
         id, seller_id, contact_id, outreach_status, channel, last_outreach_at,
         next_allowed_at, operator_notes, schema_version, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         seller_id = excluded.seller_id,
         contact_id = excluded.contact_id,
         outreach_status = excluded.outreach_status,
         channel = excluded.channel,
         last_outreach_at = excluded.last_outreach_at,
         next_allowed_at = excluded.next_allowed_at,
         operator_notes = excluded.operator_notes,
         schema_version = excluded.schema_version,
         updated_at = excluded.updated_at`,
      [
        record.id,
        record.sellerId,
        nullable(record.contactId),
        record.outreachStatus ?? "not_started",
        nullable(record.channel),
        nullable(record.lastOutreachAt),
        nullable(record.nextAllowedAt),
        nullable(record.operatorNotes),
        record.schemaVersion ?? 1,
        record.updatedAt
      ]
    );
  }

  async insertAuditEvent(record: AuditEventWrite): Promise<D1Result> {
    assertUuidV7Compatible(record.id);
    return runStatement(
      this.db,
      `INSERT INTO audit_events (
         id, event_type, entity_type, entity_id, actor_id, old_value_hash,
         new_value_hash, old_value_masked, new_value_masked, reason,
         metadata_json, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        record.id,
        record.eventType,
        record.entityType,
        record.entityId,
        nullable(record.actorId),
        nullable(record.oldValueHash),
        nullable(record.newValueHash),
        nullable(record.oldValueMasked),
        nullable(record.newValueMasked),
        nullable(record.reason),
        nullable(record.metadataJson),
        record.createdAt
      ]
    );
  }
}
