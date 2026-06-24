"use client";

import { motion } from "motion/react";
import { ORG, childrenOf, type OrgNode } from "@/lib/org";
import type { JarvisNodeId } from "@/lib/jarvis-events";
import type { NodePhase } from "./useJarvisRun";
import JarvisIcon from "./JarvisIcon";
import { cn } from "@/lib/utils";

type Props = {
  active?: JarvisNodeId;
  litPath: JarvisNodeId[];
  phases: Partial<Record<JarvisNodeId, NodePhase>>;
  /** roomier vertical rhythm so the tree fills the column instead of scrolling */
  spread?: boolean;
};

/**
 * The live org chart, rendered as a recursive indented tree straight onto the
 * page (no panel). CEO on top -> departments -> specialists -> content formats.
 * The connector lines and stubs light up along the active path as the CEO
 * delegates down.
 */
export default function OrgChart({ active, litPath, phases, spread }: Props) {
  const gap = spread ? "gap-3" : "gap-1.5";
  const lit = (id: JarvisNodeId) => litPath.includes(id);
  const engaged = (id: JarvisNodeId) =>
    lit(id) || phases[id] === "working" || phases[id] === "done";
  const subtreeLit = (id: JarvisNodeId): boolean =>
    engaged(id) || childrenOf(id).some((c) => subtreeLit(c.id));

  const Row = ({ n, depth, stub }: { n: OrgNode; depth: number; stub: boolean }) => {
    const isActive = active === n.id;
    const on = engaged(n.id);
    const done = phases[n.id] === "done";
    const col = n.color;
    const ceo = depth === 0;
    return (
      <div className="relative">
        {stub && (
          <span
            className="absolute top-1/2 h-px transition-colors duration-500"
            style={{ left: -13, width: 13, background: on ? col : "rgba(255,255,255,0.1)", boxShadow: on ? `0 0 6px ${col}` : "none" }}
            aria-hidden
          />
        )}
        <motion.div
          animate={{ scale: isActive ? 1.02 : 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className={cn(
            "relative flex items-center gap-2 rounded-lg border transition-colors duration-500",
            isActive && "moving-border",
            ceo ? "px-3 py-2" : "px-2.5 py-1.5",
          )}
          style={{
            borderColor: on ? `${col}99` : "rgba(255,255,255,0.07)",
            background: on ? `linear-gradient(180deg, ${col}1f, ${col}08)` : "rgba(255,255,255,0.012)",
            boxShadow: isActive ? `0 0 20px ${col}55` : "none",
          }}
        >
          <span
            className="grid shrink-0 place-items-center rounded-md transition-colors duration-500"
            style={{
              height: ceo ? 26 : 22,
              width: ceo ? 26 : 22,
              background: on ? `${col}26` : "rgba(255,255,255,0.04)",
              color: on ? col : "rgba(255,255,255,0.4)",
            }}
          >
            <JarvisIcon name={n.icon} size={ceo ? 15 : 13} weight={on ? "fill" : "regular"} />
          </span>

          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className={cn("truncate font-semibold tracking-tight", ceo ? "text-[13px]" : "text-[12px]")} style={{ color: on ? "#fff" : "rgba(255,255,255,0.62)" }}>
              {n.title}
            </span>
            <span className="truncate text-[10px]" style={{ color: on ? `${col}cc` : "rgba(255,255,255,0.28)" }}>
              {n.label}
            </span>
          </span>

          <span className="flex h-3 w-3 shrink-0 items-center justify-center">
            {isActive ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ background: col }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: col }} />
              </span>
            ) : done ? (
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: col }} />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-white/12" />
            )}
          </span>
        </motion.div>
      </div>
    );
  };

  const Tree = ({ id, depth }: { id: JarvisNodeId; depth: number }) => {
    const n = ORG[id];
    const kids = childrenOf(id);
    const branchLit = kids.some((c) => subtreeLit(c.id));
    return (
      <div className={cn("flex flex-col", gap)}>
        <Row n={n} depth={depth} stub={depth > 0} />
        {kids.length > 0 && (
          <div
            className={cn("ml-3 flex flex-col border-l pl-3 transition-colors duration-500", gap)}
            style={{ borderColor: branchLit ? `${n.color}66` : "rgba(255,255,255,0.08)" }}
          >
            {kids.map((c) => (
              <Tree key={c.id} id={c.id} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return <Tree id="kronos" depth={0} />;
}
