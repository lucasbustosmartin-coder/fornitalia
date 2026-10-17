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
    versionLabel: 'v2.99',
    lines: [
      'En Flujo por mes hay dos ratios nuevos: ingresos con factura y sin factura.',
      'Con factura son Efectivo Pesos, Efectivo Dólar, Mercado Pago y las transferencias de Galicia y Credicoop.',
      'Sin factura es el resto de las cajas. Entre los dos siempre suman 100%.',
      'También salen en el Excel y en el PDF del flujo.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
