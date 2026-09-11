"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { FUNNEL_STAGES } from "@/lib/funil";
import { calcularConcessaoCampanha } from "@/lib/campanha-recompensas";

async function exigirLiderOuDiretor(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "lider" && profile?.role !== "diretor") {
    throw new Error("Só Líder ou Diretor podem gerenciar campanhas.");
  }
}

async function exigirDiretor(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "diretor") throw new Error("Só o Diretor pode conceder recompensa de campanha.");
}

// Lê tipo/valores de recompensa estruturada do form — mesmos 3 campos
// (sdr/closer/líder) tanto pra criar quanto editar (ver campanha-form.tsx).
function lerRecompensaEstruturada(formData: FormData) {
  const tipoRaw = String(formData.get("recompensa_tipo") ?? "").trim();
  const recompensaTipo = tipoRaw === "estrela" || tipoRaw === "dinheiro" ? tipoRaw : null;
  const requisitoRaw = String(formData.get("requisito_minimo_valor") ?? "").trim();
  return {
    recompensa_tipo: recompensaTipo,
    recompensa_valor_sdr: Number(String(formData.get("recompensa_valor_sdr") ?? "0").trim() || "0"),
    recompensa_valor_closer: Number(String(formData.get("recompensa_valor_closer") ?? "0").trim() || "0"),
    recompensa_valor_lider: Number(String(formData.get("recompensa_valor_lider") ?? "0").trim() || "0"),
    requisito_minimo_valor: requisitoRaw ? Number(requisitoRaw) : null,
  };
}

// Métrica "pontuacao" (migration 0063, pedido do Diretor, 2026-08-28:
// "entrevistas valerá uma pontuação e assinaturas outra") — lê um peso por
// etapa do formulário (peso_tentativas, peso_alos, ...) e monta o objeto
// { etapa: peso } só com quem tem peso > 0. null quando a métrica não é
// "pontuacao", pra limpar o campo se alguém trocar de volta editando.
function lerPesos(formData: FormData, metrica: string): Record<string, number> | null {
  if (metrica !== "pontuacao") return null;
  const pesos: Record<string, number> = {};
  for (const etapa of FUNNEL_STAGES) {
    const valor = Number(String(formData.get(`peso_${etapa}`) ?? "").trim());
    if (valor > 0) pesos[etapa] = valor;
  }
  if (Object.keys(pesos).length === 0) throw new Error("Pontuação precisa de pelo menos uma etapa com peso maior que 0.");
  return pesos;
}

export async function criarCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirLiderOuDiretor(supabase, user.id);

  const titulo = String(formData.get("titulo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const requisitosMinimos = String(formData.get("requisitos_minimos") ?? "").trim();
  const recompensa = String(formData.get("recompensa") ?? "").trim();
  const alvo = String(formData.get("alvo") ?? "geral");
  const metrica = String(formData.get("metrica") ?? "credito");
  const imagemPosicaoRaw = String(formData.get("imagem_posicao") ?? "center");
  const imagemPosicao = ["top", "center", "bottom"].includes(imagemPosicaoRaw) ? imagemPosicaoRaw : "center";
  const papelCreditoRaw = String(formData.get("papel_credito") ?? "total");
  const papelCredito = ["sdr", "closer", "total"].includes(papelCreditoRaw) ? papelCreditoRaw : "total";
  const metaValorRaw = String(formData.get("meta_valor") ?? "").trim();
  const dataInicio = String(formData.get("data_inicio") ?? "");
  const dataFim = String(formData.get("data_fim") ?? "");
  if (!titulo || !dataInicio || !dataFim) throw new Error("Título e período são obrigatórios.");
  const pesos = lerPesos(formData, metrica);
  const recompensaEstruturada = lerRecompensaEstruturada(formData);

  let imagemUrl: string | null = null;
  const imagem = formData.get("imagem") as File | null;
  if (imagem && imagem.size > 0) {
    const ext = imagem.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("campanhas").upload(path, imagem, { contentType: imagem.type });
    if (uploadError) throw new Error(uploadError.message);
    imagemUrl = supabase.storage.from("campanhas").getPublicUrl(path).data.publicUrl;
  }

  const { data: campanha, error } = await supabase
    .from("campanhas")
    .insert({
      titulo,
      descricao: descricao || null,
      requisitos_minimos: requisitosMinimos || null,
      recompensa: recompensa || null,
      imagem_url: imagemUrl,
      imagem_posicao: imagemPosicao,
      alvo,
      metrica,
      papel_credito: papelCredito,
      meta_valor: metaValorRaw ? Number(metaValorRaw) : null,
      data_inicio: dataInicio,
      data_fim: dataFim,
      pesos,
      created_by: user.id,
      ...recompensaEstruturada,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (alvo === "grupo_rank") {
    // Participante não é marcado pessoa por pessoa — é auto-populado por
    // Cargo (Legionário, Centurião...) na hora de criar. Ranking/progresso
    // depois disso é igual "individual" (ver membrosDe em lib/campanhas.ts).
    const ranks = formData.getAll("rank_participante").map((v) => String(v)).filter(Boolean);
    if (ranks.length > 0) {
      const { data: pessoasDoCargo } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["sdr", "closer", "lider"])
        .in("rank", ranks);
      const linhas = (pessoasDoCargo ?? []).map((p) => ({
        campanha_id: campanha.id,
        ref_id: p.id,
        label: p.full_name,
      }));
      if (linhas.length > 0) {
        const { error: partError } = await supabase.from("campanha_participantes").insert(linhas);
        if (partError) throw new Error(partError.message);
      }
    }
  } else if (alvo !== "geral") {
    const participantesRaw = formData.getAll("participante"); // "ref_id::label"
    const linhas = participantesRaw
      .map((v) => String(v))
      .filter(Boolean)
      .map((v) => {
        const [refId, ...labelParts] = v.split("::");
        return { campanha_id: campanha.id, ref_id: refId, label: labelParts.join("::") };
      });
    if (linhas.length > 0) {
      const { error: partError } = await supabase.from("campanha_participantes").insert(linhas);
      if (partError) throw new Error(partError.message);
    }
  }

  revalidatePath("/campanhas");
  revalidatePath("/");
}

// Edita os dados de uma campanha já criada — título, descrição,
// requisitos, recompensa, imagem, métrica/papel, meta e período. NÃO
// mexe em alvo/participantes de propósito: trocar quem duela no meio do
// mês seria confuso (se precisar mudar isso, é mais simples excluir e
// criar de novo).
export async function atualizarCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirLiderOuDiretor(supabase, user.id);

  const id = String(formData.get("id"));
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const requisitosMinimos = String(formData.get("requisitos_minimos") ?? "").trim();
  const recompensa = String(formData.get("recompensa") ?? "").trim();
  const metrica = String(formData.get("metrica") ?? "credito");
  const papelCreditoRaw = String(formData.get("papel_credito") ?? "total");
  const papelCredito = ["sdr", "closer", "total"].includes(papelCreditoRaw) ? papelCreditoRaw : "total";
  const imagemPosicaoRaw = String(formData.get("imagem_posicao") ?? "center");
  const imagemPosicao = ["top", "center", "bottom"].includes(imagemPosicaoRaw) ? imagemPosicaoRaw : "center";
  const metaValorRaw = String(formData.get("meta_valor") ?? "").trim();
  const dataInicio = String(formData.get("data_inicio") ?? "");
  const dataFim = String(formData.get("data_fim") ?? "");
  if (!id || !titulo || !dataInicio || !dataFim) throw new Error("Título e período são obrigatórios.");
  const pesos = lerPesos(formData, metrica);
  const recompensaEstruturada = lerRecompensaEstruturada(formData);

  const payload: Record<string, unknown> = {
    titulo,
    descricao: descricao || null,
    requisitos_minimos: requisitosMinimos || null,
    recompensa: recompensa || null,
    metrica,
    papel_credito: papelCredito,
    imagem_posicao: imagemPosicao,
    meta_valor: metaValorRaw ? Number(metaValorRaw) : null,
    data_inicio: dataInicio,
    data_fim: dataFim,
    pesos,
    ...recompensaEstruturada,
  };

  const imagem = formData.get("imagem") as File | null;
  if (imagem && imagem.size > 0) {
    const ext = imagem.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("campanhas").upload(path, imagem, { contentType: imagem.type });
    if (uploadError) throw new Error(uploadError.message);
    payload.imagem_url = supabase.storage.from("campanhas").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("campanhas").update(payload).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/campanhas");
  revalidatePath("/");
}

// Ajuste rápido pra campanha já criada com foto cortada errado — sem crop
// de verdade (arrastar/soltar), troca qual parte da foto fica visível.
export async function atualizarEnquadramentoCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirLiderOuDiretor(supabase, user.id);

  const id = String(formData.get("id"));
  const imagemPosicaoRaw = String(formData.get("imagem_posicao") ?? "center");
  const imagemPosicao = ["top", "center", "bottom"].includes(imagemPosicaoRaw) ? imagemPosicaoRaw : "center";

  const { error } = await supabase.from("campanhas").update({ imagem_posicao: imagemPosicao }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/campanhas");
  revalidatePath("/");
}

// Concede de fato a recompensa estruturada de uma campanha já encerrada —
// pedido do Diretor, 2026-09-11: "aparece botão para eu aprovar a
// concessão, então libero ou não". Recalcula tudo aqui de novo (nunca
// confia em valor vindo do form) pra evitar qualquer divergência entre o
// que foi mostrado na prévia e o que é de fato gravado.
export async function confirmarConcessaoCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirDiretor(supabase, user.id);

  const campanhaId = String(formData.get("campanha_id") ?? "");
  if (!campanhaId) throw new Error("Campanha inválida.");

  const { data: campanhaRow } = await supabase
    .from("campanhas")
    .select("id, data_fim, apurada_em, recompensa_tipo")
    .eq("id", campanhaId)
    .maybeSingle();
  if (!campanhaRow) throw new Error("Campanha não encontrada.");
  if (campanhaRow.apurada_em) throw new Error("Essa campanha já foi apurada.");
  if (!campanhaRow.recompensa_tipo) throw new Error("Essa campanha não tem recompensa estruturada configurada.");

  const resultado = await calcularConcessaoCampanha(supabase, campanhaId);
  if (!resultado || resultado.concessoes.length === 0) {
    throw new Error("Ninguém bateu o requisito mínimo — nada a conceder.");
  }

  const tipo = resultado.campanha.recompensaTipo!;
  const ano = Number(campanhaRow.data_fim.slice(0, 4));
  const mes = Number(campanhaRow.data_fim.slice(5, 7));

  for (const c of resultado.concessoes) {
    let despesaExtraId: string | null = null;

    if (tipo === "dinheiro") {
      const { data: despesa, error: despesaError } = await supabase
        .from("dre_despesas_extras")
        .insert({
          ano,
          mes,
          profile_id: c.profileId,
          valor: c.valor,
          descricao: `Recompensa campanha: ${resultado.campanha.titulo}`,
        })
        .select("id")
        .single();
      if (despesaError) throw new Error(despesaError.message);
      despesaExtraId = despesa.id;
    } else {
      const { data: pessoa } = await supabase.from("profiles").select("stars_total").eq("id", c.profileId).single();
      const novoTotal = Number(pessoa?.stars_total ?? 0) + c.valor;
      const { error: starsError } = await supabase.from("profiles").update({ stars_total: novoTotal }).eq("id", c.profileId);
      if (starsError) throw new Error(starsError.message);
    }

    const { error: ledgerError } = await supabase.from("campanha_recompensas").insert({
      campanha_id: campanhaId,
      profile_id: c.profileId,
      tipo,
      valor: c.valor,
      despesa_extra_id: despesaExtraId,
      concedido_por: user.id,
    });
    if (ledgerError) throw new Error(ledgerError.message);
  }

  const { error: marcarError } = await supabase
    .from("campanhas")
    .update({ apurada_em: new Date().toISOString(), apurada_por: user.id })
    .eq("id", campanhaId);
  if (marcarError) throw new Error(marcarError.message);

  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${campanhaId}/apurar`);
  revalidatePath("/dre");
  revalidatePath("/comissao");
}

export async function excluirCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirLiderOuDiretor(supabase, user.id);

  const id = String(formData.get("id"));
  const { error } = await supabase.from("campanhas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/campanhas");
  revalidatePath("/");
}
