import { AGENT_KEYS, AGENT_KNOWLEDGE_SCOPE, KNOWLEDGE_MAP, type DocType } from "./knowledge-map";
import { AGENT_DEFAULTS } from "./gtm-agents";
import { loadClientDocsForBrain } from "./client-knowledge";
import type { BrainGraph, GraphNode, GraphLink } from "./vault";

/**
 * Client brain — the small, meaningful "second brain" graph the Stage renders
 * from the student's ingested business docs. This replaces reading a big vault
 * snapshot out of Vercel Blob: the graph is built locally from the bundled
 * knowledge notes, so a fresh self-hosted deployment lights up its own brain
 * with zero external storage.
 *
 * Shape (~20 nodes) — a literal map of the product:
 *
 *        ┌── Research ─┐
 *   Founder ── Content ─┼── 12 knowledge docs ──┐
 *        ├── Marketing ┤                         ├── 2 throughline themes
 *        ├── Sales ────┤                         │
 *        └── Outreach ─┘─────────────────────────┘
 *
 * The agent→doc edges ARE the knowledge-routing scope (AGENT_KNOWLEDGE_SCOPE),
 * so the picture you see is exactly how the agents reach into the docs. Theme
 * nodes are derived from the recurring pillars across the docs, so the brain
 * reflects this client's actual throughlines, not a generic template.
 */

export type ClientBrain = {
  graph: BrainGraph;
  stats: { notes: number; links: number; folders: number; lastEdited: number };
};

const FOLDER = {
  identity: "Identity",
  agents: "Agents",
  knowledge: "Knowledge",
  themes: "Themes",
} as const;

const GROUP = { founder: 0, agent: 1, doc: 2, theme: 3 } as const;

/** Candidate throughline themes, matched against the docs' pillars. The two
 *  with the most matching docs become nodes — so the brain surfaces whatever
 *  this client's documents actually keep returning to. */
const THEME_CANDIDATES: Array<{ id: string; name: string; re: RegExp }> = [
  { id: "revenue-engine", name: "Revenue Engine", re: /revenue engine|revenue driver|growth engine|growth lever|revenue alignment/i },
  { id: "retention-churn", name: "Retention & Churn", re: /retention|churn|\bnrr\b|\bgrr\b|net revenue|time-to-value|adoption|lifetime value/i },
  { id: "operating-model", name: "Operating Model", re: /operating model|alignment|go-to-market|\bgtm\b|cross-functional|post-sales|lifecycle/i },
  { id: "authority-positioning", name: "Authority & Positioning", re: /positioning|authority|personal brand|leadership|career positioning/i },
];

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function val(degree: number): number {
  // Same sizing law the real vault graph uses, so importance reads through size.
  return 1 + Math.log2(degree + 1);
}

/**
 * Build the brain graph for a client from its ingested docs. Returns null if the
 * client has no ingested docs (caller falls back to the legacy vault/Blob path).
 */
export async function getClientBrain(client?: string): Promise<ClientBrain | null> {
  const { client: slug, docs } = await loadClientDocsForBrain(client);
  if (!docs.length) return null;

  const haveTypes = new Set<DocType>(docs.map((d) => d.docType));
  const founderName = titleCaseSlug(slug);

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const degree = new Map<string, number>();
  const addLink = (source: string, target: string) => {
    links.push({ source, target });
    degree.set(source, (degree.get(source) || 0) + 1);
    degree.set(target, (degree.get(target) || 0) + 1);
  };

  const founderId = `founder:${slug}`;
  const docId = (dt: DocType) => `doc:${dt}`;
  const agentId = (k: string) => `agent:${k}`;

  // --- Agent → doc edges (the routing scope) -----------------------------
  for (const key of AGENT_KEYS) {
    for (const dt of AGENT_KNOWLEDGE_SCOPE[key]) {
      if (haveTypes.has(dt)) addLink(agentId(key), docId(dt));
    }
  }

  // --- Founder spine: connect to agents + the most canonical docs --------
  for (const key of AGENT_KEYS) addLink(founderId, agentId(key));
  const anchors = [...docs].sort((a, b) => b.authority - a.authority).slice(0, 3);
  for (const a of anchors) addLink(founderId, docId(a.docType));

  // --- Throughline themes: top 2 candidates by docs whose pillars match --
  const themeMatches = THEME_CANDIDATES.map((t) => {
    const matched = docs.filter((d) => t.re.test(d.pillars.join(" · ") + " " + d.summary));
    return { ...t, matched };
  })
    .filter((t) => t.matched.length >= 2)
    .sort((a, b) => b.matched.length - a.matched.length)
    .slice(0, 2);

  for (const t of themeMatches) {
    const tid = `theme:${t.id}`;
    for (const d of t.matched) addLink(tid, docId(d.docType));
  }

  // --- Nodes -------------------------------------------------------------
  nodes.push({
    id: founderId,
    name: founderName,
    folder: FOLDER.identity,
    val: val(degree.get(founderId) || 0),
    degree: degree.get(founderId) || 0,
    group: GROUP.founder,
    tags: ["identity"],
  });

  for (const key of AGENT_KEYS) {
    const id = agentId(key);
    const def = AGENT_DEFAULTS[key];
    nodes.push({
      id,
      name: def.name,
      folder: FOLDER.agents,
      val: val(degree.get(id) || 0),
      degree: degree.get(id) || 0,
      group: GROUP.agent,
      tags: ["agent", key],
    });
  }

  for (const d of docs) {
    const id = docId(d.docType);
    nodes.push({
      id,
      name: KNOWLEDGE_MAP[d.docType].label,
      folder: FOLDER.knowledge,
      val: val(degree.get(id) || 0),
      degree: degree.get(id) || 0,
      group: GROUP.doc,
      tags: ["knowledge", d.docType],
    });
  }

  for (const t of themeMatches) {
    const id = `theme:${t.id}`;
    nodes.push({
      id,
      name: t.name,
      folder: FOLDER.themes,
      val: val(degree.get(id) || 0),
      degree: degree.get(id) || 0,
      group: GROUP.theme,
      tags: ["theme"],
    });
  }

  const folders = [...new Set(nodes.map((n) => n.folder))];
  const graph: BrainGraph = { nodes, links, folders };

  return {
    graph,
    stats: { notes: nodes.length, links: links.length, folders: folders.length, lastEdited: Date.now() },
  };
}
