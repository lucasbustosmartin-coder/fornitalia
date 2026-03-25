# Análisis financiero desde el extracto (PDF)

- **Salida:** `docs/ANALISIS_FINANCIERO_EXTRACTO_FORNITALIA.html` y `.pdf`
- **Origen de datos:** `docs/Fornitalia_Movimientos.xlsx`, hoja **Movimientos** (si no está, el script usa `docs/Extracto-Fornitalia.xlsx`). La lectura se unifica a la forma “extracto” en código; columnas equivalentes: `MontoCambio` ↔ “Monto en $”, `MesAnio` ↔ “Mes/Año”, etc.
- **Moneda de origen (caja/medio):** maestro único en `scripts/lib/fornitalia-moneda-por-medio.js`: **la caja (Medio de pago) determina la moneda** (ARS/USD) para los medios listados; mismo criterio en `normalizar-extracto-fornitalia.js`, `generar-analisis-financiero-pdf.js` e importación en `dashboard-flujo-caja.html` (buscar `MEDIO_MONEDA_FORNITALIA_TABLA`). Medios nuevos: agregar fila al módulo y replicar en el dashboard. Fuera del maestro sigue la inferencia por contexto.
- **Ventas en el informe:** el bloque «Análisis de ventas» usa solo el extracto (columna **Usuario** para el ranking). No se integra archivo auxiliar de ventas hasta contar con una **fuente de verdad** validada contra el N° Operación del extracto. Para pruebas manuales: `docs/Ventas.xlsx` (bloques de 7 en columna A) y `docs/Ventas_2.xlsx` (layout distinto: primera fila 6 celdas y luego bloques de 5); `npm run normalizar-ventas-excel` normaliza solo `Ventas.xlsx`.
- **Tipo de cambio MEP (USD → ARS):** el script busca, en este orden, `docs/tipos_cambio_global_rows.sql` (export típico de Supabase con `usd_mep`), luego `docs/tipos_cambio_global_rows.csv`, luego `tipos_cambio_global_rows.csv` en la raíz. Para cada movimiento en USD sin **Monto en $** / **MontoCambio** ni tipo de cambio en la fila, aplica el MEP de la **fecha del movimiento** o la **última cotización con fecha anterior** (mismo criterio que el dashboard). Las filas que no puedan convertirse no entran en los totales y el informe lo indica.
- **Regenerar:** desde la raíz del repo, `npm run analisis-financiero-pdf`
- **Mes no cerrado:** el informe y el dashboard excluyen **marzo 2026** (columna Mes/Año o fecha del movimiento en ese mes) hasta cerrar el período en origen. La lista de meses abiertos está en `generar-analisis-financiero-pdf.js` (`filaMovimientoMesNoCerrado`) y en `dashboard-flujo-caja.html` (`esTransaccionMesNoCerradoExcluida`).

El script intenta generar el PDF con **Playwright**; si Chromium no está instalado, usa **Google Chrome** en modo headless si está en la ruta habitual (macOS/Linux). Variable opcional: `CHROME_PATH` apuntando al ejecutable.

**Alternativa:** abrir el `.html` en el navegador → Imprimir → Guardar como PDF.

El informe es **análisis de caja** (no estados contables auditados). Metodología y exclusiones figuran en el propio documento.

**Secciones de detalle:** además del panorama mensual, el HTML/PDF incluye **Análisis de ventas** (ingresos categoría Ventas) y **Compras de mercadería (hornos)** — este último como **proxy** de egresos con cuenta contable **Hornos**, con un cuadro de **restricciones** explícitas (no reemplaza CMV, inventario ni balance; los ingresos imputados a Hornos no se tratan como compra).

Al **cierre** de la sesión de ventas, de la sesión de compras (después del contenido y restricciones) y del bloque **financiero general** (antes de la conclusión), el informe agrega una tabla **Considerandos** / **Qué necesitamos para cerrar el análisis** para documentar limitaciones y entregables pendientes.

En **ventas**, el informe incluye además la **distribución por semana dentro del mes calendario** (días 1–7, 8–14, 15–21, 22–fin): totales del período y tabla por mes con % de la última franja sobre el total de ese mes.
