-- Mais dois erros de transcrição achados comparando commission_tiers com o
-- PDF oficial do Plano de Carreira (Gestão Geral + Legionário/Centurião),
-- pedido do Diretor 2026-09-01 depois de achar o bug do 4,5M/5M (migration
-- 0064): "verifica se os outros cargos estão ok".
--
-- 1) Legionário — primeiro tier (100.000): o PDF mostra Fixo R$1.600 nessa
--    faixa (0,40% já estava certo); a migration 0030 semeou R$1.800 —
--    parece ter copiado o fixo do Centurião no mesmo tier (que É 1.800) por
--    engano.
update commission_tiers set fixo = 1600
  where rank = 'legionario' and ordem = 1 and producao_min = 100000;

-- 2) Diretor — primeiro tier: o PDF mostra o limiar em R$1.500.000 (fixo
--    R$8.000 e 0,20% já estavam certos); a migration 0030 semeou o limiar
--    em R$1.200.000, três meses de produção adiantado.
update commission_tiers set producao_min = 1500000
  where rank = 'diretor' and ordem = 1 and producao_min = 1200000;

-- Demais tiers (Legionário 150k-500k, Centurião inteiro, Tribuno inteiro,
-- Pretor inteiro, Legado inteiro, Diretor 2M-6M já corrigidos na 0064)
-- conferem exatamente com o PDF — sem mudança.

insert into schema_migrations (filename) values ('0065_corrige_tiers_legionario_e_diretor.sql')
on conflict (filename) do nothing;
