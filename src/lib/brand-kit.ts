/**
 * Brand kits — the founder's visual identity for generated assets. A kit holds
 * the LOCKED carousel style spec, accent colour, header text, and the founder's
 * face/logo. The carousel generator injects the style spec into every gpt-image-2
 * prompt and passes the face as a reference image so the founder's likeness
 * appears (header avatar + cover/closing cutout) and the brand is consistent.
 *
 * Stored in Supabase `brand_kits` (seeded per client; the settings UI edits it).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RefImage } from "./openai-image";
import { NO_EMDASH_RULE } from "./sanitize";

export type BrandKit = {
  client: string;
  displayName: string | null;
  handle: string | null;
  tagline: string | null;
  accentHex: string;
  styleSpec: string;
  facePath: string | null;
  faceUrl: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  fonts: string | null;
};

const isRealKey = (k?: string): k is string => !!k && /^(eyJ|sb_)/.test(k);
function brandKey(): string | undefined {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return isRealKey(service) ? service : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

let _db: SupabaseClient | null = null;
function brandDb(): SupabaseClient | null {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = brandKey();
  if (!url || !key) return null;
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

type Row = {
  client: string;
  display_name: string | null;
  handle: string | null;
  tagline: string | null;
  accent_hex: string | null;
  style_spec: string;
  face_path: string | null;
  face_url: string | null;
  logo_path: string | null;
  logo_url: string | null;
  fonts: string | null;
};

const cache = new Map<string, { kit: BrandKit | null; at: number }>();
const TTL = 60_000;

/** Load a client's brand kit (cached briefly). Returns null when none exists. */
export async function getBrandKit(client: string): Promise<BrandKit | null> {
  const hit = cache.get(client);
  if (hit && Date.now() - hit.at < TTL) return hit.kit;
  const db = brandDb();
  if (!db) return null;
  try {
    const { data, error } = await db.from("brand_kits").select("*").eq("client", client).maybeSingle();
    if (error || !data) {
      cache.set(client, { kit: null, at: Date.now() });
      return null;
    }
    const r = data as Row;
    const kit: BrandKit = {
      client: r.client,
      displayName: r.display_name,
      handle: r.handle,
      tagline: r.tagline,
      accentHex: r.accent_hex || "#ED1846",
      styleSpec: r.style_spec || "",
      facePath: r.face_path,
      faceUrl: r.face_url,
      logoPath: r.logo_path,
      logoUrl: r.logo_url,
      fonts: r.fonts,
    };
    cache.set(client, { kit, at: Date.now() });
    return kit;
  } catch {
    return null;
  }
}

/** Load the founder's face bytes — Storage URL preferred (deploy-safe), disk fallback. */
export async function loadBrandFace(kit: BrandKit): Promise<RefImage | null> {
  if (kit.faceUrl) {
    try {
      const res = await fetch(kit.faceUrl);
      if (res.ok) {
        return { data: new Uint8Array(await res.arrayBuffer()), name: "face.png", type: res.headers.get("content-type") || "image/png" };
      }
    } catch {
      /* fall through to disk */
    }
  }
  if (kit.facePath) {
    try {
      const abs = path.isAbsolute(kit.facePath) ? kit.facePath : path.join(process.cwd(), kit.facePath);
      const buf = await fs.readFile(abs);
      return { data: new Uint8Array(buf), name: "face.png", type: "image/png" };
    } catch {
      /* no asset available */
    }
  }
  return null;
}

/* --------------------------- writes (settings UI) --------------------------- */

export type BrandKitFields = Partial<{
  display_name: string;
  handle: string;
  tagline: string;
  accent_hex: string;
  style_spec: string;
  face_path: string;
  face_url: string;
  logo_path: string;
  logo_url: string;
  fonts: string;
  notes: string;
}>;

/** Upsert a client's brand-kit fields (settings UI). Busts the read cache. */
export async function saveBrandKit(client: string, fields: BrandKitFields): Promise<boolean> {
  const db = brandDb();
  if (!db) return false;
  const { error } = await db.from("brand_kits").upsert({ client, ...fields }, { onConflict: "client" });
  cache.delete(client);
  if (error) {
    console.error("[brand-kit] save failed:", error.message);
    return false;
  }
  return true;
}

const BRANDING_BUCKET = "branding";

/** Upload a face/logo asset to Supabase Storage (public) and point the kit at its URL.
 *  Deploy-safe (no disk writes). Unique filename busts the CDN cache on replace. */
export async function saveBrandAsset(
  client: string,
  kind: "face" | "logo",
  bytes: Uint8Array,
  ext: string,
  contentType?: string
): Promise<string | null> {
  const db = brandDb();
  if (!db) return null;
  try {
    const safeExt = (ext || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
    const ct = contentType || (safeExt === "jpg" || safeExt === "jpeg" ? "image/jpeg" : safeExt === "webp" ? "image/webp" : "image/png");
    const stamp = Date.now().toString(36) + Math.floor(performance.now()).toString(36);
    const objectPath = `${client}/${kind}-${stamp}.${safeExt}`;
    const { error: upErr } = await db.storage
      .from(BRANDING_BUCKET)
      .upload(objectPath, new Blob([bytes as unknown as BlobPart], { type: ct }), { contentType: ct, upsert: true });
    if (upErr) throw upErr;
    const url = db.storage.from(BRANDING_BUCKET).getPublicUrl(objectPath).data.publicUrl;
    await saveBrandKit(client, kind === "face" ? { face_url: url } : { logo_url: url });
    return url;
  } catch (err) {
    console.error("[brand-kit] asset upload failed:", err);
    return null;
  }
}

export type SlideRole = "cover" | "content" | "closing";

/** First slide = cover, last = closing, middle = content. */
export function slideRole(index: number, total: number): SlideRole {
  if (index === 0) return "cover";
  if (index === total - 1) return "closing";
  return "content";
}

export type SlideLayout = "split" | "stacked" | "statement";

/**
 * Build the gpt-image-2 prompt for ONE on-brand slide: the locked style spec +
 * the slide's LAYOUT (so text and visuals sit in separate regions, never text
 * dumped over an image), verbatim copy, and the concrete visual elements / real
 * official logos. Cover & closing slides are heroes with the founder's cutout.
 */
export function brandCarouselSlidePrompt(args: {
  kit: BrandKit;
  index: number;
  total: number;
  role: SlideRole;
  layout: SlideLayout;
  title: string;
  body: string;
  visual: string;
  logos: string[];
  topic: string;
}): string {
  const { kit, index, total, role, layout, title, body, visual, logos, topic } = args;
  const who = kit.displayName || "the founder";
  const tagline = kit.tagline || "";

  // REPEATABLE ELEMENTS — described explicitly + identically so the branding
  // renders the same on every slide (one cohesive template, not a redesign each time).
  const repeatable =
    `REPEATABLE ELEMENTS — render these IDENTICALLY on EVERY slide (exact same position, sizes, fonts, colours and text) so the whole deck reads as ONE cohesive template: ` +
    `(1) TOP-LEFT a circular avatar photo of ${who}, about 80px in diameter, with the photo set on a SOLID crimson ${kit.accentHex} background (fill the circle's backdrop with ${kit.accentHex} — NOT white) and a thin ${kit.accentHex} ring; ` +
    `(2) immediately to its right the name "${who}" in BOLD WHITE at about 30px` +
    (tagline
      ? `, and directly beneath the name the subtitle "${tagline}" in light grey (#CFCFCF) at about 18px, wrapped to EXACTLY TWO lines — never one, never three — with the line break kept at the same word on every slide`
      : "") +
    `; (3) TOP-RIGHT the word "REPOST" in bold condensed white capitals at about 26px, beside a repost / retweet double-arrow icon; ` +
    `(4) the white slide number "${index + 1}" at about 38px in the BOTTOM-RIGHT corner. ` +
    `Do NOT move, restyle, resize or redesign these from slide to slide — keep them pixel-consistent.`;

  let layoutLine: string;
  if (role === "cover") {
    layoutLine = `LAYOUT — HERO COVER (slide 1 of ${total}): ${who} as a photorealistic, background-removed CUTOUT on the RIGHT, confident, looking at camera (use his EXACT face/likeness from the reference). The big headline sits lower-left.`;
  } else if (role === "closing") {
    layoutLine = `LAYOUT — HERO CLOSING (slide ${total} of ${total}): ${who} as a photorealistic background-removed CUTOUT on the RIGHT (grey blazer over black tee, exact face from the reference). Big headline on the left, with a small crimson "FOLLOW" pill at the bottom-left.`;
  } else if (layout === "split") {
    layoutLine = `LAYOUT — SPLIT: headline + body text on the LEFT half; the MAIN VISUAL on the RIGHT half, in clearly SEPARATE regions (text must NEVER sit on top of the visual). If the visual is a product screenshot or app/website UI, render it inside a realistic MOBILE PHONE mockup (half-width placement → phone frame).`;
  } else if (layout === "statement") {
    layoutLine = `LAYOUT — STATEMENT: a bold, mostly-text slide. Large headline and short body on the left, lots of negative space; keep any visual subtle and to the edge.`;
  } else {
    layoutLine = `LAYOUT — STACKED (three clean horizontal bands): 1) the headline at the TOP with the relevant logo/icon beside or just above it, 2) the body text full-width below it, 3) the MAIN VISUAL UNDERNEATH spanning the FULL width. If the visual is a product screenshot or app/website UI, render it inside a realistic DESKTOP BROWSER / laptop window mockup (full-width placement → browser/desktop). Text and visual never overlap.`;
  }

  const logoLine = logos.length
    ? `Render the OFFICIAL, accurate logos of ${logos.join(", ")} — each in a clean white rounded-square card with a soft shadow. Get the real brand marks right; do not invent or distort them.`
    : "";

  return [
    kit.styleSpec,
    "",
    repeatable,
    "",
    layoutLine,
    `Carousel topic: ${topic}.`,
    `HEADLINE (render VERBATIM in the condensed all-caps style, key word(s) in crimson ${kit.accentHex}): "${title}".`,
    body ? `BODY text (white, short punchy lines, render verbatim): "${body}".` : "",
    visual ? `MAIN VISUAL: ${visual}.` : "",
    logoLine,
    `DEVICE MOCKUP RULE: any on-screen UI / product screenshot shown at HALF width uses a MOBILE PHONE frame; any shown at FULL width uses a DESKTOP BROWSER / laptop window. Match the device to the placement.`,
    `Use REAL, recognizable logos and product UIs, never generic, abstract or conceptual art (no random robots / 3D blobs).`,
    `TEXT PUNCTUATION: ${NO_EMDASH_RULE}`,
  ]
    .filter(Boolean)
    .join("\n");
}
