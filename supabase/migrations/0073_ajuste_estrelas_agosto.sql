-- Ajuste pontual de dados (não é mudança de schema) — auditoria de
-- stars_total referente a agosto/2026, feita em 2026-09-07. Regra usada
-- (conferida com o Diretor e o PDF Matri_Planodecarreira.pdf):
--   - GANHO: por semana, só vendas PAGAS (via weekly_operacoes.status =
--     'PAGO'), pesadas pelo multiplicador de ticket (vendas.multiplicador).
--   - PERDA: por mês, pela faixa de R$ pago total do mês, conforme o rank
--     ATUAL da pessoa (tabela "RESULTADO" do PDF).
-- Pessoas inativas (Elisa, Marcus Lira) ficaram de fora por decisão do
-- Diretor — quem já saiu não sofre mais punição. Nunca fica negativo
-- (trava em 0). Mikael Oliveira teria -3, mas já estava em 0 — sem UPDATE.
update profiles set stars_total = 4   where id = 'a579f0de-7f7f-45fe-aec6-3ad0ec12d28e'; -- Alexander Marcelo   3 -> 4
update profiles set stars_total = 0   where id = '7e475b83-7bc5-4f94-a282-cf65e4547be2'; -- Ana Clara Rodrigues 1 -> 0
update profiles set stars_total = 2   where id = 'b5a30ced-7309-4629-8d91-c8d1274cfc23'; -- Cristina Santos     3 -> 2
update profiles set stars_total = 0   where id = 'ad711336-190a-4221-942b-545a7da9b180'; -- Gabriel Santiago    3 -> 0
update profiles set stars_total = 0   where id = 'e7cf46c5-ab68-4d57-954b-d2eda3ca8b6e'; -- Jonatha Cordeiro    2 -> 0
update profiles set stars_total = 2.5 where id = '74658908-c885-4dd1-bcd4-f44b03011f8f'; -- Marcus Ryquelme     0 -> 2.5
update profiles set stars_total = 1   where id = '456c00b2-4d95-448c-975a-6df08e95e32f'; -- Matheus Mesquita    4 -> 1
update profiles set stars_total = 1   where id = 'a49f5082-5209-4ade-9f66-2c59bb7e8267'; -- Nicolas Roberto     0 -> 1
update profiles set stars_total = 2.5 where id = 'ed6c3f67-9659-400a-ac34-6f1ef621fb92'; -- Silvio de Azevedo   2 -> 2.5
update profiles set stars_total = 0   where id = 'cc480a06-434e-4000-88e4-5aa928c8d8a8'; -- Stefani Viana       1 -> 0
update profiles set stars_total = 6.5 where id = '860ac6e0-4573-4682-bdb6-d0e4e7da110a'; -- Vinícius Ferreira   6 -> 6.5
update profiles set stars_total = 2.5 where id = '4a8abbcd-f0c5-4adb-b245-62ebf74c4e47'; -- Vinicius Pereira    2 -> 2.5

insert into schema_migrations (filename) values ('0073_ajuste_estrelas_agosto.sql')
on conflict (filename) do nothing;
