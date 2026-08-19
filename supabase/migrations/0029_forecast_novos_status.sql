set search_path = public;

-- Forecast (Assinaturas): dois novos status manuais além de Resolvendo
-- Pendência / Aguardando Pagamento.
alter table weekly_operacoes drop constraint if exists weekly_operacoes_status_manual_check;
alter table weekly_operacoes add constraint weekly_operacoes_status_manual_check
  check (status_manual is null or status_manual in (
    'resolvendo_pendencia', 'aguardando_pagamento', 'analise_juridico', 'esfriou'
  ));

-- Forecast (Quedas): "Honorários" como motivo de queda comum, sem exigir
-- observação (ao contrário de Desistência/Outro).
alter table weekly_operacoes drop constraint if exists weekly_operacoes_motivo_queda_check;
alter table weekly_operacoes add constraint weekly_operacoes_motivo_queda_check
  check (motivo_queda is null or motivo_queda in (
    'desistencia', 'divida', 'vendido', 'curatelado', 'criminal', 'processual', 'honorarios', 'outro'
  ));
