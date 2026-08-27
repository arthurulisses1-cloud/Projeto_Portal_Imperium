-- ============================================================
-- Qualificação obrigatória pra avançar um lead (pedido do Diretor,
-- 2026-08-27): "lead só pode entrar em Fechamento ou Subido se for
-- preenchido: Forecast (Frio/Morno/Quente) e Valor do Crédito". A
-- validação de verdade fica no server action (salvarStatusLead, em
-- src/app/(app)/leads/actions.ts) — essas colunas só guardam o dado.
--
-- Também fecha o loop com a aba Assinado: quando o sync encontra uma
-- assinatura confirmada pra um lead (por SDR+Closer+nome do cliente),
-- ele mesmo marca status_followup='assinado', temperatura='quente' e
-- valor_credito com o valor da planilha — sem precisar de ação manual
-- do Closer (ver src/lib/sync/run.ts).
-- ============================================================

do $$ begin
  create type lead_temperatura as enum ('frio', 'morno', 'quente');
exception when duplicate_object then null;
end $$;

alter table entrevistas_leads add column if not exists temperatura lead_temperatura;
alter table entrevistas_leads add column if not exists valor_credito numeric(12, 2);

insert into schema_migrations (filename) values ('0057_leads_qualificacao.sql')
on conflict (filename) do nothing;
