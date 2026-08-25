# Fechas: convención Argentina (LyP)

En este proyecto las **fechas de negocio** (día contable, filtros, agrupación por mes/día, persistencia en SQL) deben alinearse al calendario **`America/Argentina/Buenos_Aires`**.

## App (`dashboard-flujo-caja.html` / JS embebido)

- Usar `Intl.DateTimeFormat` o equivalente con `timeZone: 'America/Argentina/Buenos_Aires'` para YYYY-MM-DD o partes de calendario.
- **Evitar** depender solo de `getDate()`/`getMonth()`/`getFullYear()` sin zona explícita, o `toISOString().slice(0, 10)` como “día” de un instante (eso es UTC).

## SQL / Supabase

- **Evitar** `CURRENT_DATE` como único default de **día contable** si la sesión no está alineada al negocio.
- Patrón canónico: `public.fecha_hoy_argentina()` en `sql/helpers_fecha_argentina.sql`. Derivar día desde `timestamptz`: `(campo AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`.
- **Gestión de Proyectos** (`gp_proyecto`, `gp_entregable`, `gp_tarea`, `gp_tarea_hora`, `gp_entregable_hora`): `fecha_inicio` / `fecha_fin` y `*.fecha` de horas consumidas (tarea y propias del entregable) con `DEFAULT public.fecha_hoy_argentina()`. El guardado de horas usa `gp_guardar_horas_tarea` / `gp_guardar_horas_entregable` (fecha de negocio Argentina). El módulo `scripts/lib/fornitalia-gestion-proyectos.js` usa `America/Argentina/Buenos_Aires` para “hoy”, vencidas y horas consumidas.

## Regla Cursor (no omitir)

- `.cursor/rules/fechas-argentina-negocio.mdc` (`alwaysApply: true`).
