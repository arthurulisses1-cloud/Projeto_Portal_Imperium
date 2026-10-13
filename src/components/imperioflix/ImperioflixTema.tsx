"use client";

import { useLayoutEffect } from "react";

// Aplica o tema claro próprio da Imperioflix só enquanto uma tela dela está
// montada — sem mexer na preferência de tema do usuário. Ao sair, volta pro
// tema escolhido em localStorage (o mesmo que o script do layout raiz lê).
export default function ImperioflixTema() {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    raiz.setAttribute("data-theme", "imperioflix");
    return () => {
      let preferido: string | null = null;
      try {
        preferido = localStorage.getItem("imperium-theme");
      } catch {
        preferido = null;
      }
      if (preferido) raiz.setAttribute("data-theme", preferido);
      else raiz.removeAttribute("data-theme");
    };
  }, []);

  return null;
}
