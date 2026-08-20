import { votarEnquete } from "@/app/(app)/mural-actions";
import { IconCheck } from "./icons";

export type EnqueteData = {
  enqueteId: string;
  opcoes: { id: string; texto: string; votos: number }[];
  totalVotos: number;
  meuVoto: string | null;
};

export default function EnquetePoll({ dados }: { dados: EnqueteData }) {
  return (
    <div className="mt-3 space-y-2">
      {dados.opcoes.map((o) => {
        const pct = dados.totalVotos > 0 ? Math.round((o.votos / dados.totalVotos) * 100) : 0;
        const minhaEscolha = dados.meuVoto === o.id;

        if (dados.meuVoto) {
          return (
            <div key={o.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className={`flex items-center gap-1 ${minhaEscolha ? "text-gold-bright" : "text-stone-300"}`}>
                  {minhaEscolha && <IconCheck className="h-3.5 w-3.5" />}
                  {o.texto}
                </span>
                <span className="text-stone-400">{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-imperium-line">
                <div
                  className={`h-full rounded-full ${minhaEscolha ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-imperium-line-strong"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        }

        return (
          <form key={o.id} action={votarEnquete}>
            <input type="hidden" name="enquete_id" value={dados.enqueteId} />
            <input type="hidden" name="opcao_id" value={o.id} />
            <button
              type="submit"
              className="w-full rounded border border-imperium-line px-3 py-1.5 text-left text-sm text-stone-300 transition hover:border-gold hover:text-gold-bright"
            >
              {o.texto}
            </button>
          </form>
        );
      })}
      <p className="text-xs text-stone-600">
        {dados.totalVotos} {dados.totalVotos === 1 ? "voto" : "votos"}
        {!dados.meuVoto && " · vote pra ver o resultado"}
      </p>
    </div>
  );
}
