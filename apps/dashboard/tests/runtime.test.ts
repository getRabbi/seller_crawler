import { describe, expect, it } from "vitest";

import { runtimePanels } from "../lib/runtime";

describe("dashboard runtime panels", () => {
  it("shows locked Phase 0 provider state", () => {
    expect(runtimePanels.map((panel) => panel.value)).toContain("development_locked");
    expect(runtimePanels.map((panel) => panel.value)).toContain("disabled");
    expect(runtimePanels.map((panel) => panel.value)).toContain("manual only");
  });
});
