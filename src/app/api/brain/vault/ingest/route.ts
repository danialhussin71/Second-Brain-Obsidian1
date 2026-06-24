import { NextResponse } from "next/server";
import { clearVault, ingestNotes, vaultStats, vaultConfigured, type VaultNoteInput } from "@/lib/brain-vault";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/brain/vault/ingest — embed + store ONE batch of vault notes.
 *
 * The /brain page unzips client-side and streams batches here, tracking progress.
 * Send `reset: true` on the FIRST batch to wipe the previous vault (a fresh
 * upload fully replaces it). Each call returns this batch's counts + the running
 * totals so the UI can show a live progress bar.
 *
 * Body: { notes: { path, content }[], reset?: boolean, client?: string }
 */
export async function POST(req: Request) {
  const cfg = vaultConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ ok: false, error: cfg.reason }, { status: 503 });
  }

  let body: { notes?: VaultNoteInput[]; reset?: boolean; client?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const notes = Array.isArray(body.notes) ? body.notes.filter((n) => n?.path && typeof n.content === "string") : [];
  if (notes.length === 0) {
    return NextResponse.json({ ok: false, error: "No notes in batch" }, { status: 400 });
  }

  try {
    if (body.reset) await clearVault(body.client);
    const batch = await ingestNotes(notes, body.client);
    const stats = await vaultStats(body.client);
    return NextResponse.json({ ok: true, batch, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vault/ingest] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
