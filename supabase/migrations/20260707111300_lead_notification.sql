-- Migration: extend lead_request_type enum for de-parken and access forms
--
-- Must run in a separate migration from any DML that uses the new values,
-- because ALTER TYPE ... ADD VALUE inside a transaction cannot be rolled back.

ALTER TYPE public.lead_request_type ADD VALUE 'parken';
ALTER TYPE public.lead_request_type ADD VALUE 'access';
