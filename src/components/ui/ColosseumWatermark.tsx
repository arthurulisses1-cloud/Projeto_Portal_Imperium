// Marca d'água de fundo — o Coliseu em linha fina, mesmo traço dos ícones
// do app (icons.tsx), fixo atrás de todo o conteúdo em qualquer tela e em
// qualquer tema (a cor vem de `currentColor`, herdada via className, então
// se adapta ao dourado de cada tema sem precisar de 3 versões).
//
// Geometria: 3 fileiras de arcos (as 3 ordens de arquitetura da fachada
// real — dórica, jônica, coríntia — aqui só como 3 tamanhos decrescentes
// de arco) + cornija no topo + linha de base. Gerado por fórmula em vez de
// path desenhado à mão, pra manter as ~70 repetições consistentes.
function fileiraDeArcos(count: number, r: number, h: number, gap: number) {
  const passo = 2 * r + gap;
  const arcos: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = i * passo;
    arcos.push(`M${x} ${h} L${x} ${r} A${r} ${r} 0 0 1 ${x + 2 * r} ${r} L${x + 2 * r} ${h}`);
  }
  return arcos.join(" ");
}

export default function ColosseumWatermark({ className }: { className?: string }) {
  const largura = 1400;
  const r1 = 26; // tier de baixo — arcos maiores
  const r2 = 22;
  const r3 = 18;
  const h1 = 100;
  const h2 = 86;
  const h3 = 72;
  const gap = 14;
  const n1 = Math.ceil(largura / (2 * r1 + gap));
  const n2 = Math.ceil(largura / (2 * r2 + gap));
  const n3 = Math.ceil(largura / (2 * r3 + gap));

  return (
    <svg
      viewBox={`0 0 ${largura} 300`}
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden
    >
      {/* cornija do topo */}
      <path d={`M0 22 H${largura}`} stroke="currentColor" fill="none" strokeWidth="1.4" />
      <path d={`M0 30 H${largura}`} stroke="currentColor" fill="none" strokeWidth="1.4" />

      {/* tier 3 (topo, arcos menores) */}
      <g transform="translate(0,30)" stroke="currentColor" fill="none" strokeWidth="1.4">
        <path d={fileiraDeArcos(n3, r3, h3, gap)} />
      </g>

      {/* tier 2 (meio) */}
      <g transform={`translate(${-(r2 - r3)},${30 + h3})`} stroke="currentColor" fill="none" strokeWidth="1.5">
        <path d={fileiraDeArcos(n2, r2, h2, gap)} />
      </g>

      {/* tier 1 (base, arcos maiores) */}
      <g transform={`translate(${-(r1 - r3)},${30 + h3 + h2})`} stroke="currentColor" fill="none" strokeWidth="1.6">
        <path d={fileiraDeArcos(n1, r1, h1, gap)} />
      </g>

      {/* linha de base */}
      <path d={`M0 ${30 + h3 + h2 + h1} H${largura}`} stroke="currentColor" fill="none" strokeWidth="1.6" />
    </svg>
  );
}
