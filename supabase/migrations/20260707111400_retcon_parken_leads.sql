-- Retcon existing de-parken leads to use the new 'parken' request_type
-- after the enum value was added in the previous migration.

UPDATE public.lead_requests
SET request_type = 'parken'
WHERE request_type = 'contact'
  AND source_path = '/de-parken/';
