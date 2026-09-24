-- Saldos extractos: el mes en curso se arma con movimientos de Conciliación (cb_movimiento).
-- Quien puede ver Saldos extractos también puede leer esos movimientos (solo SELECT).

DROP POLICY IF EXISTS cb_movimiento_select ON public.cb_movimiento;
CREATE POLICY cb_movimiento_select ON public.cb_movimiento FOR SELECT TO authenticated
  USING (
    public.has_permission('ver_conciliacion_bancaria')
    OR public.has_permission('ver_saldos_extractos')
  );
