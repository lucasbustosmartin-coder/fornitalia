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
    versionLabel: 'v2.58',
    lines: [
      'Después del último corte, el saldo de Galicia se arma con los movimientos del Excel del extracto.',
      'El PDF del banco ya no carga movimientos: solo muestra cuáles del período no están en el resumen.',
      'Si recargás el Excel de Galicia, salen del extracto los que el archivo ya no trae (cheques en proceso, cargas viejas).',
      'Los extractos ya cargados no cambian. Tesorería se sigue conciliando aparte.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
