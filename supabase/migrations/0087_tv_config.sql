-- Ordem das telas do Painel TV — pedido do Diretor, 2026-09-21: poder
-- reordenar sem precisar me chamar pra mexer no código. Linha única
-- (singleton, id sempre true) guardando a ordem das chaves de tela.
create table tv_config (
  id boolean primary key default true check (id),
  ordem_slides text[] not null default array[
    'ligacoes','duelo','entrevistas-hoje','conexoes','tribos',
    'credito','exercitos','campanhas','entrevistas-mes','lendas'
  ],
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

insert into tv_config (id) values (true) on conflict (id) do nothing;

alter table tv_config enable row level security;

create policy tv_config_select on tv_config for select using (true);
create policy tv_config_write on tv_config for all using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0087_tv_config.sql')
on conflict (filename) do nothing;
