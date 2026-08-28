-- ============================================================
-- Catálogo inicial de motivos de perda por etapa (pedido do Diretor,
-- 2026-08-28) — compilado dos manuais ICP & Anti-ICP do Requerente e
-- do Advogado (Imperium Academy). Universais (etapa null) cobrem os
-- "padrão" citados pelo Diretor (parou de responder, fechou com
-- concorrente, recusou proposta); o resto é específico de cada
-- etapa, com destaque pro corte pedido: tudo que só sai no KYC/
-- análise jurídica (dívidas, penhora, antecedentes, curatela,
-- homônimo) entra em "Subido", que é onde o compliance roda.
-- ============================================================

insert into motivos_perda_lead (nome, etapa, ordem) values
  -- Universais
  ('Parou de responder / sumiu', null, 10),
  ('Fechou com concorrente', null, 20),
  ('Recusou a proposta / condições', null, 30),
  ('Engano / não tinha interesse real', null, 40),
  ('Óbito do requerente', null, 50),

  -- Validação de Entrevista — Ativo não bate no crivo verbal
  ('Precatório estadual/municipal (fora do ICP)', 'validacao_entrevista', 100),
  ('Sem ofício requisitório expedido/transmitido', 'validacao_entrevista', 110),
  ('Processo sem trânsito em julgado', 'validacao_entrevista', 120),
  ('Natureza não-alimentar (compensatório/indenizatório)', 'validacao_entrevista', 130),
  ('INCRA, desapropriação ou Anistia', 'validacao_entrevista', 140),
  ('RPV ou direito creditório em geral (não é precatório)', 'validacao_entrevista', 150),
  ('TRF4 fora do escopo (não é INSS de SC/RS/PR)', 'validacao_entrevista', 160),
  ('Valor abaixo do piso operacional', 'validacao_entrevista', 170),
  ('Requerente menor de idade', 'validacao_entrevista', 180),
  ('Dado de contato errado / não existe', 'validacao_entrevista', 190),

  -- Entrevista Validada — trava antes de entrar em negociação de verdade
  ('Sem urgência agora (vai esperar o pagamento natural)', 'entrevista_validada', 200),
  ('Cônjuge ou anuente não autorizou', 'entrevista_validada', 210),
  ('Advogado barrou a operação (modo Obstáculo)', 'entrevista_validada', 220),

  -- Fechamento — negociação ativa, mas não avança pra documentação
  ('Achou o % baixo / quer acima do teto vigente', 'fechamento', 300),
  ('Família/cônjuge não concordou na call', 'fechamento', 310),
  ('Advogado não autorizou mesmo após esclarecimento', 'fechamento', 320),
  ('Não conseguiu reunir documentação básica', 'fechamento', 330),

  -- Subido — só sai no KYC / análise jurídica
  ('Dívidas que comprometem o valor do crédito', 'subido', 400),
  ('Risco de penhora (crédito ou bens)', 'subido', 410),
  ('Antecedentes criminais', 'subido', 420),
  ('Homônimo (risco de troca documental)', 'subido', 430),
  ('Curatela / incapacidade civil', 'subido', 440),
  ('Ativo reprovado na análise jurídica', 'subido', 450),
  ('Documentação incompleta, cliente não enviou', 'subido', 460),
  ('Reprovado no compliance', 'subido', 470),

  -- CCB Enviada — contrato pronto, pendência de assinatura/resolução
  ('Não assinou a CCB', 'ccb_enviada', 500),
  ('Pendência de escritura pública não resolvida', 'ccb_enviada', 510),
  ('Pendência documental descoberta após CCB', 'ccb_enviada', 520),
  ('Desistiu na reta final', 'ccb_enviada', 530),

  -- Assinado — travou antes de virar pago
  ('Pendência jurídica tardia inviabilizou o pagamento', 'assinado', 600),
  ('Arrependimento / cancelamento pós-assinatura', 'assinado', 610),
  ('Falecimento do requerente sem sucessão resolvida', 'assinado', 620),
  ('Erro cartorial/registral', 'assinado', 630);

insert into schema_migrations (filename) values ('0060_seed_motivos_perda.sql')
on conflict (filename) do nothing;
