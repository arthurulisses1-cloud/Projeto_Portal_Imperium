-- ============================================================
-- Portal Executivo Matri Bank — RLS (Row-Level Security)
-- Rodar DEPOIS do 0001_schema.sql, no SQL Editor do Supabase.
--
-- Regra de visibilidade aplicada:
--  - Produção/Vendas (Ranking): visível pra todo mundo autenticado —
--    decisão de cultura da empresa, já confirmada na especificação (4.5).
--  - Comissão e Strikes: só o próprio dono + Diretor. Nem o Líder
--    vê a comissão/strike individual de um liderado.
--  - Compromisso/PDI/Estrelas/Tarefas de time: dono + Closer da Tribo +
--    Líder do Exército + Diretor.
--  - Diretor: acesso de leitura total.
-- ============================================================

-- ---------- FUNÇÕES AUXILIARES (security definer p/ evitar recursão de RLS) ----------

create or replace function my_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_director()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'diretor' from profiles where id = auth.uid()), false);
$$;

create or replace function profile_tribo_id(target uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select tribo_id from profiles where id = target;
$$;

create or replace function profile_exercito_id(target uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from exercitos where legado_id = target),
    (select t.exercito_id from profiles p join tribos t on t.id = p.tribo_id where p.id = target)
  );
$$;

-- true se o usuário logado é o Líder (Legado) do Exército informado
create or replace function is_lider_of_exercito(target_exercito uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exercitos e
    where e.id = target_exercito and e.legado_id = auth.uid()
  );
$$;

-- true se o usuário logado é o Closer (Tribuno/Pretor) da Tribo informada
create or replace function is_closer_of_tribo(target_tribo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tribos t
    where t.id = target_tribo and t.closer_id = auth.uid()
  );
$$;

-- ---------- HABILITAR RLS EM TODAS AS TABELAS ----------

alter table profiles enable row level security;
alter table exercitos enable row level security;
alter table tribos enable row level security;
alter table producao_funil enable row level security;
alter table vendas enable row level security;
alter table compromissos enable row level security;
alter table commission_tiers enable row level security;
alter table comissao_mensal enable row level security;
alter table contestacoes enable row level security;
alter table estrelas_eventos enable row level security;
alter table strikes enable row level security;
alter table promotion_criteria enable row level security;
alter table promotion_evidence enable row level security;
alter table promotion_requests enable row level security;
alter table pdi_registros enable row level security;
alter table metas_pessoais enable row level security;
alter table mural_posts enable row level security;
alter table sage_quotes enable row level security;
alter table trilha_modulos enable row level security;
alter table trilha_progresso enable row level security;
alter table biblioteca_livros enable row level security;
alter table biblioteca_escolhas enable row level security;
alter table tasks enable row level security;
alter table metricas_manuais enable row level security;
alter table sync_log enable row level security;

-- ---------- PROFILES ----------
-- Nome/tribo/rank são visíveis pra todo mundo (necessário pro Ranking e tags de Tribo).
-- Ninguém edita o próprio papel/nível/tribo/estrelas — só o Diretor.

create policy profiles_select_all on profiles for select using (true);
create policy profiles_update_own on profiles for update
  using (id = auth.uid() or is_director())
  with check (id = auth.uid() or is_director());

create or replace function prevent_role_escalation()
returns trigger language plpgsql as $$
begin
  if not is_director() then
    if new.role <> old.role or new.rank <> old.rank
       or new.tribo_id is distinct from old.tribo_id
       or new.stars_total <> old.stars_total then
      raise exception 'Somente o Diretor pode alterar papel, nível, tribo ou estrelas.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_prevent_role_escalation before update on profiles
  for each row execute function prevent_role_escalation();

-- ---------- ESTRUTURA ORGANIZACIONAL ----------

create policy exercitos_select_all on exercitos for select using (true);
create policy exercitos_write on exercitos for all using (is_director()) with check (is_director());

create policy tribos_select_all on tribos for select using (true);
create policy tribos_write on tribos for all using (is_director()) with check (is_director());

-- ---------- PRODUÇÃO & VENDAS ----------
-- Visível pra todo mundo autenticado (Ranking expõe nome + tribo + valor sem restrição).
-- Escrita só via job de sync (service role, que ignora RLS) — sem política de insert/update.

create policy producao_select_all on producao_funil for select using (true);
create policy vendas_select_all on vendas for select using (true);

-- ---------- COMPROMISSO DIÁRIO ----------

create policy compromissos_select on compromissos for select using (
  profile_id = auth.uid()
  or is_closer_of_tribo(profile_tribo_id(profile_id))
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy compromissos_insert_own on compromissos for insert with check (profile_id = auth.uid());
create policy compromissos_update on compromissos for update using (
  profile_id = auth.uid()
  or is_closer_of_tribo(profile_tribo_id(profile_id))
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);

-- ---------- COMISSÃO (privado: dono + Diretor, sempre) ----------

create policy commission_tiers_select_all on commission_tiers for select using (true);
create policy commission_tiers_write on commission_tiers for all using (is_director()) with check (is_director());

create policy comissao_select on comissao_mensal for select using (
  profile_id = auth.uid() or is_director()
);
-- sem policy de insert/update: cálculo é feito por job com service role

create policy contestacoes_select on contestacoes for select using (
  profile_id = auth.uid() or is_director()
);
create policy contestacoes_insert on contestacoes for insert with check (profile_id = auth.uid());
create policy contestacoes_update on contestacoes for update using (is_director());

-- ---------- ESTRELAS & STRIKES ----------

create policy estrelas_select on estrelas_eventos for select using (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);

create policy strikes_select on strikes for select using (
  profile_id = auth.uid() or registrado_por = auth.uid() or is_director()
);
create policy strikes_insert on strikes for insert with check (
  is_director()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_closer_of_tribo(profile_tribo_id(profile_id))
);

-- ---------- CARREIRA / PROMOÇÃO ----------

create policy promotion_criteria_select_all on promotion_criteria for select using (true);
create policy promotion_criteria_write on promotion_criteria for all using (is_director()) with check (is_director());

create policy promo_evidence_select on promotion_evidence for select using (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy promo_evidence_insert on promotion_evidence for insert with check (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy promo_evidence_update on promotion_evidence for update using (is_director());

create policy promo_requests_select on promotion_requests for select using (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy promo_requests_insert on promotion_requests for insert with check (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy promo_requests_update on promotion_requests for update using (is_director());

create policy pdi_select on pdi_registros for select using (
  profile_id = auth.uid()
  or autor_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy pdi_insert on pdi_registros for insert with check (
  autor_id = auth.uid() and (
    is_lider_of_exercito(profile_exercito_id(profile_id))
    or is_closer_of_tribo(profile_tribo_id(profile_id))
    or is_director()
  )
);

create policy metas_pessoais_select on metas_pessoais for select using (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy metas_pessoais_insert on metas_pessoais for insert with check (profile_id = auth.uid());

-- ---------- MURAL ----------

create policy mural_select_all on mural_posts for select using (true);
create policy mural_insert on mural_posts for insert with check (
  autor_id = auth.uid() and (
    (tipo = 'aviso' and my_role() in ('lider','diretor'))
    or (tipo = 'reconhecimento' and my_role() in ('closer','lider','diretor'))
  )
);

create policy sage_quotes_select_all on sage_quotes for select using (true);
create policy sage_quotes_write on sage_quotes for all using (is_director()) with check (is_director());

-- ---------- TRILHA & BIBLIOTECA ----------

create policy trilha_modulos_select_all on trilha_modulos for select using (true);
create policy trilha_modulos_write on trilha_modulos for all using (is_director()) with check (is_director());

create policy trilha_progresso_select on trilha_progresso for select using (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy trilha_progresso_insert on trilha_progresso for insert with check (profile_id = auth.uid());

create policy biblioteca_livros_select_all on biblioteca_livros for select using (true);
create policy biblioteca_livros_write on biblioteca_livros for all using (is_director()) with check (is_director());

create policy biblioteca_escolhas_select on biblioteca_escolhas for select using (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy biblioteca_escolhas_insert on biblioteca_escolhas for insert with check (profile_id = auth.uid());
create policy biblioteca_escolhas_update on biblioteca_escolhas for update using (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);

-- ---------- TAREFAS ----------

create policy tasks_select on tasks for select using (
  profile_id = auth.uid()
  or is_director()
  or (privado = false and (
    is_closer_of_tribo(profile_tribo_id(profile_id))
    or is_lider_of_exercito(profile_exercito_id(profile_id))
  ))
);
create policy tasks_insert on tasks for insert with check (profile_id = auth.uid());
create policy tasks_update on tasks for update using (profile_id = auth.uid() or is_director());
create policy tasks_delete on tasks for delete using (profile_id = auth.uid() or is_director());

-- ---------- MÉTRICAS MANUAIS ----------

create policy metricas_manuais_select on metricas_manuais for select using (
  profile_id = auth.uid()
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
create policy metricas_manuais_insert on metricas_manuais for insert with check (
  is_lider_of_exercito(profile_exercito_id(profile_id)) or is_director()
);

-- ---------- SYNC LOG ----------

create policy sync_log_select on sync_log for select using (is_director());
