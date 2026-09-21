-- Permissão customizada por usuário Analista — pedido do Diretor,
-- 2026-09-21: "analistas dependendo do caso precisam ver coisas
-- diferentes... quero poder setar o que cada um pode ver e editar".
--
-- Ausência de linha pra um (profile_id, area) = usa o padrão do papel
-- Analista (ver src/lib/permissoes-analista.ts, AREAS_ANALISTA) — não
-- precisa semear uma linha por área por pessoa, só grava quando o
-- Diretor MUDA o padrão pra alguém específico.
create table analista_permissoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  area text not null,
  pode_ver boolean not null default false,
  pode_editar boolean not null default false,
  atualizado_por uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (profile_id, area)
);

alter table analista_permissoes enable row level security;

-- O próprio Analista precisa ler a PRÓPRIA linha (o layout/páginas
-- calculam o que mostrar pra ele no lado do servidor, com a sessão dele
-- mesmo, não com service role) — Diretor lê/edita de todo mundo.
create policy analista_permissoes_select on analista_permissoes for select using (
  profile_id = auth.uid() or is_director()
);
create policy analista_permissoes_write on analista_permissoes for all
  using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0081_analista_permissoes.sql')
on conflict (filename) do nothing;
