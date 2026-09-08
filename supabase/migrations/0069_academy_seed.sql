-- Seed das 5 trilhas + Arena com o conteúdo real levantado dos documentos-
-- mestre (Legionário e Tribuno já testados em turma real; Centurião e
-- Pretor são a proposta de trabalho, marcados como tal na própria
-- descrição). Datas e instrutor ficam em branco — o Diretor preenche na
-- aba "Academy Geral".

-- on conflict (nome) do nothing: se a tentativa anterior (que quebrou no
-- erro de coluna ambígua) já tiver deixado essas linhas gravadas, roda de
-- novo sem duplicar.
insert into academy_trilhas (nome, rank, tipo, dia_semana, hora_inicio, hora_fim, ordem) values
  ('Legionário', 'legionario', 'trilha', 2, '13:00', '14:00', 1),
  ('Centurião', 'centuriao', 'trilha', 3, '13:00', '14:00', 2),
  ('Tribuno', 'tribuno', 'trilha', 4, '12:30', '14:00', 3),
  ('Pretor', 'pretor', 'trilha', 1, '13:00', '14:00', 4),
  ('Legado · PDL', 'legado', 'trilha', 5, '11:00', '12:00', 5),
  ('Arena de Roleplays', null, 'arena', 5, '13:00', '14:00', 6)
on conflict (nome) do nothing;

-- ---------- Legionário — 12 semanas, método IPQF (Documento Mestre real) ----------
insert into academy_aulas (trilha_id, ordem, tema, descricao, marco)
select academy_trilhas.id, t.ordem, t.tema, t.descricao, t.marco from academy_trilhas, (values
  (1, 'Mentalidade do Legionário e o que é "Entrevista"', 'Mindset · Doc. Mestre · Fanatical Prospecting', false),
  (2, 'Produto Matri: crédito com precatório em garantia', 'Documento Matri (1-2) · A Bíblia de Vendas', false),
  (3, 'Os dois ICPs: Requerente vs Advogado', 'Doc. Matri (2) · Carnegie', false),
  (4, 'Introdução (I): abertura com energia', 'Smart Calling · Doc. Matri (Fase 1)', false),
  (5, 'Pitch Rápido (P): do ponto A ao B em 60s', 'Doc. Matri (Fase 4) · A Bíblia de Vendas', false),
  (6, 'Qualificação (Q): SPIN aplicado a precatório', 'SPIN Selling · Doc. Matri (Fases 2-3)', false),
  (7, 'Finalização (F): gerar "subido" antes de desligar', 'Os Segredos do Lobo · Doc. Matri (Fase 6)', false),
  (8, 'As 5 objeções: EAP · PPP · SEV', 'Blount · Armas da Persuasão 2.0', false),
  (9, 'PEC 66 e gatilhos éticos de urgência', 'Cialdini · Doc. Matri (10.2)', false),
  (10, 'Concorrência, "vou pensar" e isolamento de objeção', 'Belfort · Blount (Objeções)', false),
  (11, 'Cadência, follow-up e disciplina diária', 'Fanatical Prospecting · Hábitos Atômicos', false),
  (12, 'Maratona de simulação + diagnóstico individual', 'Todo o ciclo — nota pública nos 4 pilares do IPQF', true)
) as t(ordem, tema, descricao, marco)
where academy_trilhas.nome = 'Legionário';

-- ---------- Centurião — 8 semanas, proposta ----------
insert into academy_aulas (trilha_id, ordem, tema, descricao, marco)
select academy_trilhas.id, t.ordem, t.tema, t.descricao, t.marco from academy_trilhas, (values
  (1, 'Mentoria de par', 'Como formar um Legionário sem virar chefe · proposta', false),
  (2, 'Prospecção avançada', 'Cadência própria, além do script de bolso · proposta', false),
  (3, 'Diagnóstico inicial', '1ª camada de SPIN antes do Tribuno assumir · proposta', false),
  (4, 'Checkpoint — leitura de funil', 'Funil próprio de SDR Sênior · proposta', false),
  (5, 'Elevação dos pares', 'O Valor entregue do HGV do Centurião · proposta', false),
  (6, 'Simulação avançada de objeção', 'As 5 do Legionário, em profundidade · proposta', false),
  (7, 'Preparação pra fechamento', 'Pontes com o método do Tribuno · proposta', false),
  (8, 'Avaliação de subida a Tribuno', 'Checkpoint final do ciclo · proposta', true)
) as t(ordem, tema, descricao, marco)
where academy_trilhas.nome = 'Centurião';

-- ---------- Tribuno — 12 semanas, 3 fases (Documento Mestre real) ----------
insert into academy_aulas (trilha_id, ordem, tema, descricao, marco)
select academy_trilhas.id, t.ordem, t.tema, t.descricao, t.marco from academy_trilhas, (values
  (1, 'Kickoff — o Pacto dos Tribunos', 'Manifesto · régua pública · padrinhos · diagnóstico baseline', true),
  (2, 'Anatomia do Nosso Lead', '4 perfis recorrentes · shadow de 2 calls', false),
  (3, 'Diagnóstico antes de Fechar', 'SPIN e Gap Selling aplicados', false),
  (4, 'Contorno de Objeção Raiz — checkpoint Fase I', 'Voss · as 5 objeções-mãe do precatório', true),
  (5, 'Leitura de Funil', 'Aaron Ross · auditoria pública do próprio funil', false),
  (6, 'Cadência de Follow-up', '"O dinheiro tá no 5º toque"', false),
  (7, 'Gatilhos Mentais no Precatório', 'Urgência real × pressão fake', false),
  (8, 'O Puxador — checkpoint Fase II', 'Marco: Primeira Lança Cravada', true),
  (9, 'Negociação na Linha Fina', 'Voss avançado · ancoragem · BATNA', false),
  (10, 'Case Defendido', 'Modelo do Vendedor Desafiador (Dixon)', false),
  (11, 'Ritual de Transferência — o Tribuno Ensina', 'Mini-encontro de 20min pra Legio', false),
  (12, 'Praetorium — decisão pública', 'Quem sobe, quem segue, quem volta', true)
) as t(ordem, tema, descricao, marco)
where academy_trilhas.nome = 'Tribuno';

-- ---------- Pretor — 8 semanas, proposta (Tribo → Exército) ----------
insert into academy_aulas (trilha_id, ordem, tema, descricao, marco)
select academy_trilhas.id, t.ordem, t.tema, t.descricao, t.marco from academy_trilhas, (values
  (1, 'Herda a Tribo do Tribuno', 'O que muda de fechar pra comandar · proposta', false),
  (2, 'Fechamento de alta complexidade', 'Advogado experiente, negociação dura · proposta', false),
  (3, 'Início dos 5 Papéis', 'Líder e Coach aplicados à própria Tribo · proposta', false),
  (4, 'Rumo ao Exército', 'Plano de crescer a Tribo em headcount · proposta', false),
  (5, 'Mentoria formal', '1:1 estruturado com Centurião/Tribuno júnior · proposta', false),
  (6, 'Gestão de carteira', 'Ler o funil da Tribo inteira, não só o seu · proposta', false),
  (7, 'Performance constante', 'De picos isolados a consistência mensal · proposta', false),
  (8, 'Avaliação', 'Tribo evoluindo mensuravelmente, prova pro Legado · proposta', true)
) as t(ordem, tema, descricao, marco)
where academy_trilhas.nome = 'Pretor';

-- ---------- Legado · PDL — 8 encontros, 5 papéis (Documento Mestre real) ----------
insert into academy_aulas (trilha_id, ordem, tema, descricao, marco)
select academy_trilhas.id, t.ordem, t.tema, t.descricao, t.marco from academy_trilhas, (values
  (1, 'Líder — Direção e Energia', 'Hunter, Falconi · autoridade × poder', false),
  (2, 'Gestor — Processo e Dados', 'Drucker, Aaron Ross · as 5 métricas do funil', false),
  (3, 'Coach — Treino e Performance', 'Kim Scott, Carnegie · Empatia Assertiva', false),
  (4, 'Mentor — Formador de Talentos', 'Hunter, Lencioni · plano de sucessão', false),
  (5, 'Guardião — Cultura e Meta', 'Lencioni, Sun Tzu · os 5 desafios das equipes', false),
  (6, 'Liderança em Camadas', 'Liderar líderes × liderar operação', false),
  (7, 'Cases & Simulação', 'Laboratório vivo — 1 case real por Legado', false),
  (8, 'Fechamento + Plano 90 dias', 'Auto-avaliação dos 5 papéis · PDI evoluído', true)
) as t(ordem, tema, descricao, marco)
where academy_trilhas.nome = 'Legado · PDL';

-- ---------- Arena de Roleplays — 12 semanas, formato roda a cada 3 ----------
insert into academy_aulas (trilha_id, ordem, tema, descricao, marco)
select academy_trilhas.id, t.ordem, t.tema, t.descricao, false from academy_trilhas, (values
  (1, 'Dia de SDR', 'Legionários + Centuriões · IPQF completo'),
  (2, 'Dia de Closer', 'Tribunos · Banco de Simulações'),
  (3, 'Jornada completa', 'Todo mundo — passagem de bastão SDR→Closer'),
  (4, 'Dia de SDR', 'Legionários + Centuriões · IPQF completo'),
  (5, 'Dia de Closer', 'Tribunos · Banco de Simulações'),
  (6, 'Jornada completa', 'Todo mundo — passagem de bastão SDR→Closer'),
  (7, 'Dia de SDR', 'Legionários + Centuriões · IPQF completo'),
  (8, 'Dia de Closer', 'Tribunos · Banco de Simulações'),
  (9, 'Jornada completa', 'Todo mundo — passagem de bastão SDR→Closer'),
  (10, 'Dia de SDR', 'Legionários + Centuriões · IPQF completo'),
  (11, 'Dia de Closer', 'Tribunos · Banco de Simulações'),
  (12, 'Jornada completa', 'Todo mundo — passagem de bastão SDR→Closer')
) as t(ordem, tema, descricao)
where academy_trilhas.nome = 'Arena de Roleplays';

insert into schema_migrations (filename) values ('0069_academy_seed.sql')
on conflict (filename) do nothing;
