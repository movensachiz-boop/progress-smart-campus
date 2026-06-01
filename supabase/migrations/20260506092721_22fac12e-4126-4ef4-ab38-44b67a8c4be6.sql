
-- Inventory items table
CREATE TABLE public.inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fee_requirement_id UUID REFERENCES public.fee_requirements(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'uniforms',
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  gender TEXT NOT NULL DEFAULT 'all',
  form_levels TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active inventory"
  ON public.inventory_items FOR SELECT TO authenticated
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage inventory items"
  ON public.inventory_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners view inventory items"
  ON public.inventory_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE TRIGGER trg_inventory_items_updated
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inventory sales table
CREATE SEQUENCE IF NOT EXISTS inventory_receipt_seq START 1;

CREATE TABLE public.inventory_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  receipt_number TEXT UNIQUE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'paid',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  cashier_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all sales"
  ON public.inventory_sales FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners view all sales"
  ON public.inventory_sales FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Students view own sales"
  ON public.inventory_sales FOR SELECT TO authenticated
  USING (student_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins insert sales"
  ON public.inventory_sales FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update sales"
  ON public.inventory_sales FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_inventory_sales_updated
  BEFORE UPDATE ON public.inventory_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Generate receipt number on insert
CREATE OR REPLACE FUNCTION public.generate_inventory_receipt_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.receipt_number IS NULL THEN
    NEW.receipt_number := 'INV-' || LPAD(nextval('inventory_receipt_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_receipt_number
  BEFORE INSERT ON public.inventory_sales
  FOR EACH ROW EXECUTE FUNCTION public.generate_inventory_receipt_number();

-- Decrement stock on sale
CREATE OR REPLACE FUNCTION public.decrement_inventory_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item JSONB;
  v_id UUID;
  v_qty INTEGER;
BEGIN
  IF NEW.status = 'paid' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
      v_id := (item->>'item_id')::UUID;
      v_qty := COALESCE((item->>'quantity')::INTEGER, 1);
      IF v_id IS NOT NULL THEN
        UPDATE inventory_items
        SET stock_quantity = GREATEST(0, stock_quantity - v_qty)
        WHERE id = v_id;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON public.inventory_sales
  FOR EACH ROW EXECUTE FUNCTION public.decrement_inventory_stock();

-- Seed inventory items from existing fee_requirements (uniforms, books, stationery)
INSERT INTO public.inventory_items (fee_requirement_id, name, category, price, gender, form_levels, notes, stock_quantity, sort_order)
SELECT id, item_name, category, amount, gender, form_levels, notes, 0, sort_order
FROM public.fee_requirements
WHERE is_active = true AND category IN ('uniforms', 'books', 'stationery') AND amount > 0;
