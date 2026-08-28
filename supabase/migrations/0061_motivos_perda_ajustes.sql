-- ============================================================
-- Ajustes no catálogo de Motivos de Perda (pedido do Diretor,
-- 2026-08-28), em cima do estado atual (ele já tinha editado/removido
-- alguns itens do seed da migration 0060 pelo próprio cadastro):
--
-- 1) Os motivos de Subido são reprovação de compliance — e o
--    compliance pode travar o lead mesmo depois dele já ter avançado
--    pra CCB Enviada ou Assinado (a análise não é instantânea). Copia
--    (não move — Subido continua com os mesmos motivos) cada um dos 7
--    motivos de Subido também pra CCB Enviada e Assinado.
--
-- 2) Padroniza os nomes de "advogado barrou"/"família barrou" que
--    estavam com textos diferentes em Entrevista Validada e
--    Fechamento — agora os dois usam exatamente "Advogado barrou" e
--    "Família barrou" nas duas etapas.
-- ============================================================

-- ---------- 2) Padronização de nomes ----------
update motivos_perda_lead set nome = 'Advogado barrou'
  where nome in ('Advogado barrou a operação', 'Advogado não autorizou mesmo após esclarecimento')
    and etapa in ('entrevista_validada', 'fechamento');

update motivos_perda_lead set nome = 'Família barrou'
  where nome in ('Família barrou', 'Família/cônjuge não concordou na call')
    and etapa in ('entrevista_validada', 'fechamento');

-- ---------- 1) Copia motivos de Subido pra CCB Enviada e Assinado ----------
insert into motivos_perda_lead (nome, etapa, ordem)
select nome, 'ccb_enviada', ordem + 130  -- 400s -> 530s (depois do maior ordem já usado em ccb_enviada, 520)
from motivos_perda_lead
where etapa = 'subido';

insert into motivos_perda_lead (nome, etapa, ordem)
select nome, 'assinado', ordem + 220  -- 400s -> 620s (depois do maior ordem já usado em assinado, 610)
from motivos_perda_lead
where etapa = 'subido';

insert into schema_migrations (filename) values ('0061_motivos_perda_ajustes.sql')
on conflict (filename) do nothing;
