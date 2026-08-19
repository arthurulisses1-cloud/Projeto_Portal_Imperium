"use client";

import { useState, useTransition } from "react";
import { uploadAvatarAction, atualizarNome } from "@/app/(app)/avatar-actions";
import ThemeToggle from "./ThemeToggle";
import SincronizarPlanilha from "./SincronizarPlanilha";

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export default function UserMenu({
  avatarUrl,
  nome,
  role,
}: {
  avatarUrl: string | null;
  nome: string;
  role?: string;
}) {
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novoNome, setNovoNome] = useState(nome);
  const [isPending, startTransition] = useTransition();

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("avatar", file);
    startTransition(() => uploadAvatarAction(fd));
  }

  function handleSalvarNome() {
    const fd = new FormData();
    fd.set("full_name", novoNome);
    startTransition(async () => {
      await atualizarNome(fd);
      setEditando(false);
    });
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="block" title={nome}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={nome}
            className="h-10 w-10 rounded-full border border-gold/40 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-imperium-bg text-sm text-gold">
            {iniciais(nome) || "?"}
          </div>
        )}
      </button>

      {open && (
        <>
          <button
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 top-12 z-20 w-60 rounded border border-imperium-line bg-imperium-surface p-3 shadow-xl">
            <p className="mb-3 truncate text-center text-sm text-stone-200">{nome}</p>

            <div className="mb-3 flex justify-center">
              <ThemeToggle />
            </div>

            {(role === "diretor" || role === "lider") && (
              <div className="border-t border-imperium-line pt-3">
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-500">
                  Planilha
                </p>
                <SincronizarPlanilha compact />
              </div>
            )}

            <div className="border-t border-imperium-line pt-3">
              {!editando ? (
                <button
                  onClick={() => setEditando(true)}
                  className="w-full rounded px-2 py-1.5 text-left text-sm text-stone-300 transition hover:bg-imperium-raised hover:text-gold-bright"
                >
                  Editar perfil
                </button>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase tracking-wide text-stone-500">Nome</label>
                  <input
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    className="input-imp text-sm"
                  />
                  <label className="block text-[10px] uppercase tracking-wide text-stone-500">Foto</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="w-full text-xs text-stone-400"
                  />
                  <button
                    onClick={handleSalvarNome}
                    disabled={isPending}
                    className="btn-gold w-full py-1.5 text-xs"
                  >
                    {isPending ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              )}
            </div>

            <form action="/auth/signout" method="post" className="mt-2 border-t border-imperium-line pt-2">
              <button className="w-full rounded px-2 py-1.5 text-left text-sm text-wine-bright transition hover:bg-imperium-raised">
                Sair
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
