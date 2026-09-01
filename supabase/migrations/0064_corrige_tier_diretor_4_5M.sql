-- Corrige as duas últimas faixas da tabela de comissão do Diretor: a
-- migration 0030 semeou os limiares de produção errados pros dois últimos
-- tiers (4.500.000 e 5.000.000), quando o Plano de Carreira oficial (PDF
-- "Gestão Geral") pula direto de 4M pra 5M e depois pra 6M — sem nenhum
-- degrau de 4,5M. Isso fazia o Diretor destravar 0,45% de Gestão já a
-- partir de R$4.500.000 de produção em vez de R$5.000.000 (e 0,50% a
-- partir de R$5.000.000 em vez de R$6.000.000), pagando comissão a mais.
-- Achado pelo próprio Diretor, 2026-09-01, comparando a tabela do Portal
-- com o PDF do plano.
--
-- Fixo e % de cada linha continuam os mesmos (R$12.000/0,45% e
-- R$12.000/0,50%) — só o limiar de produção (produção_min) que estava
-- deslocado em R$500.000 pra baixo nas duas últimas linhas. Atualiza a de
-- maior ordem primeiro pra nunca ter as duas linhas com o mesmo
-- produção_min ao mesmo tempo (não tem unique nisso, mas evita confusão
-- se a query rodar em paralelo).
update commission_tiers set producao_min = 6000000
  where rank = 'diretor' and ordem = 8 and producao_min = 5000000;

update commission_tiers set producao_min = 5000000
  where rank = 'diretor' and ordem = 7 and producao_min = 4500000;

insert into schema_migrations (filename) values ('0064_corrige_tier_diretor_4_5M.sql')
on conflict (filename) do nothing;
