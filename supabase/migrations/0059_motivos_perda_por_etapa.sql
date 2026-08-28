-- ============================================================
-- Motivos de perda específicos por etapa (pedido do Diretor,
-- 2026-08-28): na hora de marcar um lead como Perdido, primeiro
-- escolhe de qual etapa ele saiu, e só então vê (e marca) os motivos
-- cadastrados pra ESSA etapa.
--
-- Reaproveita o enum lead_status_followup (migration 0055/0058) pra
-- essas duas colunas em vez de texto livre — garante que só entra
-- etapa de verdade, e a validação de "quais etapas fazem sentido pra
-- perder" (a app não deixa escolher 'perdido'/'pago') fica no server
-- action, mesmo padrão que STATUS_VALIDOS já usa em actions.ts.
--
-- etapa = null em motivos_perda_lead quer dizer "motivo universal,
-- aparece em qualquer etapa" (ex.: "Sumiu, não retorna contato") — não
-- todo motivo precisa ser específico.
-- ============================================================

alter table motivos_perda_lead add column if not exists etapa lead_status_followup;
alter table entrevistas_leads add column if not exists motivo_perda_etapa lead_status_followup;

insert into schema_migrations (filename) values ('0059_motivos_perda_por_etapa.sql')
on conflict (filename) do nothing;
