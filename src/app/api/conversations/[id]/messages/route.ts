import { NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat-user";
import { appendMessage, type MessageInput } from "@/lib/conversations";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Append a message (user or assistant) to a thread. The client persists each
 *  turn here after the stream completes; the agent stream itself stays on
 *  /api/agents/chat. */
export async function POST(req: Request, { params }: Ctx) {
  const user = await resolveChatUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as MessageInput;
  if (!body.role) return NextResponse.json({ error: "role required" }, { status: 400 });
  try {
    const message = await appendMessage(user.sb, user.id, id, body);
    return NextResponse.json({ message }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
