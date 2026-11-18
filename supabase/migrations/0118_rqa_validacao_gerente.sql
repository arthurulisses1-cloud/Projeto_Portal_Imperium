-- Validação do gerente comercial de cada RQA (Auditoria → RQA, só na Acrópole; decisão de 18/11/2026).
-- O gerente (Diretor ou Head do negócio) aprova ou reprova a RQA de uma reunião realizada, concordando ou
-- não com o closer (campo "RQA validada?" do Pipefácil). É ela que conta para a comissão de RQA do BDR.
-- Uma decisão por lead do Pipefácil (deal_id) em cada negócio; sem linha = ainda sem validação.
-- Como as tabelas da integração (crm_deals, crm_eventos): RLS ligada e sem política para o app; só o
-- servidor lê e grava (service role), depois de conferir quem é o usuário.
set search_path = public;

create table if not exists rqa_gerente (
  negocio_id uuid not null references negocios(id) on delete cascade,
  deal_id text not null,
  decisao text not null check (decisao in ('aprovada', 'reprovada')),
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references profiles(id) on delete set null,
  primary key (negocio_id, deal_id)
);

alter table rqa_gerente enable row level security;
