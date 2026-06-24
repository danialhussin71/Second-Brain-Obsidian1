#!/usr/bin/env node
/**
 * Ingest a student's business-doc set into the knowledge layer.
 *
 *   node --env-file=.env.local scripts/ingest-docs.mjs \
 *     --src "/path/to/docs-folder" --client noman-khan
 *
 * For each .docx:
 *   1. textutil -> plain text (macOS, no extra deps)
 *   2. Claude Opus 4.8 (forced tool call) -> { doc_type, title, summary,
 *      answers, provides, pillars, markdown } — clean, FACT-PRESERVING markdown
 *      plus the routing metadata.
 *   3. Write content/knowledge/<client>/<doc_type>.md with frontmatter.
 *
 * Canonical authority + serves_agents come from src/lib/knowledge-map.ts so the
 * frontmatter never drifts from the routing brain. Also emits _manifest.json.
 *
 * Idempotent: re-running overwrites the per-doc_type note.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const execFileP = promisify(execFile);

/* -------- tiny dependency-free YAML frontmatter writer -------- */
function yamlScalar(s) {
  // single-line, double-quoted, escaped — safe for any string
  const one = String(s).replace(/\s*\n\s*/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${one}"`;
}
function toFrontmatter(data, body) {
  const lines = ["---"];
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) {
      if (val.length === 0) lines.push(`${key}: []`);
      else { lines.push(`${key}:`); for (const item of val) lines.push(`  - ${yamlScalar(item)}`); }
    } else if (typeof val === "number") {
      lines.push(`${key}: ${val}`);
    } else {
      lines.push(`${key}: ${yamlScalar(val)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n") + "\n" + body.trim() + "\n";
}

/* -------- inlined slice of knowledge-map.ts (avoid TS import in a plain script) -------- */
const DOC_TYPES = [
  "voice-dna", "rule-of-one", "messaging-house", "brand-positioning",
  "business-authority", "personal-authority", "icp-profile", "icp-intake",
  "offer-strategy", "strategic-roadmap", "business-inbox", "profile-optimization",
];
// authority + servesAgents are the canonical values mirrored from KNOWLEDGE_MAP.
const MAP = {
  "voice-dna":            { authority: 5, serves: ["content", "outreach", "marketing"], hints: ["voice dna", "voice-dna"] },
  "rule-of-one":         { authority: 5, serves: ["research", "content", "marketing", "sales", "outreach"], hints: ["rule of 1", "rule of one", "the rule of"] },
  "messaging-house":     { authority: 4, serves: ["content", "marketing", "outreach"], hints: ["messaging house"] },
  "brand-positioning":   { authority: 4, serves: ["research", "content", "marketing"], hints: ["brand positioning", "positioning strategy"] },
  "business-authority":  { authority: 4, serves: ["content", "research"], hints: ["business authority", "authority document"] },
  "personal-authority":  { authority: 3, serves: ["content"], hints: ["personal authority", "storytelling", "story task"] },
  "icp-profile":         { authority: 5, serves: ["sales", "outreach", "research"], hints: ["detailed (icp)", "detailed icp", "icp)."] },
  "icp-intake":          { authority: 3, serves: ["sales", "outreach"], hints: ["icp document"] },
  "offer-strategy":      { authority: 4, serves: ["sales", "outreach", "marketing"], hints: ["offer strategy", "offer_strategy", "monetization", "blueprint"] },
  "strategic-roadmap":   { authority: 3, serves: ["sales", "outreach", "marketing"], hints: ["roadmap", "90 day", "90-day", "90 days"] },
  "business-inbox":      { authority: 4, serves: ["sales", "marketing", "research"], hints: ["business inbox", "business in a box", "inbox"] },
  "profile-optimization":{ authority: 3, serves: ["marketing", "outreach"], hints: ["profile optimization", "profile copy"] },
};

function guessDocType(filename) {
  const name = filename.toLowerCase();
  let best = null;
  for (const dt of DOC_TYPES) {
    for (const hint of MAP[dt].hints) {
      if (name.includes(hint) && (!best || hint.length > best.len)) best = { dt, len: hint.length };
    }
  }
  return best?.dt ?? null;
}

/* ----------------------------------- args ----------------------------------- */
function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SRC = arg("--src", "/Users/danial/Downloads/wetransfer_cxo-collective-detailed-icp-docx_2026-06-19_1946");
const CLIENT = arg("--client", "noman-khan");
const OUT_DIR = path.resolve(process.cwd(), "content", "knowledge", CLIENT, "knowledge");
const MODEL = process.env.AI_MODEL?.split("/").pop() || "claude-opus-4-8";
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY missing. Run with: node --env-file=.env.local scripts/ingest-docs.mjs");
  process.exit(1);
}

/* --------------------------------- docx -> text --------------------------------- */
async function docxToText(file) {
  const { stdout } = await execFileP("textutil", ["-convert", "txt", "-stdout", file], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------- Opus 4.8 classify ------------------------------- */
const TOOL = {
  name: "emit_knowledge_doc",
  description: "Emit the structured, cleaned knowledge document.",
  input_schema: {
    type: "object",
    properties: {
      doc_type: { type: "string", enum: DOC_TYPES, description: "Canonical document type." },
      title: { type: "string", description: "Clean human title for this document." },
      summary: { type: "string", description: "One or two sentences: what this document IS." },
      answers: {
        type: "array", items: { type: "string" },
        description: "5-9 specific questions THIS document answers for an AI agent (for routing).",
      },
      provides: {
        type: "array", items: { type: "string" },
        description: "Dot-notation facets this doc supplies, e.g. voice.markers, offer.pricing.",
      },
      pillars: {
        type: "array", items: { type: "string" },
        description: "Content pillars / evergreen topics if present, else empty array.",
      },
      markdown: {
        type: "string",
        description:
          "The full document re-rendered as clean, well-structured GitHub-flavored markdown. PRESERVE EVERY FACT verbatim — all numbers, names, metrics, quotes, prices. Use headings, lists, and markdown tables. Do NOT summarize, omit, or invent. No frontmatter.",
      },
    },
    required: ["doc_type", "title", "summary", "answers", "markdown"],
  },
};

async function classify({ filename, candidate, text }) {
  const sys =
    "You are a meticulous knowledge engineer. You convert a founder's business document into a clean, " +
    "fact-preserving markdown note plus routing metadata. Never drop or alter facts (numbers, names, metrics, " +
    "prices, quotes). Improve only structure and readability. Output strictly via the emit_knowledge_doc tool.";
  const user =
    `Source filename: ${filename}\n` +
    `Best-guess doc_type from filename: ${candidate ?? "unknown"} (confirm or correct using the enum).\n\n` +
    `Raw extracted text follows. Re-render it as clean markdown and emit the metadata.\n\n` +
    "-----\n" + text + "\n-----";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: sys,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "emit_knowledge_doc" },
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === "tool_use");
  if (!block) throw new Error("no tool_use block in response");
  return block.input;
}

/* ----------------------------------- main ----------------------------------- */
async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const entries = (await fs.readdir(SRC)).filter((f) => f.toLowerCase().endsWith(".docx"));
  if (!entries.length) {
    console.error(`No .docx found in ${SRC}`);
    process.exit(1);
  }
  console.log(`Ingesting ${entries.length} docs from ${SRC}\n -> ${OUT_DIR}\n`);

  const stamp = new Date().toISOString().slice(0, 10);
  const manifest = [];
  const seen = new Set();

  for (const file of entries.sort()) {
    const full = path.join(SRC, file);
    const candidate = guessDocType(file);
    process.stdout.write(`• ${file}  (guess: ${candidate ?? "?"}) ... `);
    try {
      const text = await docxToText(full);
      const out = await classify({ filename: file, candidate, text });
      let dt = out.doc_type;
      if (!DOC_TYPES.includes(dt)) dt = candidate || "business-inbox";
      if (seen.has(dt)) {
        // Two source files mapped to the same type — keep both, suffix the later one.
        let n = 2;
        while (seen.has(`${dt}-${n}`)) n++;
        dt = `${dt}-${n}`;
      }
      seen.add(dt);

      const baseDt = dt.replace(/-\d+$/, "");
      const meta = MAP[baseDt] || { authority: 3, serves: [] };
      const frontmatter = {
        doc_type: baseDt,
        title: out.title,
        client: CLIENT,
        authority: meta.authority,
        serves_agents: meta.serves,
        answers: out.answers || [],
        provides: out.provides || [],
        pillars: out.pillars || [],
        summary: out.summary || "",
        source_file: file,
        last_ingested: stamp,
      };
      const md = toFrontmatter(frontmatter, out.markdown || "");
      const outPath = path.join(OUT_DIR, `${dt}.md`);
      await fs.writeFile(outPath, md, "utf8");
      manifest.push({ ...frontmatter, storage_path: `content/knowledge/${CLIENT}/knowledge/${dt}.md`, words: (out.markdown || "").split(/\s+/).length });
      console.log(`-> ${dt}.md (${frontmatter.answers.length} answers)`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  await fs.writeFile(path.join(OUT_DIR, "_manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${manifest.length} notes + _manifest.json to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
