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
    versionLabel: 'v2.86',
    lines: [
      'Con USD, la torta de posición muestra los montos en miles, por ejemplo 135 mil dólares MEP.',
      'En pesos, la torta sigue en millones.',
      'El gráfico de G/P y la tabla siguen en el dólar seleccionado: MEP, CCL u oficial.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
