-- Controle de migrations aplicadas. Rodadas manualmente uma a uma no SQL
-- Editor do Supabase (não tem CLI/DATABASE_URL linkado nesse projeto — ver
-- memória "Comissão arquitetura" da sessão de 2026-08-20) — sem tabela de
-- controle, é fácil rodar a mesma migration duas vezes ou perder o controle
-- de qual já foi aplicada. Backfilla as 30 migrations que já rodaram até
-- aqui (0001-0030) e, daqui pra frente, toda migration nova termina com um
-- insert nessa tabela (ver convenção no fim deste arquivo).
create table if not exists schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

insert into schema_migrations (filename) values
  ('0001_schema.sql'),
  ('0002_rls.sql'),
  ('0003_seed.sql'),
  ('0004_fix_role_trigger.sql'),
  ('0005_seed_trilha.sql'),
  ('0006_tribo_selfservice.sql'),
  ('0007_metas_mensais.sql'),
  ('0008_marcos.sql'),
  ('0009_avatar_midia_enquetes.sql'),
  ('0010_enquetes_tabelas.sql'),
  ('0011_features_por_papel.sql'),
  ('0012_marcos_fotos.sql'),
  ('0013_mais_conselhos_sabio.sql'),
  ('0014_zerar_tribos.sql'),
  ('0015_vendas_cliente.sql'),
  ('0016_compromissos_insert_gestor.sql'),
  ('0017_legado_extra.sql'),
  ('0018_campanhas.sql'),
  ('0019_legado_nome_planilha.sql'),
  ('0020_papel_producao.sql'),
  ('0021_tribos_reais.sql'),
  ('0022_nomes_planilha_array.sql'),
  ('0023_weekly_operacoes.sql'),
  ('0024_forecast_operacoes.sql'),
  ('0025_weekly_operacoes_select_all.sql'),
  ('0026_marcos_resgates.sql'),
  ('0027_campanhas_lider.sql'),
  ('0028_forecast_motivo_queda.sql'),
  ('0029_forecast_novos_status.sql'),
  ('0030_comissao_papeis.sql'),
  ('0031_schema_migrations.sql')
on conflict (filename) do nothing;

-- CONVENÇÃO a partir daqui: toda migration nova (0032 em diante) deve
-- terminar com:
--   insert into schema_migrations (filename) values ('00XX_nome.sql');
-- Antes de rodar uma migration no SQL Editor, dá pra conferir se já foi
-- aplicada com:
--   select * from schema_migrations where filename = '00XX_nome.sql';
