"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "motion/react";
import {
  BRAND,
  CHANNEL_MIX,
  FUNNEL,
  LEADS_WEEKLY,
  REACH_SERIES,
  REVENUE_SERIES,
} from "@/lib/dashboard-data";
import { DashTooltip } from "./ui";

const axis = { fill: "#ffffff55", fontSize: 11 };
const kFmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k`.replace(".0k", "k") : String(v));

/* ───────────────── revenue + pipeline (dual area) ───────────────── */

export function RevenueChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={REVENUE_SERIES} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="rev-pipe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND.cyan} stopOpacity={0.32} />
            <stop offset="100%" stopColor={BRAND.cyan} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="rev-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND.emerald} stopOpacity={0.42} />
            <stop offset="100%" stopColor={BRAND.emerald} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} dy={4} />
        <YAxis tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}k`} />
        <Tooltip content={<DashTooltip unit="k" />} cursor={{ stroke: "#ffffff22" }} />
        <Area
          type="monotone"
          dataKey="pipeline"
          name="Pipeline"
          stroke={BRAND.cyan}
          strokeWidth={2}
          fill="url(#rev-pipe)"
          dot={false}
          animationDuration={1200}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={BRAND.emerald}
          strokeWidth={2.5}
          fill="url(#rev-rev)"
          dot={false}
          activeDot={{ r: 4, fill: BRAND.emerald, stroke: "#02040a", strokeWidth: 2 }}
          animationDuration={1200}
        />
        <Line type="monotone" dataKey="target" name="Target" stroke="#ffffff55" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ───────────────────── channel mix (donut) ───────────────────── */

export function ChannelDonut() {
  return (
    <div className="relative flex h-full items-center">
      <ResponsiveContainer width="62%" height="100%">
        <PieChart>
          <Pie
            data={CHANNEL_MIX}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={3}
            stroke="none"
            animationDuration={1100}
          >
            {CHANNEL_MIX.map((c) => (
              <Cell key={c.name} fill={c.color} />
            ))}
          </Pie>
          <Tooltip content={<DashTooltip unit="%" />} />
        </PieChart>
      </ResponsiveContainer>
      {/* legend */}
      <div className="flex flex-1 flex-col gap-2.5 pl-1">
        {CHANNEL_MIX.map((c) => (
          <div key={c.name} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}66` }} />
            <span className="text-white/65">{c.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-white/90">{c.value}%</span>
          </div>
        ))}
      </div>
      {/* center label */}
      <div className="pointer-events-none absolute left-[31%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="text-[20px] font-bold leading-none text-white">4</div>
        <div className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-white/40">channels</div>
      </div>
    </div>
  );
}

/* ─────────────────── leads sourced (grouped bars) ─────────────────── */

export function LeadsBar() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={LEADS_WEEKLY} margin={{ top: 8, right: 4, left: -10, bottom: 0 }} barGap={3}>
        <defs>
          <linearGradient id="lead-scraped" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND.amber} stopOpacity={0.95} />
            <stop offset="100%" stopColor={BRAND.amber} stopOpacity={0.35} />
          </linearGradient>
          <linearGradient id="lead-qual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND.cyan} stopOpacity={0.95} />
            <stop offset="100%" stopColor={BRAND.cyan} stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
        <XAxis dataKey="week" tick={axis} axisLine={false} tickLine={false} dy={4} />
        <YAxis tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={kFmt} />
        <Tooltip content={<DashTooltip />} cursor={{ fill: "#ffffff08" }} />
        <Bar dataKey="scraped" name="Scraped" fill="url(#lead-scraped)" radius={[4, 4, 0, 0]} animationDuration={1000} />
        <Bar dataKey="qualified" name="Qualified" fill="url(#lead-qual)" radius={[4, 4, 0, 0]} animationDuration={1200} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────── reach + engagement (line) ─────────────────── */

export function ReachChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={REACH_SERIES} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
        <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} dy={4} />
        <YAxis tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v}k`} />
        <Tooltip content={<DashTooltip unit="k" />} cursor={{ stroke: "#ffffff22" }} />
        <Line
          type="monotone"
          dataKey="reach"
          name="Reach"
          stroke={BRAND.violet}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: BRAND.violet, stroke: "#02040a", strokeWidth: 2 }}
          animationDuration={1100}
        />
        <Line
          type="monotone"
          dataKey="engaged"
          name="Engaged"
          stroke={BRAND.fuchsia}
          strokeWidth={2}
          strokeDasharray="3 3"
          dot={false}
          animationDuration={1300}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────── conversion funnel (custom bars) ─────────────────── */

export function FunnelPanel() {
  const max = FUNNEL[0].value;
  return (
    <div className="flex flex-col gap-3">
      {FUNNEL.map((s, i) => {
        const pct = (s.value / max) * 100;
        const conv = i === 0 ? 100 : (s.value / FUNNEL[i - 1].value) * 100;
        return (
          <div key={s.stage}>
            <div className="mb-1 flex items-baseline justify-between text-[12px]">
              <span className="text-white/70">{s.stage}</span>
              <span className="flex items-center gap-2">
                <span className="font-semibold tabular-nums text-white/90">{s.value.toLocaleString()}</span>
                {i > 0 && <span className="text-[10px] tabular-nums text-white/35">{conv.toFixed(0)}%</span>}
              </span>
            </div>
            <div className="h-7 w-full overflow-hidden rounded-md bg-white/[0.04]">
              <motion.div
                className="flex h-full items-center rounded-md"
                style={{ background: `linear-gradient(90deg, ${s.color}, ${s.color}99)`, boxShadow: `0 0 18px ${s.color}55` }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, 6)}%` }}
                transition={{ duration: 1, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
