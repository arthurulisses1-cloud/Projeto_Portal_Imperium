export default function BarraProgresso({ realizado, meta }: { realizado: number; meta: number }) {
  const pct = meta > 0 ? Math.min(100, (realizado / meta) * 100) : 0;
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-imperium-line">
      <div
        className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
