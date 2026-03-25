#!/usr/bin/env node
/**
 * Normaliza el libro de movimientos (docs/Fornitalia_Movimientos.xlsx preferido;
 * fallback Extracto-Fornitalia.xlsx) → docs/Extracto-Fornitalia-Normalizado.xlsx
 *
 * Uso: node scripts/normalizar-extracto-fornitalia.js
 */

const path = require("path");
const XLSX = require("xlsx");
const { resolveMovimientosXlsxPath } = require("./lib/fornitalia-docs-paths");
const {
  rowToLegacyExtractoShape,
  extraCamposDesdeMovimientosExport,
} = require("./lib/fornitalia-movimiento-row-canon");
const { monedaPorMedioFornitalia } = require("./lib/fornitalia-moneda-por-medio");

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

  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value) {
  if (value == null || value === undefined) return "";
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

function inferCurrency(row) {
  const porMedio = monedaPorMedioFornitalia(row["Medio de Pago"]);
  if (porMedio) return porMedio;
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

function normalizeMovement(legacyRow, extras) {
  const ex = extras || {};
  const moneda = inferCurrency(legacyRow);
  const montoOriginal = toNumber(legacyRow["Monto"]);
  const tipoCambio = toNumber(legacyRow["Tipo de Cambio"]);
  const montoArsCol = toNumber(legacyRow["Monto en $"]);

  let montoArs = montoArsCol;
  if (montoArs === null) {
    if (moneda === "USD" && montoOriginal !== null && tipoCambio !== null) {
      montoArs = Number((montoOriginal * tipoCambio).toFixed(2));
    } else if (moneda === "ARS") {
      montoArs = montoOriginal;
    }
  }

  return {
    fecha_original: normalizeText(legacyRow["Fecha"]),
    fecha_iso: toIsoDate(legacyRow["Fecha"]),
    hora: normalizeText(legacyRow["Hora"]),
    nro_operacion: normalizeText(legacyRow["N° Operación"]),
    tipo_movimiento: normalizeText(legacyRow["Tipo"]),
    medio_pago: normalizeText(legacyRow["Medio de Pago"]),
    cliente: normalizeText(legacyRow["Cliente"]),
    descripcion: normalizeText(legacyRow["Descripción"]),
    observaciones: normalizeText(legacyRow["Observaciones"]),
    categoria: normalizeText(legacyRow["Categoría"]),
    cuenta_contable: normalizeText(legacyRow["Cuenta Contable"]),
    moneda,
    monto_original: montoOriginal,
    tipo_cambio: tipoCambio,
    monto_ars: montoArs,
    mes_anio: normalizeText(legacyRow["Mes/Año"]),
    usuario: normalizeText(legacyRow["Usuario"]),
    estado: normalizeText(legacyRow["Estado"]),
    id_cierre_caja: ex.id_cierre_caja != null ? String(ex.id_cierre_caja) : null,
    id_comprobante_pago:
      ex.id_comprobante_pago != null && Number.isFinite(Number(ex.id_comprobante_pago))
        ? Number(ex.id_comprobante_pago)
        : null,
    id_impuesto:
      ex.id_impuesto != null && Number.isFinite(Number(ex.id_impuesto))
        ? Number(ex.id_impuesto)
        : null,
    cat_desc: ex.cat_desc != null ? normalizeText(ex.cat_desc) : null,
  };
}

function main() {
  const INPUT_PATH = resolveMovimientosXlsxPath();
  const wbIn = XLSX.readFile(INPUT_PATH);
  const sheet = wbIn.Sheets["Movimientos"];
  if (!sheet) {
    throw new Error('No se encontró la hoja "Movimientos" en el archivo de entrada.');
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const normalizedRows = rawRows.map((raw) => {
    const legacy = rowToLegacyExtractoShape(raw);
    const extras = extraCamposDesdeMovimientosExport(raw);
    return normalizeMovement(legacy, extras);
  });

  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    outWb,
    XLSX.utils.json_to_sheet(normalizedRows),
    "Normalizado"
  );

  XLSX.utils.book_append_sheet(
    outWb,
    XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }).reduce(
      (acc, row, idx) => {
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

  console.log(`Entrada: ${INPUT_PATH}`);
  console.log(`Archivo generado: ${OUTPUT_PATH}`);
  console.log(
    `Filas normalizadas: ${counts.total} | ARS: ${counts.ARS} | USD: ${counts.USD}`
  );
}

main();
