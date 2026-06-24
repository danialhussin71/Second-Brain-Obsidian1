"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CircleNotch,
  Check,
  Books,
  BookOpen,
  MagnifyingGlass,
  Globe,
  CaretRight,
  FileText,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** One tool invocation as the AI SDK streams it. */
export type ToolInvocation = {
  toolCallId: string;
  toolName: string;
  args?: any;
  state?: "partial-call" | "call" | "result";
  result?: any;
};

const DOC_LABELS: Record<string, string> = {
  "voice-dna": "Voice DNA",
  "rule-of-one": "Rule of One",
  "messaging-house": "Messaging House",
  "brand-positioning": "Brand Positioning",
  "business-authority": "Business Authority",
  "personal-authority": "Personal Authority",
  "icp-profile": "ICP Profile",
  "icp-intake": "ICP Intake",
  "offer-strategy": "Offer Strategy",
  "strategic-roadmap": "Strategic Roadmap",
  "business-inbox": "Business Inbox",
  "profile-optimization": "Profile Optimization",
};
const docLabel = (dt?: string) => (dt ? DOC_LABELS[dt] ?? dt : "");

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Descriptor = {
  Icon: typeof Books;
  pending: string;
  done: (inv: ToolInvocation) => string;
};

const DESCRIPTORS: Record<string, Descriptor> = {
  listBusinessDocs: {
    Icon: Books,
    pending: "Scanning your knowledge base",
    done: (inv) => `Mapped ${inv.result?.documents?.length ?? 0} documents`,
  },
  readBusinessDoc: {
    Icon: BookOpen,
    pending: "Opening a document",
    done: (inv) => `Read ${docLabel(inv.args?.doc_type) || inv.result?.title || "a document"}`,
  },
  searchBusinessDocs: {
    Icon: MagnifyingGlass,
    pending: "Searching your documents",
    done: (inv) => `Found ${inv.result?.count ?? 0} passages`,
  },
  webSearch: {
    Icon: Globe,
    pending: "Researching the web",
    done: (inv) =>
      inv.result?.configured === false
        ? "Web search not configured"
        : `Read ${inv.result?.results?.length ?? 0} sources`,
  },
};

const FALLBACK: Descriptor = {
  Icon: FileText,
  pending: "Working",
  done: () => "Done",
};

export default function ToolActivity({ invocations }: { invocations: ToolInvocation[] }) {
  if (!invocations?.length) return null;
  return (
    <div className="space-y-2">
      {invocations.map((inv) => (
        <ToolCard key={inv.toolCallId} inv={inv} />
      ))}
    </div>
  );
}

function ToolCard({ inv }: { inv: ToolInvocation }) {
  const desc = DESCRIPTORS[inv.toolName] ?? FALLBACK;
  const isDone = inv.state === "result";
  const [open, setOpen] = useState(false);
  const hasDetail = isDone && detailCount(inv) > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-xl border bg-white/[0.025] backdrop-blur-sm overflow-hidden",
        isDone ? "border-white/10" : "border-cyan-400/25"
      )}
    >
      <button
        type="button"
        disabled={!hasDetail}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 text-left",
          hasDetail && "hover:bg-white/[0.03]"
        )}
      >
        <span className="relative grid place-items-center h-6 w-6 shrink-0 rounded-lg bg-white/[0.04]">
          {isDone ? (
            <Check size={13} weight="bold" className="text-emerald-300" />
          ) : (
            <CircleNotch size={13} weight="bold" className="text-cyan-300 animate-spin" />
          )}
          {!isDone && (
            <span className="absolute inset-0 rounded-lg ring-1 ring-cyan-400/40 animate-pulse" />
          )}
        </span>
        <desc.Icon size={15} weight="duotone" className="shrink-0 text-foreground/55" />
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground/90">
            {isDone ? desc.done(inv) : desc.pending}
          </span>
          {(inv.args?.query || inv.args?.doc_type) && (
            <span className="block truncate text-[11px] text-foreground/40">
              {inv.args?.query
                ? `“${inv.args.query}”`
                : docLabel(inv.args?.doc_type)}
            </span>
          )}
        </span>
        {hasDetail && (
          <CaretRight
            size={13}
            weight="bold"
            className={cn(
              "shrink-0 text-foreground/35 transition-transform",
              open && "rotate-90"
            )}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && hasDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0.5">
              <ToolDetail inv={inv} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function detailCount(inv: ToolInvocation): number {
  const r = inv.result;
  if (!r) return 0;
  if (inv.toolName === "webSearch") return r.results?.length ?? 0;
  if (inv.toolName === "searchBusinessDocs") return r.results?.length ?? 0;
  if (inv.toolName === "listBusinessDocs") return r.documents?.length ?? 0;
  if (inv.toolName === "readBusinessDoc") return r.found ? 1 : 0;
  return 0;
}

function ToolDetail({ inv }: { inv: ToolInvocation }) {
  const r = inv.result;
  if (inv.toolName === "webSearch" && r?.results?.length) {
    return (
      <div className="space-y-1.5">
        {r.results.map((s: any, i: number) => (
          <motion.a
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2 hover:border-cyan-400/30 hover:bg-black/40 transition group"
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${domainOf(s.url)}&sz=64`}
              alt=""
              className="mt-0.5 h-4 w-4 shrink-0 rounded"
            />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-foreground/85 group-hover:text-cyan-200">
                {s.title}
              </span>
              <span className="block truncate text-[11px] text-foreground/40">
                {domainOf(s.url)}
              </span>
            </span>
          </motion.a>
        ))}
      </div>
    );
  }

  if (inv.toolName === "searchBusinessDocs" && r?.results?.length) {
    return (
      <div className="space-y-1.5">
        {r.results.map((hit: any, i: number) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-2"
          >
            <div className="flex items-center gap-2">
              <FileText size={12} weight="duotone" className="text-accent-300 shrink-0" />
              <span className="text-[12px] font-medium text-foreground/85">{hit.title}</span>
            </div>
            {hit.excerpt && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-foreground/45">
                {hit.excerpt}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    );
  }

  if (inv.toolName === "listBusinessDocs" && r?.documents?.length) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {r.documents.map((d: any, i: number) => (
          <motion.span
            key={d.docType}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px]",
              d.available
                ? "border-accent-400/25 bg-accent-500/10 text-accent-200"
                : "border-white/5 bg-white/[0.02] text-foreground/30"
            )}
          >
            {d.label}
          </motion.span>
        ))}
      </div>
    );
  }

  if (inv.toolName === "readBusinessDoc" && r?.found) {
    return (
      <div className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <BookOpen size={12} weight="duotone" className="text-accent-300 shrink-0" />
          <span className="text-[12px] font-medium text-foreground/85">{r.title}</span>
        </div>
        {r.summary && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-foreground/45">
            {r.summary}
          </p>
        )}
      </div>
    );
  }

  return null;
}
