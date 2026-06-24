import { NextResponse } from "next/server";
import { zapierMcpConfigured } from "@/lib/zapier-mcp";
import { buildLiveDashboard, type DashboardLive } from "@/lib/dashboard-live";

export const runtime = "nodejs";
export const maxDuration = 180; // the LLM tool-loop over the connected apps can take a bit

// The tool-loop is slow + costs real tokens, so cache the snapshot per warm
// instance. `?refresh=1` forces a re-pull. (Module state survives warm invocations
// on Vercel; cold starts simply rebuild it.)
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: DashboardLive } | null = null;

/**
 * GET /api/dashboard/data — live dashboard snapshot from the founder's connected
 * apps (via Zapier MCP). Returns { live: false } when unconfigured (local dev),
 * so the dashboard renders its demo data instead.
 */
export async function GET(req: Request) {
  if (!zapierMcpConfigured()) {
    return NextResponse.json({ live: false, note: "Zapier MCP not configured (set ZAPIER_MCP_URL)." });
  }
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (!refresh && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ live: true, data: cache.data, cached: true });
  }
  try {
    const data = await buildLiveDashboard();
    if (!data) return NextResponse.json({ live: false, note: "No live data available." });
    cache = { at: Date.now(), data };
    return NextResponse.json({ live: true, data });
  } catch (err) {
    // serve stale cache on error if we have one
    if (cache) return NextResponse.json({ live: true, data: cache.data, cached: true, stale: true });
    return NextResponse.json({ live: false, error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
