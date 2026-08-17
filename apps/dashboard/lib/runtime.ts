export interface RuntimePanel {
  label: string;
  value: string;
  detail: string;
}

export const runtimePanels: RuntimePanel[] = [
  {
    label: "Runner",
    value: "Zyte Student — Active",
    detail: "One existing Student Scrapy Cloud unit is the operator runner."
  },
  {
    label: "Live crawl",
    value: "Operator Controlled",
    detail: "Only authenticated, bounded operator requests can start a crawl."
  },
  {
    label: "Amazon",
    value: "Active",
    detail: "Public-page identity discovery is available within source policy limits."
  },
  {
    label: "Discovery",
    value: "Active",
    detail: "Amazon keyword/product discovery is active; paid generic search remains off."
  },
  {
    label: "Official enrichment",
    value: "Active",
    detail: "Public official-site contact enrichment is active."
  },
  {
    label: "Zyte unit",
    value: "1 / 1",
    detail: "Additional work queues; no second unit or paid fallback can start."
  },
  {
    label: "Paid services",
    value: "Locked",
    detail: "Zyte API, extra units, paid add-ons, and credit runners remain disabled."
  }
];
