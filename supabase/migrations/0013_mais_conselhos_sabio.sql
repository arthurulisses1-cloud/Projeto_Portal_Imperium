-- ============================================================
-- Mais frases pro Conselho do Sábio: romanos históricos, textos
-- bíblicos marcantes, e mais referências ao Código Imperium.
-- ============================================================

set search_path = public;

insert into sage_quotes (texto, fonte, contexto_tags) values
-- Romanos históricos
('Vim, vi, venci.','Júlio César','{vitoria}'),
('A sorte favorece os audazes.','Virgílio · Eneida','{vitoria,geral}'),
('Apressa-te lentamente.','Augusto · Festina Lente','{geral}'),
('Enquanto há vida, há esperança.','Cícero','{baixa}'),
('A memória é o tesouro e a guardiã de todas as coisas.','Cícero · De Oratore','{geral}'),
('Se você não sabe para qual porto navega, nenhum vento é favorável.','Sêneca · Cartas a Lucílio','{geral}'),
('Enquanto ensinamos, aprendemos.','Sêneca','{geral}'),
('A melhor vingança é não ser como aquele que te feriu.','Marco Aurélio · Meditações','{baixa}'),
('Aproveita o dia, confiando o mínimo possível no amanhã.','Horácio · Odes (Carpe Diem)','{geral}'),
('A gota escava a pedra, não pela força, mas pela persistência.','Ovídio · Epistulae ex Ponto','{baixa}'),
('Roma não foi construída em um dia.','Provérbio romano','{baixa,geral}'),
('Não há vento favorável para quem não sabe a que porto se dirige.','Sêneca','{geral}'),
-- Textos bíblicos
('Entrega ao Senhor tudo o que fazes, e os teus planos serão bem-sucedidos.','Provérbios 16:3','{geral}'),
('Os planos bem elaborados levam à fartura, mas a pressa excessiva leva à pobreza.','Provérbios 21:5','{geral}'),
('Tudo posso naquele que me fortalece.','Filipenses 4:13','{baixa,vitoria}'),
('Seja forte e corajoso. Não se apavore, nem se desanime.','Josué 1:9','{baixa}'),
('Considerem motivo de alegria as provações, pois a prova da fé produz perseverança.','Tiago 1:2-3','{baixa}'),
('Não nos cansemos de fazer o bem, pois no tempo próprio colheremos, se não desanimarmos.','Gálatas 6:9','{baixa,geral}'),
('Tudo quanto te vier à mão para fazer, faze-o conforme as tuas forças.','Eclesiastes 9:10','{geral}'),
('Ensina-nos a contar os nossos dias, para que o nosso coração alcance sabedoria.','Salmos 90:12','{geral}'),
-- Código Imperium
('Disciplina na baixa é o que separa quem sobe de quem some.','Código Imperium · Estado do Guerreiro','{baixa}'),
('Resultado não mente, mas também não desculpa esforço mal direcionado.','Código Imperium · Padrões de Performance','{geral}'),
('Time que compartilha a vitória também compartilha o campo de batalha na derrota.','Código Imperium · Guerra Civil','{geral,vitoria}'),
('Não existe mérito individual numa guerra coletiva.','Código Imperium · Guerra Civil','{geral}'),
('A meta do mês começa a ser batida no primeiro dia útil, não no último.','Código Imperium · Padrões de Performance','{geral}');
