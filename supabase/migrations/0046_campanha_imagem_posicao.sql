-- Foto de campanha usa object-cover numa faixa de altura fixa (128px) e
-- largura total do card — em foto retrato ou quadrada isso corta o topo/
-- base. Sem crop de verdade (arrastar/soltar), a saída simples é deixar
-- escolher qual parte da foto fica visível: topo, centro ou base.
alter table campanhas add column if not exists imagem_posicao text not null default 'center'
  check (imagem_posicao in ('top', 'center', 'bottom'));

insert into schema_migrations (filename) values ('0046_campanha_imagem_posicao.sql')
on conflict (filename) do nothing;
