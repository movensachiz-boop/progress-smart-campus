ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS swift_code text,
ADD COLUMN IF NOT EXISTS transaction_id_format text,
ADD COLUMN IF NOT EXISTS document_fingerprint text;