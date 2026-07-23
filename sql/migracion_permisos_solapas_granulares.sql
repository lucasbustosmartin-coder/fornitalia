-- Fornitalia – Permisos granulares por solapa / menú / acción
-- Reemplaza el uso todo-o-nada de dashboard_operador en la UI (se conserva por compatibilidad).
-- Ejecutar en Supabase SQL Editor o vía apply_migration MCP.
--
-- Roles con dashboard_operador reciben todas las solapas y acciones de operador.
-- Visor recibe ver_solapa_flujo (además de exportar_base_historica si ya lo tenía).

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_solapa_flujo', 'Ver solapa Flujo por mes'),
  ('ver_solapa_errores', 'Ver solapa Errores'),
  ('ver_solapa_todas_transacciones', 'Ver solapa Todas las transacciones'),
  ('ver_solapa_evolucion', 'Ver solapa Evolución'),
  ('ver_solapa_estado_financiero', 'Ver solapa Estado Financiero'),
  ('ver_solapa_excluidos_upload', 'Ver solapa Excluidos upload'),
  ('ver_novedades', 'Ver menú Novedades del Negocio'),
  ('ver_configuracion', 'Ver menú Configuración'),
  ('ver_reportes', 'Ver menú Reportes'),
  ('carga_normalizada', 'Actualizar base desde extracto normalizado'),
  ('editar_registros', 'Editar registros de transacciones')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

UPDATE public.app_permission
SET description = 'Compatibilidad: otorga todas las solapas y acciones de operador (legacy). Preferir permisos ver_solapa_* / ver_* / carga_normalizada / editar_registros.'
WHERE permission = 'dashboard_operador';

-- Visor: al menos Flujo por mes
INSERT INTO public.app_role_permission (role, permission)
VALUES ('visor', 'ver_solapa_flujo')
ON CONFLICT (role, permission) DO NOTHING;

-- Quien tenía exportar_base_historica también ve Reportes (comportamiento previo)
INSERT INTO public.app_role_permission (role, permission)
SELECT rp.role, 'ver_reportes'
FROM public.app_role_permission rp
WHERE rp.permission = 'exportar_base_historica'
ON CONFLICT (role, permission) DO NOTHING;

-- Expandir dashboard_operador → permisos granulares
INSERT INTO public.app_role_permission (role, permission)
SELECT rp.role, p.permission
FROM public.app_role_permission rp
CROSS JOIN (
  VALUES
    ('ver_solapa_flujo'),
    ('ver_solapa_errores'),
    ('ver_solapa_todas_transacciones'),
    ('ver_solapa_evolucion'),
    ('ver_solapa_estado_financiero'),
    ('ver_solapa_excluidos_upload'),
    ('ver_novedades'),
    ('ver_configuracion'),
    ('ver_reportes'),
    ('carga_normalizada'),
    ('editar_registros')
) AS p(permission)
WHERE rp.permission = 'dashboard_operador'
ON CONFLICT (role, permission) DO NOTHING;

-- Asegurar políticas INSERT/DELETE para que el admin pueda togglear permisos (incl. Visor)
DROP POLICY IF EXISTS "app_role_permission_insert_assign_roles" ON public.app_role_permission;
CREATE POLICY "app_role_permission_insert_assign_roles"
  ON public.app_role_permission FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('assign_roles'));

DROP POLICY IF EXISTS "app_role_permission_delete_assign_roles" ON public.app_role_permission;
CREATE POLICY "app_role_permission_delete_assign_roles"
  ON public.app_role_permission FOR DELETE TO authenticated
  USING (public.has_permission('assign_roles'));

GRANT SELECT, INSERT, DELETE ON public.app_role_permission TO authenticated;
