-- % de receita própria por operação (só pra quando ela FOGE do padrão de
-- 6% cadastrado em dre_configuracoes) — pedido do Diretor, 2026-09-02:
-- "algumas vendas do mês passado vão ter uma comissão diferente dos 6%,
-- mas não são todas".
--
-- Fração, igual dre_configuracoes.pct_receita_credito (0.06 = 6%), NÃO
-- pontos percentuais como commission_tiers — mesma convenção, mesma
-- fórmula (`valor * pct`), sem precisar dividir por 100 na hora de usar.
-- Null (o normal, a imensa maioria das vendas) = usa o % padrão da DRE;
-- só preenche quando essa venda específica tem uma % diferente combinada.
alter table weekly_operacoes add column if not exists pct_receita_override numeric;

insert into schema_migrations (filename) values ('0067_pct_receita_override.sql')
on conflict (filename) do nothing;
