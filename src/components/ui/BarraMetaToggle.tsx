"use client";

import { useState } from "react";
import BarraMeta from "./BarraMeta";

// Closer tem dois números de "pago" legítimos e bem diferentes: o dele
// sozinho e o da Tribo inteira (ele + SDRs) — cada um mede uma coisa.
// Toggle deixa escolher qual ver, em vez de esconder um dos dois atrás
// de outra tela (achado 2026-08-24: Diretor comparou a barra da Tribo
// com o "Já pago" pessoal do Forecast achando que era bug).
export default function BarraMetaToggle({
  individual,
  tribo,
  triboNome,
}: {
  individual: { realizado: number; meta: number };
  tribo: { realizado: number; meta: number };
  triboNome: string;
}) {
  const [modo, setModo] = useState<"tribo" | "individual">("tribo");
  const atual = modo === "individual" ? individual : tribo;

  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        <button
          onClick={() => setModo("tribo")}
          className={`rounded px-2.5 py-1 text-[10px] uppercase transition ${
            modo === "tribo" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold"
          }`}
        >
          Tribo {triboNome}
        </button>
        <button
          onClick={() => setModo("individual")}
          className={`rounded px-2.5 py-1 text-[10px] uppercase transition ${
            modo === "individual" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold"
          }`}
        >
          Individual
        </button>
      </div>
      <BarraMeta realizado={atual.realizado} meta={atual.meta} />
      {modo === "tribo" && (
        <p className="mt-2 text-[11px] text-stone-600">Meta do time inteiro (você + seus SDRs).</p>
      )}
    </div>
  );
}
