-- Analista só LÊ — nenhuma policy de insert/update/delete abaixo, de
-- propósito (mesmo padrão do is_investidor(), migration 0040). A maior
-- parte dos dados que o Analista precisa ver já é de leitura aberta
-- (producao_funil, vendas, weekly_operacoes, metas_mensais, campanhas,
-- tribos, exercitos, academy_* — todas "select using (true)"), então só
-- as tabelas abaixo, que restringiam SELECT a is_director() explicitamente,
-- precisam de uma policy nova. Financeiro (dre_*, fechamento_*, comissao_
-- mensal), Validações (auditoria/validacao/aprovacoes/contestacoes) e
-- Pessoas (estrelas_eventos, marcos_resgates, gestão) ficam de fora de
-- propósito — Analista não vê essas abas.
create or replace function is_analista()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'analista' from profiles where id = auth.uid()), false);
$$;

create policy compromissos_select_analista on compromissos for select using (is_analista());
create policy tasks_select_analista on tasks for select using (is_analista());
create policy entrevistas_leads_select_analista on entrevistas_leads for select using (is_analista());
create policy sync_log_select_analista on sync_log for select using (is_analista());

insert into schema_migrations (filename) values ('0080_analista_rls.sql')
on conflict (filename) do nothing;
