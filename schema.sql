-- Rode no Supabase: SQL Editor > New query > Run
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, balance numeric not null default 0
);
create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, bank text not null,
  credit_limit numeric default 0, closing_day int default 1, due_day int default 10
);
create table incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, amount numeric not null default 0
);
create table debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, bank text not null,
  installment numeric not null default 0,
  installments_total int not null default 1,
  installments_paid int not null default 0,
  due_day int default 10
);
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('entrada','debito','credito','dinheiro')),
  amount numeric not null,
  category text, description text,
  account_id uuid references accounts on delete set null,
  card_id uuid references cards on delete set null,
  date date not null default current_date,
  ref_month date not null,           -- mês em que o valor pesa (fatura, no crédito)
  installment_no int not null default 1,
  installment_total int not null default 1,
  group_id uuid
);
do $$ declare t text; begin
  foreach t in array array['accounts','cards','incomes','debts','transactions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
