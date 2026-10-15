set search_path = public;

-- Ajuste de dados — Diretor, 2026-10-15: no HGV do Legionário → Centurião, a
-- média exigida cai de 1,5 para 1 entrevista/dia (30 dias). Idempotente.
update promotion_criteria set texto = 'Média de 1 entrevista/dia por 30 dias', target_value = 1
  where transicao = 'legionario_centuriao' and texto ~* 'entrevistas/dia';

insert into schema_migrations (filename) values ('0094_hgv_legionario_1_entrevista.sql')
on conflict (filename) do nothing;
