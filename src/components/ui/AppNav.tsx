"use client";

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
  "/carreira": IconColumn,
  "/comissao": IconCoin,
  "/ranking": IconLaurel,
  "/trilha": IconBook,
  "/geral": IconEagle,
  "/metas": IconTarget,
  "/validacao": IconTablet,
  "/aprovacoes": IconScales,
  "/contestacoes": IconScales,
};

export default function AppNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? IconScroll;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link whitespace-nowrap ${active ? "nav-link-active" : ""}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
