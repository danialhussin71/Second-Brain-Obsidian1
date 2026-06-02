import { NextResponse } from "next/server";
import { getCachedVault, readGraphFromBlob } from "@/lib/vault";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Fast path: read the pre-built graph JSON from Blob (milliseconds).
    // Uploaded by `node scripts/sync-to-blob.mjs`.
    const fast = await readGraphFromBlob();
    if (fast) {
      return NextResponse.json({
        graph: fast,
        stats: {
          notes: fast.noteCount ?? fast.nodes.length,
          links: fast.links.length,
          folders: fast.folders.length,
          lastEdited: fast.lastEdited ?? 0,
        },
      });
    }

    // Slow path: build graph by reading individual vault files from Blob.
    const { graph, notes } = await getCachedVault();
    return NextResponse.json({
      graph,
      stats: {
        notes: notes.length,
        links: graph.links.length,
        folders: graph.folders.length,
        lastEdited: Math.max(0, ...notes.map((n) => n.mtime)),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "vault read failed" },
      { status: 500 }
    );
  }
}
