import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Persistent chat threads. RLS scopes every row to the authenticated user, so
 * these helpers take the request-scoped server client and the user id (needed
 * for inserts). Backed by the `conversations` + `messages` tables (migration
 * 0006). Title is auto-derived from the first user message.
 */

export type ConversationRow = {
  id: string;
  agent_key: string;
  title: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type MessageInput = {
  role: "user" | "assistant" | "system" | "tool";
  parts?: unknown;
  content?: string;
};

export async function listConversations(
  sb: SupabaseClient,
  agentKey?: string
): Promise<ConversationRow[]> {
  let q = sb
    .from("conversations")
    .select("id, agent_key, title, pinned, created_at, updated_at")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(200);
  if (agentKey) q = q.eq("agent_key", agentKey);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ConversationRow[];
}

export async function createConversation(
  sb: SupabaseClient,
  userId: string,
  agentKey: string,
  title?: string
): Promise<ConversationRow> {
  const { data, error } = await sb
    .from("conversations")
    .insert({ user_id: userId, agent_key: agentKey, title: title ?? null })
    .select("id, agent_key, title, pinned, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as ConversationRow;
}

export async function getMessages(sb: SupabaseClient, conversationId: string) {
  const { data, error } = await sb
    .from("messages")
    .select("id, role, parts, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function appendMessage(
  sb: SupabaseClient,
  userId: string,
  conversationId: string,
  msg: MessageInput
) {
  const { data, error } = await sb
    .from("messages")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: msg.role,
      parts: msg.parts ?? null,
      content: msg.content ?? null,
    })
    .select("id, role, parts, content, created_at")
    .single();
  if (error) throw error;

  // Bump the thread and, if it has no title yet, derive one from the first user text.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (msg.role === "user" && msg.content) {
    const { data: convo } = await sb
      .from("conversations")
      .select("title")
      .eq("id", conversationId)
      .maybeSingle();
    if (convo && !convo.title) {
      patch.title = msg.content.slice(0, 60).replace(/\s+/g, " ").trim();
    }
  }
  await sb.from("conversations").update(patch).eq("id", conversationId);
  return data;
}

export async function updateConversation(
  sb: SupabaseClient,
  conversationId: string,
  patch: { title?: string; pinned?: boolean }
) {
  const { error } = await sb.from("conversations").update(patch).eq("id", conversationId);
  if (error) throw error;
}

export async function deleteConversation(sb: SupabaseClient, conversationId: string) {
  const { error } = await sb.from("conversations").delete().eq("id", conversationId);
  if (error) throw error;
}
