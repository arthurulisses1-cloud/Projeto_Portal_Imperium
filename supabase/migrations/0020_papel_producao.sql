set search_path = public;

-- Produção passa a ser marcada com o papel exercido NAQUELA venda/entrevista
-- (sdr, closer, ou ambos quando a mesma pessoa fez os dois papéis sozinha),
-- em vez de depender do cargo fixo do perfil. Isso evita que produção feita
-- como SDR seja contada como Closer (ou vice-versa) no ranking.
create type funil_papel as enum ('sdr', 'closer', 'ambos');

alter table producao_funil add column if not exists papel funil_papel not null default 'sdr';
alter table vendas add column if not exists papel funil_papel not null default 'sdr';

alter table producao_funil drop constraint if exists producao_funil_profile_id_data_etapa_key;
alter table producao_funil
  add constraint producao_funil_profile_id_data_etapa_papel_key unique (profile_id, data, etapa, papel);
