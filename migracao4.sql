-- Rode UMA vez no SQL Editor do Supabase (não apaga nada)
alter table transactions add column if not exists group_name text;
alter table debts add column if not exists group_name text;
-- pagamentos de grupo usam o nome do grupo como referência
alter table payments alter column ref_id type text using ref_id::text;
alter table payments drop constraint if exists payments_kind_check;
alter table payments add constraint payments_kind_check check (kind in ('bill','card','debt','group'));
-- faturas de cartão já pagas viram pagamento do grupo (nome do banco do cartão)
update payments p set kind = 'group', ref_id = c.bank
  from cards c where p.kind = 'card' and p.ref_id = c.id::text;
