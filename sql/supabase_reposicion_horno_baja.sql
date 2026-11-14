-- Productos sacados de la lista de Reposición hornos.
-- El permiso queda apagado: se prende en Seguridad.
-- El precio de venta no se edita: lo trae el archivo de ventas.

CREATE TABLE IF NOT EXISTS public.reposicion_horno_baja (
  articulo text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.reposicion_horno_baja IS
  'Artículo sacado de la lista de Reposición hornos. Si no está acá, sigue en la lista.';

ALTER TABLE public.reposicion_horno_baja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reposicion_horno_baja_select ON public.reposicion_horno_baja;
CREATE POLICY reposicion_horno_baja_select
  ON public.reposicion_horno_baja FOR SELECT
  USING (true);

DROP POLICY IF EXISTS reposicion_horno_baja_write ON public.reposicion_horno_baja;
CREATE POLICY reposicion_horno_baja_write
  ON public.reposicion_horno_baja FOR ALL TO authenticated
  USING (public.has_permission('desactivar_producto_reposicion_hornos'))
  WITH CHECK (public.has_permission('desactivar_producto_reposicion_hornos'));

CREATE OR REPLACE FUNCTION public.reposicion_horno_baja_set_updated()
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

DROP TRIGGER IF EXISTS trg_reposicion_horno_baja_updated ON public.reposicion_horno_baja;
CREATE TRIGGER trg_reposicion_horno_baja_updated
  BEFORE INSERT OR UPDATE ON public.reposicion_horno_baja
  FOR EACH ROW EXECUTE FUNCTION public.reposicion_horno_baja_set_updated();

INSERT INTO public.app_permission (permission, description) VALUES
  ('desactivar_producto_reposicion_hornos', 'Sacar un producto de la lista de Reposición hornos')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

GRANT SELECT ON public.reposicion_horno_baja TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reposicion_horno_baja TO authenticated;
