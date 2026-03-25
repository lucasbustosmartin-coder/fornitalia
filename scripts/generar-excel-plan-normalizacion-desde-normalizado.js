#!/usr/bin/env node
/**
 * Lee docs/Extracto-Fornitalia-Normalizado.xlsx (hoja Normalizado; salida de
 * npm run normalizar-extracto desde Fornitalia_Movimientos.xlsx o extracto legado)
 * y genera docs/Extracto-Fornitalia-Plan-Normalizacion-GS.xlsx con columnas de acción
 * alineadas a docs/ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.md
 *
 * Uso: node scripts/generar-excel-plan-normalizacion-desde-normalizado.js
 * Opcional: ruta de entrada --in=/ruta/archivo.xlsx
 */

const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..");
const DEFAULT_IN = path.join(ROOT, "docs", "Extracto-Fornitalia-Normalizado.xlsx");
const OUT = path.join(ROOT, "docs", "Extracto-Fornitalia-Plan-Normalizacion-GS.xlsx");
const SHEET_IN = "Normalizado";

function norm(s) {
  if (s == null || s === "") return "";
  return String(s).trim();
}

function isDashOrEmpty(s) {
  const t = norm(s);
  return !t || t === "-" || t === "—";
}

function parseArgs() {
  const a = process.argv.slice(2);
  let input = DEFAULT_IN;
  for (const x of a) {
    if (x.startsWith("--in=")) input = x.slice(5);
  }
  return { input };
}

function buildCategoryFlags(cat) {
  const c = norm(cat);
  let marcar = "No";
  let rec = "";
  const lower = c.toLowerCase();

  if (!c) {
    return { marcar: "Sí", rec: "Completar categoría: obligatoriedad o flujo de excepción aprobado en origen." };
  }
  if (c === "Alquiler") {
    return {
      marcar: "Sí",
      rec: 'Actualizar categoría a «Alquileres y Servicios» (unificar con el criterio de mayor volumen en el extracto).',
    };
  }
  if (c === "Logistica") {
    return {
      marcar: "Sí",
      rec: 'Unificar criterio y ortografía: actualizar a «Logística y fletes»; alinear con movimientos en «Flete» si aplica.',
    };
  }
  if (c === "Flete") {
    return {
      marcar: "Sí",
      rec: 'Evaluar unificación con «Logística y fletes» (casi todo el volumen está bajo Logistica).',
    };
  }
  if (c === "Manteniemiento") {
    return {
      marcar: "Sí",
      rec: 'Corregir categoría a «Mantenimiento» (typo histórico).',
    };
  }
  if (c === "Transferencia") {
    return {
      marcar: "Sí",
      rec: 'Reclasificar como «Traspasos / internos» o equivalente; no mezclar con gastos operativos en reporting de resultado.',
    };
  }
  if (c === "Deposito") {
    return {
      marcar: "Sí",
      rec: 'Alinear con traspasos internos y ortografía «Depósito»; mismo criterio que transferencias entre cuentas propias.',
    };
  }
  if (c === "Otros Servicios") {
    return {
      marcar: "Sí",
      rec: 'Redistribuir a categorías específicas o crear subrubros en origen (categoría residual muy heterogénea).',
    };
  }
  if (c === "Anulación") {
    return {
      marcar: "Sí",
      rec: 'Definir política única: anulación por categoría vs flag Estado/Anulado en el sistema.',
    };
  }
  if (lower.includes("apertura") && lower.includes("caja")) {
    return {
      marcar: "Sí",
      rec: 'Movimiento no operativo: política explícita en origen (código de cuenta o exclusión de reportes de gestión).',
    };
  }
  if (lower.includes("cierre") && lower.includes("caja")) {
    return {
      marcar: "Sí",
      rec: 'Movimiento no operativo: política explícita en origen (código de cuenta o exclusión de reportes de gestión).',
    };
  }
  if (c === "Activos") {
    return {
      marcar: "Sí",
      rec: 'Acordar reporting: CAPEX vs resultado / flujo operativo (p. ej. inversión en bienes vs gasto del mes).',
    };
  }

  return { marcar, rec };
}

function buildAccountFlags(cuenta) {
  const ct = norm(cuenta);
  let marcar = "No";
  let rec = "";

  if (!ct) {
    return { marcar: "Sí", rec: "Completar cuenta contable: obligatoriedad al guardar o excepción documentada." };
  }
  if (ct === "-") {
    return {
      marcar: "Sí",
      rec: "Sustituir «-» por cuenta explícita del plan de cuentas o código de excepción trazable (el guion bloquea validaciones).",
    };
  }
  if (ct === "Comisones Ventas") {
    return { marcar: "Sí", rec: 'Corregir a «Comisiones Ventas» (typo en plan de cuentas e histórico).' };
  }
  if (ct === "Comsiones Distribuidores") {
    return { marcar: "Sí", rec: 'Corregir a «Comisiones Distribuidores».' };
  }
  if (ct === "Telefonia") {
    return { marcar: "Sí", rec: 'Unificar a «Telefonía» (una forma oficial en el maestro).' };
  }
  if (ct === "Sircreb") {
    return { marcar: "Sí", rec: 'Unificar capitalización a «SIRCREB» (criterio único en plan de cuentas).' };
  }

  return { marcar, rec };
}

function medioEsMp(medio) {
  const m = norm(medio).toLowerCase().replace(/\s+/g, "");
  return m.includes("mercadopago") || (medio && /\bmercado\s*pago\b/i.test(norm(medio)));
}

function medioEsMorba(medio) {
  const t = norm(medio).toLowerCase();
  return t.includes("morba") || t.includes("morva");
}

function buildRelationFlags(row) {
  const cat = norm(row.categoria);
  const cuenta = norm(row.cuenta_contable);
  const medio = row.medio_pago;

  let marcar = "No";
  let rec = "";

  const cuentaComisionTypo =
    cuenta === "Comisones Ventas" ||
    /comisones|comsiones/i.test(cuenta);

  if (cat === "Sueldos" && cuentaComisionTypo) {
    return {
      marcar: "Sí",
      rec: 'Par inconsistente: comisiones imputadas como «Sueldos». Migrar a categoría «Comisiones» y cuenta «Comisiones Ventas» (corregir typos en cuenta). Definir matriz oficial categoría ↔ cuenta.',
    };
  }

  if (cat === "Impuestos" && (medioEsMp(medio) || medioEsMorba(medio))) {
    return {
      marcar: "Sí",
      rec: "Categoría Impuestos con medio que no refleja naturaleza impositiva: refuerzo en descripción/observaciones o código de imputación en origen.",
    };
  }

  if (cat === "Alquiler" && cuenta && !isDashOrEmpty(cuenta) && cuenta !== "Alquiler") {
    return {
      marcar: "Sí",
      rec: 'Categoría «Alquiler» sin cuenta «Alquiler» en este extracto: revisar criterio de imputación y unificación con «Alquileres y Servicios».',
    };
  }

  if (cat === "Transferencia" && cuenta === "Transferencia entre Cuentas") {
    return {
      marcar: "Sí",
      rec: "Movimiento interno coherente en cuenta; formalizar categoría de gestión tipo «Traspasos / internos» y exclusión de ER operativo.",
    };
  }

  if (cat === "Deposito" && /deposito\s+entre\s+cuentas/i.test(cuenta)) {
    return {
      marcar: "Sí",
      rec: "Alinear ortografía de cuenta («Depósito entre cuentas») y categoría con política de traspasos internos.",
    };
  }

  return { marcar, rec };
}

function typoComisionEnTexto(descripcion, observaciones) {
  const blob = `${norm(descripcion)} ${norm(observaciones)}`;
  return /comisones|comsiones/i.test(blob);
}

function rowRequiresAction(flags) {
  return flags.some((f) => f === "Sí");
}

function main() {
  const { input } = parseArgs();
  if (!fs.existsSync(input)) {
    console.error("No existe el archivo de entrada:", input);
    process.exit(1);
  }

  const wb = XLSX.readFile(input, { cellDates: true });
  const sheet = wb.Sheets[SHEET_IN];
  if (!sheet) {
    console.error(`No se encontró la hoja "${SHEET_IN}" en`, input);
    process.exit(1);
  }

  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });

  const summary = {
    unificar_categoria: 0,
    corregir_cuenta: 0,
    revisar_relacion: 0,
    medio_vacio: 0,
    categoria_vacia: 0,
    cuenta_vacia_o_guion: 0,
    ambas_vacias: 0,
    typo_texto: 0,
    requiere_alguna_accion: 0,
    total: 0,
  };

  const outRows = raw.map((row) => {
    summary.total += 1;

    const cat = row.categoria;
    const cuenta = row.cuenta_contable;
    const medio = row.medio_pago;

    const catF = buildCategoryFlags(cat);
    const ctaF = buildAccountFlags(cuenta);
    const relF = buildRelationFlags(row);

    const medioVacio = isDashOrEmpty(medio) ? "Sí" : "No";
    const catVacia = !norm(cat) ? "Sí" : "No";
    const ctaVaciaGuion = !norm(cuenta) || norm(cuenta) === "-" ? "Sí" : "No";
    const ctaEstrictamenteVacia = !norm(cuenta) ? "Sí" : "No";
    const ambasVacias =
      catVacia === "Sí" && ctaEstrictamenteVacia === "Sí" ? "Sí" : "No";
    const typoTxt = typoComisionEnTexto(row.descripcion, row.observaciones) ? "Sí" : "No";

    if (catF.marcar === "Sí") summary.unificar_categoria += 1;
    if (ctaF.marcar === "Sí") summary.corregir_cuenta += 1;
    if (relF.marcar === "Sí") summary.revisar_relacion += 1;
    if (medioVacio === "Sí") summary.medio_vacio += 1;
    if (catVacia === "Sí") summary.categoria_vacia += 1;
    if (ctaVaciaGuion === "Sí") summary.cuenta_vacia_o_guion += 1;
    if (ambasVacias === "Sí") summary.ambas_vacias += 1;
    if (typoTxt === "Sí") summary.typo_texto += 1;

    const validacionesSistema = [];
    if (catVacia === "Sí" || ctaVaciaGuion === "Sí") {
      validacionesSistema.push("Obligatoriedad categoría y cuenta al cargar (o excepción aprobada y auditada).");
    }
    if (medioVacio === "Sí") {
      validacionesSistema.push('Catálogo cerrado de medios de pago; prohibir «-» sin valor trazable ("No informado" codificado).');
    }
    if (catF.marcar === "Sí" && norm(cat)) {
      validacionesSistema.push("Catálogo maestro de categorías sin duplicados semánticos; equivalencias valor viejo → nuevo.");
    }
    if (ctaF.marcar === "Sí" && norm(cuenta)) {
      validacionesSistema.push("Plan de cuentas único (typos, mayúsculas SIRCREB, sin guion como cuenta definitiva).");
    }
    if (relF.marcar === "Sí") {
      validacionesSistema.push("Matriz categoría ↔ cuentas permitidas con validación al guardar y flujo de excepción.");
    }
    if (typoTxt === "Sí") {
      validacionesSistema.push("Diccionario de reemplazo controlado en descripciones (p. ej. comisiones) o validación al cargar.");
    }

    const uniq = [...new Set(validacionesSistema)];
    const textoValSist = uniq.join(" ");

    const requiere =
      rowRequiresAction([
        catF.marcar,
        ctaF.marcar,
        relF.marcar,
        medioVacio,
        catVacia,
        ctaVaciaGuion,
        typoTxt,
      ]) ? "Sí" : "No";

    if (requiere === "Sí") summary.requiere_alguna_accion += 1;

    const montoOriginal =
      row.monto_original != null && row.monto_original !== ""
        ? Number(row.monto_original)
        : null;
    const tipoCambio =
      row.tipo_cambio != null && row.tipo_cambio !== "" ? Number(row.tipo_cambio) : null;
    const montoArs = row.monto_ars != null && row.monto_ars !== "" ? Number(row.monto_ars) : null;

    return {
      fecha_original: row.fecha_original ?? null,
      fecha_iso: row.fecha_iso ?? null,
      hora: row.hora ?? null,
      nro_operacion: row.nro_operacion ?? null,
      tipo_movimiento: row.tipo_movimiento ?? null,
      medio_pago: row.medio_pago ?? null,
      cliente: row.cliente ?? null,
      descripcion: row.descripcion ?? null,
      observaciones: row.observaciones ?? null,
      categoria: row.categoria ?? null,
      cuenta_contable: row.cuenta_contable ?? null,
      moneda: row.moneda ?? null,
      monto_original: Number.isFinite(montoOriginal) ? montoOriginal : null,
      tipo_cambio: Number.isFinite(tipoCambio) ? tipoCambio : null,
      monto_ars: Number.isFinite(montoArs) ? montoArs : null,
      mes_anio: row.mes_anio ?? null,
      usuario: row.usuario ?? null,
      estado: row.estado ?? null,
      marcar_unificar_categoria: catF.marcar,
      recomendacion_categoria: catF.rec || null,
      marcar_corregir_cuenta_contable: ctaF.marcar,
      recomendacion_cuenta_contable: ctaF.rec || null,
      marcar_revisar_relacion_categoria_cuenta: relF.marcar,
      recomendacion_relacion_categoria_cuenta: relF.rec || null,
      medio_pago_vacio_o_guion: medioVacio,
      categoria_vacia: catVacia,
      cuenta_vacia_o_guion: ctaVaciaGuion,
      categoria_y_cuenta_ambas_sin_valor: ambasVacias,
      posible_typo_comision_en_descripcion_u_obs: typoTxt,
      requiere_accion_normalizacion: requiere,
      validaciones_sistema_sugeridas_fila: textoValSist || null,
    };
  });

  const wsMov = XLSX.utils.json_to_sheet(outRows);

  const validacionesSistemaRows = [
    ["Ámbito", "Validación o regla sostenible", "Referencia informe"],
    [
      "Maestro categorías",
      "Catálogo cerrado, sin duplicados semánticos (ej. una sola familia Alquileres y servicios, Logística y fletes).",
      "§1, §6, §8.1",
    ],
    [
      "Plan de cuentas",
      "Nombres oficiales únicos; sin variantes por mayúsculas ni typos; prohibido «-» como cuenta definitiva.",
      "§2, §6",
    ],
    [
      "Matriz categoría ↔ cuenta",
      "Lista de pares permitidos (o cuenta por defecto + alternativas); rechazo o alerta al cargar si el par no está en la matriz.",
      "§3, §8.1–8.3",
    ],
    [
      "Carga obligatoria",
      "No permitir guardar movimiento sin categoría y sin cuenta (salvo flujo de excepción documentado y trazable).",
      "§2, §6",
    ],
    [
      "Medios de pago",
      "Catálogo cerrado y formato uniforme (ej. Transferencia - Galicia); reglas de moneda por medio acordadas.",
      "§4, §6",
    ],
    [
      "Traspasos internos",
      "Política explícita para transferencias entre cuentas propias: categoría de gestión y exclusión de ER operativo si aplica.",
      "§1, §6",
    ],
    [
      "CAPEX / Activos",
      "Criterio documentado para inversión en bienes vs gasto del período en reporting.",
      "§1, §6",
    ],
    [
      "Otros / residuales",
      "Control de categorías tipo «Otros Servicios»: redistribución o subrubros; evitar crecimiento descontrolado.",
      "§1, §6",
    ],
    [
      "Texto (descripción / observaciones)",
      "Criterio de uso de campos o texto consolidado en export; corrección de typos recurrentes (p. ej. comisiones).",
      "§5",
    ],
    [
      "Histórico y migraciones",
      "Tabla de equivalencias valor viejo → valor nuevo para auditoría y reportes multi-año.",
      "§8.1",
    ],
    [
      "Impuestos y reporting",
      "Agrupadores impositivos para reporting; mapeo cuenta por cuenta en plan maestro (alto volumen en extracto).",
      "§3, §8.4",
    ],
  ];
  const wsVal = XLSX.utils.aoa_to_sheet(validacionesSistemaRows);

  const resumenRows = [
    ["Métrica", "Cantidad de filas", "Notas"],
    ["Total filas analizadas", summary.total, "Hoja Normalizado de entrada"],
    ["Marcar unificar / reclasificar categoría (reglas automáticas)", summary.unificar_categoria, "Ver columna marcar_unificar_categoria"],
    ["Marcar corregir cuenta contable", summary.corregir_cuenta, "Typos, vacío, guion"],
    ["Marcar revisar relación categoría–cuenta", summary.revisar_relacion, "Matriz e incoherencias documentadas"],
    ["Medio de pago vacío o guion", summary.medio_vacio, "Completar o valor codificado"],
    ["Categoría vacía", summary.categoria_vacia, ""],
    ["Cuenta vacía o guion", summary.cuenta_vacia_o_guion, ""],
    ["Categoría y cuenta vacías (ambas)", summary.ambas_vacias, ""],
    ["Posible typo comisión en descripción u observaciones", summary.typo_texto, ""],
    [
      "Requiere al menos una acción de normalización (cualquier bandera)",
      summary.requiere_alguna_accion,
      "Columna requiere_accion_normalizacion = Sí",
    ],
  ];
  const wsRes = XLSX.utils.aoa_to_sheet(resumenRows);

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, wsMov, "Movimientos_plan_GS");
  XLSX.utils.book_append_sheet(wbOut, wsVal, "Validaciones_sistema");
  XLSX.utils.book_append_sheet(wbOut, wsRes, "Resumen_conteos");

  XLSX.writeFile(wbOut, OUT);

  console.log("Creado:", OUT);
  console.log("Filas:", summary.total, "| Requieren acción:", summary.requiere_alguna_accion);
}

main();
