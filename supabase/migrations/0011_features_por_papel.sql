-- ============================================================
-- Features por papel: data de admissão (aniversário de empresa),
-- feedback do Closer pro SDR, e motivo de perda estruturado (Closer).
-- Reaproveita tabelas já existentes: pdi_registros (1:1 do Líder) e
-- tasks (follow-ups do Closer) — nenhuma mudança de schema pra elas.
-- ============================================================

set search_path = public;

alter table profiles add column if not exists data_admissao date;

-- ---------- Feedback do Closer pro SDR (loop de qualidade) ----------

create table if not exists feedbacks_sdr (
  id uuid primary key default gen_random_uuid(),
  sdr_id uuid not null references profiles(id) on delete cascade,
  closer_id uuid not null references profiles(id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now()
);

alter table feedbacks_sdr enable row level security;

create policy feedbacks_sdr_select on feedbacks_sdr for select using (
  sdr_id = auth.uid() or closer_id = auth.uid() or public.is_director()
);

create policy feedbacks_sdr_insert on feedbacks_sdr for insert with check (
  (closer_id = auth.uid() and public.is_closer_of_tribo(public.profile_tribo_id(sdr_id)))
  or public.is_director()
);

-- ---------- Motivo de perda estruturado (diagnóstico qualitativo do Closer) ----------

create table if not exists perdas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  motivo text not null,
  observacao text,
  data date not null default current_date,
  created_at timestamptz not null default now()
);

alter table perdas enable row level security;

create policy perdas_select on perdas for select using (
  profile_id = auth.uid()
  or public.is_director()
  or public.is_lider_of_exercito(public.profile_exercito_id(profile_id))
);

create policy perdas_insert on perdas for insert with check (profile_id = auth.uid());
create policy perdas_delete on perdas for delete using (profile_id = auth.uid() or public.is_director());
