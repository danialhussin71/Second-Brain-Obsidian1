import { NextResponse } from "next/server";
import { buildVaultGraph, vaultConfigured } from "@/lib/brain-vault";

export const runtime = "nodejs";

/** GET /api/brain/vault/graph — the knowledge graph (nodes + wikilink edges) of
 *  the stored vault, in the same shape the stage BrainGraph renders. */
export async function GET() {
  const cfg = vaultConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ graph: { nodes: [], links: [], folders: [] }, stats: { notes: 0, links: 0, folders: 0 }, reason: cfg.reason });
  }
  const { graph, stats } = await buildVaultGraph();
  return NextResponse.json({ graph, stats });
}
