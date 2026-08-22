-- Investidor enxerga a DRE (mesmo dado que o Diretor vê), mas nunca
-- escreve nada — todas as ações em src/app/(app)/dre/actions.ts continuam
-- exigindo is_director() explicitamente. Isso aqui só libera o SELECT.
create or replace function is_investidor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'investidor' from profiles where id = auth.uid()), false);
$$;

create policy dre_configuracoes_select_investidor on dre_configuracoes for select using (is_investidor());
create policy dre_producao_parceiro_select_investidor on dre_producao_parceiro for select using (is_investidor());
create policy dre_despesas_extras_select_investidor on dre_despesas_extras for select using (is_investidor());
create policy dre_receitas_extras_select_investidor on dre_receitas_extras for select using (is_investidor());

insert into schema_migrations (filename) values ('0040_investidor_rls.sql')
on conflict (filename) do nothing;
