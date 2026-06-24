import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Keep raw bytes ≤ ~24MB so the base64 request stays under Anthropic's ~32MB
// limit (base64 inflates ~4/3). Admits a single full reference PDF; very large
// uploads should be PNGs of individual slides.
const MAX_TOTAL = 24 * 1024 * 1024;

const EXTRACT_SYSTEM = `You are a senior brand designer reverse-engineering a founder's social carousel template so an AI image model can recreate the EXACT look on brand-new slides.

Study the reference slide(s) and output a single LOCKED VISUAL STYLE SPEC — concrete, specific, and directly followable by a text-to-image model. Cover, in this order, as a bulleted block:
- Canvas: orientation / aspect.
- Background: exact colours (give hex), gradients, and any glow (name the corner/direction).
- Persistent header (if present): layout, the avatar treatment, the exact name + subtitle text, and any top-right element (e.g. REPOST) — quote the text verbatim.
- Headline typography: weight, case, font family vibe (e.g. heavy condensed grotesque / Druk-Anton), alignment, and the ACCENT colour used on keywords (give hex).
- Body typography: font vibe, colour, line treatment.
- Accent colour(s): the hex value(s) and exactly where they're used.
- Recurring motifs: logos-in-cards, device mockups, person cutouts (describe pose/wardrobe), outlined callout boxes, arrows, badges, CTA/FOLLOW pill, etc.
- Slide number placement.

Write it as imperative design rules ("Background: solid pure black #000000 with a crimson glow from the top-right…"). Output ONLY the spec block — no preamble, no markdown headings, no closing commentary.`;

type Block =
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "text"; text: string };

/** POST reference carousels (PDF/PNG/JPG) → Claude vision → a locked style spec. */
export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "upload at least one PDF or PNG" }, { status: 400 });

  const blocks: Block[] = [];
  let total = 0;
  let skipped = 0;
  for (const f of files) {
    total += f.size;
    if (total > MAX_TOTAL) { skipped++; continue; }
    const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
    const type = f.type || "";
    if (type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    } else if (type.startsWith("image/")) {
      blocks.push({ type: "image", source: { type: "base64", media_type: type, data: b64 } });
    } else {
      skipped++;
    }
  }
  if (blocks.length === 0) return NextResponse.json({ error: "no supported files (PDF/PNG/JPG)" }, { status: 400 });

  blocks.push({ type: "text", text: "Reverse-engineer the locked visual style spec from these reference slides." });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1600,
        system: EXTRACT_SYSTEM,
        messages: [{ role: "user", content: blocks }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({ error: `vision request failed (${res.status}): ${body.slice(0, 300)}` }, { status: 502 });
    }
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    const styleSpec = (j.content?.find((c) => c.type === "text")?.text ?? "").trim();
    if (!styleSpec) return NextResponse.json({ error: "no style returned" }, { status: 502 });
    return NextResponse.json({ ok: true, styleSpec, analyzed: blocks.length - 1, skipped });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
