-- Fornitalia – Gestión de Proyectos / Planes de trabajo
-- Jerarquía: Proyecto → Entregables → Tareas y Dependencias.
-- Permisos (configurables en Seguridad): ver_gestion_proyectos, crear_proyecto, editar_proyecto, eliminar_proyecto.
-- Requiere public.fecha_hoy_argentina() (sql/helpers_fecha_argentina.sql) y el módulo de seguridad.

-- ========== 0. Helper updated_at ==========

CREATE OR REPLACE FUNCTION public.gp_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- ========== 1. Permisos ==========

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_gestion_proyectos', 'Ver menú Gestión de Proyectos (planes de trabajo)'),
  ('crear_proyecto', 'Alta de proyectos, entregables, tareas y dependencias'),
  ('editar_proyecto', 'Modificar proyectos, entregables, tareas y dependencias'),
  ('eliminar_proyecto', 'Eliminar proyectos, entregables, tareas y dependencias')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'), ('encargado')) AS r(role)
CROSS JOIN (
  VALUES
    ('ver_gestion_proyectos'),
    ('crear_proyecto'),
    ('editar_proyecto'),
    ('eliminar_proyecto')
) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;

-- ========== 2. Tablas ==========

CREATE TABLE IF NOT EXISTS public.gp_proyecto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  alcance text,
  fecha_inicio date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  fecha_fin date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  responsable_tipo text NOT NULL CHECK (responsable_tipo IN ('usuario', 'perfil')),
  responsable_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsable_role text REFERENCES public.app_role(role) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'planificado'
    CHECK (estado IN ('planificado', 'en_curso', 'pausado', 'completado', 'cancelado')),
  progreso_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (progreso_pct >= 0 AND progreso_pct <= 100),
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT gp_proyecto_fechas_chk CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT gp_proyecto_responsable_chk CHECK (
    (responsable_tipo = 'usuario' AND responsable_user_id IS NOT NULL)
    OR (responsable_tipo = 'perfil' AND responsable_role IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_gp_proyecto_fechas ON public.gp_proyecto (fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_gp_proyecto_estado ON public.gp_proyecto (estado);

CREATE TABLE IF NOT EXISTS public.gp_entregable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.gp_proyecto(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  alcance text,
  observaciones text,
  fecha_inicio date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  fecha_fin date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  responsable_tipo text NOT NULL CHECK (responsable_tipo IN ('usuario', 'perfil')),
  responsable_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsable_role text REFERENCES public.app_role(role) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_curso', 'hecha', 'cancelada')),
  progreso_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (progreso_pct >= 0 AND progreso_pct <= 100),
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT gp_entregable_fechas_chk CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT gp_entregable_responsable_chk CHECK (
    (responsable_tipo = 'usuario' AND responsable_user_id IS NOT NULL)
    OR (responsable_tipo = 'perfil' AND responsable_role IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_gp_entregable_proyecto ON public.gp_entregable (proyecto_id, orden);

CREATE TABLE IF NOT EXISTS public.gp_tarea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregable_id uuid NOT NULL REFERENCES public.gp_entregable(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  alcance text,
  observaciones text,
  fecha_inicio date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  fecha_fin date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  responsable_tipo text NOT NULL CHECK (responsable_tipo IN ('usuario', 'perfil')),
  responsable_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsable_role text REFERENCES public.app_role(role) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_curso', 'hecha', 'cancelada')),
  progreso_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (progreso_pct >= 0 AND progreso_pct <= 100),
  horas_alocadas numeric(8,2) NOT NULL DEFAULT 0 CHECK (horas_alocadas >= 0),
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT gp_tarea_fechas_chk CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT gp_tarea_responsable_chk CHECK (
    (responsable_tipo = 'usuario' AND responsable_user_id IS NOT NULL)
    OR (responsable_tipo = 'perfil' AND responsable_role IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_gp_tarea_entregable ON public.gp_tarea (entregable_id, orden);

-- Conciliación de horas: una fila por tarea y fecha de negocio (Argentina).
-- Ver también sql/supabase_gp_tarea_hora.sql (migración incremental).
CREATE TABLE IF NOT EXISTS public.gp_tarea_hora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.gp_tarea(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  horas numeric(8,2) NOT NULL CHECK (horas > 0 AND horas <= 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT gp_tarea_hora_unica UNIQUE (tarea_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_gp_tarea_hora_tarea ON public.gp_tarea_hora (tarea_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gp_tarea_hora_fecha ON public.gp_tarea_hora (fecha);

CREATE TABLE IF NOT EXISTS public.gp_entregable_hora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregable_id uuid NOT NULL REFERENCES public.gp_entregable(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  horas numeric(8,2) NOT NULL CHECK (horas > 0 AND horas <= 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT gp_entregable_hora_unica UNIQUE (entregable_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_gp_entregable_hora_ent ON public.gp_entregable_hora (entregable_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gp_entregable_hora_fecha ON public.gp_entregable_hora (fecha);

CREATE TABLE IF NOT EXISTS public.gp_dependencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregable_id uuid NOT NULL REFERENCES public.gp_entregable(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  responsable_tipo text NOT NULL CHECK (responsable_tipo IN ('usuario', 'perfil')),
  responsable_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsable_role text REFERENCES public.app_role(role) ON DELETE SET NULL,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT gp_dependencia_responsable_chk CHECK (
    (responsable_tipo = 'usuario' AND responsable_user_id IS NOT NULL)
    OR (responsable_tipo = 'perfil' AND responsable_role IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_gp_dependencia_entregable ON public.gp_dependencia (entregable_id, orden);

DROP TRIGGER IF EXISTS trg_gp_proyecto_updated ON public.gp_proyecto;
CREATE TRIGGER trg_gp_proyecto_updated
  BEFORE INSERT OR UPDATE ON public.gp_proyecto
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

DROP TRIGGER IF EXISTS trg_gp_entregable_updated ON public.gp_entregable;
CREATE TRIGGER trg_gp_entregable_updated
  BEFORE INSERT OR UPDATE ON public.gp_entregable
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

DROP TRIGGER IF EXISTS trg_gp_tarea_updated ON public.gp_tarea;
CREATE TRIGGER trg_gp_tarea_updated
  BEFORE INSERT OR UPDATE ON public.gp_tarea
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

DROP TRIGGER IF EXISTS trg_gp_dependencia_updated ON public.gp_dependencia;
CREATE TRIGGER trg_gp_dependencia_updated
  BEFORE INSERT OR UPDATE ON public.gp_dependencia
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

DROP TRIGGER IF EXISTS trg_gp_tarea_hora_updated ON public.gp_tarea_hora;
CREATE TRIGGER trg_gp_tarea_hora_updated
  BEFORE INSERT OR UPDATE ON public.gp_tarea_hora
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

DROP TRIGGER IF EXISTS trg_gp_entregable_hora_updated ON public.gp_entregable_hora;
CREATE TRIGGER trg_gp_entregable_hora_updated
  BEFORE INSERT OR UPDATE ON public.gp_entregable_hora
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

-- ========== 3. RLS ==========

ALTER TABLE public.gp_proyecto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_entregable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_tarea ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_tarea_hora ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_entregable_hora ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_dependencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gp_proyecto_select ON public.gp_proyecto;
CREATE POLICY gp_proyecto_select ON public.gp_proyecto FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_proyecto_insert ON public.gp_proyecto;
CREATE POLICY gp_proyecto_insert ON public.gp_proyecto FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_proyecto'));
DROP POLICY IF EXISTS gp_proyecto_update ON public.gp_proyecto;
CREATE POLICY gp_proyecto_update ON public.gp_proyecto FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_proyecto_delete ON public.gp_proyecto;
CREATE POLICY gp_proyecto_delete ON public.gp_proyecto FOR DELETE TO authenticated
  USING (public.has_permission('eliminar_proyecto'));

DROP POLICY IF EXISTS gp_entregable_select ON public.gp_entregable;
CREATE POLICY gp_entregable_select ON public.gp_entregable FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_entregable_insert ON public.gp_entregable;
CREATE POLICY gp_entregable_insert ON public.gp_entregable FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_proyecto'));
DROP POLICY IF EXISTS gp_entregable_update ON public.gp_entregable;
CREATE POLICY gp_entregable_update ON public.gp_entregable FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_entregable_delete ON public.gp_entregable;
CREATE POLICY gp_entregable_delete ON public.gp_entregable FOR DELETE TO authenticated
  USING (public.has_permission('eliminar_proyecto'));

DROP POLICY IF EXISTS gp_tarea_select ON public.gp_tarea;
CREATE POLICY gp_tarea_select ON public.gp_tarea FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_tarea_insert ON public.gp_tarea;
CREATE POLICY gp_tarea_insert ON public.gp_tarea FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_proyecto'));
DROP POLICY IF EXISTS gp_tarea_update ON public.gp_tarea;
CREATE POLICY gp_tarea_update ON public.gp_tarea FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_tarea_delete ON public.gp_tarea;
CREATE POLICY gp_tarea_delete ON public.gp_tarea FOR DELETE TO authenticated
  USING (public.has_permission('eliminar_proyecto'));

DROP POLICY IF EXISTS gp_tarea_hora_select ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_select ON public.gp_tarea_hora FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_tarea_hora_insert ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_insert ON public.gp_tarea_hora FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('crear_proyecto')
    OR public.has_permission('editar_proyecto')
  );
DROP POLICY IF EXISTS gp_tarea_hora_update ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_update ON public.gp_tarea_hora FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_tarea_hora_delete ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_delete ON public.gp_tarea_hora FOR DELETE TO authenticated
  USING (
    public.has_permission('editar_proyecto')
    OR public.has_permission('eliminar_proyecto')
  );

DROP POLICY IF EXISTS gp_entregable_hora_select ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_select ON public.gp_entregable_hora FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_entregable_hora_insert ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_insert ON public.gp_entregable_hora FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('crear_proyecto')
    OR public.has_permission('editar_proyecto')
  );
DROP POLICY IF EXISTS gp_entregable_hora_update ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_update ON public.gp_entregable_hora FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_entregable_hora_delete ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_delete ON public.gp_entregable_hora FOR DELETE TO authenticated
  USING (
    public.has_permission('editar_proyecto')
    OR public.has_permission('eliminar_proyecto')
  );

DROP POLICY IF EXISTS gp_dependencia_select ON public.gp_dependencia;
CREATE POLICY gp_dependencia_select ON public.gp_dependencia FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_dependencia_insert ON public.gp_dependencia;
CREATE POLICY gp_dependencia_insert ON public.gp_dependencia FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_proyecto'));
DROP POLICY IF EXISTS gp_dependencia_update ON public.gp_dependencia;
CREATE POLICY gp_dependencia_update ON public.gp_dependencia FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_dependencia_delete ON public.gp_dependencia;
CREATE POLICY gp_dependencia_delete ON public.gp_dependencia FOR DELETE TO authenticated
  USING (public.has_permission('eliminar_proyecto'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_proyecto TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_entregable TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_tarea TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_tarea_hora TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_entregable_hora TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_dependencia TO authenticated;
-- Horas propias del proyecto: sql/supabase_gp_proyecto_hora.sql (gp_proyecto_hora + gp_guardar_horas_proyecto).

-- ========== 4. Catálogo de responsables (usuarios y perfiles) ==========
-- nombre_usuario: ver sql/supabase_user_profiles_nombre_usuario.sql (Mi perfil / Seguridad).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS nombre_usuario text;

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
          'label', COALESCE(NULLIF(btrim(p.nombre_usuario), ''), NULLIF(btrim(p.email), ''), '')
        )
        ORDER BY COALESCE(NULLIF(btrim(p.nombre_usuario), ''), p.email), p.email
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

-- Observaciones en entregable/tarea y RPC para guardar horas:
-- sql/supabase_gp_observaciones_y_horas_rls.sql y sql/supabase_gp_hora_observaciones.sql

COMMENT ON TABLE public.gp_proyecto IS 'Plan de trabajo / proyecto (Gestión de Proyectos).';
COMMENT ON TABLE public.gp_entregable IS 'Entregable de un proyecto: nombre, alcance, observaciones, fechas y responsable (usuario o perfil).';
COMMENT ON TABLE public.gp_tarea IS 'Tarea asociada a un entregable (misma metadata que el entregable, observaciones incluidas).';
COMMENT ON TABLE public.gp_tarea_hora IS 'Conciliación de horas consumidas (reales) por tarea y fecha de negocio (Argentina); no es alocación planificada.';
COMMENT ON TABLE public.gp_entregable_hora IS 'Horas consumidas propias del entregable por fecha; el total del entregable suma estas más las de las tareas.';
COMMENT ON TABLE public.gp_dependencia IS 'Dependencia del entregable (viñeta + responsable usuario o perfil).';
