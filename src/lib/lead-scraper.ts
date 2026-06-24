/**
 * LinkedIn lead scraping — the real engine behind the Sales / CRO agent.
 *
 * It turns an ICP (roles, seniority, function, geo, company size, signals) into
 * a concrete LinkedIn people-search and pulls REAL prospects via the
 * `harvestapi/linkedin-profile-search` Apify actor (no cookies, pay-per-event,
 * optional email enrichment). The label→id maps below come straight from that
 * actor's input schema so callers can pass human-readable values.
 *
 * If APIFY_TOKEN is missing the scrape returns `configured: false` with a clear
 * note — the caller still delivers the targeting plan, it just can't pull live
 * people. We never fabricate a prospect.
 */

import { runActorSync, apifyConfigured } from "./apify";
import { leadsTestMode, fixtureSearchItems } from "./lead-fixtures";

export const LINKEDIN_SEARCH_ACTOR = "harvestapi/linkedin-profile-search";

/** Hard cap on a single scrape (cost + run-time guardrail). */
export const MAX_LEADS = 100;

/* ----------------------- label → LinkedIn filter id ----------------------- */

export const SENIORITY_IDS: Record<string, string> = {
  "in training": "100",
  "entry level": "110",
  entry: "110",
  senior: "120",
  strategic: "130",
  "entry level manager": "200",
  "experienced manager": "210",
  manager: "210",
  director: "220",
  "vice president": "300",
  vp: "300",
  cxo: "310",
  "c-level": "310",
  "c level": "310",
  executive: "310",
  owner: "320",
  partner: "320",
  "owner / partner": "320",
  founder: "320",
};

export const FUNCTION_IDS: Record<string, string> = {
  accounting: "1",
  administrative: "2",
  "arts and design": "3",
  "business development": "4",
  "community and social services": "5",
  consulting: "6",
  education: "7",
  engineering: "8",
  entrepreneurship: "9",
  finance: "10",
  "healthcare services": "11",
  healthcare: "11",
  "human resources": "12",
  hr: "12",
  "information technology": "13",
  it: "13",
  legal: "14",
  marketing: "15",
  "media and communication": "16",
  "military and protective services": "17",
  operations: "18",
  "product management": "19",
  product: "19",
  "program and project management": "20",
  purchasing: "21",
  "quality assurance": "22",
  "real estate": "23",
  research: "24",
  sales: "25",
  "customer success and support": "26",
  "customer success": "26",
  support: "26",
};

export const HEADCOUNT_CODES: Record<string, string> = {
  "self-employed": "A",
  "self employed": "A",
  "1-10": "B",
  "11-50": "C",
  "51-200": "D",
  "201-500": "E",
  "501-1000": "F",
  "501-1,000": "F",
  "1001-5000": "G",
  "1,001-5,000": "G",
  "5001-10000": "H",
  "5,001-10,000": "H",
  "10001+": "I",
  "10,001+": "I",
};

/* ------------------------------ types ------------------------------ */

export type LeadFilters = {
  /** Free-text LinkedIn search (role + niche). Supports LinkedIn search operators. */
  searchQuery?: string;
  jobTitles?: string[];
  locations?: string[];
  /** human seniority labels, e.g. ["Director","Vice President","CXO"] */
  seniority?: string[];
  /** human function labels, e.g. ["Sales","Marketing"] */
  functions?: string[];
  /** human headcount bands, e.g. ["11-50","51-200"] */
  companySize?: string[];
  recentlyChangedJobs?: boolean;
  recentlyPostedOnLinkedIn?: boolean;
  count?: number;
  findEmails?: boolean;
};

export type Lead = {
  name: string;
  firstName: string;
  lastName: string;
  headline: string;
  title: string;
  company: string;
  companyUrl: string;
  location: string;
  linkedinUrl: string;
  email: string;
  pictureUrl: string;
  id: string;
};

export type ScrapeResult = {
  configured: boolean;
  ok: boolean;
  leads: Lead[];
  requested: number;
  returned: number;
  withEmail: number;
  actor: string;
  costEstimateUsd: number;
  note: string;
  error?: string;
};

/* ------------------------------ mapping ------------------------------ */

function mapLabels(values: string[] | undefined, table: Record<string, string>): string[] {
  if (!values?.length) return [];
  const out = new Set<string>();
  for (const v of values) {
    const id = table[v.trim().toLowerCase()];
    if (id) out.add(id);
  }
  return Array.from(out);
}

export function buildActorInput(filters: LeadFilters): {
  input: Record<string, unknown>;
  count: number;
} {
  const count = Math.max(1, Math.min(MAX_LEADS, Math.round(filters.count ?? 25)));
  const input: Record<string, unknown> = {
    profileScraperMode: filters.findEmails ? "Full + email search" : "Full",
    maxItems: count,
  };
  // Each LinkedIn search page yields 25 profiles; ask for enough pages to fill
  // the requested count (maxItems is still the hard stop).
  if (count > 25) input.takePages = Math.ceil(count / 25);
  if (filters.searchQuery?.trim()) input.searchQuery = filters.searchQuery.trim();
  if (filters.jobTitles?.length) input.currentJobTitles = filters.jobTitles;
  if (filters.locations?.length) input.locations = filters.locations;

  const seniority = mapLabels(filters.seniority, SENIORITY_IDS);
  if (seniority.length) input.seniorityLevelIds = seniority;
  const functions = mapLabels(filters.functions, FUNCTION_IDS);
  if (functions.length) input.functionIds = functions;
  const headcount = mapLabels(filters.companySize, HEADCOUNT_CODES);
  if (headcount.length) input.companyHeadcount = headcount;

  if (filters.recentlyChangedJobs) input.recentlyChangedJobs = true;
  if (filters.recentlyPostedOnLinkedIn) input.recentlyPostedOnLinkedIn = true;
  return { input, count };
}

/* ------------------------------ normalize ------------------------------ */

function firstString(...vals: unknown[]): string {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

/** Defensive email extraction — the actor surfaces emails under varying keys. */
function extractEmail(item: Record<string, any>): string {
  const fromArray = (() => {
    const arr = item?.emails;
    if (!Array.isArray(arr) || !arr.length) return "";
    const first = arr[0];
    if (typeof first === "string") return first;
    return firstString(first?.email, first?.value, first?.address);
  })();
  return firstString(
    item?.email,
    item?.workEmail,
    item?.professionalEmail,
    item?.emailAddress,
    fromArray,
    item?.contactInfo?.email
  );
}

export function normalizeLead(item: Record<string, any>): Lead {
  const pos =
    (Array.isArray(item?.currentPositions) && item.currentPositions[0]) ||
    item?.currentPosition ||
    {};
  const firstName = firstString(item?.firstName, item?.first_name);
  const lastName = firstString(item?.lastName, item?.last_name);
  const name = firstString(item?.name, item?.fullName, `${firstName} ${lastName}`);
  const linkedinUrl = firstString(
    item?.linkedinUrl,
    item?.profileUrl,
    item?.url,
    item?.publicIdentifier ? `https://www.linkedin.com/in/${item.publicIdentifier}` : ""
  );
  const location = firstString(
    item?.location?.linkedinText,
    item?.location?.parsed?.text,
    item?.locationName,
    typeof item?.location === "string" ? item.location : ""
  );
  return {
    name,
    firstName,
    lastName,
    headline: firstString(item?.headline, item?.summary, pos?.title),
    title: firstString(pos?.title, item?.headline, item?.jobTitle),
    company: firstString(pos?.companyName, item?.companyName, item?.company),
    companyUrl: firstString(pos?.companyLinkedinUrl, item?.companyUrl),
    location,
    linkedinUrl,
    email: extractEmail(item),
    pictureUrl: firstString(item?.pictureUrl, item?.photo, item?.profilePicture),
    id: firstString(item?.id, item?.publicIdentifier, linkedinUrl, name),
  };
}

/* ------------------------------ scrape ------------------------------ */

export async function scrapeLinkedInLeads(filters: LeadFilters): Promise<ScrapeResult> {
  const { input, count } = buildActorInput(filters);
  const actor = LINKEDIN_SEARCH_ACTOR;

  // TEST MODE — return mock prospects in the exact actor shape (no Apify call).
  if (leadsTestMode()) {
    const leads = fixtureSearchItems(count, !!filters.findEmails).map(normalizeLead).filter((l) => l.name || l.linkedinUrl);
    const withEmail = leads.filter((l) => l.email).length;
    return {
      configured: true,
      ok: true,
      leads,
      requested: count,
      returned: leads.length,
      withEmail,
      actor: `${actor} (TEST)`,
      costEstimateUsd: 0,
      note: `TEST MODE — ${leads.length} mock prospects (no live Apify call).`,
    };
  }

  if (!apifyConfigured()) {
    return {
      configured: false,
      ok: false,
      leads: [],
      requested: count,
      returned: 0,
      withEmail: 0,
      actor,
      costEstimateUsd: 0,
      note: "Live LinkedIn scraping is not configured. Set APIFY_TOKEN in the environment to pull real prospects via the harvestapi/linkedin-profile-search Apify actor. The targeting plan and qualification rules below are ready to run the moment it is set.",
    };
  }

  // rough cost per profile incl. amortised search-page cost (Full vs Full+email)
  const perProfile = filters.findEmails ? 0.012 : 0.008;

  const res = await runActorSync<Record<string, unknown>>(actor, input, {
    maxItems: count,
    timeoutMs: 240_000,
  });

  if (!res.ok) {
    return {
      configured: true,
      ok: false,
      leads: [],
      requested: count,
      returned: 0,
      withEmail: 0,
      actor,
      costEstimateUsd: 0,
      note: `The LinkedIn scrape did not complete: ${res.error}`,
      error: res.error,
    };
  }

  const leads = res.items.map(normalizeLead).filter((l) => l.name || l.linkedinUrl);
  const withEmail = leads.filter((l) => l.email).length;

  return {
    configured: true,
    ok: true,
    leads,
    requested: count,
    returned: leads.length,
    withEmail,
    actor,
    costEstimateUsd: Math.round(leads.length * perProfile * 100) / 100,
    note: `Scraped ${leads.length} real LinkedIn prospect${leads.length === 1 ? "" : "s"} via ${actor}${
      filters.findEmails ? ` (${withEmail} with an email found)` : ""
    }.`,
  };
}
