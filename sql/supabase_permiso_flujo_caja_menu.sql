-- Flujo de caja es el primer ítem del menú lateral (antes "Home").
-- El permiso ver_solapa_flujo controla menú + solapa; no es visible para cualquier usuario.
UPDATE public.app_permission
SET description = 'Ver Flujo de caja (menú lateral y solapa)'
WHERE permission = 'ver_solapa_flujo';
