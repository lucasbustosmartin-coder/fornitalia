#!/usr/bin/env node
/**
 * Análisis financiero desde docs/Fornitalia_Movimientos.xlsx (hoja Movimientos;
 * fallback Extracto-Fornitalia.xlsx). Genera HTML + PDF en docs/.
 *
 * Uso: node scripts/generar-analisis-financiero-pdf.js
 *      npm run analisis-financiero-pdf
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
const XLSX = require("xlsx");
const { resolveMovimientosXlsxPath } = require("./lib/fornitalia-docs-paths");
const { rowToLegacyExtractoShape } = require("./lib/fornitalia-movimiento-row-canon");
const { monedaPorMedioFornitalia } = require("./lib/fornitalia-moneda-por-medio");

const root = path.join(__dirname, "..");
const OUT_HTML = path.join(
  root,
  "docs",
  "ANALISIS_FINANCIERO_EXTRACTO_FORNITALIA.html"
);
const OUT_PDF = path.join(
  root,
  "docs",
  "ANALISIS_FINANCIERO_EXTRACTO_FORNITALIA.pdf"
);

const TC_SQL_DOCS = path.join(root, "docs", "tipos_cambio_global_rows.sql");
const TC_CSV_DOCS = path.join(root, "docs", "tipos_cambio_global_rows.csv");
const TC_CSV_ROOT = path.join(root, "tipos_cambio_global_rows.csv");

/** Igual criterio que el dashboard: % del G/P acumulado (solo flujo ARS) sobre el que aplica la tasa diaria de caución. */
const PCT_CAUCION_INFORME = 95;

function loadSerieCaucionesPdf(baseDir) {
  const p = path.join(baseDir, "serie_cauciones.json");
  if (!fs.existsSync(p)) {
    return { map: {}, sortedAsc: [], pathRel: "serie_cauciones.json", ok: false };
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const tasas = j.tasas && typeof j.tasas === "object" ? j.tasas : {};
    const sortedAsc = Object.keys(tasas).sort();
    return { map: tasas, sortedAsc, pathRel: "serie_cauciones.json", ok: sortedAsc.length > 0 };
  } catch {
    return { map: {}, sortedAsc: [], pathRel: "serie_cauciones.json", ok: false };
  }
}

/**
 * Fracción diaria aplicable a capital (ej. 0,00074). En `Serie_Cauciones.xlsx` (SheetJS raw) ya viene así.
 * `serie_cauciones.json` antiguos guardaban ~TNA%/365 sin ÷100 (valores ~0,03–0,35): se corrige dividiendo por 100.
 * Umbral 0,02: una tasa diaria real >2 %/día como fracción sería anómala; evita falsear Excel correcto (~1e-3).
 */
function normalizeTasaCaucionDiariaPdf(t) {
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return 0;
  return t > 0.02 ? t / 100 : t;
}

function getTasaCaucionPdf(fechaIso, sortedAsc, map) {
  if (!fechaIso || !sortedAsc.length) return 0;
  const idx = sortedAsc.findIndex((d) => d > fechaIso);
  const i =
    idx === -1 ? sortedAsc.length - 1 : idx === 0 ? -1 : idx - 1;
  if (i < 0) return 0;
  const t = map[sortedAsc[i]];
  if (typeof t !== "number" || t < 0) return 0;
  return normalizeTasaCaucionDiariaPdf(t);
}

/**
 * Oportunidad de inversión no realizada (caución): misma base que el dashboard (v1.47+).
 * Solo Ingreso/Egreso operativos, `!esTransaccionUSD` (no solo inferCurrency ARS), sin traspasos;
 * importe en pesos como `montoConvertido` en ARS para filas no USD (Monto en $ / Monto).
 */
function computeCaucionOportunidadPdf(operativos, monthKeys, pctCaucion) {
  const serie = loadSerieCaucionesPdf(root);
  const deltasPorFecha = {};
  for (const r of operativos) {
    const tipo = r["Tipo"];
    if (tipo !== "Ingreso" && tipo !== "Egreso") continue;
    if (esTransaccionUSDPdf(r)) continue;
    const cat = normalizeText(r["Categoría"]);
    if (esCategoriaTraspasoInterno(cat)) continue;
    const iso = fechaIsoFromMovimiento(r);
    if (!iso) continue;
    const m = montoPesosCaucionPdf(r);
    if (m == null || !Number.isFinite(m)) continue;
    const delta = tipo === "Ingreso" ? m : -m;
    deltasPorFecha[iso] = (deltasPorFecha[iso] || 0) + delta;
  }
  const fechasOrdenadas = Object.keys(deltasPorFecha).sort();
  const intPorMes = {};
  let gpAcumulado = 0;
  let intAcumuladoAnterior = 0;
  for (const fecha of fechasOrdenadas) {
    gpAcumulado += deltasPorFecha[fecha];
    const base = (gpAcumulado * pctCaucion) / 100 + intAcumuladoAnterior;
    const tasa = getTasaCaucionPdf(fecha, serie.sortedAsc, serie.map);
    const intDia = base > 0 ? base * tasa : 0;
    const mk = fecha.slice(0, 7);
    intPorMes[mk] = (intPorMes[mk] || 0) + intDia;
    intAcumuladoAnterior += intDia;
  }
  const rows = monthKeys.map((k) => ({
    monthKey: k,
    intMes: intPorMes[k] || 0,
  }));
  const total = rows.reduce((s, x) => s + x.intMes, 0);
  return {
    rows,
    total,
    pctCaucion,
    serieOk: serie.ok,
    seriePath: serie.pathRel,
    nDiasConMov: fechasOrdenadas.length,
  };
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

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Misma regla que `reglaNegocioMonedaSiempreARS` en el dashboard (MP / Morba + typo morva). */
function reglaNegocioMonedaSiempreARSPdf(row) {
  const medioRaw = row["Medio de Pago"];
  const medio = normalizeText(medioRaw).toLowerCase();
  const medioC = medio.replace(/\s+/g, "");
  const blob = [
    medioRaw,
    row["Descripción"],
    row["Observaciones"],
    row["Cuenta Contable"],
    row["Categoría"],
    row["cat_desc"],
  ]
    .map(normalizeText)
    .join(" ")
    .toLowerCase();
  const blobC = blob.replace(/\s+/g, "");
  if (
    medioC.includes("mercadopago") ||
    (medio.includes("mercado") && medio.includes("pago"))
  ) {
    return true;
  }
  if (medio.includes("morba") || medio.includes("morva")) return true;
  if (
    blobC.includes("mercadopago") ||
    /\bmercado\s+pago\b/.test(blob)
  ) {
    return true;
  }
  if (blob.includes("morba") || blob.includes("morva")) return true;
  return false;
}

function esMonedaUSDDesdeMedioPdf(medioPago) {
  const m = normalizeText(medioPago).toLowerCase();
  return m.includes("dolar") || m.includes("dólar");
}

/**
 * Equivalente a `esTransaccionUSD(r)` del dashboard (caución y flujo ARS nativo).
 * Usa maestro medio→moneda, reglas MP/Morba, columna Moneda del export y texto de contexto.
 */
function esTransaccionUSDPdf(row) {
  const porMedio = monedaPorMedioFornitalia(row["Medio de Pago"]);
  if (porMedio === "USD") return true;
  if (porMedio === "ARS") return false;
  if (reglaNegocioMonedaSiempreARSPdf(row)) return false;
  const m = normalizeText(row["Moneda"]).toUpperCase();
  if (m === "USD") return true;
  if (m === "ARS") return false;
  const blob = [
    row["Medio de Pago"],
    row["Descripción"],
    row["Observaciones"],
    row["Cuenta Contable"],
    row["Categoría"],
    row["cat_desc"],
  ]
    .map(normalizeText)
    .join(" ")
    .toLowerCase();
  if (/\b(u\$s|usd|us\$|dolar|dólar)\b/.test(blob)) return true;
  if (esMonedaUSDDesdeMedioPdf(row["Medio de Pago"])) return true;
  return false;
}

/**
 * Pesos para caución: igual orden que `montoConvertido(r,'ARS')` cuando la fila no es USD
 * (solo aplica a filas ya filtradas con `!esTransaccionUSDPdf`).
 */
function montoPesosCaucionPdf(row) {
  const mcRaw = row["Monto en $"];
  if (mcRaw != null && mcRaw !== "") {
    const mc = toNumber(mcRaw);
    if (mc != null && Number.isFinite(mc)) return mc;
  }
  const m = toNumber(row["Monto"]);
  return m != null && Number.isFinite(m) ? m : null;
}

/** Moneda de origen: primero el maestro por medio (`fornitalia-moneda-por-medio.js`); si no aplica, inferencia por contexto. */
function inferCurrency(row) {
  const medioRaw = row["Medio de Pago"];
  const porMedio = monedaPorMedioFornitalia(medioRaw);
  if (porMedio) return porMedio;
  const medio = normalizeText(medioRaw).toLowerCase();
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
  if (medio.includes("morba") || medio.includes("morva")) return "ARS";
  if (
    medioCompact.includes("mercadopago") ||
    /\bmercado\s+pago\b/.test(blob)
  ) {
    return "ARS";
  }
  if (blob.includes("morba") || blob.includes("morva")) return "ARS";
  if (
    medio.includes("dolar") ||
    medio.includes("dólar") ||
    /\b(u\$s|usd|us\$|dolar|dólar)\b/.test(blob)
  ) {
    return "USD";
  }
  return "ARS";
}

/** Transferencia / Deposito(s): traspasos internos (misma lógica que el dashboard). */
function esCategoriaTraspasoInterno(cat) {
  const t = normalizeText(cat);
  if (t === "Transferencia") return true;
  const s = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return s === "deposito";
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

/** Carga usd_mep por fecha: prioriza SQL en docs (export Supabase), luego CSV en docs, luego CSV en raíz. */
function loadTipoCambioMepContext() {
  if (fs.existsSync(TC_SQL_DOCS)) {
    const map = parseTiposCambioSql(TC_SQL_DOCS);
    if (map.size) {
      return {
        map,
        sortedAsc: [...map.keys()].sort(),
        label: "docs/tipos_cambio_global_rows.sql (columna usd_mep)",
      };
    }
  }
  if (fs.existsSync(TC_CSV_DOCS)) {
    const map = loadTcFromCsv(TC_CSV_DOCS);
    if (map.size) {
      return {
        map,
        sortedAsc: [...map.keys()].sort(),
        label: "docs/tipos_cambio_global_rows.csv (usd_mep)",
      };
    }
  }
  if (fs.existsSync(TC_CSV_ROOT)) {
    const map = loadTcFromCsv(TC_CSV_ROOT);
    if (map.size) {
      return {
        map,
        sortedAsc: [...map.keys()].sort(),
        label: "tipos_cambio_global_rows.csv en raíz (usd_mep)",
      };
    }
  }
  return { map: new Map(), sortedAsc: [], label: null };
}

/** Fecha del movimiento como YYYY-MM-DD (desde columna Fecha dd/mm/aaaa del extracto). */
function fechaIsoFromMovimiento(row) {
  const t = normalizeText(row["Fecha"]);
  const p = t.split("/");
  if (p.length !== 3) return null;
  const [dd, mm, yyyy] = p;
  if (!yyyy || !mm || !dd) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Última cotización MEP con fecha &lt;= fechaIso (igual criterio “fecha anterior” que el dashboard). */
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

/**
 * ARS equivalente: respeta “Monto en $” del extracto; si USD, usa Tipo de Cambio de fila si viene;
 * si no, usa usd_mep de la tabla cargada para la fecha del movimiento (o última fecha disponible anterior).
 */
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

/** Mes abierto / no cerrado: fuera del análisis (misma regla que el dashboard). */
function filaMovimientoMesNoCerrado(row) {
  const k = mesSortKey(row["Mes/Año"]);
  if (k === "2026-03") return true;
  const iso = fechaIsoFromMovimiento(row);
  if (iso && iso.startsWith("2026-03")) return true;
  return false;
}

function parseFecha(ddmmyyyy) {
  const t = normalizeText(ddmmyyyy);
  const p = t.split("/");
  if (p.length !== 3) return null;
  const [dd, mm, yyyy] = p;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

const NOMBRE_DIA_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/** Orden Lun→Dom para tablas de negocio (índices getDay(): 0=Dom … 6=Sáb). */
const INDICES_LUNES_A_DOMINGO = [1, 2, 3, 4, 5, 6, 0];

/** Hora 0–23 desde celda Excel (texto HH:MM o fracción de día). */
function parseHoraDesdeCelda(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number" && val >= 0 && val < 1) {
    const mins = Math.round(val * 24 * 60);
    return Math.min(23, Math.floor(mins / 60) % 24);
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

function franjaHoraria(h) {
  if (h == null) return "Sin hora informada";
  if (h < 6) return "00:00–05:59 (madrugada)";
  if (h < 12) return "06:00–11:59 (mañana)";
  if (h < 18) return "12:00–17:59 (tarde)";
  return "18:00–23:59 (noche)";
}

function esIngresoCategoriaVentas(row) {
  if (normalizeText(row["Tipo"]) !== "Ingreso") return false;
  const c = normalizeText(row["Categoría"]).toLowerCase();
  return c === "ventas";
}

/** Semana dentro del mes calendario (fecha ya parseada en hora local). 0 = 1–7, 1 = 8–14, 2 = 15–21, 3 = 22–fin. */
function semanaDelMesIndex(fecha) {
  const dd = fecha.getDate();
  if (dd >= 1 && dd <= 7) return 0;
  if (dd <= 14) return 1;
  if (dd <= 21) return 2;
  return 3;
}

const ETIQUETAS_SEMANA_MES = [
  "Semana 1 (días 1–7)",
  "Semana 2 (días 8–14)",
  "Semana 3 (días 15–21)",
  "Semana 4 (días 22 a fin de mes)",
];

/** Cuenta contable “Hornos” (insensible a mayúsculas). Proxy de compras de mercadería en el extracto actual. */
function cuentaContableEsHornos(row) {
  return normalizeText(row["Cuenta Contable"]).toLowerCase() === "hornos";
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtARS(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function fmtUSD(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Último día del mes calendario para una clave `yyyy-mm` (misma convención que `monthKeys` del informe). */
function endDateForMonthKey(monthKey) {
  const p = String(monthKey).split("-");
  if (p.length !== 2) return null;
  const y = Number(p[0]);
  const m = Number(p[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return new Date(y, m, 0);
}

const SALDO_CAJA_MAX_MEDIOS = 15;

/**
 * Pesos del extracto para filas tratadas como ARS en este bloque: **sin** conversión (no MEP, no Tipo de Cambio).
 * Orden: columna **Monto**; si falta, **Monto en $** (mismo criterio “nativo libro”, no equivalente USD→ARS).
 */
function montoNativoArsSinConversion(row) {
  const mMonto = toNumber(row["Monto"]);
  if (mMonto != null && Number.isFinite(mMonto)) return mMonto;
  const mPesos = toNumber(row["Monto en $"]);
  if (mPesos != null && Number.isFinite(mPesos)) return mPesos;
  return null;
}

/**
 * Flujos Ingreso/Egreso: **ARS** solo con importes en pesos nativos del extracto; **USD** solo con **Monto** en dólares.
 * `inferCurrency` ya aplica el maestro “caja → moneda” y luego el fallback por contexto.
 */
function buildFlowsSaldoCajaPorMoneda(operativos) {
  const ars = [];
  const usd = [];
  for (const r of operativos) {
    const tipo = r["Tipo"];
    if (tipo !== "Ingreso" && tipo !== "Egreso") continue;
    const d = parseFecha(r["Fecha"]);
    if (!d) continue;
    const medio = normalizeText(r["Medio de Pago"]) || "(sin medio)";
    const moneda = inferCurrency(r);
    if (moneda === "ARS") {
      const m = montoNativoArsSinConversion(r);
      if (m == null || !Number.isFinite(m)) continue;
      const delta = tipo === "Ingreso" ? m : -m;
      ars.push({ d, medio, delta });
    } else if (moneda === "USD") {
      const m = toNumber(r["Monto"]);
      if (m == null || !Number.isFinite(m)) continue;
      const delta = tipo === "Ingreso" ? m : -m;
      usd.push({ d, medio, delta });
    }
  }
  ars.sort((a, b) => a.d - b.d);
  usd.sort((a, b) => a.d - b.d);
  return { ars, usd };
}

/** Snapshots acumulados al cierre de cada mes (incluye todos los movimientos hasta el último día del mes). */
function snapshotsSaldoPorMes(sortedFlows, sortedMonthKeys) {
  let i = 0;
  const running = new Map();
  const out = [];
  for (const mk of sortedMonthKeys) {
    const end = endDateForMonthKey(mk);
    if (!end) continue;
    while (i < sortedFlows.length && sortedFlows[i].d <= end) {
      const { medio, delta } = sortedFlows[i];
      running.set(medio, (running.get(medio) || 0) + delta);
      i++;
    }
    out.push({ monthKey: mk, balances: new Map(running) });
  }
  return out;
}

function pickMediosSaldoCajaColumns(snapshots, maxMedios) {
  const scores = new Map();
  for (const sn of snapshots) {
    for (const [medio, bal] of sn.balances) {
      const a = Math.abs(bal);
      scores.set(medio, Math.max(scores.get(medio) || 0, a));
    }
  }
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, maxMedios).map(([m]) => m);
  const topSet = new Set(top);
  return { top, topSet, hasRest: sorted.length > maxMedios };
}

/**
 * @param {{ monthKey: string, balances: Map<string, number> }[]} snapshots
 * @param {(n: number) => string} fmt
 */
function htmlTablaSaldoCajaPorMes(snapshots, fmt) {
  if (!snapshots.length) {
    return "<p><em>No hay meses en el período para armar la serie.</em></p>";
  }
  const { top, topSet, hasRest } = pickMediosSaldoCajaColumns(
    snapshots,
    SALDO_CAJA_MAX_MEDIOS
  );

  function totalRow(balances) {
    let t = 0;
    for (const v of balances.values()) t += v;
    return t;
  }

  function otrosMedios(balances) {
    let o = 0;
    for (const [medio, v] of balances) {
      if (!topSet.has(medio)) o += v;
    }
    return o;
  }

  const headExtra = hasRest
    ? `<th>Otros medios (${SALDO_CAJA_MAX_MEDIOS} principales en columnas)</th>`
    : "";
  const thMedios = top
    .map((m) => `<th>${esc(m)}</th>`)
    .join("");
  const thead = `<thead><tr><th>Mes (cierre)</th>${thMedios}${headExtra}<th>Total (todos los medios)</th></tr></thead>`;

  const body = snapshots
    .map((sn) => {
      const label = sn.monthKey.replace(/^(\d{4})-(\d{2})$/, "$2/$1");
      const cells = top
        .map((m) => {
          const v = sn.balances.get(m) || 0;
          return `<td class="num">${fmt(v)}</td>`;
        })
        .join("");
      const restCell = hasRest
        ? `<td class="num">${fmt(otrosMedios(sn.balances))}</td>`
        : "";
      const tot = totalRow(sn.balances);
      return `<tr><td>${esc(label)}</td>${cells}${restCell}<td class="num"><strong>${fmt(tot)}</strong></td></tr>`;
    })
    .join("");

  return `<table>${thead}<tbody>${body}</tbody></table>`;
}

function fmtPct(x) {
  if (x === null || Number.isNaN(x)) return "—";
  return `${x.toFixed(1)} %`;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function loadAndAnalyze() {
  const inputPath = resolveMovimientosXlsxPath();
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No se encontró el libro de movimientos: ${inputPath}`);
  }
  const wb = XLSX.readFile(inputPath);
  const sheet = wb.Sheets["Movimientos"];
  if (!sheet) throw new Error('Falta hoja "Movimientos".');
  const rawSheetRaw = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const rawSheet = rawSheetRaw.map(rowToLegacyExtractoShape);
  const filasExcluidasMesNoCerrado = rawSheet.filter((r) =>
    filaMovimientoMesNoCerrado(r)
  ).length;
  const raw = rawSheet.filter((r) => !filaMovimientoMesNoCerrado(r));

  const totalFilas = raw.length;
  const anulados = raw.filter((r) => r["Estado"] === "Anulado").length;
  const aperturaCierre = raw.filter((r) =>
    ["Apertura de Caja", "Cierre de Caja"].includes(r["Tipo"])
  ).length;

  const operativos = raw.filter(
    (r) =>
      r["Estado"] !== "Anulado" &&
      !["Apertura de Caja", "Cierre de Caja"].includes(r["Tipo"])
  );

  let minD = null;
  let maxD = null;
  for (const r of operativos) {
    const d = parseFecha(r["Fecha"]);
    if (!d) continue;
    if (!minD || d < minD) minD = d;
    if (!maxD || d > maxD) maxD = d;
  }

  const tcCtx = loadTipoCambioMepContext();
  let filasExcluidasSinArs = 0;

  const byMonth = {};
  const byMonthOp = {};
  const byCat = {};
  const byMedio = { Ingreso: {}, Egreso: {} };
  let totalIng = 0;
  let totalEg = 0;
  let ingOp = 0;
  let egOp = 0;

  for (const r of operativos) {
    const m = montoArs(r, tcCtx);
    if (m == null || !Number.isFinite(m)) {
      if (inferCurrency(r) === "USD") filasExcluidasSinArs += 1;
      continue;
    }
    const cat = normalizeText(r["Categoría"]) || "(vacía)";
    const tipo = r["Tipo"];
    const mesK = mesSortKey(r["Mes/Año"]);
    const medio = normalizeText(r["Medio de Pago"]) || "(sin medio)";

    if (tipo === "Ingreso") totalIng += m;
    else if (tipo === "Egreso") totalEg += m;

    if (!byCat[cat]) byCat[cat] = { ing: 0, eg: 0, n: 0 };
    byCat[cat].n += 1;
    if (tipo === "Ingreso") byCat[cat].ing += m;
    else if (tipo === "Egreso") byCat[cat].eg += m;

    if (mesK) {
      if (!byMonth[mesK]) byMonth[mesK] = { ing: 0, eg: 0, net: 0, n: 0 };
      byMonth[mesK].n += 1;
      if (tipo === "Ingreso") {
        byMonth[mesK].ing += m;
        byMonth[mesK].net += m;
      } else if (tipo === "Egreso") {
        byMonth[mesK].eg += m;
        byMonth[mesK].net -= m;
      }
    }

    if (!esCategoriaTraspasoInterno(cat)) {
      if (tipo === "Ingreso") ingOp += m;
      else if (tipo === "Egreso") egOp += m;
      if (mesK) {
        if (!byMonthOp[mesK])
          byMonthOp[mesK] = { ing: 0, eg: 0, net: 0, n: 0 };
        byMonthOp[mesK].n += 1;
        if (tipo === "Ingreso") {
          byMonthOp[mesK].ing += m;
          byMonthOp[mesK].net += m;
        } else if (tipo === "Egreso") {
          byMonthOp[mesK].eg += m;
          byMonthOp[mesK].net -= m;
        }
      }
    }

    if (tipo === "Ingreso" || tipo === "Egreso") {
      const bucket = byMedio[tipo];
      bucket[medio] = (bucket[medio] || 0) + m;
    }
  }

  const monthKeys = Object.keys(byMonth).sort();
  const nets = monthKeys.map((k) => byMonth[k].net);
  const netsOp = monthKeys.map((k) => (byMonthOp[k] ? byMonthOp[k].net : 0));

  const sortedNets = [...netsOp].sort((a, b) => a - b);
  const q1 = quantile(sortedNets, 0.25);
  const q3 = quantile(sortedNets, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  const outliers = monthKeys.filter((k, i) => {
    const n = netsOp[i];
    return n < low || n > high;
  });

  const cv = mean(netsOp) !== 0 ? stdev(netsOp) / Math.abs(mean(netsOp)) : 0;

  const impEg = byCat["Impuestos"] ? byCat["Impuestos"].eg : 0;
  const ventasIng = byCat["Ventas"] ? byCat["Ventas"].ing : 0;
  const sueEg = byCat["Sueldos"] ? byCat["Sueldos"].eg : 0;

  const sinCategoria = raw.filter(
    (r) => r["Estado"] !== "Anulado" && !normalizeText(r["Categoría"])
  ).length;
  const cuentaGuion = raw.filter(
    (r) =>
      r["Estado"] !== "Anulado" &&
      (r["Cuenta Contable"] === "-" || r["Cuenta Contable"] === null)
  ).length;

  const mayJunSinEgresos = monthKeys.filter((k) => {
    const x = byMonth[k];
    return (k.startsWith("2025-05") || k.startsWith("2025-06")) && x.eg === 0;
  });

  const topEg = Object.entries(byCat)
    .map(([k, v]) => [k, v.eg])
    .filter(([, eg]) => eg > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topIng = Object.entries(byCat)
    .map(([k, v]) => [k, v.ing])
    .filter(([, ing]) => ing > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const mediosEg = Object.entries(byMedio["Egreso"]).sort(
    (a, b) => b[1] - a[1]
  );

  /* --- Análisis específico de ventas (categoría "Ventas", tipo Ingreso) --- */
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const bySemanaMes = [0, 0, 0, 0];
  const ventasByMonthSemana = {};
  const byFranja = {};
  const byUsuario = {};
  const byCliente = {};
  const ventasByMonth = {};
  let totalVentasArs = 0;
  let nVentas = 0;
  let ventasSinHora = 0;
  let ventasSinUsuario = 0;

  for (const r of operativos) {
    if (!esIngresoCategoriaVentas(r)) continue;
    const m = montoArs(r, tcCtx);
    if (m == null || !Number.isFinite(m)) continue;
    totalVentasArs += m;
    nVentas += 1;
    if (!normalizeText(r["Usuario"])) ventasSinUsuario += 1;

    const d = parseFecha(r["Fecha"]);
    if (d) {
      const wd = d.getDay();
      byWeekday[wd] += m;
      const si = semanaDelMesIndex(d);
      bySemanaMes[si] += m;
    }

    const h = parseHoraDesdeCelda(r["Hora"]);
    if (h == null) ventasSinHora += 1;
    const fr = franjaHoraria(h);
    byFranja[fr] = (byFranja[fr] || 0) + m;

    const usr = normalizeText(r["Usuario"]);
    const claveUsr = usr || "(sin usuario en extracto)";
    byUsuario[claveUsr] = (byUsuario[claveUsr] || 0) + m;

    const cli = normalizeText(r["Cliente"]) || "(sin cliente)";
    byCliente[cli] = (byCliente[cli] || 0) + m;

    const mesK = mesSortKey(r["Mes/Año"]);
    if (mesK) {
      if (!ventasByMonth[mesK]) ventasByMonth[mesK] = { total: 0, n: 0 };
      ventasByMonth[mesK].total += m;
      ventasByMonth[mesK].n += 1;
      if (d) {
        const si = semanaDelMesIndex(d);
        if (!ventasByMonthSemana[mesK]) {
          ventasByMonthSemana[mesK] = [0, 0, 0, 0];
        }
        ventasByMonthSemana[mesK][si] += m;
      }
    }
  }

  const ventasMonthKeys = Object.keys(ventasByMonth).sort();
  const ventasMensuales = ventasMonthKeys.map((k) => ventasByMonth[k].total);
  const cvVentas =
    ventasMensuales.length >= 2 && mean(ventasMensuales) !== 0
      ? stdev(ventasMensuales) / Math.abs(mean(ventasMensuales))
      : null;

  const mesKeysOp = Object.keys(byMonthOp).sort();
  const egOpMensuales = mesKeysOp.map(
    (k) => (byMonthOp[k] ? byMonthOp[k].eg : 0) || 0
  );
  const promEgOpMes = egOpMensuales.length ? mean(egOpMensuales) : 0;
  const sortedEg = [...egOpMensuales].sort((a, b) => a - b);
  const medianaEgOpMes = sortedEg.length ? quantile(sortedEg, 0.5) : 0;

  const ultimoMesVentasKey =
    ventasMonthKeys.length > 0
      ? ventasMonthKeys[ventasMonthKeys.length - 1]
      : null;
  const ventasUltimoMes = ultimoMesVentasKey
    ? ventasByMonth[ultimoMesVentasKey].total
    : 0;
  const egOpUltimoMes =
    ultimoMesVentasKey && byMonthOp[ultimoMesVentasKey]
      ? byMonthOp[ultimoMesVentasKey].eg
      : null;
  const cubreGastoUltimoMes =
    egOpUltimoMes != null && egOpUltimoMes > 0
      ? ventasUltimoMes >= egOpUltimoMes
      : null;

  const rankUsuarios = Object.entries(byUsuario)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const rankCliente = Object.entries(byCliente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const rankFranja = Object.entries(byFranja).sort((a, b) => b[1] - a[1]);

  let diaPicoIdx = 0;
  let diaPicoMonto = 0;
  for (let i = 0; i < 7; i++) {
    if (byWeekday[i] > diaPicoMonto) {
      diaPicoMonto = byWeekday[i];
      diaPicoIdx = i;
    }
  }

  let semanaPicoIdx = 0;
  let semanaPicoMonto = 0;
  for (let i = 0; i < 4; i++) {
    if (bySemanaMes[i] > semanaPicoMonto) {
      semanaPicoMonto = bySemanaMes[i];
      semanaPicoIdx = i;
    }
  }

  const ventas = {
    totalArs: totalVentasArs,
    nMov: nVentas,
    ticketPromedio: nVentas > 0 ? totalVentasArs / nVentas : 0,
    pctSobreIngBrutos:
      totalIng > 0 ? (100 * totalVentasArs) / totalIng : null,
    byWeekday,
    bySemanaMes,
    ventasByMonthSemana,
    semanaPicoIdx,
    semanaPicoMonto,
    semanaPicoNombre: ETIQUETAS_SEMANA_MES[semanaPicoIdx],
    pctUltimaSemanaMesGlobal:
      totalVentasArs > 0 ? (100 * bySemanaMes[3]) / totalVentasArs : null,
    byFranja,
    rankUsuarios,
    rankCliente,
    rankFranja,
    ventasMonthKeys,
    ventasByMonth,
    cvVentas,
    promEgOpMes,
    medianaEgOpMes,
    ultimoMesVentasKey,
    ventasUltimoMes,
    egOpUltimoMes,
    cubreGastoUltimoMes,
    ventasSinHora,
    ventasSinUsuario,
    pctSinUsuario: nVentas > 0 ? (100 * ventasSinUsuario) / nVentas : null,
    diaPicoIdx,
    diaPicoMonto,
    diaPicoNombre: NOMBRE_DIA_SEMANA[diaPicoIdx],
  };

  /* --- Compras mercadería / hornos (proxy: solo Egreso + cuenta Hornos) --- */
  let ingresosHornosExclN = 0;
  let ingresosHornosExclArs = 0;
  for (const r of operativos) {
    if (!cuentaContableEsHornos(r)) continue;
    if (normalizeText(r["Tipo"]) !== "Ingreso") continue;
    const m = montoArs(r, tcCtx);
    if (m == null || !Number.isFinite(m)) continue;
    ingresosHornosExclN += 1;
    ingresosHornosExclArs += m;
  }

  const byWeekdayH = [0, 0, 0, 0, 0, 0, 0];
  const byFranjaH = {};
  const byUsuarioH = {};
  const byClienteH = {};
  const byCatH = {};
  const comprasByMonth = {};
  let totalComprasHornosArs = 0;
  let nComprasHornos = 0;
  let comprasSinHora = 0;
  let comprasSinUsuario = 0;

  for (const r of operativos) {
    if (normalizeText(r["Tipo"]) !== "Egreso") continue;
    if (!cuentaContableEsHornos(r)) continue;
    const m = montoArs(r, tcCtx);
    if (m == null || !Number.isFinite(m)) continue;
    totalComprasHornosArs += m;
    nComprasHornos += 1;
    if (!normalizeText(r["Usuario"])) comprasSinUsuario += 1;

    const d = parseFecha(r["Fecha"]);
    if (d) {
      const wd = d.getDay();
      byWeekdayH[wd] += m;
    }

    const h = parseHoraDesdeCelda(r["Hora"]);
    if (h == null) comprasSinHora += 1;
    const fr = franjaHoraria(h);
    byFranjaH[fr] = (byFranjaH[fr] || 0) + m;

    const usr = normalizeText(r["Usuario"]);
    const claveUsr = usr || "(sin usuario en extracto)";
    byUsuarioH[claveUsr] = (byUsuarioH[claveUsr] || 0) + m;

    const cli = normalizeText(r["Cliente"]) || "(sin cliente / proveedor)";
    byClienteH[cli] = (byClienteH[cli] || 0) + m;

    const catG = normalizeText(r["Categoría"]) || "(sin categoría)";
    byCatH[catG] = (byCatH[catG] || 0) + m;

    const mesK = mesSortKey(r["Mes/Año"]);
    if (mesK) {
      if (!comprasByMonth[mesK]) comprasByMonth[mesK] = { total: 0, n: 0 };
      comprasByMonth[mesK].total += m;
      comprasByMonth[mesK].n += 1;
    }
  }

  const comprasMonthKeys = Object.keys(comprasByMonth).sort();
  const comprasMensuales = comprasMonthKeys.map((k) => comprasByMonth[k].total);
  const cvComprasHornos =
    comprasMensuales.length >= 2 && mean(comprasMensuales) !== 0
      ? stdev(comprasMensuales) / Math.abs(mean(comprasMensuales))
      : null;

  const rankUsuariosH = Object.entries(byUsuarioH)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const rankClienteH = Object.entries(byClienteH)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const rankFranjaH = Object.entries(byFranjaH).sort((a, b) => b[1] - a[1]);
  const rankCatH = Object.entries(byCatH).sort((a, b) => b[1] - a[1]);

  let diaPicoIdxH = 0;
  let diaPicoMontoH = 0;
  for (let i = 0; i < 7; i++) {
    if (byWeekdayH[i] > diaPicoMontoH) {
      diaPicoMontoH = byWeekdayH[i];
      diaPicoIdxH = i;
    }
  }

  const mesesComprasVsVentas = [
    ...new Set([...comprasMonthKeys, ...ventasMonthKeys]),
  ].sort();

  const { ars: flowsSaldoArs, usd: flowsSaldoUsd } =
    buildFlowsSaldoCajaPorMoneda(operativos);
  const saldoCaja = {
    snapshotsArs: snapshotsSaldoPorMes(flowsSaldoArs, monthKeys),
    snapshotsUsd: snapshotsSaldoPorMes(flowsSaldoUsd, monthKeys),
    nFlowsArs: flowsSaldoArs.length,
    nFlowsUsd: flowsSaldoUsd.length,
  };

  const caucionOportunidad = computeCaucionOportunidadPdf(
    operativos,
    monthKeys,
    PCT_CAUCION_INFORME
  );

  const comprasHornos = {
    totalArs: totalComprasHornosArs,
    nMov: nComprasHornos,
    ticketPromedio:
      nComprasHornos > 0 ? totalComprasHornosArs / nComprasHornos : 0,
    pctSobreEgresosBrutos:
      totalEg > 0 ? (100 * totalComprasHornosArs) / totalEg : null,
    pctSobreEgresosOperativos:
      egOp > 0 ? (100 * totalComprasHornosArs) / egOp : null,
    ratioComprasHornosSobreVentasPeriodo:
      totalVentasArs > 0 ? totalComprasHornosArs / totalVentasArs : null,
    byWeekday: byWeekdayH,
    rankFranja: rankFranjaH,
    rankUsuarios: rankUsuariosH,
    rankCliente: rankClienteH,
    rankCategoria: rankCatH,
    comprasMonthKeys,
    comprasByMonth,
    mesesComprasVsVentas,
    cvCompras: cvComprasHornos,
    comprasSinHora,
    comprasSinUsuario,
    pctSinUsuario:
      nComprasHornos > 0 ? (100 * comprasSinUsuario) / nComprasHornos : null,
    diaPicoIdx: diaPicoIdxH,
    diaPicoMonto: diaPicoMontoH,
    diaPicoNombre: NOMBRE_DIA_SEMANA[diaPicoIdxH],
    ingresosHornosExcluidos: {
      n: ingresosHornosExclN,
      totalArs: ingresosHornosExclArs,
    },
  };

  return {
    meta: {
      generado: new Date().toISOString(),
      archivo: path.basename(inputPath),
      totalFilas,
      anulados,
      aperturaCierre,
      nOperativos: operativos.length,
      minD,
      maxD,
      tcMepLabel: tcCtx.label,
      tcMepFechas: tcCtx.map.size,
      filasExcluidasSinArs,
      filasExcluidasMesNoCerrado,
    },
    totals: {
      totalIng,
      totalEg,
      net: totalIng - totalEg,
      ingOp,
      egOp,
      netOp: ingOp - egOp,
    },
    shares: {
      impVsEg: totalEg > 0 ? (100 * impEg) / totalEg : null,
      ventasVsIng: totalIng > 0 ? (100 * ventasIng) / totalIng : null,
      sueVsEg: totalEg > 0 ? (100 * sueEg) / totalEg : null,
    },
    byMonth,
    byMonthOp,
    monthKeys,
    nets,
    netsOp,
    stats: { q1, q3, iqr, low, high, outliers, cv, median: quantile(sortedNets, 0.5) },
    topEg,
    topIng,
    mediosEg,
    calidad: { sinCategoria, cuentaGuion },
    flags: { mayJunSinEgresos },
    absImpEg: impEg,
    absVentasIng: ventasIng,
    absSueEg: sueEg,
    ventas,
    comprasHornos,
    saldoCaja,
    caucionOportunidad,
  };
}

function buildHtml(a) {
  const {
    meta,
    totals,
    shares,
    byMonth,
    byMonthOp,
    monthKeys,
    stats,
    topEg,
    topIng,
    mediosEg,
    calidad,
    flags,
    ventas: v,
    comprasHornos: ch,
    saldoCaja: sc,
    caucionOportunidad: co,
  } = a;
  const periodo =
    meta.minD && meta.maxD
      ? `${meta.minD.toLocaleDateString("es-AR")} — ${meta.maxD.toLocaleDateString("es-AR")}`
      : "—";

  const rowsMonth = monthKeys
    .map((k) => {
      const x = byMonth[k];
      const o = byMonthOp[k] || { ing: 0, eg: 0, net: 0 };
      const label = k.replace(/^(\d{4})-(\d{2})$/, "$2/$1");
      const warn = x.eg === 0 && x.ing > 0 ? " ⚠" : "";
      return `<tr><td>${esc(label)}</td><td class="num">${fmtARS(x.ing)}</td><td class="num">${fmtARS(x.eg)}</td><td class="num">${fmtARS(x.net)}</td><td class="num">${fmtARS(o.net)}</td><td>${x.n}</td><td>${warn}</td></tr>`;
    })
    .join("");

  const rowsTopEg = topEg
    .map(
      ([c, v]) =>
        `<tr><td>${esc(c)}</td><td class="num">${fmtARS(v)}</td><td class="num">${fmtPct(totals.totalEg > 0 ? (100 * v) / totals.totalEg : null)}</td></tr>`
    )
    .join("");

  const rowsTopIng = topIng
    .map(
      ([c, v]) =>
        `<tr><td>${esc(c)}</td><td class="num">${fmtARS(v)}</td><td class="num">${fmtPct(totals.totalIng > 0 ? (100 * v) / totals.totalIng : null)}</td></tr>`
    )
    .join("");

  const rowsMedios = mediosEg
    .slice(0, 6)
    .map(
      ([m, mv]) =>
        `<tr><td>${esc(m)}</td><td class="num">${fmtARS(mv)}</td><td class="num">${fmtPct(totals.totalEg > 0 ? (100 * mv) / totals.totalEg : null)}</td></tr>`
    )
    .join("");

  const rowsCaucion =
    co.rows && co.rows.length
      ? co.rows
          .map((row) => {
            const label = row.monthKey.replace(/^(\d{4})-(\d{2})$/, "$2/$1");
            return `<tr><td>${esc(label)}</td><td class="num">${fmtARS(row.intMes)}</td></tr>`;
          })
          .join("")
      : "";

  const bloqueCaucionHtml = `<p><strong>Qué mide:</strong> interés <em>no registrado en el extracto</em> que resultaría de aplicar la <strong>tasa diaria</strong> de la serie de cauciones sobre el <strong>${co.pctCaucion}%</strong> del <strong>G/P acumulado</strong> día a día, con el <strong>mismo criterio que el dashboard</strong>: excluye filas tratadas como USD (<code>esTransaccionUSD</code>: maestro caja→moneda, columna <strong>Moneda</strong> del export cuando existe, MP/Morba siempre ARS, texto); importe en pesos como en la app (<strong>Monto en $</strong> / <strong>Monto</strong>); sin traspasos internos. Montos en <strong>ARS</strong> (tasas en ARS). Fuente: archivo <code>${esc(co.seriePath)}</code> en la raíz del repositorio.${co.serieOk ? "" : " <strong>Atención:</strong> no hay serie cargada o está vacía: el interés calculado es 0."}</p>
  <p style="font-size:9pt;color:var(--muted);">Misma lógica que la columna <strong>Caución (${co.pctCaucion}% cash, ARS)</strong> del <strong>Flujo por mes</strong> en el dashboard, con el mismo extracto y tasas desde <code>serie_cauciones.json</code> (o <code>Serie_Cauciones.xlsx</code> en la app). Las tasas deben ser <strong>fracción diaria</strong> como en Excel raw (ej. 0,00074); si un JSON antiguo guardaba ~TNA % ÷ 365 sin ÷100, informe y app aplican corrección automática. Regenerar JSON con <code>node scripts/convertir-serie-cauciones.js</code>. En la app el % puede configurarse; en este PDF se fija <strong>${co.pctCaucion}%</strong>.</p>
  <table><thead><tr><th>Mes</th><th>Interés caución del mes (ARS)</th></tr></thead><tbody>${rowsCaucion || `<tr><td colspan="2"><em>Sin meses en la serie mensual del informe.</em></td></tr>`}</tbody><tfoot><tr><th>Total período (ARS)</th><th class="num">${fmtARS(co.total)}</th></tr></tfoot></table>
  <p style="font-size:9pt;color:var(--muted);">Días con al menos un movimiento ARS operativo considerado en el acumulado: <strong>${co.nDiasConMov.toLocaleString("es-AR")}</strong>.</p>`;

  const bloqueSaldoCajaHtml =
    sc.nFlowsArs === 0 && sc.nFlowsUsd === 0
      ? `<p>No hay en el período movimientos <strong>Ingreso</strong>/<strong>Egreso</strong> con fecha válida para armar saldos por <strong>Medio de pago</strong> en ARS ni en USD.</p>`
      : `<p><strong>Definición:</strong> saldo <em>proxy</em> por cada <strong>Medio de pago</strong> al último día de cada mes: acumulado desde el <strong>primer movimiento del extracto</strong> hasta ese cierre, con <strong>Ingreso</strong> sumando y <strong>Egreso</strong> restando (misma base que el resto del informe sobre movimientos operativos). <strong>No</strong> incorpora saldo inicial fuera del archivo ni reemplaza conciliación bancaria.</p>
  <p><strong>La caja determina la moneda:</strong> se usa el mismo maestro que en normalización/importación (<code>fornitalia-moneda-por-medio.js</code>): cada <strong>Medio de pago</strong> listado allí fija ARS o USD; medio <strong>“-”</strong> se trata como ARS (conviene corregir en origen). <strong>Separación en tablas (sin conversión aquí):</strong> filas USD solo con <strong>Monto</strong> en dólares; filas ARS con <strong>Monto</strong> o <strong>Monto en $</strong> en pesos, sin MEP. Medios fuera del maestro: inferencia por contexto. El resto del informe puede seguir en ARS equivalente.</p>
  <p style="font-size:9pt;color:var(--muted);">Si hay más de ${SALDO_CAJA_MAX_MEDIOS} medios con movimiento, los restantes se agrupan en <strong>Otros medios</strong>. La columna <strong>Total (todos los medios)</strong> siempre suma el saldo completo por fila.</p>
  <h3>Saldo al cierre por medio — cajas en ARS</h3>
  ${
    sc.nFlowsArs === 0
      ? `<p><em>No hay movimientos clasificados como ARS con importe válido para esta serie.</em></p>`
      : htmlTablaSaldoCajaPorMes(sc.snapshotsArs, fmtARS)
  }
  <h3>Saldo al cierre por medio — cajas en USD</h3>
  ${
    sc.nFlowsUsd === 0
      ? `<p><em>No hay movimientos clasificados como USD con monto en dólares en el período.</em></p>`
      : htmlTablaSaldoCajaPorMes(sc.snapshotsUsd, fmtUSD)
  }`;

  const rowsVentasDia = INDICES_LUNES_A_DOMINGO.map((idx) => {
    const monto = v.byWeekday[idx];
    const pct =
      v.totalArs > 0 && Number.isFinite(monto)
        ? (100 * monto) / v.totalArs
        : null;
    return `<tr><td>${esc(NOMBRE_DIA_SEMANA[idx])}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
  }).join("");

  const rowsVentasFranja = v.rankFranja
    .map(([label, monto]) => {
      const pct = v.totalArs > 0 ? (100 * monto) / v.totalArs : null;
      return `<tr><td>${esc(label)}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
    })
    .join("");

  const rowsVentasUsuario = v.rankUsuarios
    .map(([u, monto]) => {
      const pct = v.totalArs > 0 ? (100 * monto) / v.totalArs : null;
      return `<tr><td>${esc(u)}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
    })
    .join("");

  const rowsVentasCliente = v.rankCliente
    .map(([c, monto]) => {
      const pct = v.totalArs > 0 ? (100 * monto) / v.totalArs : null;
      return `<tr><td>${esc(c)}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
    })
    .join("");

  const rowsVentasMes = v.ventasMonthKeys
    .map((k) => {
      const vm = v.ventasByMonth[k];
      const label = k.replace(/^(\d{4})-(\d{2})$/, "$2/$1");
      return `<tr><td>${esc(label)}</td><td class="num">${fmtARS(vm.total)}</td><td>${vm.n}</td><td class="num">${fmtARS(vm.n > 0 ? vm.total / vm.n : 0)}</td></tr>`;
    })
    .join("");

  const pctDiaPico =
    v.totalArs > 0 && v.diaPicoMonto > 0
      ? (100 * v.diaPicoMonto) / v.totalArs
      : null;

  const rowsVentasSemanaMes = [0, 1, 2, 3]
    .map((idx) => {
      const monto = v.bySemanaMes[idx];
      const pct =
        v.totalArs > 0 && Number.isFinite(monto)
          ? (100 * monto) / v.totalArs
          : null;
      return `<tr><td>${esc(ETIQUETAS_SEMANA_MES[idx])}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
    })
    .join("");

  const pctSemanaPico =
    v.totalArs > 0 && v.semanaPicoMonto > 0
      ? (100 * v.semanaPicoMonto) / v.totalArs
      : null;

  const rowsVentasSemanaPorMes = v.ventasMonthKeys
    .map((k) => {
      const arr = v.ventasByMonthSemana[k] || [0, 0, 0, 0];
      const tot = v.ventasByMonth[k] ? v.ventasByMonth[k].total : 0;
      const pUlt = tot > 0 ? (100 * arr[3]) / tot : null;
      const label = k.replace(/^(\d{4})-(\d{2})$/, "$2/$1");
      return `<tr><td>${esc(label)}</td><td class="num">${fmtARS(arr[0])}</td><td class="num">${fmtARS(arr[1])}</td><td class="num">${fmtARS(arr[2])}</td><td class="num">${fmtARS(arr[3])}</td><td class="num">${fmtPct(pUlt)}</td></tr>`;
    })
    .join("");

  const ultimoMesLabel = v.ultimoMesVentasKey
    ? v.ultimoMesVentasKey.replace(/^(\d{4})-(\d{2})$/, "$2/$1")
    : "—";

  const itemsConsiderandosVentas =
    v.nMov === 0
      ? [
          {
            con: "Con el criterio del informe no hay ingresos en categoría «Ventas» con ARS válido en el período.",
            cerrar:
              "Auditar el maestro de categorías (toda cobranza debería mapearse a Ventas o a la categoría acordada); completar Monto en $ o tipo de cambio en filas USD.",
          },
          {
            con: "Sin serie de ventas no aplican rankings, estacionalidad ni metas derivadas de esta sección.",
            cerrar:
              "Extracto corregido o política explícita de nomenclatura; regenerar el informe.",
          },
          {
            con: "Las referencias de «piso» u otros bloques del documento no sustituyen un presupuesto de ventas.",
            cerrar:
              "Presupuesto comercial y punto de equilibrio definidos con contador y dirección.",
          },
        ]
      : [
          {
            con: "Solo ingresan filas con categoría exacta «Ventas»; ventas mal categorizadas quedan fuera del análisis.",
            cerrar:
              "Revisión de categorías en origen y matriz categoría–cuenta alineada a `docs/ANALISIS_NORMALIZACION_*`.",
          },
          {
            con: "La columna Usuario refleja quien registró en el extracto, no necesariamente al vendedor.",
            cerrar:
              "Campo vendedor en ERP/CRM o convención que vincule usuario con rol comercial para reporting.",
          },
          {
            con: "La comparación ventas vs egresos operativos es referencia de caja, no resultado ni margen contable.",
            cerrar:
              "Estado de resultados y presupuesto formal para cerrar metas, márgenes y comisiones.",
          },
          {
            con: "Día de semana y franja horaria dependen de las columnas Fecha y Hora del extracto.",
            cerrar:
              "Validar en sistema de origen que fecha/hora sean operativas y consistentes con el hecho económico.",
          },
          {
            con: "La «semana dentro del mes» usa cortes fijos por día calendario (1–7, 8–14, 15–21, 22–fin), no semanas ISO ni semanas comerciales.",
            cerrar:
              "Si el negocio cierra por otra definición (p. ej. semana comercial), exportar fecha alineada o recalcular fuera del informe.",
          },
        ];

  const considerandosVentasHtml = htmlConsiderandosCierre(
    "Considerandos y cierre — Análisis de ventas",
    itemsConsiderandosVentas
  );

  const bloqueVentasHtml =
    v.nMov === 0
      ? `<p><strong>No hay</strong> en el período movimientos <strong>Ingreso</strong> con categoría <strong>Ventas</strong> con monto convertible a ARS, o la categoría no coincide exactamente (se espera el texto <strong>Ventas</strong>).</p>${considerandosVentasHtml}`
      : `<p><strong>Alcance:</strong> solo filas <strong>Tipo = Ingreso</strong> y <strong>Categoría = Ventas</strong>, mismas reglas de moneda que el resto del informe. La columna <strong>Usuario</strong> se usa como <strong>ranking operativo</strong> (quien registró en el extracto); no define por sí sola comisiones ni rol comercial.</p>
  <h3>Indicadores globales</h3>
  <table><thead><tr><th>Indicador</th><th>Valor</th></tr></thead><tbody>
    <tr><td>Total ventas (ARS)</td><td class="num">${fmtARS(v.totalArs)}</td></tr>
    <tr><td>Movimientos (tickets)</td><td>${v.nMov.toLocaleString("es-AR")}</td></tr>
    <tr><td>Ticket promedio</td><td class="num">${fmtARS(v.ticketPromedio)}</td></tr>
    <tr><td>Ventas / ingresos brutos totales</td><td class="num">${fmtPct(v.pctSobreIngBrutos)}</td></tr>
    <tr><td>Volatilidad relativa ventas mensuales (σ / |media|)</td><td class="num">${v.cvVentas != null ? v.cvVentas.toFixed(2) : "—"}</td></tr>
    <tr><td>Movimientos sin hora útil</td><td>${v.ventasSinHora.toLocaleString("es-AR")} (${fmtPct(v.nMov > 0 ? (100 * v.ventasSinHora) / v.nMov : null)} del total ventas)</td></tr>
    <tr><td>Movimientos sin Usuario</td><td>${v.ventasSinUsuario.toLocaleString("es-AR")} (${fmtPct(v.pctSinUsuario)})</td></tr>
  </tbody></table>

  <h3>Concentración por día de la semana</h3>
  <p>Distribución del monto de ventas según el <strong>día de la fecha</strong> del movimiento. Mayor concentración: <strong>${esc(v.diaPicoNombre)}</strong> (${fmtPct(pctDiaPico)} del total de ventas).</p>
  <table><thead><tr><th>Día</th><th>Monto ventas</th><th>% s/ total ventas</th></tr></thead><tbody>${rowsVentasDia}</tbody></table>

  <h3>Distribución por semana dentro del mes calendario</h3>
  <p>Cada movimiento se ubica según el <strong>día del mes</strong> de la fecha del extracto (no semanas ISO). Cortes fijos: días 1–7, 8–14, 15–21 y <strong>22 al último día</strong> (feb. 22–28/29, meses de 31 días 22–31). Así se compara si hay más peso en la <strong>última franja del mes</strong> o reparto parejo.</p>
  <p><strong>Período completo:</strong> mayor monto en <strong>${esc(v.semanaPicoNombre)}</strong> (${fmtPct(pctSemanaPico)} del total de ventas). La <strong>cuarta franja</strong> (días 22–fin) concentra <strong>${fmtPct(v.pctUltimaSemanaMesGlobal)}</strong> del total de ventas del período.</p>
  <table><thead><tr><th>Franja dentro del mes</th><th>Monto ventas</th><th>% s/ total ventas</th></tr></thead><tbody>${rowsVentasSemanaMes}</tbody></table>
  <h4 style="font-size:0.9rem;margin:0.65rem 0 0.25rem;">Desglose por mes (mismo criterio)</h4>
  <p style="font-size:9pt;color:var(--muted);">Montos en ARS por franja; la última columna es el % del total de ventas de <strong>ese mes</strong> que cayó en días 22 a fin (última “semana” del mes según esta definición).</p>
  <table><thead><tr><th>Mes</th><th>Sem. 1 (1–7)</th><th>Sem. 2 (8–14)</th><th>Sem. 3 (15–21)</th><th>Sem. 4 (22–fin)</th><th>% sem. 4 s/ mes</th></tr></thead><tbody>${rowsVentasSemanaPorMes}</tbody></table>

  <h3>Concentración por franja horaria</h3>
  <p>Según la columna <strong>Hora</strong> del extracto.</p>
  <table><thead><tr><th>Franja</th><th>Monto ventas</th><th>% s/ total ventas</th></tr></thead><tbody>${rowsVentasFranja}</tbody></table>

  <h3>Ranking por usuario (extracto)</h3>
  <p>Hasta 12 filas según suma de ventas por <strong>Usuario</strong>.</p>
  <table><thead><tr><th>Usuario</th><th>Monto ventas</th><th>% s/ total ventas</th></tr></thead><tbody>${rowsVentasUsuario}</tbody></table>

  <h3>Ranking por cliente</h3>
  <p>Hasta 12 clientes por monto de ventas (columna <strong>Cliente</strong>).</p>
  <table><thead><tr><th>Cliente</th><th>Monto ventas</th><th>% s/ total ventas</th></tr></thead><tbody>${rowsVentasCliente}</tbody></table>

  <h3>Evolución mensual de ventas</h3>
  <table><thead><tr><th>Mes</th><th>Total ventas</th><th>Mov.</th><th>Ticket medio mes</th></tr></thead><tbody>${rowsVentasMes}</tbody></table>

  <h3>Referencia de piso de ventas vs gastos operativos</h3>
  <p><strong>Definición:</strong> promedio y mediana de <strong>egresos operativos</strong> por mes (sin Transferencia/Depósito entre cuentas). Es una <strong>referencia estadística</strong>, no punto de equilibrio contable ni presupuesto.</p>
  <table><thead><tr><th>Concepto</th><th>Valor</th></tr></thead><tbody>
    <tr><td>Promedio egresos operativos / mes</td><td class="num">${fmtARS(v.promEgOpMes)}</td></tr>
    <tr><td>Mediana egresos operativos mensuales</td><td class="num">${fmtARS(v.medianaEgOpMes)}</td></tr>
    <tr><td>Ventas (último mes con ventas: ${esc(ultimoMesLabel)})</td><td class="num">${fmtARS(v.ventasUltimoMes)}</td></tr>
    <tr><td>Egresos operativos ese mismo mes</td><td class="num">${v.egOpUltimoMes != null ? fmtARS(v.egOpUltimoMes) : "—"}</td></tr>
    <tr><td>¿Ventas del mes cubrieron egresos operativos?</td><td><strong>${v.cubreGastoUltimoMes === true ? "Sí" : v.cubreGastoUltimoMes === false ? "No" : "—"}</strong></td></tr>
  </tbody></table>
  <p style="font-size:9pt;color:var(--muted);"><strong>Objetivo mínimo orientativo:</strong> sostener ventas mensuales en línea con el <strong>promedio o mediana de egresos operativos</strong> reduce tensiones de caja; sumar colchón y metas de margen conviene definirlo con contador y dirección comercial.</p>${considerandosVentasHtml}`;

  const rowsComprasDia = INDICES_LUNES_A_DOMINGO.map((idx) => {
    const monto = ch.byWeekday[idx];
    const pct =
      ch.totalArs > 0 && Number.isFinite(monto)
        ? (100 * monto) / ch.totalArs
        : null;
    return `<tr><td>${esc(NOMBRE_DIA_SEMANA[idx])}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
  }).join("");

  const rowsComprasFranja = ch.rankFranja
    .map(([label, monto]) => {
      const pct = ch.totalArs > 0 ? (100 * monto) / ch.totalArs : null;
      return `<tr><td>${esc(label)}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
    })
    .join("");

  const rowsComprasUsuario = ch.rankUsuarios
    .map(([u, monto]) => {
      const pct = ch.totalArs > 0 ? (100 * monto) / ch.totalArs : null;
      return `<tr><td>${esc(u)}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
    })
    .join("");

  const rowsComprasCliente = ch.rankCliente
    .map(([c, monto]) => {
      const pct = ch.totalArs > 0 ? (100 * monto) / ch.totalArs : null;
      return `<tr><td>${esc(c)}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
    })
    .join("");

  const rowsComprasCat = ch.rankCategoria
    .map(([c, monto]) => {
      const pct = ch.totalArs > 0 ? (100 * monto) / ch.totalArs : null;
      return `<tr><td>${esc(c)}</td><td class="num">${fmtARS(monto)}</td><td class="num">${fmtPct(pct)}</td></tr>`;
    })
    .join("");

  const rowsComprasMes = ch.comprasMonthKeys
    .map((k) => {
      const cm = ch.comprasByMonth[k];
      const label = k.replace(/^(\d{4})-(\d{2})$/, "$2/$1");
      return `<tr><td>${esc(label)}</td><td class="num">${fmtARS(cm.total)}</td><td>${cm.n}</td><td class="num">${fmtARS(cm.n > 0 ? cm.total / cm.n : 0)}</td></tr>`;
    })
    .join("");

  const rowsComprasVsVentas = ch.mesesComprasVsVentas
    .map((k) => {
      const ctot = ch.comprasByMonth[k] ? ch.comprasByMonth[k].total : 0;
      const vtot = v.ventasByMonth[k] ? v.ventasByMonth[k].total : 0;
      const pctCv =
        vtot > 0 && ctot > 0 ? (100 * ctot) / vtot : vtot > 0 && ctot === 0 ? 0 : null;
      const label = k.replace(/^(\d{4})-(\d{2})$/, "$2/$1");
      return `<tr><td>${esc(label)}</td><td class="num">${fmtARS(ctot)}</td><td class="num">${fmtARS(vtot)}</td><td class="num">${fmtPct(pctCv)}</td></tr>`;
    })
    .join("");

  const pctDiaPicoH =
    ch.totalArs > 0 && ch.diaPicoMonto > 0
      ? (100 * ch.diaPicoMonto) / ch.totalArs
      : null;

  const itemsConsiderandosCompras =
    ch.nMov === 0
      ? [
          {
            con: "No hay egresos con cuenta «Hornos» convertibles a ARS en el período; el proxy no muestra magnitud de compras vía esa cuenta.",
            cerrar:
              "Confirmar con contador si las compras de mercadería se registran bajo otras cuentas/categorías y, si aplica, acordar ampliar el criterio del script con un maestro explícito.",
          },
          {
            con: "Las limitaciones del proxy (solo egreso + cuenta Hornos; sin CMV ni stock) siguen vigentes aunque no haya filas.",
            cerrar:
              "Definición en plan de cuentas de mercaderías, tránsito, CMV y política de imputación en la carga del extracto.",
          },
          {
            con: "Pueden existir movimientos Ingreso con cuenta Hornos (no tratados como compra en este bloque).",
            cerrar:
              "Notas del contador o soporte documental por cada ingreso atípico imputado a Hornos.",
          },
        ]
      : [
          {
            con: "El bloque solo suma egresos imputados a cuenta Hornos; no representa inventario, CMV ni obligaciones no pagadas.",
            cerrar:
              "Valuación de stock, compras devengadas y estado de resultados integrados con la contabilidad formal.",
          },
          {
            con: "Las categorías de gestión del extracto (p. ej. Activos vs Producto) mezclan criterios contables.",
            cerrar:
              "Política escrita (bienes de cambio vs inmovilizado vs gasto) y carga homogénea en el sistema de origen.",
          },
          {
            con: "Los ingresos con cuenta Hornos quedaron fuera del total de «compras» y solo se informan al pie.",
            cerrar:
              "Conciliación y explicación contable de cada ingreso Hornos (reclasificación, venta de activo, error, etc.).",
          },
          {
            con: "La columna Cliente en egresos puede no identificar de forma fiable al proveedor.",
            cerrar:
              "Campo proveedor en ERP y su uso sistemático en exportaciones a extracto.",
          },
        ];

  const considerandosComprasHtml = htmlConsiderandosCierre(
    "Considerandos y cierre — Compras mercadería (hornos, proxy)",
    itemsConsiderandosCompras
  );

  const restriccionesComprasHtml = `<div class="box" style="background:#faf8f5;border-color:#c9a227;">
  <h3 style="margin-top:0;">Restricciones de interpretación (leer antes de usar cifras)</h3>
  <ul style="margin-bottom:0;">
    <li><strong>Qué es este bloque:</strong> solo <strong>egresos de caja</strong> con <strong>cuenta contable “Hornos”</strong> (comparación insensible a mayúsculas). Es un <strong>proxy operativo</strong> del extracto, <strong>no</strong> reemplaza inventario, CMV ni balance.</li>
    <li><strong>Qué no cubre:</strong> no aparecen aquí otras cuentas de activos (Mobiliario, Accesorios, etc.); no hay en este archivo categoría canónica “Compras / Mercaderías”; importaciones en tránsito o devengados sin movimiento de caja <strong>no</strong> están reflejados.</li>
    <li><strong>Categorías de gestión mixtas:</strong> en los datos suele predominar <strong>Activos</strong> y en algunos casos <strong>Producto</strong> — conviene validar con el contador si corresponde a bienes de cambio, inmovilizado u otro criterio.</li>
    <li><strong>Ingresos con cuenta Hornos:</strong> existen en el extracto movimientos <strong>Ingreso</strong> imputados a la misma cuenta; <strong>no</strong> se suman como compra. Pueden ser ajustes, reclasificaciones u otros hechos contables.</li>
    <li><strong>Columna Cliente:</strong> en egresos puede ser proveedor, vacío o texto genérico; el ranking es <strong>indicativo</strong>.</li>
  </ul>
</div>`;

  const bloqueComprasMercaderiaHtml =
    `${restriccionesComprasHtml}` +
    (ch.nMov === 0
      ? `<p><strong>No hay</strong> en el período <strong>egresos</strong> con cuenta contable <strong>Hornos</strong> y monto convertible a ARS. El proxy “compras de mercadería vía caja” no aplica a números en este extracto.</p>${
          ch.ingresosHornosExcluidos.n > 0
            ? `<p><strong>Nota:</strong> sí hay <strong>${ch.ingresosHornosExcluidos.n}</strong> movimiento(s) <strong>Ingreso</strong> con cuenta Hornos por un total de <strong>${fmtARS(ch.ingresosHornosExcluidos.totalArs)}</strong> (excluidos de compras; ver restricciones arriba).</p>`
            : ""
        }`
      : `<h3>Indicadores globales (egreso + cuenta Hornos)</h3>
  <table><thead><tr><th>Indicador</th><th>Valor</th></tr></thead><tbody>
    <tr><td>Total egresos cuenta Hornos (ARS)</td><td class="num">${fmtARS(ch.totalArs)}</td></tr>
    <tr><td>Movimientos</td><td>${ch.nMov.toLocaleString("es-AR")}</td></tr>
    <tr><td>Ticket promedio</td><td class="num">${fmtARS(ch.ticketPromedio)}</td></tr>
    <tr><td>% s/ egresos brutos totales (extracto)</td><td class="num">${fmtPct(ch.pctSobreEgresosBrutos)}</td></tr>
    <tr><td>% s/ egresos operativos (sin traspasos internos)</td><td class="num">${fmtPct(ch.pctSobreEgresosOperativos)}</td></tr>
    <tr><td>Ratio período: compras proxy Hornos / total ventas (cat. Ventas)</td><td class="num">${ch.ratioComprasHornosSobreVentasPeriodo != null ? ch.ratioComprasHornosSobreVentasPeriodo.toFixed(2) + "×" : "—"}</td></tr>
    <tr><td>Volatilidad relativa egresos Hornos por mes (σ / |media|)</td><td class="num">${ch.cvCompras != null ? ch.cvCompras.toFixed(2) : "—"}</td></tr>
    <tr><td>Movimientos sin hora útil</td><td>${ch.comprasSinHora.toLocaleString("es-AR")} (${fmtPct(ch.nMov > 0 ? (100 * ch.comprasSinHora) / ch.nMov : null)} del total)</td></tr>
    <tr><td>Movimientos sin Usuario</td><td>${ch.comprasSinUsuario.toLocaleString("es-AR")} (${fmtPct(ch.pctSinUsuario)})</td></tr>
    <tr><td>Ingresos cuenta Hornos (excluidos; informativo)</td><td>${ch.ingresosHornosExcluidos.n} mov. · ${fmtARS(ch.ingresosHornosExcluidos.totalArs)}</td></tr>
  </tbody></table>

  <h3>Distribución por categoría de gestión (extracto)</h3>
  <p>Suma de montos por <strong>Categoría</strong> en las filas que cumplen el criterio.</p>
  <table><thead><tr><th>Categoría</th><th>Monto</th><th>% s/ total cuenta Hornos</th></tr></thead><tbody>${rowsComprasCat}</tbody></table>

  <h3>Concentración por día de la semana</h3>
  <p>Mayor concentración: <strong>${esc(ch.diaPicoNombre)}</strong> (${fmtPct(pctDiaPicoH)} del total de este proxy).</p>
  <table><thead><tr><th>Día</th><th>Monto</th><th>% s/ total</th></tr></thead><tbody>${rowsComprasDia}</tbody></table>

  <h3>Concentración por franja horaria</h3>
  <table><thead><tr><th>Franja</th><th>Monto</th><th>% s/ total</th></tr></thead><tbody>${rowsComprasFranja}</tbody></table>

  <h3>Ranking por usuario (extracto)</h3>
  <table><thead><tr><th>Usuario</th><th>Monto</th><th>% s/ total</th></tr></thead><tbody>${rowsComprasUsuario}</tbody></table>

  <h3>Ranking por cliente / contraparte</h3>
  <table><thead><tr><th>Cliente</th><th>Monto</th><th>% s/ total</th></tr></thead><tbody>${rowsComprasCliente}</tbody></table>

  <h3>Evolución mensual (proxy)</h3>
  <table><thead><tr><th>Mes</th><th>Total egreso Hornos</th><th>Mov.</th><th>Ticket medio</th></tr></thead><tbody>${rowsComprasMes}</tbody></table>

  <h3>Cruce mensual con ventas (referencia)</h3>
  <p><strong>Egresos cuenta Hornos</strong> vs <strong>ingresos categoría Ventas</strong> por mes. La columna “% compras s/ ventas” = 100 × (egreso Hornos / ventas) cuando hay ventas en el mes; si en el mes <strong>no hay ventas</strong> (categoría Ventas), la columna queda en <strong>—</strong> aunque haya egreso Hornos.</p>
  <table><thead><tr><th>Mes</th><th>Egreso Hornos</th><th>Ventas (cat.)</th><th>% compras s/ ventas</th></tr></thead><tbody>${rowsComprasVsVentas}</tbody></table>
  <p style="font-size:9pt;color:var(--muted);">Un ratio alto en un mes puede reflejar pago concentrado de importación o stock, no necesariamente mala gestión; cruzar con calendario de proveedores y con el contador.</p>`) +
    considerandosComprasHtml;

  const outlierText =
    stats.outliers.length > 0
      ? stats.outliers
          .map((k) => k.replace(/^(\d{4})-(\d{2})$/, "$2/$1"))
          .join(", ")
      : "Ninguno bajo regla IQR (sobre flujo operativo mensual).";

  const oportunidades = [];
  if (shares.impVsEg != null && shares.impVsEg > 35)
    oportunidades.push(
      "Carga impositiva elevada vs egresos totales: revisar calendario de pagos, compensaciones y proyección de flujo con el asesor fiscal."
    );
  if (mediosEg[0] && mediosEg[0][1] / totals.totalEg > 0.75)
    oportunidades.push(
      "Fuerte concentración en un solo medio de pago para egresos: evaluar redundancia operativa y límites bancarios."
    );
  if (stats.cv > 0.45)
    oportunidades.push(
      "Alta volatilidad del resultado de caja mensual (operativo): fortalecer forecast 13 semanas y línea de trabajo capital."
    );
  if (calidad.cuentaGuion > 50)
    oportunidades.push(
      "Muchos movimientos con cuenta contable “-”: completar plan de cuentas para mejorar control y conciliación."
    );
  oportunidades.push(
    "Separar en reporting explícito los movimientos internos (Transferencia / Depósito entre cuentas) del gasto operativo."
  );
  oportunidades.push(
    "Unificar categorías duplicadas (p. ej. Alquiler vs Alquileres y Servicios) para series temporales más limpias."
  );

  const debilidades = [];
  if (flags.mayJunSinEgresos.length)
    debilidades.push(
      `Meses con ingresos registrados y **egresos en cero** (${flags.mayJunSinEgresos.map((k) => k.replace(/^(\d{4})-(\d{2})$/, "$2/$1")).join(", ")}): probable **carga incompleta** o corte de datos, no “cero gasto” real.`
    );
  if (calidad.sinCategoria > 0)
    debilidades.push(
      `${calidad.sinCategoria} movimientos sin categoría dificultan análisis por rubro.`
    );
  if (calidad.cuentaGuion > 0)
    debilidades.push(
      `${calidad.cuentaGuion} movimientos con cuenta “-” o vacía: riesgo de errores en proyección de balance y en validaciones.`
    );
  if ((meta.filasExcluidasSinArs || 0) > 0)
    debilidades.push(
      `**${meta.filasExcluidasSinArs || 0}** movimiento(s) en **USD** no entraron en los totales: sin “Monto en $”, sin “Tipo de Cambio” en fila y sin **MEP** aplicable en la tabla para esa fecha (ampliar cotizaciones o corregir fechas).`
    );
  if ((meta.filasExcluidasMesNoCerrado || 0) > 0)
    debilidades.push(
      `**Marzo 2026** excluido (**${meta.filasExcluidasMesNoCerrado}** fila(s)): mes **no cerrado**; totales y rankings sin ese período.`
    );
  if (!meta.tcMepLabel)
    debilidades.push(
      "**Sin archivo de cotizaciones MEP** en `docs/` ni CSV en raíz: los USD sin TC en el extracto no se pueden pasar a ARS en este informe."
    );
  debilidades.push(
    "Serie corta (menos de dos años completos) y un mes faltante en 2025: la **estacionalidad** estadística es limitada; interpretar con cautela."
  );

  const fortalezas = [];
  if (shares.ventasVsIng != null && shares.ventasVsIng > 70)
    fortalezas.push(
      "Los ingresos están **concentrados en Ventas**, coherente con un negocio de comercialización con flujo identificable."
    );
  if (totals.netOp > 0)
    fortalezas.push(
      "Flujo de caja **operativo** (excl. Transferencia/Depósito entre cuentas) **positivo** en el período analizado."
    );
  fortalezas.push(
    "Volumen de transacciones operativas elevado: base sólida para automatizar reportes una vez normalizados los maestros."
  );

  const opHtml = oportunidades.map((t) => `<li>${t}</li>`).join("");
  const debHtml = debilidades.map((t) => `<li>${inlineRisk(t)}</li>`).join("");
  const fortHtml = fortalezas.map((t) => `<li>${inlineRisk(t)}</li>`).join("");

  const itemsConsiderandosFinanciero = [
    {
      con: "El documento es análisis de caja según el extracto (cobros y pagos registrados), no estados contables devengados ni posición patrimonial completa.",
      cerrar:
        "Balance, estado de resultados y estado de flujo de efectivo elaborados por el contador; conciliación bancaria cruzada con este extracto.",
    },
    {
      con: "Conviven totales brutos (con traspasos entre cuentas) y operativos ajustados (sin Transferencia/Depósito entre cuentas): ambas lecturas deben acordarse para decisiones.",
      cerrar:
        "Política de reporting escrita (dirección + contador) sobre qué magnitud usa cada tipo de decisión de gestión y tesorería.",
    },
    {
      con: "La serie mensual puede incluir meses con egresos en cero con ingresos, o cortes, que limitan conclusiones de tendencia y estacionalidad.",
      cerrar:
        "Confirmación del cliente sobre carga completa por mes o nueva extracción; para estacionalidad rigurosa, al menos dos períodos comparables completos.",
    },
    {
      con: "La calidad de categoría, cuenta contable y medio de pago impacta todos los apartados del informe (no solo la sección de calidad de datos).",
      cerrar:
        "Plan de cuentas depurado, matriz categoría–cuenta y eliminación sistemática de valores «-» en campos obligatorios (ver normalización de datos legacy).",
    },
    {
      con: "Los porcentajes sobre impuestos y sueldos se calculan sobre totales del extracto, no sobre obligaciones futuras ni presupuesto.",
      cerrar:
        "Calendario impositivo y proyección de nómina cruzados con este informe para cerrar el riesgo de liquidez.",
    },
  ];
  if ((meta.filasExcluidasSinArs || 0) > 0) {
    itemsConsiderandosFinanciero.push({
      con: `En esta corrida ${meta.filasExcluidasSinArs} movimiento(s) en moneda extranjera quedaron fuera de los totales por falta de conversión a ARS.`,
      cerrar:
        "Completar archivo MEP en docs (SQL/CSV) o columna Monto en $ / tipo de cambio en cada fila USD del extracto; regenerar el informe.",
    });
  }
  if (!meta.tcMepLabel) {
    itemsConsiderandosFinanciero.push({
      con: "No se detectó archivo de cotizaciones MEP en las rutas esperadas del proyecto.",
      cerrar:
        "Colocar `docs/tipos_cambio_global_rows.sql` o CSV equivalente y volver a ejecutar `npm run analisis-financiero-pdf`.",
    });
  }
  if ((meta.filasExcluidasMesNoCerrado || 0) > 0) {
    itemsConsiderandosFinanciero.push({
      con: `Marzo 2026 está fuera del análisis (${meta.filasExcluidasMesNoCerrado} fila(s) omitidas): mes no cerrado en origen.`,
      cerrar:
        "Tras el cierre contable/operativo de marzo 2026, actualizar la regla de exclusión en `generar-analisis-financiero-pdf.js` y en el dashboard si corresponde.",
    });
  }
  if (flags.mayJunSinEgresos.length) {
    const mesesLiterales = flags.mayJunSinEgresos
      .map((k) => k.replace(/^(\d{4})-(\d{2})$/, "$2/$1"))
      .join(", ");
    itemsConsiderandosFinanciero.push({
      con: `Hay meses con ingresos y egresos en cero en el extracto (${mesesLiterales}), señal de posible dato incompleto.`,
      cerrar:
        "Validar con el cliente la carga de egresos en esos meses o documentar formalmente que el corte es correcto.",
    });
  }
  if (!co.serieOk) {
    itemsConsiderandosFinanciero.push({
      con: "La sección de oportunidad de caución no tiene serie diaria cargada o el archivo está vacío: el interés mostrado es cero.",
      cerrar:
        "Colocar o completar `serie_cauciones.json` en la raíz del repositorio (mismo formato que usa el dashboard) y regenerar el informe.",
    });
  }

  const considerandosFinancieroHtml = htmlConsiderandosCierre(
    "Considerandos y cierre — Análisis financiero general (caja y liquidez)",
    itemsConsiderandosFinanciero
  );

  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Análisis financiero — Extracto Fornitalia</title>
  <style>
    :root { --ink: #1a1a2e; --muted: #555; --line: #ccd; --bg: #fafbfc; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); line-height: 1.45; margin: 0; padding: 12mm 14mm; font-size: 10.5pt; }
    h1 { font-size: 1.35rem; margin: 0 0 0.25rem; }
    h2 { font-size: 1.05rem; margin: 1.25rem 0 0.5rem; border-bottom: 2px solid var(--ink); padding-bottom: 0.2rem; }
    h3 { font-size: 0.95rem; margin: 0.9rem 0 0.35rem; }
    .sub { color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }
    .box { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem 1rem; margin: 0.75rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 0.5rem 0; }
    th, td { border: 1px solid var(--line); padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; }
    th { background: #e8eaed; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    ul { margin: 0.35rem 0 0.35rem 1.1rem; }
    .page-break { break-before: page; }
    .considerandos-sesion { margin-top: 1.35rem; padding-top: 0.65rem; border-top: 2px solid #b8860b; break-inside: avoid; }
    .considerandos-sesion h3 { border-bottom: none; margin-top: 0; }
    .considerandos-intro { font-size: 9pt; color: var(--muted); margin: 0.25rem 0 0.6rem; line-height: 1.4; }
    table.considerandos { font-size: 9pt; margin-top: 0.35rem; }
    table.considerandos th:first-child, table.considerandos td:first-child { width: 36%; }
    @media print {
      body { padding: 0; }
      h2 { break-after: avoid; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Análisis financiero — Extracto de caja Fornitalia</h1>
  <p class="sub">Fuente: <strong>${esc(meta.archivo)}</strong>, hoja <strong>Movimientos</strong>. Período fechas movimientos: <strong>${esc(periodo)}</strong>.<br/>
  Generado: ${esc(new Date(meta.generado).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }))} (Argentina).<br/>
  <strong>Moneda:</strong> montos en <strong>ARS equivalente</strong>. Orden de conversión: (1) columna <strong>Monto en $</strong> del extracto; (2) si es USD y hay <strong>Tipo de Cambio</strong> en la fila, se usa; (3) si no, <strong>usd_mep</strong> de la tabla de cotizaciones para la <strong>fecha del movimiento</strong>, o la <strong>última fecha disponible anterior</strong> (mismo criterio que el dashboard con MEP). ${meta.tcMepLabel ? `<strong>Fuente MEP:</strong> ${esc(meta.tcMepLabel)} (${meta.tcMepFechas || 0} fechas).` : "<strong>Atención:</strong> no se encontró tabla MEP en <code>docs/</code> ni CSV en raíz."} Mercado Pago y Transferencia Morba se tratan como ARS.${(meta.filasExcluidasMesNoCerrado || 0) > 0 ? ` <strong>Exclusión mes no cerrado:</strong> no se incluyen movimientos de <strong>marzo 2026</strong> (${meta.filasExcluidasMesNoCerrado} fila(s) omitidas del extracto para este informe).` : ""}</p>

  <div class="box">
    <h2 style="margin-top:0;border:none;padding:0;">Resumen ejecutivo</h2>
    <ul>
      <li><strong>${meta.nOperativos.toLocaleString("es-AR")}</strong> movimientos operativos (excluye ${meta.anulados} anulados y ${meta.aperturaCierre} aperturas/cierres de caja). En los totales del informe <strong>no se suman</strong> las filas que no pudieron convertirse a ARS${(meta.filasExcluidasSinArs || 0) > 0 ? ` (<strong>${meta.filasExcluidasSinArs}</strong> en esta corrida).` : "."}${(meta.filasExcluidasMesNoCerrado || 0) > 0 ? ` <strong>Marzo 2026</strong> no se incluye (mes no cerrado): <strong>${meta.filasExcluidasMesNoCerrado}</strong> fila(s) omitidas.` : ""}</li>
      <li>Ingresos totales: <strong>${fmtARS(totals.totalIng)}</strong> · Egresos totales: <strong>${fmtARS(totals.totalEg)}</strong> · <strong>Neto caja (extracto): ${fmtARS(totals.net)}</strong>.</li>
      <li>Neto <strong>operativo ajustado</strong> (excluye categorías Transferencia y Depósito entre cuentas): <strong>${fmtARS(totals.netOp)}</strong>.</li>
      <li><strong>Ventas</strong> representan ${fmtPct(shares.ventasVsIng)} de los ingresos; <strong>Impuestos</strong> ${fmtPct(shares.impVsEg)} de los egresos; <strong>Sueldos</strong> ${fmtPct(shares.sueVsEg)}.</li>
      <li>Volatilidad relativa del neto mensual ajustado (desvío / |media|): <strong>${stats.cv.toFixed(2)}</strong>. Mediana mensual ajustada: <strong>${fmtARS(stats.median)}</strong>.</li>
      ${
        ch.nMov > 0
          ? `<li><strong>Compras proxy (cuenta Hornos, egresos):</strong> ${fmtARS(ch.totalArs)} (${ch.nMov.toLocaleString("es-AR")} mov.) — <strong>sección 4</strong>; no equivale a mercadería contable ni CMV (restricciones en el informe).</li>`
          : ch.ingresosHornosExcluidos.n > 0
            ? `<li>Hay <strong>${ch.ingresosHornosExcluidos.n}</strong> movimiento(s) <strong>Ingreso</strong> con cuenta Hornos (${fmtARS(ch.ingresosHornosExcluidos.totalArs)}) no tratados como compra; ver <strong>sección 4</strong>.</li>`
            : ""
      }
    </ul>
  </div>

  <h2>1. Alcance y metodología</h2>
  <p>Este informe es un <strong>análisis de caja</strong> a partir del extracto; <strong>no</strong> reemplaza estados contables auditados ni el balance de situación. Los <strong>traspasos</strong> entre cuentas propias inflan ingresos y egresos brutos pero no son gasto ni venta: por eso se muestra una columna de neto “ajustado” por mes.</p>
  <p><strong>Moneda de origen por registro:</strong> aplica el <strong>maestro caja → moneda</strong> (Transferencia Galicia, MercadoPago, Efectivo Pesos, Morba/Morva, Credicoop, “-” → ARS; Transferencia Galicia Dolar, Efectivo Dolar → USD). Si el medio no está en el maestro, el informe infiere por contexto (descripción, etc.). La tabla vive en <code>scripts/lib/fornitalia-moneda-por-medio.js</code> y se reutiliza en normalización e importación a la app.</p>
  <p><strong>USD → ARS:</strong> cuando el extracto no trae tipo de cambio en todas las filas, el informe completa con el <strong>MEP (usd_mep)</strong> de la tabla que dejás en <code>docs/tipos_cambio_global_rows.sql</code> (export típico de Supabase) o, en su defecto, el CSV <code>tipos_cambio_global_rows.csv</code>. Así se alinea el criterio con la app en vista ARS con tipo <strong>MEP</strong>.</p>
  <p>Los meses marcados con ⚠ en la tabla tienen <strong>egresos en cero</strong> con ingresos positivos: debe interpretarse como posible <strong>dato incompleto</strong>, no como ausencia real de pagos.</p>
  <p><strong>Mes abierto:</strong> los movimientos de <strong>marzo 2026</strong> no forman parte de este informe (criterio de <strong>mes cerrado</strong>, alineado con el dashboard).${(meta.filasExcluidasMesNoCerrado || 0) > 0 ? ` En esta corrida se omitieron <strong>${meta.filasExcluidasMesNoCerrado}</strong> fila(s) del extracto por este motivo.` : ""}</p>

  <h2>2. Panorama del negocio (puntos destacados)</h2>
  <ul>
    ${fortHtml}
  </ul>
  <h3>Principales categorías — Egresos</h3>
  <table><thead><tr><th>Categoría</th><th>Monto</th><th>% s/ egresos</th></tr></thead><tbody>${rowsTopEg}</tbody></table>
  <h3>Principales categorías — Ingresos</h3>
  <table><thead><tr><th>Categoría</th><th>Monto</th><th>% s/ ingresos</th></tr></thead><tbody>${rowsTopIng}</tbody></table>

  <h2 class="page-break">3. Análisis de ventas</h2>
  ${bloqueVentasHtml}

  <h2 class="page-break">4. Compras de mercadería (hornos) — proxy desde extracto</h2>
  ${bloqueComprasMercaderiaHtml}

  <h2 class="page-break">5. Evolución mensual y estacionalidad</h2>
  <table>
    <thead><tr><th>Mes</th><th>Ingresos</th><th>Egresos</th><th>Neto bruto</th><th>Neto ajustado*</th><th>Mov.</th><th>Nota</th></tr></thead>
    <tbody>${rowsMonth}</tbody>
  </table>
  <p style="font-size:9pt;color:var(--muted);">* Ajustado: excluye categorías Transferencia y Depósito (traspasos internos).</p>
  <p><strong>Tendencias:</strong> se observa variación fuerte entre meses (p. ej. picos y valles de neto). Con la serie disponible, la estacionalidad clásica (mismo mes año contra año) <strong>no puede confirmarse</strong> con rigor estadístico.</p>
  <p><strong>Meses atípicos (neto ajustado, regla IQR):</strong> ${esc(outlierText)}</p>

  <h2 class="page-break">6. Saldo por caja (medio de pago) al cierre de mes — ARS y USD por separado</h2>
  ${bloqueSaldoCajaHtml}

  <h2>7. Liquidez y medios de pago (egresos del período)</h2>
  <p style="font-size:9pt;color:var(--muted);">Este bloque es la <strong>suma de egresos del período completo</strong> por medio de pago (no el saldo acumulado al cierre de mes). Para saldos acumulados por mes y moneda, ver <strong>sección 6</strong>.</p>
  <table><thead><tr><th>Medio de pago</th><th>Monto egresos</th><th>% s/ egresos</th></tr></thead><tbody>${rowsMedios}</tbody></table>

  <h2 class="page-break">8. Oportunidad de inversión no realizada (caución — cuadro alineado a la app)</h2>
  ${bloqueCaucionHtml}

  <h2>9. Calidad de datos y señales erráticas</h2>
  <ul>
    ${debHtml}
  </ul>
  <p><strong>Registros:</strong> ${meta.totalFilas.toLocaleString("es-AR")} filas analizadas (tras excluir mes no cerrado si aplica) · ${meta.anulados} anulados · ${calidad.sinCategoria} sin categoría (no anulados) · ${calidad.cuentaGuion} con cuenta “-” o vacía (no anulados)${(meta.filasExcluidasSinArs || 0) > 0 ? ` · <strong>${meta.filasExcluidasSinArs}</strong> mov. en USD excluidos de totales (sin conversión a ARS)` : ""}${(meta.filasExcluidasMesNoCerrado || 0) > 0 ? ` · <strong>${meta.filasExcluidasMesNoCerrado}</strong> filas omitidas (marzo 2026, mes abierto)` : ""}.</p>

  <h2>10. Debilidades y riesgos (lectura financiera)</h2>
  <ul>
    <li>Dependencia de clasificación (categoría/cuenta) aún heterogénea: sesga comparables entre meses.</li>
    <li>Impuestos y cargas laborales concentran gran parte del egreso: sensibilidad a fechas de vencimiento.</li>
    <li>Sin desglose de <strong>devengado</strong>, el análisis no captura obligaciones no pagadas ni stock.</li>
  </ul>

  <h2>11. Oportunidades de mejora en cash management</h2>
  <ul>${opHtml}</ul>

  ${considerandosFinancieroHtml}

  <h2>12. Conclusión</h2>
  <p>El negocio muestra, en el período del extracto, <strong>generación de caja operativa positiva</strong> al aislar traspasos internos, con <strong>ventas</strong> como motor de ingresos. La prioridad de gestión es <strong>normalizar maestros</strong> (categoría, cuenta, medios) y completar series mensuales sin cortes para poder afirmar estacionalidad y metas de liquidez con mayor confianza. Se recomienda cruzar este informe con el plan de cuentas y proyección de impuestos/sueldos con el contador.</p>

  <p style="margin-top:2rem;font-size:9pt;color:var(--muted);">Documento generado automáticamente por <code>scripts/generar-analisis-financiero-pdf.js</code>. Actualizar el Excel de origen y volver a ejecutar <code>npm run analisis-financiero-pdf</code> para regenerar.</p>
</body>
</html>`;
}

function inlineRisk(s) {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Cierre de sesión: tabla Considerando → qué hace falta para cerrar el análisis.
 * @param {string} titulo
 * @param {{ con: string, cerrar: string }[]} items
 */
function htmlConsiderandosCierre(titulo, items) {
  if (!items || !items.length) return "";
  const rows = items
    .map(
      (it) =>
        `<tr><td>${esc(it.con)}</td><td>${esc(it.cerrar)}</td></tr>`
    )
    .join("");
  return `<div class="considerandos-sesion">
  <h3>${esc(titulo)}</h3>
  <p class="considerandos-intro">Limitaciones reconocidas de este bloque y qué insumos o acuerdos faltan para dar por <strong>cerrado</strong> el análisis con fines de gestión y control.</p>
  <table class="considerandos"><thead><tr><th scope="col">Considerando</th><th scope="col">Qué necesitamos para cerrar el análisis</th></tr></thead><tbody>${rows}</tbody></table>
</div>`;
}

/**
 * Si Playwright no tiene Chromium, intenta Chrome/Chromium del sistema (macOS/Linux).
 */
function tryChromeHeadlessPdf(htmlPath, pdfPath) {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  const fileUrl = pathToFileURL(path.resolve(htmlPath)).href;
  for (const bin of candidates) {
    if (!bin || !fs.existsSync(bin)) continue;
    try {
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      execFileSync(
        bin,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-pdf-header-footer",
          `--print-to-pdf=${path.resolve(pdfPath)}`,
          fileUrl,
        ],
        { stdio: "pipe", timeout: 120000 }
      );
      if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 100) {
        return true;
      }
    } catch {
      /* siguiente binario */
    }
  }
  return false;
}

(async () => {
  const a = loadAndAnalyze();
  const html = buildHtml(a);
  fs.writeFileSync(OUT_HTML, html, "utf8");
  console.log("HTML:", OUT_HTML);

  let pdfOk = false;
  try {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(OUT_HTML).href, { waitUntil: "load" });
      await page.pdf({
        path: OUT_PDF,
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
      });
      pdfOk = true;
      console.log("PDF (Playwright):", OUT_PDF);
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.warn("Playwright PDF no disponible:", (e && e.message) || e);
  }

  if (!pdfOk) {
    if (tryChromeHeadlessPdf(OUT_HTML, OUT_PDF)) {
      console.log("PDF (Chrome headless):", OUT_PDF);
      pdfOk = true;
    }
  }

  if (!pdfOk) {
    console.warn(
      "\nNo se generó PDF. Instalá Chromium para Playwright: npx playwright install chromium\n" +
        "O abrí el HTML en Chrome → Imprimir → Guardar como PDF.\n"
    );
    process.exitCode = 2;
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
