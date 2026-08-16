import { ContactsRepository } from "./contacts";
import { CoreRepository } from "./core";
import type { D1Database } from "./d1";
import { HistoryRepository } from "./history";
import { OperationsRepository } from "./operations";
import type {
  AuditEventWrite,
  ContactWrite,
  CrawlRunWrite,
  FeatureFlagWrite,
  FieldHistoryWrite,
  EntityResolutionDecisionWrite,
  IdempotencyKeyWrite,
  MarketplaceAccountWrite,
  OutreachStateWrite,
  QuotaStateWrite,
  RecentDiffMetadataWrite,
  ReviewQueueWrite,
  ScoreComponentWrite,
  SellerAliasWrite,
  SellerMergeLinkAuditWrite,
  SellerMergeRedirectWrite,
  SellerProductLinkWrite,
  SellerWrite,
  SourceRegistryWrite,
  SourceWrite,
  SuppressionWrite
} from "./types";

export interface DatabasePartitions {
  core: D1Database;
  contacts: D1Database;
  operations: D1Database;
  history: D1Database;
}

export interface RepositorySet {
  core: CoreRepository;
  contacts: ContactsRepository;
  operations: OperationsRepository;
  history: HistoryRepository;
}

export interface CoreChanges {
  sellers?: SellerWrite[];
  marketplaceAccounts?: MarketplaceAccountWrite[];
  aliases?: SellerAliasWrite[];
  scoreComponents?: ScoreComponentWrite[];
  productLinks?: SellerProductLinkWrite[];
  resolutionDecisions?: EntityResolutionDecisionWrite[];
  mergeRedirects?: SellerMergeRedirectWrite[];
  mergeLinkAudits?: SellerMergeLinkAuditWrite[];
}

export interface ContactChanges {
  contacts?: ContactWrite[];
  suppressions?: SuppressionWrite[];
  outreachStates?: OutreachStateWrite[];
  auditEvents?: AuditEventWrite[];
}

export interface OperationChanges {
  sources?: SourceWrite[];
  crawlRuns?: CrawlRunWrite[];
  reviewQueueItems?: ReviewQueueWrite[];
  sourceRegistry?: SourceRegistryWrite[];
  idempotencyKeys?: IdempotencyKeyWrite[];
  quotaStates?: QuotaStateWrite[];
  featureFlags?: FeatureFlagWrite[];
}

export interface HistoryChanges {
  fieldHistory?: FieldHistoryWrite[];
  recentDiffMetadata?: RecentDiffMetadataWrite[];
}

export interface UnitOfWorkChanges {
  core?: CoreChanges;
  contacts?: ContactChanges;
  operations?: OperationChanges;
  history?: HistoryChanges;
}

export type UnitOfWorkStage = "core" | "contacts" | "operations" | "history";

export type UnitOfWorkResult =
  | {
      ok: true;
      completedStages: UnitOfWorkStage[];
    }
  | {
      ok: false;
      completedStages: UnitOfWorkStage[];
      failedStage: UnitOfWorkStage;
      retryable: true;
      errorMessage: string;
    };

export class CrossDatabaseUnitOfWork {
  constructor(private readonly repositories: RepositorySet) {}

  static fromDatabases(databases: DatabasePartitions): CrossDatabaseUnitOfWork {
    return new CrossDatabaseUnitOfWork({
      core: new CoreRepository(databases.core),
      contacts: new ContactsRepository(databases.contacts),
      operations: new OperationsRepository(databases.operations),
      history: new HistoryRepository(databases.history)
    });
  }

  async commit(changes: UnitOfWorkChanges): Promise<UnitOfWorkResult> {
    const completedStages: UnitOfWorkStage[] = [];
    let currentStage: UnitOfWorkStage = "core";

    try {
      currentStage = "core";
      await this.writeCore(changes.core);
      completedStages.push("core");

      currentStage = "contacts";
      await this.assertKnownSellers(changes.contacts?.contacts ?? []);
      await this.writeContacts(changes.contacts);
      completedStages.push("contacts");

      currentStage = "operations";
      await this.writeOperations(changes.operations);
      completedStages.push("operations");

      currentStage = "history";
      await this.writeHistory(changes.history);
      completedStages.push("history");

      return { ok: true, completedStages };
    } catch (error) {
      return {
        ok: false,
        completedStages,
        failedStage: currentStage,
        retryable: true,
        errorMessage: error instanceof Error ? error.message : "unknown write failure"
      };
    }
  }

  private async writeCore(changes: CoreChanges | undefined): Promise<void> {
    for (const seller of changes?.sellers ?? []) {
      await this.repositories.core.upsertSeller(seller);
    }
    for (const account of changes?.marketplaceAccounts ?? []) {
      await this.repositories.core.upsertMarketplaceAccount(account);
    }
    for (const alias of changes?.aliases ?? []) {
      await this.repositories.core.upsertSellerAlias(alias);
    }
    for (const component of changes?.scoreComponents ?? []) {
      await this.repositories.core.insertScoreComponent(component);
    }
    for (const productLink of changes?.productLinks ?? []) {
      await this.repositories.core.upsertProductLink(productLink);
    }
    for (const decision of changes?.resolutionDecisions ?? []) {
      await this.repositories.core.upsertResolutionDecision(decision);
    }
    for (const redirect of changes?.mergeRedirects ?? []) {
      await this.repositories.core.upsertMergeRedirect(redirect);
    }
    for (const link of changes?.mergeLinkAudits ?? []) {
      await this.repositories.core.upsertMergeLinkAudit(link);
    }
  }

  private async writeContacts(changes: ContactChanges | undefined): Promise<void> {
    for (const contact of changes?.contacts ?? []) {
      await this.repositories.contacts.upsertContact(contact);
    }
    for (const suppression of changes?.suppressions ?? []) {
      await this.repositories.contacts.upsertSuppression(suppression);
    }
    for (const outreachState of changes?.outreachStates ?? []) {
      await this.repositories.contacts.upsertOutreachState(outreachState);
    }
    for (const event of changes?.auditEvents ?? []) {
      await this.repositories.contacts.insertAuditEvent(event);
    }
  }

  private async writeOperations(changes: OperationChanges | undefined): Promise<void> {
    for (const source of changes?.sources ?? []) {
      await this.repositories.operations.upsertSource(source);
    }
    for (const run of changes?.crawlRuns ?? []) {
      await this.repositories.operations.upsertCrawlRun(run);
    }
    for (const reviewItem of changes?.reviewQueueItems ?? []) {
      await this.repositories.operations.upsertReviewQueueItem(reviewItem);
    }
    for (const source of changes?.sourceRegistry ?? []) {
      await this.repositories.operations.upsertSourceRegistry(source);
    }
    for (const key of changes?.idempotencyKeys ?? []) {
      await this.repositories.operations.recordIdempotencyKey(key);
    }
    for (const quota of changes?.quotaStates ?? []) {
      await this.repositories.operations.upsertQuotaState(quota);
    }
    for (const flag of changes?.featureFlags ?? []) {
      await this.repositories.operations.upsertFeatureFlag(flag);
    }
  }

  private async writeHistory(changes: HistoryChanges | undefined): Promise<void> {
    for (const item of changes?.fieldHistory ?? []) {
      await this.repositories.history.insertFieldHistory(item);
    }
    for (const metadata of changes?.recentDiffMetadata ?? []) {
      await this.repositories.history.upsertRecentDiffMetadata(metadata);
    }
  }

  private async assertKnownSellers(contacts: ContactWrite[]): Promise<void> {
    const sellerIds = new Set(contacts.map((contact) => contact.sellerId));

    for (const sellerId of sellerIds) {
      if (!(await this.repositories.core.sellerExists(sellerId))) {
        throw new Error(`Cannot write contact for unknown seller_id ${sellerId}.`);
      }
    }
  }
}
