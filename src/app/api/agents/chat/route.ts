import { streamText, type CoreMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { anthropicFetch } from "@/lib/anthropic-fetch";
import { getAgentConfig, isAgentKey, buildAgentSystem, MAIN_AGENT } from "@/lib/gtm-agents";
import { blockGrammarFor } from "@/lib/block-grammar";
import { buildBusinessDocTools } from "@/lib/business-doc-tools";
import { buildResearchTools } from "@/lib/research-tools";
import { buildLeadTools } from "@/lib/lead-tools";
import { emDashTransform } from "@/lib/sanitize";

export const runtime = "nodejs";
// LinkedIn scrapes (Sales/Outreach) can run for a couple of minutes.
export const maxDuration = 300;

/** Resolve a "provider/model" string to an AI SDK model. Opus 4.8 default. */
function pickModel(id: string) {
  const [provider, ...rest] = id.split("/");
  const model = rest.join("/");
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(model || "gpt-4o");
  }
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    fetch: anthropicFetch,
  });
  return anthropic(model || "claude-opus-4-8");
}

// Belt-and-suspenders: rewrite any em/en dash out of streamed text (shared sanitizer).
const stripDashes = emDashTransform();

export async function POST(req: Request) {
  const { agentKey: rawKey, messages } = (await req.json()) as {
    agentKey?: string;
    messages: CoreMessage[];
  };

  // "main" is the generalist over ALL knowledge: unscoped doc tools + web search.
  const isMain = rawKey === "main";
  const agentKey = !isMain && rawKey && isAgentKey(rawKey) ? rawKey : isMain ? "content" : "content";
  const config = isMain ? MAIN_AGENT : await getAgentConfig(agentKey);

  const system = await buildAgentSystem(config, blockGrammarFor(agentKey));

  // Sales & Outreach get the real LinkedIn lead scraper; Research gets web
  // search; Main (the generalist over everything) gets both.
  const wantsLeads = agentKey === "sales" || agentKey === "outreach";
  const tools = isMain
    ? { ...buildBusinessDocTools(), ...buildResearchTools(), ...buildLeadTools() }
    : {
        ...buildBusinessDocTools(agentKey),
        ...(agentKey === "research" ? buildResearchTools() : {}),
        ...(wantsLeads ? buildLeadTools() : {}),
      };

  const result = streamText({
    model: pickModel(config.model),
    system,
    experimental_transform: stripDashes,
    messages,
    tools,
    maxSteps: 12,
    onError: (event: any) => {
      console.error(`[agents/${agentKey}] STREAM ERROR:`, event?.error ?? event);
    },
  });

  return result.toDataStreamResponse({
    headers: { "X-Agent-Key": config.key, "X-Agent-Name": config.name },
    getErrorMessage: (error: unknown) =>
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
}
