-- Backfill: gera as tarefas-lembrete (0071) pras aulas que já tinham data
-- marcada ANTES da ligação com Tasks existir (0070 rodou puro SQL, sem
-- passar por sincronizarTasksDaAula). Dali pra frente o app já mantém isso
-- sozinho a cada criarAula/atualizarAula/definirDatasEmLote. Só insere em
-- `tasks` — não toca academy_aulas, então o gatilho de overreach nem entra
-- em jogo aqui.

-- Instrutor de cada aula com data e instrutor definidos.
insert into tasks (profile_id, titulo, due_date, due_time, coluna, prioridade, tags, origem_academy_aula_id)
select
  aa.instrutor_id,
  'Ministrar: ' || aa.tema || ' (' || t.nome || ')',
  aa.data,
  t.hora_inicio::time,
  'afazer',
  'alta',
  array['academy'],
  aa.id
from academy_aulas aa
join academy_trilhas t on t.id = aa.trilha_id
where aa.data is not null
  and aa.instrutor_id is not null
  and not exists (select 1 from tasks tk where tk.origem_academy_aula_id = aa.id and tk.profile_id = aa.instrutor_id);

-- Audiência da trilha (rank correspondente) ou da Arena (sdr/closer ativos).
insert into tasks (profile_id, titulo, due_date, due_time, coluna, prioridade, tags, origem_academy_aula_id)
select
  p.id,
  'Aula da Imperium Academy: ' || aa.tema || ' (' || t.nome || ')',
  aa.data,
  t.hora_inicio::time,
  'afazer',
  'normal',
  array['academy'],
  aa.id
from academy_aulas aa
join academy_trilhas t on t.id = aa.trilha_id
join profiles p on p.ativo = true
  and (
    (t.tipo = 'arena' and p.role in ('sdr', 'closer'))
    or (t.tipo <> 'arena' and p.rank = t.rank)
  )
where aa.data is not null
  and p.id <> coalesce(aa.instrutor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  and not exists (select 1 from tasks tk where tk.origem_academy_aula_id = aa.id and tk.profile_id = p.id);

insert into schema_migrations (filename) values ('0072_academy_tasks_backfill.sql')
on conflict (filename) do nothing;
