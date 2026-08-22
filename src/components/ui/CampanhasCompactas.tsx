import { createClient } from "@/lib/supabase/server";
import { buscarCampanhasAtivas } from "@/lib/campanhas";
import { IconFlame } from "./icons";

// Prévia compacta das campanhas ativas, na sidebar esquerda, igual
// NoticiasCompactas — a versão completa (com progresso) fica no Mural.
export default async function CampanhasCompactas() {
  const supabase = await createClient();
  const campanhas = await buscarCampanhasAtivas(supabase);

  if (campanhas.length === 0) return null;

  return (
    <div className="border-b border-imperium-line px-4 pb-4">
      <p className="kicker mb-2 px-2">Campanhas</p>
      <ul className="space-y-1.5">
        {campanhas.map((c) => (
          <li key={c.id}>
            <a
              href={`/#campanha-${c.id}`}
              className="flex items-start gap-1.5 rounded px-2 py-1 text-xs text-stone-400 transition hover:bg-imperium-raised hover:text-gold-bright"
            >
              <span className="mt-0.5 shrink-0 text-gold-dim">
                <IconFlame className="h-3.5 w-3.5" />
              </span>
              <span className="line-clamp-2">{c.titulo}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
