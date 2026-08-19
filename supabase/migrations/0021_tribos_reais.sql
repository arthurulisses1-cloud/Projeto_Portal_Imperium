set search_path = public;

-- Estrutura real de Tribos (substitui os dados de teste zerados na 0014).
-- Rodado manualmente em produção em 2026-08-19; migration aqui só documenta
-- e cobre reset de ambiente (staging/local). Membros e Legados de Exército
-- (Davi Ximenes -> Templários, Rafael Saboya -> Maximus) já estavam corretos.

insert into tribos (nome, exercito_id, closer_id, logo_url)
select 'Mirmidões', e.id, (select id from profiles where full_name = 'Matheus Mesquita'),
  'https://qukvpqqpwzmlcgbwjkro.supabase.co/storage/v1/object/public/tribo-logos/seed/mirmidoes.jpg'
from exercitos e where e.nome = 'Templários'
on conflict do nothing;

insert into tribos (nome, exercito_id, closer_id, logo_url)
select 'Xotec', e.id, (select id from profiles where full_name = 'Leonardo Enzo'),
  'https://qukvpqqpwzmlcgbwjkro.supabase.co/storage/v1/object/public/tribo-logos/seed/xotec.jpg'
from exercitos e where e.nome = 'Templários'
on conflict do nothing;

insert into tribos (nome, exercito_id)
select 'Inbound', e.id from exercitos e where e.nome = 'Templários'
on conflict do nothing;

insert into tribos (nome, exercito_id, closer_id, logo_url)
select 'Barbarus', e.id, (select id from profiles where full_name = 'Arthur Barbosa'),
  'https://qukvpqqpwzmlcgbwjkro.supabase.co/storage/v1/object/public/tribo-logos/seed/barbarus.jpg'
from exercitos e where e.nome = 'Maximus'
on conflict do nothing;

insert into tribos (nome, exercito_id, closer_id, logo_url)
select 'Falcons', e.id, (select id from profiles where full_name = 'Gabriel Santiago'),
  'https://qukvpqqpwzmlcgbwjkro.supabase.co/storage/v1/object/public/tribo-logos/seed/falcons.jpg'
from exercitos e where e.nome = 'Maximus'
on conflict do nothing;

insert into tribos (nome, exercito_id)
select 'Inbound', e.id from exercitos e where e.nome = 'Maximus'
on conflict do nothing;

-- ---------- Aloca cada membro na própria Tribo ----------

update profiles p set tribo_id = t.id
from tribos t join exercitos e on e.id = t.exercito_id
where t.nome = 'Mirmidões' and e.nome = 'Templários'
  and p.full_name in ('Matheus Mesquita', 'Vinicius Pereira', 'Ana Clara Rodrigues', 'Jonatha Cordeiro');

update profiles p set tribo_id = t.id
from tribos t join exercitos e on e.id = t.exercito_id
where t.nome = 'Xotec' and e.nome = 'Templários'
  and p.full_name in ('Nicolas Roberto', 'Vinícius Ferreira', 'Leonardo Enzo');

update profiles p set tribo_id = t.id
from tribos t join exercitos e on e.id = t.exercito_id
where t.nome = 'Inbound' and e.nome = 'Templários'
  and p.full_name in ('Cristina Santos');

update profiles p set tribo_id = t.id
from tribos t join exercitos e on e.id = t.exercito_id
where t.nome = 'Barbarus' and e.nome = 'Maximus'
  and p.full_name in ('Arthur Barbosa', 'Marcus Lira', 'Alexander Marcelo', 'Stefani Viana');

update profiles p set tribo_id = t.id
from tribos t join exercitos e on e.id = t.exercito_id
where t.nome = 'Falcons' and e.nome = 'Maximus'
  and p.full_name in ('Gabriel Santiago', 'Silvio de Azevedo', 'Elisa', 'Mikael');

update profiles p set tribo_id = t.id
from tribos t join exercitos e on e.id = t.exercito_id
where t.nome = 'Inbound' and e.nome = 'Maximus'
  and p.full_name in ('Marcus Ryquelme');
