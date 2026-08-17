import {
  registrarStrikeTime,
  registrarPdiTime,
  marcarFaltaTime,
} from "@/app/(app)/exercito/actions";

type Props = {
  id: string;
  nome: string;
  cargo?: string;
  compromissoStatus: string;
  compromissoCor: string;
  pagosMes: number;
};

export default function MembroCard({
  id,
  nome,
  cargo,
  compromissoStatus,
  compromissoCor,
  pagosMes,
}: Props) {
  return (
    <div className="rounded border border-stone-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-100">{nome}</p>
          {cargo && <p className="text-xs text-stone-500">{cargo}</p>}
        </div>
        <span className={`text-xs ${compromissoCor}`}>{compromissoStatus}</span>
      </div>
      <p className="mb-3 text-xs text-stone-400">
        Pagos no mês:{" "}
        <span className="text-amber-400">
          {pagosMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </span>
      </p>

      <div className="flex flex-wrap gap-3 text-xs">
        <details>
          <summary className="cursor-pointer text-stone-400 hover:text-amber-400">
            Registrar strike
          </summary>
          <form action={registrarStrikeTime} className="mt-2 space-y-2">
            <input type="hidden" name="profile_id" value={id} />
            <textarea
              name="motivo"
              required
              placeholder="Motivo"
              rows={2}
              className="w-full rounded border border-stone-700 bg-[#0b0f19] px-2 py-1 text-stone-100"
            />
            <button
              type="submit"
              className="rounded border border-red-500/50 px-2 py-1 text-red-400 hover:bg-red-500/10"
            >
              Confirmar
            </button>
          </form>
        </details>

        <details>
          <summary className="cursor-pointer text-stone-400 hover:text-amber-400">
            Registrar PDI
          </summary>
          <form action={registrarPdiTime} className="mt-2 space-y-2">
            <input type="hidden" name="profile_id" value={id} />
            <textarea
              name="observacao"
              required
              placeholder="Observação e plano de ação"
              rows={2}
              className="w-full rounded border border-stone-700 bg-[#0b0f19] px-2 py-1 text-stone-100"
            />
            <input
              name="proxima_revisao"
              type="date"
              className="w-full rounded border border-stone-700 bg-[#0b0f19] px-2 py-1 text-stone-100"
            />
            <button
              type="submit"
              className="rounded border border-amber-500/50 px-2 py-1 text-amber-400 hover:bg-amber-500/10"
            >
              Salvar
            </button>
          </form>
        </details>

        <form action={marcarFaltaTime}>
          <input type="hidden" name="profile_id" value={id} />
          <button type="submit" className="text-stone-500 hover:text-stone-300">
            Marcar ausência hoje
          </button>
        </form>
      </div>
    </div>
  );
}
