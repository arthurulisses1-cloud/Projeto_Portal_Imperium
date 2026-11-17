-- ============================================================
-- Agendamento das sincronizações pelo próprio Supabase (2026-11-15).
--
-- O cron do GitHub Actions (a cada 30 min) atrasava ou pulava horários e, na
-- prática, rodava umas duas vezes por dia. O plano da Vercel só permite cron
-- diário. Aqui o pg_cron chama os endpoints do portal a cada 30 min, das 8h às
-- 20h de Brasília (11h-23h UTC), via pg_net.
--
-- O CRON_SECRET NÃO fica neste arquivo: ele é lido do Vault (segredo
-- "cron_secret"), criado à parte no SQL Editor com:
--   select vault.create_secret('<valor do CRON_SECRET>', 'cron_secret');
-- Sem o segredo, a função só registra um aviso e não chama nada.
-- ============================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.disparar_sync(caminho text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  segredo text;
begin
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if segredo is null then
    raise warning 'disparar_sync: segredo cron_secret ausente no Vault';
    return;
  end if;
  perform net.http_get(
    url := 'https://projeto-portal-imperium-chi.vercel.app' || caminho,
    headers := jsonb_build_object('x-sync-secret', segredo),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Só o agendador (postgres) chama; ninguém pelo app/API.
revoke all on function public.disparar_sync(text) from public, anon, authenticated;

-- cron.schedule com o mesmo nome substitui o agendamento: rodar de novo é seguro.
select cron.schedule('sync-planilha', '*/30 11-23 * * *', $$select public.disparar_sync('/api/sync')$$);
select cron.schedule('sync-integracoes', '*/30 11-23 * * *', $$select public.disparar_sync('/api/sync-integracoes')$$);

insert into schema_migrations (filename) values ('0111_agendamento_sync_pg_cron.sql') on conflict (filename) do nothing;
