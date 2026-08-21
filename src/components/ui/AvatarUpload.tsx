"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadAvatarAction } from "@/app/(app)/avatar-actions";

export default function AvatarUpload({ avatarUrl, nome }: { avatarUrl: string | null; nome: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(null);
    const fd = new FormData();
    fd.set("avatar", file);
    startTransition(async () => {
      try {
        await uploadAvatarAction(fd);
        router.refresh();
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro ao enviar foto.");
      }
    });
  }

  return (
    <div className="group relative shrink-0">
      <label className="block cursor-pointer" title="Clique para trocar sua foto">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={nome}
            className="h-9 w-9 rounded-full border border-gold/40 object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-imperium-bg text-xs font-medium text-gold">
            {iniciais || "?"}
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-[8px] uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100">
          {isPending ? "…" : "Editar"}
        </span>
        <input type="file" accept="image/*" className="hidden" onChange={handleChange} />
      </label>
      {erro && (
        <p className="absolute right-0 top-11 z-10 w-40 text-right text-[10px] text-wine-bright">{erro}</p>
      )}
    </div>
  );
}
