# Fechas: convención Argentina (LyP)

En este proyecto las **fechas de negocio** (día contable, filtros, agrupación por mes/día, persistencia en SQL) deben alinearse al calendario **`America/Argentina/Buenos_Aires`**.

## App (`dashboard-flujo-caja.html` / JS embebido)

- Usar `Intl.DateTimeFormat` o equivalente con `timeZone: 'America/Argentina/Buenos_Aires'` para YYYY-MM-DD o partes de calendario.
- **Evitar** depender solo de `getDate()`/`getMonth()`/`getFullYear()` sin zona explícita, o `toISOString().slice(0, 10)` como “día” de un instante (eso es UTC).
- **Excel:** serial del día `YYYY-MM-DD` (epoch Excel 1899-12-30) + formato `dd/mm/yyyy`. No escribir `Date` en UTC: en `America/Argentina/Buenos_Aires` (UTC−3) Excel muestra el día anterior.
- **PDF / HTML:** `dd/mm/aaaa` armado con año/mes/día del string de negocio, no con un `Date` UTC.

## SQL / Supabase

- **Evitar** `CURRENT_DATE` como único default de **día contable** si la sesión no está alineada al negocio.
- Patrón canónico: `public.fecha_hoy_argentina()` en `sql/helpers_fecha_argentina.sql`. Derivar día desde `timestamptz`: `(campo AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`.
- **Gestión de Proyectos** (`gp_proyecto`, `gp_entregable`, `gp_tarea`, `gp_tarea_hora`, `gp_entregable_hora`, `gp_proyecto_hora`): `fecha_inicio` / `fecha_fin` y `*.fecha` de horas consumidas con `DEFAULT public.fecha_hoy_argentina()`.
- **Conciliación Bancaria** (`cb_movimiento.fecha`): día de negocio Argentina. El extracto de Mercado Pago trae timestamp UTC (`Fecha de Pago`); se convierte a calendario `America/Argentina/Buenos_Aires`. Tesorería usa la fecha del Excel (dd/mm/aaaa o serial de día).
- **Saldos extractos** (`eb_saldo_extracto.fecha_desde` / `fecha_hasta`): período del resumen de cuenta (Galicia PDF) en calendario Argentina. Defaults `public.fecha_hoy_argentina()`. El gráfico y los filtros agrupan por mes de `fecha_hasta`.

## Regla Cursor (no omitir)

- `.cursor/rules/fechas-argentina-negocio.mdc` (`alwaysApply: true`).
