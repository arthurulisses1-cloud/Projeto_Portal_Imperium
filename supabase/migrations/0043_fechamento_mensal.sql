-- Fechamento Mensal: no dia 1, o Diretor audita e "tranca" a Folha do mês
-- de produção que acabou de fechar (fixo/bônus/variável por pessoa +
-- comissão de parceiro) — dali em diante o valor que aparece pro
-- funcionário/financeiro é esse CONGELADO, não o live recalculado (que
-- pode mudar se o sync corrigir algo depois do dia 1). Reabrível: o
-- Diretor pode reabrir se achar erro, o que limpa as linhas de snapshot
-- pra ele fechar de novo depois de corrigir (decisão do Diretor,
-- 2026-08-22 — não vira lançamento avulso no mês seguinte).
--
-- Convenção: (ano, mes) aqui é o MÊS DE PRODUÇÃO que fechou, não o mês em
-- que o Diretor aperta o botão — dia 5 e dia 15 do pagamento são sempre no
-- mês SEGUINTE a esse (ano, mes), calculado na UI, sem coluna própria.
create table fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  fechado_por uuid references profiles(id),
  fechado_em timestamptz,
  unique (ano, mes)
);

create table fechamento_pessoas (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references fechamentos_mensais(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  nome text not null,
  fixo numeric not null default 0,
  bonus numeric not null default 0,
  variavel numeric not null default 0,
  unique (fechamento_id, profile_id)
);

create table fechamento_parceiros (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references fechamentos_mensais(id) on delete cascade,
  comissao_parceiro_id uuid references comissoes_parceiro(id),
  nome_parceiro text not null,
  chave_pix text not null,
  valor_total numeric not null,
  valor_repassado numeric not null,
  valor_retido numeric not null
);

alter table fechamentos_mensais enable row level security;
alter table fechamento_pessoas enable row level security;
alter table fechamento_parceiros enable row level security;

-- fechamentos_mensais só guarda status/ano/mes (nada sensível) — select
-- liberado geral, pro /comissao do funcionário conseguir checar se o mês
-- dele já fechou. Escrita (fecharMes/reabrirMes) exige is_director().
create policy fechamentos_mensais_select_all on fechamentos_mensais for select using (true);
create policy fechamentos_mensais_write_diretor on fechamentos_mensais for all using (is_director()) with check (is_director());

-- fechamento_pessoas TEM valor de salário/comissão — mesma sensibilidade
-- da Folha na DRE. Diretor e Investidor veem tudo; cada pessoa só a sua
-- própria linha (card "Dia 5 / Dia 15" em /comissao).
create policy fechamento_pessoas_select_diretor on fechamento_pessoas for select using (is_director());
create policy fechamento_pessoas_select_investidor on fechamento_pessoas for select using (is_investidor());
create policy fechamento_pessoas_select_propria on fechamento_pessoas for select using (profile_id = auth.uid());
create policy fechamento_pessoas_write_diretor on fechamento_pessoas for all using (is_director()) with check (is_director());

-- fechamento_parceiros tem Pix e valor de repasse — só Diretor/Investidor,
-- ninguém mais precisa ver isso.
create policy fechamento_parceiros_select_diretor on fechamento_parceiros for select using (is_director());
create policy fechamento_parceiros_select_investidor on fechamento_parceiros for select using (is_investidor());
create policy fechamento_parceiros_write_diretor on fechamento_parceiros for all using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0043_fechamento_mensal.sql')
on conflict (filename) do nothing;
