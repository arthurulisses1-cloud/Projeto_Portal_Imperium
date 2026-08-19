-- ============================================================
-- Campanhas do mês: o Diretor cria campanhas livres (meta geral
-- ou duelo entre pessoas/Tribos/Exércitos), com prazo e métrica
-- configuráveis. Aparecem no Mural pra todo mundo acompanhar.
-- ============================================================

set search_path = public;

create type campanha_alvo as enum ('geral', 'individual', 'tribo', 'exercito');

create table campanhas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  imagem_url text,
  alvo campanha_alvo not null default 'geral',
  metrica text not null default 'credito', -- 'credito' ou uma etapa de funil_etapa
  meta_valor numeric,
  data_inicio date not null,
  data_fim date not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table campanha_participantes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanhas(id) on delete cascade,
  ref_id uuid not null,
  label text not null
);

alter table campanhas enable row level security;
alter table campanha_participantes enable row level security;

create policy campanhas_select on campanhas for select using (true);
create policy campanhas_write on campanhas for all using (is_director()) with check (is_director());

create policy campanha_participantes_select on campanha_participantes for select using (true);
create policy campanha_participantes_write on campanha_participantes for all using (is_director()) with check (is_director());

-- ---------- Storage: bucket público pras imagens de Campanha ----------

insert into storage.buckets (id, name, public)
values ('campanhas', 'campanhas', true)
on conflict (id) do nothing;

create policy campanhas_midia_select on storage.objects for select
  using (bucket_id = 'campanhas');

create policy campanhas_midia_insert on storage.objects for insert
  with check (bucket_id = 'campanhas' and (storage.foldername(name))[1] = auth.uid()::text);
