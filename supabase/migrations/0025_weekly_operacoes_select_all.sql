set search_path = public;

-- A RLS da 0024 só liberava leitura de weekly_operacoes pra líder/diretor
-- (+ dono da linha como SDR/Closer, pro Forecast). Isso quebrou a Guerra
-- Civil/Guerra de Tribos no Mural: guerra.ts passou a usar weekly_operacoes
-- pra não duplicar crédito (ver migration/commit anterior), mas o Mural é
-- visível pra TODO MUNDO (sdr/closer/líder/diretor) — pra qualquer um que
-- não fosse líder/diretor, a consulta via RLS só via as próprias operações,
-- então os totais de Exército/Tribo ficavam sub-contados (errados) na tela
-- de quem não é líder/diretor.
--
-- `vendas` e `producao_funil` já são de leitura totalmente aberta
-- (`using (true)`) pra qualquer autenticado — segue o mesmo padrão aqui.
-- O escopo "closer só vê os próprios assinados" do Forecast já é aplicado
-- na CAMADA DA APLICAÇÃO (src/app/(app)/forecast/page.tsx), não depende
-- da RLS pra isso.
drop policy if exists weekly_operacoes_select on weekly_operacoes;
create policy weekly_operacoes_select_all on weekly_operacoes for select using (true);
