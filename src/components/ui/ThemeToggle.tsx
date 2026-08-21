"use client";

import { useEffect, useState } from "react";

type Tema = "roma" | "claro" | "imperio";

const OPCOES: { valor: Tema; label: string; ativo: string }[] = [
  { valor: "roma", label: "Roma", ativo: "bg-wine text-stone-100" },
  { valor: "claro", label: "Claro", ativo: "bg-gold text-imperium-bg" },
  { valor: "imperio", label: "Império", ativo: "bg-purpura text-stone-100" },
];

export default function ThemeToggle() {
  const [tema, setTema] = useState<Tema>("roma");

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme");
    setTema(atual === "claro" ? "claro" : atual === "imperio" ? "imperio" : "roma");
  }, []);

  function trocar(novo: Tema) {
    setTema(novo);
    document.documentElement.setAttribute("data-theme", novo);
    localStorage.setItem("imperium-theme", novo);
  }

  return (
    <div className="flex items-center rounded-full border border-imperium-line text-[10px] uppercase tracking-wide">
      {OPCOES.map((o) => (
        <button
          key={o.valor}
          onClick={() => trocar(o.valor)}
          className={`rounded-full px-2.5 py-1 transition ${
            tema === o.valor ? o.ativo : "text-stone-500 hover:text-stone-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
