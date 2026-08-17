"use client";

import { useState, type FormEvent } from "react";
import type {
  CreateCrawlRunRequest,
  CrawlRunActionResponse
} from "@seller-intelligence/shared-types/dashboard";

import { DashboardShell } from "../../../components/dashboard-shell";
import { StateBlock } from "../../../components/status";
import { postWorkerApi } from "../../../lib/api";

const marketplaces = [
  ["amazon.com", "Amazon.com"], ["amazon.co.uk", "Amazon.co.uk"],
  ["amazon.ca", "Amazon.ca"], ["amazon.com.au", "Amazon.com.au"],
  ["amazon.de", "Amazon.de"], ["amazon.fr", "Amazon.fr"],
  ["amazon.it", "Amazon.it"], ["amazon.es", "Amazon.es"]
] as const;

const countries = [
  ["", "All"], ["BD", "Bangladesh"], ["CN", "China"], ["IN", "India"],
  ["VN", "Vietnam"], ["PK", "Pakistan"], ["US", "United States"],
  ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"],
  ["DE", "Germany"], ["FR", "France"], ["IT", "Italy"], ["ES", "Spain"]
] as const;

export default function NewCrawlPage() {
  const [mode, setMode] = useState<"find_sellers" | "known_websites">("find_sellers");
  const [keywords, setKeywords] = useState("stainless steel bottle");
  const [seedUrls, setSeedUrls] = useState("");
  const [marketplace, setMarketplace] = useState("amazon.com");
  const [country, setCountry] = useState("");
  const [target, setTarget] = useState("10");
  const [maxResultPages, setMaxResultPages] = useState("1");
  const [maxOfficialPages, setMaxOfficialPages] = useState("6");
  const [depth, setDepth] = useState("2");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [requireLocation, setRequireLocation] = useState(false);
  const [requireWebsite, setRequireWebsite] = useState(false);
  const [manufacturer, setManufacturer] = useState<"any" | "likely">("any");
  const [trader, setTrader] = useState<"any" | "likely">("any");
  const [contacts, setContacts] = useState(["email", "phone", "whatsapp", "wechat"]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CrawlRunActionResponse | null>(null);
  const [error, setError] = useState("");

  function toggleContact(value: string) {
    setContacts((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);
    const idempotencyKey = `dashboard-${crypto.randomUUID()}`;
    const payload: CreateCrawlRunRequest = {
      mode,
      contactTypes: contacts as CreateCrawlRunRequest["contactTypes"],
      targetSellerCount: Number(target),
      maxResultPages: Number(maxResultPages),
      maxOfficialPages: Number(maxOfficialPages),
      crawlDepth: Number(depth),
      stopAfterTarget: true,
      idempotencyKey,
      ...(mode === "find_sellers"
        ? {
            keywords: lines(keywords), marketplace,
            countryCodes: country ? [country] : [],
            filters: {
              category: category || undefined,
              brandKeyword: brand || undefined,
              sellerNameKeyword: sellerName || undefined,
              requirePublicLocation: requireLocation,
              hasOfficialWebsite: requireWebsite,
              manufacturerLikelihood: manufacturer,
              traderLikelihood: trader
            }
          }
        : { seedUrls: lines(seedUrls) })
    };
    try {
      setResult(await postWorkerApi<CrawlRunActionResponse>("/v1/crawl-runs", payload));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The crawl could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell active="new-crawl" eyebrow="Operator Control" title="New Crawl">
      <form className="crawl-form" onSubmit={submit}>
        <div className="mode-switch" role="group" aria-label="Crawl mode">
          <button className={mode === "find_sellers" ? "selected" : ""} onClick={() => setMode("find_sellers")} type="button">Find Sellers</button>
          <button className={mode === "known_websites" ? "selected" : ""} onClick={() => setMode("known_websites")} type="button">Crawl Known Websites</button>
        </div>

        <section className="form-card">
          <h2>{mode === "find_sellers" ? "Amazon identity discovery" : "Official website enrichment"}</h2>
          {mode === "find_sellers" ? (
            <div className="form-grid">
              <label className="wide">Keywords / product queries<textarea maxLength={600} onChange={(event) => setKeywords(event.target.value)} rows={4} value={keywords} /><small>One query per line, maximum five.</small></label>
              <label>Marketplace<select onChange={(event) => setMarketplace(event.target.value)} value={marketplace}>{marketplaces.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Seller / business country<select onChange={(event) => setCountry(event.target.value)} value={country}>{countries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Uses displayed business evidence, not marketplace.</small></label>
              <label>Category / industry<input onChange={(event) => setCategory(event.target.value)} value={category} /></label>
              <label>Brand keyword<input onChange={(event) => setBrand(event.target.value)} value={brand} /></label>
              <label>Seller name keyword<input onChange={(event) => setSellerName(event.target.value)} value={sellerName} /></label>
              <label>Manufacturer likelihood<select onChange={(event) => setManufacturer(event.target.value as "any" | "likely")} value={manufacturer}><option value="any">Any</option><option value="likely">Likely</option></select></label>
              <label>Trader likelihood<select onChange={(event) => setTrader(event.target.value as "any" | "likely")} value={trader}><option value="any">Any</option><option value="likely">Likely</option></select></label>
              <label className="check"><input checked={requireLocation} onChange={(event) => setRequireLocation(event.target.checked)} type="checkbox" /> Require public location</label>
              <label className="check"><input checked={requireWebsite} onChange={(event) => setRequireWebsite(event.target.checked)} type="checkbox" /> Has official website</label>
            </div>
          ) : (
            <label>Approved HTTPS website URLs<textarea onChange={(event) => setSeedUrls(event.target.value)} placeholder="https://example.com/" rows={7} value={seedUrls} /><small>One public HTTPS URL per line, maximum twenty. Private/local targets are rejected.</small></label>
          )}
        </section>

        <section className="form-card">
          <h2>Targets and enrichment</h2>
          <div className="form-grid">
            <label>Target sellers<select onChange={(event) => setTarget(event.target.value)} value={target}>{[10, 25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Amazon result pages<input max="3" min="1" onChange={(event) => setMaxResultPages(event.target.value)} type="number" value={maxResultPages} /></label>
            <label>Official pages / seller<input max="25" min="1" onChange={(event) => setMaxOfficialPages(event.target.value)} type="number" value={maxOfficialPages} /></label>
            <label>Crawl depth<input max="3" min="0" onChange={(event) => setDepth(event.target.value)} type="number" value={depth} /></label>
          </div>
          <fieldset><legend>Contact priorities</legend><div className="checkbox-row">{["email", "phone", "whatsapp", "wechat"].map((value) => <label className="check" key={value}><input checked={contacts.includes(value)} onChange={() => toggleContact(value)} type="checkbox" /> {value}</label>)}</div></fieldset>
        </section>

        <div className="form-actions"><button className="primary-action" disabled={submitting || contacts.length === 0} type="submit">{submitting ? "STARTING…" : "START CRAWL"}</button><span>One active Student unit. Additional requests queue automatically.</span></div>
      </form>
      {error ? <StateBlock detail={error} title="Crawl not created" tone="danger" /> : null}
      {result ? <StateBlock detail={`Run ${result.run.id} is ${result.run.status}. ${result.queued ? "It will start when the one-unit slot is free." : "Scrapy Cloud control accepted it."}`} title="Crawl created" /> : null}
    </DashboardShell>
  );
}

function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}
