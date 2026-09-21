// Wordmark do Imperioflix — mesma ideia de "N" gigante inclinado e vermelho
// da Netflix, adaptada pro tema império romano do Portal (Cinzel + ouro/vinho
// em vez de sans-serif + vermelho puro), sem copiar a fonte/arquivo da marca.
export default function ImperioflixLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`select-none text-center ${className}`}>
      <h1
        className="font-display text-4xl font-bold italic tracking-wide sm:text-5xl"
        style={{
          background: "linear-gradient(180deg, #f0d27a 0%, #c9a227 40%, #8a1f1f 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          textShadow: "0 2px 12px rgba(0,0,0,0.35)",
          letterSpacing: "0.02em",
        }}
      >
        IMPERIOFLIX
      </h1>
      <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-stone-500">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        <span>SPQR · Trilhas de Formação</span>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      </div>
    </div>
  );
}
