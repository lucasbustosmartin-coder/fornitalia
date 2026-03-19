#!/usr/bin/env node

const path = require("path");
const XLSX = require("xlsx");

const INPUT_PATH = path.join(__dirname, "..", "docs", "Extracto-Fornitalia.xlsx");
const OUTPUT_PATH = path.join(
  __dirname,
  "..",
  "docs",
  "Extracto-Fornitalia-Normalizado.xlsx"
);

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Convierte formatos comunes: 1.234.567,89 | 1234,56 | 1234.56
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toIsoDate(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const parts = text.split("/");
  if (parts.length !== 3) return text;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return text;
  return `${yyyy.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Mercado Pago y Transferencia Morba (medio en extracto; “morba” con b) → siempre ARS.
 * También “morva” por posible confusión de tipeo. Prevalece sobre menciones de dólar en textos.
 */
function inferCurrency(row) {
  const medio = normalizeText(row["Medio de Pago"]).toLowerCase();
  const medioCompact = medio.replace(/\s+/g, "");
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
  const blobCompact = blob.replace(/\s+/g, "");

  if (
    medioCompact.includes("mercadopago") ||
    (medio.includes("mercado") && medio.includes("pago"))
  ) {
    return "ARS";
  }
  if (medio.includes("morba") || medio.includes("morva")) {
    return "ARS";
  }
  if (
    blobCompact.includes("mercadopago") ||
    /\bmercado\s+pago\b/.test(blob)
  ) {
    return "ARS";
  }
  if (blob.includes("morba") || blob.includes("morva")) {
    return "ARS";
  }

  if (
    medio.includes("dolar") ||
    medio.includes("dólar") ||
    /\b(u\$s|usd|us\$|dolar|dólar)\b/.test(blob)
  ) {
    return "USD";
  }
  return "ARS";
}

function normalizeMovement(row) {
  const moneda = inferCurrency(row);
  const montoOriginal = toNumber(row["Monto"]);
  const tipoCambio = toNumber(row["Tipo de Cambio"]);
  const montoArsCol = toNumber(row["Monto en $"]);

  // Regla de derivación:
  // - Si viene "Monto en $" del origen, se respeta.
  // - Si es USD y hay tipo de cambio, se calcula ARS.
  // - Si es ARS, el monto ARS es el monto original.
  let montoArs = montoArsCol;
  if (montoArs === null) {
    if (moneda === "USD" && montoOriginal !== null && tipoCambio !== null) {
      montoArs = Number((montoOriginal * tipoCambio).toFixed(2));
    } else if (moneda === "ARS") {
      montoArs = montoOriginal;
    }
  }

  return {
    fecha_original: normalizeText(row["Fecha"]),
    fecha_iso: toIsoDate(row["Fecha"]),
    hora: normalizeText(row["Hora"]),
    nro_operacion: normalizeText(row["N° Operación"]),
    tipo_movimiento: normalizeText(row["Tipo"]),
    medio_pago: normalizeText(row["Medio de Pago"]),
    cliente: normalizeText(row["Cliente"]),
    descripcion: normalizeText(row["Descripción"]),
    observaciones: normalizeText(row["Observaciones"]),
    categoria: normalizeText(row["Categoría"]),
    cuenta_contable: normalizeText(row["Cuenta Contable"]),
    moneda,
    monto_original: montoOriginal,
    tipo_cambio: tipoCambio,
    monto_ars: montoArs,
    mes_anio: normalizeText(row["Mes/Año"]),
    usuario: normalizeText(row["Usuario"]),
    estado: normalizeText(row["Estado"]),
  };
}

function main() {
  const wbIn = XLSX.readFile(INPUT_PATH);
  const sheet = wbIn.Sheets["Movimientos"];
  if (!sheet) {
    throw new Error('No se encontró la hoja "Movimientos" en el archivo de entrada.');
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const normalizedRows = rows.map(normalizeMovement);

  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    outWb,
    XLSX.utils.json_to_sheet(normalizedRows),
    "Normalizado"
  );

  // Copia opcional de la hoja original para trazabilidad.
  XLSX.utils.book_append_sheet(
    outWb,
    XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }).reduce(
      (acc, row, idx) => {
        const ref = XLSX.utils.encode_cell({ r: idx, c: 0 });
        if (row.length === 0) return acc;
        XLSX.utils.sheet_add_aoa(acc, [row], { origin: idx === 0 ? "A1" : -1 });
        return acc;
      },
      XLSX.utils.aoa_to_sheet([])
    ),
    "Movimientos_Original"
  );

  XLSX.writeFile(outWb, OUTPUT_PATH);

  const counts = normalizedRows.reduce(
    (acc, r) => {
      acc.total += 1;
      acc[r.moneda] += 1;
      return acc;
    },
    { total: 0, ARS: 0, USD: 0 }
  );

  console.log(`Archivo generado: ${OUTPUT_PATH}`);
  console.log(
    `Filas normalizadas: ${counts.total} | ARS: ${counts.ARS} | USD: ${counts.USD}`
  );
}

main();
