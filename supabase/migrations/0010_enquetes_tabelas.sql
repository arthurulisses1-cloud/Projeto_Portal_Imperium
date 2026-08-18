-- ============================================================
-- Enquetes (parte 2) — rodar DEPOIS de 0009 (precisa ser uma
-- transação separada da que criou o valor 'enquete' do enum).
-- ============================================================

set search_path = public;

create table if not exists enquetes (
  id uuid primary key default gen_random_uuid(),
  mural_post_id uuid not null references mural_posts(id) on delete cascade,
  pergunta text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists enquete_opcoes (
  id uuid primary key default gen_random_uuid(),
  enquete_id uuid not null references enquetes(id) on delete cascade,
  texto text not null,
  ordem int not null default 0
);

create table if not exists enquete_votos (
  id uuid primary key default gen_random_uuid(),
  enquete_id uuid not null references enquetes(id) on delete cascade,
  opcao_id uuid not null references enquete_opcoes(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (enquete_id, profile_id)
);

alter table enquetes enable row level security;
alter table enquete_opcoes enable row level security;
alter table enquete_votos enable row level security;

create policy enquetes_select on enquetes for select using (true);
create policy enquetes_insert on enquetes for insert with check (public.is_director());

create policy enquete_opcoes_select on enquete_opcoes for select using (true);
create policy enquete_opcoes_insert on enquete_opcoes for insert with check (public.is_director());

create policy enquete_votos_select on enquete_votos for select using (true);
create policy enquete_votos_insert on enquete_votos for insert with check (profile_id = auth.uid());
create policy enquete_votos_update on enquete_votos for update using (profile_id = auth.uid());

-- Enquete é uma modalidade de post exclusiva do Diretor (como aviso, porém mais restrita)
drop policy if exists mural_insert on mural_posts;
create policy mural_insert on mural_posts for insert with check (
  autor_id = auth.uid() and (
    (tipo = 'aviso' and public.my_role() in ('lider','diretor'))
    or (tipo = 'reconhecimento' and public.my_role() in ('closer','lider','diretor'))
    or (tipo = 'enquete' and public.my_role() = 'diretor')
  )
);
