-- ABM de ef_estructura desde la app (solapa Matriz EF).
-- Lectura sigue abierta; alta/edición/baja solo con editar_matriz_ef.

DROP POLICY IF EXISTS "Permitir insercion ef_estructura" ON public.ef_estructura;
DROP POLICY IF EXISTS "Permitir eliminacion ef_estructura" ON public.ef_estructura;
DROP POLICY IF EXISTS ef_estructura_insert ON public.ef_estructura;
DROP POLICY IF EXISTS ef_estructura_update ON public.ef_estructura;
DROP POLICY IF EXISTS ef_estructura_delete ON public.ef_estructura;

CREATE POLICY ef_estructura_insert
  ON public.ef_estructura FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('editar_matriz_ef')
    OR public.has_permission('carga_normalizada')
  );

CREATE POLICY ef_estructura_update
  ON public.ef_estructura FOR UPDATE TO authenticated
  USING (
    public.has_permission('editar_matriz_ef')
    OR public.has_permission('carga_normalizada')
  )
  WITH CHECK (
    public.has_permission('editar_matriz_ef')
    OR public.has_permission('carga_normalizada')
  );

CREATE POLICY ef_estructura_delete
  ON public.ef_estructura FOR DELETE TO authenticated
  USING (
    public.has_permission('editar_matriz_ef')
    OR public.has_permission('carga_normalizada')
  );

GRANT SELECT ON public.ef_estructura TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ef_estructura TO authenticated;

COMMENT ON TABLE public.ef_estructura IS
  'Árbol del Estado Financiero (ítem/subítem). La app lo edita en Matriz EF; los montos salen de tesorería vía matriz_cat_cuenta_ef.';
