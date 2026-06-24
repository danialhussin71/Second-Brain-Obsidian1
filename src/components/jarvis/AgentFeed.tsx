"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowsOut } from "@phosphor-icons/react";
import { node } from "@/lib/org";
import JarvisIcon from "./JarvisIcon";
import type { FeedEntry } from "./useJarvisRun";

const KIND_LABEL: Record<FeedEntry["kind"], string> = {
  route: "ROUTE",
  activate: "ONLINE",
  status: "···",
  tool: "READ",
  output: "DONE",
  report: "↑ UP",
};

export default function AgentFeed({
  feed,
  running,
  onExpand,
}: {
  feed: FeedEntry[];
  running: boolean;
  onExpand?: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [feed.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Mission feed</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/35">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-emerald-400" : "bg-white/20"}`} />
            {running ? "active" : "idle"}
          </span>
          {onExpand && (
            <button
              onClick={onExpand}
              title="Expand mission feed"
              className="grid h-6 w-6 place-items-center rounded-md text-white/40 transition hover:bg-white/8 hover:text-white"
            >
              <ArrowsOut size={13} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {feed.length === 0 && (
          <div className="grid h-full place-items-center px-6 text-center text-[12px] leading-relaxed text-white/30">
            Give KRONOS one instruction. Watch it route the job down the org and report back up.
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {feed.map((f) => {
              const n = node(f.node);
              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-start gap-2.5 rounded-lg px-1.5 py-1"
                >
                  <span
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md"
                    style={{ background: `${n.color}1f`, color: n.color }}
                  >
                    <JarvisIcon name={n.icon} size={11} weight="fill" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[11px] font-semibold text-white/85">{n.title}</span>
                      <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: `${n.color}cc` }}>
                        {KIND_LABEL[f.kind]}
                      </span>
                    </span>
                    <span className="block text-[11.5px] leading-snug text-white/55">{f.text}</span>
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
