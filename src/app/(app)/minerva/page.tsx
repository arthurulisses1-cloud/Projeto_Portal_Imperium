import { createClient } from "@/lib/supabase/server";
import { getViewerContext } from "@/lib/preview";
import MinervaChat from "@/components/minerva/MinervaChat";

export default async function MinervaPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Minerva</h1>
        <p className="text-sm italic text-stone-500">
          Pergunte sobre os dados do seu escopo — produção, funil, ranking, quem está zerado.
        </p>
      </div>

      <div className="mt-6">
        <MinervaChat />
      </div>
    </main>
  );
}
