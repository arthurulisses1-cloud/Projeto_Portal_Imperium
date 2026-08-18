"use client";

import { useState } from "react";
import { publicarMural } from "./mural-actions";

export default function MuralForm({ podeAviso, podeEnquete }: { podeAviso: boolean; podeEnquete: boolean }) {
  const [tipo, setTipo] = useState<"reconhecimento" | "aviso" | "enquete">("reconhecimento");
  const [numOpcoes, setNumOpcoes] = useState(2);

  return (
    <form action={publicarMural} className="space-y-3">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-stone-300">
          <input
            type="radio"
            name="tipo"
            value="reconhecimento"
            checked={tipo === "reconhecimento"}
            onChange={() => setTipo("reconhecimento")}
          />
          Reconhecimento
        </label>
        {podeAviso && (
          <label className="flex items-center gap-2 text-sm text-stone-300">
            <input
              type="radio"
              name="tipo"
              value="aviso"
              checked={tipo === "aviso"}
              onChange={() => setTipo("aviso")}
            />
            Aviso
          </label>
        )}
        {podeEnquete && (
          <label className="flex items-center gap-2 text-sm text-stone-300">
            <input
              type="radio"
              name="tipo"
              value="enquete"
              checked={tipo === "enquete"}
              onChange={() => setTipo("enquete")}
            />
            Enquete
          </label>
        )}
      </div>

      <input
        name="titulo"
        required
        placeholder={tipo === "enquete" ? "Pergunta da enquete" : "Título"}
        className="input-imp"
      />

      {tipo !== "enquete" && (
        <textarea name="corpo" placeholder="Mensagem (opcional)" rows={2} className="input-imp" />
      )}

      {tipo === "enquete" && (
        <div className="space-y-2">
          {Array.from({ length: numOpcoes }).map((_, i) => (
            <input
              key={i}
              name="opcao"
              required
              placeholder={`Opção ${i + 1}`}
              className="input-imp text-sm"
            />
          ))}
          {numOpcoes < 4 && (
            <button
              type="button"
              onClick={() => setNumOpcoes((n) => n + 1)}
              className="text-xs text-gold hover:underline"
            >
              + adicionar opção
            </button>
          )}
        </div>
      )}

      {tipo !== "enquete" && (
        <div>
          <label className="mb-1 block text-xs text-stone-400">Foto ou vídeo (opcional)</label>
          <input type="file" name="midia" accept="image/*,video/*" className="text-sm text-stone-300" />
        </div>
      )}

      <button type="submit" className="btn-gold">
        Publicar
      </button>
    </form>
  );
}
