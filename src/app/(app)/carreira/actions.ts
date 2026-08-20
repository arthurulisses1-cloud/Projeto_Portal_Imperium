"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function registrarMetaPessoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const nivelAlvo = String(formData.get("nivel_alvo"));
  const dataAlvo = String(formData.get("data_alvo"));

  const { error } = await supabase.from("metas_pessoais").insert({
    profile_id: user.id,
    nivel_alvo: nivelAlvo,
    data_alvo: dataAlvo,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/carreira");
}

export async function escolherLivro(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const livroId = String(formData.get("livro_id"));

  const { error } = await supabase.from("biblioteca_escolhas").insert({
    profile_id: user.id,
    livro_id: livroId,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/carreira");
}

export async function marcarApresentado(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const escolhaId = String(formData.get("escolha_id"));

  const { error } = await supabase
    .from("biblioteca_escolhas")
    .update({ apresentado: true, apresentado_em: new Date().toISOString() })
    .eq("id", escolhaId)
    .eq("profile_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/carreira");
}

// Critérios que o sistema não consegue verificar sozinho (ex.: "Top 1 na
// live nacional", avaliação do líder, aulas da trilha) — o executivo
// solicita, com uma evidência opcional, e o Diretor aprova/rejeita em
// /validacao. Reenviar depois de um "rejeitado" cria uma NOVA solicitação
// (a antiga fica no histórico) em vez de tentar editar a rejeitada.
export async function solicitarEvidencia(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const criterioId = String(formData.get("criterio_id"));
  const valorAtual = String(formData.get("valor_atual") ?? "").trim();
  const evidenciaUrl = String(formData.get("evidencia_url") ?? "").trim();

  const { error } = await supabase.from("promotion_evidence").insert({
    profile_id: user.id,
    criterio_id: criterioId,
    valor_atual: valorAtual || null,
    evidencia_url: evidenciaUrl || null,
    registrado_por: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/carreira");
}

// Pedido final "estou pronto pra promoção" — separado da evidência por
// critério, é o "toca o sino" quando todos os blocos já estão OK.
export async function solicitarPromocao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const transicao = String(formData.get("transicao"));

  const { error } = await supabase.from("promotion_requests").insert({
    profile_id: user.id,
    transicao,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/carreira");
}
