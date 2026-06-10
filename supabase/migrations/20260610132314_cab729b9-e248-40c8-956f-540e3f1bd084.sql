ALTER TABLE public.goods_received
  ADD COLUMN IF NOT EXISTS cash_given numeric,
  ADD COLUMN IF NOT EXISTS change_amount numeric;