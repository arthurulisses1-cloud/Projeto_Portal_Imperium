"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError("Email ou senha incorretos.");
      return;
    }

    // navegação completa (não client-side) — garante que nenhum dado da
    // sessão anterior fique em cache no navegador ao trocar de conta
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-amber-500/20 bg-[#111827] p-8 shadow-xl"
      >
        <h1 className="mb-1 text-center font-serif text-2xl text-amber-400">
          Portal Executivo
        </h1>
        <p className="mb-8 text-center text-xs uppercase tracking-widest text-stone-400">
          Matri Bank · Imperium
        </p>

        <label className="mb-1 block text-sm text-stone-300">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100 outline-none focus:border-amber-500"
        />

        <label className="mb-1 block text-sm text-stone-300">Senha</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100 outline-none focus:border-amber-500"
        />

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-amber-500 py-2 font-medium text-[#0b0f19] transition hover:bg-amber-400 disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="mt-6 text-center text-xs text-stone-500">
          Acesso apenas por convite. Fale com seu Líder ou o Diretor.
        </p>
      </form>
    </div>
  );
}
