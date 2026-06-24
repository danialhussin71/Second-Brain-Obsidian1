import { NextResponse } from "next/server";
import { searchVault, vaultConfigured } from "@/lib/brain-vault";

export const runtime = "nodejs";

/** POST /api/brain/vault/search — semantic query over the stored vault (test box on /brain). */
export async function POST(req: Request) {
  const cfg = vaultConfigured();
  if (!cfg.ok) return NextResponse.json({ ok: false, error: cfg.reason, hits: [] }, { status: 503 });

  let body: { query?: string; limit?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON", hits: [] }, { status: 400 });
  }
  const query = (body.query || "").trim();
  if (!query) return NextResponse.json({ ok: false, error: "Empty query", hits: [] }, { status: 400 });

  const hits = await searchVault(query, { limit: Math.min(12, body.limit ?? 6), groupByDocument: true });
  return NextResponse.json({ ok: true, hits });
}
