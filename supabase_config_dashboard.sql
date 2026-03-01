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
  pct_caucion int NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.config_dashboard IS 'Preferencias de proyección y caución por usuario (uno por usuario).';
COMMENT ON COLUMN public.config_dashboard.proyeccion_metodo IS 'promedio_ponderado | promedio | mediana';
COMMENT ON COLUMN public.config_dashboard.proyeccion_meses IS 'Meses de historia para calcular valor típico: 3, 6, 12, 24';
COMMENT ON COLUMN public.config_dashboard.proyeccion_cantidad IS 'Meses futuros a proyectar: 1 a 12';
COMMENT ON COLUMN public.config_dashboard.pct_caucion IS 'Porcentaje G/P acum. en caución (0-100)';

ALTER TABLE public.config_dashboard ENABLE ROW LEVEL SECURITY;

-- Solo el propio usuario puede leer y escribir su fila
CREATE POLICY "Usuario ve y edita su config"
  ON public.config_dashboard
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
