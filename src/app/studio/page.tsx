"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat, type Message } from "@ai-sdk/react";
import { motion } from "motion/react";
import { PaperPlaneTilt, Sparkle, Stop } from "@phosphor-icons/react";
import StudioSidebar from "@/components/studio/StudioSidebar";
import StudioMessages from "@/components/studio/StudioMessages";
import AgentPicker from "@/components/studio/AgentPicker";
import StudioAgentIcon from "@/components/studio/StudioAgentIcon";
import DocSettings from "@/components/studio/DocSettings";
import { chatAgentMeta, type ChatAgentKey } from "@/lib/agent-meta";
import type { ConversationRow } from "@/lib/conversations";
import { cn } from "@/lib/utils";

const SUGGESTIONS: Record<string, string[]> = {
  main: [
    "What should I focus on this week?",
    "Summarize my positioning in three lines",
    "Who is my ideal customer, and why?",
  ],
  research: [
    "What's trending in my niche right now?",
    "Find 5 content angles from this week's conversations",
  ],
  content: [
    "Write a LinkedIn hook about customer retention",
    "Turn my Rule of One into a personal story post",
  ],
  marketing: ["Draft this week's newsletter", "Write 3 subject-line A/B options"],
  sales: ["Who should I target first, and why?", "Score this prospect against my ICP"],
  outreach: ["Write a cold DM for a CRO at a SaaS company", "Build a 4-step follow-up cadence"],
};

export default function StudioPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [agentKey, setAgentKey] = useState<ChatAgentKey>("main");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const agentKeyRef = useRef<ChatAgentKey>(agentKey);
  agentKeyRef.current = agentKey;

  const { messages, setMessages, append, isLoading, stop, input, setInput } = useChat({
    api: "/api/agents/chat",
    onFinish: (msg) => {
      const convoId = activeIdRef.current;
      if (!convoId) return;
      // Persist the assistant turn (text + tool calls) so it survives reloads.
      void persistMessage(convoId, {
        role: "assistant",
        content: typeof msg.content === "string" ? msg.content : "",
        parts: { toolInvocations: (msg as any).toolInvocations ?? [] },
      }).then(() => void refreshList());
    },
  });

  /* --------------------------- data loading --------------------------- */

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const { conversations } = await res.json();
      setConversations(conversations ?? []);
    } catch {
      /* offline / no DB — sidebar just stays empty */
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  /* --------------------------- persistence ---------------------------- */

  async function createConversation(key: ChatAgentKey): Promise<string | null> {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentKey: key }),
      });
      if (!res.ok) return null;
      const { conversation } = await res.json();
      setConversations((prev) => [conversation, ...prev]);
      return conversation.id as string;
    } catch {
      return null;
    }
  }

  async function persistMessage(
    convoId: string,
    msg: { role: "user" | "assistant"; content: string; parts?: unknown }
  ) {
    try {
      await fetch(`/api/conversations/${convoId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(msg),
      });
    } catch {
      /* best-effort */
    }
  }

  /* --------------------------- actions -------------------------------- */

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || isLoading) return;
      setInput("");

      let convoId = activeIdRef.current;
      if (!convoId) {
        convoId = await createConversation(agentKeyRef.current);
        if (convoId) {
          setActiveId(convoId);
          activeIdRef.current = convoId;
        }
      }
      if (convoId) void persistMessage(convoId, { role: "user", content: t });

      await append({ role: "user", content: t }, { body: { agentKey: agentKeyRef.current } });
    },
    [append, isLoading, setInput]
  );

  function newChat(key?: ChatAgentKey) {
    stop();
    setActiveId(null);
    activeIdRef.current = null;
    setMessages([]);
    setSettingsOpen(false);
    if (key) setAgentKey(key);
  }

  async function openConversation(id: string) {
    if (id === activeIdRef.current) {
      setSettingsOpen(false);
      return;
    }
    stop();
    setSettingsOpen(false);
    setActiveId(id);
    activeIdRef.current = id;
    const convo = conversations.find((c) => c.id === id);
    if (convo) setAgentKey(convo.agent_key as ChatAgentKey);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) {
        setMessages([]);
        return;
      }
      const { messages } = await res.json();
      setMessages((messages ?? []).map(toUiMessage));
    } catch {
      setMessages([]);
    }
  }

  async function deleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeIdRef.current === id) newChat();
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }

  // Switching agent: a thread is locked to its agent, so picking a different one
  // from a thread that already has messages starts a fresh chat with that agent.
  function pickAgent(key: ChatAgentKey) {
    if (messages.length > 0 || activeIdRef.current) newChat(key);
    else setAgentKey(key);
  }

  /* ----------------------------- render ------------------------------- */

  const meta = chatAgentMeta(agentKey);
  const empty = messages.length === 0;
  const suggestions = SUGGESTIONS[agentKey] ?? SUGGESTIONS.main;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05070d] text-foreground">
      {/* ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(900px 600px at 18% -10%, ${meta.color}14, transparent 60%), radial-gradient(800px 600px at 100% 110%, #22d3ee0f, transparent 55%)`,
        }}
      />

      <StudioSidebar
        conversations={conversations}
        activeId={activeId}
        loading={loadingList}
        onNewChat={() => newChat()}
        onSelect={openConversation}
        onDelete={deleteConversation}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Conversation column — offset for the collapsed sidebar rail */}
      <div className="relative flex h-full flex-col pl-[84px]">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <AgentPicker value={agentKey} onSelect={pickAgent} />
            <span className="hidden text-xs text-foreground/40 sm:block">{meta.role}</span>
          </div>
          <a
            href="/"
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-foreground/55 transition hover:bg-white/5 hover:text-foreground"
          >
            Stage
          </a>
        </header>

        {/* Messages / empty state */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-5 py-10">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-7 text-center"
              >
                <span
                  className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl"
                  style={{ background: `${meta.color}1a`, boxShadow: `inset 0 0 0 1px ${meta.color}40` }}
                >
                  <StudioAgentIcon agentKey={agentKey} size={28} />
                </span>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {agentKey === "main" ? "What can I help you build?" : `Ask ${meta.name}`}
                </h1>
                <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-foreground/45">
                  {meta.blurb}
                </p>
              </motion.div>

              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/30">
                Choose who to talk to
              </div>
              <AgentPicker value={agentKey} onSelect={pickAgent} variant="grid" />

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.02] px-3 py-1.5 text-xs text-foreground/55 transition hover:border-cyan-400/30 hover:bg-white/[0.05] hover:text-foreground"
                  >
                    <Sparkle size={11} weight="duotone" className="text-accent-300" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <StudioMessages messages={messages} agentKey={agentKey} isLoading={isLoading} />
          )}
        </div>

        {/* Composer */}
        <div className="px-4 pb-5 pt-1">
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => void send(input)}
            onStop={stop}
            isLoading={isLoading}
            placeholder={`Message ${meta.name}…`}
            accent={meta.color}
          />
          <div className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-foreground/25">
            {meta.name} is grounded in your uploaded knowledge · answers can be edited in settings
          </div>
        </div>
      </div>

      <DocSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  placeholder,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
  placeholder: string;
  accent: string;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div
        className="flex items-end gap-2 rounded-3xl border border-white/12 bg-white/[0.04] p-2 pl-4 shadow-xl shadow-black/40 backdrop-blur-xl transition focus-within:border-white/25"
        style={{ boxShadow: `0 0 0 1px ${accent}22, 0 20px 60px -30px ${accent}55` }}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="max-h-44 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-foreground/35"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        {isLoading ? (
          <button
            onClick={onStop}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-foreground transition hover:bg-white/15"
            title="Stop"
          >
            <Stop size={16} weight="fill" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim()}
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-black transition disabled:opacity-30",
              "bg-gradient-to-br from-white to-cyan-100 hover:from-cyan-50 hover:to-cyan-200"
            )}
            title="Send"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Map a stored message row → useChat Message (restoring tool calls). */
function toUiMessage(row: any): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content ?? "",
    ...(row.parts?.toolInvocations?.length
      ? { toolInvocations: row.parts.toolInvocations }
      : {}),
  } as Message;
}
