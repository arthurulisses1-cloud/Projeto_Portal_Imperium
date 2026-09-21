-- Completa a permissão customizada por Analista (migration 0081): até
-- aqui só a PÁGINA reconhecia a permissão (via server action lendo
-- analista_permissoes com a própria sessão) — as tabelas restritas a
-- is_director() continuavam invisíveis mesmo com a área liberada. Esta
-- migration libera o SELECT nas tabelas que hoje restringem leitura a
-- is_director() e ficam atrás das 3 áreas que podem ser concedidas
-- (Financeiro/Validações/Pessoas) — o resto do "kept scope" (produção,
-- vendas, metas, campanhas, academy_*, compromissos, tasks...) já é
-- select aberto ou já ganhou is_analista() na 0080.
create or replace function analista_pode_ver(area_alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pode_ver from analista_permissoes where profile_id = auth.uid() and area = area_alvo),
    false
  );
$$;

-- Financeiro
create policy dre_configuracoes_select_analista on dre_configuracoes for select using (analista_pode_ver('financeiro'));
create policy dre_producao_parceiro_select_analista on dre_producao_parceiro for select using (analista_pode_ver('financeiro'));
create policy dre_despesas_extras_select_analista on dre_despesas_extras for select using (analista_pode_ver('financeiro'));
create policy dre_receitas_extras_select_analista on dre_receitas_extras for select using (analista_pode_ver('financeiro'));
create policy fechamento_pessoas_select_analista on fechamento_pessoas for select using (analista_pode_ver('financeiro'));
create policy fechamento_parceiros_select_analista on fechamento_parceiros for select using (analista_pode_ver('financeiro'));
create policy comissao_mensal_select_analista on comissao_mensal for select using (analista_pode_ver('financeiro'));

-- Validações
create policy contestacoes_select_analista on contestacoes for select using (analista_pode_ver('validacoes'));
create policy strikes_select_analista on strikes for select using (analista_pode_ver('validacoes'));
create policy promo_requests_select_analista on promotion_requests for select using (analista_pode_ver('validacoes'));
create policy promo_evidence_select_analista on promotion_evidence for select using (analista_pode_ver('validacoes'));

-- Pessoas
create policy estrelas_select_analista on estrelas_eventos for select using (analista_pode_ver('pessoas'));

insert into schema_migrations (filename) values ('0082_analista_permissoes_rls.sql')
on conflict (filename) do nothing;
