-- ============================================================
-- Fixos por negócio e dados de contrato da Vorp (Diretor, 2026-11-05).
--  - profile_negocios.fixo: salário fixo mensal da pessoa naquele negócio (pago dia 5);
--  - vendas.mrr / valor_total_contrato / valor_antecipado: a Vorp sempre lança os três;
--    o teto de 3 meses de comissão é ligado ao valor antecipado (3 x MRR);
--  - vendas.primeiro_contrato: só o 1º contrato do cliente paga comissão.
-- ============================================================
set search_path = public;

alter table profile_negocios add column if not exists fixo numeric;
alter table vendas add column if not exists mrr numeric;
alter table vendas add column if not exists valor_total_contrato numeric;
alter table vendas add column if not exists valor_antecipado numeric;
alter table vendas add column if not exists primeiro_contrato boolean not null default true;

-- Os valores dos fixos NÃO ficam no repositório: rode supabase/privado/0103b_fixos.sql (arquivo local, fora do git).

insert into schema_migrations (filename) values ('0103_fixos_e_contrato_vorp.sql') on conflict (filename) do nothing;
