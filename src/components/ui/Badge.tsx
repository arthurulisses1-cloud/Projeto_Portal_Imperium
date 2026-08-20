import type { ReactNode } from "react";

type Tone = "gold" | "success" | "warning" | "wine" | "neutral";
// pill = chip informativo neutro (identidade, contagem calma — tier atual,
//   streak). tag = alerta inline, barra de acento à esquerda em vez de
//   pílula inteira (mais "aviso editorial" que "enfeite") — Em risco, Queda,
//   pendências. solid = urgência/celebração, fundo cheio (poucas vezes,
//   de propósito — perde força se usado toda hora).
type Variant = "pill" | "tag" | "solid";

const TONE: Record<Tone, { border: string; bg: string; text: string; solidBg: string; solidText: string; tagBorder: string }> = {
  gold: {
    border: "border-gold/40",
    bg: "bg-gold/10",
    text: "text-gold-bright",
    solidBg: "bg-gold",
    solidText: "text-imperium-bg",
    tagBorder: "border-gold/70",
  },
  success: {
    border: "border-success/50",
    bg: "bg-success/10",
    text: "text-success-bright",
    solidBg: "bg-success",
    solidText: "text-imperium-bg",
    tagBorder: "border-success/70",
  },
  warning: {
    border: "border-warning/50",
    bg: "bg-warning/10",
    text: "text-warning-bright",
    solidBg: "bg-warning",
    solidText: "text-imperium-bg",
    tagBorder: "border-warning/70",
  },
  wine: {
    border: "border-wine/50",
    bg: "bg-wine/10",
    text: "text-wine-bright",
    solidBg: "bg-wine",
    solidText: "text-stone-100",
    tagBorder: "border-wine/70",
  },
  neutral: {
    border: "border-imperium-line-strong",
    bg: "bg-imperium-bg/40",
    text: "text-stone-400",
    solidBg: "bg-stone-600",
    solidText: "text-stone-100",
    tagBorder: "border-imperium-line-strong",
  },
};

export function Badge({
  tone = "neutral",
  variant = "pill",
  children,
  className,
}: {
  tone?: Tone;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];

  if (variant === "tag") {
    return (
      <span
        className={`inline-flex items-center gap-1 border-l-2 ${t.tagBorder} bg-imperium-bg/40 py-0.5 pl-2 pr-2 text-[10px] font-medium uppercase tracking-wide ${t.text} ${className ?? ""}`}
      >
        {children}
      </span>
    );
  }

  if (variant === "solid") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full ${t.solidBg} ${t.solidText} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className ?? ""}`}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${t.border} ${t.bg} px-3 py-1 text-xs ${t.text} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
