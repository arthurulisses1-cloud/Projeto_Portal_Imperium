import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import { IconLaurel } from "@/components/ui/icons";
import { Badge } from "@/components/ui/Badge";
import { MARCO_MULTIPLICADOR_POR_ROLE } from "@/lib/marcos";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Antes era a aba "/central" — agora embutido direto no Mural, escopado por
// quem tá vendo: Diretor vê a firma inteira, Líder só o próprio Exército,
// Closer só a própria Tribo (via `escopo`; sem escopo = sem filtro extra).
type Escopo = { tipo: "exercito"; exercitoId: string } | { tipo: "tribo"; triboId: string } | null;

export default async function CentralNotificacoes({ escopo = null }: { escopo?: Escopo }) {
  const supabase = await createClient();

  const { data: pessoasRaw } = await supabase
    .from("profiles")
    .select("id, full_name, role, data_admissao, tribo:tribos!profiles_tribo_id_fkey(id, exercito_id)")
    .in("role", ["sdr", "closer"])
    .eq("ativo", true);

  const pessoas = (pessoasRaw ?? [])
    .filter((p) => {
      if (!escopo) return true;
      const tribo = p.tribo as unknown as { id: string; exercito_id: string } | null;
      if (escopo.tipo === "tribo") return tribo?.id === escopo.triboId;
      return tribo?.exercito_id === escopo.exercitoId;
    })
    .map((p) => ({ id: p.id, full_name: p.full_name, role: p.role, data_admissao: p.data_admissao }));
  const ids = pessoas.map((p) => p.id);

  const hoje = new Date().toISOString().slice(0, 10);

  const { data: compromissosHoje } = ids.length
    ? await supabase.from("compromissos").select("profile_id, lancado").eq("data", hoje).in("profile_id", ids)
    : { data: [] };
  const lancouHoje = new Set((compromissosHoje ?? []).filter((c) => c.lancado).map((c) => c.profile_id));
  const naoLancaram = (pessoas ?? []).filter((p) => !lancouHoje.has(p.id));

  const { data: marcos } = await supabase.from("marcos").select("nome, threshold, icone").order("ordem");
  // Mesma base que buscarProgressoMarcos (src/lib/marcos.ts): mês corrente,
  // não acumulado do ano — os thresholds são metas de UM mês.
  const inicioMesMarcos = hoje.slice(0, 7) + "-01";
  const { data: vendasMesMarcos } = ids.length
    ? await supabase.from("vendas").select("profile_id, valor").in("profile_id", ids).gte("data", inicioMesMarcos)
    : { data: [] };
  const producaoMesPorPessoa = new Map<string, number>();
  for (const v of vendasMesMarcos ?? []) {
    producaoMesPorPessoa.set(v.profile_id, (producaoMesPorPessoa.get(v.profile_id) ?? 0) + Number(v.valor));
  }
  // "Perto" de verdade = já fez pelo menos 70% do menor marco ainda não
  // batido no mês — sem esse corte, a lista sempre mostrava as 5 pessoas
  // MENOS LONGE (mesmo estando a 50-80% de distância), o que não é "perto"
  // de nada na prática.
  const pertoDeMarco = (pessoas ?? [])
    .map((p) => {
      const producao = producaoMesPorPessoa.get(p.id) ?? 0;
      const multiplicador = MARCO_MULTIPLICADOR_POR_ROLE[p.role] ?? 1;
      const proximo = (marcos ?? [])
        .map((m) => ({ ...m, threshold: m.threshold * multiplicador }))
        .filter((m) => producao < m.threshold)
        .sort((a, b) => a.threshold - b.threshold)[0];
      if (!proximo) return null;
      return { id: p.id, nome: p.full_name, marco: proximo.nome, icone: proximo.icone, falta: proximo.threshold - producao, threshold: proximo.threshold };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((x) => x.falta <= x.threshold * 0.3)
    .sort((a, b) => a.falta - b.falta)
    .slice(0, 5);

  const agora = new Date();
  const aniversarios = (pessoas ?? [])
    .filter((p) => p.data_admissao)
    .map((p) => {
      const admissao = new Date(p.data_admissao + "T00:00:00");
      const proximoAniversario = new Date(agora.getFullYear(), admissao.getMonth(), admissao.getDate());
      if (proximoAniversario < new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())) {
        proximoAniversario.setFullYear(agora.getFullYear() + 1);
      }
      const dias = Math.round((proximoAniversario.getTime() - agora.getTime()) / 86400000);
      const anos = proximoAniversario.getFullYear() - admissao.getFullYear();
      return { id: p.id, nome: p.full_name, dias, anos };
    })
    .filter((a) => a.dias >= 0 && a.dias <= 7)
    .sort((a, b) => a.dias - b.dias);

  if (naoLancaram.length === 0 && pertoDeMarco.length === 0 && aniversarios.length === 0) return null;

  return (
    <Card title="Central de Notificações" right={<span className="text-xs text-stone-500">o que precisa da sua atenção</span>}>
      <div className="space-y-5">
        {naoLancaram.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">
              Não lançaram o compromisso hoje ({naoLancaram.length})
            </p>
            <ul className="flex flex-wrap gap-2">
              {naoLancaram.map((p) => (
                <li key={p.id}>
                  <Badge tone="warning" variant="tag">
                    {p.full_name}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pertoDeMarco.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Perto de bater um Marco</p>
            <ul className="space-y-1.5">
              {pertoDeMarco.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-stone-200">
                    {m.icone} {m.nome} → {m.marco}
                  </span>
                  <span className="text-gold">faltam {moeda(m.falta)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {aniversarios.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Aniversário de empresa (próximos 7 dias)</p>
            <ul className="space-y-1.5">
              {aniversarios.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-stone-200">
                    <IconLaurel className="h-3.5 w-3.5 text-gold" /> {a.nome}
                  </span>
                  <span className="text-gold">
                    {a.anos} {a.anos === 1 ? "ano" : "anos"} — {a.dias === 0 ? "hoje" : `em ${a.dias}d`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
