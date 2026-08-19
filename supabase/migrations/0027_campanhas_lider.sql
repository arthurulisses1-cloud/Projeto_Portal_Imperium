set search_path = public;

-- Campanhas até aqui só podiam ser criadas/excluídas pelo Diretor
-- (is_director()). Líder de Exército também deve poder criar campanha/duelo
-- pro próprio time acompanhar — SDR/Closer continuam sem poder.
drop policy if exists campanhas_write on campanhas;
create policy campanhas_write on campanhas for all
  using (is_director() or my_role() = 'lider')
  with check (is_director() or my_role() = 'lider');

drop policy if exists campanha_participantes_write on campanha_participantes;
create policy campanha_participantes_write on campanha_participantes for all
  using (is_director() or my_role() = 'lider')
  with check (is_director() or my_role() = 'lider');
