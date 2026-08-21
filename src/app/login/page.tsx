"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Laurel from "@/components/ui/Laurel";

export default function LoginPage() {
  const [modo, setModo] = useState<"login" | "esqueci">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [emailReset, setEmailReset] = useState("");
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);
  const [erroReset, setErroReset] = useState<string | null>(null);

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

  async function handleEsqueciSenha(e: React.FormEvent) {
    e.preventDefault();
    setErroReset(null);
    setEnviandoReset(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(emailReset.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/redefinir-senha`,
    });

    setEnviandoReset(false);

    // Não revela se o email existe ou não — evita que alguém use esse
    // formulário pra descobrir quem tem conta no sistema. O Supabase
    // também não avisa (retorna sucesso mesmo pra email desconhecido),
    // então na prática só mostra erro real de rede/limite de envio.
    if (error && !error.message.toLowerCase().includes("rate limit")) {
      setErroReset("Não deu pra enviar agora. Tenta de novo em instantes ou fala com seu Líder/Diretor.");
      return;
    }
    if (error) {
      setErroReset("Muitos pedidos em pouco tempo — espera alguns minutos e tenta de novo.");
      return;
    }
    setResetEnviado(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-imperium-bg px-4">
      <div className="pointer-events-none absolute inset-0 bg-laurel-glow" />
      <div className="relative w-full max-w-sm rounded border border-imperium-line bg-imperium-surface p-8 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/crests/senatus.webp"
          alt="Senatus"
          className="mx-auto mb-4 h-16 w-16 rounded-full border border-gold/50 object-cover"
        />
        <h1 className="text-center font-display text-xl tracking-wide text-gold-bright">
          SENATUS
        </h1>
        <p className="mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-stone-500">
          Matri Bank · Imperium
        </p>
        <Laurel className="mx-auto mb-6 h-3 w-24 text-gold/40" />

        {modo === "login" ? (
          <form onSubmit={handleSubmit}>
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
              className="input-imp mb-2"
            />

            <button
              type="button"
              onClick={() => {
                setModo("esqueci");
                setError(null);
              }}
              className="mb-4 block text-right text-xs text-stone-500 hover:text-gold-bright"
            >
              Esqueci minha senha
            </button>

            {error && <p className="mb-4 text-sm text-wine-bright">{error}</p>}

            <button type="submit" disabled={loading} className="btn-gold w-full">
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        ) : resetEnviado ? (
          <div>
            <p className="mb-6 text-center text-sm text-stone-300">
              Se esse email tiver uma conta no sistema, um link pra redefinir a senha chega em
              instantes. Confira também a caixa de spam.
            </p>
            <button
              type="button"
              onClick={() => {
                setModo("login");
                setResetEnviado(false);
                setEmailReset("");
              }}
              className="btn-outline w-full"
            >
              Voltar pro login
            </button>
          </div>
        ) : (
          <form onSubmit={handleEsqueciSenha}>
            <p className="mb-4 text-center text-xs text-stone-400">
              Informa o email cadastrado — mandamos um link pra você definir uma senha nova.
            </p>
            <label className="mb-1 block text-sm text-stone-300">Email</label>
            <input
              type="email"
              required
              value={emailReset}
              onChange={(e) => setEmailReset(e.target.value)}
              className="input-imp mb-4"
            />

            {erroReset && <p className="mb-4 text-sm text-wine-bright">{erroReset}</p>}

            <button type="submit" disabled={enviandoReset} className="btn-gold mb-3 w-full">
              {enviandoReset ? "Enviando..." : "Enviar link de redefinição"}
            </button>
            <button
              type="button"
              onClick={() => {
                setModo("login");
                setErroReset(null);
              }}
              className="block w-full text-center text-xs text-stone-500 hover:text-gold-bright"
            >
              Voltar pro login
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-stone-500">
          Acesso apenas por convite. Fale com seu Líder ou o Diretor.
        </p>
        <p className="mt-4 text-center font-display text-[10px] tracking-[0.3em] text-imperium-line-strong">
          ESSE QUAM VIDERI
        </p>
      </div>
    </div>
  );
}
