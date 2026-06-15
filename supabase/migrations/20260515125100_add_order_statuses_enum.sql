-- 1. Add new statuses to payment_status_type ENUM
ALTER TYPE public.payment_status_type ADD VALUE IF NOT EXISTS 'Packed';
ALTER TYPE public.payment_status_type ADD VALUE IF NOT EXISTS 'Cancelled';
ALTER TYPE public.payment_status_type ADD VALUE IF NOT EXISTS 'Dispatched';
ALTER TYPE public.payment_status_type ADD VALUE IF NOT EXISTS 'In Transit';
ALTER TYPE public.payment_status_type ADD VALUE IF NOT EXISTS 'Order RTO';
ALTER TYPE public.payment_status_type ADD VALUE IF NOT EXISTS 'Return';
