-- weekly_operacoes.data é a data de ASSINATURA (vem da coluna DATA da aba
-- Assinado) — nunca existiu um campo pra "quando ficou PAGO". Isso quebra
-- qualquer métrica de "pago ONTEM/hoje" (ex.: Central de Notificações):
-- filtrar por status='PAGO' e data=ontem só pega operação assinada E paga
-- no MESMO dia, que é raro — a maioria assina num dia e só fica PAGO dias
-- depois. Achado numa auditoria 2026-08-22 (Diretor reportou "tivemos uns
-- 3-4 pagos ontem" enquanto o painel mostrava zero).
alter table weekly_operacoes add column if not exists pago_em date;

-- Backfill best-effort pro histórico: não tem como saber retroativamente
-- QUANDO cada uma virou PAGO, então usa a data de assinatura como
-- aproximação só pra essas linhas antigas — daqui pra frente o sync grava
-- a data real da transição (ver src/lib/sync/run.ts).
update weekly_operacoes set pago_em = data where status = 'PAGO' and pago_em is null;

insert into schema_migrations (filename) values ('0041_weekly_operacoes_pago_em.sql')
on conflict (filename) do nothing;
