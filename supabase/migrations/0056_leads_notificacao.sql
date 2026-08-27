-- ============================================================
-- Bolinha vermelha em "Meus Leads" quando chega entrevista nova
-- (pedido do Diretor, 2026-08-27) — mesmo padrão do Mural
-- (mural_visto_em / temNovidadeMural em pendencias.ts): guarda só "a
-- última vez que essa pessoa abriu a aba" e compara com o lead mais
-- recente que ela pode ver (RLS de entrevistas_leads já escopa certo).
--
-- `criado_em` é a peça nova: `synced_at` já existe mas é reescrito em
-- TODO sync (upsert sempre manda synced_at = now()), então não serve
-- pra saber se um lead é novo ou só foi re-sincronizado. `criado_em`
-- fica de fora do payload de upsert em run.ts de propósito — o
-- default now() só entra em vigor no INSERT (linha nova), e o
-- ON CONFLICT DO UPDATE não toca numa coluna que não foi enviada, então
-- o valor original nunca muda depois de gravado uma vez.
-- ============================================================

alter table entrevistas_leads add column if not exists criado_em timestamptz not null default now();
alter table profiles add column if not exists leads_visto_em timestamptz;

insert into schema_migrations (filename) values ('0056_leads_notificacao.sql')
on conflict (filename) do nothing;
