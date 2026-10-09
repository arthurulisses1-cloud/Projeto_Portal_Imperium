-- ============================================================
-- Subidos (compliance) + ciclo de recuperação de leads (pedido do Diretor,
-- 2026-10-09).
--
-- 1) "Subido" passa a ser REGISTRADO no Senatus (data + observação ao mover
--    o card pra essa etapa) e o resultado do compliance — que sai de um
--    sistema próprio da empresa, sem integração — é lançado à mão pelo
--    consultor numa sub-visão de "Meus Leads". Os resultados possíveis
--    viram um catálogo editável pelo Diretor (compliance_resultados), com
--    um "comportamento" fixo que é o que o código entende:
--      aguardando | pendencia | reanalise | queda | aprovado
-- 2) Cobrança de atualização: quem é responsável pelo lead é cobrado a
--    cada 2 dias (ultima_atualizacao_em), 1 dia após subir.
-- 3) Rotação de leads parados: 30 dias sem movimento → o lead vai pra outro
--    closer (fase 'diagnostico'), 30 dias depois volta pro closer original
--    ('retorno_original'), e assim por diante (ver src/lib/leads-rotacao.ts).
-- ============================================================
set search_path = public;

create table if not exists compliance_resultados (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  comportamento text not null check (comportamento in ('aguardando', 'pendencia', 'reanalise', 'queda', 'aprovado')),
  ativo boolean not null default true,
  ordem int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table compliance_resultados enable row level security;
create policy compliance_resultados_select on compliance_resultados for select using (true);
create policy compliance_resultados_write on compliance_resultados for all
  using (is_director()) with check (is_director());

-- Sementes provisórias — o Diretor ajusta/adiciona os reais na própria tela.
insert into compliance_resultados (nome, comportamento, ordem) values
  ('Aguardando análise', 'aguardando', 1),
  ('Aprovado', 'aprovado', 2),
  ('Pendência a resolver', 'pendencia', 3),
  ('Reanálise', 'reanalise', 4),
  ('Queda', 'queda', 5);

-- ---------- Subido + compliance ----------
alter table entrevistas_leads add column if not exists subido_em date;
alter table entrevistas_leads add column if not exists subido_obs text;
alter table entrevistas_leads add column if not exists subido_por uuid references profiles(id);
alter table entrevistas_leads add column if not exists compliance_resultado_id uuid references compliance_resultados(id);
-- Cópia do comportamento do resultado escolhido: evita join em toda leitura
-- (pendências do menu lateral rodam em TODA página) e preserva o histórico
-- se o Diretor mudar o catálogo depois.
alter table entrevistas_leads add column if not exists compliance_comportamento text;
alter table entrevistas_leads add column if not exists compliance_obs text;
alter table entrevistas_leads add column if not exists compliance_atualizado_em timestamptz;
alter table entrevistas_leads add column if not exists compliance_atualizado_por uuid references profiles(id);
alter table entrevistas_leads add column if not exists pendencia_prazo date;

-- ---------- Cobrança e rotação ----------
-- Última vez que alguém registrou "atualização de status" desse lead
-- (cobrança a cada 2 dias) e último MOVIMENTO real (troca de etapa,
-- resultado de compliance) — é esse que zera o relógio de 30 dias.
alter table entrevistas_leads add column if not exists ultima_atualizacao_em timestamptz;
alter table entrevistas_leads add column if not exists ultimo_movimento_em timestamptz not null default now();

-- Quem está com o lead na rotação (null = fica com o closer original),
-- em qual fase, desde quando, quais closers já tentaram e quantos ciclos.
alter table entrevistas_leads add column if not exists rot_responsavel_id uuid references profiles(id);
alter table entrevistas_leads add column if not exists rot_fase text check (rot_fase in ('diagnostico', 'retorno_original'));
alter table entrevistas_leads add column if not exists rot_desde date;
alter table entrevistas_leads add column if not exists rot_tentaram uuid[] not null default '{}';
alter table entrevistas_leads add column if not exists rot_ciclos int not null default 0;
alter table entrevistas_leads add column if not exists rot_primeiro_toque_em timestamptz;

create index if not exists entrevistas_leads_rot_resp_idx on entrevistas_leads(rot_responsavel_id);
create index if not exists entrevistas_leads_status_idx on entrevistas_leads(status_followup);

-- Leads que já existem ganham 30 dias de carência (default now() acima) —
-- senão a primeira rodada da rotação redistribuiria tudo de uma vez.
update entrevistas_leads set subido_em = coalesce(status_em, criado_em)::date where status_followup = 'subido' and subido_em is null;

-- ---------- Histórico de atualizações ----------
create table if not exists lead_atualizacoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references entrevistas_leads(id) on delete cascade,
  autor_id uuid references profiles(id),
  tipo text not null, -- 'subido' | 'compliance' | 'atualizacao' | 'diagnostico' | 'rotacao' | 'etapa'
  nota text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists lead_atualizacoes_lead_idx on lead_atualizacoes(lead_id, criado_em desc);

alter table lead_atualizacoes enable row level security;
-- Quem enxerga o lead enxerga o histórico (a subquery respeita a RLS de
-- entrevistas_leads); quem enxerga o lead pode anotar nele.
create policy lead_atualizacoes_select on lead_atualizacoes for select using (
  exists (select 1 from entrevistas_leads l where l.id = lead_id)
);
create policy lead_atualizacoes_insert on lead_atualizacoes for insert with check (
  autor_id = auth.uid() and exists (select 1 from entrevistas_leads l where l.id = lead_id)
);

-- ---------- Quem recebe o lead na rotação precisa enxergar e editar ----------
create policy entrevistas_leads_select_rot on entrevistas_leads for select using (rot_responsavel_id = auth.uid());
create policy entrevistas_leads_update_rot on entrevistas_leads for update using (rot_responsavel_id = auth.uid());

insert into schema_migrations (filename) values ('0089_subidos_e_recuperacao.sql') on conflict do nothing;
