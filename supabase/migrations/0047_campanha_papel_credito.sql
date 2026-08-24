-- Duas correções na métrica "Crédito (R$)" de campanhas (achado 2026-08-24,
-- Diretor reportou "Maximus x Templários não puxou o indicador certo"):
--
-- 1. A métrica lia da tabela `vendas`, filtrando por `data` (data de
--    ASSINATURA) — mesma classe de bug já corrigida em weekly_operacoes
--    com `pago_em` (migration 0041). Uma venda assinada em julho e paga em
--    agosto contava pra campanha de julho, não a de agosto.
-- 2. `vendas` tem uma linha PARA CADA papel (SDR e Closer separados) —
--    somar todo mundo de um Tribo/Exército/"geral" contava a MESMA venda
--    duas vezes sempre que o SDR e o Closer eram do mesmo time (quase
--    sempre). Corrigido: passa a ler de weekly_operacoes (uma linha por
--    operação) com regra de dono = time do Closer, SDR como fallback —
--    mesma convenção já usada em guerra.ts/forecast/weekly.
--
-- papel_credito só importa pra duelo entre PESSOAS (individual/grupo_rank)
-- — deixa escolher se conta só produção como SDR, só como Closer, ou as
-- duas sem duplicar (pedido explícito: "pago como closer e pago como sdr
-- são coisas diferentes para os tribunos").
alter table campanhas add column if not exists papel_credito text not null default 'total'
  check (papel_credito in ('sdr', 'closer', 'total'));

insert into schema_migrations (filename) values ('0047_campanha_papel_credito.sql')
on conflict (filename) do nothing;
