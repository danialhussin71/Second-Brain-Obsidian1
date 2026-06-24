import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultClient } from "@/lib/client-knowledge";
import { getBrandKit, saveBrandAsset } from "@/lib/brand-kit";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 12MB
const CONTENT_TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** POST a face/logo image (multipart: file + kind). Stores it + points the kit at it. */
export async function POST(req: Request) {
  const client = await defaultClient();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const kind = String(form.get("kind") || "");
  const file = form.get("file");
  if (kind !== "face" && kind !== "logo") return NextResponse.json({ error: "kind must be face|logo" }, { status: 400 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "image too large (max 12MB)" }, { status: 413 });

  const name = "name" in file ? String((file as File).name || "") : "";
  const ext = (name.split(".").pop() || (file.type.split("/")[1] ?? "png")).toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const url = await saveBrandAsset(client, kind, bytes, ext, file.type || undefined);
  if (!url) return NextResponse.json({ error: "upload failed" }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}

/** GET ?kind=face|logo — the stored asset (Storage URL preferred, disk fallback) for preview. */
export async function GET(req: Request) {
  const client = await defaultClient();
  const kind = new URL(req.url).searchParams.get("kind") === "logo" ? "logo" : "face";
  const kit = await getBrandKit(client);
  const url = kind === "face" ? kit?.faceUrl : kit?.logoUrl;
  if (url) return NextResponse.redirect(url);

  // disk fallback (legacy bundled assets)
  const rel = kind === "face" ? kit?.facePath : kit?.logoPath;
  if (!rel) return new NextResponse(null, { status: 404 });
  try {
    const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
    const buf = await fs.readFile(abs);
    const ext = (rel.split(".").pop() || "png").toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      headers: { "content-type": CONTENT_TYPE[ext] || "image/png", "cache-control": "no-store" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
