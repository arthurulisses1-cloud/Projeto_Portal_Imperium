"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconTemple,
  IconScroll,
  IconSwords,
  IconShield,
  IconColumn,
  IconCoin,
  IconLaurel,
  IconBook,
  IconEagle,
  IconScales,
  IconTarget,
  IconTablet,
} from "./icons";

const ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  "/": IconTemple,
  "/compromisso": IconScroll,
  "/producao": IconSwords,
  "/tribo": IconShield,
  "/exercito": IconShield,
  "/minha-producao": IconSwords,
  "/carreira": IconColumn,
  "/comissao": IconCoin,
  "/dre": IconCoin,
  "/ranking": IconLaurel,
  "/forecast": IconTarget,
  "/weekly": IconEagle,
  "/trilha": IconBook,
  "/metas": IconTarget,
  "/validacao": IconTablet,
  "/aprovacoes": IconScales,
  "/contestacoes": IconScales,
  Pessoas: IconColumn,
  "Validações": IconScales,
};

export type NavLink = { type: "link"; href: string; label: string };
export type NavGroup = { type: "group"; label: string; items: { href: string; label: string }[] };
export type NavEntry = NavLink | NavGroup;

export default function AppNav({
  items,
  pendencias,
  destaques,
}: {
  items: NavEntry[];
  pendencias?: Record<string, number>;
  // Bolinha vermelha simples (sem número) pra "tem coisa nova pra ver" —
  // diferente de `pendencias`, que é contagem de tarefa acionável.
  destaques?: Record<string, boolean>;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) =>
        item.type === "link" ? (
          <NavLinkItem
            key={item.href}
            href={item.href}
            label={item.label}
            pendente={pendencias?.[item.href] ?? 0}
            destaque={destaques?.[item.href] ?? false}
            active={pathname === item.href}
          />
        ) : (
          <NavGroupItem key={item.label} group={item} pathname={pathname} pendencias={pendencias} />
        )
      )}
    </nav>
  );
}

function NavLinkItem({
  href,
  label,
  pendente,
  destaque,
  active,
}: {
  href: string;
  label: string;
  pendente: number;
  destaque?: boolean;
  active: boolean;
}) {
  const Icon = ICONS[href] ?? IconScroll;
  return (
    <Link href={href} className={`nav-link relative whitespace-nowrap ${active ? "nav-link-active" : ""}`}>
      <span className="relative shrink-0">
        <Icon className="h-3.5 w-3.5" />
        {destaque && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-wine-bright" title="Novidade" />
        )}
      </span>
      <span className="flex-1">{label}</span>
      {pendente > 0 && (
        <span className="flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-wine px-1 text-[9px] font-medium text-stone-100">
          {pendente}
        </span>
      )}
    </Link>
  );
}

function NavGroupItem({
  group,
  pathname,
  pendencias,
}: {
  group: NavGroup;
  pathname: string;
  pendencias?: Record<string, number>;
}) {
  const algumFilhoAtivo = group.items.some((i) => i.href === pathname);
  const [aberto, setAberto] = useState(algumFilhoAtivo);
  const Icon = ICONS[group.label] ?? IconScroll;
  const pendenteTotal = group.items.reduce((s, i) => s + (pendencias?.[i.href] ?? 0), 0);

  return (
    <div>
      <button
        onClick={() => setAberto((a) => !a)}
        className={`nav-link relative w-full whitespace-nowrap ${algumFilhoAtivo ? "nav-link-active" : ""}`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{group.label}</span>
        {pendenteTotal > 0 && (
          <span className="flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-wine px-1 text-[9px] font-medium text-stone-100">
            {pendenteTotal}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {aberto && (
        <div className="ml-3 flex flex-col gap-1 border-l border-imperium-line pl-2 pt-1">
          {group.items.map((i) => (
            <NavLinkItem key={i.href} href={i.href} label={i.label} pendente={pendencias?.[i.href] ?? 0} active={pathname === i.href} />
          ))}
        </div>
      )}
    </div>
  );
}
