"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  GearSix,
  Brain,
  TrashSimple,
  ChatCircleDots,
  PushPin,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import StudioAgentIcon from "./StudioAgentIcon";
import type { ConversationRow } from "@/lib/conversations";

const COLLAPSED = 60;
const EXPANDED = 280;

type Props = {
  conversations: ConversationRow[];
  activeId: string | null;
  loading?: boolean;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
};

function groupLabel(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const day = 86_400_000;
  if (now - d < day) return "Today";
  if (now - d < 2 * day) return "Yesterday";
  if (now - d < 7 * day) return "Previous 7 days";
  if (now - d < 30 * day) return "Previous 30 days";
  return "Older";
}

export default function StudioSidebar({
  conversations,
  activeId,
  loading,
  onNewChat,
  onSelect,
  onDelete,
  onOpenSettings,
}: Props) {
  const [hover, setHover] = useState(false);
  const expanded = hover;

  // Group threads by recency, preserving the already-sorted order.
  const groups: { label: string; items: ConversationRow[] }[] = [];
  for (const c of conversations) {
    const label = c.pinned ? "Pinned" : groupLabel(c.updated_at);
    let g = groups.find((x) => x.label === label);
    if (!g) {
      g = { label, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }

  return (
    <motion.aside
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      initial={false}
      animate={{ width: expanded ? EXPANDED : COLLAPSED }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="fixed left-3 top-3 bottom-3 z-40 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0d14]/85 shadow-2xl shadow-black/50 backdrop-blur-2xl"
      style={{ width: COLLAPSED }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-[18px] pt-4 pb-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center">
          <Brain size={22} weight="duotone" className="text-violet-300" />
        </span>
        <AnimatePresence>
          {expanded && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              className="whitespace-nowrap text-sm font-semibold tracking-tight text-foreground"
            >
              Second Brain
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* New chat */}
      <div className="px-2.5 pb-2">
        <button
          type="button"
          onClick={onNewChat}
          className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-[11px] py-2.5 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
        >
          <Plus size={18} weight="bold" className="shrink-0 text-cyan-300" />
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap text-sm font-medium text-foreground/90"
              >
                New chat
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* History */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!expanded ? (
          <div className="flex flex-col items-center gap-1 pt-1">
            {conversations.slice(0, 7).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                title={c.title ?? "Untitled"}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl transition",
                  activeId === c.id ? "bg-white/10" : "hover:bg-white/5"
                )}
              >
                <StudioAgentIcon agentKey={c.agent_key} size={16} />
              </button>
            ))}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pt-1">
            {loading && conversations.length === 0 && (
              <div className="px-2 py-3 text-xs text-foreground/35">Loading…</div>
            )}
            {!loading && conversations.length === 0 && (
              <div className="px-2 py-3 text-xs leading-relaxed text-foreground/35">
                No chats yet. Hit <span className="text-cyan-300">New chat</span> to begin.
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/30">
                  {g.label}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((c) => (
                    <ThreadRow
                      key={c.id}
                      convo={c}
                      active={activeId === c.id}
                      onSelect={() => onSelect(c.id)}
                      onDelete={() => onDelete(c.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Settings */}
      <div className="border-t border-white/8 px-2.5 py-2.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-3 rounded-2xl px-[11px] py-2.5 text-left text-foreground/70 transition hover:bg-white/5 hover:text-foreground"
        >
          <GearSix size={18} weight="duotone" className="shrink-0" />
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap text-sm font-medium"
              >
                Knowledge & settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}

function ThreadRow({
  convo,
  active,
  onSelect,
  onDelete,
}: {
  convo: ConversationRow;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition",
        active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
      )}
    >
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="shrink-0">
          {convo.title ? (
            <StudioAgentIcon agentKey={convo.agent_key} size={14} />
          ) : (
            <ChatCircleDots size={14} weight="duotone" className="text-foreground/40" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-foreground/85">
            {convo.title ?? "New conversation"}
          </span>
        </span>
        {convo.pinned && <PushPin size={11} weight="fill" className="shrink-0 text-amber-300/70" />}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete chat"
        className="shrink-0 rounded-md p-1 text-foreground/30 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100"
      >
        <TrashSimple size={13} weight="bold" />
      </button>
    </div>
  );
}
