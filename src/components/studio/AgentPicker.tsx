"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { CHAT_AGENTS, chatAgentMeta, type ChatAgentKey } from "@/lib/agent-meta";
import StudioAgentIcon from "./StudioAgentIcon";
import { cn } from "@/lib/utils";

type Props = {
  value: ChatAgentKey;
  onSelect: (key: ChatAgentKey) => void;
  /** "trigger" = compact button + popover; "grid" = always-open card grid (empty state). */
  variant?: "trigger" | "grid";
  align?: "left" | "right";
};

export default function AgentPicker({ value, onSelect, variant = "trigger", align = "left" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (variant === "grid") {
    return (
      <div className="grid gap-2.5 sm:grid-cols-2">
        {CHAT_AGENTS.map((a, i) => (
          <motion.button
            key={a.key}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.05 }}
            whileHover={{ y: -2 }}
            onClick={() => onSelect(a.key)}
            className={cn(
              "group relative flex items-start gap-3 rounded-2xl border p-4 text-left transition",
              value === a.key
                ? "border-white/20 bg-white/[0.05]"
                : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]"
            )}
            style={value === a.key ? { borderColor: `${a.color}66` } : undefined}
          >
            <span
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{
                background: `${a.color}1a`,
                boxShadow: `inset 0 0 0 1px ${a.color}33`,
              }}
            >
              <StudioAgentIcon agentKey={a.key} size={20} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="font-semibold tracking-tight text-foreground">{a.name}</span>
              </span>
              <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wide" style={{ color: a.color }}>
                {a.role}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-foreground/50">{a.blurb}</span>
            </span>
          </motion.button>
        ))}
      </div>
    );
  }

  const cur = chatAgentMeta(value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-2 pr-2.5 text-sm transition hover:bg-white/[0.06]"
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-full"
          style={{ background: `${cur.color}1a`, boxShadow: `inset 0 0 0 1px ${cur.color}33` }}
        >
          <StudioAgentIcon agentKey={value} size={14} />
        </span>
        <span className="font-medium text-foreground/90">{cur.name}</span>
        <CaretDown size={12} weight="bold" className="text-foreground/40" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={cn(
              "absolute z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e16]/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl",
              align === "right" ? "right-0" : "left-0"
            )}
          >
            {CHAT_AGENTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => {
                  onSelect(a.key);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.05]"
              >
                <span
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                  style={{ background: `${a.color}1a`, boxShadow: `inset 0 0 0 1px ${a.color}33` }}
                >
                  <StudioAgentIcon agentKey={a.key} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">{a.name}</span>
                    {value === a.key && <Check size={12} weight="bold" className="text-emerald-300" />}
                  </span>
                  <span className="block truncate text-[11px] text-foreground/45">{a.role}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
