-- Solapa Agenda de pagos en Flujo de caja.
-- Quien ya ve Flujo por mes también ve esta solapa.

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_solapa_agenda_pagos', 'Agenda de pagos')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT rp.role, 'ver_solapa_agenda_pagos'
FROM public.app_role_permission rp
WHERE rp.permission = 'ver_flujo_por_mes'
ON CONFLICT (role, permission) DO NOTHING;
