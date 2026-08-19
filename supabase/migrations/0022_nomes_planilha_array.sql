set search_path = public;

-- nome_planilha (texto único, digitado à mão) vira nomes_planilha (lista) —
-- em Gestão de Pessoas o Diretor agora escolhe, via multi-select alimentado
-- pelos nomes reais encontrados na planilha, todas as grafias que
-- correspondem à mesma pessoa (ex.: "Nicolas Roberto" e "Nicolas roberto").
alter table profiles add column if not exists nomes_planilha text[];

update profiles set nomes_planilha = array[nome_planilha]
where nome_planilha is not null and nomes_planilha is null;

alter table profiles drop column if exists nome_planilha;
