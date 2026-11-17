-- Tipo de contrato da venda (Mensal, Trimestral, Semestral, Anual), lido do campo "Tipo de Contrato" do Pipefácil (Match Sales).
-- Serve para saber se o plano foi pago de uma vez e, nesse caso, só contar recorrência depois do período pago.
alter table vendas add column if not exists tipo_contrato text;
