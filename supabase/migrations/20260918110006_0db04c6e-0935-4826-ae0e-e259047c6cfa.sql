DELETE FROM public.kitchen_issues WHERE item_id IN (SELECT id FROM public.kitchen_items);
DELETE FROM public.kitchen_receipts WHERE item_id IN (SELECT id FROM public.kitchen_items);
DELETE FROM public.kitchen_items WHERE id IS NOT NULL;