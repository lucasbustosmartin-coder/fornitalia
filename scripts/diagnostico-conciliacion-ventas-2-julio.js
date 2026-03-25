#!/usr/bin/env node
/**
 * Cruce exploratorio: docs/Ventas_2.xlsx (columna A, layout 6+5+5+…) vs extracto
 * julio 2025, categoría Ventas + Ingreso. No modifica el informe PDF.
 *
 * Uso: node scripts/diagnostico-conciliacion-ventas-2-julio.js
 */

const path = require("path");
const XLSX = require("xlsx");

const root = path.join(__dirname, "..");
const VENTAS_2 = path.join(root, "docs", "Ventas_2.xlsx");
const { resolveMovimientosXlsxPath } = require("./lib/fornitalia-docs-paths");
const { mapSheetRowsToLegacy } = require("./lib/fornitalia-movimiento-row-canon");

function norm(s) {
  return String(s || "").trim();
}

function toNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = String(value).trim().replace(/\s*ARS\s*$/i, "");
  raw = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const p = Number(raw);
  return Number.isFinite(p) ? p : null;
}

function fechaIsoFromSerial(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const d = XLSX.SSF.parse_date_code(n);
  if (!d) return null;
  return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
}

function mesSortKey(ma) {
  const t = norm(ma);
  const m = t.match(/^(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[2]}-${String(m[1]).padStart(2, "0")}`;
}

function parseVentas2ColumnaA(vals) {
  const recs = [];
  let i = 0;
  if (
    vals.length >= 6 &&
    typeof vals[1] === "number" &&
    vals[1] > 40000 &&
    typeof vals[2] === "number"
  ) {
    recs.push({
      fecha: fechaIsoFromSerial(vals[1]),
      op: String(vals[2]),
      cliente: vals[3],
      monto: toNumber(vals[4]),
      vendedor_caja: vals[5],
      extra: vals[0],
    });
    i = 6;
  }
  while (i + 4 < vals.length) {
    const chunk = vals.slice(i, i + 5);
    if (typeof chunk[0] !== "number" || chunk[0] < 40000) break;
    const m = toNumber(chunk[3]);
    if (m != null && m > 1e8) break;
    recs.push({
      fecha: fechaIsoFromSerial(chunk[0]),
      op: String(chunk[1]),
      cliente: chunk[2],
      monto: m,
      vendedor_caja: chunk[4],
    });
    i += 5;
  }
  return recs;
}

function main() {
  const wb2 = XLSX.readFile(VENTAS_2);
  const sh = wb2.Sheets[wb2.SheetNames[0]];
  const rng = XLSX.utils.decode_range(sh["!ref"]);
  const vals = [];
  for (let r = rng.s.r; r <= rng.e.r; r++) {
    const c = sh[XLSX.utils.encode_cell({ r, c: 0 })];
    vals.push(c && "v" in c ? c.v : null);
  }

  const recs = parseVentas2ColumnaA(vals);
  const jul = recs.filter((r) => r.fecha && r.fecha.startsWith("2025-07"));

  const wbE = XLSX.readFile(resolveMovimientosXlsxPath());
  const rows = mapSheetRowsToLegacy(
    XLSX.utils.sheet_to_json(wbE.Sheets["Movimientos"], {
      defval: null,
    })
  );
  const opsExt = new Set();
  for (const r of rows) {
    if (r["Estado"] === "Anulado") continue;
    if (["Apertura de Caja", "Cierre de Caja"].includes(r["Tipo"])) continue;
    if (norm(r["Tipo"]) !== "Ingreso") continue;
    if (norm(r["Categoría"]).toLowerCase() !== "ventas") continue;
    if (mesSortKey(r["Mes/Año"]) !== "2025-07") continue;
    opsExt.add(norm(r["N° Operación"]));
  }

  const enExt = jul.filter((r) => opsExt.has(r.op));
  const noEnExt = jul.filter((r) => !opsExt.has(r.op)).map((r) => r.op);
  let cubreExt = 0;
  for (const op of opsExt) {
    if (jul.some((r) => r.op === op)) cubreExt += 1;
  }

  console.log("Ventas_2: registros parseados", recs.length, "| julio 2025:", jul.length);
  console.log(
    "Archivo julio cuyo N° op aparece en extracto (Ventas, jul-2025):",
    enExt.length,
    "/",
    jul.length
  );
  console.log("Ops archivo julio sin match en extracto:", noEnExt.join(", ") || "—");
  console.log(
    "Ops únicos extracto julio:",
    opsExt.size,
    "| cubiertos por archivo julio:",
    cubreExt,
    "(" + ((100 * cubreExt) / opsExt.size).toFixed(1) + "%)"
  );
}

main();
