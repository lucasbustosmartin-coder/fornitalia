/**
 * Export Compras desde Power Apps: columna A en bloques de 9 celdas.
 * Fecha (serie Excel), Proveedor, Moneda, Tipo F., Importe bruto, Impuestos,
 * Total, Retenciones, Monto restante.
 */

const XLSX = require("xlsx");

function normalizeText(value) {
  if (value == null || value === undefined) return "";
  return String(value).trim();
}

function toNumberArs(value) {
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

function normProveedor(s) {
  return normalizeText(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

const CHUNK = 9;

/**
 * @returns {{ records: object[], warnings: string[], sheetName: string }}
 */
function parseComprasColumnaA(wb) {
  const { sheetName, values } = leerColumnaA(wb);
  const records = [];
  const warnings = [];
  const full = Math.floor(values.length / CHUNK) * CHUNK;
  if (values.length % CHUNK !== 0) {
    warnings.push(
      `Sobran ${values.length % CHUNK} celda(s) al final (bloques de ${CHUNK}); se ignoran.`
    );
  }

  for (let i = 0; i < full; i += CHUNK) {
    const fechaIso = excelSerialToIso(values[i]);
    const proveedor = normalizeText(values[i + 1]);
    const moneda = normalizeText(values[i + 2]);
    const tipo_comprobante = normalizeText(values[i + 3]);
    const importe_bruto = toNumberArs(values[i + 4]);
    const impuestos = toNumberArs(values[i + 5]);
    const total = toNumberArs(values[i + 6]);
    const retenciones = toNumberArs(values[i + 7]);
    const monto_restante = toNumberArs(values[i + 8]);

    if (!proveedor) {
      warnings.push(`Bloque fila ${i + 1}: sin proveedor; omitido.`);
      continue;
    }
    if (!fechaIso) {
      warnings.push(`Bloque proveedor "${proveedor}": fecha inválida; registro incluido con fecha_iso null.`);
    }

    /** Caja esperada mismo día: Total si pagado; si saldo pendiente (restante > 0) → Total − restante. */
    let esperado_caja = null;
    if (total != null && Number.isFinite(total)) {
      if (monto_restante != null && monto_restante > 0.01) {
        esperado_caja = total - monto_restante;
      } else {
        esperado_caja = total;
      }
    }
    const pagado_total =
      monto_restante == null || monto_restante <= 0.01;

    records.push({
      fecha_iso: fechaIso,
      proveedor,
      proveedor_norm: normProveedor(proveedor),
      moneda,
      tipo_comprobante,
      importe_bruto,
      impuestos,
      total,
      retenciones,
      monto_restante,
      pagado_total,
      esperado_caja,
    });
  }

  return { records, warnings, sheetName };
}

module.exports = {
  parseComprasColumnaA,
  toNumberArs,
  excelSerialToIso,
  normProveedor,
  leerColumnaA,
  CHUNK,
};
