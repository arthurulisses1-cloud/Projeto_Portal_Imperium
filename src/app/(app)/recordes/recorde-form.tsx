"use client";

import { criarRecordeCurado } from "./actions";

type Pessoa = { id: string; full_name: string };

export default function RecordeForm({ pessoas }: { pessoas: Pessoa[] }) {
  return (
    <form action={criarRecordeCurado} className="space-y-3 rounded border border-imperium-line p-4">
      <div>
        <label className="mb-1 block text-xs text-stone-400">Título</label>
        <input name="titulo" required placeholder="Ex: Virada de mês mais dramática da história" className="input-imp" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-400">Descrição (opcional)</label>
        <textarea name="descricao" rows={2} className="input-imp" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-stone-400">Valor/medida (opcional)</label>
          <input name="valor_texto" placeholder="Ex: 47 dias seguidos" className="input-imp" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Data do fato (opcional)</label>
          <input type="date" name="data_referencia" className="input-imp" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-400">Pessoa relacionada (opcional)</label>
        <select name="profile_id" defaultValue="" className="input-imp">
          <option value="">— Nenhuma</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-stone-400">Categoria (opcional)</label>
          <input
            name="categoria"
            placeholder="Ex: Melhor comemoração da História"
            className="input-imp"
          />
          <p className="mt-1 text-[11px] text-stone-600">
            Crônicas com a MESMA categoria viram um ranking só (1º, 2º, 3º...), ordenado pelo campo Posição abaixo.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Posição no ranking (opcional)</label>
          <input type="number" name="ordem" min={1} placeholder="Ex: 1" className="input-imp" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-400">Imagem (opcional)</label>
        <input type="file" name="imagem" accept="image/*" className="text-sm text-stone-300" />
      </div>
      <button type="submit" className="btn-gold">
        Registrar nos Anais
      </button>
    </form>
  );
}
