-- Pré-popula a data de cada aula sem data ainda, começando na PRÓXIMA
-- ocorrência do dia da semana da trilha depois da semana atual (nunca essa
-- semana, mesmo que hoje seja o dia certo) — pedido do Diretor, 2026-09-07:
-- "já é pra estar pré-setadas as datas com a formação iniciando próxima
-- semana". Cada aula seguinte da mesma trilha cai 7 dias depois da anterior,
-- pela ordem.
update academy_aulas aa
set data = (
  select (
    current_date
    + (((t.dia_semana - extract(dow from current_date)::int) + 7) % 7)
    + 7
    + (aa.ordem - 1) * 7
  )::date
  from academy_trilhas t
  where t.id = aa.trilha_id
)
where aa.data is null;

insert into schema_migrations (filename) values ('0070_academy_datas_iniciais.sql')
on conflict (filename) do nothing;
