import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR, amanhaBR, inicioMesBR, fimMesBR, fimMesExclusivoBR } from "@/lib/data-br";
import { buscarVisaoDiaria, type PessoaVisao } from "@/lib/visao-diaria";
import { buscarConfrontoExercitos, buscarConfrontoTribos, buscarTopCredito, buscarCrestsTribos } from "@/lib/guerra";
import { buscarCampanhasAtivas } from "@/lib/campanhas";
import { buscarRecordesAuto, buscarRecordesCurados } from "@/lib/recordes";
import TvDisplay from "./TvDisplay";

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
  const topConexoesHoje = todasPessoasHoje
    .filter((p) => p.funil.conexoes > 0)
    .sort((a, b) => b.funil.conexoes - a.funil.conexoes)
    .slice(0, 10);

  const todasPessoasMes: PessoaVisao[] = visaoMes.exercitos.flatMap((e) => e.tribos.flatMap((t) => t.pessoas));
  const topEntrevistasMes = todasPessoasMes
    .filter((p) => p.funil.entrevistas > 0)
    .sort((a, b) => b.funil.entrevistas - a.funil.entrevistas)
    .slice(0, 5);

  return (
    <TvDisplay
      funilHoje={visaoHoje.funil}
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
