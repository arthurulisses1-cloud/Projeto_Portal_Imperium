-- DRE / Folha de Pagamento — visão estritamente privada do Diretor. Nunca
-- deve ser exposta a mais ninguém: nem outro papel na UI, nem a Minerva
-- (os tools da Minerva em src/lib/minerva/tools.ts NUNCA leem essas 3
-- tabelas, de propósito — ver comentário lá). RLS abaixo é a segunda
-- camada de defesa (mesmo se algum código futuro esquecer de checar
-- role === 'diretor' na página, o Postgres já barra).

create table dre_configuracoes (
  id boolean primary key default true check (id),  -- singleton (só 1 linha)
  pct_receita_credito numeric not null default 0.06,
  pct_receita_parceiro numeric not null default 0.01,
  pct_imposto numeric not null default 0.06,
  custo_aluguel numeric not null default 13000,
  custo_trafego numeric not null default 10000,
  updated_at timestamptz not null default now()
);
insert into dre_configuracoes (id) values (true);

create table dre_producao_parceiro (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  valor numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (ano, mes)
);

-- Custo extra pontual (campanha, bônus adicional, marco pago) — quando
-- profile_id é preenchido, entra na coluna "Campanhas" da Folha dessa
-- pessoa; quando fica null, é um custo geral da firma no mês.
create table dre_despesas_extras (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  descricao text not null,
  valor numeric not null,
  profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table dre_configuracoes enable row level security;
alter table dre_producao_parceiro enable row level security;
alter table dre_despesas_extras enable row level security;

create policy dre_configuracoes_diretor on dre_configuracoes for all using (is_director()) with check (is_director());
create policy dre_producao_parceiro_diretor on dre_producao_parceiro for all using (is_director()) with check (is_director());
create policy dre_despesas_extras_diretor on dre_despesas_extras for all using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0037_dre.sql')
on conflict (filename) do nothing;
