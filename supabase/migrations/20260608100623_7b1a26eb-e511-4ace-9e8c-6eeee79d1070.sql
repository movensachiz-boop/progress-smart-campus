
CREATE TABLE public.prepaid_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit TEXT,
  default_unit_price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prepaid_accounts TO authenticated;
GRANT ALL ON public.prepaid_accounts TO service_role;

ALTER TABLE public.prepaid_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage prepaid accounts"
ON public.prepaid_accounts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'cashier'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'cashier'));

CREATE TRIGGER update_prepaid_accounts_updated_at
BEFORE UPDATE ON public.prepaid_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.prepaid_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.prepaid_accounts(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('deposit','delivery')),
  amount NUMERIC NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX prepaid_entries_account_idx ON public.prepaid_entries(account_id, occurred_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prepaid_entries TO authenticated;
GRANT ALL ON public.prepaid_entries TO service_role;

ALTER TABLE public.prepaid_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage prepaid entries"
ON public.prepaid_entries FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'cashier'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'cashier'));

CREATE TRIGGER update_prepaid_entries_updated_at
BEFORE UPDATE ON public.prepaid_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
