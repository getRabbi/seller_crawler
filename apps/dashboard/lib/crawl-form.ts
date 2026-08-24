export type CrawlFormMode = "find_sellers" | "resolve_seller" | "known_websites";

export interface CrawlFormValues {
  mode: CrawlFormMode;
  keywords: string;
  seedUrls: string;
  contacts: string[];
  target: string;
  maxResultPages: string;
  maxOfficialPages: string;
  depth: string;
  targetSellerId?: string;
}

export function validateCrawlForm(values: CrawlFormValues): string | null {
  const errors: string[] = [];

  if (values.mode === "find_sellers") {
    const queries = lines(values.keywords);
    if (queries.length === 0) {
      errors.push("enter at least one keyword or product query");
    } else if (queries.length > 5) {
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

  if (!boundedInteger(values.target, 1, 100)) {
    errors.push("set target sellers from 1 to 100");
  }
  if (values.mode === "find_sellers" && !boundedInteger(values.maxResultPages, 1, 3)) {
    errors.push("set Amazon result pages from 1 to 3");
  }
  if (!boundedInteger(values.maxOfficialPages, 1, 25)) {
    errors.push("set official pages per seller from 1 to 25");
  }
  if (!boundedInteger(values.depth, 0, 3)) {
    errors.push("set crawl depth from 0 to 3");
  }
  if (values.contacts.length === 0) {
    errors.push("select at least one contact priority");
  }
  const plannedSites = values.mode === "known_websites"
    ? Math.max(1, lines(values.seedUrls).length)
    : values.mode === "resolve_seller"
      ? 1
      : Number(values.target);
  if (
    boundedInteger(values.maxOfficialPages, 1, 25) &&
    Number.isInteger(plannedSites) &&
    plannedSites * Number(values.maxOfficialPages) > 100
  ) {
    errors.push("keep the official website budget at or below 100 pages per run");
  }

  return errors.length > 0
    ? `Complete the required fields: ${errors.join("; ")}.`
    : null;
}

export function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function boundedInteger(value: string, minimum: number, maximum: number): boolean {
  if (value.trim() === "") return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum;
}
