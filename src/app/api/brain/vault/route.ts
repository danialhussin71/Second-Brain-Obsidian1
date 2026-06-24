import { NextResponse } from "next/server";
import { vaultConfigured, embeddingProvider, vaultStats, vaultSample, VAULT_CLIENT } from "@/lib/brain-vault";

export const runtime = "nodejs";

/** GET /api/brain/vault — the brain's current state for the /brain page. */
export async function GET() {
  const cfg = vaultConfigured();
  const stats = cfg.ok ? await vaultStats() : { documents: 0, chunks: 0, folders: 0 };
  const sample = cfg.ok && stats.documents > 0 ? await vaultSample() : [];
  return NextResponse.json({
    configured: cfg.ok,
    reason: cfg.reason,
    provider: embeddingProvider(),
    client: VAULT_CLIENT,
    stats,
    sample,
  });
}
