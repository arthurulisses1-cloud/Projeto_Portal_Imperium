-- "Netflix" da Imperium Academy — pedido do Diretor, 2026-09-21: repositório
-- de conteúdo (trilhas oficiais já ministradas viram "filmes" pra rever, +
-- trilhas alternativas de conteúdo livre — vendas/liderança/marketing/
-- gestão etc, criadas fora da agenda oficial).

-- Resumo pós-aula + gravação, escritos pelo instrutor DEPOIS de dar a
-- aula (diferente de `descricao`, escrita pelo Diretor ao AGENDAR) — o
-- trigger prevent_academy_aula_overreach (migration 0068) não lista essas
-- 2 colunas, então o instrutor já pode editar via a RLS de update que já
-- existe (academy_aulas_update_instrutor), sem precisar de policy nova.
alter table academy_aulas add column resumo text;
alter table academy_aulas add column video_url text;

-- Módulo alternativo ("prateleira" da Netflix, tipo "Prospecção Ativa") —
-- conteúdo solto, sem agenda/instrutor/presença, criado livremente pelo
-- Diretor. `ranks_liberados` vazio/null = liberado pra todo mundo; se
-- tiver algum rank, quem não tem esse rank ainda VÊ o módulo (mostrado
-- com cadeado na UI), só não abre o conteúdo.
create table academy_modulos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  capa_url text,
  ordem int not null default 0,
  ativo boolean not null default true,
  ranks_liberados app_rank[],
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Item dentro de um módulo (uma aula complementar, vídeo ou documento).
create table academy_modulo_itens (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references academy_modulos(id) on delete cascade,
  titulo text not null,
  resumo text,
  tipo text not null check (tipo in ('video', 'arquivo')),
  video_url text,
  arquivo_url text,
  ordem int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table academy_modulos enable row level security;
alter table academy_modulo_itens enable row level security;

-- Todo mundo VÊ todos os módulos (inclusive os travados — é assim que o
-- cadeado aparece); só o Diretor cria/edita/apaga.
create policy academy_modulos_select on academy_modulos for select using (true);
create policy academy_modulos_write on academy_modulos for all using (is_director()) with check (is_director());

create policy academy_modulo_itens_select on academy_modulo_itens for select using (true);
create policy academy_modulo_itens_write on academy_modulo_itens for all using (is_director()) with check (is_director());

-- Storage pros arquivos de módulo alternativo (PDF/slide) — mesmo padrão
-- público-com-escrita-restrita do bucket academy-materiais (0068).
insert into storage.buckets (id, name, public)
values ('academy-modulos', 'academy-modulos', true)
on conflict (id) do nothing;

create policy academy_modulos_storage_select on storage.objects for select using (bucket_id = 'academy-modulos');
create policy academy_modulos_storage_insert on storage.objects for insert with check (bucket_id = 'academy-modulos' and is_director());
create policy academy_modulos_storage_delete on storage.objects for delete using (bucket_id = 'academy-modulos' and is_director());

insert into schema_migrations (filename) values ('0084_academy_netflix.sql')
on conflict (filename) do nothing;
