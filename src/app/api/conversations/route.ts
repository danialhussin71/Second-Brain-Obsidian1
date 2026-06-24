import { NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat-user";
import { listConversations, createConversation } from "@/lib/conversations";
import { isChatAgentKey } from "@/lib/agent-meta";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await resolveChatUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const agentKey = new URL(req.url).searchParams.get("agentKey") || undefined;
  try {
    const conversations = await listConversations(user.sb, agentKey || undefined);
    return NextResponse.json({ conversations });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await resolveChatUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { agentKey, title } = (await req.json().catch(() => ({}))) as {
    agentKey?: string;
    title?: string;
  };
  if (!agentKey || !isChatAgentKey(agentKey)) {
    return NextResponse.json({ error: "invalid agentKey" }, { status: 400 });
  }
  try {
    const conversation = await createConversation(user.sb, user.id, agentKey, title);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
