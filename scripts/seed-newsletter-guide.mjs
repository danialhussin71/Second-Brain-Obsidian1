#!/usr/bin/env node
/**
 * seed-newsletter-guide.mjs — seed the founder's Newsletter master prompt into the
 * `content_guides` vector DB (one full master-prompt per format), so the Jarvis
 * newsletter specialist retrieves it via getContentGuide({ format: "newsletter" }).
 *
 * Reads Master Prompt 1 from newsletter.md (everything before "Master Prompt 2"),
 * embeds it with the SAME model retrieval uses (text-embedding-3-small, 1536d),
 * and upserts one row (category "newsletter", is_new). Idempotent on `key`.
 *
 *   node --env-file=.env.local scripts/seed-newsletter-guide.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const KEY_SLUG = "new-newsletter-prompt";
const TITLE = "Newsletter Master Prompt";
const CATEGORY = "newsletter";

async function embed(text) {
  const gateway = process.env.AI_GATEWAY_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const target = gateway
    ? { url: "https://ai-gateway.vercel.sh/v1", key: gateway, model: "openai/text-embedding-3-small", label: "Vercel AI Gateway" }
    : openai
      ? { url: "https://api.openai.com/v1", key: openai, model: "text-embedding-3-small", label: "OpenAI direct" }
      : null;
  if (!target) throw new Error("No AI_GATEWAY_API_KEY or OPENAI_API_KEY set");
  const res = await fetch(`${target.url}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${target.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: target.model, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding failed (${target.label}): ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { vec: data.data[0].embedding, provider: target.label };
}

async function main() {
  if (!URL || !KEY) throw new Error("Supabase not configured (NEXT_PUBLIC_SUPABASE_URL + a service/anon key)");

  const raw = await fs.readFile(path.resolve("newsletter.md"), "utf8");
  // Master Prompt 1 = everything before the "Master Prompt 2" chat line.
  let body = raw.split(/\n\[[^\]]*\]\s*~Danny:\s*Master Prompt 2/)[0];
  body = body.replace(/^\[[^\]]*\]\s*~Danny:\s*/, "").trim(); // drop the chat timestamp prefix
  if (!body || body.length < 500) throw new Error(`Extracted newsletter prompt looks wrong (${body.length} chars)`);

  const { vec, provider } = await embed(`${TITLE}\n\n${body}`);
  if (!Array.isArray(vec) || vec.length !== 1536) throw new Error(`Bad embedding length: ${vec?.length}`);

  const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const row = { key: KEY_SLUG, title: TITLE, category: CATEGORY, variant: null, is_new: true, body, char_count: body.length, embedding: vec };
  const { error } = await db.from("content_guides").upsert(row, { onConflict: "key" });
  if (error) throw error;

  console.log(`✓ Seeded content_guides "${KEY_SLUG}" — category "${CATEGORY}", ${body.length} chars, ${vec.length}-dim (${provider}).`);
}

main().catch((e) => {
  console.error("seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
