set search_path = public;

-- ============================================================
-- Marcos: passa de "soma acumulada do ano" pra "crédito pago
-- dentro do mês corrente" + ficha de resgate persistida.
--
-- Regra de negócio (Diretor, 2026-08-19):
--   - Cada recompensa (marco) só pode ser resgatada UMA VEZ NA VIDA
--     por pessoa.
--   - No máximo UM resgate por pessoa por mês, mesmo que ela bata
--     mais de um threshold no mesmo mês (tem que escolher um).
--   - Quem registra o resgate é o Diretor (é um prêmio físico/real,
--     não algo autoatendido).
-- ============================================================

create table if not exists marcos_resgates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  marco_id uuid not null references marcos(id) on delete restrict,
  -- Primeiro dia do mês em que o resgate foi concedido (competência),
  -- não a data exata do evento.
  competencia date not null,
  registrado_por uuid references profiles(id),
  criado_em timestamptz not null default now(),
  unique (profile_id, marco_id),
  unique (profile_id, competencia)
);

alter table marcos_resgates enable row level security;

-- Visível pra todo mundo (Comissão do Mês / SidebarRight mostram o
-- progresso de qualquer pessoa que o viewer possa ver), só o Diretor
-- grava.
create policy marcos_resgates_select_all on marcos_resgates for select using (true);
create policy marcos_resgates_insert_diretor on marcos_resgates for insert
  with check (is_director());
create policy marcos_resgates_delete_diretor on marcos_resgates for delete
  using (is_director());

-- ---------- Backfill dos 3 resgates reais já concedidos ----------
-- Competência aproximada (não temos a data exata registrada em lugar
-- nenhum do sistema) — usa meses distintos no passado só pra não
-- colidir com a constraint de 1-por-mês; não afeta o cálculo do mês
-- corrente daqui pra frente.
insert into marcos_resgates (profile_id, marco_id, competencia)
values
  ('456c00b2-4d95-448c-975a-6df08e95e32f', '85004a74-23aa-4304-8638-23cbaec64919', '2026-05-01'), -- Matheus Mesquita -> Jantar p/ 2
  ('74658908-c885-4dd1-bcd4-f44b03011f8f', 'daa485ff-d71a-4463-910d-10e3a34418f9', '2026-06-01'), -- Marcus Ryquelme -> Fone gamer Havit
  ('ad711336-190a-4221-942b-545a7da9b180', 'daa485ff-d71a-4463-910d-10e3a34418f9', '2026-07-01')  -- Gabriel Santiago -> Fone gamer Havit
on conflict do nothing;
