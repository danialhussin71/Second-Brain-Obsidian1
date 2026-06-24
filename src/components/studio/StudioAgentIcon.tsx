"use client";

import {
  Brain,
  Binoculars,
  PenNib,
  Megaphone,
  Target,
  PaperPlaneTilt,
  type Icon,
} from "@phosphor-icons/react";
import { chatAgentMeta } from "@/lib/agent-meta";

const ICONS: Record<string, Icon> = {
  Brain,
  Binoculars,
  PenNib,
  Megaphone,
  Target,
  PaperPlaneTilt,
};

type Props = {
  agentKey: string;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
  style?: React.CSSProperties;
  /** Override the color (defaults to the agent's signature color). */
  color?: string;
};

export default function StudioAgentIcon({
  agentKey,
  size = 18,
  weight = "duotone",
  className,
  style,
  color,
}: Props) {
  const meta = chatAgentMeta(agentKey);
  const Cmp = ICONS[meta.icon] ?? Brain;
  return (
    <Cmp
      size={size}
      weight={weight}
      className={className}
      style={{ color: color ?? meta.color, ...style }}
    />
  );
}
