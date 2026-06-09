
CREATE SEQUENCE IF NOT EXISTS kitchen_receipt_seq START 1;
CREATE SEQUENCE IF NOT EXISTS kitchen_issue_seq START 1;
CREATE SEQUENCE IF NOT EXISTS kitchen_meal_seq START 1;

CREATE TABLE public.kitchen_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'ingredient',
  unit TEXT NOT NULL DEFAULT 'kg',
  stock_quantity NUMERIC NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 5,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  supplier TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_items TO authenticated;
GRANT ALL ON public.kitchen_items TO service_role;
ALTER TABLE public.kitchen_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kitchen and admins manage items" ON public.kitchen_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kitchen'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kitchen'));
CREATE TRIGGER trg_kitchen_items_updated BEFORE UPDATE ON public.kitchen_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.kitchen_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE,
  item_id UUID NOT NULL REFERENCES public.kitchen_items(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  supplier TEXT,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  notes TEXT,
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_receipts TO authenticated;
GRANT ALL ON public.kitchen_receipts TO service_role;
ALTER TABLE public.kitchen_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kitchen and admins manage receipts" ON public.kitchen_receipts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kitchen'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kitchen'));
CREATE TRIGGER trg_kitchen_receipts_updated BEFORE UPDATE ON public.kitchen_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_kitchen_receipt_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.receipt_number IS NULL THEN
    NEW.receipt_number := 'KRC-' || LPAD(nextval('kitchen_receipt_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_kitchen_receipt_no BEFORE INSERT ON public.kitchen_receipts
  FOR EACH ROW EXECUTE FUNCTION public.generate_kitchen_receipt_number();

CREATE OR REPLACE FUNCTION public.kitchen_receipt_stock_in()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.kitchen_items SET stock_quantity = stock_quantity + NEW.quantity WHERE id = NEW.item_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_kitchen_receipt_stock_in AFTER INSERT ON public.kitchen_receipts
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_receipt_stock_in();

CREATE TABLE public.kitchen_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number TEXT UNIQUE,
  item_id UUID NOT NULL REFERENCES public.kitchen_items(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  purpose TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  issued_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_issues TO authenticated;
GRANT ALL ON public.kitchen_issues TO service_role;
ALTER TABLE public.kitchen_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kitchen and admins manage issues" ON public.kitchen_issues
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kitchen'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kitchen'));
CREATE TRIGGER trg_kitchen_issues_updated BEFORE UPDATE ON public.kitchen_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_kitchen_issue_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.issue_number IS NULL THEN
    NEW.issue_number := 'KIS-' || LPAD(nextval('kitchen_issue_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_kitchen_issue_no BEFORE INSERT ON public.kitchen_issues
  FOR EACH ROW EXECUTE FUNCTION public.generate_kitchen_issue_number();

CREATE OR REPLACE FUNCTION public.kitchen_issue_stock_out()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.kitchen_items SET stock_quantity = GREATEST(0, stock_quantity - NEW.quantity) WHERE id = NEW.item_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_kitchen_issue_stock_out AFTER INSERT ON public.kitchen_issues
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_issue_stock_out();

CREATE TABLE public.kitchen_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_number TEXT UNIQUE,
  meal_name TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'lunch',
  meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  portions_served INTEGER NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  cost_per_portion NUMERIC NOT NULL DEFAULT 0,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  prepared_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_meals TO authenticated;
GRANT ALL ON public.kitchen_meals TO service_role;
ALTER TABLE public.kitchen_meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kitchen and admins manage meals" ON public.kitchen_meals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kitchen'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kitchen'));
CREATE TRIGGER trg_kitchen_meals_updated BEFORE UPDATE ON public.kitchen_meals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_kitchen_meal_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.meal_number IS NULL THEN
    NEW.meal_number := 'MEAL-' || LPAD(nextval('kitchen_meal_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_kitchen_meal_no BEFORE INSERT ON public.kitchen_meals
  FOR EACH ROW EXECUTE FUNCTION public.generate_kitchen_meal_number();

CREATE OR REPLACE FUNCTION public.kitchen_meal_consume_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ing JSONB; v_id UUID; v_qty NUMERIC;
BEGIN
  FOR ing IN SELECT * FROM jsonb_array_elements(NEW.ingredients) LOOP
    v_id := (ing->>'item_id')::UUID;
    v_qty := COALESCE((ing->>'quantity')::NUMERIC, 0);
    IF v_id IS NOT NULL AND v_qty > 0 THEN
      UPDATE public.kitchen_items SET stock_quantity = GREATEST(0, stock_quantity - v_qty) WHERE id = v_id;
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_kitchen_meal_consume AFTER INSERT ON public.kitchen_meals
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_meal_consume_stock();

CREATE INDEX idx_kitchen_receipts_item ON public.kitchen_receipts(item_id);
CREATE INDEX idx_kitchen_receipts_date ON public.kitchen_receipts(delivery_date DESC);
CREATE INDEX idx_kitchen_issues_item ON public.kitchen_issues(item_id);
CREATE INDEX idx_kitchen_issues_date ON public.kitchen_issues(issue_date DESC);
CREATE INDEX idx_kitchen_meals_date ON public.kitchen_meals(meal_date DESC);
