/**
 * Maestro Fornitalia: la caja (Medio de pago) determina la moneda de origen.
 * Tabla acordada con negocio; orden de filas no importa — se ordena por longitud de clave
 * (más larga primero) para no confundir p. ej. "Transferencia Galicia" con "Transferencia Galicia Dolar".
 *
 * Medio "-" → ARS (observación en origen: ALERTA; conviene corregir el maestro de medios).
 *
 * Si el medio no está en la tabla, `monedaPorMedioFornitalia` devuelve `null` y quien llame
 * puede usar inferencia por descripción/categoría (fallback).
 *
 * Mantener alineado con `dashboard-flujo-caja.html` (buscar MEDIO_MONEDA_FORNITALIA_TABLA).
 */

const MEDIO_MONEDA_FILAS = [
  ["Transferencia Galicia Dolar", "USD"],
  ["Efectivo Dolar", "USD"],
  ["Transferencia Credicoop", "ARS"],
  ["Transferencia Galicia", "ARS"],
  ["Transferencia Morba", "ARS"],
  ["Transferencia Morva", "ARS"],
  ["Efectivo Pesos", "ARS"],
  ["MercadoPago", "ARS"],
  ["Mercado Pago", "ARS"],
  ["-", "ARS"],
];

function normalizeMedioKeyFornitalia(medioRaw) {
  if (medioRaw === null || medioRaw === undefined) return "";
  const t = String(medioRaw).trim();
  if (t === "" || t === "—" || t === "–") return "";
  if (t === "-") return "-";
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

function buildLookupEntries() {
  const map = new Map();
  for (const [label, moneda] of MEDIO_MONEDA_FILAS) {
    const key = label === "-" ? "-" : normalizeMedioKeyFornitalia(label);
    if (key === "" && label !== "-") continue;
    map.set(label === "-" ? "-" : key, moneda);
  }
  return [...map.entries()].sort((a, b) => b[0].length - a[0].length);
}

const _LOOKUP_SORTED = buildLookupEntries();

/**
 * @param {string|null|undefined} medioRaw
 * @returns {"ARS"|"USD"|null}
 */
function monedaPorMedioFornitalia(medioRaw) {
  const k = normalizeMedioKeyFornitalia(medioRaw);
  if (k === "") return null;
  for (const [key, moneda] of _LOOKUP_SORTED) {
    if (k === key) return moneda;
  }
  return null;
}

module.exports = {
  MEDIO_MONEDA_FILAS,
  monedaPorMedioFornitalia,
  normalizeMedioKeyFornitalia,
};
