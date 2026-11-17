-- ============================================================
-- Vorp Finance: leads de entrevista com funil próprio (2026-11-17).
-- Entrevista -> Subido -> Resolvendo pendência -> Venda (aguardando aprovação do
-- Head/Diretor -> venda efetiva em `vendas`). O consultor preenche um formulário
-- ao subir (dados da proposta + anexo) e outro ao pedir a venda.
-- ============================================================
set search_path = public;

-- Novas etapas do funil do Finance.
alter type lead_status_followup add value if not exists 'resolvendo_pendencia';
alter type lead_status_followup add value if not exists 'venda_pendente';
alter type lead_status_followup add value if not exists 'venda_aprovada';

alter table entrevistas_leads
  add column if not exists negocio_id uuid references negocios(id),
  -- novos campos do formulário de entrevista
  add column if not exists tipo_precatorio text,
  add column if not exists fundo_destino text,
  -- formulário de Subido
  add column if not exists sub_valor_precatorio numeric check (sub_valor_precatorio is null or sub_valor_precatorio > 0),
  add column if not exists sub_valor_proposta numeric check (sub_valor_proposta is null or sub_valor_proposta > 0),
  add column if not exists sub_comissao_prevista numeric check (sub_comissao_prevista is null or sub_comissao_prevista > 0),
  add column if not exists sub_mesmo_fundo boolean,
  add column if not exists sub_fundo_novo text,
  add column if not exists sub_anexo_path text,
  -- formulário de Venda (aguardando aprovação)
  add column if not exists venda_valor_recebido numeric check (venda_valor_recebido is null or venda_valor_recebido > 0),
  add column if not exists venda_valor_cliente numeric check (venda_valor_cliente is null or venda_valor_cliente > 0),
  add column if not exists venda_data date,
  add column if not exists venda_obs text,
  add column if not exists venda_enviada_em timestamptz,
  add column if not exists venda_enviada_por uuid references profiles(id),
  add column if not exists venda_aprovada_em timestamptz,
  add column if not exists venda_aprovada_por uuid references profiles(id),
  add column if not exists venda_recusa_motivo text,
  add column if not exists venda_id uuid references vendas(id) on delete set null;

create index if not exists entrevistas_leads_negocio_idx on entrevistas_leads (negocio_id, data);

-- O Head do negócio enxerga e movimenta os leads do próprio negócio
-- (as policies abaixo se somam às de 0053: permissivas = OR).
drop policy if exists entrevistas_leads_select_head on entrevistas_leads;
create policy entrevistas_leads_select_head on entrevistas_leads for select
  using (negocio_id is not null and is_head_do_negocio(negocio_id));

drop policy if exists entrevistas_leads_update_head on entrevistas_leads;
create policy entrevistas_leads_update_head on entrevistas_leads for update
  using (negocio_id is not null and is_head_do_negocio(negocio_id));

-- Anexos das propostas (privado; acesso por URL assinada).
insert into storage.buckets (id, name, public)
values ('leads-anexos', 'leads-anexos', false)
on conflict (id) do nothing;

drop policy if exists leads_anexos_select on storage.objects;
create policy leads_anexos_select on storage.objects for select to authenticated
  using (bucket_id = 'leads-anexos');

drop policy if exists leads_anexos_insert on storage.objects;
create policy leads_anexos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'leads-anexos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists leads_anexos_delete on storage.objects;
create policy leads_anexos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'leads-anexos' and (storage.foldername(name))[1] = auth.uid()::text);

insert into schema_migrations (filename) values ('0113_leads_finance.sql') on conflict (filename) do nothing;
