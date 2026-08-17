-- ============================================================
-- Portal Executivo Matri Bank — Schema inicial
-- Rodar este arquivo INTEIRO no SQL Editor do Supabase, de uma vez.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
create type app_role as enum ('sdr','closer','lider','diretor');
create type app_rank as enum ('legionario','centuriao','tribuno','pretor','legado','diretor');
create type funil_etapa as enum ('tentativas','alos','conexoes','entrevistas','subidos','assinaturas','pagos');
create type compromisso_status as enum ('cumprido','andamento','nao_cumprido');
create type contestacao_status as enum ('aberto','resolvido');
create type estrela_tipo as enum ('cheia','meia','penalidade');
create type promotion_transicao as enum ('legionario_centuriao','centuriao_tribuno','tribuno_pretor','pretor_legado');
create type promotion_criterio_tipo as enum ('auto','manual','strikes');
create type promotion_status as enum ('pendente','aprovado','rejeitado');
create type mural_tipo as enum ('aviso','reconhecimento');
create type task_coluna as enum ('backlog','afazer','andamento','bloqueado','concluido');
create type task_prioridade as enum ('alta','media','baixa');
create type venda_tipo as enum ('individual','tribo','exercito');

-- ---------- ORGANIZAÇÃO ----------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_emoji text,
  role app_role not null default 'sdr',
  rank app_rank not null default 'legionario',
  tribo_id uuid, -- FK adicionada depois (quebra de referência circular com tribos)
  stars_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create table exercitos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  legado_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table tribos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  exercito_id uuid not null references exercitos(id) on delete cascade,
  closer_id uuid unique references profiles(id),
  created_at timestamptz not null default now(),
  unique (exercito_id, nome)
);

alter table profiles
  add constraint profiles_tribo_id_fkey foreign key (tribo_id) references tribos(id);

-- ---------- PRODUÇÃO & VENDAS (fonte: Google Sheets, sync via job) ----------

create table producao_funil (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  data date not null,
  etapa funil_etapa not null,
  realizado integer not null default 0,
  meta integer not null default 0,
  synced_at timestamptz not null default now(),
  unique (profile_id, data, etapa)
);
create index idx_producao_funil_profile_data on producao_funil (profile_id, data);

create table vendas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  tipo venda_tipo not null default 'individual',
  valor numeric not null,
  data date not null,
  origem text,
  multiplicador integer not null default 1,
  sheet_ref text,
  synced_at timestamptz not null default now()
);
create index idx_vendas_profile_data on vendas (profile_id, data);

-- ---------- COMPROMISSO DIÁRIO (nativo) ----------

create table compromissos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  data date not null,
  entrevistas_comp integer not null default 0,
  entrevistas_real integer not null default 0,
  assinaturas_comp integer not null default 0,
  assinaturas_real integer not null default 0,
  pagos_comp integer not null default 0,
  pagos_real integer not null default 0,
  valor_pago_comp numeric not null default 0,
  valor_pago_real numeric not null default 0,
  status compromisso_status not null default 'andamento',
  falta boolean not null default false,
  lancado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, data)
);

-- ---------- COMISSÃO ----------

create table commission_tiers (
  id uuid primary key default gen_random_uuid(),
  rank app_rank not null,
  producao_min numeric not null,
  fixo numeric not null,
  pct_variavel numeric not null,
  ordem integer not null,
  unique (rank, ordem)
);

create table comissao_mensal (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  ano integer not null,
  mes integer not null,
  producao_realizada numeric not null default 0,
  fixo numeric not null default 0,
  variavel numeric not null default 0,
  total numeric not null default 0,
  calculado_em timestamptz not null default now(),
  unique (profile_id, ano, mes)
);

create table contestacoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  venda_id uuid references vendas(id),
  referencia text,
  valor_contestado numeric,
  motivo text not null,
  status contestacao_status not null default 'aberto',
  resposta text,
  resolvido_por uuid references profiles(id),
  resolvido_em timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- ESTRELAS & STRIKES ----------

create table estrelas_eventos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  tipo estrela_tipo not null,
  quantidade numeric not null,
  motivo text,
  semana_ref date,
  created_at timestamptz not null default now()
);

create table strikes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  motivo text not null,
  registrado_por uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- CARREIRA / PROMOÇÃO ----------

create table promotion_criteria (
  id uuid primary key default gen_random_uuid(),
  transicao promotion_transicao not null,
  bloco integer not null check (bloco between 1 and 5),
  texto text not null,
  tipo promotion_criterio_tipo not null,
  target_value numeric,
  dias_strikes integer,
  ordem integer not null default 0
);

create table promotion_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  criterio_id uuid not null references promotion_criteria(id),
  status promotion_status not null default 'pendente',
  valor_atual text,
  evidencia_url text,
  registrado_por uuid references profiles(id),
  decidido_por uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table promotion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  transicao promotion_transicao not null,
  status promotion_status not null default 'pendente',
  praetorium_aprovado boolean not null default false,
  decidido_por uuid references profiles(id),
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);

create table pdi_registros (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade, -- liderado
  autor_id uuid not null references profiles(id), -- líder
  observacao text not null,
  plano_acao text,
  proxima_revisao date,
  created_at timestamptz not null default now()
);

create table metas_pessoais (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  nivel_alvo app_rank not null,
  data_alvo date not null,
  created_at timestamptz not null default now()
);

-- ---------- MURAL ----------

create table mural_posts (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references profiles(id),
  tipo mural_tipo not null,
  titulo text not null,
  corpo text,
  midia_url text,
  alvo_profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table sage_quotes (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  fonte text not null,
  contexto_tags text[] not null default '{}',
  ativo boolean not null default true
);

-- ---------- TRILHA & BIBLIOTECA ----------

create table trilha_modulos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nivel_min app_rank not null,
  formato text,
  ordem integer not null default 0,
  conteudo_url text,
  grupo_visibilidade text[]
);

create table trilha_progresso (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  modulo_id uuid not null references trilha_modulos(id) on delete cascade,
  concluido_em timestamptz not null default now(),
  unique (profile_id, modulo_id)
);

create table biblioteca_livros (
  id uuid primary key default gen_random_uuid(),
  nivel app_rank not null,
  titulo text not null,
  autor text not null,
  ordem integer not null default 0
);

create table biblioteca_escolhas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  livro_id uuid not null references biblioteca_livros(id),
  apresentado boolean not null default false,
  apresentado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, livro_id)
);

-- ---------- TAREFAS (Gestão de Atividades) ----------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  titulo text not null,
  due_date date,
  coluna task_coluna not null default 'backlog',
  prioridade task_prioridade not null default 'media',
  privado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- MÉTRICAS MANUAIS (ex: Match Sales — fonte ainda não confirmada) ----------

create table metricas_manuais (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  metrica text not null,
  valor numeric not null,
  periodo date not null,
  registrado_por uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- SYNC LOG (integração Google Sheets — usado a partir da fase de integração) ----------

create table sync_log (
  id uuid primary key default gen_random_uuid(),
  fonte text not null, -- ex: 'google_sheets:producao'
  status text not null, -- 'ok' | 'erro'
  detalhe text,
  executado_em timestamptz not null default now()
);

-- ---------- updated_at automático ----------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_compromissos_updated_at before update on compromissos
  for each row execute function set_updated_at();
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

-- ---------- perfil automático ao criar usuário no Auth ----------
-- Cria uma linha mínima em profiles quando alguém é convidado/criado no Supabase Auth.
-- Papel/nível/tribo ficam default (sdr/legionario) até o Diretor ajustar manualmente.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
