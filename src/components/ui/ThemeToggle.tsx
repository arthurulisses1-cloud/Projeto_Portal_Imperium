"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [tema, setTema] = useState<"roma" | "claro">("roma");

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme");
    setTema(atual === "claro" ? "claro" : "roma");
  }, []);

  function trocar(novo: "roma" | "claro") {
    setTema(novo);
    document.documentElement.setAttribute("data-theme", novo);
    localStorage.setItem("imperium-theme", novo);
  }

  return (
    <div className="flex items-center rounded-full border border-imperium-line text-[10px] uppercase tracking-wide">
      <button
        onClick={() => trocar("roma")}
        className={`rounded-full px-2.5 py-1 transition ${
          tema === "roma" ? "bg-wine text-stone-100" : "text-stone-500 hover:text-stone-300"
        }`}
      >
        Roma
      </button>
      <button
        onClick={() => trocar("claro")}
        className={`rounded-full px-2.5 py-1 transition ${
          tema === "claro" ? "bg-gold text-imperium-bg" : "text-stone-500 hover:text-stone-300"
        }`}
      >
        Claro
      </button>
    </div>
  );
}
