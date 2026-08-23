export type CrawlFormMode = "find_sellers" | "known_websites";

export interface CrawlFormValues {
  mode: CrawlFormMode;
  keywords: string;
  seedUrls: string;
  contacts: string[];
  target: string;
  maxResultPages: string;
  maxOfficialPages: string;
  depth: string;
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
  } else {
    const urls = lines(values.seedUrls);
    if (urls.length === 0) {
      errors.push("enter at least one approved HTTPS website URL");
    } else if (urls.length > 20) {
      errors.push("use no more than twenty website URLs");
    }
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
