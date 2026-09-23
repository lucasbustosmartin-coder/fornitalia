/**
 * Matriz EF – Fornitalia
 * ABM categoría + cuenta + tipo Ingreso/Egreso → ítem y subítem del Estado Financiero,
 * y ABM del árbol ef_estructura en la misma solapa.
 * Nombres = tesorería. window.FornitaliaMatrizEf.init({ client, hasPerm, getRoot, getFilasFlujo, getEfEstructura, onEstructuraChange, onRemapEfFilas })
 */
(function (global) {
  'use strict';

  var PERM_VER = 'ver_matriz_ef';
  var PERM_EDITAR = 'editar_matriz_ef';

  var ICO = {
    grid: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>'
  };

  var opts = {
    client: null,
    hasPerm: function () { return true; },
    getRoot: function () { return null; },
    getFilasFlujo: function () { return []; },
    getEfEstructura: function () { return []; },
    onEstructuraChange: null,
    onRemapEfFilas: null
  };

  var state = {
    mounted: false,
    loading: false,
    lista: 'relaciones',
    rows: [],
    estRows: [],
    q: '',
    editingId: null,
    form: null,
    estForm: null,
    msg: '',
    err: '',
    sortKey: 'categoria',
    sortDir: 'asc',
    estSortKey: 'orden',
    estSortDir: 'asc'
  };

  function client() { return opts.client; }
  function can(perm) { return typeof opts.hasPerm === 'function' ? opts.hasPerm(perm) : true; }
  function root() { return typeof opts.getRoot === 'function' ? opts.getRoot() : null; }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function htmlUsuario() {
    if (!global.FornitaliaUsuario) return '<span class="lyp-user">—</span>';
    return FornitaliaUsuario.celdaDe.apply(FornitaliaUsuario, arguments);
  }

  function textoUsuario() {
    if (!global.FornitaliaUsuario) return '';
    return FornitaliaUsuario.textoDe.apply(FornitaliaUsuario, arguments) || '';
  }

  async function cargarUsuarios() {
    if (!global.FornitaliaUsuario || !client()) return;
    try { await FornitaliaUsuario.cargar(client()); } catch (e) { /* no cortar la vista */ }
  }

  function errMsg(e) {
    if (!e) return 'Error desconocido.';
    return e.message || e.error_description || String(e);
  }

  function clave(cat, cta, tipo) {
    return String(cat || '').trim().toLowerCase() + '\t' + String(cta || '').trim().toLowerCase() + '\t' + String(tipo || '').trim();
  }

  function clavePar(cat, cta) {
    return String(cat || '').trim().toLowerCase() + '\t' + String(cta || '').trim().toLowerCase();
  }

  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/:$/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function codigoNorm(c) {
    return String(c || '').trim().toUpperCase();
  }

  function nivelDeTipo(tipo) {
    if (tipo === 'seccion') return 0;
    if (tipo === 'total') return 2;
    return 1;
  }

  function tipoDeNivel(nivel) {
    var n = Number(nivel);
    if (n === 0) return 'seccion';
    if (n === 2) return 'total';
    return 'subitem';
  }

  function labelTipo(tipo) {
    if (tipo === 'seccion') return 'Sección';
    if (tipo === 'total') return 'Total / fórmula';
    return 'Subítem';
  }

  function esCodigoSeccionProtegido(cod) {
    var c = String(cod || '').trim();
    return c === '1' || c === '2' || c === '3' || c === '4' || c === '5' || c === '6';
  }

  function esCodigoTotalProtegido(cod) {
    var c = codigoNorm(cod);
    return c === 'A' || c === 'B' || c === 'C' || c === 'D';
  }

  function esCodigoSubitemProtegido(cod) {
    var c = String(cod || '').trim();
    return c === '6.1' || c === '6.2' || c === '6.3';
  }

  function esSubitemRatio(sub) {
    var k = normKey(sub);
    return k === 'cobranzas por ventas (efectivo neto ingresado)' || k === 'comisiones por ventas';
  }

  function formVacio() {
    return {
      id: null,
      categoria: '',
      cuenta_contable: '',
      tipo_movimiento: 'Egreso',
      ef_item: '',
      ef_subitem: '',
      costo_directo: '',
      costo_indirecto: '',
      vigente: true,
      notas: ''
    };
  }

  function primerItemSeccion() {
    var rows = state.estRows || [];
    for (var i = 0; i < rows.length; i++) {
      if (Number(rows[i].nivel) === 0 && String(rows[i].ef_item || '').trim()) {
        return String(rows[i].ef_item).trim();
      }
    }
    return '';
  }

  function formEstVacio() {
    var item = primerItemSeccion();
    return {
      id: null,
      tipo: 'subitem',
      orden: '',
      codigo: item ? sugerirCodigoSubitem(item) : '',
      ef_item: item,
      ef_subitem: '',
      signo: '-',
      naturaleza: ''
    };
  }

  function esTraspaso(cat) {
    var t = String(cat || '').trim();
    if (t === 'Transferencia' || t === 'Apertura' || t === 'Cierre') return true;
    var n = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return n === 'deposito';
  }

  function filasSinRelacion() {
    var map = {};
    var mapPar = {};
    (state.rows || []).forEach(function (r) {
      if (r.vigente === false) return;
      if (!String(r.ef_subitem || '').trim()) return;
      map[clave(r.categoria, r.cuenta_contable, r.tipo_movimiento)] = true;
      mapPar[clavePar(r.categoria, r.cuenta_contable)] = true;
    });
    var seen = {};
    var out = [];
    var filas = typeof opts.getFilasFlujo === 'function' ? (opts.getFilasFlujo() || []) : [];
    filas.forEach(function (f) {
      var cat = String(f.nueva_categoria || f.categoria || '').trim();
      var cta = String(f.nueva_cuenta_contable || f.cuenta_contable || '').trim();
      var tipo = String(f.tipo_movimiento || '').trim();
      if (!cat || !cta || !tipo) return;
      if (esTraspaso(cat) || esTraspaso(f.categoria)) return;
      if (String(f.ef_subitem || '').trim()) return;
      var k = clave(cat, cta, tipo);
      if (map[k] || mapPar[clavePar(cat, cta)] || seen[k]) return;
      seen[k] = true;
      out.push({ categoria: cat, cuenta_contable: cta, tipo_movimiento: tipo });
    });
    out.sort(function (a, b) {
      return (a.categoria + a.cuenta_contable + a.tipo_movimiento).localeCompare(b.categoria + b.cuenta_contable + b.tipo_movimiento, 'es');
    });
    return out;
  }

  function itemsEf() {
    var estruct = state.estRows && state.estRows.length
      ? state.estRows
      : (typeof opts.getEfEstructura === 'function' ? (opts.getEfEstructura() || []) : []);
    var set = {};
    estruct.forEach(function (r) {
      var it = String(r.ef_item || '').trim();
      if (it) set[it] = true;
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  function seccionesEf() {
    var out = [];
    var seen = {};
    (state.estRows || []).forEach(function (r) {
      if (Number(r.nivel) !== 0) return;
      var it = String(r.ef_item || '').trim();
      if (!it || seen[it]) return;
      seen[it] = true;
      out.push({ id: r.id, codigo: r.codigo, ef_item: it, orden: r.orden });
    });
    return out;
  }

  function subitemsEf(item) {
    var estruct = state.estRows && state.estRows.length
      ? state.estRows
      : (typeof opts.getEfEstructura === 'function' ? (opts.getEfEstructura() || []) : []);
    var set = {};
    estruct.forEach(function (r) {
      if (Number(r.nivel) !== 1) return;
      if (item && String(r.ef_item || '').trim() !== item) return;
      var s = String(r.ef_subitem || '').trim();
      if (s) set[s] = true;
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  function relacionesDeSubitem(sub) {
    var k = normKey(sub);
    if (!k) return [];
    return (state.rows || []).filter(function (r) { return normKey(r.ef_subitem) === k; });
  }

  function hijosDeItem(item) {
    var it = String(item || '').trim();
    return (state.estRows || []).filter(function (r) {
      return Number(r.nivel) !== 0 && String(r.ef_item || '').trim() === it;
    });
  }

  function maxOrden() {
    var m = 0;
    (state.estRows || []).forEach(function (r) {
      var n = Number(r.orden);
      if (Number.isFinite(n) && n > m) m = n;
    });
    return m;
  }

  function sugerirCodigoSubitem(item) {
    var prefix = '';
    (state.estRows || []).forEach(function (r) {
      if (Number(r.nivel) === 0 && String(r.ef_item || '').trim() === String(item || '').trim()) {
        prefix = String(r.codigo || '').trim();
      }
    });
    var n = 0;
    (state.estRows || []).forEach(function (r) {
      if (Number(r.nivel) !== 1) return;
      if (String(r.ef_item || '').trim() !== String(item || '').trim()) return;
      var m = String(r.codigo || '').trim().match(/^(\d+)\.(\d+)$/);
      if (m && (!prefix || m[1] === prefix)) n = Math.max(n, Number(m[2]));
    });
    if (prefix) return prefix + '.' + (n + 1);
    return '';
  }

  function ordenInsercionSubitem(item) {
    var lastSub = null;
    var secOrden = null;
    (state.estRows || []).forEach(function (r) {
      if (String(r.ef_item || '').trim() !== String(item || '').trim()) return;
      if (Number(r.nivel) === 0) secOrden = Number(r.orden);
      if (Number(r.nivel) === 1) {
        var o = Number(r.orden);
        if (lastSub == null || o > lastSub) lastSub = o;
      }
    });
    if (lastSub != null) return lastSub + 1;
    if (secOrden != null) return secOrden + 1;
    return maxOrden() + 1;
  }

  function ordenInsercionTotal(item) {
    var last = null;
    (state.estRows || []).forEach(function (r) {
      if (String(r.ef_item || '').trim() !== String(item || '').trim()) return;
      var o = Number(r.orden);
      if (last == null || o > last) last = o;
    });
    return last != null ? last + 1 : maxOrden() + 1;
  }

  function motivoBloqueoBaja(row) {
    if (!row) return 'No se encontró el renglón.';
    var niv = Number(row.nivel);
    if (niv === 0) {
      if (esCodigoSeccionProtegido(row.codigo)) {
        return 'La sección ' + String(row.codigo).trim() + ' entra en las fórmulas del Estado Financiero (totales A–D). No se puede borrar.';
      }
      var hijos = hijosDeItem(row.ef_item);
      if (hijos.length) {
        return 'Tiene ' + hijos.length + ' línea(s) hija(s). Borralas o reasignalas antes.';
      }
    }
    if (niv === 2 && esCodigoTotalProtegido(row.codigo)) {
      return 'El total ' + String(row.codigo).trim() + ' es una fórmula del Estado Financiero. No se puede borrar.';
    }
    if (niv === 1) {
      if (esCodigoSubitemProtegido(row.codigo)) {
        return 'El código ' + String(row.codigo).trim() + ' entra en el Flujo neto del período (D). No se puede borrar.';
      }
      if (esSubitemRatio(row.ef_subitem)) {
        return 'Este subítem alimenta los ratios del Flujo de caja. No se puede borrar.';
      }
      var rel = relacionesDeSubitem(row.ef_subitem);
      if (rel.length) {
        var nRel = rel.length;
        return (nRel === 1
          ? 'Hay 1 relación en la matriz apuntando a este subítem. '
          : 'Hay ' + nRel + ' relaciones en la matriz apuntando a este subítem. ') +
          'Cambiá o quitá esas relaciones antes de borrar el renglón.';
      }
    }
    return null;
  }

  function codigoDuplicado(codigo, exceptId) {
    var c = codigoNorm(codigo);
    if (!c) return false;
    return (state.estRows || []).some(function (r) {
      if (exceptId && String(r.id) === String(exceptId)) return false;
      return codigoNorm(r.codigo) === c;
    });
  }

  function ordenDuplicado(orden, exceptId) {
    var n = Number(orden);
    if (!Number.isFinite(n)) return false;
    return (state.estRows || []).some(function (r) {
      if (exceptId && String(r.id) === String(exceptId)) return false;
      return Number(r.orden) === n;
    });
  }

  function subitemDuplicado(sub, exceptId) {
    var k = normKey(sub);
    if (!k) return false;
    return (state.estRows || []).some(function (r) {
      if (Number(r.nivel) !== 1) return false;
      if (exceptId && String(r.id) === String(exceptId)) return false;
      return normKey(r.ef_subitem) === k;
    });
  }

  function itemSeccionDuplicado(item, exceptId) {
    var k = normKey(item);
    if (!k) return false;
    return (state.estRows || []).some(function (r) {
      if (Number(r.nivel) !== 0) return false;
      if (exceptId && String(r.id) === String(exceptId)) return false;
      return normKey(r.ef_item) === k;
    });
  }

  async function avisarEstructura() {
    if (typeof opts.onEstructuraChange === 'function') {
      try { await opts.onEstructuraChange(state.estRows || []); } catch (e) { /* no cortar el ABM */ }
    }
  }

  async function recargar() {
    if (!client()) return;
    state.loading = true;
    state.err = '';
    renderShell();
    try {
      await cargarUsuarios();
      var all = [];
      var offset = 0;
      for (;;) {
        var res = await client()
          .from('matriz_cat_cuenta_ef')
          .select('id,categoria,cuenta_contable,tipo_movimiento,ef_item,ef_subitem,costo_directo,costo_indirecto,vigente,notas,updated_at,created_by,updated_by')
          .order('categoria', { ascending: true })
          .range(offset, offset + 999);
        if (res.error) throw res.error;
        var chunk = res.data || [];
        all = all.concat(chunk);
        if (chunk.length < 1000) break;
        offset += 1000;
      }
      state.rows = all;
      var est = await client()
        .from('ef_estructura')
        .select('id, orden, codigo, nivel, ef_item, ef_subitem, signo, naturaleza, es_total, fuente_archivo, created_by, updated_by')
        .order('orden', { ascending: true });
      if (est.error) throw est.error;
      state.estRows = est.data || [];
      await avisarEstructura();
    } catch (e) {
      state.err = errMsg(e);
    }
    state.loading = false;
    renderShell();
  }

  function valorSort(r, key) {
    if (key === 'vigente') return r.vigente === false ? 'No' : 'Sí';
    if (key === 'usuario') return textoUsuario(r.updated_by, r.created_by);
    return r[key] == null ? '' : String(r[key]);
  }

  function toggleSort(key) {
    if (!key) return;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDir = 'asc';
    }
  }

  function toggleEstSort(key) {
    if (!key) return;
    if (state.estSortKey === key) {
      state.estSortDir = state.estSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.estSortKey = key;
      state.estSortDir = 'asc';
    }
  }

  function filasOrdenadas(list) {
    var key = state.sortKey || 'categoria';
    var dir = state.sortDir === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) {
      var cmp = String(valorSort(a, key)).localeCompare(String(valorSort(b, key)), 'es', { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp * dir;
      return (String(a.categoria || '') + String(a.cuenta_contable || '') + String(a.tipo_movimiento || ''))
        .localeCompare(String(b.categoria || '') + String(b.cuenta_contable || '') + String(b.tipo_movimiento || ''), 'es', { numeric: true, sensitivity: 'base' });
    });
  }

  function filasVisibles() {
    var q = String(state.q || '').trim().toLowerCase();
    var list = state.lista === 'sin-relacion' ? filasSinRelacion() : (state.rows || []);
    if (q) {
      list = list.filter(function (r) {
        var blob = [r.categoria, r.cuenta_contable, r.tipo_movimiento, r.ef_item, r.ef_subitem].join(' ').toLowerCase();
        return blob.indexOf(q) >= 0;
      });
    }
    return filasOrdenadas(list);
  }

  function valorEstSort(r, key) {
    if (key === 'tipo') return labelTipo(tipoDeNivel(r.nivel));
    if (key === 'relaciones') return String(Number(r.nivel) === 1 ? relacionesDeSubitem(r.ef_subitem).length : 0);
    if (key === 'orden') return String(r.orden == null ? '' : r.orden);
    if (key === 'usuario') return textoUsuario(r.updated_by, r.created_by);
    return r[key] == null ? '' : String(r[key]);
  }

  function estFilasVisibles() {
    var q = String(state.q || '').trim().toLowerCase();
    var list = (state.estRows || []).slice();
    if (q) {
      list = list.filter(function (r) {
        var blob = [r.orden, r.codigo, labelTipo(tipoDeNivel(r.nivel)), r.ef_item, r.ef_subitem, r.signo, r.naturaleza].join(' ').toLowerCase();
        return blob.indexOf(q) >= 0;
      });
    }
    var key = state.estSortKey || 'orden';
    var dir = state.estSortDir === 'desc' ? -1 : 1;
    return list.sort(function (a, b) {
      var cmp = String(valorEstSort(a, key)).localeCompare(String(valorEstSort(b, key)), 'es', { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp * dir;
      return (Number(a.orden) || 0) - (Number(b.orden) || 0);
    });
  }

  function thSort(key, label) {
    var activo = state.sortKey === key;
    var ind = activo ? (state.sortDir === 'desc' ? '▼' : '▲') : '▲';
    return '<th class="mef-th-sort' + (activo ? ' mef-th-sort-activo' : '') + '">' +
      '<button type="button" class="mef-th-sort-btn" data-mef="sort" data-sort="' + esc(key) + '" title="Ordenar por ' + esc(label) + '" aria-label="Ordenar por ' + esc(label) + (activo ? (state.sortDir === 'desc' ? ', descendente' : ', ascendente') : '') + '">' +
      esc(label) + '<span class="mef-sort-ind" aria-hidden="true">' + ind + '</span></button></th>';
  }

  function thEstSort(key, label) {
    var activo = state.estSortKey === key;
    var ind = activo ? (state.estSortDir === 'desc' ? '▼' : '▲') : '▲';
    return '<th class="mef-th-sort' + (activo ? ' mef-th-sort-activo' : '') + '">' +
      '<button type="button" class="mef-th-sort-btn" data-mef="est-sort" data-sort="' + esc(key) + '" title="Ordenar por ' + esc(label) + '" aria-label="Ordenar por ' + esc(label) + (activo ? (state.estSortDir === 'desc' ? ', descendente' : ', ascendente') : '') + '">' +
      esc(label) + '<span class="mef-sort-ind" aria-hidden="true">' + ind + '</span></button></th>';
  }

  function opciones(arr, sel) {
    return arr.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }

  function renderForm() {
    if (!can(PERM_EDITAR) || !state.form) return '';
    var f = state.form;
    var items = itemsEf();
    var subs = subitemsEf(f.ef_item);
    return '<form class="mef-form" id="mef-form">' +
      '<h3>' + (f.id ? 'Editar relación' : 'Nueva relación') + '</h3>' +
      '<div class="mef-form-grid">' +
        '<div><label for="mef-cat">Categoría (tesorería)</label><input id="mef-cat" name="categoria" value="' + esc(f.categoria) + '" required></div>' +
        '<div><label for="mef-cta">Cuenta contable (tesorería)</label><input id="mef-cta" name="cuenta_contable" value="' + esc(f.cuenta_contable) + '" required></div>' +
        '<div><label for="mef-tipo">Tipo</label><select id="mef-tipo" name="tipo_movimiento"><option value="Ingreso"' + (f.tipo_movimiento === 'Ingreso' ? ' selected' : '') + '>Ingreso</option><option value="Egreso"' + (f.tipo_movimiento !== 'Ingreso' ? ' selected' : '') + '>Egreso</option></select></div>' +
        '<div><label for="mef-item">Ítem EF</label><select id="mef-item" name="ef_item"><option value="">Elegí…</option>' + opciones(items, f.ef_item) + (f.ef_item && items.indexOf(f.ef_item) < 0 ? '<option value="' + esc(f.ef_item) + '" selected>' + esc(f.ef_item) + '</option>' : '') + '</select></div>' +
        '<div class="mef-form-full"><label for="mef-sub">Subítem EF</label><select id="mef-sub" name="ef_subitem"><option value="">Elegí…</option>' + opciones(subs, f.ef_subitem) + (f.ef_subitem && subs.indexOf(f.ef_subitem) < 0 ? '<option value="' + esc(f.ef_subitem) + '" selected>' + esc(f.ef_subitem) + '</option>' : '') + '</select></div>' +
        '<div><label for="mef-cd">Costo directo</label><select id="mef-cd" name="costo_directo"><option value=""></option><option value="Y"' + (f.costo_directo === 'Y' ? ' selected' : '') + '>Y</option><option value="N"' + (f.costo_directo === 'N' ? ' selected' : '') + '>N</option></select></div>' +
        '<div><label for="mef-ci">Costo indirecto</label><select id="mef-ci" name="costo_indirecto"><option value=""></option><option value="Y"' + (f.costo_indirecto === 'Y' ? ' selected' : '') + '>Y</option><option value="N"' + (f.costo_indirecto === 'N' ? ' selected' : '') + '>N</option></select></div>' +
        '<div class="mef-form-full"><label for="mef-notas">Notas</label><textarea id="mef-notas" name="notas" rows="2">' + esc(f.notas || '') + '</textarea></div>' +
      '</div>' +
      '<div class="mef-form-actions">' +
        '<button type="submit" class="mef-btn mef-btn-ok"><span class="btn-icon">' + ICO.check + '</span>Guardar</button>' +
        '<button type="button" class="mef-btn mef-btn-ghost" data-mef="cancelar"><span class="btn-icon">' + ICO.x + '</span>Cancelar</button>' +
      '</div></form>';
  }

  function renderEstForm() {
    if (!can(PERM_EDITAR) || !state.estForm) return '';
    var f = state.estForm;
    var esAlta = !f.id;
    var orig = f.id ? (state.estRows || []).filter(function (r) { return String(r.id) === String(f.id); })[0] : null;
    var tipoFijo = !esAlta;
    var codLock = orig && (
      (Number(orig.nivel) === 0 && esCodigoSeccionProtegido(orig.codigo)) ||
      (Number(orig.nivel) === 2 && esCodigoTotalProtegido(orig.codigo)) ||
      (Number(orig.nivel) === 1 && esCodigoSubitemProtegido(orig.codigo))
    );
    var natLock = orig && Number(orig.nivel) === 2 && esCodigoTotalProtegido(orig.codigo);
    var subLock = orig && Number(orig.nivel) === 1 && esSubitemRatio(orig.ef_subitem);
    var secs = seccionesEf();
    var itemOpts = secs.map(function (s) { return s.ef_item; });
    var html = '<form class="mef-form" id="mef-est-form">' +
      '<h3>' + (f.id ? 'Editar renglón del Estado Financiero' : 'Nuevo renglón del Estado Financiero') + '</h3>' +
      '<div class="mef-form-grid">';
    html += '<div><label for="mef-est-tipo">Tipo de renglón</label>';
    if (tipoFijo) {
      html += '<input id="mef-est-tipo" value="' + esc(labelTipo(f.tipo)) + '" disabled><p class="mef-field-nota">El tipo no se cambia: borralo y creá otro si hace falta.</p></div>';
    } else {
      html += '<select id="mef-est-tipo" name="tipo">' +
        '<option value="subitem"' + (f.tipo === 'subitem' ? ' selected' : '') + '>Subítem (recibe montos)</option>' +
        '<option value="seccion"' + (f.tipo === 'seccion' ? ' selected' : '') + '>Sección (agrupa subítems)</option>' +
        '<option value="total"' + (f.tipo === 'total' ? ' selected' : '') + '>Total / fórmula</option>' +
        '</select></div>';
    }
    html += '<div><label for="mef-est-codigo">Código</label><input id="mef-est-codigo" name="codigo" value="' + esc(f.codigo) + '"' + (codLock ? ' disabled' : '') + ' required>';
    if (codLock) html += '<p class="mef-field-nota">Código usado por las fórmulas; no se puede cambiar.</p>';
    html += '</div>';
    if (f.tipo === 'seccion') {
      html += '<div class="mef-form-full"><label for="mef-est-item">Nombre de la sección (ítem)</label><input id="mef-est-item" name="ef_item" value="' + esc(f.ef_item) + '" required></div>';
    } else {
      html += '<div class="mef-form-full"><label for="mef-est-item">Sección (ítem padre)</label><select id="mef-est-item" name="ef_item"><option value="">Elegí…</option>' +
        opciones(itemOpts, f.ef_item) +
        (f.ef_item && itemOpts.indexOf(f.ef_item) < 0 ? '<option value="' + esc(f.ef_item) + '" selected>' + esc(f.ef_item) + '</option>' : '') +
        '</select></div>';
    }
    if (f.tipo !== 'seccion') {
      html += '<div class="mef-form-full"><label for="mef-est-sub">' + (f.tipo === 'total' ? 'Etiqueta del total' : 'Subítem') + '</label>' +
        '<input id="mef-est-sub" name="ef_subitem" value="' + esc(f.ef_subitem) + '"' + (subLock ? ' disabled' : '') + ' required>';
      if (subLock) html += '<p class="mef-field-nota">Este nombre alimenta los ratios del Flujo; no se puede cambiar.</p>';
      html += '</div>';
    }
    if (f.tipo === 'subitem') {
      html += '<div><label for="mef-est-signo">Signo en caja</label><select id="mef-est-signo" name="signo">' +
        '<option value="+"' + (f.signo === '+' ? ' selected' : '') + '>+</option>' +
        '<option value="-"' + (f.signo !== '+' ? ' selected' : '') + '>-</option>' +
        '</select></div>';
    } else if (f.tipo === 'total') {
      html += '<div><label for="mef-est-signo">Signo</label><input id="mef-est-signo" name="signo" value="' + esc(f.signo || '(=)') + '"' + (natLock ? ' disabled' : '') + '></div>';
    }
    html += '<div class="mef-form-full"><label for="mef-est-nat">Naturaleza / notas' + (f.tipo === 'total' ? ' (texto de fórmula)' : '') + '</label>' +
      '<textarea id="mef-est-nat" name="naturaleza" rows="2"' + (natLock ? ' disabled' : '') + '>' + esc(f.naturaleza || '') + '</textarea>';
    if (natLock) html += '<p class="mef-field-nota">La fórmula de este total no se edita para no romper A–D.</p>';
    else if (f.tipo === 'total') html += '<p class="mef-field-nota">Si coincide con el patrón (p. ej. «Total 1 - Total 2»), el Estado Financiero usa esa fórmula; si no, suma los subítems del bloque.</p>';
    html += '</div></div>' +
      '<div class="mef-form-actions">' +
        '<button type="submit" class="mef-btn mef-btn-ok"><span class="btn-icon">' + ICO.check + '</span>Guardar</button>' +
        '<button type="button" class="mef-btn mef-btn-ghost" data-mef="est-cancelar"><span class="btn-icon">' + ICO.x + '</span>Cancelar</button>' +
      '</div></form>';
    return html;
  }

  function renderTabla() {
    var list = filasVisibles();
    if (!list.length) {
      return '<p class="mef-empty">' + (state.lista === 'sin-relacion'
        ? 'No hay pares de tesorería sin relación (o todavía no cargó el Flujo).'
        : 'No hay relaciones en la matriz.') + '</p>';
    }
    var html = '';
    list.forEach(function (r) {
      html += '<tr>' +
        '<td>' + esc(r.categoria) + '</td>' +
        '<td>' + esc(r.cuenta_contable) + '</td>' +
        '<td>' + esc(r.tipo_movimiento) + '</td>' +
        '<td>' + esc(r.ef_item || '—') + '</td>' +
        '<td>' + esc(r.ef_subitem || '—') + '</td>' +
        '<td>' + esc(r.costo_directo || '') + '</td>' +
        '<td>' + esc(r.costo_indirecto || '') + '</td>' +
        '<td>' + (r.vigente === false ? 'No' : 'Sí') + '</td>' +
        '<td>' + htmlUsuario(r.updated_by, r.created_by) + '</td>' +
        '<td>' + (can(PERM_EDITAR)
          ? '<button type="button" class="mef-btn mef-btn-ghost mef-btn-icon-only" data-mef="editar" data-id="' + esc(r.id || '') + '" data-cat="' + esc(r.categoria) + '" data-cta="' + esc(r.cuenta_contable) + '" data-tipo="' + esc(r.tipo_movimiento) + '" title="Editar" aria-label="Editar"><span class="btn-icon">' + ICO.edit + '</span></button>'
          : '') + '</td>' +
      '</tr>';
    });
    return '<div class="mef-tabla-wrap"><table class="mef-tabla"><thead><tr>' +
      thSort('categoria', 'Categoría') +
      thSort('cuenta_contable', 'Cuenta contable') +
      thSort('tipo_movimiento', 'Tipo') +
      thSort('ef_item', 'Ítem EF') +
      thSort('ef_subitem', 'Subítem EF') +
      thSort('costo_directo', 'Dir.') +
      thSort('costo_indirecto', 'Ind.') +
      thSort('vigente', 'Vigente') +
      thSort('usuario', 'Usuario') +
      '<th></th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function renderEstTabla() {
    var list = estFilasVisibles();
    if (!list.length) {
      return '<p class="mef-empty">No hay renglones en la estructura del Estado Financiero.</p>';
    }
    var html = '';
    var puedeEditar = can(PERM_EDITAR);
    list.forEach(function (r) {
      var tipo = tipoDeNivel(r.nivel);
      var nRel = Number(r.nivel) === 1 ? relacionesDeSubitem(r.ef_subitem).length : 0;
      var bloqueo = motivoBloqueoBaja(r);
      var trClass = tipo === 'seccion' ? 'mef-est-seccion' : (tipo === 'total' ? 'mef-est-total' : '');
      var acciones = '';
      if (puedeEditar) {
        acciones = '<div class="mef-acciones-fila">' +
          '<button type="button" class="mef-btn mef-btn-ghost mef-btn-icon-only" data-mef="est-editar" data-id="' + esc(r.id) + '" title="Editar" aria-label="Editar"><span class="btn-icon">' + ICO.edit + '</span></button>';
        if (bloqueo) {
          acciones += '<button type="button" class="mef-btn mef-btn-ghost mef-btn-icon-only" data-mef="est-info" data-motivo="' + esc(bloqueo) + '" title="' + esc(bloqueo) + '" aria-label="' + esc(bloqueo) + '"><span class="btn-icon">' + ICO.lock + '</span></button>';
        } else {
          acciones += '<button type="button" class="mef-btn mef-btn-danger mef-btn-icon-only" data-mef="est-borrar" data-id="' + esc(r.id) + '" title="Borrar" aria-label="Borrar"><span class="btn-icon">' + ICO.trash + '</span></button>';
        }
        acciones += '</div>';
      }
      html += '<tr class="' + trClass + '">' +
        '<td>' + esc(r.orden) + '</td>' +
        '<td>' + esc(r.codigo || '') + '</td>' +
        '<td>' + esc(labelTipo(tipo)) + '</td>' +
        '<td>' + esc(r.ef_item || '') + '</td>' +
        '<td class="' + (tipo === 'subitem' ? 'mef-indent-sub' : '') + '">' + esc(r.ef_subitem || (tipo === 'seccion' ? '—' : '')) + '</td>' +
        '<td>' + esc(r.signo || '') + '</td>' +
        '<td>' + esc(r.naturaleza || '') + '</td>' +
        '<td class="mef-rel-n">' + (Number(r.nivel) === 1 ? nRel : '—') + '</td>' +
        '<td>' + htmlUsuario(r.updated_by, r.created_by) + '</td>' +
        '<td>' + acciones + '</td>' +
      '</tr>';
    });
    return '<div class="mef-tabla-wrap"><table class="mef-tabla mef-tabla-est"><thead><tr>' +
      thEstSort('orden', 'Orden') +
      thEstSort('codigo', 'Código') +
      thEstSort('tipo', 'Tipo') +
      thEstSort('ef_item', 'Ítem') +
      thEstSort('ef_subitem', 'Subítem / etiqueta') +
      thEstSort('signo', 'Signo') +
      thEstSort('naturaleza', 'Naturaleza') +
      thEstSort('relaciones', 'Rel.') +
      thEstSort('usuario', 'Usuario') +
      '<th></th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function bindForm() {
    var el = root();
    if (!el) return;
    var form = el.querySelector('#mef-form');
    if (!form) return;
    var itemEl = form.querySelector('#mef-item');
    if (itemEl) {
      itemEl.addEventListener('change', function () {
        if (!state.form) return;
        state.form.ef_item = itemEl.value;
        state.form.ef_subitem = '';
        state.form.categoria = (form.querySelector('#mef-cat') || {}).value || state.form.categoria;
        state.form.cuenta_contable = (form.querySelector('#mef-cta') || {}).value || state.form.cuenta_contable;
        state.form.tipo_movimiento = (form.querySelector('#mef-tipo') || {}).value || state.form.tipo_movimiento;
        renderShell();
      });
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      guardarForm(form);
    });
  }

  function leerEstFormCampos(form) {
    if (!state.estForm) return;
    var tipoEl = form.querySelector('#mef-est-tipo');
    if (tipoEl && tipoEl.tagName === 'SELECT') state.estForm.tipo = tipoEl.value || state.estForm.tipo;
    var codEl = form.querySelector('#mef-est-codigo');
    if (codEl && !codEl.disabled) state.estForm.codigo = codEl.value || '';
    var itemEl = form.querySelector('#mef-est-item');
    if (itemEl) state.estForm.ef_item = itemEl.value || '';
    var subEl = form.querySelector('#mef-est-sub');
    if (subEl && !subEl.disabled) state.estForm.ef_subitem = subEl.value || '';
    var sigEl = form.querySelector('#mef-est-signo');
    if (sigEl && !sigEl.disabled) state.estForm.signo = sigEl.value || '';
    var natEl = form.querySelector('#mef-est-nat');
    if (natEl && !natEl.disabled) state.estForm.naturaleza = natEl.value || '';
  }

  function bindEstForm() {
    var el = root();
    if (!el) return;
    var form = el.querySelector('#mef-est-form');
    if (!form) return;
    var tipoEl = form.querySelector('#mef-est-tipo');
    if (tipoEl && tipoEl.tagName === 'SELECT') {
      tipoEl.addEventListener('change', function () {
        leerEstFormCampos(form);
        state.estForm.tipo = tipoEl.value;
        if (state.estForm.tipo === 'seccion') {
          state.estForm.ef_subitem = '';
          state.estForm.signo = '';
        } else if (state.estForm.tipo === 'total') {
          state.estForm.signo = state.estForm.signo || '(=)';
        } else {
          state.estForm.signo = state.estForm.signo === '+' ? '+' : '-';
          if (state.estForm.ef_item) state.estForm.codigo = sugerirCodigoSubitem(state.estForm.ef_item);
        }
        renderShell();
      });
    }
    var itemEl = form.querySelector('#mef-est-item');
    if (itemEl && itemEl.tagName === 'SELECT') {
      itemEl.addEventListener('change', function () {
        leerEstFormCampos(form);
        state.estForm.ef_item = itemEl.value;
        if (!state.estForm.id && state.estForm.tipo === 'subitem') {
          state.estForm.codigo = sugerirCodigoSubitem(itemEl.value);
        }
        renderShell();
      });
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      guardarEstForm(form);
    });
  }

  async function guardarForm(form) {
    if (!can(PERM_EDITAR)) return;
    var body = {
      categoria: String(form.categoria.value || '').trim(),
      cuenta_contable: String(form.cuenta_contable.value || '').trim(),
      tipo_movimiento: form.tipo_movimiento.value === 'Ingreso' ? 'Ingreso' : 'Egreso',
      ef_item: String(form.ef_item.value || '').trim(),
      ef_subitem: String(form.ef_subitem.value || '').trim(),
      costo_directo: form.costo_directo.value || null,
      costo_indirecto: form.costo_indirecto.value || null,
      vigente: true,
      notas: String(form.notas.value || '').trim() || null
    };
    if (!body.categoria || !body.cuenta_contable || !body.ef_item || !body.ef_subitem) {
      state.err = 'Completá categoría, cuenta, ítem y subítem.';
      renderShell();
      return;
    }
    state.loading = true;
    state.err = '';
    renderShell();
    try {
      var res;
      if (state.form && state.form.id) {
        res = await client().from('matriz_cat_cuenta_ef').update(body).eq('id', state.form.id).select('id');
      } else {
        res = await client().from('matriz_cat_cuenta_ef').insert(body).select('id');
      }
      if (res.error) throw res.error;
      state.msg = 'Relación guardada.';
      state.form = null;
      await recargar();
    } catch (e) {
      state.err = errMsg(e);
      state.loading = false;
      renderShell();
    }
  }

  async function shiftOrdenDesde(target) {
    var rows = (state.estRows || [])
      .filter(function (r) { return Number(r.orden) >= target; })
      .sort(function (a, b) { return Number(b.orden) - Number(a.orden); });
    for (var i = 0; i < rows.length; i++) {
      var res = await client().from('ef_estructura').update({ orden: Number(rows[i].orden) + 1 }).eq('id', rows[i].id);
      if (res.error) throw res.error;
    }
  }

  async function cascadeMatrizSubitem(fromSub, toSub, toItem) {
    var rels = relacionesDeSubitem(fromSub);
    var remap = [];
    for (var i = 0; i < rels.length; i++) {
      var body = { ef_subitem: toSub };
      if (toItem) body.ef_item = toItem;
      var res = await client().from('matriz_cat_cuenta_ef').update(body).eq('id', rels[i].id);
      if (res.error) throw res.error;
    }
    if (rels.length && fromSub !== toSub) {
      remap.push({ fromSub: fromSub, toSub: toSub, fromItem: null, toItem: toItem || null });
    }
    return remap;
  }

  async function cascadeItemRename(fromItem, toItem) {
    var remap = [];
    var hijos = hijosDeItem(fromItem);
    for (var i = 0; i < hijos.length; i++) {
      var resH = await client().from('ef_estructura').update({ ef_item: toItem }).eq('id', hijos[i].id);
      if (resH.error) throw resH.error;
    }
    var rels = (state.rows || []).filter(function (r) { return String(r.ef_item || '').trim() === fromItem; });
    for (var j = 0; j < rels.length; j++) {
      var resM = await client().from('matriz_cat_cuenta_ef').update({ ef_item: toItem }).eq('id', rels[j].id);
      if (resM.error) throw resM.error;
    }
    if (fromItem !== toItem) {
      remap.push({ fromSub: null, toSub: null, fromItem: fromItem, toItem: toItem });
    }
    return remap;
  }

  function validarEstBody(body, orig) {
    var exceptId = orig ? orig.id : null;
    if (!body.codigo) return 'El código es obligatorio.';
    if (codigoDuplicado(body.codigo, exceptId)) return 'Ya existe un renglón con el código «' + body.codigo + '».';
    if (!body.ef_item) return 'El ítem (sección) es obligatorio.';
    if (body.nivel === 0) {
      if (itemSeccionDuplicado(body.ef_item, exceptId)) return 'Ya existe una sección con ese nombre.';
      if (body.ef_subitem) return 'Una sección no lleva subítem.';
    }
    if (body.nivel === 1) {
      if (!body.ef_subitem) return 'El subítem es obligatorio.';
      if (body.signo !== '+' && body.signo !== '-') return 'El signo del subítem tiene que ser + o −.';
      if (subitemDuplicado(body.ef_subitem, exceptId)) return 'Ya existe un subítem con ese nombre. Los montos se agrupan por nombre: no puede repetirse.';
      var padre = (state.estRows || []).some(function (r) {
        return Number(r.nivel) === 0 && String(r.ef_item || '').trim() === body.ef_item;
      });
      if (!padre) return 'Elegí una sección existente como ítem padre.';
    }
    if (body.nivel === 2) {
      if (!body.ef_subitem) return 'La etiqueta del total es obligatoria.';
      var padreT = (state.estRows || []).some(function (r) {
        return Number(r.nivel) === 0 && String(r.ef_item || '').trim() === body.ef_item;
      });
      if (!padreT) return 'Elegí una sección existente para el total.';
    }
    if (orig) {
      if (Number(orig.nivel) !== body.nivel) return 'No se puede cambiar el tipo de un renglón existente.';
      if (esCodigoSeccionProtegido(orig.codigo) && String(orig.codigo).trim() !== body.codigo) {
        return 'No se puede cambiar el código de la sección ' + String(orig.codigo).trim() + '.';
      }
      if (esCodigoTotalProtegido(orig.codigo) && codigoNorm(orig.codigo) !== codigoNorm(body.codigo)) {
        return 'No se puede cambiar el código del total ' + String(orig.codigo).trim() + '.';
      }
      if (esCodigoSubitemProtegido(orig.codigo) && String(orig.codigo).trim() !== body.codigo) {
        return 'No se puede cambiar el código ' + String(orig.codigo).trim() + '.';
      }
      if (esSubitemRatio(orig.ef_subitem) && normKey(orig.ef_subitem) !== normKey(body.ef_subitem)) {
        return 'No se puede cambiar el nombre de este subítem: alimenta los ratios del Flujo.';
      }
    }
    return null;
  }

  async function guardarEstForm(form) {
    if (!can(PERM_EDITAR) || !state.estForm) return;
    leerEstFormCampos(form);
    var f = state.estForm;
    var orig = f.id ? (state.estRows || []).filter(function (r) { return String(r.id) === String(f.id); })[0] : null;
    var tipo = orig ? tipoDeNivel(orig.nivel) : (f.tipo || 'subitem');
    var nivel = nivelDeTipo(tipo);
    var codigo = String((form.querySelector('#mef-est-codigo') && !form.querySelector('#mef-est-codigo').disabled)
      ? form.querySelector('#mef-est-codigo').value
      : (orig ? orig.codigo : f.codigo) || '').trim();
    var efItem = String((form.querySelector('#mef-est-item') || {}).value || f.ef_item || '').trim();
    var subEl = form.querySelector('#mef-est-sub');
    var efSub = nivel === 0
      ? null
      : String((subEl && !subEl.disabled ? subEl.value : (orig ? orig.ef_subitem : f.ef_subitem)) || '').trim() || null;
    var signo;
    if (nivel === 0) signo = null;
    else if (nivel === 2) signo = String((form.querySelector('#mef-est-signo') || {}).value || f.signo || '(=)').trim() || '(=)';
    else signo = String((form.querySelector('#mef-est-signo') || {}).value || f.signo || '-') === '+' ? '+' : '-';
    var natEl = form.querySelector('#mef-est-nat');
    var naturaleza = String((natEl && !natEl.disabled ? natEl.value : (orig ? orig.naturaleza : f.naturaleza)) || '').trim() || null;
    var body = {
      codigo: codigo,
      nivel: nivel,
      ef_item: efItem,
      ef_subitem: efSub,
      signo: signo,
      naturaleza: naturaleza,
      es_total: nivel === 2,
      fuente_archivo: orig && orig.fuente_archivo ? orig.fuente_archivo : 'abm_app'
    };
    var err = validarEstBody(body, orig);
    if (err) {
      state.err = err;
      renderShell();
      return;
    }
    state.loading = true;
    state.err = '';
    renderShell();
    try {
      var remap = [];
      if (orig) {
        if (Number(orig.nivel) === 0 && String(orig.ef_item || '').trim() !== body.ef_item) {
          remap = remap.concat(await cascadeItemRename(String(orig.ef_item || '').trim(), body.ef_item));
        }
        if (Number(orig.nivel) === 1 && (normKey(orig.ef_subitem) !== normKey(body.ef_subitem) || String(orig.ef_item || '').trim() !== body.ef_item)) {
          remap = remap.concat(await cascadeMatrizSubitem(orig.ef_subitem, body.ef_subitem, body.ef_item));
        }
        var resU = await client().from('ef_estructura').update(body).eq('id', orig.id).select('id');
        if (resU.error) throw resU.error;
        state.msg = 'Renglón actualizado.';
      } else {
        var orden = nivel === 0
          ? maxOrden() + 1
          : (nivel === 2 ? ordenInsercionTotal(body.ef_item) : ordenInsercionSubitem(body.ef_item));
        if (ordenDuplicado(orden, null)) {
          await shiftOrdenDesde(orden);
        }
        body.orden = orden;
        var resI = await client().from('ef_estructura').insert(body).select('id');
        if (resI.error) throw resI.error;
        state.msg = 'Renglón creado (orden ' + orden + ').';
      }
      if (remap.length && typeof opts.onRemapEfFilas === 'function') {
        try { opts.onRemapEfFilas(remap); } catch (eR) { /* ignore */ }
      }
      state.estForm = null;
      await recargar();
    } catch (e) {
      state.err = errMsg(e);
      state.loading = false;
      renderShell();
    }
  }

  async function borrarEst(id) {
    if (!can(PERM_EDITAR)) return;
    var row = (state.estRows || []).filter(function (r) { return String(r.id) === String(id); })[0];
    var motivo = motivoBloqueoBaja(row);
    if (motivo) {
      state.err = motivo;
      renderShell();
      return;
    }
    var label = (row.codigo ? row.codigo + ' — ' : '') + (row.ef_subitem || row.ef_item || '');
    if (!global.confirm('Se va a borrar el renglón «' + label + '». El Estado Financiero dejará de dibujarlo. ¿Continuar?')) return;
    state.loading = true;
    state.err = '';
    renderShell();
    try {
      var res = await client().from('ef_estructura').delete().eq('id', id);
      if (res.error) throw res.error;
      state.msg = 'Renglón borrado.';
      state.estForm = null;
      await recargar();
    } catch (e) {
      state.err = errMsg(e);
      state.loading = false;
      renderShell();
    }
  }

  function fechaArchivoExcel() {
    var hoy = new Date();
    return String(hoy.getDate()).padStart(2, '0') + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + hoy.getFullYear();
  }

  function exportarExcel() {
    if (!global.XLSX) {
      alert('No se pudo cargar la librería de Excel.');
      return;
    }
    var list = filasVisibles();
    if (!list.length) {
      alert('No hay filas para exportar.');
      return;
    }
    var aoa = [['Matriz EF — categoría / cuenta / tipo → Estado Financiero']];
    aoa.push(['Categoría', 'Cuenta contable', 'Tipo', 'Ítem EF', 'Subítem EF', 'Costo directo', 'Costo indirecto', 'Vigente', 'Usuario']);
    list.forEach(function (r) {
      aoa.push([
        r.categoria || '',
        r.cuenta_contable || '',
        r.tipo_movimiento || '',
        r.ef_item || '',
        r.ef_subitem || '',
        r.costo_directo || '',
        r.costo_indirecto || '',
        r.vigente === false ? 'No' : 'Sí',
        textoUsuario(r.updated_by, r.created_by)
      ]);
    });
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 10 }, { wch: 36 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, 'Matriz EF');
    global.XLSX.writeFile(wb, 'Matriz_EF_Fornitalia_' + fechaArchivoExcel() + '.xlsx');
  }

  function exportarEstExcel() {
    if (!global.XLSX) {
      alert('No se pudo cargar la librería de Excel.');
      return;
    }
    var list = estFilasVisibles();
    if (!list.length) {
      alert('No hay filas para exportar.');
      return;
    }
    var aoa = [['Estructura del Estado Financiero']];
    aoa.push(['Orden', 'Código', 'Tipo', 'Ítem', 'Subítem / etiqueta', 'Signo', 'Naturaleza', 'Es total', 'Relaciones matriz', 'Usuario']);
    list.forEach(function (r) {
      var nRel = Number(r.nivel) === 1 ? relacionesDeSubitem(r.ef_subitem).length : null;
      aoa.push([
        r.orden != null ? Number(r.orden) : null,
        r.codigo || '',
        labelTipo(tipoDeNivel(r.nivel)),
        r.ef_item || '',
        r.ef_subitem || '',
        r.signo || '',
        r.naturaleza || '',
        r.es_total ? 'Sí' : 'No',
        nRel,
        textoUsuario(r.updated_by, r.created_by)
      ]);
    });
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 40 }, { wch: 48 }, { wch: 8 }, { wch: 48 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, 'Estructura EF');
    global.XLSX.writeFile(wb, 'Estructura_EF_Fornitalia_' + fechaArchivoExcel() + '.xlsx');
  }

  function renderShell() {
    var el = root();
    if (!el) return;
    if (!can(PERM_VER)) {
      el.innerHTML = '<p class="mef-empty">No tenés permiso para ver la Matriz EF.</p>';
      return;
    }
    var sin = filasSinRelacion();
    var nRel = (state.rows || []).length;
    var nEst = (state.estRows || []).length;
    var esEst = state.lista === 'estructura';
    var placeholder = esEst ? 'Buscar código, ítem, subítem…' : 'Buscar categoría, cuenta, ítem…';
    el.innerHTML =
      (global.FornitaliaHelp ? FornitaliaHelp.header(ICO.grid, 'Matriz EF', 'tpl-mef-help', 'Ayuda: Matriz EF',
        '<p>Conecta <strong>categoría + cuenta contable + tipo</strong> de tesorería con el <strong>ítem y subítem</strong> del Estado Financiero. Los nombres son los de tesorería.</p>' +
        '<p>La solapa <strong>Estructura EF</strong> es el ABM del árbol (secciones, subítems y totales). Un renglón vacío se dibuja si está acá, aunque no tenga relaciones. No se pueden borrar las secciones 1–6, los totales A–D ni los subítems 6.1–6.3 (fórmulas); tampoco un subítem con relaciones en la matriz.</p>' +
        '<p>La tabla de relaciones ya está cargada. Usá el ABM para <strong>nuevos rubros</strong> o <strong>nuevas relaciones</strong>. Sin relación lista pares del Flujo sin fila. Clic en un encabezado para <strong>ordenar</strong>.</p>'
      ) : '<h1>Matriz EF</h1>') +
      (state.loading ? '<p class="loading">Cargando matriz…</p>' : '') +
      (state.err ? '<p class="mef-msg-err">' + esc(state.err) + '</p>' : '') +
      (state.msg ? '<p class="mef-msg-ok">' + esc(state.msg) + '</p>' : '') +
      '<div class="mef-tabs">' +
        '<button type="button" class="' + (state.lista === 'relaciones' ? 'activo' : '') + '" data-mef="lista" data-lista="relaciones">Relaciones (' + nRel + ')</button>' +
        '<button type="button" class="' + (state.lista === 'sin-relacion' ? 'activo' : '') + (sin.length ? ' mef-tab-warn' : '') + '" data-mef="lista" data-lista="sin-relacion">Sin relación (' + sin.length + ')</button>' +
        '<button type="button" class="' + (esEst ? 'activo' : '') + '" data-mef="lista" data-lista="estructura">Estructura EF (' + nEst + ')</button>' +
      '</div>' +
      (esEst
        ? '<p class="mef-hint">Este árbol es el que dibuja la tabla del Estado Financiero. Podés sacar renglones que ya no uses (por ejemplo Otros Ingresos Operativos) si no tienen relaciones y no son una fórmula. Las secciones 1–6, los totales A–D y 6.1–6.3 están bloqueados.</p>'
        : '') +
      '<div class="mef-toolbar"><div class="mef-acciones">' +
        (can(PERM_EDITAR)
          ? (esEst
            ? '<button type="button" class="mef-btn mef-btn-navy" data-mef="est-nuevo"><span class="btn-icon">' + ICO.plus + '</span>Nuevo renglón</button>'
            : '<button type="button" class="mef-btn mef-btn-navy" data-mef="nuevo"><span class="btn-icon">' + ICO.plus + '</span>Nueva relación</button>')
          : '') +
        '<button type="button" class="mef-btn mef-btn-excel" data-mef="' + (esEst ? 'est-xlsx' : 'xlsx') + '"><span class="btn-icon">' + ICO.download + '</span>Excel</button>' +
      '</div><div class="mef-busqueda"><input type="search" id="mef-q" value="' + esc(state.q) + '" placeholder="' + esc(placeholder) + '"></div></div>' +
      (esEst
        ? '<div class="mef-resumen">' +
            '<div class="mef-resumen-card"><p class="lab">Renglones</p><p class="val">' + nEst + '</p></div>' +
          '</div>'
        : '<div class="mef-resumen">' +
            '<div class="mef-resumen-card"><p class="lab">Relaciones</p><p class="val">' + nRel + '</p></div>' +
            '<div class="mef-resumen-card' + (sin.length ? ' mef-resumen-warn' : '') + '" data-mef="lista" data-lista="sin-relacion" role="button" tabindex="0"><p class="lab">Sin relación</p><p class="val">' + sin.length + '</p></div>' +
          '</div>') +
      (esEst ? renderEstForm() : renderForm()) +
      (esEst ? renderEstTabla() : renderTabla());

    var qEl = el.querySelector('#mef-q');
    if (qEl) {
      qEl.addEventListener('input', function () { state.q = qEl.value || ''; });
      qEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); renderShell(); }
      });
      qEl.addEventListener('search', function () { renderShell(); });
    }
    bindForm();
    bindEstForm();
  }

  function onClick(ev) {
    var t = ev.target.closest && ev.target.closest('[data-mef]');
    if (!t) return;
    var el = root();
    if (el && !el.contains(t)) return;
    var a = t.getAttribute('data-mef');
    if (a === 'sort') {
      toggleSort(t.getAttribute('data-sort'));
      renderShell();
      return;
    }
    if (a === 'est-sort') {
      toggleEstSort(t.getAttribute('data-sort'));
      renderShell();
      return;
    }
    if (a === 'lista') {
      state.lista = t.getAttribute('data-lista') || 'relaciones';
      state.msg = '';
      state.err = '';
      state.form = null;
      state.estForm = null;
      renderShell();
      return;
    }
    if (a === 'nuevo') {
      state.form = formVacio();
      state.estForm = null;
      state.lista = 'relaciones';
      renderShell();
      return;
    }
    if (a === 'est-nuevo') {
      state.estForm = formEstVacio();
      state.form = null;
      state.lista = 'estructura';
      renderShell();
      return;
    }
    if (a === 'cancelar') {
      state.form = null;
      renderShell();
      return;
    }
    if (a === 'est-cancelar') {
      state.estForm = null;
      renderShell();
      return;
    }
    if (a === 'xlsx') { exportarExcel(); return; }
    if (a === 'est-xlsx') { exportarEstExcel(); return; }
    if (a === 'est-info') {
      state.err = t.getAttribute('data-motivo') || 'Este renglón no se puede borrar.';
      renderShell();
      return;
    }
    if (a === 'est-borrar') {
      borrarEst(t.getAttribute('data-id'));
      return;
    }
    if (a === 'est-editar') {
      var eid = t.getAttribute('data-id');
      var foundE = (state.estRows || []).filter(function (r) { return String(r.id) === String(eid); })[0];
      if (!foundE) return;
      state.form = null;
      state.estForm = {
        id: foundE.id,
        tipo: tipoDeNivel(foundE.nivel),
        orden: foundE.orden,
        codigo: foundE.codigo || '',
        ef_item: foundE.ef_item || '',
        ef_subitem: foundE.ef_subitem || '',
        signo: foundE.signo || '',
        naturaleza: foundE.naturaleza || ''
      };
      state.lista = 'estructura';
      renderShell();
      return;
    }
    if (a === 'editar') {
      var id = t.getAttribute('data-id');
      var found = (state.rows || []).filter(function (r) { return String(r.id) === String(id); })[0];
      if (found) {
        state.form = {
          id: found.id,
          categoria: found.categoria || '',
          cuenta_contable: found.cuenta_contable || '',
          tipo_movimiento: found.tipo_movimiento || 'Egreso',
          ef_item: found.ef_item || '',
          ef_subitem: found.ef_subitem || '',
          costo_directo: found.costo_directo || '',
          costo_indirecto: found.costo_indirecto || '',
          vigente: found.vigente !== false,
          notas: found.notas || ''
        };
      } else {
        state.form = formVacio();
        state.form.categoria = t.getAttribute('data-cat') || '';
        state.form.cuenta_contable = t.getAttribute('data-cta') || '';
        state.form.tipo_movimiento = t.getAttribute('data-tipo') || 'Egreso';
      }
      state.lista = 'relaciones';
      renderShell();
    }
  }

  function ensureMounted() {
    var el = root();
    if (!el || state.mounted) return;
    el.classList.add('vista-mef');
    el.addEventListener('click', onClick);
    state.mounted = true;
  }

  function init(options) { opts = options || opts; }

  function show() {
    ensureMounted();
    recargar();
  }

  global.FornitaliaMatrizEf = { init: init, show: show, recargar: recargar };
})(typeof window !== 'undefined' ? window : this);
