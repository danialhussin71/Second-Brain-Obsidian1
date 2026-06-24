"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Streamdown } from "streamdown";
import type { Message } from "@ai-sdk/react";
import StudioAgentIcon from "./StudioAgentIcon";
import ToolActivity, { type ToolInvocation } from "./ToolActivity";
import { chatAgentMeta } from "@/lib/agent-meta";

type Props = {
  messages: Message[];
  agentKey: string;
  isLoading: boolean;
};

export default function StudioMessages({ messages, agentKey, isLoading }: Props) {
  const meta = chatAgentMeta(agentKey);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  // The last assistant turn is "thinking" until any text or tool call appears.
  const last = messages[messages.length - 1];
  const awaitingFirstToken =
    isLoading &&
    (!last ||
      last.role === "user" ||
      (last.role === "assistant" &&
        !last.content &&
        !(last as any).toolInvocations?.length));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-8">
      {messages.map((m) => {
        const tools = ((m as any).toolInvocations ?? []) as ToolInvocation[];
        if (m.role === "user") {
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end"
            >
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-white/10 bg-white/[0.06] px-4 py-2.5 text-[15px] leading-relaxed text-foreground/90">
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </motion.div>
          );
        }
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <span
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl"
              style={{
                background: `${meta.color}1a`,
                boxShadow: `inset 0 0 0 1px ${meta.color}33`,
              }}
            >
              <StudioAgentIcon agentKey={agentKey} size={16} />
            </span>
            <div className="min-w-0 flex-1 space-y-3 pt-0.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/40">
                {meta.name}
              </div>
              {tools.length > 0 && <ToolActivity invocations={tools} />}
              {m.content && (
                <div className="prose prose-invert prose-sm max-w-none text-[15px] leading-relaxed prose-p:my-2 prose-headings:tracking-tight prose-headings:text-foreground prose-strong:text-white prose-li:my-0.5 prose-code:rounded prose-code:bg-accent-500/10 prose-code:px-1 prose-code:text-accent-200 prose-code:before:content-none prose-code:after:content-none prose-a:text-cyan-300">
                  <Streamdown>{m.content}</Streamdown>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}

      <AnimatePresence>
        {awaitingFirstToken && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex gap-3"
          >
            <span
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl"
              style={{ background: `${meta.color}1a`, boxShadow: `inset 0 0 0 1px ${meta.color}33` }}
            >
              <StudioAgentIcon agentKey={agentKey} size={16} />
            </span>
            <div className="flex items-center gap-1.5 pt-2.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-foreground/40"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={endRef} />
    </div>
  );
}
