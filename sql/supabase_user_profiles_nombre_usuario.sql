-- Nombre de usuario visible (como Everfit): reemplaza el email en Gestión de Proyectos,
-- combos de responsable, Mi perfil y Seguridad.
-- Ejecutar después de supabase_seguridad_forfitalia.sql y supabase_gestion_proyectos.sql.
-- Conserva el filtro de get_users_for_admin: solo cuentas con email (sin invitados anónimos).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS nombre_usuario text;

COMMENT ON COLUMN public.user_profiles.nombre_usuario IS
  'Nombre para mostrar (habitualmente iniciales). Si está vacío, la UI usa iniciales derivadas del email.';

CREATE OR REPLACE FUNCTION public.user_profile_label(p_nombre text, p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(btrim(p_nombre), ''), NULLIF(btrim(p_email), ''), '');
$$;

GRANT EXECUTE ON FUNCTION public.user_profile_label(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (email text, nombre_usuario text, label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.email,
    p.nombre_usuario,
    public.user_profile_label(p.nombre_usuario, p.email)
  FROM public.user_profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_nombre_usuario(p_user_id uuid, p_nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nombre text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario inválido';
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.has_permission('assign_roles') THEN
    RAISE EXCEPTION 'Sin permiso para editar este usuario';
  END IF;

  v_nombre := NULLIF(btrim(p_nombre), '');
  IF v_nombre IS NOT NULL AND char_length(v_nombre) > 80 THEN
    RAISE EXCEPTION 'El nombre no puede superar 80 caracteres';
  END IF;

  UPDATE public.user_profiles
  SET nombre_usuario = v_nombre
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_profiles (id, email, nombre_usuario)
    VALUES (
      p_user_id,
      COALESCE((SELECT u.email FROM auth.users u WHERE u.id = p_user_id), ''),
      v_nombre
    )
    ON CONFLICT (id) DO UPDATE SET nombre_usuario = EXCLUDED.nombre_usuario;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_nombre_usuario(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_nombre_usuario(p_nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.set_user_nombre_usuario(auth.uid(), p_nombre);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_nombre_usuario(text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_users_for_admin();
CREATE OR REPLACE FUNCTION public.get_users_for_admin()
RETURNS TABLE (
  user_id uuid,
  email text,
  nombre_usuario text,
  label text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.email,
    p.nombre_usuario,
    public.user_profile_label(p.nombre_usuario, p.email),
    COALESCE(u.role, 'visor')
  FROM public.user_profiles p
  LEFT JOIN public.app_user_profile u ON u.user_id = p.id
  WHERE public.has_permission('assign_roles')
    AND p.email IS NOT NULL
    AND length(trim(both from p.email)) > 0;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_for_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.gp_listar_catalogos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_permission('ver_gestion_proyectos') THEN
    RAISE EXCEPTION 'Sin permiso para ver gestión de proyectos';
  END IF;
  SELECT jsonb_build_object(
    'usuarios', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'email', p.email,
          'nombre_usuario', p.nombre_usuario,
          'label', public.user_profile_label(p.nombre_usuario, p.email)
        )
        ORDER BY public.user_profile_label(p.nombre_usuario, p.email), p.email
      )
      FROM public.user_profiles p
      WHERE p.email IS NOT NULL AND length(trim(both from p.email)) > 0
    ), '[]'::jsonb),
    'perfiles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('role', r.role, 'label', r.label) ORDER BY r.label)
      FROM public.app_role r
    ), '[]'::jsonb)
  ) INTO result;
  RETURN COALESCE(result, '{"usuarios":[],"perfiles":[]}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.gp_listar_catalogos() TO authenticated;
