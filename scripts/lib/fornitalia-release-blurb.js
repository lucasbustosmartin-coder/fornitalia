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
    versionLabel: 'v2.84',
    lines: [
      'En Flujo de caja, a la derecha de las tarjetas, se ve la posición de caja de hoy en torta: Galicia, Mercado Pago, Credicoop, Efectivo y Resto, en millones y porcentaje.',
      'El subtítulo muestra el total, por ejemplo Hoy · 10/2026 · 288,6 M pesos.',
      'Las solapas quedan a la altura de la torta y el gráfico de G/P tiene más lugar.',
      'El PDF de Flujo incluye esa torta.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
