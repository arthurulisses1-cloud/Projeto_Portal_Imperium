"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Laurel from "@/components/ui/Laurel";

function RedefinirSenhaForm() {
  const params = useSearchParams();
  const [pronto, setPronto] = useState(false);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  // O link do email chega com ?code=... (fluxo PKCE) — troca por uma sessão
  // válida antes de deixar a pessoa definir a senha nova. Se não tiver code
  // (link antigo/hash), ainda tenta a sessão que o próprio supabase-js já
  // pode ter processado sozinho ao carregar a página.
  useEffect(() => {
    const supabase = createClient();
    const code = params.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setErroLink("Esse link não é mais válido. Peça pro Diretor enviar um novo.");
        else setPronto(true);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setPronto(true);
        else setErroLink("Esse link não é mais válido. Peça pro Diretor enviar um novo.");
      });
    }
  }, [params]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmar) {
      setErro("As duas senhas precisam ser iguais.");
      return;
    }
    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setSucesso(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 1800);
  }

  if (sucesso) {
    return (
      <p className="text-center text-sm text-success-bright">
        Senha definida! Te levando pro Mural...
      </p>
    );
  }

  if (erroLink) {
    return <p className="text-center text-sm text-wine-bright">{erroLink}</p>;
  }

  if (!pronto) {
    return <p className="text-center text-sm text-stone-500">Verificando o link...</p>;
  }

  return (
    <form onSubmit={salvar}>
      <label className="mb-1 block text-sm text-stone-300">Nova senha</label>
      <input
        type="password"
        required
        minLength={8}
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        className="input-imp mb-4"
      />

      <label className="mb-1 block text-sm text-stone-300">Confirmar senha</label>
      <input
        type="password"
        required
        minLength={8}
        value={confirmar}
        onChange={(e) => setConfirmar(e.target.value)}
        className="input-imp mb-6"
      />

      {erro && <p className="mb-4 text-sm text-wine-bright">{erro}</p>}

      <button type="submit" disabled={salvando} className="btn-gold w-full">
        {salvando ? "Salvando..." : "Definir senha"}
      </button>
    </form>
  );
}

export default function RedefinirSenhaPage() {
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
          Definir sua senha
        </h1>
        <p className="mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-stone-500">
          Primeiro acesso · Matri Bank
        </p>
        <Laurel className="mx-auto mb-6 h-3 w-24 text-gold/40" />

        <Suspense fallback={<p className="text-center text-sm text-stone-500">Carregando...</p>}>
          <RedefinirSenhaForm />
        </Suspense>
      </div>
    </div>
  );
}
