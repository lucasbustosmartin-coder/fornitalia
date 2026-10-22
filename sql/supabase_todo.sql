-- =============================================================================
-- Fornitalia – To-Do (bandeja), mismo modelo que Everfit.
-- Permisos: ver_todo, crear_todo, editar_todo, eliminar_todo, completar_todo.
-- ver y completar: todos los perfiles existentes.
-- crear, editar y eliminar: Admin y Encargado.
-- Sin catálogo de sucursales por usuario: no se filtra por sede.
-- Prerrequisito: sql/helpers_fecha_argentina.sql, sql/supabase_seguridad_forfitalia.sql
-- =============================================================================

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_todo', 'Ver menú To-Do y la bandeja de tareas propias o de su perfil'),
  ('crear_todo', 'Crear tareas del To-Do y ver las de todos'),
  ('editar_todo', 'Editar tareas del To-Do'),
  ('eliminar_todo', 'Eliminar tareas del To-Do'),
  ('completar_todo', 'Cambiar estado de tareas del To-Do (pendiente, en curso, hecha, cancelada)')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT r.role, p.permission
FROM public.app_role r
CROSS JOIN (VALUES ('ver_todo'), ('completar_todo')) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'crear_todo'),
  ('admin', 'editar_todo'),
  ('admin', 'eliminar_todo'),
  ('encargado', 'crear_todo'),
  ('encargado', 'editar_todo'),
  ('encargado', 'eliminar_todo')
ON CONFLICT (role, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sedes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  orden smallint NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sedes_nombre_no_vacio CHECK (length(trim(nombre)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sedes_nombre ON public.sedes (lower(trim(nombre)));

COMMENT ON TABLE public.sedes IS 'Catálogo opcional de sedes para replicar tareas To-Do. Vacío = solo Empresa.';

ALTER TABLE public.sedes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sedes_select_todo ON public.sedes;
CREATE POLICY sedes_select_todo ON public.sedes
  FOR SELECT TO authenticated
  USING (public.has_permission('ver_todo'));
GRANT SELECT ON public.sedes TO authenticated;

CREATE TABLE IF NOT EXISTS public.todo_tarea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  prioridad smallint NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
  responsable_tipo text NOT NULL CHECK (responsable_tipo IN ('usuario', 'rol')),
  responsable_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsable_role text REFERENCES public.app_role(role),
  recurrencia text NOT NULL DEFAULT 'ninguna'
    CHECK (recurrencia IN ('ninguna', 'diaria', 'semanal', 'mensual', 'bimestral', 'trimestral', 'anual')),
  hora_vencimiento time without time zone,
  dia_semana smallint CHECK (dia_semana IS NULL OR (dia_semana BETWEEN 1 AND 7)),
  dia_mes smallint CHECK (dia_mes IS NULL OR (dia_mes BETWEEN 1 AND 31)),
  fecha_inicio date NOT NULL DEFAULT public.fecha_hoy_argentina(),
  fecha_fin date,
  activa boolean NOT NULL DEFAULT true,
  creado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  aplica_todas_sedes boolean NOT NULL DEFAULT true,
  sede text,
  CONSTRAINT todo_tarea_responsable_chk CHECK (
    (responsable_tipo = 'usuario' AND responsable_user_id IS NOT NULL)
    OR (responsable_tipo = 'rol' AND responsable_role IS NOT NULL)
  ),
  CONSTRAINT todo_tarea_recurrencia_params_chk CHECK (
    (recurrencia = 'ninguna')
    OR (recurrencia = 'diaria')
    OR (recurrencia = 'semanal' AND dia_semana IS NOT NULL)
    OR (recurrencia IN ('mensual', 'bimestral', 'trimestral', 'anual') AND dia_mes IS NOT NULL)
  ),
  CONSTRAINT todo_tarea_sede_chk CHECK (
    (aplica_todas_sedes = true AND sede IS NULL)
    OR (aplica_todas_sedes = false)
  )
);

CREATE INDEX IF NOT EXISTS idx_todo_tarea_activa ON public.todo_tarea (activa);
CREATE INDEX IF NOT EXISTS idx_todo_tarea_responsable_user ON public.todo_tarea (responsable_user_id);
CREATE INDEX IF NOT EXISTS idx_todo_tarea_responsable_role ON public.todo_tarea (responsable_role);

CREATE TABLE IF NOT EXISTS public.todo_instancia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid REFERENCES public.todo_tarea(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descripcion text,
  prioridad smallint NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
  responsable_tipo text NOT NULL CHECK (responsable_tipo IN ('usuario', 'rol')),
  responsable_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsable_role text REFERENCES public.app_role(role),
  vencimiento_at timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_curso', 'hecha', 'cancelada')),
  completada_at timestamptz,
  completada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estado_modificado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sede text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT todo_instancia_responsable_chk CHECK (
    (responsable_tipo = 'usuario' AND responsable_user_id IS NOT NULL)
    OR (responsable_tipo = 'rol' AND responsable_role IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_todo_instancia_tarea_venc_sede
  ON public.todo_instancia (tarea_id, vencimiento_at, (COALESCE(sede, '')))
  WHERE tarea_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todo_instancia_estado ON public.todo_instancia (estado);
CREATE INDEX IF NOT EXISTS idx_todo_instancia_vencimiento ON public.todo_instancia (vencimiento_at);
CREATE INDEX IF NOT EXISTS idx_todo_instancia_resp_user ON public.todo_instancia (responsable_user_id);
CREATE INDEX IF NOT EXISTS idx_todo_instancia_resp_role ON public.todo_instancia (responsable_role);
CREATE INDEX IF NOT EXISTS idx_todo_instancia_sede ON public.todo_instancia (sede);

COMMENT ON TABLE public.todo_tarea IS 'Plantilla de tarea To-Do (incluye recurrencia y responsable usuario o perfil).';
COMMENT ON TABLE public.todo_instancia IS 'Ocurrencia visible en la bandeja To-Do.';
COMMENT ON COLUMN public.todo_tarea.prioridad IS '1=alta, 2=media, 3=baja';

-- ---------- Funciones ----------
CREATE OR REPLACE FUNCTION public.todo_es_domingo(p_fecha date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_fecha IS NOT NULL AND EXTRACT(ISODOW FROM p_fecha)::int = 7;
$$;

CREATE OR REPLACE FUNCTION public.todo_ts_argentina(p_fecha date, p_hora time without time zone)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ((p_fecha::text || ' ' || COALESCE(p_hora, time '23:59')::text)::timestamp
    AT TIME ZONE 'America/Argentina/Buenos_Aires');
$$;

CREATE OR REPLACE FUNCTION public.todo_puede_ver_instancia(i public.todo_instancia)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.has_permission('ver_todo')
    AND (
      public.has_permission('crear_todo')
      OR (i.responsable_tipo = 'usuario' AND i.responsable_user_id = auth.uid())
      OR (i.responsable_tipo = 'rol' AND i.responsable_role = public.get_my_role())
    );
$$;

CREATE OR REPLACE FUNCTION public.todo_puede_operar_instancia(i public.todo_instancia)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.has_permission('completar_todo')
    AND (
      public.has_permission('crear_todo')
      OR (i.responsable_tipo = 'usuario' AND i.responsable_user_id = auth.uid())
      OR (i.responsable_tipo = 'rol' AND i.responsable_role = public.get_my_role())
    );
$$;

CREATE OR REPLACE FUNCTION public.todo_sedes_para_tarea(t public.todo_tarea)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN t.aplica_todas_sedes THEN
      COALESCE((
        SELECT array_agg(s.nombre ORDER BY s.orden, s.nombre)
        FROM public.sedes s
        WHERE s.activa
      ), ARRAY[]::text[])
    WHEN t.sede IS NOT NULL AND length(trim(t.sede)) > 0 THEN
      ARRAY[trim(t.sede)]
    ELSE
      ARRAY[NULL]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_sucursales_list()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.nombre
  FROM public.sedes s
  WHERE s.activa
  ORDER BY s.orden, s.nombre;
$$;

CREATE OR REPLACE FUNCTION public.todo_next_dates(
  p_recurrencia text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_dia_semana smallint,
  p_dia_mes smallint,
  p_hasta date
)
RETURNS SETOF date
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  d date; last_day date; candidate date; emit date; step_months int; ancla date; usar_dia_mes boolean;
BEGIN
  ancla := COALESCE(p_fecha_inicio, public.fecha_hoy_argentina());
  d := ancla;
  IF p_recurrencia = 'ninguna' THEN
    IF NOT public.todo_es_domingo(d) THEN RETURN NEXT d; END IF;
    RETURN;
  END IF;
  last_day := LEAST(COALESCE(p_fecha_fin, p_hasta), p_hasta);
  IF last_day IS NULL OR d > last_day THEN RETURN; END IF;
  IF p_recurrencia = 'diaria' THEN
    WHILE d <= last_day LOOP
      IF NOT public.todo_es_domingo(d) THEN RETURN NEXT d; END IF;
      d := d + 1;
    END LOOP;
    RETURN;
  END IF;
  IF p_recurrencia = 'semanal' THEN
    IF p_dia_semana IS NOT NULL AND EXTRACT(ISODOW FROM d)::int <> p_dia_semana THEN
      WHILE EXTRACT(ISODOW FROM d)::int <> p_dia_semana LOOP
        d := d + 1; IF d > last_day THEN RETURN; END IF;
      END LOOP;
    END IF;
    IF public.todo_es_domingo(d) THEN d := d + 1; END IF;
    WHILE d <= last_day LOOP
      IF NOT public.todo_es_domingo(d) THEN RETURN NEXT d; END IF;
      d := d + 7;
    END LOOP;
    RETURN;
  END IF;
  IF p_recurrencia IN ('mensual', 'bimestral', 'trimestral', 'anual') THEN
    step_months := CASE p_recurrencia WHEN 'bimestral' THEN 2 WHEN 'trimestral' THEN 3 WHEN 'anual' THEN 12 ELSE 1 END;
    usar_dia_mes := p_dia_mes IS NOT NULL AND EXTRACT(DAY FROM ancla)::int <> p_dia_mes::int;
    IF NOT usar_dia_mes THEN
      WHILE d <= last_day LOOP
        emit := CASE WHEN public.todo_es_domingo(d) THEN d + 1 ELSE d END;
        IF emit <= last_day THEN RETURN NEXT emit; END IF;
        d := (d + pg_catalog.make_interval(months => step_months))::date;
      END LOOP;
      RETURN;
    END IF;
    d := date_trunc('month', ancla)::date;
    WHILE d <= last_day LOOP
      candidate := pg_catalog.make_date(EXTRACT(YEAR FROM d)::int, EXTRACT(MONTH FROM d)::int,
        LEAST(p_dia_mes::int, EXTRACT(DAY FROM (date_trunc('month', d) + interval '1 month' - interval '1 day'))::int));
      emit := CASE WHEN public.todo_es_domingo(candidate) THEN candidate + 1 ELSE candidate END;
      IF emit >= ancla AND emit <= last_day THEN RETURN NEXT emit; END IF;
      d := (date_trunc('month', d) + pg_catalog.make_interval(months => step_months))::date;
    END LOOP;
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_generar_instancias_tarea_interno(p_tarea_id uuid, p_dias_ventana integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  t public.todo_tarea%ROWTYPE;
  d date;
  v_at timestamptz;
  inserted int := 0;
  hasta date;
  hora time without time zone;
  sede_nom text;
  sedes text[];
  max_dias int;
BEGIN
  SELECT * INTO t FROM public.todo_tarea WHERE id = p_tarea_id;
  IF NOT FOUND OR NOT t.activa THEN
    RETURN 0;
  END IF;
  max_dias := LEAST(GREATEST(COALESCE(p_dias_ventana, 366), 1), 366);
  IF t.recurrencia = 'ninguna' THEN
    hasta := COALESCE(t.fecha_inicio, public.fecha_hoy_argentina());
  ELSIF t.fecha_fin IS NOT NULL THEN
    hasta := LEAST(t.fecha_fin, COALESCE(t.fecha_inicio, public.fecha_hoy_argentina()) + max_dias);
  ELSE
    hasta := public.fecha_hoy_argentina() + 7;
  END IF;
  hora := COALESCE(t.hora_vencimiento, time '23:59');
  sedes := public.todo_sedes_para_tarea(t);
  IF sedes IS NULL OR coalesce(array_length(sedes, 1), 0) = 0 THEN
    sedes := ARRAY[NULL]::text[];
  END IF;
  FOR d IN
    SELECT x FROM public.todo_next_dates(
      t.recurrencia, t.fecha_inicio, t.fecha_fin, t.dia_semana, t.dia_mes, hasta
    ) AS x
  LOOP
    v_at := public.todo_ts_argentina(d, hora);
    FOREACH sede_nom IN ARRAY sedes LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.todo_instancia i
        WHERE i.tarea_id = t.id
          AND i.vencimiento_at = v_at
          AND COALESCE(i.sede, '') = COALESCE(sede_nom, '')
      ) THEN
        INSERT INTO public.todo_instancia (
          tarea_id, titulo, descripcion, prioridad,
          responsable_tipo, responsable_user_id, responsable_role,
          vencimiento_at, estado, sede
        ) VALUES (
          t.id, t.titulo, t.descripcion, t.prioridad,
          t.responsable_tipo, t.responsable_user_id, t.responsable_role,
          v_at, 'pendiente', sede_nom
        );
        inserted := inserted + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_generar_instancias_tarea(p_tarea_id uuid, p_dias_ventana integer DEFAULT 45)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_permission('crear_todo') THEN
    RAISE EXCEPTION 'Sin permiso para generar instancias';
  END IF;
  RETURN public.todo_generar_instancias_tarea_interno(p_tarea_id, p_dias_ventana);
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_generar_instancias_todas(p_dias_ventana integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tid uuid;
  total int := 0;
  n int;
BEGIN
  IF NOT public.has_permission('ver_todo') THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  FOR tid IN SELECT id FROM public.todo_tarea WHERE activa = true LOOP
    n := public.todo_generar_instancias_tarea_interno(tid, p_dias_ventana);
    total := total + n;
  END LOOP;
  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_crear_tarea(
  p_titulo text,
  p_descripcion text DEFAULT NULL,
  p_prioridad smallint DEFAULT 2,
  p_responsable_tipo text DEFAULT 'usuario',
  p_responsable_user_id uuid DEFAULT NULL,
  p_responsable_role text DEFAULT NULL,
  p_recurrencia text DEFAULT 'ninguna',
  p_hora_vencimiento time without time zone DEFAULT NULL,
  p_dia_semana smallint DEFAULT NULL,
  p_dia_mes smallint DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_vencimiento_at timestamptz DEFAULT NULL,
  p_aplica_todas_sedes boolean DEFAULT true,
  p_sede text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid; v_inicio date; v_hora time without time zone; v_at timestamptz; v_rec text; v_todas boolean; v_sede text;
  v_dow smallint; v_dom smallint; sede_nom text; sedes text[];
BEGIN
  IF NOT public.has_permission('crear_todo') THEN RAISE EXCEPTION 'Sin permiso para crear tareas'; END IF;
  IF p_titulo IS NULL OR btrim(p_titulo) = '' THEN RAISE EXCEPTION 'El título es obligatorio'; END IF;
  IF p_responsable_tipo = 'usuario' AND p_responsable_user_id IS NULL THEN RAISE EXCEPTION 'Debe indicar el usuario responsable'; END IF;
  IF p_responsable_tipo = 'rol' AND (p_responsable_role IS NULL OR btrim(p_responsable_role) = '') THEN RAISE EXCEPTION 'Debe indicar el perfil responsable'; END IF;
  v_rec := COALESCE(p_recurrencia, 'ninguna');
  v_inicio := COALESCE(p_fecha_inicio, public.fecha_hoy_argentina());
  v_hora := COALESCE(p_hora_vencimiento, time '23:59');
  v_todas := COALESCE(p_aplica_todas_sedes, true);
  v_sede := NULLIF(btrim(COALESCE(p_sede, '')), '');
  IF public.todo_es_domingo(v_inicio) THEN RAISE EXCEPTION 'No se registran tareas en domingo (el comercio está cerrado)'; END IF;
  v_dow := EXTRACT(ISODOW FROM v_inicio)::smallint;
  v_dom := EXTRACT(DAY FROM v_inicio)::smallint;
  IF v_todas THEN v_sede := NULL; END IF;
  IF v_rec <> 'ninguna' THEN
    IF p_fecha_fin IS NULL THEN RAISE EXCEPTION 'En tareas recurrentes debés indicar hasta qué fecha se replica'; END IF;
    IF p_fecha_fin < v_inicio THEN RAISE EXCEPTION 'La fecha hasta no puede ser anterior al primer vencimiento'; END IF;
    IF p_fecha_fin > v_inicio + 366 THEN RAISE EXCEPTION 'El rango de réplica no puede superar 366 días'; END IF;
  END IF;
  INSERT INTO public.todo_tarea (
    titulo, descripcion, prioridad, responsable_tipo, responsable_user_id, responsable_role,
    recurrencia, hora_vencimiento, dia_semana, dia_mes, fecha_inicio, fecha_fin, activa, creado_por, aplica_todas_sedes, sede
  ) VALUES (
    btrim(p_titulo), NULLIF(btrim(COALESCE(p_descripcion, '')), ''), COALESCE(p_prioridad, 2),
    p_responsable_tipo,
    CASE WHEN p_responsable_tipo = 'usuario' THEN p_responsable_user_id ELSE NULL END,
    CASE WHEN p_responsable_tipo = 'rol' THEN p_responsable_role ELSE NULL END,
    v_rec, v_hora,
    CASE WHEN v_rec = 'semanal' THEN COALESCE(p_dia_semana, v_dow) ELSE NULL END,
    CASE WHEN v_rec IN ('mensual', 'bimestral', 'trimestral', 'anual') THEN COALESCE(p_dia_mes, v_dom) ELSE NULL END,
    v_inicio, CASE WHEN v_rec = 'ninguna' THEN NULL ELSE p_fecha_fin END, true, auth.uid(), v_todas, v_sede
  ) RETURNING id INTO v_id;
  IF v_rec = 'ninguna' THEN
    v_at := COALESCE(p_vencimiento_at, public.todo_ts_argentina(v_inicio, v_hora));
    SELECT public.todo_sedes_para_tarea(t) INTO sedes FROM public.todo_tarea t WHERE t.id = v_id;
    IF sedes IS NULL OR coalesce(array_length(sedes, 1), 0) = 0 THEN sedes := ARRAY[NULL]::text[]; END IF;
    FOREACH sede_nom IN ARRAY sedes LOOP
      INSERT INTO public.todo_instancia (
        tarea_id, titulo, descripcion, prioridad, responsable_tipo, responsable_user_id, responsable_role, vencimiento_at, estado, sede
      )
      SELECT v_id, t.titulo, t.descripcion, t.prioridad, t.responsable_tipo, t.responsable_user_id, t.responsable_role, v_at, 'pendiente', sede_nom
      FROM public.todo_tarea t WHERE t.id = v_id;
    END LOOP;
  ELSE
    PERFORM public.todo_generar_instancias_tarea_interno(v_id, NULL);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_cambiar_estado(p_instancia_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  i public.todo_instancia%ROWTYPE;
  v_rec text;
  v_dia_venc date;
BEGIN
  IF p_estado NOT IN ('pendiente', 'en_curso', 'hecha', 'cancelada') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  SELECT * INTO i FROM public.todo_instancia WHERE id = p_instancia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF NOT public.todo_puede_operar_instancia(i) THEN
    RAISE EXCEPTION 'Sin permiso para cambiar el estado';
  END IF;
  IF p_estado = 'hecha' THEN
    SELECT COALESCE(t.recurrencia, 'ninguna') INTO v_rec
    FROM public.todo_tarea t WHERE t.id = i.tarea_id;
    IF COALESCE(v_rec, 'ninguna') = 'diaria' AND i.vencimiento_at IS NOT NULL THEN
      v_dia_venc := (i.vencimiento_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
      IF v_dia_venc > public.fecha_hoy_argentina() THEN
        RAISE EXCEPTION 'Esta tarea diaria se puede dar por hecha a partir del día de vencimiento';
      END IF;
    END IF;
  END IF;
  UPDATE public.todo_instancia
  SET
    estado = p_estado,
    completada_at = CASE WHEN p_estado = 'hecha' THEN now() ELSE NULL END,
    completada_por = CASE WHEN p_estado = 'hecha' THEN auth.uid() ELSE NULL END,
    estado_modificado_por = auth.uid(),
    updated_at = now()
  WHERE id = p_instancia_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_editar_instancia(
  p_instancia_id uuid,
  p_titulo text DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
  p_prioridad smallint DEFAULT NULL,
  p_vencimiento_at timestamptz DEFAULT NULL,
  p_sede text DEFAULT NULL,
  p_actualizar_plantilla boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  i public.todo_instancia%ROWTYPE; v_titulo text; v_desc text; v_prio smallint; v_venc timestamptz; v_sede text; v_dia date;
BEGIN
  IF NOT public.has_permission('editar_todo') THEN RAISE EXCEPTION 'Sin permiso para editar tareas'; END IF;
  SELECT * INTO i FROM public.todo_instancia WHERE id = p_instancia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF NOT public.todo_puede_ver_instancia(i) THEN RAISE EXCEPTION 'Sin acceso a esta tarea'; END IF;
  v_titulo := COALESCE(NULLIF(btrim(COALESCE(p_titulo, '')), ''), i.titulo);
  v_desc := CASE WHEN p_descripcion IS NULL THEN i.descripcion ELSE NULLIF(btrim(p_descripcion), '') END;
  v_prio := COALESCE(p_prioridad, i.prioridad);
  IF v_prio NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Prioridad inválida'; END IF;
  v_venc := COALESCE(p_vencimiento_at, i.vencimiento_at);
  v_dia := (v_venc AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  IF public.todo_es_domingo(v_dia) THEN RAISE EXCEPTION 'No se registran tareas en domingo (el comercio está cerrado)'; END IF;
  v_sede := CASE WHEN p_sede IS NULL THEN i.sede WHEN btrim(p_sede) = '' THEN NULL ELSE btrim(p_sede) END;
  UPDATE public.todo_instancia
  SET titulo = v_titulo, descripcion = v_desc, prioridad = v_prio, vencimiento_at = v_venc, sede = v_sede, updated_at = now()
  WHERE id = p_instancia_id;
  IF COALESCE(p_actualizar_plantilla, false) AND i.tarea_id IS NOT NULL THEN
    UPDATE public.todo_tarea
    SET titulo = v_titulo, descripcion = v_desc, prioridad = v_prio, updated_at = now()
    WHERE id = i.tarea_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_eliminar_instancia(p_instancia_id uuid, p_eliminar_plantilla boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  i public.todo_instancia%ROWTYPE;
  tid uuid;
  v_rec text;
BEGIN
  IF NOT public.has_permission('eliminar_todo') THEN
    RAISE EXCEPTION 'Sin permiso para eliminar tareas';
  END IF;
  SELECT * INTO i FROM public.todo_instancia WHERE id = p_instancia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF NOT public.todo_puede_ver_instancia(i) THEN RAISE EXCEPTION 'Sin acceso a esta tarea'; END IF;
  tid := i.tarea_id;
  IF COALESCE(p_eliminar_plantilla, false) AND tid IS NOT NULL THEN
    UPDATE public.todo_tarea SET activa = false, updated_at = now() WHERE id = tid;
    DELETE FROM public.todo_instancia
    WHERE tarea_id = tid AND estado IN ('pendiente', 'en_curso');
    DELETE FROM public.todo_instancia WHERE id = p_instancia_id;
    RETURN;
  END IF;
  UPDATE public.todo_instancia
  SET estado = 'cancelada', updated_at = now()
  WHERE id = p_instancia_id;
  IF tid IS NOT NULL THEN
    SELECT recurrencia INTO v_rec FROM public.todo_tarea WHERE id = tid;
    IF COALESCE(v_rec, 'ninguna') = 'ninguna' THEN
      UPDATE public.todo_tarea SET activa = false, updated_at = now() WHERE id = tid;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_list_usuarios()
RETURNS TABLE(user_id uuid, email text, nombre_usuario text, label text, role text, role_label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.has_permission('crear_todo')
    OR public.has_permission('ver_configuracion')
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.nombre_usuario,
    public.user_profile_label(p.nombre_usuario, p.email),
    COALESCE(u.role, 'visor'),
    COALESCE(r.label, COALESCE(u.role, 'visor'))
  FROM public.user_profiles p
  LEFT JOIN public.app_user_profile u ON u.user_id = p.id
  LEFT JOIN public.app_role r ON r.role = u.role
  ORDER BY public.user_profile_label(p.nombre_usuario, p.email), p.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_list_roles()
RETURNS TABLE(role text, label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.has_permission('crear_todo')
    OR public.has_permission('ver_configuracion')
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT r.role, r.label FROM public.app_role r
  ORDER BY (
    CASE r.role
      WHEN 'admin' THEN 1
      WHEN 'encargado' THEN 2
      WHEN 'visor' THEN 3
      ELSE 6
    END
  ), r.label;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_list_inbox(
  p_estado text DEFAULT NULL,
  p_prioridad smallint DEFAULT NULL,
  p_ventana text DEFAULT 'todas',
  p_sede text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, tarea_id uuid, titulo text, descripcion text, prioridad smallint,
  responsable_tipo text, responsable_user_id uuid, responsable_role text,
  responsable_label text, responsable_email text, vencimiento_at timestamptz,
  estado text, estado_efectivo text, recurrencia text, sede text, completada_at timestamptz,
  estado_modificado_por uuid, estado_modificado_label text, estado_modificado_email text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  my_role text;
  can_all boolean;
  hoy date;
  desde timestamptz;
  hasta timestamptz;
  my_suc text[];
BEGIN
  IF NOT public.has_permission('ver_todo') THEN
    RETURN;
  END IF;
  my_role := public.get_my_role();
  can_all := public.has_permission('crear_todo');
  hoy := public.fecha_hoy_argentina();
  my_suc := NULL;
  IF p_ventana = 'hoy' THEN
    desde := public.todo_ts_argentina(hoy, time '00:00');
    hasta := public.todo_ts_argentina(hoy, time '23:59:59');
  ELSIF p_ventana = 'semana' THEN
    desde := public.todo_ts_argentina(hoy, time '00:00');
    hasta := public.todo_ts_argentina(hoy + 7, time '23:59:59');
  ELSIF p_ventana = 'vencidas' THEN
    desde := NULL;
    hasta := now();
  ELSE
    desde := NULL;
    hasta := NULL;
  END IF;
  RETURN QUERY
  SELECT
    i.id, i.tarea_id, i.titulo, i.descripcion, i.prioridad,
    i.responsable_tipo, i.responsable_user_id, i.responsable_role,
    CASE
      WHEN i.responsable_tipo = 'rol' THEN COALESCE(ar.label, i.responsable_role)
      ELSE COALESCE(public.user_profile_label(up.nombre_usuario, up.email), i.responsable_user_id::text)
    END AS responsable_label,
    CASE WHEN i.responsable_tipo = 'usuario' THEN NULLIF(btrim(up.email), '') ELSE NULL END AS responsable_email,
    i.vencimiento_at, i.estado,
    CASE WHEN i.estado = 'pendiente' AND i.vencimiento_at < now() THEN 'vencida' ELSE i.estado END AS estado_efectivo,
    COALESCE(t.recurrencia, 'ninguna') AS recurrencia,
    i.sede, i.completada_at, i.estado_modificado_por,
    COALESCE(public.user_profile_label(up_mod.nombre_usuario, up_mod.email), i.estado_modificado_por::text) AS estado_modificado_label,
    NULLIF(btrim(up_mod.email), '') AS estado_modificado_email,
    i.created_at
  FROM public.todo_instancia i
  LEFT JOIN public.todo_tarea t ON t.id = i.tarea_id
  LEFT JOIN public.app_role ar ON ar.role = i.responsable_role
  LEFT JOIN public.user_profiles up ON up.id = i.responsable_user_id
  LEFT JOIN public.user_profiles up_mod ON up_mod.id = i.estado_modificado_por
  WHERE
    (
      can_all
      OR (i.responsable_tipo = 'usuario' AND i.responsable_user_id = auth.uid())
      OR (i.responsable_tipo = 'rol' AND i.responsable_role = my_role)
    )
    AND (
      my_suc IS NULL OR coalesce(array_length(my_suc, 1), 0) = 0
      OR i.sede IS NULL
      OR i.sede = ANY (my_suc)
    )
    AND (p_prioridad IS NULL OR i.prioridad = p_prioridad)
    AND (p_sede IS NULL OR btrim(p_sede) = '' OR i.sede = btrim(p_sede))
    AND (
      (p_estado IS NULL AND i.estado <> 'cancelada')
      OR (p_estado = 'abiertas' AND i.estado IN ('pendiente', 'en_curso'))
      OR (p_estado = 'vencida' AND i.estado = 'pendiente' AND i.vencimiento_at < now())
      OR (p_estado IS NOT NULL AND p_estado NOT IN ('vencida', 'abiertas') AND i.estado = p_estado)
    )
    AND (
      p_ventana IS NULL OR p_ventana = 'todas'
      OR (p_ventana = 'hoy' AND i.vencimiento_at >= desde AND i.vencimiento_at <= hasta)
      OR (p_ventana = 'semana' AND i.vencimiento_at >= desde AND i.vencimiento_at <= hasta)
      OR (p_ventana = 'vencidas' AND i.estado = 'pendiente' AND i.vencimiento_at < now())
    )
  ORDER BY
    CASE
      WHEN i.estado = 'pendiente' AND i.vencimiento_at < now() THEN 0
      WHEN i.estado = 'en_curso' THEN 1
      WHEN i.estado = 'pendiente' THEN 2
      WHEN i.estado = 'hecha' THEN 3
      ELSE 4
    END,
    i.vencimiento_at ASC NULLS LAST,
    i.prioridad ASC,
    i.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_list_hechas_hoy(
  p_prioridad smallint DEFAULT NULL,
  p_sede text DEFAULT NULL
)
RETURNS TABLE(id uuid, titulo text, descripcion text, responsable_label text, completada_at timestamptz, sede text, prioridad smallint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  my_role text;
  can_all boolean;
  hoy date;
  my_suc text[];
BEGIN
  IF NOT public.has_permission('ver_todo') THEN
    RETURN;
  END IF;
  my_role := public.get_my_role();
  can_all := public.has_permission('crear_todo');
  hoy := public.fecha_hoy_argentina();
  my_suc := NULL;
  RETURN QUERY
  SELECT
    i.id, i.titulo, i.descripcion,
    CASE
      WHEN i.responsable_tipo = 'rol' THEN COALESCE(ar.label, i.responsable_role)
      ELSE COALESCE(public.user_profile_label(up.nombre_usuario, up.email), i.responsable_user_id::text)
    END AS responsable_label,
    i.completada_at, i.sede, i.prioridad
  FROM public.todo_instancia i
  LEFT JOIN public.app_role ar ON ar.role = i.responsable_role
  LEFT JOIN public.user_profiles up ON up.id = i.responsable_user_id
  WHERE
    i.estado = 'hecha'
    AND i.completada_at IS NOT NULL
    AND (i.completada_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = hoy
    AND (
      can_all
      OR (i.responsable_tipo = 'usuario' AND i.responsable_user_id = auth.uid())
      OR (i.responsable_tipo = 'rol' AND i.responsable_role = my_role)
    )
    AND (
      my_suc IS NULL OR coalesce(array_length(my_suc, 1), 0) = 0
      OR i.sede IS NULL
      OR i.sede = ANY (my_suc)
    )
    AND (p_prioridad IS NULL OR i.prioridad = p_prioridad)
    AND (p_sede IS NULL OR btrim(p_sede) = '' OR i.sede = btrim(p_sede));
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_resumen_bandeja()
RETURNS TABLE(pendientes bigint, en_curso bigint, vencidas bigint, hechas_hoy bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  my_role text;
  can_all boolean;
  hoy date;
  desde timestamptz;
  hasta timestamptz;
  my_suc text[];
BEGIN
  IF NOT public.has_permission('ver_todo') THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;
  my_role := public.get_my_role();
  can_all := public.has_permission('crear_todo');
  hoy := public.fecha_hoy_argentina();
  desde := public.todo_ts_argentina(hoy, time '00:00');
  hasta := public.todo_ts_argentina(hoy, time '23:59:59');
  my_suc := NULL;
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE i.estado = 'pendiente' AND i.vencimiento_at >= now())::bigint,
    COUNT(*) FILTER (WHERE i.estado = 'en_curso' AND i.vencimiento_at >= now())::bigint,
    COUNT(*) FILTER (WHERE i.estado IN ('pendiente', 'en_curso') AND i.vencimiento_at < now())::bigint,
    COUNT(*) FILTER (WHERE i.estado = 'hecha' AND i.completada_at >= desde AND i.completada_at <= hasta)::bigint
  FROM public.todo_instancia i
  WHERE
    (
      can_all
      OR (i.responsable_tipo = 'usuario' AND i.responsable_user_id = auth.uid())
      OR (i.responsable_tipo = 'rol' AND i.responsable_role = my_role)
    )
    AND (
      my_suc IS NULL OR coalesce(array_length(my_suc, 1), 0) = 0
      OR i.sede IS NULL
      OR i.sede = ANY (my_suc)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_list_para_reasignar(
  p_tipo text,
  p_from_user_id uuid DEFAULT NULL,
  p_from_role text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, tarea_id uuid, titulo text, descripcion text, prioridad smallint,
  vencimiento_at timestamptz, estado text, estado_efectivo text, recurrencia text, sede text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_permission('ver_configuracion') THEN
    RAISE EXCEPTION 'Sin permiso para Configuración';
  END IF;
  IF p_tipo NOT IN ('usuario', 'rol') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF p_tipo = 'usuario' AND p_from_user_id IS NULL THEN RAISE EXCEPTION 'Indicá el usuario de origen'; END IF;
  IF p_tipo = 'rol' AND (p_from_role IS NULL OR btrim(p_from_role) = '') THEN RAISE EXCEPTION 'Indicá el perfil de origen'; END IF;
  RETURN QUERY
  SELECT
    i.id, i.tarea_id, i.titulo, i.descripcion, i.prioridad, i.vencimiento_at, i.estado,
    CASE
      WHEN i.estado IN ('pendiente', 'en_curso') AND i.vencimiento_at < now() THEN 'vencida'
      ELSE i.estado
    END AS estado_efectivo,
    COALESCE(t.recurrencia, 'ninguna') AS recurrencia,
    i.sede
  FROM public.todo_instancia i
  LEFT JOIN public.todo_tarea t ON t.id = i.tarea_id
  WHERE i.estado IN ('pendiente', 'en_curso')
    AND (
      (p_tipo = 'usuario' AND i.responsable_tipo = 'usuario' AND i.responsable_user_id = p_from_user_id)
      OR (p_tipo = 'rol' AND i.responsable_tipo = 'rol' AND i.responsable_role = btrim(p_from_role))
    )
  ORDER BY i.vencimiento_at ASC NULLS LAST, i.prioridad ASC, i.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.todo_reasignar(
  p_tipo text,
  p_from_user_id uuid DEFAULT NULL,
  p_to_user_id uuid DEFAULT NULL,
  p_from_role text DEFAULT NULL,
  p_to_role text DEFAULT NULL,
  p_instancia_ids uuid[] DEFAULT NULL,
  p_todas boolean DEFAULT false
)
RETURNS TABLE(instancias integer, plantillas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
  v_n_inst int := 0;
  v_n_plant int := 0;
  v_from_role text;
  v_to_role text;
BEGIN
  IF NOT public.has_permission('ver_configuracion') THEN
    RAISE EXCEPTION 'Sin permiso para Configuración';
  END IF;
  IF p_tipo NOT IN ('usuario', 'rol') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF p_tipo = 'usuario' THEN
    IF p_from_user_id IS NULL OR p_to_user_id IS NULL THEN RAISE EXCEPTION 'Indicá usuario de origen y destino'; END IF;
    IF p_from_user_id = p_to_user_id THEN RAISE EXCEPTION 'El destino debe ser distinto al origen'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_from_user_id) THEN RAISE EXCEPTION 'Usuario de origen no encontrado'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_to_user_id) THEN RAISE EXCEPTION 'Usuario de destino no encontrado'; END IF;
  ELSE
    v_from_role := NULLIF(btrim(COALESCE(p_from_role, '')), '');
    v_to_role := NULLIF(btrim(COALESCE(p_to_role, '')), '');
    IF v_from_role IS NULL OR v_to_role IS NULL THEN RAISE EXCEPTION 'Indicá perfil de origen y destino'; END IF;
    IF v_from_role = v_to_role THEN RAISE EXCEPTION 'El destino debe ser distinto al origen'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.app_role WHERE role = v_from_role) THEN RAISE EXCEPTION 'Perfil de origen no encontrado'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.app_role WHERE role = v_to_role) THEN RAISE EXCEPTION 'Perfil de destino no encontrado'; END IF;
  END IF;
  IF COALESCE(p_todas, false) THEN
    SELECT COALESCE(array_agg(i.id), ARRAY[]::uuid[]) INTO v_ids
    FROM public.todo_instancia i
    WHERE i.estado IN ('pendiente', 'en_curso')
      AND (
        (p_tipo = 'usuario' AND i.responsable_tipo = 'usuario' AND i.responsable_user_id = p_from_user_id)
        OR (p_tipo = 'rol' AND i.responsable_tipo = 'rol' AND i.responsable_role = v_from_role)
      );
  ELSE
    v_ids := COALESCE(p_instancia_ids, ARRAY[]::uuid[]);
  END IF;
  IF v_ids IS NULL OR coalesce(array_length(v_ids, 1), 0) = 0 THEN
    IF COALESCE(p_todas, false) THEN
      v_ids := ARRAY[]::uuid[];
    ELSE
      RAISE EXCEPTION 'No hay tareas para reasignar';
    END IF;
  END IF;
  IF coalesce(array_length(v_ids, 1), 0) > 0 THEN
    IF p_tipo = 'usuario' THEN
      UPDATE public.todo_instancia i
      SET responsable_tipo = 'usuario', responsable_user_id = p_to_user_id, responsable_role = NULL, updated_at = now()
      WHERE i.id = ANY (v_ids)
        AND i.estado IN ('pendiente', 'en_curso')
        AND i.responsable_tipo = 'usuario'
        AND i.responsable_user_id = p_from_user_id;
    ELSE
      UPDATE public.todo_instancia i
      SET responsable_tipo = 'rol', responsable_user_id = NULL, responsable_role = v_to_role, updated_at = now()
      WHERE i.id = ANY (v_ids)
        AND i.estado IN ('pendiente', 'en_curso')
        AND i.responsable_tipo = 'rol'
        AND i.responsable_role = v_from_role;
    END IF;
    GET DIAGNOSTICS v_n_inst = ROW_COUNT;
  END IF;
  IF COALESCE(p_todas, false) THEN
    IF p_tipo = 'usuario' THEN
      UPDATE public.todo_tarea t
      SET responsable_tipo = 'usuario', responsable_user_id = p_to_user_id, responsable_role = NULL, updated_at = now()
      WHERE t.responsable_tipo = 'usuario' AND t.responsable_user_id = p_from_user_id AND t.activa;
    ELSE
      UPDATE public.todo_tarea t
      SET responsable_tipo = 'rol', responsable_user_id = NULL, responsable_role = v_to_role, updated_at = now()
      WHERE t.responsable_tipo = 'rol' AND t.responsable_role = v_from_role AND t.activa;
    END IF;
    GET DIAGNOSTICS v_n_plant = ROW_COUNT;
  ELSIF coalesce(array_length(v_ids, 1), 0) > 0 THEN
    IF p_tipo = 'usuario' THEN
      UPDATE public.todo_tarea t
      SET responsable_tipo = 'usuario', responsable_user_id = p_to_user_id, responsable_role = NULL, updated_at = now()
      WHERE t.activa AND t.responsable_tipo = 'usuario' AND t.responsable_user_id = p_from_user_id
        AND t.id IN (SELECT DISTINCT i.tarea_id FROM public.todo_instancia i WHERE i.id = ANY (v_ids) AND i.tarea_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM public.todo_instancia x
          WHERE x.tarea_id = t.id AND x.estado IN ('pendiente', 'en_curso')
            AND x.responsable_tipo = 'usuario' AND x.responsable_user_id = p_from_user_id
        );
    ELSE
      UPDATE public.todo_tarea t
      SET responsable_tipo = 'rol', responsable_user_id = NULL, responsable_role = v_to_role, updated_at = now()
      WHERE t.activa AND t.responsable_tipo = 'rol' AND t.responsable_role = v_from_role
        AND t.id IN (SELECT DISTINCT i.tarea_id FROM public.todo_instancia i WHERE i.id = ANY (v_ids) AND i.tarea_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM public.todo_instancia x
          WHERE x.tarea_id = t.id AND x.estado IN ('pendiente', 'en_curso')
            AND x.responsable_tipo = 'rol' AND x.responsable_role = v_from_role
        );
    END IF;
    GET DIAGNOSTICS v_n_plant = ROW_COUNT;
  END IF;
  instancias := v_n_inst;
  plantillas := v_n_plant;
  RETURN NEXT;
END;
$$;

ALTER TABLE public.todo_tarea ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_instancia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS todo_tarea_select ON public.todo_tarea;
CREATE POLICY todo_tarea_select ON public.todo_tarea
  FOR SELECT TO authenticated
  USING (
    public.has_permission('ver_todo')
    AND (
      public.has_permission('crear_todo')
      OR (responsable_tipo = 'usuario' AND responsable_user_id = auth.uid())
      OR (responsable_tipo = 'rol' AND responsable_role = public.get_my_role())
      OR creado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS todo_tarea_insert ON public.todo_tarea;
CREATE POLICY todo_tarea_insert ON public.todo_tarea
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_todo') AND creado_por = auth.uid());

DROP POLICY IF EXISTS todo_tarea_update ON public.todo_tarea;
CREATE POLICY todo_tarea_update ON public.todo_tarea
  FOR UPDATE TO authenticated
  USING (public.has_permission('crear_todo') OR public.has_permission('editar_todo') OR public.has_permission('eliminar_todo'))
  WITH CHECK (public.has_permission('crear_todo') OR public.has_permission('editar_todo') OR public.has_permission('eliminar_todo'));

DROP POLICY IF EXISTS todo_tarea_delete ON public.todo_tarea;
CREATE POLICY todo_tarea_delete ON public.todo_tarea
  FOR DELETE TO authenticated
  USING (public.has_permission('eliminar_todo') OR public.has_permission('crear_todo'));

DROP POLICY IF EXISTS todo_instancia_select ON public.todo_instancia;
CREATE POLICY todo_instancia_select ON public.todo_instancia
  FOR SELECT TO authenticated
  USING (public.todo_puede_ver_instancia(todo_instancia));

DROP POLICY IF EXISTS todo_instancia_insert ON public.todo_instancia;
CREATE POLICY todo_instancia_insert ON public.todo_instancia
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('crear_todo'));

DROP POLICY IF EXISTS todo_instancia_update ON public.todo_instancia;
CREATE POLICY todo_instancia_update ON public.todo_instancia
  FOR UPDATE TO authenticated
  USING (
    public.todo_puede_operar_instancia(todo_instancia)
    OR public.has_permission('editar_todo')
    OR public.has_permission('eliminar_todo')
  )
  WITH CHECK (
    public.todo_puede_operar_instancia(todo_instancia)
    OR public.has_permission('editar_todo')
    OR public.has_permission('eliminar_todo')
  );

DROP POLICY IF EXISTS todo_instancia_delete ON public.todo_instancia;
CREATE POLICY todo_instancia_delete ON public.todo_instancia
  FOR DELETE TO authenticated
  USING (public.has_permission('eliminar_todo') OR public.has_permission('crear_todo'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.todo_tarea TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todo_instancia TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'todo%' OR p.proname = 'get_sucursales_list')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
