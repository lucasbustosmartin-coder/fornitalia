-- Cajas FCI Galicia (ARS) y FCI Galicia (USD) en Conciliación bancaria.
-- La tesorería vive en el canal fci_*. El extracto contra el que se sugiere
-- es el de Galicia de la misma moneda (galicia / galicia_usd).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN (
        'public.cb_movimiento'::regclass,
        'public.cb_match'::regclass,
        'public.cb_dup_descartado'::regclass,
        'public.cb_movimiento_eliminado'::regclass
      )
      AND pg_get_constraintdef(c.oid) ILIKE '%credicoop%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.cb_movimiento
  ADD CONSTRAINT cb_movimiento_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop', 'fci_galicia', 'fci_galicia_usd'));

ALTER TABLE public.cb_match
  ADD CONSTRAINT cb_match_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop', 'fci_galicia', 'fci_galicia_usd'));

ALTER TABLE public.cb_dup_descartado
  ADD CONSTRAINT cb_dup_descartado_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop', 'fci_galicia', 'fci_galicia_usd'));

ALTER TABLE public.cb_movimiento_eliminado
  ADD CONSTRAINT cb_movimiento_eliminado_canal_check
  CHECK (canal IN ('mercadopago', 'galicia', 'galicia_usd', 'credicoop', 'fci_galicia', 'fci_galicia_usd'));

DO $$
DECLARE
  r record;
  src text;
  viejo text := '''mercadopago'', ''galicia'', ''galicia_usd'', ''credicoop''';
  nuevo text := '''mercadopago'', ''galicia'', ''galicia_usd'', ''credicoop'', ''fci_galicia'', ''fci_galicia_usd''';
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname LIKE 'cb_%'
      AND p.prosrc LIKE '%' || viejo || '%'
      AND p.prosrc NOT LIKE '%fci_galicia%'
  LOOP
    src := pg_get_functiondef(r.oid);
    src := replace(src, viejo, nuevo);
    EXECUTE src;
  END LOOP;
END $$;

DO $$
DECLARE
  src text;
  viejo text := 'WHERE id = ANY(v_bancos) AND canal = p_canal AND origen = ''banco''';
  nuevo text := 'WHERE id = ANY(v_bancos) AND origen = ''banco'' AND (canal = p_canal OR (p_canal = ''fci_galicia'' AND canal = ''galicia'') OR (p_canal = ''fci_galicia_usd'' AND canal = ''galicia_usd''))';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'cb_confirmar_manual_grupo'
    AND pg_get_function_identity_arguments(p.oid) = 'p_canal text, p_banco_ids uuid[], p_sistema_ids uuid[], p_justificacion text';
  IF src IS NULL THEN
    RAISE EXCEPTION 'No encontré cb_confirmar_manual_grupo';
  END IF;
  IF position(viejo in src) = 0 THEN
    IF position('fci_galicia' in src) = 0 THEN
      RAISE EXCEPTION 'cb_confirmar_manual_grupo no tiene el filtro de canal del extracto';
    END IF;
  ELSE
    src := replace(src, viejo, nuevo);
    EXECUTE src;
  END IF;
END $$;
