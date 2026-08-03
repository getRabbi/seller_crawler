import { describe, expect, it } from "vitest";

import {
  contacts,
  dashboardNav,
  reviewQueue,
  sellers,
  workerApiPaths
} from "../lib/dashboard-data";
import { runtimePanels } from "../lib/runtime";

describe("dashboard runtime panels", () => {
  it("shows locked provider state", () => {
    expect(runtimePanels.map((panel) => panel.value)).toContain("development_locked");
    expect(runtimePanels.map((panel) => panel.value)).toContain("disabled");
    expect(runtimePanels.map((panel) => panel.value)).toContain("manual only");
  });

  it("covers all required dashboard pages", () => {
    expect(dashboardNav.map((item) => item.href)).toEqual([
      "/",
      "/sellers",
      "/contacts",
      "/review-queue",
      "/crawl-health",
      "/sources",
      "/suppression",
      "/export"
    ]);
    expect(sellers.length).toBeGreaterThan(0);
  });

  it("keeps dashboard data behind versioned Worker API paths", () => {
    expect(Object.values(workerApiPaths)).toHaveLength(8);
    expect(Object.values(workerApiPaths).every((path) => path.startsWith("/v1/"))).toBe(true);
  });

  it("keeps browser contact values masked and shows reveal audit events", () => {
    expect(contacts.every((contact) => contact.displayValueMasked.includes("***"))).toBe(true);
    expect(contacts.every((contact) => contact.revealAuditEvent.actor.length > 0)).toBe(true);
    expect(JSON.stringify(contacts)).not.toContain("sales@");
    expect(JSON.stringify(contacts)).not.toContain("+14155552671");
  });

  it("keeps entity-resolution review scores in manual-review range", () => {
    const duplicateReviews = reviewQueue.filter(
      (item) => item.reviewType === "possible_duplicate_seller"
    );

    expect(duplicateReviews.length).toBeGreaterThan(0);
    expect(duplicateReviews.every((item) => item.score >= 70 && item.score <= 91)).toBe(true);
  });
});
