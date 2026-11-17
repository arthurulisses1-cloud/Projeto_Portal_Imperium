"use client";

import { useRef } from "react";
import { definirPreview } from "@/app/(app)/preview-actions";

/** Diretor: "ver como" outra pessoa (só leitura, sem trocar de sessão). */
export default function PreviewPessoaSelector({
  pessoas,
  atual,
}: {
  pessoas: { id: string; nome: string; detalhe: string }[];
  atual: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={definirPreview} className="border-b border-imperium-line p-3">
      <label className="mb-1 block text-[9px] uppercase tracking-widest text-stone-600">Ver como</label>
      <select
        name="profile_id"
        defaultValue={atual ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded border border-imperium-line bg-imperium-bg px-2 py-1.5 text-xs text-stone-200 outline-none focus:border-gold/60"
      >
        <option value="">— eu mesmo (Diretor) —</option>
        {pessoas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome} · {p.detalhe}
          </option>
        ))}
      </select>
    </form>
  );
}
