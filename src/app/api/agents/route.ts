import { NextResponse } from "next/server";
import { listAgentConfigs } from "@/lib/gtm-agents";

export const runtime = "nodejs";

/** Public list of the GTM agents (code defaults merged with any DB overrides),
 *  trimmed to what the chat UI needs to render the picker + thread headers. */
export async function GET() {
  try {
    const agents = await listAgentConfigs();
    return NextResponse.json({
      agents: agents.map((a) => ({
        key: a.key,
        name: a.name,
        role: a.role,
        color: a.color,
        icon: a.icon,
        enabled: a.enabled,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
