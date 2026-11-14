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
    versionLabel: 'v2.116',
    lines: [
      'Nuevo menú Reposición hornos: la tabla del 13/11/2026, con tarjetas y una alerta antes de emitir la orden.',
      'Se puede subir el histórico de ventas para recalcular, y exportar el Excel con el mismo diseño.',
      'Préstamo o servicio no cuenta como stock para vender. Lo ya agotado y la orden vencida se marcan aparte.',
      'Cada columna calculada explica su fórmula. Si el artículo no estaba en el inventario, las cantidades quedan en 0.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
