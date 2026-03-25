#!/usr/bin/env node
/**
 * Normaliza docs/Ventas.xlsx (columna A en bloques de 7) → docs/Ventas-Normalizado.xlsx
 * y muestra conciliación rápida contra el libro de movimientos (Fornitalia_Movimientos.xlsx preferido).
 *
 * Uso: node scripts/normalizar-extracto-ventas-fornitalia.js
 */

const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const {
  parseVentasAuxiliarDesdeWorkbook,
  mapaOperacionAVendedor,
  montosConcilian,
} = require("./lib/ventas-auxiliar-fornitalia");
const { resolveMovimientosXlsxPath } = require("./lib/fornitalia-docs-paths");
const { mapSheetRowsToLegacy } = require("./lib/fornitalia-movimiento-row-canon");

const ROOT = path.join(__dirname, "..");
const INPUT_VENTAS = path.join(ROOT, "docs", "Ventas.xlsx");
const OUTPUT = path.join(ROOT, "docs", "Ventas-Normalizado.xlsx");

function normalizeText(value) {
  if (value == null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferCurrency(row) {
  const medio = normalizeText(row["Medio de Pago"]).toLowerCase();
  const blob = [
    row["Medio de Pago"],
    row["Descripción"],
    row["Observaciones"],
    row["Cuenta Contable"],
    row["Categoría"],
  ]
    .map(normalizeText)
    .join(" ")
    .toLowerCase();
  const medioCompact = medio.replace(/\s+/g, "");
  if (
    medioCompact.includes("mercadopago") ||
    (medio.includes("mercado") && medio.includes("pago"))
  )
    return "ARS";
  if (medio.includes("morba") || medio.includes("morva")) return "ARS";
  if (
    medioCompact.includes("mercadopago") ||
    /\bmercado\s+pago\b/.test(blob)
  )
    return "ARS";
  if (blob.includes("morba") || blob.includes("morva")) return "ARS";
  if (
    medio.includes("dolar") ||
    medio.includes("dólar") ||
    /\b(u\$s|usd|us\$|dolar|dólar)\b/.test(blob)
  )
    return "USD";
  return "ARS";
}

function montoArsExtracto(row) {
  const moneda = inferCurrency(row);
  const montoOriginal = toNumber(row["Monto"]);
  const tipoCambio = toNumber(row["Tipo de Cambio"]);
  const montoArsCol = toNumber(row["Monto en $"]);
  if (montoArsCol !== null && montoArsCol !== undefined) return montoArsCol;
  if (moneda === "USD" && montoOriginal != null && tipoCambio != null) {
    return Number((montoOriginal * tipoCambio).toFixed(2));
  }
  if (moneda === "ARS") return montoOriginal;
  return null;
}

function esIngresoVentas(r) {
  if (normalizeText(r["Tipo"]) !== "Ingreso") return false;
  return normalizeText(r["Categoría"]).toLowerCase() === "ventas";
}

function main() {
  if (!fs.existsSync(INPUT_VENTAS)) {
    console.error("No se encontró:", INPUT_VENTAS);
    process.exit(1);
  }

  const wbV = XLSX.readFile(INPUT_VENTAS);
  const { records, warnings, sheetName } = parseVentasAuxiliarDesdeWorkbook(wbV);

  for (const w of warnings) console.warn("[ventas]", w);

  const rowsOut = records.map((r) => ({
    codigo_operacion: Number.isFinite(Number(r.codigo_operacion))
      ? Number(r.codigo_operacion)
      : r.codigo_operacion,
    cliente_email: r.cliente_email,
    monto_ars: r.monto_ars != null ? Number(r.monto_ars) : null,
    fecha_desde_iso: r.fecha_desde_iso,
    fecha_hasta_iso: r.fecha_hasta_iso,
    cliente_etiqueta: r.cliente_etiqueta,
    vendedor: r.vendedor,
    origen_hoja: sheetName,
  }));

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbOut,
    XLSX.utils.json_to_sheet(rowsOut),
    "Normalizado"
  );
  XLSX.writeFile(wbOut, OUTPUT);
  console.log("Creado:", OUTPUT, "| Registros:", records.length);

  const INPUT_EXTRACTO = resolveMovimientosXlsxPath();
  if (!fs.existsSync(INPUT_EXTRACTO)) {
    console.log("Sin libro de movimientos para conciliar:", INPUT_EXTRACTO);
    return;
  }

  const wbE = XLSX.readFile(INPUT_EXTRACTO);
  const mov = wbE.Sheets["Movimientos"];
  if (!mov) return;
  const raw = mapSheetRowsToLegacy(
    XLSX.utils.sheet_to_json(mov, { defval: null })
  );
  const operativos = raw.filter(
    (r) =>
      r["Estado"] !== "Anulado" &&
      !["Apertura de Caja", "Cierre de Caja"].includes(r["Tipo"])
  );

  const sumByOp = new Map();
  const nByOp = new Map();
  for (const r of operativos) {
    if (!esIngresoVentas(r)) continue;
    const m = montoArsExtracto(r);
    if (m == null || !Number.isFinite(m)) continue;
    const op = normalizeText(r["N° Operación"]);
    if (!op) continue;
    sumByOp.set(op, (sumByOp.get(op) || 0) + m);
    nByOp.set(op, (nByOp.get(op) || 0) + 1);
  }

  let enExtracto = 0;
  let montosOk = 0;
  console.log("\nConciliación (archivo ventas vs extracto, cat. Ventas + Ingreso):");
  console.log(
    "op\tmonto_archivo\tsuma_extracto\tn_filas\tmontos_OK\ten_extracto"
  );
  for (const rec of records) {
    const op = String(rec.codigo_operacion);
    const sumEx = sumByOp.get(op);
    const nf = nByOp.get(op) || 0;
    const ext = sumEx != null && nf > 0;
    if (ext) enExtracto += 1;
    const ok = montosConcilian(sumEx, rec.monto_ars);
    if (ok) montosOk += 1;
    console.log(
      `${op}\t${rec.monto_ars ?? "—"}\t${sumEx ?? "—"}\t${nf}\t${ok ? "Sí" : "No"}\t${ext ? "Sí" : "No"}`
    );
  }

  const mapV = mapaOperacionAVendedor(records);
  console.log(
    `\nResumen: ${records.length} registros archivo | ${enExtracto} con movimientos en extracto | ${montosOk} montos dentro de tolerancia | ${mapV.size} con vendedor informado`
  );
}

main();
