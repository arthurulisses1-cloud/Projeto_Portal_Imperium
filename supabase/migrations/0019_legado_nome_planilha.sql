set search_path = public;

-- Permite ao Diretor amarrar um perfil a um nome específico da planilha,
-- pra sync não depender de full_name bater exatamente com a planilha.
alter table profiles add column if not exists nome_planilha text;
