-- To-Do: no crear tareas en sábado ni domingo (día calendario Argentina).
-- La diaria incluía el sábado a propósito. La mensual dejaba el día aunque fuera sábado.
-- El domingo ya se salteaba. Se borran las ocurrencias de fin de semana y la mensual que caía ahí pasa al lunes.

CREATE OR REPLACE FUNCTION public.todo_es_fin_de_semana(p_fecha date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_fecha IS NOT NULL AND EXTRACT(ISODOW FROM p_fecha)::int IN (6, 7);
$$;

CREATE OR REPLACE FUNCTION public.todo_pasar_a_habil(p_fecha date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE EXTRACT(ISODOW FROM p_fecha)::int
    WHEN 6 THEN p_fecha + 2
    WHEN 7 THEN p_fecha + 1
    ELSE p_fecha
  END;
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
    IF NOT public.todo_es_fin_de_semana(d) THEN RETURN NEXT d; END IF;
    RETURN;
  END IF;
  last_day := LEAST(COALESCE(p_fecha_fin, p_hasta), p_hasta);
  IF last_day IS NULL OR d > last_day THEN RETURN; END IF;
  IF p_recurrencia = 'diaria' THEN
    WHILE d <= last_day LOOP
      IF NOT public.todo_es_fin_de_semana(d) THEN RETURN NEXT d; END IF;
      d := d + 1;
    END LOOP;
    RETURN;
  END IF;
  IF p_recurrencia = 'semanal' THEN
    IF p_dia_semana IS NOT NULL AND p_dia_semana IN (6, 7) THEN RETURN; END IF;
    IF p_dia_semana IS NOT NULL AND EXTRACT(ISODOW FROM d)::int <> p_dia_semana THEN
      WHILE EXTRACT(ISODOW FROM d)::int <> p_dia_semana LOOP
        d := d + 1; IF d > last_day THEN RETURN; END IF;
      END LOOP;
    END IF;
    IF public.todo_es_fin_de_semana(d) THEN RETURN; END IF;
    WHILE d <= last_day LOOP
      IF NOT public.todo_es_fin_de_semana(d) THEN RETURN NEXT d; END IF;
      d := d + 7;
    END LOOP;
    RETURN;
  END IF;
  IF p_recurrencia IN ('mensual', 'bimestral', 'trimestral', 'anual') THEN
    step_months := CASE p_recurrencia WHEN 'bimestral' THEN 2 WHEN 'trimestral' THEN 3 WHEN 'anual' THEN 12 ELSE 1 END;
    usar_dia_mes := p_dia_mes IS NOT NULL AND EXTRACT(DAY FROM ancla)::int <> p_dia_mes::int;
    IF NOT usar_dia_mes THEN
      WHILE d <= last_day LOOP
        emit := public.todo_pasar_a_habil(d);
        IF emit <= last_day THEN RETURN NEXT emit; END IF;
        d := (d + pg_catalog.make_interval(months => step_months))::date;
      END LOOP;
      RETURN;
    END IF;
    d := date_trunc('month', ancla)::date;
    WHILE d <= last_day LOOP
      candidate := pg_catalog.make_date(EXTRACT(YEAR FROM d)::int, EXTRACT(MONTH FROM d)::int,
        LEAST(p_dia_mes::int, EXTRACT(DAY FROM (date_trunc('month', d) + interval '1 month' - interval '1 day'))::int));
      emit := public.todo_pasar_a_habil(candidate);
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
    IF public.todo_es_fin_de_semana(d) THEN
      CONTINUE;
    END IF;
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
  IF public.todo_es_fin_de_semana(v_inicio) THEN RAISE EXCEPTION 'No se registran tareas en sábado ni domingo (el comercio está cerrado)'; END IF;
  IF p_vencimiento_at IS NOT NULL AND public.todo_es_fin_de_semana((p_vencimiento_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) THEN
    RAISE EXCEPTION 'No se registran tareas en sábado ni domingo (el comercio está cerrado)';
  END IF;
  v_dow := EXTRACT(ISODOW FROM v_inicio)::smallint;
  v_dom := EXTRACT(DAY FROM v_inicio)::smallint;
  IF v_todas THEN v_sede := NULL; END IF;
  IF v_rec = 'semanal' AND COALESCE(p_dia_semana, v_dow) IN (6, 7) THEN
    RAISE EXCEPTION 'No se registran tareas en sábado ni domingo (el comercio está cerrado)';
  END IF;
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
  IF public.todo_es_fin_de_semana(v_dia) THEN RAISE EXCEPTION 'No se registran tareas en sábado ni domingo (el comercio está cerrado)'; END IF;
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

UPDATE public.todo_tarea
SET activa = false, updated_at = now()
WHERE activa
  AND (
    (recurrencia = 'semanal' AND dia_semana IN (6, 7))
    OR (recurrencia = 'ninguna' AND public.todo_es_fin_de_semana(fecha_inicio))
  );

DELETE FROM public.todo_instancia
WHERE EXTRACT(ISODOW FROM (vencimiento_at AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int IN (6, 7);

DO $$
DECLARE
  tid uuid;
BEGIN
  FOR tid IN SELECT id FROM public.todo_tarea WHERE activa LOOP
    PERFORM public.todo_generar_instancias_tarea_interno(tid, NULL);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.todo_es_fin_de_semana(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.todo_pasar_a_habil(date) TO authenticated;
