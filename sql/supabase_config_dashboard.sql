-- Configuración del dashboard por usuario (Fornitalia)
-- Requiere Supabase Auth. Ejecutar en Supabase SQL Editor.
--
-- Para que la app guarde/cargue config sin pantalla de login:
-- En el proyecto Supabase: Authentication > Providers > Anonymous > Enable.
-- Así cada navegador obtiene un usuario anónimo y su config se persiste en esta tabla.
-- Si más adelante agregás login con email, la misma tabla sirve (mismo user_id).

CREATE TABLE IF NOT EXISTS public.config_dashboard (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  proyeccion_metodo text NOT NULL DEFAULT 'promedio_ponderado',
  proyeccion_meses int NOT NULL DEFAULT 6,
  proyeccion_cantidad int NOT NULL DEFAULT 3,
  proyeccion_recorte int NOT NULL DEFAULT 15,
  pct_caucion int NOT NULL DEFAULT 100,
  alerta_desvio_pct int NOT NULL DEFAULT 25,
  alerta_mes_sin_egresos boolean NOT NULL DEFAULT true,
  alerta_sin_sueldos boolean NOT NULL DEFAULT true,
  alerta_sin_comisiones boolean NOT NULL DEFAULT true,
  alerta_sin_alquileres boolean NOT NULL DEFAULT true,
  alerta_sin_impuestos boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.config_dashboard IS 'Preferencias de proyección y caución por usuario (uno por usuario).';
COMMENT ON COLUMN public.config_dashboard.proyeccion_metodo IS 'promedio_ponderado | promedio | mediana';
COMMENT ON COLUMN public.config_dashboard.proyeccion_meses IS 'Meses de historia para calcular valor típico: 3, 6, 12, 24';
COMMENT ON COLUMN public.config_dashboard.proyeccion_cantidad IS 'Meses futuros a proyectar: 1 a 12';
COMMENT ON COLUMN public.config_dashboard.proyeccion_recorte IS 'Recorte % por lado para promedio recortado: 0, 5, 10, 15, 20, 25';
COMMENT ON COLUMN public.config_dashboard.pct_caucion IS 'Porcentaje G/P acum. en caución (0-100)';
COMMENT ON COLUMN public.config_dashboard.alerta_desvio_pct IS 'Umbral % para alerta de desvío de categoría vs mes anterior (5, 10, 15, 20, 25, 30). Se activa con variación positiva o negativa.';
COMMENT ON COLUMN public.config_dashboard.alerta_mes_sin_egresos IS 'Si true, alerta cuando el mes no tiene egresos.';
COMMENT ON COLUMN public.config_dashboard.alerta_sin_sueldos IS 'Si true, alerta cuando no hay registros de Sueldos.';
COMMENT ON COLUMN public.config_dashboard.alerta_sin_comisiones IS 'Si true, alerta cuando no hay registros de Comisiones.';
COMMENT ON COLUMN public.config_dashboard.alerta_sin_alquileres IS 'Si true, alerta cuando no hay registros de Alquileres.';
COMMENT ON COLUMN public.config_dashboard.alerta_sin_impuestos IS 'Si true, alerta cuando no hay registros de Impuestos.';

ALTER TABLE public.config_dashboard ENABLE ROW LEVEL SECURITY;

-- Solo el propio usuario puede leer y escribir su fila
CREATE POLICY "Usuario ve y edita su config"
  ON public.config_dashboard
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Si la tabla ya existía sin proyeccion_recorte, ejecutar:
-- ALTER TABLE public.config_dashboard ADD COLUMN IF NOT EXISTS proyeccion_recorte int NOT NULL DEFAULT 15;
-- COMMENT ON COLUMN public.config_dashboard.proyeccion_recorte IS 'Recorte % por lado para promedio recortado: 0, 5, 10, 15, 20, 25';
-- Si la tabla ya existía sin alerta_desvio_pct, ejecutar:
-- ALTER TABLE public.config_dashboard ADD COLUMN IF NOT EXISTS alerta_desvio_pct int NOT NULL DEFAULT 25;
-- COMMENT ON COLUMN public.config_dashboard.alerta_desvio_pct IS 'Umbral % para alerta de desvío de categoría vs mes anterior (5-30). Variación en más o en menos.';
-- Si la tabla ya existía sin las columnas de alertas on/off, ejecutar:
-- ALTER TABLE public.config_dashboard ADD COLUMN IF NOT EXISTS alerta_mes_sin_egresos boolean NOT NULL DEFAULT true;
-- ALTER TABLE public.config_dashboard ADD COLUMN IF NOT EXISTS alerta_sin_sueldos boolean NOT NULL DEFAULT true;
-- ALTER TABLE public.config_dashboard ADD COLUMN IF NOT EXISTS alerta_sin_comisiones boolean NOT NULL DEFAULT true;
-- ALTER TABLE public.config_dashboard ADD COLUMN IF NOT EXISTS alerta_sin_alquileres boolean NOT NULL DEFAULT true;
-- ALTER TABLE public.config_dashboard ADD COLUMN IF NOT EXISTS alerta_sin_impuestos boolean NOT NULL DEFAULT true;