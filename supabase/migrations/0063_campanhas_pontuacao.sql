-- ============================================================
-- Métrica "Pontuação" pra campanhas/duelos (pedido do Diretor,
-- 2026-08-28): "Entrevistas valerá uma pontuação e assinaturas
-- outra, quem fizer mais pontos ganha" — soma ponderada de várias
-- etapas do funil num único placar, em vez de uma métrica só.
--
-- pesos guarda { "entrevistas": 2, "assinaturas": 10, ... } — chaves
-- são os mesmos valores de FUNNEL_STAGES (src/lib/funil.ts). null
-- pra campanhas que não usam esse modo (metrica != 'pontuacao').
-- ============================================================

alter table campanhas add column if not exists pesos jsonb;

insert into schema_migrations (filename) values ('0063_campanhas_pontuacao.sql')
on conflict (filename) do nothing;
