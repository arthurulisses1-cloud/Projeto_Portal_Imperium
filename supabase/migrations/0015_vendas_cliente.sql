set search_path = public;

alter table vendas add column if not exists cliente text;
