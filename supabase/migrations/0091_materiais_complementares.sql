-- ============================================================
-- Imperioflix: materiais enviados direto na aula, materiais complementares
-- (links de artigos, vídeos, PDFs...) e check de "visto" por material
-- (pedido do Diretor, 2026-10-13).
-- ============================================================
set search_path = public;

-- 1) academy_materiais passa a servir também pra itens de módulo (antes só
--    aula). aula_id deixa de ser obrigatório; a linha precisa apontar pra
--    uma aula OU pra um item de módulo.
alter table academy_materiais alter column aula_id drop not null;
alter table academy_materiais add column if not exists modulo_item_id uuid references academy_modulo_itens(id) on delete cascade;
alter table academy_materiais drop constraint if exists academy_materiais_alvo_check;
alter table academy_materiais add constraint academy_materiais_alvo_check check (aula_id is not null or modulo_item_id is not null);
create index if not exists academy_materiais_item_idx on academy_materiais(modulo_item_id);
-- (as políticas de 0068 já servem: insert por Diretor ou instrutor da aula;
--  em material de módulo, aula_id é null e só o Diretor passa.)

-- 2) Materiais complementares: links (artigo, vídeo, PDF, outro) ou arquivos
--    já enviados pro Storage, ligados a uma aula ou a um item de módulo.
create table if not exists academy_complementos (
  id uuid primary key default gen_random_uuid(),
  alvo_tipo text not null check (alvo_tipo in ('academy_aula', 'academy_modulo_item')),
  alvo_id uuid not null,
  titulo text not null,
  url text not null,
  tipo text not null default 'outro' check (tipo in ('artigo', 'video', 'pdf', 'outro')),
  enviado_por uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists academy_complementos_alvo_idx on academy_complementos(alvo_tipo, alvo_id);

alter table academy_complementos enable row level security;
create policy academy_complementos_select on academy_complementos for select using (true);
create policy academy_complementos_insert on academy_complementos for insert
  with check (
    enviado_por = auth.uid()
    and (
      is_director()
      or (alvo_tipo = 'academy_aula' and exists (select 1 from academy_aulas a where a.id = alvo_id and a.instrutor_id = auth.uid()))
    )
  );
create policy academy_complementos_delete on academy_complementos for delete
  using (is_director() or enviado_por = auth.uid());

-- 3) "Visto" por material: academy_progresso passa a aceitar também
--    materiais e complementares como alvo.
alter table academy_progresso drop constraint if exists academy_progresso_alvo_tipo_check;
alter table academy_progresso add constraint academy_progresso_alvo_tipo_check
  check (alvo_tipo in ('academy_aula', 'academy_modulo_item', 'academy_material', 'academy_complemento'));

insert into schema_migrations (filename) values ('0091_materiais_complementares.sql') on conflict do nothing;
