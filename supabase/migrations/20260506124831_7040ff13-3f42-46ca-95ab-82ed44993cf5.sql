DELETE FROM public.payment_audit_log;
DELETE FROM public.payments;
DELETE FROM public.inventory_sales;
DELETE FROM public.attendance;
DELETE FROM public.activity_log;
ALTER SEQUENCE IF EXISTS receipt_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS inventory_receipt_seq RESTART WITH 1;
UPDATE public.profiles SET balance = 0, is_beginner = true;