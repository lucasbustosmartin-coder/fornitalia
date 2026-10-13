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
    versionLabel: 'v2.96',
    lines: [
      'Al cargar el histórico, si falta un Id en la secuencia (el 8 entre 1 y 10), las cajas físicas lo muestran agrupado por caja.',
      'En cada caja hay Eliminar: hay que confirmar para borrar esos movimientos.',
      'Mercado Pago, Galicia, Credicoop y FCI mandan ese mismo Id a A eliminar de su caja.',
      'En Mercado Pago se puede deshacer una anulación: el cobro y la devolución vuelven al extracto.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
