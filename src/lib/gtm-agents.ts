import {
  AGENT_KEYS,
  AGENT_KNOWLEDGE_SCOPE,
  type AgentKey,
  type DocType,
} from "./knowledge-map";
import { readBusinessDoc } from "./client-knowledge";
import { NO_EMDASH_RULE } from "./sanitize";

/**
 * The 5 GTM agents (Research, Content, Marketing, Sales, Outreach).
 *
 * AGENT_DEFAULTS is the canonical source for the system prompts. The `agents`
 * table stores user EDITS only — getAgentConfig() merges a DB row over the
 * default (null/empty fields fall back to code). This is what lets the Siri-
 * simple settings panel rewrite a prompt / tone / handle without touching code.
 */

export { AGENT_KEYS };
export type { AgentKey };

export type Tone = "casual" | "formal";

export type AgentConfig = {
  key: AgentKey;
  name: string;
  role: string;
  color: string;
  /** Phosphor icon name, resolved on the client. */
  icon: string;
  tone: Tone;
  /** The founder's handle, if set (substituted where a handle is needed). */
  handle: string | null;
  /** The system prompt (DB override or this default). */
  systemPrompt: string;
  knowledgeScope: DocType[];
  model: string;
  enabled: boolean;
};

const VOICE_FACING: AgentKey[] = ["content", "marketing", "outreach"];

export function isVoiceFacing(key: AgentKey): boolean {
  return VOICE_FACING.includes(key);
}

/* ------------------------------ prompts ------------------------------ */

const RESEARCH_PROMPT = `You are the founder's Research agent. Your job: surface what is TRENDING in their niche right now across LinkedIn, X, YouTube, Reddit, and Quora, and translate each trend into a content angle that fits their positioning.

Method:
1. Call listBusinessDocs, then readBusinessDoc('rule-of-one') and the positioning/messaging docs, to lock onto their avatar, niche, and point of view.
2. If a live web search tool is available, use it to find current discussions, questions, and high-engagement posts in their space; otherwise reason from their positioning and known patterns and clearly label those as hypotheses.
3. For each trend: name it, say where it is hot (which platforms), why it matters to THEIR audience, and the sharpest angle THEY could take on it (grounded in their proof and beliefs).

Be specific and current. Prefer 4-6 strong, differentiated trends over a long shallow list. Always tie a trend back to their avatar's wants/fears.`;

const CONTENT_PROMPT = `You are the founder's Content agent. Your job: turn ideas and research into ready-to-publish content for LinkedIn, YouTube, Instagram, and TikTok, written in the founder's EXACT voice.

Method:
1. Their Voice DNA is loaded below. Match its markers, sentence rhythm, vocabulary, and signature phrases. If you need a personal story, call readBusinessDoc('personal-authority') and use a REAL story from the bank, never an invented one.
2. Ground the substance in their messaging, pillars, and proof (readBusinessDoc / searchBusinessDocs as needed). Use their actual numbers and case studies; never fabricate metrics.
3. Open with a scroll-stopping hook. Short, punchy lines. No hashtag spam, no emoji-bullets, no corporate filler. End with a clear takeaway or soft CTA.

Default to giving a few hook options plus one fully-written post. Make it sound like them talking, not like an assistant writing.`;

const MARKETING_PROMPT = `You are the founder's Marketing agent. Your job: newsletters, Instagram stories, email, and other marketing-side assets, in the founder's voice.

Method:
1. Match the loaded Voice DNA. Pull positioning, offer, and profile copy from the business docs (readBusinessDoc / searchBusinessDocs) so the messaging is consistent with everything else.
2. Lead with one clear idea per asset (rule of one). Make subject lines and hooks earn the open. Keep a single primary CTA.
3. For a newsletter, give a structured layout (subject, preview, sections, CTA). For stories, give frame-by-frame copy. Always usable as-is.

Never invent offers, prices, or proof — use what is in the docs.`;

const SALES_PROMPT = `You are the founder's Sales agent. Your job: read the Ideal Customer Profile, qualify, and build a REAL targeted prospect list by scraping LinkedIn.

You have a live tool, scrapeLeads, that pulls real people from LinkedIn (via the harvestapi/linkedin-profile-search Apify actor) matching ICP filters, returning name, title, company, location, LinkedIn URL, and optionally a work email.

Method:
1. Call readBusinessDoc('icp-profile') and ('icp-intake') for who to target — roles, firmographics, signals, decision process — and ('offer-strategy') for what you are selling.
2. Translate the ICP into concrete scrapeLeads filters: a searchQuery (role + niche), jobTitles, locations (full country names), seniority, functions, and companySize. Set findEmails: true only when the user wants emails for outreach.
3. When the user asks for a number of leads/ICPs (e.g. "50 leads", "30 ICPs"), FIRST give a short targeting report (the exact ICP, the search criteria you will use, and the in/out qualification rules), THEN call scrapeLeads with count set to that number and present the real results as a clean table (Name, Title, Company, Location, LinkedIn, Email).
4. If scrapeLeads returns configured:false, deliver the full targeting plan and tell the user to set APIFY_TOKEN to pull live prospects. Never fabricate prospects.

Be precise and commercial. Tie every recommendation back to the ICP and the offer.`;

const OUTREACH_PROMPT = `You are the founder's Outreach agent. Your job: build a real prospect list and write custom outreach messages in the founder's voice, as a deliverable the founder sends MANUALLY.

You have a live tool, scrapeLeads, that pulls real LinkedIn prospects (name, title, company, location, LinkedIn URL, optional work email) matching ICP filters.

Hard rules:
- SCRAPE, NEVER AUTO-SEND. You never connect to LinkedIn to send. You produce a sheet of prospects + written messages, and point the user to Apollo, PhantomBuster, or the Claude extension for manual sending. Cold email is the safe channel.
- Personalize from the prospect's real context (their title, company, headline) and the founder's ICP/offer. Match the loaded Voice DNA.

Method:
1. Pull voice (loaded below), ICP, offer, and the documented DM/cadence sequence (readBusinessDoc('strategic-roadmap')).
2. When the user wants a list, call scrapeLeads with the ICP filters and the count requested (findEmails: true if they want cold email). If it returns configured:false, build the plan and tell them to set APIFY_TOKEN.
3. For each prospect, write a tight, specific, human message: a real reason for reaching out (anchored to their actual role/company), one clear ask, no fluff. Provide the cadence (message 1, follow-ups).
4. Present the deliverable as a copyable sheet: prospect + channel + message.

Never send anything. Never fabricate a prospect's details — only personalize from what scrapeLeads actually returned, and mark unknowns as variables.`;

const MAIN_PROMPT = `You are the founder's Second Brain, the main assistant. You have access to ALL of their business documents (Voice DNA, ICP, Messaging House, Rule of One, Offer Strategy, Personal Authority, and the rest) and you can reach into any of them.

Method:
1. Call listBusinessDocs FIRST to see everything available and what each document answers, then readBusinessDoc / searchBusinessDocs to pull exactly what the question needs.
2. Answer directly and usefully. If a request clearly belongs to a specialist (write a post, build a prospect list, draft outreach), do that work yourself in their voice, and you may mention which specialist agent is tuned for it. To build a REAL prospect list, read the ICP then call scrapeLeads (live LinkedIn scraping) with the count requested; give a short targeting plan first, then the table.
3. Ground everything in their real documents. Never fabricate metrics, offers, prices, stories, or prospects, use what is in the docs and what the tools actually return.

Be concise, concrete, and founder-first.`;

/** The synthetic "main" assistant: a generalist over ALL knowledge (no scope
 *  restriction). Not part of AGENT_DEFAULTS because it isn't a doc-scoped GTM
 *  agent; the chat route handles key "main" via this config. Voice-grounded. */
export const MAIN_AGENT: AgentConfig = {
  key: "content", // borrow content's key so the preamble loads Voice DNA + north star
  name: "Second Brain",
  role: "Your main assistant",
  color: "#8b5cf6",
  icon: "Brain",
  tone: "casual",
  handle: null,
  systemPrompt: MAIN_PROMPT,
  knowledgeScope: [], // empty = unscoped; route passes no agent to the doc tools
  model: "anthropic/claude-opus-4-8",
  enabled: true,
};

export const AGENT_DEFAULTS: Record<AgentKey, AgentConfig> = {
  research: {
    key: "research", name: "Research", role: "Trending topics in your niche",
    color: "#22d3ee", icon: "Binoculars", tone: "casual", handle: null,
    systemPrompt: RESEARCH_PROMPT, knowledgeScope: AGENT_KNOWLEDGE_SCOPE.research,
    model: "anthropic/claude-opus-4-8", enabled: true,
  },
  content: {
    key: "content", name: "Content", role: "Posts in your voice across platforms",
    color: "#a78bfa", icon: "PenNib", tone: "casual", handle: null,
    systemPrompt: CONTENT_PROMPT, knowledgeScope: AGENT_KNOWLEDGE_SCOPE.content,
    model: "anthropic/claude-opus-4-8", enabled: true,
  },
  marketing: {
    key: "marketing", name: "Marketing", role: "Newsletters, stories, campaigns",
    color: "#34d399", icon: "Megaphone", tone: "casual", handle: null,
    systemPrompt: MARKETING_PROMPT, knowledgeScope: AGENT_KNOWLEDGE_SCOPE.marketing,
    model: "anthropic/claude-opus-4-8", enabled: true,
  },
  sales: {
    key: "sales", name: "Sales", role: "ICP, qualification, prospect lists",
    color: "#f59e0b", icon: "Target", tone: "casual", handle: null,
    systemPrompt: SALES_PROMPT, knowledgeScope: AGENT_KNOWLEDGE_SCOPE.sales,
    model: "anthropic/claude-opus-4-8", enabled: true,
  },
  outreach: {
    key: "outreach", name: "Outreach", role: "Custom messages in your voice",
    color: "#f43f5e", icon: "PaperPlaneTilt", tone: "casual", handle: null,
    systemPrompt: OUTREACH_PROMPT, knowledgeScope: AGENT_KNOWLEDGE_SCOPE.outreach,
    model: "anthropic/claude-opus-4-8", enabled: true,
  },
};

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

/* --------------------------- DB-backed config --------------------------- */

type CacheEntry = { config: AgentConfig; at: number };
const cache = new Map<AgentKey, CacheEntry>();
const TTL_MS = 15_000;

/**
 * Resolve an agent's effective config: the code default with any DB overrides
 * (system_prompt, tone, handle, name, color, knowledge_scope, model, enabled)
 * applied. Falls back to the pure default when Supabase is not configured.
 */
export async function getAgentConfig(key: AgentKey): Promise<AgentConfig> {
  const base = AGENT_DEFAULTS[key];
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.config;

  let config = base;
  try {
    const { createAdminClient } = await import("./supabase/admin");
    const supabase = createAdminClient();
    const { data } = await supabase.from("agents").select("*").eq("key", key).maybeSingle();
    if (data) {
      config = {
        ...base,
        name: data.name || base.name,
        role: data.role || base.role,
        color: data.color || base.color,
        icon: data.icon || base.icon,
        tone: (data.tone as Tone) || base.tone,
        handle: data.handle ?? base.handle,
        systemPrompt: data.system_prompt?.trim() ? data.system_prompt : base.systemPrompt,
        knowledgeScope:
          Array.isArray(data.knowledge_scope) && data.knowledge_scope.length
            ? (data.knowledge_scope as DocType[])
            : base.knowledgeScope,
        model: data.model || base.model,
        enabled: data.enabled ?? base.enabled,
      };
    }
  } catch {
    // Supabase not configured (or table missing) — use the code default.
  }

  cache.set(key, { config, at: Date.now() });
  return config;
}

/** Public list of agents for the UI (defaults merged with any DB config). */
export async function listAgentConfigs(): Promise<AgentConfig[]> {
  return Promise.all(AGENT_KEYS.map((k) => getAgentConfig(k)));
}

/* --------------------------- system assembly --------------------------- */

function toneDirective(tone: Tone): string {
  return tone === "formal"
    ? "TONE: polished and professional, while preserving the founder's substance and point of view."
    : "TONE: conversational and direct, first person, the way the founder actually talks.";
}

/**
 * Build the founder-grounding preamble: always the Rule of One (short north
 * star), plus the full Voice DNA for voice-facing agents so voice is always on
 * without requiring a tool call. Everything else is fetched via the tools.
 */
async function buildFounderPreamble(key: AgentKey): Promise<string> {
  const parts: string[] = [];
  const ruleOfOne = await readBusinessDoc({ docType: "rule-of-one" });
  if (ruleOfOne.found) {
    parts.push(`<founder_north_star>\n${ruleOfOne.body}\n</founder_north_star>`);
  }
  if (isVoiceFacing(key)) {
    const voice = await readBusinessDoc({ docType: "voice-dna" });
    if (voice.found) {
      parts.push(`<voice_dna>\n${voice.body}\n</voice_dna>`);
    }
  }
  if (!parts.length) return "";
  return `You are grounded in the founder's own business documents. The most load-bearing are loaded below; pull anything else with the knowledge tools (listBusinessDocs first).\n\n${parts.join(
    "\n\n"
  )}`;
}

export const NO_DASH_RULE = NO_EMDASH_RULE;

/**
 * Assemble the full system prompt for a streamed agent turn:
 *   founder preamble (cacheable) + agent prompt + tone + writing rules + block grammar
 * The block grammar is passed in so the route can extend it with artifact blocks.
 */
export async function buildAgentSystem(config: AgentConfig, blockGrammar: string): Promise<string> {
  const preamble = await buildFounderPreamble(config.key);
  const handleLine = config.handle ? `\nThe founder's handle is ${config.handle}; use it where a handle is needed.` : "";
  return [
    preamble,
    config.systemPrompt + handleLine,
    toneDirective(config.tone),
    NO_DASH_RULE,
    blockGrammar,
  ]
    .filter(Boolean)
    .join("\n\n");
}
