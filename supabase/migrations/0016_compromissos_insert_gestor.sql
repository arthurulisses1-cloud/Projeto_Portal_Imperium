-- ============================================================
-- Closer/Líder/Diretor precisam poder INSERIR (não só atualizar)
-- um registro de compromisso pros seus liderados — necessário pro
-- botão de "Marcar falta" quando a pessoa ainda não lançou nada
-- no dia (upsert cai no insert nesse caso).
-- ============================================================

set search_path = public;

create policy compromissos_insert_gestor on compromissos for insert with check (
  is_closer_of_tribo(profile_tribo_id(profile_id))
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
