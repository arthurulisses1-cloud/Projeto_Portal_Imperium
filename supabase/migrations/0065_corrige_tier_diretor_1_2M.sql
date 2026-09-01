-- Mais um erro de transcrição achado comparando commission_tiers com o PDF
-- oficial do Plano de Carreira (Gestão Geral), pedido do Diretor
-- 2026-09-01 depois de achar o bug do 4,5M/5M (migration 0064): "verifica
-- se os outros cargos estão ok".
--
-- Diretor — primeiro tier: o PDF mostra o limiar em R$1.500.000 (fixo
-- R$8.000 e 0,20% já estavam certos); a migration 0030 semeou o limiar em
-- R$1.200.000, três meses de produção adiantado.
update commission_tiers set producao_min = 1500000
  where rank = 'diretor' and ordem = 1 and producao_min = 1200000;

-- Legionário no tier de R$100.000 tinha fixo R$1.800 (igual ao Centurião
-- no mesmo tier) contra R$1.600 no PDF — mas o Diretor confirmou que
-- R$1.800 é o mínimo que ele QUER manter nesse tier (decisão dele, não
-- segue o PDF à risca aqui) — então NÃO mexe nisso, mantém como está.
--
-- Centurião, Tribuno, Pretor e Legado conferem 100% com o PDF, linha por
-- linha — sem mudança.

insert into schema_migrations (filename) values ('0065_corrige_tier_diretor_1_2M.sql')
on conflict (filename) do nothing;
