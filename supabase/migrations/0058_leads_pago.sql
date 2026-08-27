-- ============================================================
-- Etapa "Pago" no funil de Meus Leads (pedido do Diretor, 2026-08-27):
-- "Quem foi assinado mas tá pago, mande pro pago" — o sync passa a
-- distinguir, pela aba Assinado, entre uma operação só assinada
-- (STATUS != PAGO) e uma já paga (STATUS = PAGO), e marca a etapa certa
-- sozinho (mesma lógica que já fazia pra "assinado", ver run.ts).
-- ============================================================

alter type lead_status_followup add value if not exists 'pago';

insert into schema_migrations (filename) values ('0058_leads_pago.sql')
on conflict (filename) do nothing;
