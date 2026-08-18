-- ============================================================
-- Zera as Tribos existentes (dados de teste/placeholder) pra que
-- os Tribunos/Pretores criem as próprias Tribos do zero via
-- autoatendimento (/tribo). Os Exércitos continuam intactos.
-- ============================================================

set search_path = public;

-- desvincula todo mundo de qualquer Tribo antes de apagar, senão a FK barra o delete
update profiles set tribo_id = null where tribo_id is not null;

delete from tribos;
