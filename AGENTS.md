# Agent Infrastructure

How the GTM agent system is wired: the knowledge layer that lets an agent know
*where to look for what*, the five agents, the runtime, and the data model.
This file is the source of truth for the agent system prompts (seeded into the
`agents` table) and the knowledge routing taxonomy.

> Built individually first. A parent **orchestrator** that delegates to these
> agents as tools is a later phase (see _Orchestrator_ at the end).

---

## 1. The Knowledge Layer

Every student arrives with the **same set of business documents**. We ingest
them into a canonical, client-agnostic taxonomy so any agent can route to the
right document. Source of truth = `src/lib/knowledge-map.ts`.

### 1.1 Document taxonomy

| `doc_type` | Reads for | Authority |
|---|---|---|
| `voice-dna` | how the founder speaks (tone, rhythm, vocabulary) | 5 |
| `rule-of-one` | one avatar / problem / solution / outcome + narrative | 5 |
| `messaging-house` | UVP, audience wants/fears, problems→solutions, proof | 4 |
| `brand-positioning` | category, positioning thesis, promise, archetype | 4 |
| `business-authority` | content pillars, case studies, beliefs, objections | 4 |
| `personal-authority` | the personal **story bank** (30 life/career stories) | 3 |
| `icp-profile` | firmographics, signals, decision process, KPIs | 5 |
| `icp-intake` | raw founder-voice pains, desires, urgency triggers | 3 |
| `offer-strategy` | offers, pricing, phases, differentiators | 4 |
| `strategic-roadmap` | 90-day pillars, targeting criteria, DM sequence | 3 |
| `business-inbox` | consolidated identity / business master | 4 |
| `profile-optimization` | headlines, About copy, CTA | 3 |

### 1.2 Note frontmatter (source of truth, on disk)

Ingested to `content/knowledge/<client>/knowledge/<doc_type>.md`:

```yaml
---
doc_type: voice-dna
title: "Voice DNA Profile"
client: noman-khan
authority: 5
serves_agents: [content, outreach, marketing]
answers:                 # the questions this doc answers — drives routing
  - "How does the client speak — tone, fillers, sentence rhythm?"
provides: [voice.markers, voice.sentence_patterns, voice.vocabulary]
pillars: []
summary: "How the founder actually speaks..."
source_file: "Noman Khan VOICE DNA PROFILE.docx"
last_ingested: 2026-06-20
---
```

### 1.3 Routing — two stages

1. **Scope (deterministic):** each agent has a default `knowledgeScope`
   (`AGENT_KNOWLEDGE_SCOPE` in `knowledge-map.ts`). Retrieval is restricted to
   those doc-types unless the model names others.
2. **Decide + rank (model-driven):** the agent calls `listBusinessDocs` to see
   the manifest (each doc + what it answers), picks the right `doc_type`, and
   either `readBusinessDoc` (full) or `searchBusinessDocs` (keyword, scoped).

Implementation: `src/lib/client-knowledge.ts` (reader + scoped search),
`src/lib/agent-tools.ts` (the three tools below).

### 1.4 Knowledge tools (every agent)

- `listBusinessDocs()` — manifest of the agent's in-scope documents: label,
  authority, summary, the questions each answers, and whether it's ingested.
  **Call this first** to decide where to look.
- `readBusinessDoc({ doc_type })` — the full body of one document.
- `searchBusinessDocs({ query, doc_types? })` — scoped keyword search; returns
  ranked excerpts (title/answers weighted above body).

### 1.5 Ingestion

`scripts/ingest-docs.mjs`: `.docx → textutil text → Opus 4.8 (forced tool call)
→ clean fact-preserving markdown + answers/provides/pillars → frontmatter note`.
Authority + serves_agents come from the map (never drift). The productized path
(`/api/knowledge/ingest`, used by onboarding) does the same from an upload.

---

## 2. The Five Agents

All agents: ground in the founder's docs via the knowledge tools, render output
as the rich **UI blocks** (§4), never invent facts, and obey the no-em-dash rule.
Voice-facing agents (content, marketing, outreach) write in the founder's voice
from `voice-dna`.

### Research  _(shared specialist)_
- **Shared across all departments** — not owned by the CMO. Any department head
  (CMO / COO / CTO / CRO) can fire Research FIRST for a market / audience / angle
  read before its own specialist works (reports to whichever fired it). Modelled
  as `parent: "kronos"` + `SHARED_SPECIALISTS` in `org.ts`.
- **Job:** surface trending topics in the founder's niche across LinkedIn, X,
  YouTube, Reddit, Quora; tie each trend to an angle that fits their positioning.
- **Scope:** `rule-of-one`, `messaging-house`, `business-authority`,
  `brand-positioning`, `business-inbox`, `icp-profile`.
- **Tools:** knowledge tools + live `webSearch` (Tavily via `TAVILY_API_KEY`,
  wired into both chat and the Jarvis run).
- **Outputs:** trend cards, topic radar, platform breakdown, source quotes, angles.

### Content
- **Job:** turn research + the founder's story bank into LinkedIn / YouTube /
  Instagram / TikTok content **in their exact voice**.
- **Scope:** `voice-dna`, `personal-authority`, `messaging-house`,
  `business-authority`, `rule-of-one`, `brand-positioning`.
- **Outputs:** platform post mockups, carousel slides, hook variations, content
  calendar, script blocks, caption + hashtags.

### Marketing
- **Job:** newsletters, IG stories, and marketing-side assets.
- **Scope:** `voice-dna`, `messaging-house`, `profile-optimization`,
  `offer-strategy`, `brand-positioning`, `strategic-roadmap`.
- **Outputs:** newsletter layout, IG-story frames, subject-line A/B, email block.

### Sales
- **Job:** read the ICP, qualify, and build a **real** prospect list by scraping
  LinkedIn. Asks like "50 leads/ICPs" → targeting report + 50 real prospects.
- **Tools:** knowledge tools + `scrapeLeads` (LIVE LinkedIn people-search via the
  `harvestapi/linkedin-profile-search` Apify actor — name, title, company,
  location, LinkedIn URL, optional work email) + `enrichLeads` (the enrichment
  protocol). Needs `APIFY_TOKEN`; degrades to plan-only when unset. Implemented in
  `src/lib/lead-scraper.ts` + `lead-enrichment.ts` + `lead-tools.ts`.
- **Enrichment protocol** (`src/lib/lead-enrichment.ts`): turns scraped prospects
  into outreach-ready records via a chain of Apify actors (all pay-per-event,
  graceful no-op without `APIFY_TOKEN`):
  - `apimaestro/linkedin-profile-detail` — deep profile (about, experience, skills,
    education) + work email, ~$5/1k.
  - `harvestapi/linkedin-profile-posts` — recent activity (latest posts → outreach
    angles), ~$0.002/post.
  - `snipercoder/bulk-linkedin-email-finder` — work email for leads still missing
    one, ~$0.001/email.
  - `nexgendata/email-verification-tool` — deliverability (valid / invalid /
    disposable) so outreach never gets a bad address, ~$0.02/email.
  In Jarvis (`runLeads`) it auto-runs (cap 40) when the ask implies outreach
  (enrich / verify / outreach / personalize / emails). Adds `emailStatus`,
  `about`, `skills`, `recentActivity` to each lead row + the CSV.
- **Scope:** `icp-profile`, `icp-intake`, `offer-strategy`, `strategic-roadmap`,
  `rule-of-one`, `business-inbox`.
- **Outputs:** targeting report + scraped prospect sheet (CSV export), ICP-match
  meter, account dossier, funnel.

### Outreach
- **Job:** build a real prospect list (`scrapeLeads`) and write custom messages
  in the founder's voice. **Scrape, never auto-send** — deliver the prospect list
  + messages as a sheet and point to Apollo / PhantomBuster / the Claude
  extension for manual sending. Cold email is the safe channel; Instantly-style
  warm-up can live behind an API key later.
- **Tools:** knowledge tools + `scrapeLeads` (same live LinkedIn scraper as Sales).
- **Scope:** `voice-dna`, `icp-profile`, `messaging-house`, `offer-strategy`,
  `profile-optimization`, `strategic-roadmap`.
- **Outputs:** DM / cold-email thread mockups, cadence timeline, personalization
  variables, the deliverable sheet preview.

---

## 3. Runtime

- **Model:** `anthropic/claude-opus-4-8` via the Vercel AI Gateway
  (`AI_MODEL`). Standardized across agents.
- **Env vars:** `ANTHROPIC_API_KEY` (required). `APIFY_TOKEN` enables live
  LinkedIn lead scraping (Sales/Outreach `scrapeLeads` + the CRO/leads Jarvis
  run) — get it at console.apify.com → Settings → Integrations. `TAVILY_API_KEY`
  enables live web search (Research). All three degrade gracefully when unset
  (the agent delivers the plan / labels output as hypotheses instead of failing).
  `ZAPIER_MCP_URL` (+ optional `ZAPIER_MCP_TOKEN`) connect the dashboard to every
  app the founder has linked in Zapier — see below.
- **Zapier MCP (dashboard data):** `src/lib/zapier-mcp.ts` connects to the
  founder's hosted Zapier MCP server (Streamable HTTP, Bearer token) and exposes
  every connected app's actions as tools — NO per-app OAuth in our code (that
  happens once in Zapier's dashboard). `listZapierTools()` / `callZapierTool()` /
  `zapierAiTools()` (AI-SDK-wrapped for an LLM tool-loop). Routes:
  `GET /api/dashboard/zapier` (status + actions), `POST /api/dashboard/zapier`
  (run one action). Set `ZAPIER_MCP_URL` from mcp.zapier.com → server → Connect
  tab. Single-tenant (founder's own apps); a multi-user product would use Zapier's
  end-user OAuth connect flow instead.
- **Thinking / sampling:** Opus 4.8 rejects `temperature`/`top_p`/`top_k` and
  `budget_tokens` (400). Use adaptive thinking where the provider build exposes
  it, else omit thinking config. `src/lib/anthropic-fetch.ts` strips removed
  params defensively.
- **Tool loop:** `streamText` + `maxSteps` (AI SDK v4).
- **System prompt assembly** (`/api/chat`): `[founder knowledge/identity
  preamble] + [agent.system_prompt] + [tone directive] + [block grammar]`. Agent
  config is DB-backed (`agents` table); tone = casual/formal; handle is a
  variable. The large stable preamble carries a `cacheControl` breakpoint; the
  volatile thread follows it (prefix-match caching).
- **Self-contained:** each agent is a standalone config so a future orchestrator
  can call it as a tool with no refactor.

---

## 4. Output Blocks

Agents render answers through the token-driven block library
(`src/components/blocks/`), strict-sequential play, glassmorphic. Existing blocks
(`callout`, `keypoints`, `actions`, `stats`, `kpi`, `meter`, `bars`, `table`,
`timeline`, `steps`, `decision`, `people`, `chips`, `quote`, `define`, `idea`)
stay. Agency-grade **artifact blocks** are added per agent (registered in
`parse.ts`, documented in each agent's prompt):

- Research: `trendcard`, `topicradar`, `platformsplit`, `sourcequote`, `angles`
- Content: `post` (platform-accurate mockup), `carousel`, `hooks`, `calendar`, `script`
- Marketing: `newsletter`, `story`, `subjectab`, `email`
- Sales: `prospects`, `icpmatch`, `dossier`, `funnel`
- Outreach: `message`, `cadence`, `variables`, `sheet`

---

## 5. Data Model

Self-setup per user: a consolidated migration bundle provisions a ready DB.

| Table | Purpose |
|---|---|
| `agents` | editable agent config: key, name, color, system_prompt, tone, handle, knowledge_scope[], model, enabled |
| `conversations` | a thread per (agent, user): title, pinned, timestamps |
| `messages` | role + `parts` jsonb (incl. block markup) + timestamps |
| `knowledge_docs` | queryable mirror of note frontmatter (routing index) |
| `onboarding` | KYC answers: channels[], content_types[], handles, reference, completed_at |

---

## 6. Customization & Onboarding

- **Settings (Siri-simple):** per agent — swap handle, edit system prompt, tone
  toggle, enable/disable, knowledge scope. Writes `agents`; chat route reads it
  at runtime.
- **KYC onboarding:** channels → content types → reference content → upload doc
  set (triggers ingestion). Writes `onboarding`.

---

## 7. Orchestrator (later)

Each agent exposes a stable tool contract. A parent orchestrator (Anthropic
orchestrator-workers pattern) will call agents as tools, decompose a request,
fan out, and synthesize — added once the five agents are solid. No agent change
required.
