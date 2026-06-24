import { NextResponse } from "next/server";
import { defaultClient } from "@/lib/client-knowledge";
import { getBrandKit, saveBrandKit, type BrandKitFields } from "@/lib/brand-kit";

export const runtime = "nodejs";

/** GET the active client's brand kit for the settings panel. */
export async function GET() {
  const client = await defaultClient();
  const kit = await getBrandKit(client);
  return NextResponse.json({ client, kit });
}

/** Save brand-kit fields (display name, tagline, accent, style spec, fonts…). */
export async function PUT(req: Request) {
  const client = await defaultClient();
  const body = (await req.json().catch(() => ({}))) as { fields?: BrandKitFields };
  const fields = body.fields ?? {};
  // whitelist the editable columns
  const allowed: (keyof BrandKitFields)[] = ["display_name", "handle", "tagline", "accent_hex", "style_spec", "fonts", "notes"];
  const clean: BrandKitFields = {};
  for (const k of allowed) if (k in fields) clean[k] = fields[k] as never;
  const ok = await saveBrandKit(client, clean);
  if (!ok) return NextResponse.json({ error: "save failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
