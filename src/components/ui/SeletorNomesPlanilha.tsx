"use client";

import { useMemo, useState, useTransition } from "react";
import { salvarNomesPlanilha } from "@/app/(app)/gestao/actions";

export default function SeletorNomesPlanilha({
  profileId,
  opcoes,
  selecionados,
}: {
  profileId: string;
  opcoes: string[];
  selecionados: string[];
}) {
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set(selecionados));
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);

  const filtradas = useMemo(
    () => opcoes.filter((n) => n.toLowerCase().includes(busca.toLowerCase())),
    [opcoes, busca]
  );

  function alternar(nome: string) {
    setSalvo(false);
    setMarcados((prev) => {
      const novo = new Set(prev);
      if (novo.has(nome)) novo.delete(nome);
      else novo.add(nome);
      return novo;
    });
  }

  function salvar() {
    const fd = new FormData();
    fd.set("profile_id", profileId);
    for (const nome of Array.from(marcados)) fd.append("nomes_planilha", nome);
    startTransition(async () => {
      await salvarNomesPlanilha(fd);
      setSalvo(true);
    });
  }

  return (
    <div className="rounded border border-imperium-line bg-imperium-bg/40 p-3">
      {marcados.size > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {Array.from(marcados).map((n) => (
            <span
              key={n}
              className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] text-gold-bright"
            >
              {n}
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder="Buscar nome na planilha..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="input-imp mb-2 w-full px-2 py-1 text-xs"
      />
      <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-imperium-line p-2">
        {filtradas.length === 0 && <p className="text-xs text-stone-600">Nenhum nome encontrado.</p>}
        {filtradas.map((nome) => (
          <label key={nome} className="flex items-center gap-2 text-xs text-stone-300">
            <input type="checkbox" checked={marcados.has(nome)} onChange={() => alternar(nome)} />
            {nome}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={salvar}
        disabled={isPending}
        className="btn-outline mt-2 px-2 py-1 text-xs"
      >
        {isPending ? "Salvando..." : salvo ? "Salvo ✓" : "Salvar vínculo"}
      </button>
    </div>
  );
}
