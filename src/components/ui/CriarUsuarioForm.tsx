"use client";

import { useState, useTransition } from "react";
import { criarUsuario } from "@/app/(app)/gestao/actions";
import { ROLE_LABELS } from "@/lib/labels";
import { CARGO_LABEL, type CargoNegocio } from "@/lib/negocios";
import { IconCheck } from "./icons";

const ROLES = ["sdr", "closer", "lider", "analista"] as const;

type NegocioOpcao = { id: string; nome: string };

const CARGOS = Object.keys(CARGO_LABEL) as CargoNegocio[];

export default function CriarUsuarioForm({ negocios }: { negocios: NegocioOpcao[] }) {
  const [isPending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("sdr");
  const [negocioId, setNegocioId] = useState("");
  const [cargo, setCargo] = useState<CargoNegocio>("executivo");
  const [resultado, setResultado] = useState<{ email: string; senha: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  function criar() {
    if (!nome.trim() || !email.trim()) return;
    setErro(null);
    setResultado(null);
    const fd = new FormData();
    fd.set("full_name", nome.trim());
    fd.set("email", email.trim());
    fd.set("role", role);
    fd.set("negocio_id", negocioId);
    fd.set("cargo_negocio", cargo);
    startTransition(async () => {
      try {
        const r = await criarUsuario(fd);
        setResultado(r);
        setNome("");
        setEmail("");
        setNegocioId("");
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao criar conta.");
      }
    });
  }

  function copiar() {
    if (!resultado) return;
    navigator.clipboard.writeText(`${resultado.email} / ${resultado.senha}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Nome completo</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="input-imp text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Email real</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@dominio.com"
            className="input-imp text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Papel</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="input-imp text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </div>
        {role !== "analista" && (
          <>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-stone-500">Negócio</label>
              <select value={negocioId} onChange={(e) => setNegocioId(e.target.value)} className="input-imp text-sm">
                <option value="">— sem negócio —</option>
                {negocios.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </div>
            {negocioId && (
              <div>
                <label className="mb-1 block text-[10px] uppercase text-stone-500">Cargo no negócio</label>
                <select value={cargo} onChange={(e) => setCargo(e.target.value as CargoNegocio)} className="input-imp text-sm">
                  {CARGOS.map((c) => (
                    <option key={c} value={c}>
                      {CARGO_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={criar}
        disabled={isPending || !nome.trim() || !email.trim()}
        className="btn-gold px-4 py-2 text-xs"
      >
        {isPending ? "Criando..." : "Criar conta"}
      </button>

      {erro && <p className="text-[11px] text-wine-bright">{erro}</p>}

      {resultado && (
        <div className="rounded border border-gold/50 bg-gold/10 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-gold">
            Essa senha só aparece agora — copie e mande pra pessoa
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded bg-imperium-bg px-2 py-1 text-sm text-gold-bright">
              {resultado.email} / {resultado.senha}
            </code>
            <button
              type="button"
              onClick={copiar}
              className="btn-outline flex shrink-0 items-center gap-1 px-2 py-1 text-[10px]"
            >
              {copiado ? (
                <>
                  <IconCheck className="h-3 w-3" /> Copiado
                </>
              ) : (
                "Copiar"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
