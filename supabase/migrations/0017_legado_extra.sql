set search_path = public;

alter table profiles add column if not exists data_nascimento date;
alter table profiles add column if not exists ativo boolean not null default true;
