"use client";

// Esforço 3C Plus → "Listas ao longo do tempo": por pré-vendas, as tentativas, os alôs e as conexões de cada
// dia, com uma faixa de fundo para a lista principal de cada trecho. Serve para ver se alôs e conexões vêm
// caindo e se isso acompanha a troca de lista. Os números chegam prontos do servidor (linhaDoTempoListas).
import { useState } from "react";
import type { LinhaDoTempoListas } from "@/lib/esforco-3c";

type Pessoa = { nome: string; linha: LinhaDoTempoListas };

const CORES_LISTAS = ["#FC5400", "#8E44AD", "#B8860B", "#D63384", "#16A085", "#2F6FD6", "#7F8C8D", "#C0392B"];
const LINHAS = { tentativas: "#D6D3D1", alos: "#60A5FA", conexoes: "#34D399" };

const num = (v: number) => v.toLocaleString("pt-BR");
const taxa = (a: number, b: number) => (b > 0 ? a / b : null);
const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (d: string) => SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()];

/** Teto "redondo" do eixo (1, 1,2, 1,6, 2, 3, 4, 5, 6 ou 8 × 10ⁿ: quartos sem quebrados feios). */
function teto(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v) ?? 10) * p;
}

export function ListasPorPreVendas({ pessoas, inicial, idealAlo, idealConexao, seg }: { pessoas: Pessoa[]; inicial: string; idealAlo: number; idealConexao: number; seg: number }) {
  const [nome, setNome] = useState(pessoas.some((p) => p.nome === inicial) ? inicial : pessoas[0]?.nome);
  const [modo, setModo] = useState<"volume" | "taxas">("volume");
  const pessoa = pessoas.find((p) => p.nome === nome) ?? pessoas[0];
  if (!pessoa) return null;
  const { dias, faixas, listas } = pessoa.linha;
  // A cor da lista segue a ordem da tabela (a que mais discou primeiro), igual no gráfico e na tabela.
  const corDa = new Map(listas.map((l, i) => [l.lista, CORES_LISTAS[i % CORES_LISTAS.length]]));
  // Número da lista (a ordem da tabela): vai na faixa quando o nome não cabe.
  const numDa = new Map(listas.map((l, i) => [l.lista, i + 1]));

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          {pessoas.map((p) => (
            <button
              key={p.nome}
              type="button"
              onClick={() => setNome(p.nome)}
              className={`rounded border px-2.5 py-1 ${p.nome === pessoa.nome ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
            >
              {p.nome}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-imperium-line bg-imperium-raised p-0.5 text-[12px]">
          {(
            [
              ["volume", "Volume"],
              ["taxas", "Taxas"],
            ] as const
          ).map(([k, r]) => (
            <button
              key={k}
              type="button"
              onClick={() => setModo(k)}
              className={`rounded-md px-2.5 py-1 ${modo === k ? "bg-imperium-surface font-semibold text-stone-100 shadow" : "text-stone-400 hover:text-stone-200"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {dias.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Nenhuma ligação deste pré-vendas no período.</p>
      ) : (
        <Grafico dias={dias} faixas={faixas} corDa={corDa} numDa={numDa} modo={modo} idealAlo={idealAlo} idealConexao={idealConexao} />
      )}

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-300">
        {modo === "volume" ? (
          <>
            <Legenda cor={LINHAS.tentativas}>Tentativas (eixo da esquerda)</Legenda>
            <Legenda cor={LINHAS.alos}>Alôs (eixo da direita)</Legenda>
            <Legenda cor={LINHAS.conexoes}>Conexões (eixo da direita)</Legenda>
          </>
        ) : (
          <>
            <Legenda cor={LINHAS.alos}>Taxa de alô (alôs ÷ tentativas)</Legenda>
            <Legenda cor={LINHAS.conexoes}>Alô → conexão (conexões ÷ alôs)</Legenda>
            <Legenda cor={LINHAS.alos} tracejada>
              Ideais: alô {fmtPct(idealAlo)} · conexão {fmtPct(idealConexao)}
            </Legenda>
          </>
        )}
      </ul>

      {listas.length > 0 && (
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-imperium-surface text-[11px] text-stone-500">
              <tr className="border-b border-imperium-line">
                <th className="py-1.5 text-left font-normal" title="O número aparece na faixa do gráfico quando o nome não cabe">
                  Lista
                </th>
                <th className="py-1.5 text-right font-normal" title="Dias em que a lista teve ao menos uma tentativa deste pré-vendas">
                  Dias
                </th>
                <th className="py-1.5 text-right font-normal">Tentativas</th>
                <th className="py-1.5 text-right font-normal">Alôs</th>
                <th className="py-1.5 text-right font-normal">Taxa de alô</th>
                <th className="py-1.5 text-right font-normal" title={`Conversas de ${seg} s ou mais`}>
                  Conexões
                </th>
                <th className="py-1.5 text-right font-normal">Alô → conexão</th>
                <th className="py-1.5 text-right font-normal">Conexão por tentativa</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {listas.map((l) => (
                <tr key={l.lista} className="border-b border-imperium-line/60">
                  <td className="max-w-md py-1.5 text-stone-100">
                    <span className="mr-1.5 inline-block min-w-[1.25rem] rounded-sm px-1 text-center text-[10px] font-semibold text-stone-950" style={{ backgroundColor: corDa.get(l.lista) }}>
                      {numDa.get(l.lista)}
                    </span>
                    <span className="break-words">{l.lista}</span>
                  </td>
                  <td className="py-1.5 text-right text-stone-300">{l.dias}</td>
                  <td className="py-1.5 text-right text-stone-300">{num(l.ligacoes)}</td>
                  <td className="py-1.5 text-right text-stone-300">{num(l.alos)}</td>
                  <td className="py-1.5 text-right text-stone-300">{fmtPct(taxa(l.alos, l.ligacoes))}</td>
                  <td className="py-1.5 text-right font-semibold text-stone-100">{num(l.conexoes)}</td>
                  <td className="py-1.5 text-right text-stone-300">{fmtPct(taxa(l.conexoes, l.alos))}</td>
                  <td className="py-1.5 text-right text-stone-300">{fmtPct(taxa(l.conexoes, l.ligacoes))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Legenda({ cor, tracejada, children }: { cor: string; tracejada?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <svg width="16" height="4" aria-hidden>
        <line x1="0" x2="16" y1="2" y2="2" stroke={cor} strokeWidth={2} strokeDasharray={tracejada ? "3 3" : undefined} />
      </svg>
      {children}
    </li>
  );
}

function Grafico({
  dias,
  faixas,
  corDa,
  numDa,
  modo,
  idealAlo,
  idealConexao,
}: {
  dias: LinhaDoTempoListas["dias"];
  faixas: LinhaDoTempoListas["faixas"];
  corDa: Map<string, string>;
  numDa: Map<string, number>;
  modo: "volume" | "taxas";
  idealAlo: number;
  idealConexao: number;
}) {
  const W = 900;
  const H = 280;
  const P = { e: 44, d: 44, t: 26, b: 24 };
  const n = dias.length;
  const passoX = n > 1 ? (W - P.e - P.d) / (n - 1) : 0;
  const x = (i: number) => (n > 1 ? P.e + i * passoX : (P.e + W - P.d) / 2);
  const meia = n > 1 ? passoX / 2 : (W - P.e - P.d) / 2;
  const alto = H - P.t - P.b;

  // Volume: tentativas no eixo da esquerda; alôs e conexões no da direita (escala própria, senão somem).
  // Taxas: as duas passagens num eixo só, em %; dia sem denominador fica sem ponto.
  const maxE = modo === "volume" ? teto(Math.max(...dias.map((d) => d.ligacoes))) : teto(Math.max(idealAlo, idealConexao, ...dias.flatMap((d) => [taxa(d.alos, d.ligacoes) ?? 0, taxa(d.conexoes, d.alos) ?? 0])) * 100) / 100;
  const maxD = modo === "volume" ? teto(Math.max(...dias.map((d) => d.alos))) : maxE;
  const yE = (v: number) => P.t + (1 - v / maxE) * alto;
  const yD = (v: number) => P.t + (1 - v / maxD) * alto;

  const series: { cor: string; y: (v: number) => number; valor: (d: (typeof dias)[number]) => number | null }[] =
    modo === "volume"
      ? [
          { cor: LINHAS.tentativas, y: yE, valor: (d) => d.ligacoes },
          { cor: LINHAS.alos, y: yD, valor: (d) => d.alos },
          { cor: LINHAS.conexoes, y: yD, valor: (d) => d.conexoes },
        ]
      : [
          { cor: LINHAS.alos, y: yE, valor: (d) => taxa(d.alos, d.ligacoes) },
          { cor: LINHAS.conexoes, y: yE, valor: (d) => taxa(d.conexoes, d.alos) },
        ];
  /** Caminho com quebra onde não há valor. */
  const caminho = (s: (typeof series)[number]) => {
    let d = "";
    let aberto = false;
    dias.forEach((p, i) => {
      const v = s.valor(p);
      if (v === null) return void (aberto = false);
      d += `${aberto ? "L" : "M"}${x(i).toFixed(1)},${s.y(v).toFixed(1)}`;
      aberto = true;
    });
    return d;
  };
  const rotuloE = (v: number) => (modo === "volume" ? num(Math.round(v)) : fmtPct(v));
  const passoRotulo = Math.ceil(n / 16);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Tentativas, alôs e conexões por dia, com a lista principal de cada trecho">
      {/* Faixas de lista */}
      {faixas.map((f) => {
        const x0 = Math.max(P.e, x(f.inicio) - meia);
        const x1 = Math.min(W - P.d, x(f.fim) + meia);
        const cor = corDa.get(f.lista) ?? "#7F8C8D";
        const cabe = Math.floor((x1 - x0 - 8) / 6);
        const ordem = numDa.get(f.lista) ?? 0;
        // Nome inteiro se couber; senão "3 · Lista 15 - …"; muito estreita, só o número.
        const rotulo = f.lista.length + 4 <= cabe ? `${ordem} · ${f.lista}` : cabe >= 12 ? `${ordem} · ${f.lista.slice(0, cabe - 5)}…` : String(ordem);
        return (
          <g key={`${f.lista}-${f.inicio}`}>
            <rect x={x0} y={P.t - 18} width={x1 - x0} height={alto + 18} fill={cor} fillOpacity={0.13} />
            <rect x={x0} y={P.t - 18} width={x1 - x0} height={3} fill={cor} />
            {cabe >= 1 && (
              <text x={x0 + 4} y={P.t - 5} className="text-[10px]" fill={cor}>
                {rotulo}
              </text>
            )}
            <title>{`${f.lista}: ${curta(dias[f.inicio].dia)} a ${curta(dias[f.fim].dia)}`}</title>
          </g>
        );
      })}

      {/* Grade e eixos */}
      {[0, 0.25, 0.5, 0.75, 1].map((k) => (
        <g key={k}>
          <line x1={P.e} x2={W - P.d} y1={yE(maxE * k)} y2={yE(maxE * k)} stroke="currentColor" className="text-imperium-line" strokeWidth={1} />
          <text x={P.e - 6} y={yE(maxE * k) + 3} textAnchor="end" className="fill-stone-500 text-[10px]">
            {rotuloE(maxE * k)}
          </text>
          {modo === "volume" && (
            <text x={W - P.d + 6} y={yD(maxD * k) + 3} className="text-[10px]" fill={LINHAS.alos} fillOpacity={0.8}>
              {num(Math.round(maxD * k))}
            </text>
          )}
        </g>
      ))}
      {dias.map((d, i) =>
        i % passoRotulo === 0 ? (
          <text key={d.dia} x={x(i)} y={H - 8} textAnchor="middle" className="fill-stone-500 text-[10px]">
            {curta(d.dia)}
          </text>
        ) : null,
      )}

      {/* Ideais (modo taxas) */}
      {modo === "taxas" && (
        <>
          <line x1={P.e} x2={W - P.d} y1={yE(idealAlo)} y2={yE(idealAlo)} stroke={LINHAS.alos} strokeDasharray="4 4" strokeOpacity={0.7} />
          {Math.abs(idealAlo - idealConexao) > 1e-9 && (
            <line x1={P.e} x2={W - P.d} y1={yE(idealConexao)} y2={yE(idealConexao)} stroke={LINHAS.conexoes} strokeDasharray="4 4" strokeOpacity={0.7} />
          )}
        </>
      )}

      {/* Linhas e pontos */}
      {series.map((s, k) => (
        <g key={k}>
          <path d={caminho(s)} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" />
          {dias.map((p, i) => {
            const v = s.valor(p);
            return v === null ? null : <circle key={p.dia} cx={x(i)} cy={s.y(v)} r={n > 20 ? 2 : 3} fill={s.cor} />;
          })}
        </g>
      ))}

      {/* Área de cada dia, para o detalhe ao passar o mouse */}
      {dias.map((p, i) => (
        <rect key={p.dia} x={x(i) - meia} y={P.t} width={meia * 2} height={alto} fill="transparent">
          <title>
            {[
              `${curta(p.dia)} (${diaSemana(p.dia)})`,
              p.lista ? `Lista: ${p.lista}${p.listasNoDia > 1 ? ` (e mais ${p.listasNoDia - 1} no dia)` : ""}` : "Sem ligação",
              `Tentativas: ${num(p.ligacoes)}`,
              `Alôs: ${num(p.alos)} (${fmtPct(taxa(p.alos, p.ligacoes))})`,
              `Conexões: ${num(p.conexoes)} (${fmtPct(taxa(p.conexoes, p.alos))} dos alôs)`,
            ].join("\n")}
          </title>
        </rect>
      ))}
    </svg>
  );
}
