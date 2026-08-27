-- ============================================================
-- Recordes curados ganham imagem e categoria (agrupamento) — pra dar pra
-- montar um "top N" manual (ex.: "Melhor comemoração da História: 1º Os
-- Vendedores, 2º Bar do Pix, 3º Pagode dos Subidos"), com foto no 1º
-- lugar, em vez de só uma lista solta de crônicas avulsas.
-- ============================================================

set search_path = public;

alter table recordes_curados add column if not exists imagem_url text;
alter table recordes_curados add column if not exists categoria text;

-- ---------- Storage: bucket público pras imagens de recordes curados ----------

insert into storage.buckets (id, name, public)
values ('recordes-curados', 'recordes-curados', true)
on conflict (id) do nothing;

create policy recordes_curados_midia_select on storage.objects for select
  using (bucket_id = 'recordes-curados');

create policy recordes_curados_midia_insert on storage.objects for insert
  with check (bucket_id = 'recordes-curados' and (storage.foldername(name))[1] = auth.uid()::text);

insert into schema_migrations (filename) values ('0050_recordes_curados_imagem_categoria.sql') on conflict do nothing;
