-- ============================================================
-- Analista com permissão de edição na área "Meus Leads" pode movimentar os leads (2026-11-18).
-- A leitura já existia (0080); aqui entra o update, respeitando analista_permissoes.pode_editar.
-- ============================================================
set search_path = public;

create or replace function analista_pode_editar(area_alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pode_editar from analista_permissoes where profile_id = auth.uid() and area = area_alvo),
    false
  );
$$;

drop policy if exists entrevistas_leads_update_analista on entrevistas_leads;
create policy entrevistas_leads_update_analista on entrevistas_leads for update
  using (is_analista() and analista_pode_editar('leads'));

insert into schema_migrations (filename) values ('0114_analista_edita_leads.sql') on conflict (filename) do nothing;
