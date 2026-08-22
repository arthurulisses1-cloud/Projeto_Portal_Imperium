-- Nunca existia policy de delete pra mural_posts (avisos/reconhecimentos/
-- enquetes) — RLS nega por padrão sem policy, então não dava pra apagar
-- nada. Autor apaga o próprio post; Diretor apaga qualquer um (moderação).
create policy mural_delete on mural_posts for delete using (
  autor_id = auth.uid() or is_director()
);

insert into schema_migrations (filename) values ('0035_mural_posts_delete.sql')
on conflict (filename) do nothing;
