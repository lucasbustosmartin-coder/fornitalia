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
    versionLabel: 'v2.70',
    lines: [
      'En Conciliación Bancaria, Filtros ahora permite acotar por importe exacto (1000 o 1.000,00) y por ID exacto.',
      'El buscar queda libre para concepto, cliente y observaciones: un 1000 ya no trae IDs que contienen esos dígitos.',
      'La solapa Todos sigue mostrando en qué listado está cada movimiento (Sugeridos, Confirmados, Solo banco, etc.).'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
