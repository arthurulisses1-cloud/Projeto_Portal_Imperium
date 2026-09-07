-- ============================================================
-- Vorp Academy: trilhas de formação, aulas e materiais, com 3
-- visões (Diretor edita tudo · Instrutor ministra as que foi
-- alocado · cada um vê a própria trilha) — pedido do Diretor,
-- 2026-09-07, levando pro Senatus o cronograma que já tínhamos
-- desenhado num rascunho (Legionário/Centurião/Tribuno/Pretor/
-- Legado + Arena de Roleplays).
-- ============================================================

create table academy_trilhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  -- rank null = trilha cross-rank (a Arena de Roleplays, aberta a todo mundo
  -- elegível daquela semana) — todas as outras casam 1:1 com um app_rank.
  rank app_rank,
  tipo text not null default 'trilha' check (tipo in ('trilha', 'arena')),
  dia_semana int not null check (dia_semana between 0 and 6), -- 0=domingo
  hora_inicio text not null,
  hora_fim text not null,
  ordem int not null default 0,
  ativa boolean not null default true
);

-- Uma aula = uma semana/encontro dentro da trilha. `ordem` é a posição
-- (1, 2, 3...) — reordenável pelo Diretor sem precisar renumerar tudo à
-- mão (as Server Actions trocam só o par que mudou de lugar).
create table academy_aulas (
  id uuid primary key default gen_random_uuid(),
  trilha_id uuid not null references academy_trilhas(id) on delete cascade,
  ordem int not null,
  tema text not null,
  descricao text,
  data date,
  instrutor_id uuid references profiles(id) on delete set null,
  marco boolean not null default false,
  realizada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trilha_id, ordem)
);

create table academy_materiais (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references academy_aulas(id) on delete cascade,
  nome text not null,
  url text not null,
  enviado_por uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table academy_trilhas enable row level security;
alter table academy_aulas enable row level security;
alter table academy_materiais enable row level security;

-- Estrutura da Academy (trilhas) — todo mundo vê, só Diretor edita.
create policy academy_trilhas_select on academy_trilhas for select using (true);
create policy academy_trilhas_write on academy_trilhas for all using (is_director()) with check (is_director());

-- Aulas — todo mundo vê (calendário público da própria trilha e da Arena).
-- Diretor edita tudo; o instrutor alocado só pode marcar a própria aula
-- como realizada (trigger abaixo barra ele mexer em tema/data/ordem/quem
-- é o instrutor — isso é decisão do Diretor).
create policy academy_aulas_select on academy_aulas for select using (true);
create policy academy_aulas_write on academy_aulas for all using (is_director()) with check (is_director());
create policy academy_aulas_update_instrutor on academy_aulas for update
  using (instrutor_id = auth.uid())
  with check (instrutor_id = auth.uid());

create or replace function prevent_academy_aula_overreach()
returns trigger language plpgsql as $$
begin
  if not is_director() then
    if new.trilha_id <> old.trilha_id
       or new.ordem <> old.ordem
       or new.tema <> old.tema
       or coalesce(new.descricao, '') <> coalesce(old.descricao, '')
       or new.data is distinct from old.data
       or new.instrutor_id is distinct from old.instrutor_id
       or new.marco <> old.marco then
      raise exception 'Só o Diretor pode alterar tema, data, ordem ou o instrutor da aula.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_prevent_academy_aula_overreach before update on academy_aulas
  for each row execute function prevent_academy_aula_overreach();

-- Materiais — todo mundo vê (é o time inteiro que precisa acessar); só o
-- instrutor daquela aula específica (ou o Diretor) sobe ou apaga arquivo.
create policy academy_materiais_select on academy_materiais for select using (true);
create policy academy_materiais_insert on academy_materiais for insert
  with check (
    is_director()
    or exists (select 1 from academy_aulas a where a.id = aula_id and a.instrutor_id = auth.uid())
  );
create policy academy_materiais_delete on academy_materiais for delete
  using (is_director() or enviado_por = auth.uid());

-- ---------- Storage: bucket público pros materiais de aula ----------
insert into storage.buckets (id, name, public)
values ('academy-materiais', 'academy-materiais', true)
on conflict (id) do nothing;

create policy academy_materiais_storage_select on storage.objects for select
  using (bucket_id = 'academy-materiais');

create policy academy_materiais_storage_insert on storage.objects for insert
  with check (bucket_id = 'academy-materiais' and (storage.foldername(name))[1] = auth.uid()::text);

create policy academy_materiais_storage_delete on storage.objects for delete
  using (bucket_id = 'academy-materiais' and (storage.foldername(name))[1] = auth.uid()::text);

insert into schema_migrations (filename) values ('0068_academy.sql')
on conflict (filename) do nothing;
