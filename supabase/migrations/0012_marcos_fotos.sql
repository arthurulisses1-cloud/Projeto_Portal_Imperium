-- ============================================================
-- Fotos reais dos prêmios do Sistema de Marcos (substituem o
-- ícone emoji genérico no card, quando presentes).
-- ============================================================

set search_path = public;

alter table marcos add column if not exists imagem_url text;

update marcos set imagem_url = '/marcos/fone.jpg' where nome = 'Fone gamer Havit';
update marcos set imagem_url = '/marcos/jantar.jpg' where nome = 'Jantar p/ 2';
update marcos set imagem_url = '/marcos/monitor.jpg' where nome = 'Monitor 2ª tela';
update marcos set imagem_url = '/marcos/notebook.jpg' where nome = 'Notebook';
update marcos set imagem_url = '/marcos/viagem-ceara.jpg' where nome = 'Viagem Ceará p/ 2';
update marcos set imagem_url = '/marcos/viagem-brasil.jpg' where nome = 'Viagem Brasil p/ 2';
