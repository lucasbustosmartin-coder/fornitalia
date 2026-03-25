/**
 * Mismo criterio que el informe financiero (sección compras / mercadería hornos):
 * Egreso + Cuenta contable "Hornos" (minúsculas), operativo, sin mes no cerrado.
 * ARS con Monto en $, TC de fila o usd_mep por fecha (docs/tipos_cambio_*).
 */

const fs = require("fs");
const path = require("path");
const { rowToLegacyExtractoShape } = require("./fornitalia-movimiento-row-canon");

const ROOT = path.join(__dirname, "..", "..");
const TC_SQL_DOCS = path.join(ROOT, "docs", "tipos_cambio_global_rows.sql");
const TC_CSV_DOCS = path.join(ROOT, "docs", "tipos_cambio_global_rows.csv");
const TC_CSV_ROOT = path.join(ROOT, "tipos_cambio_global_rows.csv");

function normalizeText(value) {
  if (value == null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

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

function fechaIsoFromMovimiento(row) {
  const t = normalizeText(row["Fecha"]);
  const p = t.split("/");
  if (p.length !== 3) return null;
  const [dd, mm, yyyy] = p;
  if (!yyyy || !mm || !dd) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseTiposCambioSql(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const map = new Map();
  const re =
    /\('[^']*', '(\d{4}-\d{2}-\d{2})', '([0-9.]+)', '([0-9.]+)', '([0-9.]+)', '[^']*'\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const fecha = m[1];
    const mep = parseFloat(m[2]);
    if (!Number.isNaN(mep) && mep > 0) map.set(fecha, mep);
  }
  return map;
}

function loadTcFromCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const fecha = parts[1].trim();
    const mep = parseFloat(parts[2]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(mep) && mep > 0) {
      map.set(fecha, mep);
    }
  }
  return map;
}

function loadTipoCambioMepContext() {
  if (fs.existsSync(TC_SQL_DOCS)) {
    const map = parseTiposCambioSql(TC_SQL_DOCS);
    if (map.size) {
      return {
        map,
        sortedAsc: [...map.keys()].sort(),
        label: "docs/tipos_cambio_global_rows.sql (usd_mep)",
      };
    }
  }
  if (fs.existsSync(TC_CSV_DOCS)) {
    const map = loadTcFromCsv(TC_CSV_DOCS);
    if (map.size) {
      return {
        map,
        sortedAsc: [...map.keys()].sort(),
        label: "docs/tipos_cambio_global_rows.csv",
      };
    }
  }
  if (fs.existsSync(TC_CSV_ROOT)) {
    const map = loadTcFromCsv(TC_CSV_ROOT);
    if (map.size) {
      return {
        map,
        sortedAsc: [...map.keys()].sort(),
        label: "tipos_cambio_global_rows.csv (raíz)",
      };
    }
  }
  return { map: new Map(), sortedAsc: [], label: null };
}

function getTasaMepAnterior(fechaIso, sortedAsc, map) {
  if (!fechaIso || !sortedAsc.length) return null;
  let lo = 0;
  let hi = sortedAsc.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= fechaIso) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (ans < 0) return null;
  const v = map.get(sortedAsc[ans]);
  return v != null && v > 0 ? v : null;
}

function montoArs(row, tcCtx) {
  const moneda = inferCurrency(row);
  const montoOriginal = toNumber(row["Monto"]);
  const tipoCambioFila = toNumber(row["Tipo de Cambio"]);
  const montoArsCol = toNumber(row["Monto en $"]);
  if (montoArsCol !== null && montoArsCol !== undefined) return montoArsCol;
  if (moneda === "ARS") return montoOriginal;

  if (moneda === "USD") {
    if (montoOriginal == null) return null;
    if (tipoCambioFila != null && tipoCambioFila > 0) {
      return Number((montoOriginal * tipoCambioFila).toFixed(2));
    }
    const fechaIso = fechaIsoFromMovimiento(row);
    const tasa =
      tcCtx && tcCtx.sortedAsc.length
        ? getTasaMepAnterior(fechaIso, tcCtx.sortedAsc, tcCtx.map)
        : null;
    if (tasa != null && tasa > 0) {
      return Number((montoOriginal * tasa).toFixed(2));
    }
    return null;
  }

  return montoOriginal;
}

function mesSortKey(mesAnio) {
  if (!mesAnio) return null;
  const p = String(mesAnio).split("/");
  if (p.length !== 2) return null;
  const [mm, yyyy] = p;
  return `${yyyy}-${String(mm).padStart(2, "0")}`;
}

/** Igual que dashboard / informe PDF: marzo 2026 fuera. */
function filaMovimientoMesNoCerrado(row) {
  const k = mesSortKey(row["Mes/Año"]);
  if (k === "2026-03") return true;
  const iso = fechaIsoFromMovimiento(row);
  if (iso && iso.startsWith("2026-03")) return true;
  return false;
}

function cuentaContableEsHornos(row) {
  return normalizeText(row["Cuenta Contable"]).toLowerCase() === "hornos";
}

const COLS_IMPORTE = new Set(["Monto", "Tipo de Cambio", "Monto en $"]);

function filaExtractoPlana(r, columnasOrden) {
  const o = {};
  for (const k of columnasOrden) {
    if (COLS_IMPORTE.has(k)) {
      const n = toNumber(r[k]);
      o[k] = n != null && Number.isFinite(n) ? n : null;
    } else {
      const v = r[k];
      o[k] = v === "" ? null : v;
    }
  }
  return o;
}

function motivoSinArs(row, tcCtx) {
  const moneda = inferCurrency(row);
  const montoOriginal = toNumber(row["Monto"]);
  const tipoCambioFila = toNumber(row["Tipo de Cambio"]);
  const montoArsCol = toNumber(row["Monto en $"]);
  if (montoArsCol != null) return "inconsistente (revisar)";
  if (moneda === "ARS" && montoOriginal == null) return "ARS sin Monto";
  if (moneda === "USD") {
    if (montoOriginal == null) return "USD sin Monto";
    if (tipoCambioFila != null && tipoCambioFila > 0) return "inconsistente USD+TC";
    const fechaIso = fechaIsoFromMovimiento(row);
    const tasa =
      tcCtx && tcCtx.sortedAsc.length
        ? getTasaMepAnterior(fechaIso, tcCtx.sortedAsc, tcCtx.map)
        : null;
    if (tasa == null) return "USD sin TC fila ni MEP en tabla";
  }
  return "sin monto ARS computable";
}

function montosConcilian(a, b) {
  if (
    a == null ||
    b == null ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  )
    return false;
  const diff = Math.abs(a - b);
  const tol = Math.max(2, Math.abs(b) * 0.002);
  return diff <= tol;
}

/**
 * Registros del extracto que el informe cuenta como compras (proxy Hornos).
 * @param {object[]} rawExt - sheet_to_json Movimientos (completo)
 * @param {(s: string) => string} normProveedor
 */
function procesarMovimientosComprasInformeHornos(rawExt, normProveedor) {
  const tcCtx = loadTipoCambioMepContext();
  const rowsLegacy = rawExt.map(rowToLegacyExtractoShape);
  const primera = rowsLegacy[0];
  const columnasOrden = primera ? Object.keys(primera) : [];

  const egresos = [];
  const filasEnSuma = [];
  const filasSinArs = [];
  let sinArs = 0;

  for (const r of rowsLegacy) {
    if (filaMovimientoMesNoCerrado(r)) continue;
    if (r["Estado"] === "Anulado") continue;
    if (["Apertura de Caja", "Cierre de Caja"].includes(r["Tipo"])) continue;
    if (normalizeText(r["Tipo"]) !== "Egreso") continue;
    if (!cuentaContableEsHornos(r)) continue;

    const m = montoArs(r, tcCtx);
    const fi = fechaIsoFromMovimiento(r);
    const cli = normProveedor(r["Cliente"]);
    const cat = normalizeText(r["Categoría"]);
    const monedaInf = inferCurrency(r);

    const base = filaExtractoPlana(r, columnasOrden);
    const extra = {
      fecha_iso: fi,
      cliente_norm: cli,
      moneda_inferida: monedaInf,
      categoria: cat,
      cuenta_contable: normalizeText(r["Cuenta Contable"]),
    };

    if (m == null || !Number.isFinite(m)) {
      sinArs += 1;
      filasSinArs.push({
        ...base,
        ...extra,
        monto_ars: null,
        motivo_omitido: motivoSinArs(r, tcCtx),
      });
      continue;
    }

    const mNum = Number(m);
    egresos.push({
      fecha_iso: fi,
      cliente_norm: cli,
      monto_ars: mNum,
      categoria: cat,
    });
    filasEnSuma.push({
      ...base,
      ...extra,
      monto_ars: mNum,
    });
  }

  const resumenMap = new Map();
  for (const f of filasEnSuma) {
    const k = `${f.fecha_iso}|${f.cliente_norm}`;
    if (!resumenMap.has(k)) {
      resumenMap.set(k, {
        fecha_iso: f.fecha_iso,
        cliente_norm: f.cliente_norm,
        cliente_extracto: f.Cliente ?? null,
        suma_monto_ars: 0,
        n_movimientos: 0,
      });
    }
    const g = resumenMap.get(k);
    g.suma_monto_ars += f.monto_ars;
    g.n_movimientos += 1;
  }
  const resumenDiaCliente = Array.from(resumenMap.values()).sort((a, b) => {
    const fa = a.fecha_iso || "";
    const fb = b.fecha_iso || "";
    if (fa !== fb) return fa.localeCompare(fb);
    return String(a.cliente_norm).localeCompare(String(b.cliente_norm));
  });
  for (const row of resumenDiaCliente) {
    row.suma_monto_ars = Number(row.suma_monto_ars.toFixed(2));
  }

  return {
    egresos,
    filasEnSuma,
    filasSinArs,
    sinArs,
    resumenDiaCliente,
    tcFuente: tcCtx.label,
  };
}

module.exports = {
  procesarMovimientosComprasInformeHornos,
  montosConcilian,
  cuentaContableEsHornos,
  filaMovimientoMesNoCerrado,
  loadTipoCambioMepContext,
};
