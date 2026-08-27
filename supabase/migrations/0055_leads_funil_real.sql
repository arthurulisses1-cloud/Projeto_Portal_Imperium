-- ============================================================
-- Funil de "Meus Leads" passa a refletir o funil de verdade da operação
-- (pedido do Diretor, 2026-08-27): Validação de Entrevista → Entrevista
-- Validada → Fechamento → Subido → CCB Enviada → Assinado, com "Perdido"
-- como saída (fora da esteira principal, precisa de motivo).
--
-- Postgres não deixa remover valor de enum, só renomear/adicionar — como
-- o funil ainda tinha pouquíssimas linhas reais (sync de leads é novo),
-- renomear em vez de recriar o type é seguro (nenhum dado se perde,
-- só troca o rótulo por baixo das linhas já existentes).
-- ============================================================

set search_path = public;

alter type lead_status_followup rename value 'a_contatar' to 'validacao_entrevista';
alter type lead_status_followup rename value 'em_negociacao' to 'entrevista_validada';
alter type lead_status_followup rename value 'proposta_enviada' to 'fechamento';
alter type lead_status_followup rename value 'aguardando_documentos' to 'subido';
alter type lead_status_followup rename value 'convertido' to 'assinado';
alter type lead_status_followup add value if not exists 'ccb_enviada';
-- 'esfriou' e 'perdido' já existem — 'esfriou' fica sem uso por enquanto
-- (não tem uma etapa nova pra virar), 'perdido' continua sendo a saída
-- com motivo.

insert into schema_migrations (filename) values ('0055_leads_funil_real.sql') on conflict do nothing;
