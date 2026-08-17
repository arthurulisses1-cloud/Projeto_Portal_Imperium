-- ============================================================
-- Metas Mensais — cadastro do Diretor: meta de crédito, ticket
-- médio e taxas de conversão esperadas por etapa do funil.
-- Meta de crédito é dividida automaticamente por Exército e,
-- dentro de cada Exército, por Tribo (calculado on-the-fly,
-- não guardado, pra nunca ficar desatualizado se a estrutura mudar).
-- ============================================================

create table metas_mensais (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  meta_credito_total numeric not null default 0,
  meta_ticket_medio numeric not null default 0,
  criado_por uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ano, mes)
);

create table metas_conversao (
  id uuid primary key default gen_random_uuid(),
  meta_mensal_id uuid not null references metas_mensais(id) on delete cascade,
  etapa_de funil_etapa not null,
  etapa_para funil_etapa not null,
  taxa_esperada numeric not null,
  unique (meta_mensal_id, etapa_de, etapa_para)
);

create trigger trg_metas_mensais_updated_at before update on metas_mensais
  for each row execute function set_updated_at();

alter table metas_mensais enable row level security;
alter table metas_conversao enable row level security;

create policy metas_mensais_select_all on metas_mensais for select using (true);
create policy metas_mensais_write on metas_mensais for all using (is_director()) with check (is_director());

create policy metas_conversao_select_all on metas_conversao for select using (true);
create policy metas_conversao_write on metas_conversao for all using (is_director()) with check (is_director());
