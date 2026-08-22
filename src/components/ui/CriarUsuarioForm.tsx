"use client";

import { useState, useTransition } from "react";
import { criarUsuario } from "@/app/(app)/gestao/actions";
import { RANK_LABELS, ROLE_LABELS } from "@/lib/labels";
import { RANK_ORDER } from "@/lib/carreira";
import { IconCheck } from "./icons";

const ROLES = ["sdr", "closer", "lider"] as const;

type Tribo = { id: string; nome: string; exercitoNome: string | null };

export default function CriarUsuarioForm({ tribos }: { tribos: Tribo[] }) {
  const [isPending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("sdr");
  const [rank, setRank] = useState<string>("legionario");
  const [triboId, setTriboId] = useState("");
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
    fd.set("rank", rank);
    fd.set("tribo_id", triboId);
    startTransition(async () => {
      try {
        const r = await criarUsuario(fd);
        setResultado(r);
        setNome("");
        setEmail("");
        setTriboId("");
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
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Cargo inicial</label>
          <select value={rank} onChange={(e) => setRank(e.target.value)} className="input-imp text-sm">
            {RANK_ORDER.map((r) => (
              <option key={r} value={r}>
                {RANK_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Tribo (opcional)</label>
          <select value={triboId} onChange={(e) => setTriboId(e.target.value)} className="input-imp text-sm">
            <option value="">— sem Tribo —</option>
            {tribos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.exercitoNome ? `${t.exercitoNome} · ` : ""}
                {t.nome}
              </option>
            ))}
          </select>
        </div>
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
