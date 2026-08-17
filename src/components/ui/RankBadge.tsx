import { toRoman } from "@/lib/roman";
import { RANK_ORDER, type Rank } from "@/lib/carreira";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
};

export default function RankBadge({
  rank,
  size = "md",
  active = true,
}: {
  rank: string;
  size?: keyof typeof SIZES;
  active?: boolean;
}) {
  const idx = RANK_ORDER.indexOf(rank as Rank);
  const label = rank === "diretor" ? "IMP" : idx >= 0 ? toRoman(idx + 1) : "?";

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border-2 font-display ${SIZES[size]} ${
        active
          ? "border-gold bg-gradient-to-b from-gold-bright/20 to-transparent text-gold-bright"
          : "border-imperium-line-strong text-stone-600"
      }`}
    >
      {label}
    </div>
  );
}
