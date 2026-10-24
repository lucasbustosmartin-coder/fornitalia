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
    versionLabel: 'v2.102',
    lines: [
      'En Flujo de caja, lo primero que se ve es Agenda de pagos.',
      'Estima las próximas 4 semanas, de lunes a viernes, por categoría, cuenta contable y proveedor.',
      'Sueldos y Jornales a pagar queda el primer día hábil, con el total de la última primera semana.',
      'Si un pago cae sábado o domingo, pasa al lunes. Impuestos chicos y gastos bancarios no entran.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
