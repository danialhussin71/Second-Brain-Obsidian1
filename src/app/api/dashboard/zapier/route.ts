import { NextResponse } from "next/server";
import { zapierMcpConfigured, listZapierTools, callZapierTool } from "@/lib/zapier-mcp";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET /api/dashboard/zapier — connection status + the actions Zapier exposes. */
export async function GET() {
  const configured = zapierMcpConfigured();
  const tools = configured ? await listZapierTools() : [];
  return NextResponse.json({
    configured,
    count: tools.length,
    tools,
    note: configured
      ? `${tools.length} Zapier action(s) available.`
      : "Set ZAPIER_MCP_URL (+ ZAPIER_MCP_TOKEN) from mcp.zapier.com → your server → Connect tab.",
  });
}

/** POST /api/dashboard/zapier — run one Zapier action. Body: { name, arguments? }. */
export async function POST(req: Request) {
  if (!zapierMcpConfigured()) {
    return NextResponse.json({ ok: false, error: "Zapier MCP not configured (set ZAPIER_MCP_URL)" }, { status: 503 });
  }
  let body: { name?: string; arguments?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name) {
    return NextResponse.json({ ok: false, error: "`name` (the Zapier action) is required" }, { status: 400 });
  }
  const result = await callZapierTool(body.name, body.arguments ?? {});
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
