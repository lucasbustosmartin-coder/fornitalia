-- Costo unitario USD de Reposición hornos.
-- El dólar oficial se lee de la cotización (no se guarda acá).
-- El permiso queda apagado en todos los perfiles: se prende en Seguridad.

CREATE TABLE IF NOT EXISTS public.reposicion_horno_costo (
  articulo text PRIMARY KEY,
  costo_usd numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.reposicion_horno_costo IS
  'Costo unitario en dólares editado en Reposición hornos. Si el artículo no está, se usa el de la foto del 13/11/2026.';

ALTER TABLE public.reposicion_horno_costo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reposicion_horno_costo_select ON public.reposicion_horno_costo;
CREATE POLICY reposicion_horno_costo_select
  ON public.reposicion_horno_costo FOR SELECT
  USING (true);

DROP POLICY IF EXISTS reposicion_horno_costo_write ON public.reposicion_horno_costo;
CREATE POLICY reposicion_horno_costo_write
  ON public.reposicion_horno_costo FOR ALL TO authenticated
  USING (public.has_permission('editar_costo_reposicion_hornos'))
  WITH CHECK (public.has_permission('editar_costo_reposicion_hornos'));

CREATE OR REPLACE FUNCTION public.reposicion_horno_costo_set_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.articulo = btrim(NEW.articulo);
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reposicion_horno_costo_updated ON public.reposicion_horno_costo;
CREATE TRIGGER trg_reposicion_horno_costo_updated
  BEFORE INSERT OR UPDATE ON public.reposicion_horno_costo
  FOR EACH ROW EXECUTE FUNCTION public.reposicion_horno_costo_set_updated();

INSERT INTO public.app_permission (permission, description) VALUES
  ('editar_costo_reposicion_hornos', 'Editar costo unitario en dólares de Reposición hornos')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

GRANT SELECT ON public.reposicion_horno_costo TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reposicion_horno_costo TO authenticated;
