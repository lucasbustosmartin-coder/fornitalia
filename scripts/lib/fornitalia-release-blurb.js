/**
 * Única fuente del texto de novedades para el modal «Nueva versión».
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel`
 * a `v` + APP_VERSION y redactar `lines` (2–4 frases visibles para quien usa la app).
 * `node scripts/crear-bitacora-excel.js` genera `fornitalia-release.json` en la raíz
 * para leerlo por red (sin depender de un JS viejo en caché).
 */
(function (root) {
  'use strict';
  var blurb = {
    versionLabel: 'v2.62',
    lines: [
      'En Flujo de caja elegís el período: último año, un año o todo el histórico.',
      'El gráfico G/P mensual y la tabla van con los meses en columnas; abajo, los ratios del negocio.',
      'El PDF sale en una sola hoja, con el gráfico de margen a margen y los filtros activos remarcados.',
      'En la columna Total de los ratios no entran los meses proyectados.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
