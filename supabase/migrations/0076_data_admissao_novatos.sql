-- Registra a admissão real dos 3 SDRs contratados hoje (2026-09-11) --
-- contas criadas hoje (profiles.created_at), sem data_admissao preenchida
-- ainda. Sem isso, a Folha (src/lib/dre.ts) não tem como saber que eles
-- não trabalharam em agosto e continuaria cobrando o fixo deles em meses
-- que nem existiam no time.
update profiles set data_admissao = '2026-09-11'
where full_name in (
  'Antônio Henrique Barbosa de Meneses',
  'Fernando César Félix Honorato',
  'Iago Guilherme Martins dos Santos'
) and data_admissao is null;

insert into schema_migrations (filename) values ('0076_data_admissao_novatos.sql')
on conflict (filename) do nothing;
