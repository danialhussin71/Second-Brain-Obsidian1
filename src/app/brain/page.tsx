"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { unzip, strFromU8 } from "fflate";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Brain,
  FileZip,
  UploadSimple,
  CheckCircle,
  Database,
  MagnifyingGlass,
  Lightning,
  WarningCircle,
  CloudArrowUp,
  FolderOpen,
  Sparkle,
  Graph,
  X,
} from "@phosphor-icons/react";
import { Counter, Meter, Panel, Rise, StatusDot } from "@/components/dashboard/ui";

/**
 * /brain — upload an Obsidian vault (.zip), vectorize it, and store it in
 * Supabase pgvector. The whole vault becomes the second brain that /jarvis
 * retrieves from. Unzipping + parsing happens in-browser; notes stream to
 * /api/brain/vault/ingest in batches with a live progress bar.
 */

type ParsedNote = { path: string; content: string };
type Phase = "idle" | "parsing" | "ready" | "ingesting" | "done" | "error";
type Status = {
  configured: boolean;
  reason?: string;
  provider: string;
  client: string;
  stats: { documents: number; chunks: number; folders: number };
  sample: { title: string; folder: string; chunks: number }[];
};
type SearchHit = { title: string; folder: string; similarity: number; content: string };

const BATCH_SIZE = 25;

const isExcluded = (name: string) => {
  const lower = name.toLowerCase();
  return (
    lower.startsWith("__macosx/") ||
    lower.includes("/.obsidian/") ||
    lower.startsWith(".obsidian/") ||
    lower.includes("/.trash/") ||
    lower.startsWith(".trash/") ||
    name.split("/").some((seg) => seg.startsWith(".")) ||
    !lower.endsWith(".md")
  );
};

/** Strip a shared top-level folder (e.g. "MyVault/") so paths read cleanly. */
function stripCommonRoot(paths: string[]): (p: string) => string {
  if (paths.length === 0) return (p) => p;
  const firstSegs = paths.map((p) => p.split("/")[0]);
  const root = firstSegs[0];
  const shared = firstSegs.every((s) => s === root) && paths.every((p) => p.includes("/"));
  return shared ? (p) => p.slice(root.length + 1) : (p) => p;
}

export default function BrainPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [notes, setNotes] = useState<ParsedNote[]>([]);
  const [zipName, setZipName] = useState("");
  const [zipSize, setZipSize] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  // ingest progress
  const [done, setDone] = useState(0);
  const [chunks, setChunks] = useState(0);
  const [currentFolder, setCurrentFolder] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/vault");
      if (res.ok) setStatus(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please upload a .zip of your Obsidian vault.");
      setPhase("error");
      return;
    }
    setZipName(file.name);
    setZipSize(file.size);
    setPhase("parsing");
    setNotes([]);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        unzip(buf, { filter: (f) => !isExcluded(f.name) }, (err, data) => (err ? reject(err) : resolve(data)));
      });
      const rawPaths = Object.keys(files);
      if (rawPaths.length === 0) {
        setError("No markdown notes found in that zip. Make sure it's an Obsidian vault export.");
        setPhase("error");
        return;
      }
      const strip = stripCommonRoot(rawPaths);
      const parsed: ParsedNote[] = rawPaths
        .map((p) => ({ path: strip(p), content: strFromU8(files[p]) }))
        .filter((n) => n.content.trim().length > 0);
      setNotes(parsed);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that zip.");
      setPhase("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const startIngest = useCallback(async () => {
    if (notes.length === 0) return;
    setPhase("ingesting");
    setDone(0);
    setChunks(0);
    setError("");
    let cumulativeChunks = 0;
    try {
      for (let i = 0; i < notes.length; i += BATCH_SIZE) {
        const batch = notes.slice(i, i + BATCH_SIZE);
        setCurrentFolder(batch[0]?.path.split("/").slice(0, -1).join("/") || "(root)");
        const res = await fetch("/api/brain/vault/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notes: batch, reset: i === 0 }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `Ingest failed (${res.status})`);
        cumulativeChunks += data.batch?.chunks ?? 0;
        setDone(Math.min(i + BATCH_SIZE, notes.length));
        setChunks(cumulativeChunks);
      }
      setPhase("done");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed.");
      setPhase("error");
    }
  }, [notes, loadStatus]);

  const reset = () => {
    setPhase("idle");
    setNotes([]);
    setZipName("");
    setError("");
    setDone(0);
    setChunks(0);
  };

  const progress = notes.length ? Math.round((done / notes.length) * 100) : 0;
  const hasVault = (status?.stats.documents ?? 0) > 0;

  return (
    <div className="relative min-h-screen w-full bg-[#02040a] text-white">
      {/* backdrop */}
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(130% 90% at 50% 0%, #0a0716 0%, #02040a 55%, #010207 100%)" }} />
      <div className="blob-a pointer-events-none fixed -left-32 top-24 h-[420px] w-[420px] rounded-full bg-violet-500/[0.08] blur-[120px]" />
      <div className="blob-b pointer-events-none fixed -right-28 top-1/3 h-[460px] w-[460px] rounded-full bg-cyan-500/[0.07] blur-[130px]" />

      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#02040a]/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-4 px-5 py-3.5 md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/jarvis" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/55 transition hover:border-violet-300/40 hover:text-white" title="Back to mission control">
              <ArrowLeft size={16} weight="bold" />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/30 bg-violet-400/10 text-violet-300">
              <Brain size={18} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold tracking-[0.18em] text-violet-100">SECOND BRAIN</span>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/45">Knowledge</span>
              </div>
              <div className="text-[10.5px] text-white/35">Your Obsidian vault, vectorized into the team&apos;s memory</div>
            </div>
          </div>
          <Link href="/jarvis" className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-white/65 transition hover:border-cyan-300/40 hover:text-white sm:flex">
            <Lightning size={13} weight="fill" />
            Mission control
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1080px] px-5 pb-20 pt-7 md:px-8">
        {/* current brain state */}
        <Rise>
          <Panel glow={hasVault ? "#a78bfa" : undefined} accent="#a78bfa" title="Your brain right now" subtitle={status ? `Embeddings · ${status.provider}` : "Loading…"}
            right={
              <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${status?.configured ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
                <StatusDot color={status?.configured ? "#34d399" : "#fbbf24"} pulse={status?.configured} />
                {status?.configured ? "Ready to ingest" : "Setup needed"}
              </span>
            }
          >
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Notes" value={status?.stats.documents ?? 0} color="#a78bfa" icon={<FolderOpen size={15} weight="duotone" />} />
              <Stat label="Vectors" value={status?.stats.chunks ?? 0} color="#22d3ee" icon={<Database size={15} weight="duotone" />} />
              <Stat label="Folders" value={status?.stats.folders ?? 0} color="#34d399" icon={<Sparkle size={15} weight="duotone" />} />
            </div>
            {!status?.configured && status?.reason && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5 text-[11.5px] text-amber-200/80">
                <WarningCircle size={15} weight="bold" className="mt-0.5 shrink-0" />
                <span>{status.reason}. Add the key(s) to <code className="rounded bg-black/40 px-1">.env.local</code> and restart.</span>
              </div>
            )}
            {hasVault && status?.sample && status.sample.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {status.sample.slice(0, 8).map((s, i) => (
                  <span key={i} className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-[10.5px] text-white/55">
                    {s.title} <span className="text-white/25">· {s.chunks} chunks</span>
                  </span>
                ))}
              </div>
            )}
            {hasVault && (
              <Link href="/brain/graph" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-400/[0.08] px-4 py-2.5 text-[12.5px] font-medium text-violet-100 transition hover:border-violet-300/60 hover:bg-violet-400/[0.16] hover:text-white">
                <Graph size={16} weight="duotone" />
                View the knowledge graph
              </Link>
            )}
          </Panel>
        </Rise>

        {/* uploader */}
        <Rise delay={0.06} className="mt-5">
          <Panel className="overflow-visible" accent="#22d3ee" title="Upload a vault" subtitle="Drop a .zip export of your Obsidian vault — it replaces the current brain">
            <AnimatePresence mode="wait">
              {/* DROPZONE */}
              {(phase === "idle" || phase === "error") && (
                <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
                      dragging ? "border-cyan-300/60 bg-cyan-400/[0.06]" : "border-white/12 bg-white/[0.015] hover:border-cyan-300/40 hover:bg-white/[0.03]"
                    }`}
                  >
                    <motion.div animate={{ y: dragging ? -4 : 0 }} className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
                      <CloudArrowUp size={30} weight="duotone" />
                    </motion.div>
                    <div>
                      <div className="text-[15px] font-semibold text-white">Drop your vault.zip here</div>
                      <div className="mt-1 text-[12px] text-white/40">or click to browse · .md notes are parsed, everything else is ignored</div>
                    </div>
                    <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  </div>
                  {phase === "error" && error && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2.5 text-[12px] text-rose-200">
                      <WarningCircle size={15} weight="bold" /> {error}
                    </div>
                  )}
                </motion.div>
              )}

              {/* PARSING */}
              {phase === "parsing" && (
                <motion.div key="parsing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-12 text-center">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
                    <FileZip size={26} weight="duotone" />
                  </motion.div>
                  <div className="text-[13.5px] font-medium text-white/80">Unzipping {zipName}…</div>
                  <div className="text-[11.5px] text-white/40">Reading notes in your browser</div>
                </motion.div>
              )}

              {/* READY */}
              {phase === "ready" && (
                <motion.div key="ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
                      <FileZip size={20} weight="duotone" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-white">{zipName}</div>
                      <div className="text-[11.5px] text-white/45">
                        <span className="font-semibold text-cyan-200">{notes.length.toLocaleString()}</span> notes · {(zipSize / 1024 / 1024).toFixed(1)} MB
                      </div>
                    </div>
                    <button onClick={reset} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/40 transition hover:text-white" title="Clear">
                      <X size={15} weight="bold" />
                    </button>
                  </div>
                  {hasVault && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11.5px] text-amber-200/80">
                      <WarningCircle size={14} weight="bold" /> This replaces your current brain ({status?.stats.documents} notes).
                    </div>
                  )}
                  <button
                    onClick={startIngest}
                    disabled={!status?.configured}
                    className="flex items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-5 py-3 text-[13.5px] font-semibold text-cyan-50 shadow-[0_10px_40px_-12px_rgba(34,211,238,0.6)] transition hover:bg-cyan-400/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Lightning size={17} weight="fill" />
                    Vectorize &amp; store {notes.length.toLocaleString()} notes
                  </button>
                </motion.div>
              )}

              {/* INGESTING */}
              {phase === "ingesting" && (
                <motion.div key="ingesting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4 py-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-white/70">
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} className="text-cyan-300">
                        <Database size={16} weight="duotone" />
                      </motion.span>
                      Embedding &amp; storing…
                    </span>
                    <span className="font-mono tabular-nums text-cyan-200">{progress}%</span>
                  </div>
                  <Meter value={progress} color="#22d3ee" height={10} />
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <MiniNum label="Notes" value={done} total={notes.length} />
                    <MiniNum label="Vectors" value={chunks} />
                    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-2 py-2">
                      <div className="truncate text-[12px] font-semibold text-white/80">{currentFolder || "—"}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">Current folder</div>
                    </div>
                  </div>
                  <p className="text-center text-[11px] text-white/35">Keep this tab open — large vaults take a minute or two.</p>
                </motion.div>
              )}

              {/* DONE */}
              {phase === "done" && (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 py-6 text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                    <CheckCircle size={32} weight="fill" />
                  </motion.div>
                  <div className="text-[16px] font-bold text-white">Your brain is live</div>
                  <div className="text-[12.5px] text-white/50">
                    <span className="font-semibold text-emerald-300">{status?.stats.documents.toLocaleString()}</span> notes ·{" "}
                    <span className="font-semibold text-cyan-300">{status?.stats.chunks.toLocaleString()}</span> vectors stored in Supabase
                  </div>
                  <div className="mt-1 flex flex-wrap justify-center gap-2.5">
                    <button onClick={reset} className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[12px] text-white/65 transition hover:text-white">Upload another</button>
                    <Link href="/brain/graph" className="flex items-center gap-1.5 rounded-lg border border-violet-300/40 bg-violet-400/15 px-3.5 py-2 text-[12px] font-medium text-violet-50 transition hover:bg-violet-400/25">
                      <Graph size={14} weight="duotone" /> View graph
                    </Link>
                    <Link href="/jarvis" className="rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-3.5 py-2 text-[12px] font-medium text-cyan-50 transition hover:bg-cyan-400/25">Use it in mission control →</Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        </Rise>

        {/* test the brain */}
        {(hasVault || phase === "done") && status?.configured && (
          <Rise delay={0.1} className="mt-5">
            <BrainSearch />
          </Rise>
        )}

        <p className="mt-8 text-center text-[11px] text-white/25">
          Notes are chunked, embedded with text-embedding-3-small, and stored in Supabase pgvector · the same brain /jarvis reads from
        </p>
      </main>
    </div>
  );
}

/* ─────────────────── sub-components ─────────────────── */

function Stat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40" style={{ color }}>
        {icon}
        <span className="text-white/40">{label}</span>
      </div>
      <div className="mt-1 text-[24px] font-bold leading-none text-white">
        <Counter value={value} format="number" />
      </div>
    </div>
  );
}

function MiniNum({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-2 py-2">
      <div className="text-[15px] font-bold tabular-nums text-white">
        {value.toLocaleString()}
        {total ? <span className="text-[11px] font-normal text-white/35"> / {total.toLocaleString()}</span> : null}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">{label}</div>
    </div>
  );
}

function BrainSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch("/api/brain/vault/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, limit: 6 }),
      });
      const data = await res.json();
      setHits(data.hits || []);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel accent="#34d399" title="Ask your brain" subtitle="A live semantic query over what you just stored">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 focus-within:border-emerald-300/40">
        <MagnifyingGlass size={16} className="text-white/35" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="e.g. what's my point of view on cold outreach?"
          className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/30 focus:outline-none"
        />
        <button onClick={run} disabled={loading || !q.trim()} className="rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-3 py-1.5 text-[12px] font-medium text-emerald-50 transition hover:bg-emerald-400/25 disabled:opacity-40">
          {loading ? "…" : "Search"}
        </button>
      </div>
      <AnimatePresence>
        {hits && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 flex flex-col gap-2">
            {hits.length === 0 && <div className="px-1 py-2 text-[12px] text-white/40">No matching notes yet.</div>}
            {hits.map((h, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-semibold text-white/85">{h.title}</span>
                  <span className="shrink-0 rounded-md bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">{Math.round(h.similarity * 100)}%</span>
                </div>
                <div className="text-[10.5px] text-white/35">{h.folder}</div>
                <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-white/55">{h.content}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}
