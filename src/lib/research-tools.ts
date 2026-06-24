import { tool } from "ai";
import { z } from "zod";

/**
 * Research-agent tools.
 *
 * webSearch is PLUGGABLE: if a search provider key is configured (TAVILY_API_KEY)
 * it returns live results; otherwise it returns a clear "not configured" payload
 * so the agent proceeds from positioning + reasoning (labelled as hypotheses).
 *
 * `runWebSearch` is the raw function so other places (the Jarvis Research
 * specialist) can search live without going through the tool-call loop.
 *
 * Live multi-platform trend scraping (LinkedIn / X / YouTube / Reddit / Quora
 * via Apify actors) is the documented fast-follow — it slots in here as
 * additional tools without changing the agent.
 */

export type WebSearchPlatform = "any" | "linkedin" | "x" | "youtube" | "reddit" | "quora";

export type WebSearchResult = {
  configured: boolean;
  query: string;
  results?: { title: string; url: string; snippet: string }[];
  note?: string;
  error?: string;
};

const SITE_MAP: Record<string, string> = {
  linkedin: "linkedin.com",
  x: "x.com OR twitter.com",
  youtube: "youtube.com",
  reddit: "reddit.com",
  quora: "quora.com",
};

export async function runWebSearch(
  query: string,
  platform: WebSearchPlatform = "any",
  limit = 6
): Promise<WebSearchResult> {
  const key = process.env.TAVILY_API_KEY;
  const q = platform !== "any" && SITE_MAP[platform] ? `${query} site:${SITE_MAP[platform]}` : query;

  if (!key) {
    return {
      configured: false,
      query: q,
      note: "Live web search is not configured (set TAVILY_API_KEY, or wire an Apify actor). Proceed using the founder's positioning and your knowledge, and clearly label findings as hypotheses to validate.",
    };
  }
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: q,
        max_results: limit,
        search_depth: "basic",
        include_answer: false,
      }),
    });
    if (!res.ok) return { configured: true, error: `search ${res.status}`, query: q };
    const data = await res.json();
    return {
      configured: true,
      query: q,
      results: (data.results || []).slice(0, limit).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: (r.content || "").slice(0, 400),
      })),
    };
  } catch (err) {
    return { configured: true, error: String(err), query: q };
  }
}

export function buildResearchTools() {
  return {
    webSearch: tool({
      description:
        "Search the live web for current discussions, questions, and trending posts in the founder's niche. Returns titles, urls, and snippets. Use to ground trend claims in what is actually being said right now.",
      parameters: z.object({
        query: z.string().describe("The search query."),
        platform: z
          .enum(["any", "linkedin", "x", "youtube", "reddit", "quora"])
          .default("any")
          .describe("Bias the search toward a platform (site: filter)."),
        limit: z.number().int().min(1).max(10).default(6),
      }),
      execute: async ({ query, platform, limit }) => runWebSearch(query, platform, limit),
    }),
  };
}
