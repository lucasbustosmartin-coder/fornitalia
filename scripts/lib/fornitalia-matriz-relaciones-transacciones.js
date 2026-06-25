/**
 * Matriz de relaciones cat/cuenta/costo y proveedores (misma lógica que
 * generar-matriz-relaciones-transacciones.js). Uso en Node y en el dashboard (global).
 */
const CATEGORIAS_EXCLUIDAS = new Set([
  'Impuestos',
  'MP - Costo Financiero',
  'Ventas',
  'Comisiones Morvalab',
]);

const SIN_PROVEEDOR = '(Sin proveedor)';
const STATUS_CONFIRMADO = 'Confirmado';

const SHEET_MATRIZ_COSTO = 'Matriz_Cat_Cuenta_Costo';
/** Verde claro: cat/cuenta vieja con una sola combinación nueva en la matriz. */
const MATRIZ_COSTO_FILL_RELACION_UNICA = 'E2F0D9';
const SHEET_CAT_CUENTA_CRUCE = 'Cat_x_Cuenta_Registros';
const SHEET_PROV_DETALLE = 'Proveedores_Egreso';
const SHEET_PROV_AGRUP = 'Proveedores_por_Cat_Cuenta';

function normalizeText(value) {
  if (value == null || value === undefined) return '';
  return String(value).trim();
}

function statusDesdeFila(r) {
  return normalizeText(r.status != null ? r.status : (r.Status != null ? r.Status : r.estado));
}

function esStatusConfirmado(r) {
  return statusDesdeFila(r).localeCompare(STATUS_CONFIRMADO, 'es', { sensitivity: 'base' }) === 0;
}

function categoriaExcluida(cat) {
  return CATEGORIAS_EXCLUIDAS.has(normalizeText(cat));
}

/** Matriz costo y proveedores: excluye categorías operativas/financieras fijas. */
function filtrarPorCategoria(rows) {
  return rows.filter((r) => !categoriaExcluida(r.nueva_categoria));
}

/** Solapa Cat_x_Cuenta_Registros: solo status Confirmado (sin filtro por categoría). */
function filtrarSoloConfirmados(rows) {
  return rows.filter(esStatusConfirmado);
}

function textoCampoDesdeFila(r, keys) {
  for (let i = 0; i < keys.length; i++) {
    const val = normalizeText(r[keys[i]]);
    if (val) return val;
  }
  return '';
}

function efItemDesdeFila(r) {
  return textoCampoDesdeFila(r, ['ef_item', 'EF_Item', 'EF Item']);
}

function efSubitemDesdeFila(r) {
  return textoCampoDesdeFila(r, ['ef_subitem', 'EF_SubItem', 'EF SubItem', 'EF_Subitem']);
}

function categoriaViejaDesdeFila(r) {
  return textoCampoDesdeFila(r, ['categoria', 'Categoria', 'categoria_original']);
}

function cuentaViejaDesdeFila(r) {
  return textoCampoDesdeFila(r, ['cuenta_contable', 'Cuenta_Contable', 'cuenta contable']);
}

function nuevaCategoriaDesdeFila(r) {
  return textoCampoDesdeFila(r, ['nueva_categoria', 'Nueva_Categoria', 'Nueva Categoria']);
}

function nuevaCuentaDesdeFila(r) {
  return textoCampoDesdeFila(r, ['nueva_cuenta_contable', 'Nueva_Cuenta_Contable', 'Nueva Cuenta Contable']);
}

function normProveedorKey(s) {
  return normalizeText(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function flagCosto(value) {
  const s = normalizeText(value).toUpperCase();
  if (s === 'Y' || s === 'N') return s;
  if (s === 'S' || s === 'SI' || s === 'YES') return 'Y';
  if (s === 'NO') return 'N';
  return normalizeText(value) || '';
}

function proveedorDesdeCliente(clienteRaw, canonPorNorm) {
  const raw = normalizeText(clienteRaw);
  if (!raw) return SIN_PROVEEDOR;
  const key = normProveedorKey(raw);
  return canonPorNorm.get(key) || raw;
}

function proveedorExcluido(prov) {
  return normalizeText(prov) === SIN_PROVEEDOR;
}

function comboCatCuentaLabel(cat, cuenta) {
  return `${cat} → ${cuenta}`;
}

function buildCanonProveedorPorNorm(rowsEgreso) {
  const freq = new Map();
  for (const r of rowsEgreso) {
    const raw = normalizeText(r.cliente);
    if (!raw) continue;
    const key = normProveedorKey(raw);
    if (!key) continue;
    if (!freq.has(key)) freq.set(key, new Map());
    const m = freq.get(key);
    m.set(raw, (m.get(raw) || 0) + 1);
  }
  const canon = new Map();
  for (const [key, m] of freq) {
    let best = '';
    let bestN = -1;
    for (const [display, n] of m) {
      if (n > bestN || (n === bestN && display.localeCompare(best, 'es', { sensitivity: 'base' }) < 0)) {
        best = display;
        bestN = n;
      }
    }
    canon.set(key, best);
  }
  return canon;
}

function contarFilasMatrizPorVieja(matrizCosto) {
  const counts = new Map();
  for (const e of matrizCosto) {
    const k = `${e.catVieja}\t${e.cuentaVieja}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

/** Marca filas donde (cat vieja, cuenta vieja) tiene una única fila en la matriz. */
function marcarRelacionUnicaVieja(matrizCosto) {
  const counts = contarFilasMatrizPorVieja(matrizCosto);
  for (const e of matrizCosto) {
    const k = `${e.catVieja}\t${e.cuentaVieja}`;
    e.relacionUnicaVieja = counts.get(k) === 1;
  }
  return matrizCosto;
}

function excelSolidFill(rgb) {
  const hex = String(rgb || 'FFFFFF').replace('#', '').toUpperCase();
  const argb = hex.length === 6 ? `FF${hex}` : hex;
  return { patternType: 'solid', fgColor: { rgb: argb }, bgColor: { rgb: argb } };
}

/**
 * Hoja Matriz_Cat_Cuenta_Costo con relleno verde claro en filas de relación única vieja→nueva.
 * Requiere XLSX con soporte de estilos (xlsx-js-style).
 */
function buildMatrizCostoWorksheet(XLSX, sheetAoa, matrizCosto) {
  const ws = XLSX.utils.aoa_to_sheet(sheetAoa);
  const fill = excelSolidFill(MATRIZ_COSTO_FILL_RELACION_UNICA);
  const numCols = sheetAoa[0] ? sheetAoa[0].length : 0;
  const expandRef = (r, c) => {
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    if (r > range.e.r) range.e.r = r;
    if (c > range.e.c) range.e.c = c;
    ws['!ref'] = XLSX.utils.encode_range(range);
  };
  for (let i = 0; i < matrizCosto.length; i++) {
    if (!matrizCosto[i].relacionUnicaVieja) continue;
    const r = i + 1;
    for (let c = 0; c < numCols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) {
        ws[addr] = { t: 's', v: '' };
        expandRef(r, c);
      }
      const prev = ws[addr].s || {};
      ws[addr].s = { ...prev, fill };
    }
  }
  return ws;
}

function buildMatrizCosto(rows) {
  const map = new Map();
  for (const r of rows) {
    const catVieja = categoriaViejaDesdeFila(r);
    const cuentaVieja = cuentaViejaDesdeFila(r);
    const catNueva = nuevaCategoriaDesdeFila(r);
    const cuentaNueva = nuevaCuentaDesdeFila(r);
    const efItem = efItemDesdeFila(r);
    const efSubitem = efSubitemDesdeFila(r);
    const cd = flagCosto(r.costo_directo);
    const ci = flagCosto(r.costo_indirecto);
    const k = [catVieja, cuentaVieja, catNueva, cuentaNueva, efItem, efSubitem, cd, ci].join('\t');
    if (!map.has(k)) {
      map.set(k, {
        catVieja,
        cuentaVieja,
        catNueva,
        cuentaNueva,
        efItem,
        efSubitem,
        cd,
        ci,
        n: 0,
        ing: 0,
        egr: 0,
      });
    }
    const o = map.get(k);
    o.n += 1;
    const tipo = normalizeText(r.tipo_movimiento);
    if (tipo === 'Ingreso') o.ing += 1;
    else if (tipo === 'Egreso') o.egr += 1;
  }
  return marcarRelacionUnicaVieja([...map.values()]).sort((a, b) => {
    const c = a.catNueva.localeCompare(b.catNueva, 'es', { sensitivity: 'base' });
    if (c !== 0) return c;
    const u = a.cuentaNueva.localeCompare(b.cuentaNueva, 'es', { sensitivity: 'base' });
    if (u !== 0) return u;
    const cv = a.catVieja.localeCompare(b.catVieja, 'es', { sensitivity: 'base' });
    if (cv !== 0) return cv;
    const uv = a.cuentaVieja.localeCompare(b.cuentaVieja, 'es', { sensitivity: 'base' });
    if (uv !== 0) return uv;
    const ei = a.efItem.localeCompare(b.efItem, 'es', { sensitivity: 'base' });
    if (ei !== 0) return ei;
    const es = a.efSubitem.localeCompare(b.efSubitem, 'es', { sensitivity: 'base' });
    if (es !== 0) return es;
    const d = a.cd.localeCompare(b.cd, 'es');
    if (d !== 0) return d;
    return a.ci.localeCompare(b.ci, 'es');
  });
}

function buildProveedoresEgreso(rowsEgreso, canonPorNorm) {
  const map = new Map();
  for (const r of rowsEgreso) {
    const cat = normalizeText(r.nueva_categoria);
    const cuenta = normalizeText(r.nueva_cuenta_contable);
    const prov = proveedorDesdeCliente(r.cliente, canonPorNorm);
    if (proveedorExcluido(prov)) continue;
    const k = `${cat}\t${cuenta}\t${prov}`;
    if (!map.has(k)) map.set(k, { cat, cuenta, prov, n: 0 });
    map.get(k).n += 1;
  }
  return [...map.values()].sort((a, b) => {
    const c = a.cat.localeCompare(b.cat, 'es', { sensitivity: 'base' });
    if (c !== 0) return c;
    const u = a.cuenta.localeCompare(b.cuenta, 'es', { sensitivity: 'base' });
    if (u !== 0) return u;
    return a.prov.localeCompare(b.prov, 'es', { sensitivity: 'base' });
  });
}

/** Tabla cruzada: filas = Nueva Categoria, columnas = Cuenta Contable, valores = # registros. */
function buildMatrizCatCuentaCruceAoa(rows) {
  const counts = new Map();
  const cats = new Set();
  const cuentas = new Set();
  for (const r of rows) {
    const cat = normalizeText(r.nueva_categoria);
    const cuenta = normalizeText(r.nueva_cuenta_contable);
    cats.add(cat);
    cuentas.add(cuenta);
    const k = `${cat}\t${cuenta}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const catsSorted = [...cats].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const cuentasSorted = [...cuentas].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const header = ['Nueva Categoria', ...cuentasSorted, 'Total'];
  const aoa = [header];
  for (const cat of catsSorted) {
    let rowTotal = 0;
    const row = [cat];
    for (const cuenta of cuentasSorted) {
      const n = counts.get(`${cat}\t${cuenta}`) || 0;
      row.push(n);
      rowTotal += n;
    }
    row.push(rowTotal);
    aoa.push(row);
  }
  const colTotals = ['Total'];
  let grand = 0;
  for (const cuenta of cuentasSorted) {
    let t = 0;
    for (const cat of catsSorted) {
      t += counts.get(`${cat}\t${cuenta}`) || 0;
    }
    colTotals.push(t);
    grand += t;
  }
  colTotals.push(grand);
  aoa.push(colTotals);
  return { aoa, categorias: catsSorted.length, cuentas: cuentasSorted.length };
}

function buildProveedoresPorProveedor(detalle) {
  const map = new Map();
  for (const row of detalle) {
    if (!map.has(row.prov)) {
      map.set(row.prov, { prov: row.prov, combos: new Map() });
    }
    const comboKey = `${row.cat}\t${row.cuenta}`;
    const o = map.get(row.prov);
    if (!o.combos.has(comboKey)) {
      o.combos.set(comboKey, { cat: row.cat, cuenta: row.cuenta, n: 0 });
    }
    o.combos.get(comboKey).n += row.n;
  }
  return [...map.values()]
    .map((o) => {
      const combos = [...o.combos.values()].sort((a, b) => {
        const c = a.cat.localeCompare(b.cat, 'es', { sensitivity: 'base' });
        if (c !== 0) return c;
        return a.cuenta.localeCompare(b.cuenta, 'es', { sensitivity: 'base' });
      });
      const lista = combos.map((c) => comboCatCuentaLabel(c.cat, c.cuenta));
      return {
        prov: o.prov,
        cant: combos.length,
        lista: lista.join(' | '),
        combos,
      };
    })
    .sort((a, b) => a.prov.localeCompare(b.prov, 'es', { sensitivity: 'base' }));
}

/**
 * @param {object[]} rowsAll filas con categoria, cuenta_contable, nueva_categoria, nueva_cuenta_contable, ef_item, ef_subitem, costo_directo, costo_indirecto, tipo_movimiento, cliente
 * @param {{ origenLabel?: string }} [opts]
 */
function buildMatrizRelacionesExcelData(rowsAll, opts = {}) {
  const origenLabel = opts.origenLabel || 'transacciones (Supabase)';
  /** Matriz_Cat_Cuenta_Costo: sin exclusiones; cada fila de origen cuenta una vez. */
  const rowsMatrizCosto = rowsAll;
  const rowsMatrizProveedores = filtrarPorCategoria(rowsAll);
  const rowsEgreso = rowsMatrizProveedores.filter((r) => normalizeText(r.tipo_movimiento) === 'Egreso');
  const canonPorNorm = buildCanonProveedorPorNorm(rowsEgreso);
  const matrizCosto = buildMatrizCosto(rowsMatrizCosto);
  const matrizCostoRegistrosSum = matrizCosto.reduce((s, e) => s + e.n, 0);
  const matrizCostoRelacionUnica = matrizCosto.filter((e) => e.relacionUnicaVieja).length;
  const rowsCatCuenta = filtrarSoloConfirmados(rowsAll);
  const catCuentaCruce = buildMatrizCatCuentaCruceAoa(rowsCatCuenta);
  const provDetalle = buildProveedoresEgreso(rowsEgreso, canonPorNorm);
  const provPorProveedor = buildProveedoresPorProveedor(provDetalle);

  const sheets = {
    [SHEET_MATRIZ_COSTO]: [
      [
        'Categoria Vieja',
        'Cuenta Contable Vieja',
        'Categoria Nueva',
        'Cuenta Contable Nueva',
        'EF Item',
        'EF SubItem',
        'Costo Directo',
        'Costo Indirecto',
        '# Registros',
        '# Ingresos',
        '# Egresos',
      ],
      ...matrizCosto.map((e) => [
        e.catVieja,
        e.cuentaVieja,
        e.catNueva,
        e.cuentaNueva,
        e.efItem,
        e.efSubitem,
        e.cd,
        e.ci,
        e.n,
        e.ing,
        e.egr,
      ]),
    ],
    [SHEET_CAT_CUENTA_CRUCE]: catCuentaCruce.aoa,
    [SHEET_PROV_DETALLE]: [
      ['Nueva Categoria', 'Nueva Cuenta Contable', 'Proveedor', '# Registros'],
      ...provDetalle.map((e) => [e.cat, e.cuenta, e.prov, e.n]),
    ],
    [SHEET_PROV_AGRUP]: [
      ['Proveedor', 'Cantidad Combinaciones', 'Nueva Categoria y Cuenta Contable (elegibles)'],
      ...provPorProveedor.map((e) => [e.prov, e.cant, e.lista]),
    ],
    README: [
      ['Origen', origenLabel],
      ['Registros totales (origen)', rowsAll.length],
      ['Registros en Matriz_Cat_Cuenta_Costo (sin exclusiones)', rowsMatrizCosto.length],
      ['Suma columna # Registros (Matriz_Cat_Cuenta_Costo)', matrizCostoRegistrosSum],
      ['Registros tras exclusion categoria (solo proveedores)', rowsMatrizProveedores.length],
      ['Registros Egreso (proveedores)', rowsEgreso.length],
      ['Categorias excluidas (solo proveedores)', [...CATEGORIAS_EXCLUIDAS].sort().join('; ')],
      ['Combinaciones matriz costo (cat vieja/nueva, cuenta, EF, costos)', matrizCosto.length],
      [
        'Solapa Cat_x_Cuenta_Registros',
        `${catCuentaCruce.categorias} categorías × ${catCuentaCruce.cuentas} cuentas; filtro solo status Confirmado; ${rowsCatCuenta.length} registros`,
      ],
      ['Filas Proveedor (detalle)', provDetalle.length],
      ['Proveedores (agrupado)', provPorProveedor.length],
      [
        'Nota Matriz_Cat_Cuenta_Costo',
        'Sin exclusiones por categoria ni status: la suma de # Registros debe coincidir con el total de filas de origen (mismo universo que transacciones cargadas en el dashboard, tipicamente sin Anulado). Combinacion unica por cat/cuenta vieja y nueva, ef_item, ef_subitem y costos.',
      ],
      [
        'Filas verde claro (Matriz_Cat_Cuenta_Costo)',
        `${matrizCostoRelacionUnica} filas: la pareja Categoria Vieja + Cuenta Contable Vieja tiene una unica relacion (categoria/cuenta nueva, EF y costos) en toda la matriz.`,
      ],
      [
        'Nota Proveedor',
        'Cliente normalizado (trim, sin acentos, espacios); canónico = variante más frecuente; egresos sin cliente omitidos de solapas de proveedor',
      ],
      [
        'Nota solapa agrupada',
        'Proveedor en primera columna; combinaciones elegibles = Nueva Categoria → Nueva Cuenta Contable vistas en egresos',
      ],
    ],
  };

  return {
    sheets,
    matrizCosto,
    stats: {
      rowsAll: rowsAll.length,
      rowsMatrizCosto: rowsMatrizCosto.length,
      matrizCostoRegistrosSum,
      matrizCostoRelacionUnica,
      rowsFiltered: rowsMatrizProveedores.length,
      rowsConfirmados: rowsCatCuenta.length,
      rowsEgreso: rowsEgreso.length,
      matrizCosto: matrizCosto.length,
      catCuentaCruceCategorias: catCuentaCruce.categorias,
      catCuentaCruceCuentas: catCuentaCruce.cuentas,
      provDetalle: provDetalle.length,
      provPorProveedor: provPorProveedor.length,
    },
  };
}

const api = {
  CATEGORIAS_EXCLUIDAS,
  STATUS_CONFIRMADO,
  SIN_PROVEEDOR,
  SHEET_MATRIZ_COSTO,
  SHEET_CAT_CUENTA_CRUCE,
  SHEET_PROV_DETALLE,
  SHEET_PROV_AGRUP,
  buildMatrizRelacionesExcelData,
  buildMatrizCostoWorksheet,
  marcarRelacionUnicaVieja,
  MATRIZ_COSTO_FILL_RELACION_UNICA,
  normalizeText,
  textoCampoDesdeFila,
  efItemDesdeFila,
  efSubitemDesdeFila,
  filtrarPorCategoria,
  statusDesdeFila,
  esStatusConfirmado,
  filtrarSoloConfirmados,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.FornitaliaMatrizRelaciones = api;
}
