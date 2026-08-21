-- "Top 1 da Tribo" (legionario_centuriao/tribuno_pretor/pretor_legado, bloco
-- 2/3) virou automático: checa se a pessoa teve o maior crédito PAGO
-- (weekly_operacoes.status='PAGO') da própria Tribo na janela de dias
-- corrida embutida no próprio texto ("válido 30/60 dias") — ver
-- avaliarCriterioAutomatico em src/lib/carreira.ts. `tipo` aqui é só
-- informativo (a UI decide automático vs. manual pelo retorno dessa função,
-- não por esta coluna), mas mantém o dado coerente.
update promotion_criteria
set tipo = 'auto'
where texto in (
  'Top 1 da Tribo por 1 mês (válido 60 dias)',
  'Top 1 da Tribo do mês (válido 60 dias)',
  'Top 1 da Tribo do mês (válido 30 dias)'
);

insert into schema_migrations (filename) values ('0033_top1_tribo_auto.sql')
on conflict (filename) do nothing;
