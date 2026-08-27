"use client";

import { useLayoutEffect } from "react";

// Pedido do Diretor (2026-08-27): o Kanban fica mais visível no tema
// claro, e deve abrir assim por padrão — sem mudar a preferência global
// do usuário (não mexe no localStorage), só enquanto essa página está
// montada. `useLayoutEffect` (não `useEffect`) pra trocar antes do
// navegador pintar a tela, evitando o flash do tema anterior.
export default function ForcarTemaClaro() {
  useLayoutEffect(() => {
    const anterior = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "claro");
    return () => {
      if (anterior) document.documentElement.setAttribute("data-theme", anterior);
      else document.documentElement.removeAttribute("data-theme");
    };
  }, []);

  return null;
}
