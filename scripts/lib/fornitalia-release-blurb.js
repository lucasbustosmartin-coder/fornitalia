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
    versionLabel: 'v2.71',
    lines: [
      'Al abrir Conciliación Bancaria, Sugeridos se vuelve a armar aunque la lista esté vacía.',
      'El mismo día también propone parejas si el importe entra en la tolerancia (centavos en montos chicos, un poco más en montos grandes).',
      'Las confirmaciones y los avisos (por ejemplo, confirmar sugerencias) aparecen en un cuadro de la app, con Aceptar y Cancelar.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
