"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { resolverEscopo } from "@/lib/minerva/scope";
import { MINERVA_TOOLS, executarFerramenta, type MinervaToolName } from "@/lib/minerva/tools";

export type MensagemChat = { papel: "user" | "assistant"; texto: string };

const SYSTEM_PROMPT = `Você é Minerva, a assistente de dados do Portal Imperium (Senatus) — o cérebro que lê os números do app pra dar insight rápido pra quem pergunta.

Regras:
- Responda em português, direto e objetivo — nada de rodeio ou disclaimer.
- Use as ferramentas pra buscar dado real antes de responder qualquer pergunta sobre números, pessoas ou desempenho. NUNCA invente ou estime um número sem antes chamar uma ferramenta.
- Se uma ferramenta retornar erro (ex.: nome ambíguo, pessoa não encontrada), explique o problema pra quem perguntou em vez de adivinhar.
- Se a pergunta pedir algo fora do que as ferramentas cobrem, diga claramente que não tem esse dado disponível — não invente.
- Seja econômica: só chame mais de uma ferramenta se a pergunta realmente precisar.
- Formatação: respostas curtas em texto corrido ou lista simples, sem markdown pesado (sem tabelas).`;

export async function perguntarMinerva(
  historico: MensagemChat[],
  pergunta: string
): Promise<{ resposta: string } | { erro: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { erro: "A Minerva ainda não foi configurada — falta a ANTHROPIC_API_KEY nas variáveis de ambiente." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return { erro: "Perfil não encontrado." };

  const escopo = await resolverEscopo(supabase, user.id, profile.role);

  const anthropic = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...historico.map((m) => ({ role: m.papel, content: m.texto }) as Anthropic.MessageParam),
    { role: "user" as const, content: pergunta },
  ];

  // Loop de tool-use limitado — evita a Minerva ficar chamando ferramenta
  // pra sempre num caso de borda (ex.: nome ambíguo repetido).
  for (let rodada = 0; rodada < 6; rodada++) {
    let resposta;
    try {
      resposta = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: MINERVA_TOOLS as unknown as Anthropic.Tool[],
        messages,
      });
    } catch (e) {
      return { erro: e instanceof Error ? `Erro ao falar com a Minerva: ${e.message}` : "Erro ao falar com a Minerva." };
    }

    if (resposta.stop_reason !== "tool_use") {
      const texto = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { resposta: texto || "Não consegui formular uma resposta." };
    }

    messages.push({ role: "assistant", content: resposta.content });

    const blocosFerramenta = resposta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloco of blocosFerramenta) {
      let resultado: unknown;
      try {
        resultado = await executarFerramenta(
          supabase,
          escopo,
          bloco.name as MinervaToolName,
          bloco.input as Record<string, unknown>
        );
      } catch (e) {
        resultado = { erro: e instanceof Error ? e.message : "Erro ao executar a ferramenta." };
      }
      resultados.push({
        type: "tool_result",
        tool_use_id: bloco.id,
        content: JSON.stringify(resultado),
      });
    }
    messages.push({ role: "user", content: resultados });
  }

  return { erro: "A Minerva precisou de tempo demais pra responder — tenta reformular a pergunta." };
}
