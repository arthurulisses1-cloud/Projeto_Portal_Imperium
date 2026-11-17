-- ============================================================
-- A planilha (/api/sync) já tinha outro agendador chamando de 30 em 30 min;
-- o job "sync-planilha" da 0111 fazia ela rodar duas vezes por horário
-- (visto no sync_log em 2026-11-15 às 22:30 UTC). Fica só o das integrações.
-- ============================================================
select cron.unschedule(jobid) from cron.job where jobname = 'sync-planilha';

insert into schema_migrations (filename) values ('0112_remover_agendamento_planilha_duplicado.sql') on conflict (filename) do nothing;
