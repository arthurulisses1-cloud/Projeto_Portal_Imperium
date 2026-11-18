-- Ajustes de comissão por venda e pessoa: o Diretor pode fixar o valor de uma pessoa numa venda (em vez do cálculo
-- automático) e marcar a comissão como paga. `valor` nulo mantém o valor calculado e só registra o pagamento.
create table if not exists comissao_ajustes (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  papel text,
  valor numeric,
  pago_em date,
  observacao text,
  created_at timestamptz not null default now(),
  unique (venda_id, profile_id)
);

alter table comissao_ajustes enable row level security;

-- Lê quem é o próprio beneficiário, o Diretor e quem enxerga a venda (as políticas de vendas valem dentro do exists).
drop policy if exists comissao_ajustes_select on comissao_ajustes;
create policy comissao_ajustes_select on comissao_ajustes for select using (
  is_director() or profile_id = auth.uid() or exists (select 1 from vendas v where v.id = comissao_ajustes.venda_id)
);
drop policy if exists comissao_ajustes_escrita on comissao_ajustes;
create policy comissao_ajustes_escrita on comissao_ajustes for all using (is_director()) with check (is_director());

-- Venda de Antonio Carlos Asmuz Araujo (Vorp Finance, 17/11/2026), decisão do Diretor em 18/11/2026:
-- Saboya 2.500, Diretor 2.500, Ryquelme 2.000; o Head do Finance mantém o valor calculado. Tudo já pago.
insert into comissao_ajustes (venda_id, profile_id, papel, valor, pago_em, observacao)
select v.id, x.profile_id, x.papel, x.valor, date '2026-11-18', 'Divisão definida pelo Diretor'
from vendas v
join lateral (
  values
    (v.profile_id, 'closer', 2500::numeric),
    ((select id from profiles where role = 'diretor' and ativo order by created_at limit 1), 'diretor', 2500::numeric),
    (v.indicador_id, 'closer', 2000::numeric),
    ((select pn.profile_id from profile_negocios pn join negocios n on n.id = pn.negocio_id where n.slug = 'vorp-finance' and pn.cargo = 'head' limit 1), 'head', null::numeric)
) as x(profile_id, papel, valor) on x.profile_id is not null
where v.id = '14aa57e9-d34a-47cd-a99c-587df4f927ec'
on conflict (venda_id, profile_id) do update
  set papel = excluded.papel, valor = excluded.valor, pago_em = excluded.pago_em, observacao = excluded.observacao;

insert into schema_migrations (filename) values ('0119_comissao_ajustes.sql')
on conflict (filename) do nothing;
