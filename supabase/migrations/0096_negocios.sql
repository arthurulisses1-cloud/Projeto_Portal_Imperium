-- ============================================================
-- Modelo multinegócio (Diretor, 2026-11-04): o Matri fechou e o time foi
-- dividido em 4 negócios. Cada pessoa e cada venda passam a pertencer a um
-- negócio. O Matri vira um negócio "arquivado" que ainda aceita vendas até
-- 30/11/2026 (podem entrar vendas residuais) e depois fica só para consulta.
-- Cargo por negócio é texto livre controlado por check (sem mexer no enum
-- app_role, que continua mandando nas permissões de tela).
-- ============================================================
set search_path = public;

create table if not exists negocios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  status text not null default 'ativo' check (status in ('ativo', 'arquivado')),
  aceita_vendas_ate date,          -- null = sem limite
  vigencia_inicio date,            -- quando o negócio começa a valer
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists profile_negocios (
  profile_id uuid not null references profiles(id) on delete cascade,
  negocio_id uuid not null references negocios(id) on delete cascade,
  cargo text not null default 'executivo'
    check (cargo in ('head', 'executivo', 'closer', 'sdr', 'bdr', 'pre_vendas', 'gestor', 'outro')),
  principal boolean not null default false, -- negócio que abre por padrão
  created_at timestamptz not null default now(),
  primary key (profile_id, negocio_id)
);
create index if not exists idx_profile_negocios_negocio on profile_negocios (negocio_id);

alter table vendas add column if not exists negocio_id uuid references negocios(id);
create index if not exists idx_vendas_negocio on vendas (negocio_id, data);

-- Seed dos 5 negócios.
insert into negocios (slug, nome, descricao, status, aceita_vendas_ate, vigencia_inicio, ordem) values
  ('vorp', 'Grupo Vorp', 'Consultoria e aceleração comercial para PMEs (Sales Tech, marketing, tecnologia e educação).', 'ativo', null, '2026-11-09', 1),
  ('vorp-finance', 'Vorp Finance', 'Antecipação (cessão) de precatórios federais, estaduais e municipais.', 'ativo', null, '2026-11-09', 2),
  ('matchsales', 'MatchSales', 'Plataforma de IA comercial e CRM PipeFácil.', 'ativo', null, '2026-11-09', 3),
  ('vorp-energy', 'Vorp Energy', 'Energia por assinatura (Sunne) e folha de pagamento.', 'ativo', null, '2026-11-09', 4),
  ('matri', 'Matri (encerrado)', 'Operação anterior. Aceita vendas residuais até 30/11/2026; depois, só consulta.', 'arquivado', '2026-11-30', null, 9)
on conflict (slug) do nothing;

-- Backfill: toda venda e toda pessoa existente fica no Matri.
update vendas set negocio_id = (select id from negocios where slug = 'matri') where negocio_id is null;

insert into profile_negocios (profile_id, negocio_id, cargo, principal)
select p.id, (select id from negocios where slug = 'matri'),
       case p.role when 'sdr' then 'sdr' when 'closer' then 'closer' when 'lider' then 'head' else 'outro' end,
       true
from profiles p
on conflict do nothing;

-- Venda nova sem negócio informado cai no negócio principal de quem vendeu
-- (e, na falta, no Matri enquanto ele aceita vendas).
create or replace function vendas_set_negocio() returns trigger language plpgsql as $$
begin
  if new.negocio_id is null then
    select pn.negocio_id into new.negocio_id
      from profile_negocios pn
      where pn.profile_id = new.profile_id
      order by pn.principal desc, pn.created_at
      limit 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_vendas_set_negocio on vendas;
create trigger trg_vendas_set_negocio before insert on vendas
  for each row execute function vendas_set_negocio();

-- RLS: todo mundo logado enxerga os negócios e os vínculos (é a base de
-- ranking e organograma); só o Diretor altera.
alter table negocios enable row level security;
alter table profile_negocios enable row level security;

drop policy if exists negocios_select on negocios;
create policy negocios_select on negocios for select to authenticated using (true);
drop policy if exists negocios_diretor_all on negocios;
create policy negocios_diretor_all on negocios for all to authenticated
  using (is_director()) with check (is_director());

drop policy if exists profile_negocios_select on profile_negocios;
create policy profile_negocios_select on profile_negocios for select to authenticated using (true);
drop policy if exists profile_negocios_diretor_all on profile_negocios;
create policy profile_negocios_diretor_all on profile_negocios for all to authenticated
  using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0096_negocios.sql') on conflict (filename) do nothing;
