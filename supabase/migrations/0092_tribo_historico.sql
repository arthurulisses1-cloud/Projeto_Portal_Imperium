set search_path = public;

-- Histórico de Tribo por pessoa. profiles.tribo_id continua sendo a tribo
-- ATUAL; esta tabela guarda onde cada pessoa estava em cada período, pra que
-- trocar alguém de equipe não reescreva o que ela produziu antes (Remuneração,
-- DRE e Weekly leem daqui pela data da venda).

create table if not exists profile_tribo_historico (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  tribo_id uuid not null references tribos(id) on delete cascade,
  desde date not null,
  ate date, -- inclusivo; null = vigente
  created_at timestamptz not null default now()
);
create index if not exists idx_ptr_hist_profile on profile_tribo_historico (profile_id, desde);
create unique index if not exists uq_ptr_hist_vigente on profile_tribo_historico (profile_id) where ate is null;

alter table profile_tribo_historico enable row level security;

drop policy if exists "ptr_hist_select" on profile_tribo_historico;
create policy "ptr_hist_select" on profile_tribo_historico
  for select to authenticated using (true);

drop policy if exists "ptr_hist_diretor_all" on profile_tribo_historico;
create policy "ptr_hist_diretor_all" on profile_tribo_historico
  for all to authenticated using (is_director()) with check (is_director());

-- Semente: cada pessoa com tribo hoje fica nela "desde sempre" (comportamento
-- idêntico ao de antes do histórico).
insert into profile_tribo_historico (profile_id, tribo_id, desde)
select p.id, p.tribo_id, date '2000-01-01'
from profiles p
where p.tribo_id is not null
  and not exists (select 1 from profile_tribo_historico h where h.profile_id = p.id);

-- Fernando César: Prometheus até 12/10/2026, Mirmidões a partir de 13/10/2026.
-- (Feito ANTES do gatilho abaixo existir, com datas explícitas.)
do $$
declare
  v_pessoa uuid;
  v_antiga uuid;
  v_nova uuid;
begin
  select id, tribo_id into v_pessoa, v_antiga from profiles where full_name like 'Fernando César%' limit 1;
  select t.id into v_nova from tribos t join exercitos e on e.id = t.exercito_id
    where t.nome = 'Mirmidões' and e.nome = 'Templários';
  if v_pessoa is not null and v_nova is not null and v_antiga is distinct from v_nova then
    update profile_tribo_historico set ate = date '2026-10-12' where profile_id = v_pessoa and ate is null;
    insert into profile_tribo_historico (profile_id, tribo_id, desde) values (v_pessoa, v_nova, date '2026-10-13');
    update profiles set tribo_id = v_nova where id = v_pessoa;
  end if;
end $$;

-- Daqui pra frente, qualquer troca de tribo (Gestão > atualizarTribo) fecha o
-- período antigo no dia anterior e abre o novo hoje (horário de Brasília).
create or replace function registrar_historico_tribo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.tribo_id is not distinct from old.tribo_id then
    return new;
  end if;
  -- troca no mesmo dia de uma abertura: só corrige o período vigente
  update profile_tribo_historico set ate = v_hoje - 1
    where profile_id = new.id and ate is null and desde < v_hoje;
  delete from profile_tribo_historico where profile_id = new.id and ate is null and desde >= v_hoje;
  if new.tribo_id is not null then
    insert into profile_tribo_historico (profile_id, tribo_id, desde) values (new.id, new.tribo_id, v_hoje);
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_historico_tribo on profiles;
create trigger trg_profiles_historico_tribo
  after update of tribo_id on profiles
  for each row execute function registrar_historico_tribo();
