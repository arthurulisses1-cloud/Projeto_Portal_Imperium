import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function CentralPage() {
  const supabase = await createClient();

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name, role, data_admissao")
    .in("role", ["sdr", "closer"]);
  const ids = (pessoas ?? []).map((p) => p.id);

  const hoje = new Date().toISOString().slice(0, 10);

  // ---------- Quem não lançou compromisso hoje ----------
  const { data: compromissosHoje } = ids.length
    ? await supabase.from("compromissos").select("profile_id, lancado").eq("data", hoje).in("profile_id", ids)
    : { data: [] };
  const lancouHoje = new Set((compromissosHoje ?? []).filter((c) => c.lancado).map((c) => c.profile_id));
  const naoLancaram = (pessoas ?? []).filter((p) => !lancouHoje.has(p.id));

  // ---------- Perto de bater um Marco ----------
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

  // ---------- Aniversário de empresa (próximos 7 dias) ----------
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

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Central de Notificações</h1>
        <p className="kicker mt-1">O que precisa da sua atenção hoje</p>
      </div>

      <Card
        title="Não lançaram o compromisso hoje"
        right={<span className="text-xs text-stone-500">{naoLancaram.length}</span>}
      >
        {naoLancaram.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {naoLancaram.map((p) => (
              <li
                key={p.id}
                className="rounded-full border border-wine/40 bg-wine/10 px-3 py-1 text-xs text-wine-bright"
              >
                {p.full_name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-400">Todo mundo já lançou hoje.</p>
        )}
      </Card>

      <Card title="Perto de bater um Marco">
        {pertoDeMarco.length > 0 ? (
          <ul className="space-y-2">
            {pertoDeMarco.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-stone-200">
                  {m.icone} {m.nome} → {m.marco}
                </span>
                <span className="text-gold">faltam {moeda(m.falta)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum marco cadastrado ou ninguém perto ainda.</p>
        )}
      </Card>

      <Card title="Aniversário de empresa (próximos 7 dias)">
        {aniversarios.length > 0 ? (
          <ul className="space-y-2">
            {aniversarios.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-stone-200">🎉 {a.nome}</span>
                <span className="text-gold">
                  {a.anos} {a.anos === 1 ? "ano" : "anos"} — {a.dias === 0 ? "hoje" : `em ${a.dias}d`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">
            Nenhum nos próximos 7 dias (ou a data de admissão ainda não foi cadastrada em &quot;Meu
            Legado&quot;).
          </p>
        )}
      </Card>
    </main>
  );
}
