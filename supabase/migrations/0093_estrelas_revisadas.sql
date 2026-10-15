set search_path = public;

-- Ajuste de dados (não é mudança de schema) — revisão do plano de carreira
-- pelo Diretor, 2026-10-15: menos estrelas para subir (Tribuno 8→6, Pretor
-- 10→8, Legado 12→10). O ritmo semanal e a remoção da perda mensal vivem em
-- src/lib/carreira.ts (STAR_PACE / PERDA_MENSAL). Idempotente.
update promotion_criteria set texto = '6 estrelas acumuladas', target_value = 6
  where transicao = 'centuriao_tribuno' and texto ~* 'estrelas acumuladas';
update promotion_criteria set texto = '8 estrelas acumuladas', target_value = 8
  where transicao = 'tribuno_pretor' and texto ~* 'estrelas acumuladas';
update promotion_criteria set texto = '10 estrelas acumuladas', target_value = 10
  where transicao = 'pretor_legado' and texto ~* 'estrelas acumuladas';

insert into schema_migrations (filename) values ('0093_estrelas_revisadas.sql')
on conflict (filename) do nothing;
