-- Fornitalia – Archivos adjuntos de Gestión de Proyectos
-- Mismo patrón que horas: filas por fecha en proyecto, entregable y tarea.
-- Storage privado `gp-archivos` (Supabase Storage); la app abre con URL firmada.
-- Fecha de negocio: public.fecha_hoy_argentina() (sql/helpers_fecha_argentina.sql).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gp-archivos', 'gp-archivos', false, 20971520, NULL)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS gp_archivos_select ON storage.objects;
DROP POLICY IF EXISTS gp_archivos_insert ON storage.objects;
DROP POLICY IF EXISTS gp_archivos_update ON storage.objects;
DROP POLICY IF EXISTS gp_archivos_delete ON storage.objects;

CREATE POLICY gp_archivos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gp-archivos'
    AND public.has_permission('ver_gestion_proyectos')
  );

CREATE POLICY gp_archivos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gp-archivos'
    AND (
      public.has_permission('crear_proyecto')
      OR public.has_permission('editar_proyecto')
    )
  );

CREATE POLICY gp_archivos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'gp-archivos'
    AND public.has_permission('editar_proyecto')
  )
  WITH CHECK (
    bucket_id = 'gp-archivos'
    AND public.has_permission('editar_proyecto')
  );

CREATE POLICY gp_archivos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gp-archivos'
    AND (
      public.has_permission('editar_proyecto')
      OR public.has_permission('eliminar_proyecto')
    )
  );

CREATE TABLE IF NOT EXISTS public.gp_proyecto_archivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.gp_proyecto(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  descripcion text,
  nombre_archivo text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.gp_entregable_archivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregable_id uuid NOT NULL REFERENCES public.gp_entregable(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  descripcion text,
  nombre_archivo text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.gp_tarea_archivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.gp_tarea(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  descripcion text,
  nombre_archivo text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_gp_proyecto_archivo_proy ON public.gp_proyecto_archivo (proyecto_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gp_entregable_archivo_ent ON public.gp_entregable_archivo (entregable_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gp_tarea_archivo_tar ON public.gp_tarea_archivo (tarea_id, fecha);

DROP TRIGGER IF EXISTS trg_gp_proyecto_archivo_updated ON public.gp_proyecto_archivo;
CREATE TRIGGER trg_gp_proyecto_archivo_updated
  BEFORE INSERT OR UPDATE ON public.gp_proyecto_archivo
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

DROP TRIGGER IF EXISTS trg_gp_entregable_archivo_updated ON public.gp_entregable_archivo;
CREATE TRIGGER trg_gp_entregable_archivo_updated
  BEFORE INSERT OR UPDATE ON public.gp_entregable_archivo
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

DROP TRIGGER IF EXISTS trg_gp_tarea_archivo_updated ON public.gp_tarea_archivo;
CREATE TRIGGER trg_gp_tarea_archivo_updated
  BEFORE INSERT OR UPDATE ON public.gp_tarea_archivo
  FOR EACH ROW EXECUTE FUNCTION public.gp_set_updated_at();

ALTER TABLE public.gp_proyecto_archivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_entregable_archivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_tarea_archivo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gp_proyecto_archivo FROM anon;
REVOKE ALL ON TABLE public.gp_entregable_archivo FROM anon;
REVOKE ALL ON TABLE public.gp_tarea_archivo FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gp_proyecto_archivo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gp_entregable_archivo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gp_tarea_archivo TO authenticated;

DROP POLICY IF EXISTS gp_proyecto_archivo_select ON public.gp_proyecto_archivo;
CREATE POLICY gp_proyecto_archivo_select ON public.gp_proyecto_archivo FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_proyecto_archivo_insert ON public.gp_proyecto_archivo;
CREATE POLICY gp_proyecto_archivo_insert ON public.gp_proyecto_archivo FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_proyecto') OR public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_proyecto_archivo_update ON public.gp_proyecto_archivo;
CREATE POLICY gp_proyecto_archivo_update ON public.gp_proyecto_archivo FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_proyecto_archivo_delete ON public.gp_proyecto_archivo;
CREATE POLICY gp_proyecto_archivo_delete ON public.gp_proyecto_archivo FOR DELETE TO authenticated
  USING (public.has_permission('editar_proyecto') OR public.has_permission('eliminar_proyecto'));

DROP POLICY IF EXISTS gp_entregable_archivo_select ON public.gp_entregable_archivo;
CREATE POLICY gp_entregable_archivo_select ON public.gp_entregable_archivo FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_entregable_archivo_insert ON public.gp_entregable_archivo;
CREATE POLICY gp_entregable_archivo_insert ON public.gp_entregable_archivo FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_proyecto') OR public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_entregable_archivo_update ON public.gp_entregable_archivo;
CREATE POLICY gp_entregable_archivo_update ON public.gp_entregable_archivo FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_entregable_archivo_delete ON public.gp_entregable_archivo;
CREATE POLICY gp_entregable_archivo_delete ON public.gp_entregable_archivo FOR DELETE TO authenticated
  USING (public.has_permission('editar_proyecto') OR public.has_permission('eliminar_proyecto'));

DROP POLICY IF EXISTS gp_tarea_archivo_select ON public.gp_tarea_archivo;
CREATE POLICY gp_tarea_archivo_select ON public.gp_tarea_archivo FOR SELECT TO authenticated
  USING (public.has_permission('ver_gestion_proyectos'));
DROP POLICY IF EXISTS gp_tarea_archivo_insert ON public.gp_tarea_archivo;
CREATE POLICY gp_tarea_archivo_insert ON public.gp_tarea_archivo FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_proyecto') OR public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_tarea_archivo_update ON public.gp_tarea_archivo;
CREATE POLICY gp_tarea_archivo_update ON public.gp_tarea_archivo FOR UPDATE TO authenticated
  USING (public.has_permission('editar_proyecto'))
  WITH CHECK (public.has_permission('editar_proyecto'));
DROP POLICY IF EXISTS gp_tarea_archivo_delete ON public.gp_tarea_archivo;
CREATE POLICY gp_tarea_archivo_delete ON public.gp_tarea_archivo FOR DELETE TO authenticated
  USING (public.has_permission('editar_proyecto') OR public.has_permission('eliminar_proyecto'));

COMMENT ON TABLE public.gp_proyecto_archivo IS 'Adjuntos del proyecto: fecha (Argentina), descripción y archivo en bucket gp-archivos.';
COMMENT ON TABLE public.gp_entregable_archivo IS 'Adjuntos del entregable: fecha (Argentina), descripción y archivo en bucket gp-archivos.';
COMMENT ON TABLE public.gp_tarea_archivo IS 'Adjuntos de la tarea: fecha (Argentina), descripción y archivo en bucket gp-archivos.';
COMMENT ON COLUMN public.gp_proyecto_archivo.fecha IS 'Día de negocio Argentina (no CURRENT_DATE).';
COMMENT ON COLUMN public.gp_entregable_archivo.fecha IS 'Día de negocio Argentina (no CURRENT_DATE).';
COMMENT ON COLUMN public.gp_tarea_archivo.fecha IS 'Día de negocio Argentina (no CURRENT_DATE).';
