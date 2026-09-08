-- Dois ajustes pontuais pedidos pelo Diretor, 2026-09-08:
-- 1) Trilha de Pretor: tira as datas (hoje não tem nenhum Pretor ativo,
--    então essas datas não significam nada ainda) — e remove as
--    tarefas-lembrete (0071) que já tinham sido geradas pra essas aulas,
--    já que sem data não faz sentido ter lembrete.
-- 2) Trilha de Tribuno: a aula #1 (17/09) foi excluída — adianta todas as
--    aulas restantes 1 semana (fecha o buraco), renumera a ordem de volta
--    pra 1..11 (estava 2..12), e atualiza as tarefas-lembrete já geradas
--    pra essas aulas pra não ficarem com a data velha.
--
-- SQL Editor não tem sessão de Diretor logado (auth.uid() nulo), então o
-- gatilho trg_prevent_academy_aula_overreach bloquearia os UPDATEs em
-- academy_aulas — desliga pra essas operações e liga de volta em seguida
-- (mesmo padrão de 0070/0072).
alter table academy_aulas disable trigger trg_prevent_academy_aula_overreach;

delete from tasks
where origem_academy_aula_id in (
  select id from academy_aulas
  where trilha_id = (select id from academy_trilhas where nome = 'Pretor')
);

update academy_aulas
set data = null
where trilha_id = (select id from academy_trilhas where nome = 'Pretor');

update tasks
set due_date = (due_date - interval '7 days')::date
where origem_academy_aula_id in (
  select id from academy_aulas
  where trilha_id = (select id from academy_trilhas where nome = 'Tribuno')
);

update academy_aulas
set ordem = ordem - 1,
    data = (data - interval '7 days')::date
where trilha_id = (select id from academy_trilhas where nome = 'Tribuno');

alter table academy_aulas enable trigger trg_prevent_academy_aula_overreach;

insert into schema_migrations (filename) values ('0074_academy_ajustes_datas.sql')
on conflict (filename) do nothing;
