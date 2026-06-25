"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChartLineUp, ArrowSquareOut, Brain, GearSix, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { isMuted, setMuted } from "@/lib/sounds";
import HudFrame from "@/components/jarvis/HudFrame";
import OrgPyramid from "@/components/jarvis/OrgPyramid";
import ResponsePanel from "@/components/jarvis/ResponsePanel";
import MissionBoard from "@/components/jarvis/MissionBoard";
import CommandBar from "@/components/jarvis/CommandBar";
import DocSettings from "@/components/studio/DocSettings";
import { useJarvisRun } from "@/components/jarvis/useJarvisRun";

export default function JarvisPage() {
  const { state, run } = useJarvisRun();
  const [boardOpen, setBoardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#02040a] text-white">
      <HudFrame>
        <div className="flex h-full flex-col gap-3 px-5 pb-4 pt-[64px]">
          <div className="flex min-h-0 flex-1 items-stretch">
            {/* LEFT — the org as a live workflow; mission feed lives on its nodes */}
            <main className="relative hidden min-w-0 flex-[1.32] flex-col pr-6 lg:flex">
              <div className="mb-1 flex items-center px-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                  Organization
                </span>
              </div>
              <div className="relative min-h-0 flex-1">
                <OrgPyramid
                  active={state.active}
                  litPath={state.litPath}
                  phases={state.phases}
                  feed={state.feed}
                  running={state.running}
                />
              </div>
            </main>

            {/* vertical divider — splits the canvas from the response */}
            <div className="hidden w-px shrink-0 self-stretch bg-gradient-to-b from-transparent via-white/12 to-transparent lg:block" />

            {/* RIGHT — reserved for the response */}
            <aside className="flex min-h-0 w-full flex-col lg:w-[42%] lg:max-w-[560px] lg:pl-6">
              <ResponsePanel state={state} />
            </aside>
          </div>

          {/* command bar */}
          <div className="mx-auto w-full max-w-2xl px-2">
            <CommandBar onSubmit={run} running={state.running} />
          </div>
        </div>

        {boardOpen && <MissionBoard state={state} onClose={() => setBoardOpen(false)} />}
      </HudFrame>

      {/* Brain — upload / manage the second brain (Obsidian vault) */}
      <Link
        href="/brain"
        title="Upload & manage your second brain"
        className="group fixed bottom-6 left-7 z-40 flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-400/[0.08] px-4 py-2.5 text-[12.5px] font-medium text-violet-100 shadow-[0_10px_40px_-12px_rgba(167,139,250,0.5)] backdrop-blur-xl transition hover:border-violet-300/60 hover:bg-violet-400/[0.16] hover:text-white"
      >
        <Brain size={16} weight="duotone" />
        Second Brain
      </Link>

      {/* bottom-right cluster — sound · settings · open dashboard, in one horizontal row */}
      <div className="fixed bottom-6 right-7 z-40 flex items-center gap-2">
        <SoundToggle />
        <button
          onClick={() => setSettingsOpen(true)}
          title="Knowledge & branding settings"
          className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/60 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:border-cyan-300/50 hover:text-white"
        >
          <GearSix size={18} weight="duotone" className="transition group-hover:rotate-45" />
        </button>
        <Link
          href="/jarvis/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          title="Open the analytics dashboard in a new tab"
          className="group flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/[0.08] px-4 py-2.5 text-[12.5px] font-medium text-cyan-100 shadow-[0_10px_40px_-12px_rgba(34,211,238,0.5)] backdrop-blur-xl transition hover:border-cyan-300/60 hover:bg-cyan-400/[0.16] hover:text-white"
        >
          <ChartLineUp size={16} weight="bold" />
          Open dashboard
          <ArrowSquareOut size={13} weight="bold" className="opacity-60 transition group-hover:opacity-100" />
        </Link>
      </div>
      <DocSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** Small fixed mute toggle for the /jarvis ambience + cues (persists). */
function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => setMutedState(isMuted()), []);
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };
  return (
    <button
      onClick={toggle}
      title={muted ? "Sound off — click to enable" : "Sound on — click to mute"}
      className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/55 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:border-cyan-300/50 hover:text-white"
    >
      {muted ? <SpeakerSlash size={17} weight="duotone" /> : <SpeakerHigh size={17} weight="duotone" />}
    </button>
  );
}
