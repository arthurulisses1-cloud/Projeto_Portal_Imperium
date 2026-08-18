import { toRoman } from "@/lib/roman";
import { RANK_ORDER, type Rank } from "@/lib/carreira";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
};

const CRESTS: Record<string, string> = {
  legionario: "/crests/legionario.jpg",
  centuriao: "/crests/centuriao.jpg",
  tribuno: "/crests/tribuno.jpg",
  pretor: "/crests/pretor.jpg",
  legado: "/crests/legado.jpg",
  diretor: "/crests/imperium.jpg",
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
  const crest = CRESTS[rank];
  const dim = SIZES[size].split(" ").slice(0, 2).join(" ");

  if (crest) {
    return (
      <div className={`relative shrink-0 ${dim}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={crest}
          alt={rank}
          className={`h-full w-full rounded-full border-2 object-cover ${
            active ? "border-gold" : "border-imperium-line-strong grayscale opacity-50"
          }`}
        />
        {!active && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 text-xs">
            🔒
          </span>
        )}
      </div>
    );
  }

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
