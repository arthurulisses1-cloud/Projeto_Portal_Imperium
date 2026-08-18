-- ============================================================
-- Foto de perfil, mídia (foto/vídeo) em posts do mural e o novo
-- valor de enum pra Enquetes (polls) que o Diretor pode criar.
-- O resto de Enquetes fica em 0010, porque um novo valor de enum
-- não pode ser usado em comparações na MESMA transação em que foi
-- criado — precisa ser um "Run" separado.
-- ============================================================

set search_path = public;

alter table profiles add column if not exists avatar_url text;

-- Observação livre do Diretor sobre cada pessoa (usada em "Meu Legado")
alter table profiles add column if not exists observacao_diretor text;

-- ---------- Storage: bucket público pra foto de perfil ----------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_select on storage.objects for select
  using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Storage: bucket público pra mídia do Mural (fotos/vídeos) ----------

insert into storage.buckets (id, name, public)
values ('mural-midia', 'mural-midia', true)
on conflict (id) do nothing;

create policy mural_midia_select on storage.objects for select
  using (bucket_id = 'mural-midia');

create policy mural_midia_insert on storage.objects for insert
  with check (bucket_id = 'mural-midia' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Enquetes (parte 1: só o valor de enum) ----------

alter type mural_tipo add value if not exists 'enquete';
