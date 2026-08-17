-- ============================================================
-- Correção: prevent_role_escalation() bloqueava edições feitas
-- direto pelo Table Editor / SQL Editor do Supabase, porque
-- auth.uid() é nulo fora de uma chamada autenticada via app.
-- Acesso direto ao banco (Studio, SQL Editor, service role) já
-- é confiável por natureza — a trava deve valer só pro app.
-- ============================================================

create or replace function prevent_role_escalation()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not is_director() then
    if new.role <> old.role or new.rank <> old.rank
       or new.tribo_id is distinct from old.tribo_id
       or new.stars_total <> old.stars_total then
      raise exception 'Somente o Diretor pode alterar papel, nível, tribo ou estrelas.';
    end if;
  end if;
  return new;
end;
$$;
