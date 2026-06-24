/**
 * Client-safe agent metadata for the chat UI (picker, thread headers, colors).
 *
 * The server source of truth is src/lib/gtm-agents.ts (AGENT_DEFAULTS), but that
 * module pulls in fs-backed knowledge loading, so it can't be imported into a
 * client component. This mirrors the *display* fields only, plus the synthetic
 * "main" assistant (a generalist over ALL knowledge — handled specially by the
 * chat route). Keep names/colors/icons in sync with AGENT_DEFAULTS.
 */

export type ChatAgentKey = "main" | "research" | "content" | "marketing" | "sales" | "outreach";

export type ChatAgentMeta = {
  key: ChatAgentKey;
  name: string;
  role: string;
  blurb: string;
  color: string;
  /** Phosphor icon name — resolved by StudioAgentIcon. */
  icon: string;
};

export const CHAT_AGENTS: ChatAgentMeta[] = [
  {
    key: "main",
    name: "Second Brain",
    role: "Your main assistant",
    blurb: "Talks across everything you've uploaded. Start here when you're not sure who to ask.",
    color: "#8b5cf6",
    icon: "Brain",
  },
  {
    key: "research",
    name: "Research",
    role: "Trending topics in your niche",
    blurb: "Finds what's hot across LinkedIn, X, YouTube, Reddit and turns it into angles.",
    color: "#22d3ee",
    icon: "Binoculars",
  },
  {
    key: "content",
    name: "Content",
    role: "Posts in your voice",
    blurb: "Turns ideas and research into ready-to-publish content in your exact voice.",
    color: "#a78bfa",
    icon: "PenNib",
  },
  {
    key: "marketing",
    name: "Marketing",
    role: "Newsletters, stories, campaigns",
    blurb: "Newsletters, IG stories, email, and marketing assets, all on-brand.",
    color: "#34d399",
    icon: "Megaphone",
  },
  {
    key: "sales",
    name: "Sales",
    role: "ICP, qualification, prospect lists",
    blurb: "Reads your ICP, qualifies fit, and builds targeted prospect lists.",
    color: "#f59e0b",
    icon: "Target",
  },
  {
    key: "outreach",
    name: "Outreach",
    role: "Custom messages in your voice",
    blurb: "Writes personalized outreach + cadences you send manually. Never auto-sends.",
    color: "#f43f5e",
    icon: "PaperPlaneTilt",
  },
];

const BY_KEY = new Map(CHAT_AGENTS.map((a) => [a.key, a]));

export function chatAgentMeta(key: string): ChatAgentMeta {
  return BY_KEY.get(key as ChatAgentKey) ?? CHAT_AGENTS[0];
}

const CHAT_AGENT_KEYS = new Set(CHAT_AGENTS.map((a) => a.key));
export function isChatAgentKey(key: string): key is ChatAgentKey {
  return CHAT_AGENT_KEYS.has(key as ChatAgentKey);
}
