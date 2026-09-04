"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import type { ResumoDre, LinhaFolha, Folha } from "@/lib/dre";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

// Análise vertical: cada linha da DRE em % da Receita Bruta (a base padrão
// de mercado — Treasy/Granatum/etc. usam Receita Bruta ou Líquida, sem uma
// "certa"; Bruta escolhida aqui por ser uma base única pra toda a DRE, sem
// precisar trocar de referência no meio do demonstrativo).
function AV({ valor, base }: { valor: number; base: number }) {
  if (base <= 0) return null;
  return <span className="ml-1.5 text-[10px] text-stone-600">({((valor / base) * 100).toFixed(1)}%)</span>;
}

type Conjunto = { resumo: ResumoDre; folha: Folha };

// Sub-custo com drill-down: some por padrão, "abrir" mostra quem contribuiu
// pra esse valor, pessoa por pessoa — só quando > 0 (não faz sentido abrir
// uma lista vazia).
function LinhaComDrillDown({
  label,
  valor,
  base,
  pessoas,
}: {
  label: string;
  valor: number;
  base: number;
  pessoas: { nome: string; valor: number }[];
}) {
  const contribuintes = pessoas.filter((p) => p.valor > 0).sort((a, b) => b.valor - a.valor);
  if (contribuintes.length === 0) {
    return (
      <div className="flex justify-between pl-3 text-stone-400">
        <span>{label}</span>
        <span className="text-stone-200">
          {moeda(valor)}
          <AV valor={valor} base={base} />
        </span>
      </div>
    );
  }
  return (
    <details className="group/linha pl-3">
      <summary className="flex cursor-pointer list-none justify-between text-stone-400 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1">
          {label}
          <span className="text-[9px] text-stone-600 transition group-open/linha:rotate-180">▾</span>
        </span>
        <span className="text-stone-200">
          {moeda(valor)}
          <AV valor={valor} base={base} />
        </span>
      </summary>
      <ul className="ml-3 mt-1 space-y-0.5 border-l border-imperium-line pl-3">
        {contribuintes.map((p) => (
          <li key={p.nome} className="flex justify-between text-[11px] text-stone-500">
            <span>{p.nome}</span>
            <span>{moeda(p.valor)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function EstruturaDre({ resumo, folha, config }: { resumo: ResumoDre; folha: Folha; config: { pctImposto: number } }) {
  const base = resumo.receitaBruta;
  return (
    <div className="space-y-1 text-sm">
      <p className="text-[10px] text-stone-600">Análise vertical: % de cada linha sobre a Receita Bruta</p>
      <div className="flex justify-between pt-1 font-medium">
        <span className="text-stone-200">Receita Bruta</span>
        <span className="text-gold-bright">
          {moeda(resumo.receitaBruta)}
          <AV valor={resumo.receitaBruta} base={base} />
        </span>
      </div>
      <div className="flex justify-between text-stone-400">
        <span>(-) Impostos ({(config.pctImposto * 100).toFixed(0)}%)</span>
        <span className="text-wine-bright">
          {moeda(resumo.imposto)}
          <AV valor={resumo.imposto} base={base} />
        </span>
      </div>
      <div className="flex justify-between border-t border-imperium-line pt-1 font-medium">
        <span className="text-stone-200">= Receita Líquida</span>
        <span className="text-gold-bright">
          {moeda(resumo.receitaLiquida)}
          <AV valor={resumo.receitaLiquida} base={base} />
        </span>
      </div>

      <p className="pt-3 text-[10px] uppercase tracking-wide text-gold">(-) Custos e Despesas Variáveis</p>
      <LinhaComDrillDown
        label="Comissão SDR"
        valor={resumo.comissaoSdr}
        base={base}
        pessoas={folha.linhas.map((l) => ({ nome: l.nome, valor: l.variavelSdr }))}
      />
      <LinhaComDrillDown
        label="Comissão Closer"
        valor={resumo.comissaoCloser}
        base={base}
        pessoas={folha.linhas.map((l) => ({ nome: l.nome, valor: l.variavelCloser }))}
      />
      <LinhaComDrillDown
        label="Comissão Gestão"
        valor={resumo.comissaoGestao}
        base={base}
        pessoas={folha.linhas.map((l) => ({ nome: l.nome, valor: l.variavelGestao }))}
      />
      <LinhaComDrillDown
        label="Bônus de tier"
        valor={resumo.bonusTier}
        base={base}
        pessoas={folha.linhas.map((l) => ({ nome: l.nome, valor: l.bonus }))}
      />
      {resumo.extrasVariaveis > 0 && (
        <LinhaComDrillDown
          label="Campanhas/marcos (por pessoa)"
          valor={resumo.extrasVariaveis}
          base={base}
          pessoas={folha.linhas.map((l) => ({ nome: l.nome, valor: l.campanhas }))}
        />
      )}
      {resumo.comissaoParceiro > 0 && (
        <div className="flex justify-between text-stone-400">
          <span>Comissão Parceiro</span>
          <span className="text-wine-bright">
            {moeda(resumo.comissaoParceiro)}
            <AV valor={resumo.comissaoParceiro} base={base} />
          </span>
        </div>
      )}
      <div className="flex justify-between border-t border-imperium-line pt-1 font-medium">
        <span className="text-stone-200">= Total Custos Variáveis</span>
        <span className="text-wine-bright">
          {moeda(resumo.custosVariaveisTotal)}
          <AV valor={resumo.custosVariaveisTotal} base={base} />
        </span>
      </div>

      <div className="flex justify-between border-t-2 border-imperium-line-strong pt-2 text-base font-medium">
        <span className="text-gold">= MARGEM DE CONTRIBUIÇÃO</span>
        <span className="text-gold-bright">
          {moeda(resumo.margemContribuicao)}
          <AV valor={resumo.margemContribuicao} base={base} />
        </span>
      </div>

      <p className="pt-3 text-[10px] uppercase tracking-wide text-gold">(-) Despesas Fixas</p>
      <LinhaComDrillDown
        label="Folha fixa (salário-base do time)"
        valor={resumo.folhaFixa}
        base={base}
        pessoas={folha.linhas.map((l) => ({ nome: l.nome, valor: l.fixo }))}
      />
      <div className="flex justify-between pl-3 text-stone-400">
        <span>Vorp (aluguel)</span>
        <span className="text-stone-200">
          {moeda(resumo.custoAluguel)}
          <AV valor={resumo.custoAluguel} base={base} />
        </span>
      </div>
      <div className="flex justify-between pl-3 text-stone-400">
        <span>Tráfego</span>
        <span className="text-stone-200">
          {moeda(resumo.custoTrafego)}
          <AV valor={resumo.custoTrafego} base={base} />
        </span>
      </div>
      {resumo.despesasFixasExtras > 0 && (
        <div className="flex justify-between pl-3 text-stone-400">
          <span>Despesas gerais (sem pessoa)</span>
          <span className="text-stone-200">
            {moeda(resumo.despesasFixasExtras)}
            <AV valor={resumo.despesasFixasExtras} base={base} />
          </span>
        </div>
      )}
      <div className="flex justify-between border-t border-imperium-line pt-1 font-medium">
        <span className="text-stone-200">= Total Despesas Fixas</span>
        <span className="text-wine-bright">
          {moeda(resumo.despesasFixasTotal)}
          <AV valor={resumo.despesasFixasTotal} base={base} />
        </span>
      </div>

      <div className="flex justify-between border-t-2 border-imperium-line-strong pt-2 text-base font-medium">
        <span className="text-gold">= LUCRO LÍQUIDO</span>
        <span className={resumo.lucro >= 0 ? "text-success-bright" : "text-wine-bright"}>
          {moeda(resumo.lucro)}
          <AV valor={resumo.lucro} base={base} />
        </span>
      </div>
    </div>
  );
}

function FolhaTabela({ linhas, totais }: Folha) {
  return (
    <Table>
      <thead>
        <tr>
          <Th className="px-2">Equipe</Th>
          <Th className="px-2">Cargo</Th>
          <Th className="px-2">Time</Th>
          <Th align="right" className="px-2">Fixo</Th>
          <Th align="right" className="px-2">Variável</Th>
          <Th align="right" className="px-2">Total</Th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l: LinhaFolha) => (
          <Tr key={l.profileId}>
            <Td className="px-2 whitespace-nowrap text-stone-200">{l.nome}</Td>
            <Td className="px-2 whitespace-nowrap text-stone-400">{l.cargo}</Td>
            <Td className="px-2 whitespace-nowrap text-stone-500">{l.time ?? l.tribo ?? "—"}</Td>
            <Td align="right" className="px-2 text-stone-300">{moeda(l.fixo)}</Td>
            <Td align="right" className="px-2 text-stone-300">
              {moeda(l.bonus + l.variavelSdr + l.variavelCloser + l.variavelGestao + l.campanhas)}
            </Td>
            <Td align="right" className="px-2 font-medium text-gold-bright">{moeda(l.folhaTotal)}</Td>
          </Tr>
        ))}
      </tbody>
      <tfoot>
        <Tr className="border-t-2 border-imperium-line-strong font-medium">
          <Td className="px-2 text-gold-bright">TOTAL</Td>
          <Td className="px-2" />
          <Td className="px-2" />
          <Td align="right" className="px-2 text-stone-200">{moeda(totais.fixo)}</Td>
          <Td align="right" className="px-2 text-stone-200">
            {moeda(totais.bonus + totais.variavelSdr + totais.variavelCloser + totais.variavelGestao + totais.campanhas)}
          </Td>
          <Td align="right" className="px-2 text-gold-bright">{moeda(totais.folhaTotal)}</Td>
        </Tr>
      </tfoot>
    </Table>
  );
}

export default function EstruturaDreView({
  config,
  pago,
  forecast,
}: {
  config: { pctImposto: number };
  pago: Conjunto;
  forecast: Conjunto;
}) {
  const [modo, setModo] = useState<"pago" | "forecast">("pago");
  const atual = modo === "pago" ? pago : forecast;

  return (
    <>
      <Card
        title="Estrutura da DRE"
        right={
          <div className="flex gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => setModo("pago")}
              className={`rounded px-2.5 py-1 uppercase transition ${
                modo === "pago" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold"
              }`}
            >
              Pago (real)
            </button>
            <button
              type="button"
              onClick={() => setModo("forecast")}
              className={`rounded px-2.5 py-1 uppercase transition ${
                modo === "forecast" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold"
              }`}
            >
              Forecast de pagos
            </button>
          </div>
        }
      >
        {modo === "forecast" && (
          <p className="mb-3 rounded border border-gold/30 bg-gold/5 px-3 py-2 text-[11px] text-gold-dim">
            Trata quem está &quot;Aguardando Pagamento&quot; no Forecast como se já tivesse pago — a comissão de cada
            pessoa é recalculada nessa base maior (pode empurrar gente de tier), não é só a Receita que muda.
          </p>
        )}
        <EstruturaDre resumo={atual.resumo} folha={atual.folha} config={config} />
      </Card>

      <details className="card-imp group">
        <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span>
            Folha de Pagamento, por pessoa ({atual.folha.linhas.length}) — {modo === "pago" ? "Pago (real)" : "Forecast de pagos"}
          </span>
          <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4">
          <FolhaTabela linhas={atual.folha.linhas} totais={atual.folha.totais} />
        </div>
      </details>
    </>
  );
}
