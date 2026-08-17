-- ============================================================
-- Portal Executivo Matri Bank — Seed de dados de configuração
-- Rodar DEPOIS do 0002_rls.sql. Dados extraídos da especificação
-- técnica (seções 4.6, 4.12, 4.13) e do protótipo aprovado.
-- Nada aqui depende de usuários reais ainda.
-- ============================================================

-- ---------- TABELA DE COMISSÃO (seção 4.13) ----------
-- [rank, producao_min, fixo, pct_variavel, ordem]

insert into commission_tiers (rank, producao_min, fixo, pct_variavel, ordem) values
-- Legionário — SDR Jr
('legionario',100000,1600,0.40,1),('legionario',150000,1800,0.40,2),('legionario',200000,2000,0.40,3),
('legionario',300000,2000,0.45,4),('legionario',350000,2300,0.45,5),('legionario',400000,2300,0.50,6),
('legionario',500000,2800,0.50,7),
-- Centurião — SDR Sr
('centuriao',100000,1800,0.40,1),('centuriao',150000,2300,0.40,2),('centuriao',200000,2300,0.50,3),
('centuriao',300000,2500,0.50,4),('centuriao',350000,2500,0.55,5),('centuriao',400000,2800,0.55,6),
('centuriao',500000,3200,0.60,7),
-- Tribuno — Closer Jr
('tribuno',300000,2300,0.30,1),('tribuno',450000,2300,0.30,2),('tribuno',600000,2500,0.30,3),
('tribuno',900000,2500,0.35,4),('tribuno',1050000,2800,0.35,5),('tribuno',1200000,2800,0.40,6),
('tribuno',1500000,3200,0.40,7),
-- Pretor — Closer Sr
('pretor',300000,2300,0.30,1),('pretor',450000,2500,0.30,2),('pretor',600000,2800,0.35,3),
('pretor',900000,2800,0.40,4),('pretor',1050000,3200,0.40,5),('pretor',1200000,3200,0.45,6),
('pretor',1500000,4000,0.50,7),
-- Legado — Líder (produção do Exército)
('legado',600000,4000,0.05,1),('legado',1000000,4000,0.20,2),('legado',1250000,4500,0.20,3),
('legado',1500000,5000,0.20,4),('legado',1750000,5500,0.20,5),('legado',2000000,5500,0.25,6),
('legado',2250000,6000,0.25,7),('legado',2500000,7500,0.30,8);

-- ---------- CRITÉRIOS DE PROMOÇÃO (seção 4.12) ----------

insert into promotion_criteria (transicao, bloco, texto, tipo, target_value, dias_strikes, ordem) values
-- Legionário → Centurião
('legionario_centuriao',1,'6 estrelas acumuladas','auto',6,null,1),
('legionario_centuriao',1,'Sem mês zerado nos últimos 30 dias','auto',1,null,2),
('legionario_centuriao',2,'Match Sales médio > 60','manual',60,null,1),
('legionario_centuriao',2,'Média de 1,5 entrevistas/dia por 30 dias','auto',1.5,null,2),
('legionario_centuriao',3,'Top 1 da Tribo por 1 mês (válido 60 dias)','manual',null,null,1),
('legionario_centuriao',3,'Top 1 SDR do banco 1x','auto',1,null,2),
('legionario_centuriao',4,'8 aulas presenciais + trilha completa','auto',8,null,1),
('legionario_centuriao',4,'1 livro da Biblioteca + apresentação pública','manual',null,null,2),
('legionario_centuriao',5,'Zero strikes nos últimos 30 dias','strikes',null,30,1),
('legionario_centuriao',5,'Avaliação do líder direto + Diretoria','manual',null,null,2),
-- Centurião → Tribuno
('centuriao_tribuno',1,'8 estrelas acumuladas','auto',8,null,1),
('centuriao_tribuno',2,'Match Sales médio > 70','manual',70,null,1),
('centuriao_tribuno',2,'Média de 2 entrevistas/dia por 30 dias','auto',2,null,2),
('centuriao_tribuno',3,'Mentoria de 1 Legionário que entre no Top 1 da Tribo','manual',null,null,1),
('centuriao_tribuno',3,'1 venda sozinho','auto',1,null,2),
('centuriao_tribuno',3,'Aprovação em simulação guiada de call','manual',null,null,3),
('centuriao_tribuno',4,'4 aulas da trilha de Tribunos','auto',4,null,1),
('centuriao_tribuno',4,'8 aulas + trilha + livro + apresentação','auto',8,null,2),
('centuriao_tribuno',5,'Zero strikes nos últimos 30 dias','strikes',null,30,1),
('centuriao_tribuno',5,'Aprovação da Diretoria (transição SDR → Closer) + Praetorium','manual',null,null,2),
-- Tribuno → Pretor
('tribuno_pretor',1,'10 estrelas acumuladas','auto',10,null,1),
('tribuno_pretor',1,'Sem mês abaixo de R$200K','auto',1,null,2),
('tribuno_pretor',2,'Top 1 da Tribo do mês (válido 60 dias)','manual',null,null,1),
('tribuno_pretor',2,'Média de 4 entrevistas/dia por 30 dias','auto',4,null,2),
('tribuno_pretor',3,'1 Legionário da Tribo promovido a Centurião','manual',null,null,1),
('tribuno_pretor',3,'Top 1 Closer do banco 2x (ou Top do mês)','auto',2,null,2),
('tribuno_pretor',4,'12 aulas — trilha Tribunos','auto',12,null,1),
('tribuno_pretor',4,'1 livro da Biblioteca + apresentação pública','manual',null,null,2),
('tribuno_pretor',5,'Zero strikes nos últimos 30 dias','strikes',null,30,1),
('tribuno_pretor',5,'Avaliação do líder direto + Diretoria','manual',null,null,2),
-- Pretor → Legado (transição mais exigente do Cursus Honorum)
('pretor_legado',1,'12 estrelas acumuladas','auto',12,null,1),
('pretor_legado',2,'Top 1 da Tribo do mês (válido 30 dias)','manual',null,null,1),
('pretor_legado',2,'Média de 6 entrevistas/dia por 30 dias','auto',6,null,2),
('pretor_legado',3,'1 Legionário promovido a Centurião + 1 Centurião promovido a Tribuno','manual',null,null,1),
('pretor_legado',3,'2 aparições em lives em 30 dias','auto',2,null,2),
('pretor_legado',3,'Tribo inteira com 100% das metas individuais batidas','manual',null,null,3),
('pretor_legado',4,'5 aulas da trilha de Legados + trilha de Pretores','auto',5,null,1),
('pretor_legado',4,'Livro da Biblioteca + apresentação + seminário "11 Leis do Universo"','manual',null,null,2),
('pretor_legado',5,'Zero strikes nos últimos 90 dias','strikes',null,90,1),
('pretor_legado',5,'Validação condicionada a haver vaga (capacity)','manual',null,null,2);

-- ---------- BIBLIOTECA POR NÍVEL (seção 4.6) ----------

insert into biblioteca_livros (nivel, titulo, autor, ordem) values
('centuriao','Como Fazer Amigos e Influenciar Pessoas','Dale Carnegie',1),
('centuriao','Os Segredos da Mente Milionária','T. Harv Eker',2),
('centuriao','Mindset','Carol Dweck',3),
('centuriao','Hábitos Atômicos','James Clear',4),
('centuriao','O Poder do Hábito','Charles Duhigg',5),
('centuriao','Pai Rico, Pai Pobre','Robert Kiyosaki',6),
('tribuno','A Arte da Guerra','Sun Tzu',1),
('tribuno','Receita Previsível','Aaron Ross & Marylou Tyler',2),
('tribuno','Prospecção Fanática','Jeb Blount',3),
('tribuno','A Bíblia de Vendas','Jeffrey Gitomer',4),
('tribuno','Rápido e Devagar','Daniel Kahneman',5),
('tribuno','Os 7 Hábitos das Pessoas Altamente Eficazes','Stephen Covey',6),
('pretor','Empatia Assertiva','Kim Scott',1),
('pretor','Como Chegar ao Sim sem Ceder','Chris Voss',2),
('pretor','SPIN Selling','Neil Rackham',3),
('pretor','A Venda Desafiadora','Dixon & Adamson',4),
('pretor','As Armas da Persuasão','Robert Cialdini',5),
('pretor','Os 5 Desafios das Equipes','Patrick Lencioni',6),
('legado','O Monge e o Executivo','James Hunter',1),
('legado','Pipeline da Liderança','Charan, Drotter & Noel',2),
('legado','Comece Pelo Porquê','Simon Sinek',3),
('legado','Multiplicadores','Liz Wiseman',4),
('legado','As 21 Irrefutáveis Leis da Liderança','John C. Maxwell',5),
('legado','Empresas Feitas Para Vencer','Jim Collins',6);

-- ---------- CONSELHOS DO SÁBIO (seção 9 — pool curado) ----------

insert into sage_quotes (texto, fonte, contexto_tags) values
('Não questionar na baixa. Decisão se toma na alta; na baixa, executa-se.','Código Imperium · Estado do Guerreiro','{baixa}'),
('100% é o mínimo.','Código Imperium · Padrões de Performance','{vitoria,geral}'),
('Estabilidade não existe: ou se está crescendo, ou se está morrendo.','Código Imperium · Padrões de Performance','{vitoria,geral}'),
('Humildade fincada no chão, ambição fincada no céu.','Código Imperium · Princípio Dual','{geral}'),
('Ser, ao invés de parecer.','Esse Quam Videri · Cursus Honorum','{geral}'),
('Acreditamos em coisas que não existem como se já existissem.','Romanos 4:17','{geral}'),
('Toda baixa testa a fé; toda fé que não é testada é conveniência.','Eclesiástico 2:1-6','{baixa}'),
('Vencer cem batalhas não é a excelência suprema; subjugar o inimigo sem lutar, sim.','Sun Tzu · A Arte da Guerra','{geral}'),
('Conheça o inimigo e conheça a si mesmo; em cem batalhas, nunca estará em perigo.','Sun Tzu · A Arte da Guerra','{geral}'),
('A oportunidade nasce da falha do adversário.','Sun Tzu · A Arte da Guerra','{geral}'),
('É melhor ser temido do que amado, quando não se pode ser ambos.','Maquiavel · O Príncipe','{geral}'),
('Quem deseja fazer sempre o bem irá arruinar-se entre tantos que não o são.','Maquiavel · O Príncipe','{geral}'),
('Tens poder sobre tua mente, não sobre eventos externos. Percebe isso e encontrarás força.','Marco Aurélio · Meditações','{baixa}'),
('O obstáculo no caminho torna-se o caminho.','Marco Aurélio · Meditações','{baixa}'),
('Ao amanhecer, diga a si mesmo: hoje encontrarei pessoas difíceis. Não se surpreenda.','Marco Aurélio · Meditações','{geral}'),
('Não é porque as coisas são difíceis que não ousamos; é porque não ousamos que são difíceis.','Sêneca','{baixa}'),
('Não são as coisas que nos perturbam, mas a opinião que temos delas.','Epicteto','{baixa}'),
('A disciplina é a ponte entre metas e realizações.','Jim Rohn','{geral}'),
('Não temas ser lento; teme apenas ficar parado.','Provérbio · tradição estoica','{baixa}'),
('Você não se eleva ao nível dos seus objetivos; cai ao nível dos seus sistemas.','Inspirado em James Clear · Hábitos Atômicos','{geral}');

-- ---------- ESTRUTURA ORGANIZACIONAL INICIAL ----------
-- Exércitos e Tribos de hoje (Templários e Maximus). legado_id/closer_id ficam
-- em branco até os usuários reais serem criados no Auth — o Diretor vincula depois.

insert into exercitos (nome) values ('Templários'), ('Maximus');

insert into tribos (nome, exercito_id)
select 'Tribo Aquila', id from exercitos where nome = 'Templários'
union all select 'Tribo Ferrum', id from exercitos where nome = 'Templários'
union all select 'Tribo Draco', id from exercitos where nome = 'Maximus'
union all select 'Tribo Ursus', id from exercitos where nome = 'Maximus';
