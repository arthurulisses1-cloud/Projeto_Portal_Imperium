"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Laurel from "@/components/ui/Laurel";

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-imperium-bg px-4">
      <div className="pointer-events-none absolute inset-0 bg-laurel-glow" />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded border border-imperium-line bg-imperium-surface p-8 shadow-2xl"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 text-gold">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M12 2c1.6 2.1 4.3 3.2 8.4 3.2-2.1 2.1-4.3 3.2-4.3 6.4 0 4.2-2.1 8.5-4.1 9.4-2-.9-4.1-5.2-4.1-9.4 0-3.2-2.2-4.3-4.3-6.4C7.7 5.2 10.4 4.1 12 2Z" />
          </svg>
        </div>
        <h1 className="text-center font-display text-xl tracking-wide text-gold-bright">
          PORTAL EXECUTIVO
        </h1>
        <p className="mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-stone-500">
          Matri Bank · Imperium
        </p>
        <Laurel className="mx-auto mb-6 h-3 w-24 text-gold/40" />

        <label className="mb-1 block text-sm text-stone-300">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-imp mb-4"
        />

        <label className="mb-1 block text-sm text-stone-300">Senha</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-imp mb-6"
        />

        {error && <p className="mb-4 text-sm text-wine-bright">{error}</p>}

        <button type="submit" disabled={loading} className="btn-gold w-full">
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="mt-6 text-center text-xs text-stone-500">
          Acesso apenas por convite. Fale com seu Líder ou o Diretor.
        </p>
        <p className="mt-4 text-center font-display text-[10px] tracking-[0.3em] text-imperium-line-strong">
          ESSE QUAM VIDERI
        </p>
      </form>
    </div>
  );
}
