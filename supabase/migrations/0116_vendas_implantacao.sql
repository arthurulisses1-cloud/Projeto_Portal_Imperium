-- Valor da implantação (setup) de cada venda, lido do campo "Valor da implantação" do Pipefácil (Match Sales).
-- Antes o portal estimava o setup por (valor recebido − MRR), o que não bate com o que a equipe cadastra.
alter table vendas add column if not exists valor_implantacao numeric;
