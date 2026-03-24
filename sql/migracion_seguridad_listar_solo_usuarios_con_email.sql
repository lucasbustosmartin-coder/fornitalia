-- Fornitalia: la vista Seguridad solo debe listar usuarios con email.
-- Cada sesión "invitado" (signInAnonymously) crea auth.users + user_profiles con email vacío;
-- sin este filtro aparecen muchas filas en blanco.
-- Ejecutar en Supabase SQL Editor si ya aplicaste supabase_seguridad_forfitalia.sql antes de este ajuste.

CREATE OR REPLACE FUNCTION public.get_users_for_admin()
RETURNS TABLE (user_id uuid, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.email, COALESCE(u.role, 'visor')
  FROM public.user_profiles p
  LEFT JOIN public.app_user_profile u ON u.user_id = p.id
  WHERE public.has_permission('assign_roles')
    AND p.email IS NOT NULL
    AND length(trim(both from p.email)) > 0;
$$;
