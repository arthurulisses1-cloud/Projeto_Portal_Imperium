// Divisor de louro — usado abaixo de citações e no topo de telas-chave
// (Mural, Plano de Carreira). Ramo simples, duas metades espelhadas.
export default function Laurel({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 28"
      className={className ?? "mx-auto h-4 w-32 text-gold/50"}
      fill="none"
      aria-hidden
    >
      {[-1, 1].map((side) => (
        <g key={side} transform={side === 1 ? "translate(200,0) scale(-1,1)" : undefined}>
          {Array.from({ length: 6 }).map((_, i) => {
            const t = i / 5;
            const x = 100 - t * 88;
            const y = 14 - Math.sin(t * Math.PI) * 8;
            const rot = -20 - t * 45;
            const s = 0.5 + t * 0.5;
            return (
              <g key={i} transform={`translate(${x},${y}) rotate(${rot}) scale(${s})`}>
                <path
                  d="M0,2 C-4,-1 -4,-8 0,-12 C4,-8 4,-1 0,2 Z"
                  fill="currentColor"
                  opacity={0.4 + t * 0.5}
                />
              </g>
            );
          })}
        </g>
      ))}
      <circle cx="100" cy="14" r="2" fill="currentColor" opacity="0.8" />
    </svg>
  );
}
