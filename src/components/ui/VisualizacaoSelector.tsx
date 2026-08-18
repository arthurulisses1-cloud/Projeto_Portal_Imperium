"use client";

import { useRef } from "react";
import { definirVisualizacao } from "@/app/(app)/view-actions";

const OPCOES = [
  { value: "diretor", label: "Diretor (minhas abas)" },
  { value: "lider", label: "Ver como Líder" },
  { value: "closer", label: "Ver como Closer" },
  { value: "sdr", label: "Ver como SDR" },
];

export default function VisualizacaoSelector({ atual }: { atual: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={definirVisualizacao} className="border-b border-imperium-line p-3">
      <label className="mb-1 block text-[9px] uppercase tracking-widest text-stone-600">
        Tipo de tela
      </label>
      <select
        name="papel"
        defaultValue={atual}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded border border-imperium-line bg-imperium-bg px-2 py-1.5 text-xs text-stone-200 outline-none focus:border-gold/60"
      >
        {OPCOES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
