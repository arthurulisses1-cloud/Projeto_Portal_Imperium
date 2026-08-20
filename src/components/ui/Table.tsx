// Primitivos de tabela compartilhados — Comissão, Forecast, Exército/Tribo,
// Weekly, Metas, Estrelas e Produção cada um reinventava `<table>` do zero
// com padding/tratamento de header ligeiramente diferentes (py-1 vs py-2 vs
// py-2.5, uppercase vs não). Centraliza aqui o padrão que já era majoritário
// (header uppercase tracking-wide text-stone-500, célula py-2) — trocar o
// visual de toda tabela do sistema de uma vez vira mudar um arquivo só.
export function Table({
  children,
  className,
  minWidth,
}: {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${minWidth ?? ""} ${className ?? ""}`}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`pb-2 text-xs uppercase tracking-wide text-stone-500 ${
        align === "right" ? "text-right" : "text-left"
      } ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`py-2 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      {children}
    </td>
  );
}

// Linha de corpo com a borda-topo padrão — `active` destaca (usado pra "seu
// tier atual"/"essa semana"/etc, o mesmo `bg-gold/5-10` que várias páginas
// já usavam soltas).
export function Tr({
  children,
  active,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <tr className={`border-t border-imperium-line ${active ? "bg-gold/10" : ""} ${className ?? ""}`}>
      {children}
    </tr>
  );
}
