/**
 * Content guidelines retrieval — the founder's playbook (docs/contentguidelines.md)
 * seeded into Supabase `content_guides` as one full master-prompt per format.
 *
 * When an agent writes a given format, we retrieve the RIGHT section IN FULL (by
 * the task at hand) and use it as the authoritative generation instructions. A
 * carousel task pulls the carousel prompt; "a do's-and-don'ts cheatsheet on cold
 * email" pulls the cheatsheet do's-and-don'ts prompt; etc. Retrieval = semantic
 * (match_content_guides) + a category gate + deterministic variant/new boosts.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embedOne } from "./embeddings";

const isRealKey = (k?: string): k is string => !!k && /^(eyJ|sb_)/.test(k);
function guidesKey(): string | undefined {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return isRealKey(service) ? service : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

let _db: SupabaseClient | null = null;
function guidesDb(): SupabaseClient | null {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = guidesKey();
  if (!url || !key) return null;
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

export function guidesConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && guidesKey() && (process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY));
}

export type ContentGuide = {
  key: string;
  title: string;
  category: string;
  variant: string | null;
  isNew: boolean;
  body: string;
  similarity: number;
};

/** Which guide categories are valid candidates for each producing format. */
const FORMAT_CATEGORIES: Record<string, string[]> = {
  carousel: ["carousel", "cheatsheet"],
  picture: ["carousel", "cheatsheet", "text"],
  text: ["text"],
  // video scripts have no dedicated guide in the playbook
  reels: [],
  longform: [],
  // direct categories (used by other specialists)
  profile: ["profile"],
  strategy: ["strategy"],
  description: ["description"],
};

/** Deterministic variant hint from the task wording (steers cheatsheet selection). */
function variantHint(task: string): string | null {
  const t = task.toLowerCase();
  if (/\blisticle|list of|top \d|\d+ (ways|tips|reasons|lessons|mistakes)/.test(t)) return "listicle";
  if (/\bvs\b|versus|compare|comparison/.test(t)) return "vs";
  if (/do'?s and don'?ts|dos and donts|do and don|don'?ts/.test(t)) return "dos-donts";
  if (/\bintent\b/.test(t)) return "intent";
  return null;
}

type RpcRow = { key: string; title: string; category: string; variant: string | null; is_new: boolean; body: string; similarity: number };

/**
 * Retrieve the single best guide for a (format, task), IN FULL — or null when the
 * format has no playbook section. Returns the authoritative prompt to follow.
 */
export async function getContentGuide(opts: { format: string; task: string }): Promise<ContentGuide | null> {
  const allowed = FORMAT_CATEGORIES[opts.format] ?? [];
  if (allowed.length === 0) return null;
  if (!guidesConfigured()) return null;
  const db = guidesDb();
  if (!db) return null;

  try {
    const qVec = await embedOne(opts.task.slice(0, 4000));
    const { data, error } = await db.rpc("match_content_guides", {
      query_embedding: qVec,
      // Filter server-side when the format maps to ONE category (profile / text /
      // strategy / description) so a weak one-word task can't crowd the right
      // guide out of the top-k. A high match_count covers every guide for the
      // multi-category formats (carousel → carousel + cheatsheet).
      filter_category: allowed.length === 1 ? allowed[0] : null,
      match_count: 30,
      similarity_threshold: 0.0,
    });
    if (error || !data?.length) return null;

    const hint = variantHint(opts.task);
    const ranked = (data as RpcRow[])
      .filter((r) => allowed.includes(r.category))
      .map((r) => {
        let score = r.similarity;
        if (r.is_new) score += 0.09; // prefer the current "New …" prompts over older duplicates
        if (hint && r.variant === hint) score += 0.15; // strong nudge to the asked variant
        // if the task clearly names a cheatsheet, favour cheatsheet over plain carousel
        if (/cheat\s?sheet/.test(opts.task.toLowerCase()) && r.category === "cheatsheet") score += 0.1;
        // a plain carousel ask shouldn't grab the niche "intent carousel" — demote it unless asked
        if (r.category === "carousel" && r.variant === "intent" && hint !== "intent") score -= 0.12;
        return { r, score };
      })
      .sort((a, b) => b.score - a.score);

    const top = ranked[0]?.r;
    if (!top) return null;
    return { key: top.key, title: top.title, category: top.category, variant: top.variant, isNew: top.is_new, body: top.body, similarity: top.similarity };
  } catch (err) {
    console.error("[content-guides] retrieval failed:", err);
    return null;
  }
}

/** Direct fetch of the best guide in a category (e.g. profile / strategy). */
export async function getGuideByCategory(category: string, task = category): Promise<ContentGuide | null> {
  return getContentGuide({ format: category, task });
}
