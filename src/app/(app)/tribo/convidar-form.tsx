"use client";

import { useState } from "react";
import { convidarMembro } from "./actions";

export default function ConvidarForm() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ email: string; senha: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("nome", nome);
      fd.set("email", email);
      const r = await convidarMembro(fd);
      setResultado(r);
      setNome("");
      setEmail("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao convidar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-stone-400">Nome do novo membro</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="input-imp text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input-imp text-sm"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-gold">
          {loading ? "Criando..." : "Convidar"}
        </button>
      </form>

      {erro && <p className="mt-2 text-sm text-wine-bright">{erro}</p>}

      {resultado && (
        <div className="mt-4 rounded border border-success/40 bg-success/5 p-4 text-sm">
          <p className="mb-1 text-success-bright">Conta criada! Compartilha isso com a pessoa:</p>
          <p className="text-stone-200">
            Email: <span className="text-gold">{resultado.email}</span>
          </p>
          <p className="text-stone-200">
            Senha: <span className="text-gold">{resultado.senha}</span>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Essa senha só aparece essa vez — anota antes de sair da tela.
          </p>
        </div>
      )}
    </div>
  );
}
