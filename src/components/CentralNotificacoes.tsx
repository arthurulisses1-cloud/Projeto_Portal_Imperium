import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Antes era a aba "/central" — agora embutido direto no Mural do Diretor
// pra não poluir a navegação com uma aba a mais.
export default async function CentralNotificacoes() {
  const supabase = await createClient();

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name, role, data_admissao")
    .in("role", ["sdr", "closer"]);
  const ids = (pessoas ?? []).map((p) => p.id);

  const hoje = new Date().toISOString().slice(0, 10);

  const { data: compromissosHoje } = ids.length
    ? await supabase.from("compromissos").select("profile_id, lancado").eq("data", hoje).in("profile_id", ids)
    : { data: [] };
  const lancouHoje = new Set((compromissosHoje ?? []).filter((c) => c.lancado).map((c) => c.profile_id));
  const naoLancaram = (pessoas ?? []).filter((p) => !lancouHoje.has(p.id));

  const { data: marcos } = await supabase.from("marcos").select("nome, threshold, icone").order("ordem");
  const inicioAno = `${new Date().getFullYear()}-01-01`;
  const { data: vendasAno } = ids.length
    ? await supabase.from("vendas").select("profile_id, valor").in("profile_id", ids).gte("data", inicioAno)
    : { data: [] };
  const producaoAnoPorPessoa = new Map<string, number>();
  for (const v of vendasAno ?? []) {
    producaoAnoPorPessoa.set(v.profile_id, (producaoAnoPorPessoa.get(v.profile_id) ?? 0) + Number(v.valor));
  }
  const pertoDeMarco = (pessoas ?? [])
    .map((p) => {
      const producao = producaoAnoPorPessoa.get(p.id) ?? 0;
      const proximo = (marcos ?? [])
        .filter((m) => producao < m.threshold)
        .sort((a, b) => a.threshold - b.threshold)[0];
      if (!proximo) return null;
      return { id: p.id, nome: p.full_name, marco: proximo.nome, icone: proximo.icone, falta: proximo.threshold - producao };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
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
                <li key={p.id} className="rounded-full border border-wine/40 bg-wine/10 px-3 py-1 text-xs text-wine-bright">
                  {p.full_name}
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
                  <span className="text-stone-200">🎉 {a.nome}</span>
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
