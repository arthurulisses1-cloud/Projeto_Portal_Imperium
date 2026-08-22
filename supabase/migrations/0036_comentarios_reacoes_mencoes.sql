-- Comentários + reações + @menções, compartilhado entre posts do Mural
-- (avisos/reconhecimentos/enquetes) e Campanhas — um "alvo_tipo" genérico
-- em vez de duplicar 3 tabelas por tipo de post.

create type post_alvo_tipo as enum ('mural_post', 'campanha');

create table post_comentarios (
  id uuid primary key default gen_random_uuid(),
  alvo_tipo post_alvo_tipo not null,
  alvo_id uuid not null,
  autor_id uuid not null references profiles(id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now()
);
create index idx_post_comentarios_alvo on post_comentarios (alvo_tipo, alvo_id, created_at);

create table post_reacoes (
  id uuid primary key default gen_random_uuid(),
  alvo_tipo post_alvo_tipo not null,
  alvo_id uuid not null,
  profile_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (alvo_tipo, alvo_id, profile_id)
);
create index idx_post_reacoes_alvo on post_reacoes (alvo_tipo, alvo_id);

-- Quem foi @marcado num comentário — dirige o sininho de notificação.
create table post_mencoes (
  id uuid primary key default gen_random_uuid(),
  comentario_id uuid not null references post_comentarios(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  lido boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_post_mencoes_profile on post_mencoes (profile_id, lido);

alter table post_comentarios enable row level security;
alter table post_reacoes enable row level security;
alter table post_mencoes enable row level security;

-- Comentários e reações são visíveis pra firma toda, igual o post que
-- comentam (mural_posts/campanhas já são select-all).
create policy post_comentarios_select_all on post_comentarios for select using (true);
create policy post_comentarios_insert on post_comentarios for insert with check (autor_id = auth.uid());
create policy post_comentarios_delete on post_comentarios for delete using (autor_id = auth.uid() or is_director());

create policy post_reacoes_select_all on post_reacoes for select using (true);
create policy post_reacoes_insert on post_reacoes for insert with check (profile_id = auth.uid());
create policy post_reacoes_update on post_reacoes for update using (profile_id = auth.uid());
create policy post_reacoes_delete on post_reacoes for delete using (profile_id = auth.uid());

-- Menção só é visível pra quem foi marcado — não é um dado público como o
-- resto. Insert só permitido junto do próprio comentário (o autor do
-- comentário é quem gera as menções dele).
create policy post_mencoes_select_own on post_mencoes for select using (profile_id = auth.uid());
create policy post_mencoes_insert on post_mencoes for insert with check (
  exists (select 1 from post_comentarios c where c.id = comentario_id and c.autor_id = auth.uid())
);
create policy post_mencoes_update_own on post_mencoes for update using (profile_id = auth.uid());

insert into schema_migrations (filename) values ('0036_comentarios_reacoes_mencoes.sql')
on conflict (filename) do nothing;
