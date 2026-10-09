-- ============================================================
-- Entrevista recusada + funil "Repasse Entrevistas" (pedido do Diretor,
-- 2026-10-09).
--
-- Entrevista que o closer NÃO valida vira "Entrevista Recusada" (com
-- confirmação + motivo obrigatórios). Em D+15 o lead é atribuído a um SDR de
-- OUTRO Exército (diferente do SDR original), que tenta gerar uma nova
-- entrevista. O SDR trabalha o lead no funil de Repasse (4 etapas) e, se
-- recuperar, o lead volta pro funil principal pro closer original validar.
--
-- Também ganha o funil de Repasse dos CLOSERS (rot_etapa): a rotação de 30 dias
-- da 0089 passa a ter etapas, espelhando o funil de repasse dos SDRs.
--
-- Rodar DEPOIS da 0089.
-- ============================================================
set search_path = public;

alter type lead_status_followup add value if not exists 'entrevista_recusada';

alter table entrevistas_leads add column if not exists recusada_em date;
alter table entrevistas_leads add column if not exists recusa_motivo text;
alter table entrevistas_leads add column if not exists recusada_por uuid references profiles(id);

-- Repasse pra SDR: quem está com o lead, em qual etapa do funil de repasse,
-- desde quando, e quais SDRs já tentaram (pra nunca repetir o mesmo).
alter table entrevistas_leads add column if not exists repasse_sdr_id uuid references profiles(id);
alter table entrevistas_leads add column if not exists repasse_etapa text
  check (repasse_etapa in ('base_repasses', 'tentando_reativacao', 'entrevista_recuperada', 'nao_faz_sentido'));
alter table entrevistas_leads add column if not exists repasse_desde date;
alter table entrevistas_leads add column if not exists repasse_tentaram uuid[] not null default '{}';
-- Por que "não faz sentido recuperar" (obrigatório pra entrar nessa etapa).
alter table entrevistas_leads add column if not exists repasse_nota text;

-- Funil de Repasse dos closers (a fase/quem está com o lead vive em rot_* da 0089).
alter table entrevistas_leads add column if not exists rot_etapa text
  check (rot_etapa in ('base_repasses', 'diagnostico', 'tentando_recuperar', 'recuperado', 'nao_faz_sentido'));
alter table entrevistas_leads add column if not exists rot_nota text;

create index if not exists entrevistas_leads_repasse_sdr_idx on entrevistas_leads(repasse_sdr_id);

-- Cada SDR enxerga e edita só o que está no nome dele no funil de repasse.
create policy entrevistas_leads_select_repasse on entrevistas_leads for select using (repasse_sdr_id = auth.uid());
create policy entrevistas_leads_update_repasse on entrevistas_leads for update using (repasse_sdr_id = auth.uid());

insert into schema_migrations (filename) values ('0090_entrevista_recusada_repasse.sql') on conflict do nothing;
