-- Recompensa estruturada de campanha (estrela ou dinheiro) + requisito
-- mínimo estruturado — pedido do Diretor, 2026-09-11: "se a pessoa ganhar
-- já entra nas visões de ganho do executivo, na dre e no plano de
-- carreira (se for estrela)" + "atrelar os requisitos mínimos a uma meta
-- mínima das métricas que coloco pra medir a campanha".
--
-- O texto livre `requisitos_minimos`/`recompensa` (migration 0034) continua
-- existindo — pra descrição/extra que não dá pra estruturar (ex: "+ jantar
-- de equipe"). Os campos abaixo são só a parte que deve ser concedida
-- automaticamente e checada automaticamente.

create type recompensa_tipo as enum ('estrela', 'dinheiro');

alter table campanhas add column recompensa_tipo recompensa_tipo;

-- Quanto cada PAPEL recebe quando a campanha é vencida — cobre tanto
-- campanha de time (Tribo/Exército/Geral: cada papel dentro do grupo
-- vencedor recebe o valor do seu próprio papel, "conforme o budget
-- disponível" pedido pelo Diretor) quanto duelo individual/grupo_rank (o
-- participante recebe o valor do papel que ele de fato tem).
alter table campanhas add column recompensa_valor_sdr numeric not null default 0;
alter table campanhas add column recompensa_valor_closer numeric not null default 0;
alter table campanhas add column recompensa_valor_lider numeric not null default 0;

-- Meta mínima estruturada, na mesma unidade da métrica da campanha — usada
-- pra decidir automaticamente quem "bateu" e concorre à recompensa. Null =
-- usa meta_valor como o próprio mínimo (fallback).
alter table campanhas add column requisito_minimo_valor numeric;

-- Preenchidos quando o Diretor aprova a concessão (botão só aparece após
-- data_fim, pedido do Diretor: "aparece botão para eu aprovar a concessão,
-- então libero ou não").
alter table campanhas add column apurada_em timestamptz;
alter table campanhas add column apurada_por uuid references profiles(id);

-- Auditoria de quem recebeu o quê — impede conceder a mesma campanha duas
-- vezes e dá histórico rastreável (qual despesa da DRE ou qual crédito de
-- estrela veio de qual campanha).
create table campanha_recompensas (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanhas(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  tipo recompensa_tipo not null,
  valor numeric not null,
  despesa_extra_id uuid references dre_despesas_extras(id) on delete set null,
  concedido_por uuid references profiles(id),
  concedido_em timestamptz not null default now()
);

alter table campanha_recompensas enable row level security;

create policy campanha_recompensas_select on campanha_recompensas for select using (
  profile_id = auth.uid() or is_director() or my_role() = 'lider'
);
-- Só o Diretor concede (mesma regra de dre_despesas_extras e do trigger
-- que protege profiles.stars_total — ver 0002_rls.sql) — o backend nunca
-- tenta escrever aqui com outro papel autenticado.
create policy campanha_recompensas_write on campanha_recompensas for all
  using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0078_campanha_recompensas.sql')
on conflict (filename) do nothing;
