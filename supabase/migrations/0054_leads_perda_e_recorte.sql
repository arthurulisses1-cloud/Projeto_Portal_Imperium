-- ============================================================
-- "Meus Leads" vira mini-CRM de verdade (pedido do Diretor, 2026-08-27):
-- status "perdido" com motivo (catálogo editável, mesmo padrão de
-- marcos/campanhas — Diretor cadastra os motivos, aplicação usa a lista).
-- ============================================================

set search_path = public;

alter type lead_status_followup add value if not exists 'perdido';

create table motivos_perda_lead (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table motivos_perda_lead enable row level security;
create policy motivos_perda_lead_select on motivos_perda_lead for select using (true);
create policy motivos_perda_lead_write on motivos_perda_lead for all
  using (is_director()) with check (is_director());

alter table entrevistas_leads add column if not exists motivo_perda_id uuid references motivos_perda_lead(id);
alter table entrevistas_leads add column if not exists motivo_perda_obs text;

insert into schema_migrations (filename) values ('0054_leads_perda_e_recorte.sql') on conflict do nothing;
