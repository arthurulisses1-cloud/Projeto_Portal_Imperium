import { createClient } from "@/lib/supabase/server";
import { IconHorn, IconBallot, IconMedal } from "./icons";

// Prévia compacta de avisos/reconhecimentos, na sidebar esquerda logo
// abaixo da logo. A versão completa fica no Mural.
export default async function NoticiasCompactas() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("mural_posts")
    .select("id, tipo, titulo")
    .order("created_at", { ascending: false })
    .limit(3);

  if (!posts || posts.length === 0) return null;

  return (
    <div className="border-b border-imperium-line px-4 pb-4">
      <p className="kicker mb-2 px-2">Notícias</p>
      <ul className="space-y-1.5">
        {posts.map((p) => (
          <li key={p.id}>
            <a
              href={`/#post-${p.id}`}
              className="flex items-start gap-1.5 rounded px-2 py-1 text-xs text-stone-400 transition hover:bg-imperium-raised hover:text-gold-bright"
            >
              <span className="mt-0.5 shrink-0 text-gold-dim">
                {p.tipo === "aviso" ? (
                  <IconHorn className="h-3.5 w-3.5" />
                ) : p.tipo === "enquete" ? (
                  <IconBallot className="h-3.5 w-3.5" />
                ) : (
                  <IconMedal className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="line-clamp-2">{p.titulo}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
