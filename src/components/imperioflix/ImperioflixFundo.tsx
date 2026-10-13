// Plano de fundo da Imperioflix (pedido do Diretor, 2026-10-13): claro e
// moderno, no lugar do Coliseu padrão do sistema. Malha de cores suaves e uma
// grade de pontos discreta que se dissolve no centro. Fica fixo atrás de todo
// o conteúdo e não recebe cliques.
export default function ImperioflixFundo() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(900px 520px at 8% -8%, rgb(129 140 248 / 0.26), transparent 62%)",
            "radial-gradient(820px 520px at 100% 4%, rgb(251 191 36 / 0.20), transparent 60%)",
            "radial-gradient(760px 560px at 92% 100%, rgb(56 189 248 / 0.18), transparent 62%)",
            "radial-gradient(700px 520px at 0% 96%, rgb(167 139 250 / 0.18), transparent 62%)",
            "linear-gradient(180deg, #f7f9ff 0%, #eef2fc 55%, #f8f5ee 100%)",
          ].join(","),
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        style={{
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, #000 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, #000 85%)",
        }}
      >
        <defs>
          <pattern id="pontos-imperioflix" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="rgb(79 70 229 / 0.22)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pontos-imperioflix)" />
      </svg>
    </div>
  );
}
