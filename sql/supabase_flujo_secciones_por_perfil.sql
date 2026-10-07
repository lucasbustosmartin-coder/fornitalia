-- Flujo de caja: secciones y carga histórica configurables por perfil.
-- Quien ya entra a Flujo de caja sigue viendo Cards y Flujo por mes.
-- El botón Cargar tesorería histórica queda para quien ya podía cargar conciliación o cajas.

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_flujo_cards', 'Cards'),
  ('ver_flujo_por_mes', 'Flujo por mes'),
  ('cargar_tesoreria_historica', 'Cargar tesorería histórica')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

UPDATE public.app_permission
SET description = 'Todas las transacciones'
WHERE permission = 'ver_solapa_todas_transacciones';

UPDATE public.app_permission
SET description = 'Evolución'
WHERE permission = 'ver_solapa_evolucion';

UPDATE public.app_permission
SET description = 'Estado financiero'
WHERE permission = 'ver_solapa_estado_financiero';

INSERT INTO public.app_role_permission (role, permission)
SELECT rp.role, p.permission
FROM public.app_role_permission rp
CROSS JOIN (
  VALUES ('ver_flujo_cards'), ('ver_flujo_por_mes')
) AS p(permission)
WHERE rp.permission IN ('ver_solapa_flujo', 'dashboard_operador')
ON CONFLICT (role, permission) DO NOTHING;

INSERT INTO public.app_role_permission (role, permission)
SELECT DISTINCT rp.role, 'cargar_tesoreria_historica'
FROM public.app_role_permission rp
WHERE rp.permission IN ('cargar_conciliacion_bancaria', 'cargar_cajas_fisicas')
ON CONFLICT (role, permission) DO NOTHING;
