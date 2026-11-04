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
    versionLabel: 'v2.112',
    lines: [
      'La agenda muestra las próximas 4 semanas según la semana del mes.',
      'Esta semana es la 1ª de noviembre: el estimado es lo habitual de la 1ª semana.',
      'Lo ya pagado figura con el importe real. Lo que falta de esa semana sigue por pagar.',
      'La semana que viene se ven la 2ª, la 3ª, la 4ª y la 1ª de diciembre.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
