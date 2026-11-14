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
    versionLabel: 'v2.117',
    lines: [
      'En Reposición hornos, las fechas de entrega ya no suman hornos: solo dicen cuándo llega a puerto lo que ya está por ingresar.',
      'Cada carga de ventas vuelve a calcular el stock y adelanta o corre la fecha de la orden según el ritmo.',
      'El costo en pesos usa el dólar oficial de hoy, y ese valor se ve junto al título.',
      'Las columnas se ordenan al tocar el encabezado. El precio de lista toma el de la venta más reciente del archivo.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = blurb;
  }
  if (root) root.FORNITALIA_RELEASE_BLURB = blurb;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
