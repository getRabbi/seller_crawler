export interface RuntimePanel {
  label: string;
  value: string;
  detail: string;
}

export const runtimePanels: RuntimePanel[] = [
  {
    label: "Runner",
    value: "development_locked",
    detail: "Local development fixtures only; production runner selection is blocked."
  },
  {
    label: "Live crawl",
    value: "disabled",
    detail: "No live crawling, marketplace crawling, or production schedule is active."
  },
  {
    label: "Zyte API",
    value: "disabled",
    detail: "The PAYG Zyte API remains off and has a zero request budget."
  },
  {
    label: "Fallbacks",
    value: "manual only",
    detail: "Actions burst and credit-backed runners cannot activate automatically."
  }
];
