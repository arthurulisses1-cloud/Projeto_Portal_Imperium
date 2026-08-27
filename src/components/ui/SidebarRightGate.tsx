"use client";

import { usePathname } from "next/navigation";

// Telas onde a lateral direita atrapalha mais do que ajuda — hoje só o
// Kanban de Tarefas, que precisa da largura toda pra caber as 5 colunas
// sem rolagem horizontal (pedido do Diretor, 2026-08-27). `SidebarRight`
// continua sendo um Server Component normal — passado como `children`
// aqui, ele já chega renderizado do servidor; esse componente só decide
// se mostra o slot ou não, conforme a rota atual.
const ROTAS_SEM_SIDEBAR = ["/tarefas"];

export default function SidebarRightGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const esconder = ROTAS_SEM_SIDEBAR.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (esconder) return null;
  return <>{children}</>;
}
