-- ============================================================
-- Seed placeholder da Trilha de Formação — só interface no
-- lançamento (spec 4.6). Conteúdo real (vídeo/PDF) é fase 2;
-- o Rei substitui esses módulos pelos definitivos quando tiver.
-- ============================================================

insert into trilha_modulos (nome, nivel_min, formato, ordem) values
('Fundamentos de Prospecção', 'legionario', 'Vídeo · 4 módulos', 1),
('Objeções em Ligação Fria', 'legionario', 'PDF + Vídeo', 2),
('Condução de Entrevista', 'centuriao', 'Vídeo · 6 módulos', 3),
('Fechamento Consultivo', 'centuriao', 'Planilha + Vídeo', 4),
('Gestão de Pipeline Avançada', 'tribuno', 'Vídeo · 3 módulos', 5),
('Liderança de Tribo', 'pretor', 'Vídeo + PDF', 6);
