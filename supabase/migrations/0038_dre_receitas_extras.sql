-- Outras receitas do mês (ex: aporte, outro fundo) — mesma ideia de
-- dre_despesas_extras, mas do lado da Receita. Mesma blindagem: RLS só
-- pra is_director(), nunca lido pela Minerva (ver comentário em
-- src/lib/minerva/tools.ts).
create table dre_receitas_extras (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  descricao text not null,
  valor numeric not null,
  created_at timestamptz not null default now()
);

alter table dre_receitas_extras enable row level security;
create policy dre_receitas_extras_diretor on dre_receitas_extras for all using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0038_dre_receitas_extras.sql')
on conflict (filename) do nothing;
