#!/usr/bin/env node
/**
 * Normaliza docs/Compras_v1.xlsx (columna A, bloques de 9) → docs/Compras_v1-Normalizado.xlsx
 * y concilia contra el libro de movimientos (Fornitalia_Movimientos.xlsx preferido).
 *
 * Solo movimientos que el informe financiero trata como compras (proxy): Egreso + cuenta contable Hornos,
 * operativo, fuera de mes no cerrado, ARS con misma lógica que generar-analisis-financiero-pdf.js (MEP si aplica).
 *
 * Regla esperado en caja: si pagado (restante null o ≤ 0,01) → Total; si restante > 0 → Total − restante.
 * Conciliación: mismo día — suma de esos egresos Hornos (mismo cliente norm., misma fecha) vs esperado_caja.
 *
 * Genera además docs/Extracto-Compras-Informe-Hornos.xlsx (solo esas operaciones + sin ARS + resumen día/cliente).
 *
 * Uso: node scripts/normalizar-y-conciliar-compras-v1.js
 */

const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const { parseComprasColumnaA } = require("./lib/compras-columna-fornitalia");
const {
  procesarMovimientosComprasInformeHornos,
  montosConcilian,
} = require("./lib/fornitalia-informe-compras-hornos");
const { normProveedor } = require("./lib/compras-columna-fornitalia");
const { resolveMovimientosXlsxPath } = require("./lib/fornitalia-docs-paths");

const ROOT = path.join(__dirname, "..");
const INPUT_COMPRAS = path.join(ROOT, "docs", "Compras_v1.xlsx");
const OUTPUT = path.join(ROOT, "docs", "Compras_v1-Normalizado.xlsx");
const OUTPUT_EXTRACTO_VISTA = path.join(
  ROOT,
  "docs",
  "Extracto-Compras-Informe-Hornos.xlsx"
);

function main() {
  if (!fs.existsSync(INPUT_COMPRAS)) {
    console.error("No existe:", INPUT_COMPRAS);
    process.exit(1);
  }
  const INPUT_EXTRACTO = resolveMovimientosXlsxPath();
  if (!fs.existsSync(INPUT_EXTRACTO)) {
    console.error("No existe libro de movimientos:", INPUT_EXTRACTO);
    process.exit(1);
  }

  const wbC = XLSX.readFile(INPUT_COMPRAS);
  const { records, warnings, sheetName } = parseComprasColumnaA(wbC);
  for (const w of warnings) console.warn("[compras]", w);

  const wbE = XLSX.readFile(INPUT_EXTRACTO);
  const mov = wbE.Sheets["Movimientos"];
  if (!mov) {
    console.error('Falta hoja "Movimientos" en extracto.');
    process.exit(1);
  }
  const rawExt = XLSX.utils.sheet_to_json(mov, { defval: null });

  const {
    egresos,
    filasEnSuma,
    filasSinArs,
    sinArs,
    resumenDiaCliente,
    tcFuente,
  } = procesarMovimientosComprasInformeHornos(rawExt, normProveedor);

  /** Suma egresos ARS mismo día y mismo cliente (todas las categorías). */
  function sumaClienteDia(clienteNorm, fechaIso) {
    let s = 0;
    let n = 0;
    for (const e of egresos) {
      if (!e.cliente_norm || e.cliente_norm !== clienteNorm) continue;
      if (e.fecha_iso !== fechaIso) continue;
      s += e.monto_ars;
      n += 1;
    }
    return { sum: s, n };
  }

  const dupKeyCount = new Map();
  for (const rec of records) {
    if (!rec.fecha_iso) continue;
    const k = `${rec.fecha_iso}|${rec.proveedor_norm}`;
    dupKeyCount.set(k, (dupKeyCount.get(k) || 0) + 1);
  }

  const filasConc = [];
  let okDia = 0;
  let sinFecha = 0;
  let sinEsperado = 0;

  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx];
    const esp = rec.esperado_caja;
    if (esp == null || !Number.isFinite(esp)) {
      sinEsperado += 1;
      filasConc.push({
        indice: idx + 1,
        fecha_iso: rec.fecha_iso,
        proveedor: rec.proveedor,
        total: rec.total,
        monto_restante: rec.monto_restante,
        pagado_total: rec.pagado_total ? "Sí" : "No",
        esperado_caja: null,
        suma_compras_Hornos_mismo_dia: null,
        movs_Hornos_dia: null,
        diferencia: null,
        ok_mismo_dia: "—",
        nota: "Sin esperado_caja (sin total)",
      });
      continue;
    }
    if (!rec.fecha_iso) {
      sinFecha += 1;
      filasConc.push({
        indice: idx + 1,
        fecha_iso: null,
        proveedor: rec.proveedor,
        total: rec.total,
        monto_restante: rec.monto_restante,
        pagado_total: rec.pagado_total ? "Sí" : "No",
        esperado_caja: esp,
        suma_compras_Hornos_mismo_dia: null,
        movs_Hornos_dia: null,
        diferencia: null,
        ok_mismo_dia: "—",
        nota: "Sin fecha",
      });
      continue;
    }

    const d = sumaClienteDia(rec.proveedor_norm, rec.fecha_iso);
    const diff = d.sum - esp;

    const kDup = `${rec.fecha_iso}|${rec.proveedor_norm}`;
    const nDup = dupKeyCount.get(kDup) || 0;
    let nota = "";
    if (nDup > 1) {
      nota =
        "Varios comprobantes mismo día y proveedor: la suma del día es compartida; ver Conciliacion_agrupada.";
    }

    const ok = montosConcilian(d.sum, esp) ? "Sí" : "No";
    if (ok === "Sí") okDia += 1;

    filasConc.push({
      indice: idx + 1,
      fecha_iso: rec.fecha_iso,
      proveedor: rec.proveedor,
      total: rec.total,
      monto_restante: rec.monto_restante,
      pagado_total: rec.pagado_total ? "Sí" : "No",
      esperado_caja: esp,
      suma_compras_Hornos_mismo_dia: d.sum,
      movs_Hornos_dia: d.n,
      diferencia: diff,
      ok_mismo_dia: ok,
      nota,
    });
  }

  const grupos = new Map();
  for (const rec of records) {
    if (!rec.fecha_iso || rec.esperado_caja == null) continue;
    const k = `${rec.fecha_iso}|${rec.proveedor_norm}`;
    if (!grupos.has(k)) {
      grupos.set(k, {
        fecha_iso: rec.fecha_iso,
        proveedor: rec.proveedor,
        proveedor_norm: rec.proveedor_norm,
        esperado_sum: 0,
        n: 0,
      });
    }
    const g = grupos.get(k);
    g.esperado_sum += rec.esperado_caja;
    g.n += 1;
  }

  const filasAgg = [];
  for (const g of grupos.values()) {
    const d = sumaClienteDia(g.proveedor_norm, g.fecha_iso);
    const diff = d.sum - g.esperado_sum;
    const ok = montosConcilian(d.sum, g.esperado_sum);
    filasAgg.push({
      fecha_iso: g.fecha_iso,
      proveedor: g.proveedor,
      n_comprobantes_archivo: g.n,
      esperado_caja_sumado: g.esperado_sum,
      suma_compras_Hornos_mismo_dia: d.sum,
      movs_Hornos_dia: d.n,
      diferencia: diff,
      ok_mismo_dia: ok ? "Sí" : "No",
    });
  }

  const rowsNorm = records.map((r) => ({
    fecha_iso: r.fecha_iso,
    proveedor: r.proveedor,
    moneda: r.moneda,
    tipo_comprobante: r.tipo_comprobante,
    importe_bruto:
      r.importe_bruto != null ? Number(r.importe_bruto) : null,
    impuestos: r.impuestos != null ? Number(r.impuestos) : null,
    total: r.total != null ? Number(r.total) : null,
    retenciones: r.retenciones != null ? Number(r.retenciones) : null,
    monto_restante:
      r.monto_restante != null ? Number(r.monto_restante) : null,
    pagado_total: r.pagado_total ? "Sí" : "No",
    esperado_caja:
      r.esperado_caja != null ? Number(r.esperado_caja) : null,
    origen_hoja: sheetName,
  }));

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbOut,
    XLSX.utils.json_to_sheet(rowsNorm),
    "Normalizado"
  );
  XLSX.utils.book_append_sheet(
    wbOut,
    XLSX.utils.json_to_sheet(filasConc),
    "Conciliacion"
  );
  XLSX.utils.book_append_sheet(
    wbOut,
    XLSX.utils.json_to_sheet(filasAgg),
    "Conciliacion_agrupada"
  );
  XLSX.writeFile(wbOut, OUTPUT);

  const wbVista = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbVista,
    XLSX.utils.json_to_sheet(filasEnSuma),
    "Compras_informe_Hornos"
  );
  XLSX.utils.book_append_sheet(
    wbVista,
    XLSX.utils.json_to_sheet(resumenDiaCliente),
    "Resumen_dia_y_cliente"
  );
  XLSX.utils.book_append_sheet(
    wbVista,
    XLSX.utils.json_to_sheet(filasSinArs),
    "Compras_Hornos_sin_ARS"
  );
  XLSX.writeFile(wbVista, OUTPUT_EXTRACTO_VISTA);

  const conCruce = records.length - sinFecha - sinEsperado;
  console.log("Creado:", OUTPUT);
  console.log("Vista compras informe (Egreso + cuenta Hornos):", OUTPUT_EXTRACTO_VISTA);
  if (tcFuente) console.log("  Tipo de cambio MEP (USD):", tcFuente);
  console.log("Comprobantes normalizados:", records.length);
  console.log(
    "Conciliación: esperado_caja vs suma compras informe (Hornos) mismo día y cliente:"
  );
  console.log("  OK mismo día:", okDia, "/", conCruce, "con fecha y esperado");
  console.log("  Sin fecha en comprobante:", sinFecha);
  console.log("  Sin esperado calculable:", sinEsperado);
  console.log(
    "  Compras Hornos con fila pero sin ARS computable:",
    sinArs
  );
  console.log(
    "Agrupados mismo día+proveedor:",
    filasAgg.length,
    "| OK mismo día:",
    filasAgg.filter((x) => x.ok_mismo_dia === "Sí").length
  );
}

main();
