set search_path = public;

-- Forecast ganha uma 3ª visão ("Quedas do mês") além de Assinaturas/Pagos —
-- pra registrar POR QUE um CAIU/DESISTIU caiu, não só que caiu.
alter table weekly_operacoes add column if not exists motivo_queda text;
alter table weekly_operacoes add column if not exists motivo_queda_obs text;
alter table weekly_operacoes add column if not exists motivo_queda_por uuid references profiles(id);
alter table weekly_operacoes add column if not exists motivo_queda_em timestamptz;

alter table weekly_operacoes drop constraint if exists weekly_operacoes_motivo_queda_check;
alter table weekly_operacoes add constraint weekly_operacoes_motivo_queda_check
  check (motivo_queda is null or motivo_queda in (
    'desistencia', 'divida', 'vendido', 'curatelado', 'criminal', 'processual', 'outro'
  ));
