-- Comissão de Parceiro: closer/líder registram, por venda, quando existe
-- repasse a um parceiro (padrão 1% do crédito — mesmo % que
-- dre_configuracoes.pct_receita_parceiro já usa pra receita de parceiro;
-- acima disso só com aprovação do Diretor). `valor` nunca é armazenado —
-- sempre calculado (percentual/100 * weekly_operacoes.valor) na hora de
-- ler, mesmo padrão de dre.ts pra não guardar número que pode envelhecer.
--
-- cliente_id: campo reservado pro Diretor preencher a fonte confiável
-- futuramente (nota fiscal ao banco precisa disso) — não tem captura
-- automática ainda, fica null até ele resolver a origem do dado.
alter table weekly_operacoes add column if not exists cliente_id text;

create table comissoes_parceiro (
  id uuid primary key default gen_random_uuid(),
  weekly_operacao_id uuid not null unique references weekly_operacoes(id) on delete cascade,
  nome_parceiro text not null,
  percentual numeric not null default 1,
  chave_pix text not null,
  status text not null default 'ok' check (status in ('ok', 'pendente_aprovacao', 'aprovado')),
  criado_por uuid references profiles(id),
  aprovado_por uuid references profiles(id),
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table comissoes_parceiro enable row level security;

-- weekly_operacoes já é select-all pra qualquer autenticado (migration
-- 0025) — comissão de parceiro é dado da mesma venda, não é dado de
-- folha/salário, então segue a mesma permissividade. Escrita passa por
-- Server Action com client admin + exigirPermissaoOperacao (mesmo padrão
-- de forecast/actions.ts), não por RLS granular de insert/update.
create policy comissoes_parceiro_select_all on comissoes_parceiro for select using (true);

insert into schema_migrations (filename) values ('0042_comissao_parceiro.sql')
on conflict (filename) do nothing;
