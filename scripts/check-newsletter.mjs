#!/usr/bin/env node
/** Generate a newsletter with the EXACT prompt runNewsletter builds (playbook from
 *  content_guides) and audit the output against Master Prompt 1. Read-only check. */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GATEWAY = process.env.AI_GATEWAY_API_KEY;
const MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-4-6";

const NO_EMDASH_RULE =
  "ABSOLUTE WRITING RULE, NO EM DASHES OR EN DASHES: never output an em dash (the long — character), an en dash, or a horizontal bar anywhere. Use a comma, a period, a colon, parentheses, or the word 'to' for ranges instead.";

const BANNED = ["delve","tapestry","landscape","testament","vibrant","pivotal","leverage","unlock","harness","robust","showcase","navigate","realm","elevate","seamless","foster","embark","illuminate","unveil","intricate","game-changer","supercharge","dive in","in today's world","fast-paced","ever-evolving","when it comes to","that being said"];

async function main() {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data } = await db.from("content_guides").select("body").eq("key", "new-newsletter-prompt").single();
  const playbook = data.body;

  const system =
    "You are Danny's Newsletter specialist." +
    `\n\nFollow this NEWSLETTER PLAYBOOK from the founder's own knowledge base — it is authoritative. Apply its ROLE, voice rules (the banned words and structures to break), the 8-part newsletter structure, and the final self-check:\n\n${playbook.slice(0, 7000)}\n\n---\n` +
    `\n\nWrite ONE complete email newsletter in Danny's EXACT voice. Follow the playbook structure mapped onto these fields: the TITLE is the hook, the INTRO carries the hook plus the tension, the SECTIONS deliver THE ONE THING and THE PROOF, the CTA is THE ASK, and ALWAYS finish with a P.S. (one line restating the action or adding intrigue). Subject UNDER 42 characters. A short kicker eyebrow is fine; 2-4 sections; a pull-quote is OPTIONAL. Short paragraphs, plain prose, NO markdown bold in the body, never invent metrics.\n\n` +
    NO_EMDASH_RULE;

  const user =
    `Request: "Write this week's newsletter on why founders should niche down instead of chasing every audience."\n\n` +
    `Creative brief from Research:\nThe one idea: a narrow niche compounds trust faster than a broad one. Proof: Danny's own pivot to B2B founders. CTA: reply with the one niche they keep avoiding.\n\n` +
    `Voice DNA unavailable — write in a confident, direct founder voice.\n\n` +
    `Return ONLY a valid JSON object (no prose, no markdown fences) with exactly these keys: kicker, subject, preview, title, intro, sections (array of {heading, body}), quote (or null), cta ({label, url}), signoff, ps (or null).`;

  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GATEWAY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 2500, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error(`gen failed ${res.status} ${(await res.text()).slice(0, 300)}`);
  let text = (await res.json()).choices[0].message.content.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const nl = JSON.parse(text);

  const fullText = [nl.kicker, nl.subject, nl.preview, nl.title, nl.intro, ...(nl.sections || []).flatMap((s) => [s.heading, s.body]), nl.quote, nl.cta?.label, nl.signoff].filter(Boolean).join("\n");
  const bodyText = [nl.intro, ...(nl.sections || []).map((s) => s.body)].join("\n");
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bannedHits = BANNED.filter((w) => new RegExp(`\\b${esc(w)}\\b`, "i").test(fullText));
  const subjLen = (nl.subject || "").length;

  console.log("\n===== GENERATED NEWSLETTER =====");
  console.log("subject :", nl.subject, `(${subjLen} chars)`);
  console.log("preview :", nl.preview);
  console.log("kicker  :", nl.kicker, "| title:", nl.title);
  console.log("intro   :\n" + nl.intro);
  (nl.sections || []).forEach((s) => console.log(`\n[${s.heading}]\n${s.body}`));
  console.log("\nquote   :", nl.quote);
  console.log("cta     :", JSON.stringify(nl.cta), "| signoff:", nl.signoff);

  const P = (ok, label, extra = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  console.log("\n===== AUDIT vs MASTER PROMPT 1 =====");
  P(bannedHits.length === 0, "No banned vocabulary", bannedHits.join(", "));
  P(!/[—–―]/.test(fullText), "No em/en dashes");
  P(!/;/.test(fullText), "No semicolons (playbook bans them)");
  P(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(fullText), "No emojis");
  P(!/\*\*/.test(bodyText), "No markdown bold in body (playbook: 'No markdown bolding inside the body')");
  P(subjLen > 0 && subjLen < 42, "Subject under 42 characters", `${subjLen} chars`);
  P(!!(nl.ps && nl.ps.trim()), "P.S. present (playbook step 8)", nl.ps ? `"${nl.ps.slice(0, 70)}…"` : "missing");
  console.log("\n----- remaining adaptation -----");
  console.log(`Subject options: rendered email shows 1 subject (playbook lists 3 for the human to pick — model still does the internal best-of-3).`);
}
main().catch((e) => { console.error("check failed:", e.message || e); process.exit(1); });
