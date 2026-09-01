import { createClient } from "@/lib/supabase/server";
import { podeEditarOperacao } from "@/lib/forecast";
import { getViewerContext } from "@/lib/preview";
import { Table, Th } from "@/components/ui/Table";
import ParceiroRow, { type ParceiroOp } from "@/components/parceiros/ParceiroRow";
import { hojeBR } from "@/lib/data-br";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function ParceirosPage({ searchParams }: { searchParams: { ano?: string; mes?: string } }) {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;
  const meRole = viewer.effectiveRole;

  if (!["closer", "lider", "diretor"].includes(meRole)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">Parceiros é uma visão de Closers, líderes e Diretoria.</p>
      </main>
    );
  }

  let exercitoLideradoId: string | null = null;
  if (meRole === "lider") {
    const { data: ex } = await supabase.from("exercitos").select("id").eq("legado_id", meId).maybeSingle();
    exercitoLideradoId = ex?.id ?? null;
  }

  const [anoHoje, mesHoje] = hojeBR().split("-").map(Number);
  const ano = Number(searchParams.ano) || anoHoje;
  const mes = Number(searchParams.mes) || mesHoje;
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const mesAnterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const mesSeguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };

  // Só crédito PAGO — é sobre isso que se solicita o extra de comissão de
  // parceiro na nota ao banco (ver buscarNotaMes em src/lib/dre.ts).
  const { data: opRows } = await supabase
    .from("weekly_operacoes")
    .select("id, data, cliente, sdr_profile_id, closer_profile_id, valor")
    .eq("status", "PAGO")
    .gte("data", inicioMes)
    .lte("data", fimMes)
    .order("data", { ascending: false });

  const idsEnvolvidos = Array.from(
    new Set((opRows ?? []).flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
  );
  const [{ data: pessoas }, { data: exercitos }, { data: config }, { data: comissoesParceiro }] = await Promise.all([
    idsEnvolvidos.length > 0
      ? supabase.from("profiles").select("id, full_name, tribo:tribos!profiles_tribo_id_fkey(exercito_id)").in("id", idsEnvolvidos)
      : Promise.resolve({ data: [] }),
    supabase.from("exercitos").select("id, legado_id"),
    supabase.from("dre_configuracoes").select("pct_receita_parceiro").eq("id", true).maybeSingle(),
    (opRows ?? []).length > 0
      ? supabase
          .from("comissoes_parceiro")
          .select("weekly_operacao_id, nome_parceiro, percentual, chave_pix, status")
          .in(
            "weekly_operacao_id",
            (opRows ?? []).map((o) => o.id)
          )
      : Promise.resolve({ data: [] }),
  ]);
  const pctParceiroPadrao = Number(config?.pct_receita_parceiro ?? 0.01) * 100;
  const comissaoParceiroPorOp = new Map((comissoesParceiro ?? []).map((c) => [c.weekly_operacao_id, c]));

  const exercitoIdPorLegadoId = new Map((exercitos ?? []).map((e) => [e.legado_id, e.id]));
  const pessoaPorId = new Map(
    (pessoas ?? []).map((p) => {
      const tribo = p.tribo as unknown as { exercito_id: string } | null;
      return [
        p.id,
        { nome: p.full_name, exercitoId: tribo?.exercito_id ?? exercitoIdPorLegadoId.get(p.id) ?? null },
      ];
    })
  );

  const todasOps: ParceiroOp[] = (opRows ?? []).map((o) => {
    const sdr = o.sdr_profile_id ? pessoaPorId.get(o.sdr_profile_id) : undefined;
    const closer = o.closer_profile_id ? pessoaPorId.get(o.closer_profile_id) : undefined;
    const comissaoParceiro = comissaoParceiroPorOp.get(o.id);
    return {
      id: o.id,
      data: o.data,
      cliente: o.cliente,
      sdrNome: sdr?.nome ?? o.sdr_profile_id ?? null,
      closerNome: closer?.nome ?? o.closer_profile_id ?? null,
      valor: Number(o.valor),
      podeEditar: podeEditarOperacao(
        { id: meId, role: meRole, exercitoLideradoId },
        {
          closerProfileId: o.closer_profile_id,
          sdrExercitoId: sdr?.exercitoId ?? null,
          closerExercitoId: closer?.exercitoId ?? null,
        }
      ),
      comissaoParceiro: comissaoParceiro
        ? {
            nomeParceiro: comissaoParceiro.nome_parceiro,
            percentual: Number(comissaoParceiro.percentual),
            chavePix: comissaoParceiro.chave_pix,
            status: comissaoParceiro.status as "ok" | "pendente_aprovacao" | "aprovado",
          }
        : null,
    };
  });

  // Mesma regra de escopo do Forecast: closer vê onde é Closer OU SDR;
  // líder vê o time DONO da operação (Closer, com SDR como fallback);
  // Diretor vê tudo.
  let ops: ParceiroOp[];
  if (meRole === "closer") {
    ops = (opRows ?? [])
      .map((o, i) => ({ raw: o, computed: todasOps[i] }))
      .filter(({ raw }) => raw.closer_profile_id === meId || raw.sdr_profile_id === meId)
      .map(({ computed }) => computed);
  } else if (meRole === "lider" && exercitoLideradoId) {
    ops = (opRows ?? [])
      .map((o, i) => ({ raw: o, computed: todasOps[i] }))
      .filter(({ raw }) => {
        const sdrEx = raw.sdr_profile_id ? pessoaPorId.get(raw.sdr_profile_id)?.exercitoId : null;
        const closerEx = raw.closer_profile_id ? pessoaPorId.get(raw.closer_profile_id)?.exercitoId : null;
        const timeDaOperacao = closerEx ?? sdrEx;
        return timeDaOperacao === exercitoLideradoId;
      })
      .map(({ computed }) => computed);
  } else {
    ops = todasOps;
  }

  const escopoLabel =
    meRole === "closer" ? "Seus créditos pagos" : meRole === "lider" ? "Créditos pagos da sua equipe" : "Império inteiro";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Parceiros</h1>
          <p className="kicker mt-1">{escopoLabel} · cadastre quem tem comissão de parceiro</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/parceiros?ano=${mesAnterior.ano}&mes=${mesAnterior.mes}`} className="btn-outline px-2.5 py-1.5 text-xs">
            ← {MESES[mesAnterior.mes - 1].slice(0, 3)}
          </a>
          <span className="font-display text-sm text-stone-200">
            {MESES[mes - 1]}/{ano}
          </span>
          <a href={`/parceiros?ano=${mesSeguinte.ano}&mes=${mesSeguinte.mes}`} className="btn-outline px-2.5 py-1.5 text-xs">
            {MESES[mesSeguinte.mes - 1].slice(0, 3)} →
          </a>
        </div>
      </div>

      <div className="card-imp">
        {ops.length > 0 ? (
          <Table minWidth="min-w-[720px]">
            <thead>
              <tr>
                <Th className="pr-3">Data</Th>
                <Th className="pr-3">Cliente</Th>
                <Th className="pr-3">SDR</Th>
                <Th className="pr-3">Closer</Th>
                <Th align="right" className="pr-3">Crédito</Th>
                <Th>Parceiro</Th>
              </tr>
            </thead>
            <tbody>
              {ops.map((op) => (
                <ParceiroRow key={op.id} op={op} pctParceiroPadrao={pctParceiroPadrao} />
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-stone-500">Nenhum crédito pago nesse mês ainda.</p>
        )}
      </div>
    </main>
  );
}
