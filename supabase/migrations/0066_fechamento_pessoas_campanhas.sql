-- Bônus/receita manual por pessoa (dre_despesas_extras com profile_id,
-- migration 0037 — já existia, aparece na coluna "Campanhas" da Folha ao
-- vivo em /dre) nunca entrava no snapshot travado por fecharMes
-- (fechamento_pessoas) nem, por consequência, em "O que você recebe" no
-- /comissao — a pessoa via o bônus na DRE, mas ele sumia do valor que
-- efetivamente seria pago dia 15. Achado pelo Diretor, 2026-09-01,
-- fechando a folha de Agosto.
--
-- Guarda o valor separado (pra mostrar "+ bônus" na UI) além de já entrar
-- somado no `variavel` gravado por fecharMes (pago dia 15, junto com a
-- comissão) — ver src/app/(app)/fechamento/actions.ts.
alter table fechamento_pessoas add column if not exists campanhas numeric not null default 0;

insert into schema_migrations (filename) values ('0066_fechamento_pessoas_campanhas.sql')
on conflict (filename) do nothing;
