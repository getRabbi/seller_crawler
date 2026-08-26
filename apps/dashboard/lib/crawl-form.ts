export type CrawlFormMode = "find_sellers" | "resolve_seller" | "known_websites";

export interface CrawlFormValues {
  mode: CrawlFormMode;
  keywords: string;
  seedUrls: string;
  contacts: string[];
  target: string;
  targetSellerId?: string;
}

export const SELLER_TARGET_OPTIONS = [100, 200, 300] as const;
const PRODUCTS_PER_AMAZON_RESULT_PAGE = 24;
const MAX_RESULT_PAGES_PER_KEYWORD = 15;
export const OFFICIAL_PAGES_PER_SITE = 4;
export const DEFAULT_CRAWL_DEPTH = 2;

export function validateCrawlForm(values: CrawlFormValues): string | null {
  const errors: string[] = [];

  if (values.mode === "find_sellers") {
    const rawQueries = lines(values.keywords);
    const queries = searchQueries(values.keywords);
    if (queries.length === 0) {
      errors.push("enter at least one keyword or product query");
    } else if (rawQueries.length > 5) {
      errors.push("use no more than five keyword queries");
    }
  } else if (values.mode === "known_websites") {
    const urls = lines(values.seedUrls);
    if (urls.length === 0) {
      errors.push("enter at least one approved HTTPS website URL");
    } else if (urls.length > 20) {
      errors.push("use no more than twenty website URLs");
    }
    if (values.targetSellerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(values.targetSellerId)) {
      errors.push("use a valid UUIDv7 seller ID");
    }
    if (values.targetSellerId && urls.length !== 1) {
      errors.push("use exactly one website URL when linking an existing seller");
    }
  } else if (!values.targetSellerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(values.targetSellerId)) {
    errors.push("select an existing seller with a valid UUIDv7 ID");
  }

  if (
    values.mode === "find_sellers" &&
    !SELLER_TARGET_OPTIONS.includes(Number(values.target) as (typeof SELLER_TARGET_OPTIONS)[number])
  ) {
    errors.push("choose a seller target of 100, 200, or 300");
  }
  if (values.contacts.length === 0) {
    errors.push("select at least one contact priority");
  }

  return errors.length > 0
    ? `Complete the required fields: ${errors.join("; ")}.`
    : null;
}

export function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

export function searchQueries(value: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const query of lines(value)) {
    const cleaned = query.replace(/\s+/g, " ").trim();
    const key = cleaned.normalize("NFKC").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function resultPageLimit(targetSellerCount: number, keywordCount: number): number {
  const safeTarget = Math.max(1, Math.floor(targetSellerCount));
  const safeKeywordCount = Math.max(1, Math.floor(keywordCount));
  return Math.min(
    MAX_RESULT_PAGES_PER_KEYWORD,
    Math.max(1, Math.ceil(safeTarget / (PRODUCTS_PER_AMAZON_RESULT_PAGE * safeKeywordCount)))
  );
}
