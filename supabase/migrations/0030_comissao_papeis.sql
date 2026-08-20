-- Reformula commission_tiers pra ter as 3 colunas reais do Plano de Carreira
-- (% Variável SDR / % Variável Closer / % Variável Gestão) em vez de uma
-- única pct_variavel genérica com significado implícito por rank. Isso
-- elimina o hack de "cargo equivalente" (RANK_SDR_EQUIVALENTE) que só
-- cobria Tribuno→Legionário/Pretor→Centurião e não sabia lidar com
-- Legionário/Centurião fechando como Closer, nem com o Líder atuando como
-- Closer numa venda própria.
--
-- Dados retranscritos da planilha oficial do Diretor (2026-08-19) — os
-- valores cruzados (SDR virando Closer, Closer virando SDR, Legado/Diretor
-- fazendo venda pessoal) são sempre FIXOS por cargo (não escalam por tier),
-- exatamente como aparecem na planilha.

alter table commission_tiers
  add column if not exists pct_sdr numeric,
  add column if not exists pct_closer numeric,
  add column if not exists pct_gestao numeric not null default 0;

alter table commission_tiers alter column pct_variavel drop not null;

delete from commission_tiers;

-- Legionário — SDR Jr (fixo/%SDR escalam por tier, %Closer sempre 0.30 fixo)
insert into commission_tiers (rank, producao_min, fixo, pct_sdr, pct_closer, pct_gestao, ordem) values
  ('legionario', 100000, 1800, 0.40, 0.30, 0, 1),
  ('legionario', 150000, 1800, 0.40, 0.30, 0, 2),
  ('legionario', 200000, 2000, 0.40, 0.30, 0, 3),
  ('legionario', 300000, 2000, 0.45, 0.30, 0, 4),
  ('legionario', 350000, 2300, 0.45, 0.30, 0, 5),
  ('legionario', 400000, 2300, 0.50, 0.30, 0, 6),
  ('legionario', 500000, 2800, 0.50, 0.30, 0, 7);

-- Centurião — SDR Sr
insert into commission_tiers (rank, producao_min, fixo, pct_sdr, pct_closer, pct_gestao, ordem) values
  ('centuriao', 100000, 1800, 0.40, 0.30, 0, 1),
  ('centuriao', 150000, 2300, 0.40, 0.30, 0, 2),
  ('centuriao', 200000, 2300, 0.50, 0.30, 0, 3),
  ('centuriao', 300000, 2500, 0.50, 0.30, 0, 4),
  ('centuriao', 350000, 2500, 0.55, 0.30, 0, 5),
  ('centuriao', 400000, 2800, 0.55, 0.30, 0, 6),
  ('centuriao', 500000, 3200, 0.60, 0.30, 0, 7);

-- Tribuno — Closer Jr (%SDR sempre 0.50 fixo, fixo/%Closer escalam por tier)
insert into commission_tiers (rank, producao_min, fixo, pct_sdr, pct_closer, pct_gestao, ordem) values
  ('tribuno', 300000, 2300, 0.50, 0.30, 0, 1),
  ('tribuno', 450000, 2300, 0.50, 0.30, 0, 2),
  ('tribuno', 600000, 2500, 0.50, 0.30, 0, 3),
  ('tribuno', 900000, 2500, 0.50, 0.35, 0, 4),
  ('tribuno', 1050000, 2800, 0.50, 0.35, 0, 5),
  ('tribuno', 1200000, 2800, 0.50, 0.40, 0, 6),
  ('tribuno', 1500000, 3200, 0.50, 0.40, 0, 7);

-- Pretor — Closer Sr
insert into commission_tiers (rank, producao_min, fixo, pct_sdr, pct_closer, pct_gestao, ordem) values
  ('pretor', 300000, 2300, 0.50, 0.30, 0, 1),
  ('pretor', 450000, 2500, 0.50, 0.30, 0, 2),
  ('pretor', 600000, 2800, 0.50, 0.35, 0, 3),
  ('pretor', 900000, 2800, 0.50, 0.40, 0, 4),
  ('pretor', 1050000, 3200, 0.50, 0.40, 0, 5),
  ('pretor', 1200000, 3200, 0.50, 0.45, 0, 6),
  ('pretor', 1500000, 4000, 0.50, 0.50, 0, 7);

-- Legado — Líder (produção do Exército pra %Gestão; venda pessoal como
-- SDR/Closer sempre nos fixos 0.60/0.30)
insert into commission_tiers (rank, producao_min, fixo, pct_sdr, pct_closer, pct_gestao, ordem) values
  ('legado', 600000, 4000, 0.60, 0.30, 0.05, 1),
  ('legado', 1000000, 4000, 0.60, 0.30, 0.20, 2),
  ('legado', 1250000, 4500, 0.60, 0.30, 0.20, 3),
  ('legado', 1500000, 5000, 0.60, 0.30, 0.20, 4),
  ('legado', 1750000, 5500, 0.60, 0.30, 0.20, 5),
  ('legado', 2000000, 5500, 0.60, 0.30, 0.25, 6),
  ('legado', 2250000, 6000, 0.60, 0.30, 0.25, 7),
  ('legado', 2500000, 7500, 0.60, 0.30, 0.30, 8);

-- Diretor — produção da firma inteira pra %Gestão
insert into commission_tiers (rank, producao_min, fixo, pct_sdr, pct_closer, pct_gestao, ordem) values
  ('diretor', 1200000, 8000, 0.90, 0.50, 0.20, 1),
  ('diretor', 2000000, 8000, 0.90, 0.50, 0.30, 2),
  ('diretor', 2500000, 8000, 0.90, 0.50, 0.35, 3),
  ('diretor', 3000000, 8000, 0.90, 0.50, 0.40, 4),
  ('diretor', 3500000, 9000, 0.90, 0.50, 0.40, 5),
  ('diretor', 4000000, 10000, 0.90, 0.50, 0.40, 6),
  ('diretor', 4500000, 12000, 0.90, 0.50, 0.45, 7),
  ('diretor', 5000000, 12000, 0.90, 0.50, 0.50, 8);

alter table commission_tiers alter column pct_sdr set not null;
alter table commission_tiers alter column pct_closer set not null;
alter table commission_tiers drop column if exists pct_variavel;
