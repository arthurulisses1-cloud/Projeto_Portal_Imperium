-- ============================================================
-- Sistema de Marcos — recompensas por produção acumulada no ano.
-- Configurável (não hardcoded), aparece no painel lateral e na
-- aba de Comissão.
-- ============================================================

create table marcos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  threshold numeric not null,
  icone text not null default '🎁',
  ordem integer not null default 0
);

alter table marcos enable row level security;
create policy marcos_select_all on marcos for select using (true);
create policy marcos_write on marcos for all using (is_director()) with check (is_director());

insert into marcos (nome, threshold, icone, ordem) values
('Fone gamer Havit', 350000, '🎧', 1),
('Jantar p/ 2', 600000, '🍽️', 2),
('Monitor 2ª tela', 800000, '🖥️', 3),
('Notebook', 1200000, '💻', 4),
('Viagem Ceará p/ 2', 1500000, '✈️', 5),
('Viagem Brasil p/ 2', 2000000, '🌍', 6);
