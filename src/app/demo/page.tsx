import Link from "next/link";
import { notFound } from "next/navigation";

export default function DemoPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="min-h-screen bg-imperium-bg px-4 py-8 text-stone-100">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Demonstração local · todos os números abaixo são fictícios. Para consultar os dados reais, entre com uma conta autorizada.
        </div>
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs uppercase tracking-widest text-stone-500">Dashboard do negócio · exemplo</p><h1 className="mt-1 font-display text-2xl text-gold-bright">Maximus Energy (Sunne)</h1></div>
          <Link href="/login" className="btn-outline text-sm">Voltar ao login</Link>
        </div>
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Sunne · geração distribuída</p>
          <p className="mt-1 text-xs text-stone-500">Exemplo da consulta automática. A API não identifica o canal nem o vendedor.</p>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div><p className="text-stone-400">Negócios criados no mês</p><p className="text-xl">12</p></div>
            <div><p className="text-stone-400">Fechados no mês, não perdidos</p><p className="text-xl">4</p></div>
            <div><p className="text-stone-400">Soma do consumo médio dos fechados</p><p className="text-xl">8.500 kWh/mês</p><p className="text-xs text-stone-500">4 de 4 com consumo informado</p></div>
          </div>
          <p className="mt-4 text-xs text-stone-400">Etapa atual dos negócios não perdidos · toda a rede</p>
          <div className="mt-2 flex flex-wrap gap-2">{["Validação: 5", "Proposta Enviada: 4", "Ativo: 3"].map((etapa) => <span key={etapa} className="rounded border border-imperium-line px-2 py-1 text-xs text-stone-300">{etapa}</span>)}</div>
        </section>
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Funil do mês · exemplo de meta</p>
          <p className="mt-2 text-sm text-stone-400">O realizado por canal depende da integração com a fonte que identifica outbound e inbound.</p>
        </section>
      </div>
    </main>
  );
}
