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
    versionLabel: 'v2.87',
    lines: [
      'En Saldos extractos, el mes en curso de Galicia no suma un cheque o movimiento que el banco todavía no imputó.',
      'El cheque del 09/10 (Acred. Cheque 48hs En Proceso, $ 2.266.220) queda afuera: el saldo pasa a $ 214.011.718,07.',
      'Ese mismo saldo se refleja en la torta de posición de caja.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
