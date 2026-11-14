-- Fornitalia – menú Reposición hornos.
-- El cálculo vive en el navegador (momento cero + upload de Ventas).
-- Este script solo habilita el ítem para Admin y Encargado.
-- Hasta correrlo, el menú igual lo ve quien administra roles.

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_reposicion_hornos', 'Ver menú Reposición hornos')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT r.role, 'ver_reposicion_hornos'
FROM (VALUES ('admin'), ('encargado')) AS r(role)
ON CONFLICT (role, permission) DO NOTHING;
