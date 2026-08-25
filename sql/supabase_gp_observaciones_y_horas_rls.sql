-- Fornitalia – Observaciones en entregable/tarea + arreglo RLS al guardar horas.
-- El INSERT directo en gp_tarea_hora / gp_entregable_hora falla: el trigger completa
-- created_by (FK a auth.users) y PostgreSQL evalúa esa FK con RLS del rol authenticated.
-- Guardar horas pasa por RPC SECURITY DEFINER. created_by queda uuid sin FK a auth.users.
-- Requiere sql/supabase_gestion_proyectos.sql y sql/helpers_fecha_argentina.sql.

ALTER TABLE public.gp_entregable ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE public.gp_tarea ADD COLUMN IF NOT EXISTS observaciones text;

COMMENT ON COLUMN public.gp_entregable.observaciones IS 'Notas libres del entregable (además del alcance).';
COMMENT ON COLUMN public.gp_tarea.observaciones IS 'Notas libres de la tarea (además del alcance).';

ALTER TABLE public.gp_tarea_hora DROP CONSTRAINT IF EXISTS gp_tarea_hora_created_by_fkey;
ALTER TABLE public.gp_entregable_hora DROP CONSTRAINT IF EXISTS gp_entregable_hora_created_by_fkey;

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

REVOKE ALL ON TABLE public.gp_tarea_hora FROM anon;
REVOKE ALL ON TABLE public.gp_entregable_hora FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gp_tarea_hora TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gp_entregable_hora TO authenticated;

DROP POLICY IF EXISTS gp_tarea_hora_insert ON public.gp_tarea_hora;
CREATE POLICY gp_tarea_hora_insert ON public.gp_tarea_hora FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('crear_proyecto')
    OR public.has_permission('editar_proyecto')
  );

DROP POLICY IF EXISTS gp_entregable_hora_insert ON public.gp_entregable_hora;
CREATE POLICY gp_entregable_hora_insert ON public.gp_entregable_hora FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('crear_proyecto')
    OR public.has_permission('editar_proyecto')
  );

CREATE OR REPLACE FUNCTION public.gp_guardar_horas_tarea(p_tarea_id uuid, p_filas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_permission('crear_proyecto') OR public.has_permission('editar_proyecto')) THEN
    RAISE EXCEPTION 'Sin permiso para guardar horas de la tarea.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gp_tarea t WHERE t.id = p_tarea_id) THEN
    RAISE EXCEPTION 'La tarea no existe.';
  END IF;

  DELETE FROM public.gp_tarea_hora WHERE tarea_id = p_tarea_id;

  INSERT INTO public.gp_tarea_hora (tarea_id, fecha, horas, created_by)
  SELECT p_tarea_id,
         (x->>'fecha')::date,
         ROUND((x->>'horas')::numeric, 2),
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE COALESCE((x->>'horas')::numeric, 0) > 0
    AND COALESCE((x->>'horas')::numeric, 0) <= 9999
    AND NULLIF(btrim(x->>'fecha'), '') IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_guardar_horas_entregable(p_entregable_id uuid, p_filas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión vencida. Recargá la página e iniciá sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_permission('crear_proyecto') OR public.has_permission('editar_proyecto')) THEN
    RAISE EXCEPTION 'Sin permiso para guardar horas del entregable.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gp_entregable e WHERE e.id = p_entregable_id) THEN
    RAISE EXCEPTION 'El entregable no existe.';
  END IF;

  DELETE FROM public.gp_entregable_hora WHERE entregable_id = p_entregable_id;

  INSERT INTO public.gp_entregable_hora (entregable_id, fecha, horas, created_by)
  SELECT p_entregable_id,
         (x->>'fecha')::date,
         ROUND((x->>'horas')::numeric, 2),
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS x
  WHERE COALESCE((x->>'horas')::numeric, 0) > 0
    AND COALESCE((x->>'horas')::numeric, 0) <= 9999
    AND NULLIF(btrim(x->>'fecha'), '') IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gp_guardar_horas_tarea(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_guardar_horas_entregable(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.gp_guardar_horas_tarea(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gp_guardar_horas_entregable(uuid, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public.gp_guardar_horas_tarea(uuid, jsonb) IS
  'Reemplaza las horas consumidas de una tarea (fecha de negocio Argentina). Bypass RLS; exige crear_proyecto o editar_proyecto.';
COMMENT ON FUNCTION public.gp_guardar_horas_entregable(uuid, jsonb) IS
  'Reemplaza las horas propias de un entregable. Bypass RLS; exige crear_proyecto o editar_proyecto.';
