/**
 * Archivo auxiliar de ventas (docs/Ventas.xlsx): datos en columna A por bloques de 7 celdas.
 * Orden: código operación, email cliente, monto texto ARS, fecha desde (serie Excel),
 * fecha hasta (serie Excel), etiqueta cliente, vendedor.
 */

const XLSX = require("xlsx");

function normalizeText(value) {
  if (value == null || value === undefined) return "";
  return String(value).trim();
}

function toNumberArsFromString(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = String(value).trim();
  raw = raw.replace(/\s*ARS\s*$/i, "");
  raw = raw.replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  raw = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function excelSerialToIso(n) {
  if (n == null || n === "") return null;
  const num = typeof n === "number" ? n : Number(String(n).trim());
  if (!Number.isFinite(num)) return null;
  const d = XLSX.SSF.parse_date_code(num);
  if (!d || !d.y) return null;
  const mm = String(d.m).padStart(2, "0");
  const dd = String(d.d).padStart(2, "0");
  return `${d.y}-${mm}-${dd}`;
}

function codigoOperacionKey(cell) {
  if (cell == null || cell === "") return null;
  if (typeof cell === "number" && Number.isFinite(cell))
    return String(Math.trunc(cell));
  const s = String(cell).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s;
}

/**
 * Lee la primera hoja del workbook y toma la columna A como secuencia vertical.
 */
function leerColumnaA(wb) {
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet || !sheet["!ref"]) return { sheetName: name, values: [] };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const values = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 0 });
    const cell = sheet[addr];
    values.push(cell != null && "v" in cell ? cell.v : null);
  }
  return { sheetName: name, values };
}

/**
 * @returns {{ records: object[], warnings: string[], sheetName: string }}
 */
function parseVentasAuxiliarDesdeWorkbook(wb) {
  const { sheetName, values } = leerColumnaA(wb);
  const records = [];
  const warnings = [];
  const chunk = 7;
  const full = Math.floor(values.length / chunk) * chunk;
  if (values.length % chunk !== 0) {
    warnings.push(
      `Sobran ${values.length % chunk} celda(s) al final de la columna A (se esperan bloques de ${chunk}); se ignoran.`
    );
  }
  for (let i = 0; i < full; i += chunk) {
    const op = codigoOperacionKey(values[i]);
    const email = normalizeText(values[i + 1]);
    const montoArs = toNumberArsFromString(values[i + 2]);
    const fechaDesdeIso = excelSerialToIso(values[i + 3]);
    const fechaHastaIso = excelSerialToIso(values[i + 4]);
    const clienteEtiqueta = normalizeText(values[i + 5]);
    let vendedor = normalizeText(values[i + 6]);
    if (vendedor === "-" || vendedor.toLowerCase() === "n/d") vendedor = "";

    if (op == null) {
      warnings.push(`Bloque fila ${i + 1}: código de operación inválido; bloque omitido.`);
      continue;
    }
    if (montoArs == null) {
      warnings.push(`Bloque op ${op}: monto ARS no parseable; registro igualmente incluido con monto_ars null.`);
    }

    records.push({
      codigo_operacion: op,
      cliente_email: email || null,
      monto_ars: montoArs,
      fecha_desde_iso: fechaDesdeIso,
      fecha_hasta_iso: fechaHastaIso,
      cliente_etiqueta: clienteEtiqueta || null,
      vendedor: vendedor || null,
    });
  }
  return { records, warnings, sheetName };
}

/**
 * @param {object[]} records
 * @returns {Map<string, { vendedor: string, record: object }>}
 */
function mapaOperacionAVendedor(records) {
  const map = new Map();
  for (const rec of records) {
    if (!rec.vendedor) continue;
    map.set(rec.codigo_operacion, { vendedor: rec.vendedor, record: rec });
  }
  return map;
}

function montosConcilian(sumaExtracto, montoArchivo) {
  if (
    sumaExtracto == null ||
    montoArchivo == null ||
    !Number.isFinite(sumaExtracto) ||
    !Number.isFinite(montoArchivo)
  )
    return false;
  const diff = Math.abs(sumaExtracto - montoArchivo);
  const tol = Math.max(2, Math.abs(montoArchivo) * 0.002);
  return diff <= tol;
}

module.exports = {
  parseVentasAuxiliarDesdeWorkbook,
  leerColumnaA,
  mapaOperacionAVendedor,
  montosConcilian,
  toNumberArsFromString,
  excelSerialToIso,
  codigoOperacionKey,
};
