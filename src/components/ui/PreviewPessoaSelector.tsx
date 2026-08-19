"use client";

import { useRef } from "react";
import { definirPreview } from "@/app/(app)/preview-actions";

export default function PreviewPessoaSelector({
  pessoas,
  atual,
}: {
  pessoas: { id: string; nome: string; role: string }[];
  atual: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const ROLE_LABEL: Record<string, string> = { lider: "Líder", closer: "Closer", sdr: "SDR" };

  return (
    <form ref={formRef} action={definirPreview} className="border-b border-imperium-line p-3">
      <label className="mb-1 block text-[9px] uppercase tracking-widest text-stone-600">
        Pré-visualizar como
      </label>
      <select
        name="profile_id"
        defaultValue={atual ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded border border-imperium-line bg-imperium-bg px-2 py-1.5 text-xs text-stone-200 outline-none focus:border-gold/60"
      >
        <option value="">— eu mesmo (Diretor) —</option>
        {pessoas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome} · {ROLE_LABEL[p.role] ?? p.role}
          </option>
        ))}
      </select>
    </form>
  );
}
