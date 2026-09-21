import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR, amanhaBR, inicioMesBR, fimMesBR, fimMesExclusivoBR } from "@/lib/data-br";
import { buscarVisaoDiaria, type PessoaVisao } from "@/lib/visao-diaria";
import { buscarConfrontoExercitos, buscarConfrontoTribos, buscarTopCredito, buscarCrestsTribos } from "@/lib/guerra";
import { buscarCampanhasAtivas } from "@/lib/campanhas";
import { buscarRecordesAuto, buscarRecordesCurados } from "@/lib/recordes";
import TvDisplay, { type DueloExercito } from "./TvDisplay";

// Gestão à vista — pedido do Diretor, 2026-09-21: uma TV na sala rodando os
// indicadores em looping, trocando de tela a cada 15s. Fica fora do grupo
// (app) de propósito (sem sidebar/nav — layout.tsx daqui só herda o root,
// que já dá fonte/fundo/watermark), mas o middleware global continua
// exigindo login normalmente — é só abrir essa URL numa aba logada e deixar
// em tela cheia.
export default async function TvPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    visaoHoje,
    visaoMes,
    confrontoExercitos,
    confrontoTribos,
    crestsTribos,
    topCreditoMes,
    campanhasAtivas,
    recordesAuto,
    recordesCurados,
  ] = await Promise.all([
    buscarVisaoDiaria(supabase, hojeBR(), amanhaBR()),
    buscarVisaoDiaria(supabase, inicioMesBR(), fimMesExclusivoBR()),
    buscarConfrontoExercitos(supabase, inicioMesBR(), fimMesBR()),
    buscarConfrontoTribos(supabase, inicioMesBR(), fimMesBR()),
    buscarCrestsTribos(supabase),
    buscarTopCredito(supabase, inicioMesBR(), fimMesBR(), 10),
    buscarCampanhasAtivas(supabase),
    buscarRecordesAuto(supabase),
    buscarRecordesCurados(supabase),
  ]);

  const todasPessoasHoje: PessoaVisao[] = visaoHoje.exercitos.flatMap((e) => e.tribos.flatMap((t) => t.pessoas));
  // "Do primeiro ao último" — pedido do Diretor, 2026-09-21: ranking
  // individual completo do dia (não só um top 10), ordenado por Tentativas
  // (o número "cru" de ligações — Alôs/Conexões são o funil filtrando dali).
  const rankingLigacoesHoje = todasPessoasHoje
    .filter((p) => p.funil.tentativas > 0)
    .sort((a, b) => b.funil.tentativas - a.funil.tentativas);
  const topConexoesHoje = todasPessoasHoje
    .filter((p) => p.funil.conexoes > 0)
    .sort((a, b) => b.funil.conexoes - a.funil.conexoes)
    .slice(0, 10);

  const todasPessoasMes: PessoaVisao[] = visaoMes.exercitos.flatMap((e) => e.tribos.flatMap((t) => t.pessoas));
  const topEntrevistasMes = todasPessoasMes
    .filter((p) => p.funil.entrevistas > 0)
    .sort((a, b) => b.funil.entrevistas - a.funil.entrevistas)
    .slice(0, 5);

  // Duelo de Funis — pedido do Diretor, 2026-09-21: funil completo dos 2
  // Exércitos na ponta da Guerra Civil (por R$ pago no mês, já ordenado por
  // agregarPorGrupo em guerra.ts), lado a lado. "Fora dos Exércitos" não é
  // um concorrente de verdade — nunca entra no duelo.
  const top2 = confrontoExercitos.filter((c) => c.nome !== "Fora dos Exércitos").slice(0, 2);
  const exercitoPorNome = new Map(visaoMes.exercitos.map((e) => [e.nome, e]));
  const duelo: DueloExercito[] =
    top2.length === 2
      ? top2.map((c) => {
          const e = exercitoPorNome.get(c.nome);
          return {
            nome: c.nome,
            tentativas: e?.funil.tentativas ?? 0,
            alos: e?.funil.alos ?? 0,
            conexoes: e?.funil.conexoes ?? 0,
            assinaturas: e?.funil.assinaturas ?? 0,
            pagos: e?.funil.pagos ?? 0,
            pagosValor: c.valor,
          };
        })
      : [];

  return (
    <TvDisplay
      funilHoje={visaoHoje.funil}
      rankingLigacoesHoje={rankingLigacoesHoje}
      duelo={duelo}
      topConexoesHoje={topConexoesHoje}
      topEntrevistasMes={topEntrevistasMes}
      topCreditoMes={topCreditoMes}
      confrontoExercitos={confrontoExercitos}
      confrontoTribos={confrontoTribos}
      crestsTribos={crestsTribos}
      campanhasAtivas={campanhasAtivas}
      recordesAuto={recordesAuto}
      recordesCurados={recordesCurados}
    />
  );
}
