-- ============================================================
-- Autoatendimento de Tribo: Tribuno/Pretor (Closer) cria e edita
-- a própria Tribo (nome + logo) e convida membros (SDRs).
-- ============================================================

alter table tribos add column if not exists logo_url text;

-- ---------- Closer pode criar e editar a própria Tribo ----------
-- (Diretor continua com acesso total via a policy tribos_write já existente)

create policy tribos_insert_closer on tribos for insert
  with check (closer_id = auth.uid());

create policy tribos_update_closer on tribos for update
  using (closer_id = auth.uid())
  with check (closer_id = auth.uid());

-- Trava: closer pode mudar nome/logo da própria Tribo, mas não
-- pode se transferir de Exército nem passar a liderança pra outro closer.
create or replace function prevent_tribo_reassign()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not is_director() then
    if new.exercito_id <> old.exercito_id or new.closer_id is distinct from old.closer_id then
      raise exception 'Só o Diretor pode mudar o Exército ou o Closer responsável pela Tribo.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_prevent_tribo_reassign before update on tribos
  for each row execute function prevent_tribo_reassign();

-- ---------- Storage: bucket público pra logos de Tribo ----------

insert into storage.buckets (id, name, public)
values ('tribo-logos', 'tribo-logos', true)
on conflict (id) do nothing;

create policy tribo_logo_select on storage.objects for select
  using (bucket_id = 'tribo-logos');

create policy tribo_logo_insert on storage.objects for insert
  with check (bucket_id = 'tribo-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy tribo_logo_update on storage.objects for update
  using (bucket_id = 'tribo-logos' and (storage.foldername(name))[1] = auth.uid()::text);
