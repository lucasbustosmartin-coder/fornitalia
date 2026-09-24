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
    versionLabel: 'v2.50',
    lines: [
      'En Flujo por mes y Todas las transacciones podés ordenar clicando el encabezado de cualquier columna.',
      'El buscador de Todas las transacciones también encuentra por descripción, no solo por id de operación.',
      'En Saldos extractos, los bancos muestran una fila Mes en curso (celeste) con el saldo hasta hoy: último corte más créditos menos débitos.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
