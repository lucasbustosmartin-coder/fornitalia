/**
 * Conciliación Bancaria – Fornitalia
 * Canales: Mercado Pago, Galicia (ARS) y Galicia (USD).
 * window.FornitaliaConciliacionBancaria.init({ client, hasPerm, getRoot })
 */
(function (global) {
  'use strict';

  var ZONA_AR = 'America/Argentina/Buenos_Aires';
  var CANAL_MP = 'mercadopago';
  var CANAL_GAL = 'galicia';
  var CANAL_GAL_USD = 'galicia_usd';
  var LABEL_GAL = 'Galicia (ARS)';
  var LABEL_GAL_USD = 'Galicia (USD)';
  var PERM_VER = 'ver_conciliacion_bancaria';
  var PERM_CARGAR = 'cargar_conciliacion_bancaria';
  var PERM_CONFIRMAR = 'confirmar_conciliacion_bancaria';
  var PDFJS_VER = '3.11.174';
  var PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.worker.min.js';
  var pdfjsReady = null;

  var ICO = {
    bank: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11M20 10v11"/><path d="M8 14v3M12 14v3M16 14v3"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.77-8.36L1 10"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>'
  };

  var opts = { client: null, hasPerm: function () { return true; }, getRoot: function () { return null; } };
  var state = {
    mounted: false,
    loading: false,
    canal: CANAL_MP,
    lista: 'sugeridos',
    q: '',
    mesExtracto: '',
    mesSistema: '',
    categoria: '',
    cuenta: '',
    sort: {
      sugeridos: { key: 'fecha_banco', dir: 'desc' },
      confirmados: { key: 'fecha_banco', dir: 'desc' },
      banco: { key: 'fecha', dir: 'desc' },
      sistema: { key: 'fecha', dir: 'desc' },
      bajas: { key: 'fecha', dir: 'desc' },
      anulados: { key: 'fecha', dir: 'desc' },
      norequiere: { key: 'fecha', dir: 'desc' }
    },
    movimientos: [],
    matches: [],
    msg: '',
    err: '',
    modal: null,
    modalFiltros: null,
    filtrosDraft: null,
    excluirId: '',
    excluirJustif: '',
    manual: {
      bancoIds: [],
      sistemaIds: [],
      qBanco: '',
      qSistema: '',
      mesExtracto: '',
      mesSistema: '',
      categoria: '',
      cuenta: '',
      justif: '',
      sortBanco: { key: 'fecha', dir: 'desc' },
      sortSistema: { key: 'fecha', dir: 'desc' }
    }
  };

  function client() { return opts.client; }
  function can(perm) { return typeof opts.hasPerm === 'function' ? opts.hasPerm(perm) : true; }
  function root() { return typeof opts.getRoot === 'function' ? opts.getRoot() : null; }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function errMsg(e) {
    if (!e) return 'Error desconocido.';
    return e.message || e.error_description || String(e);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function fechaHoyYmd() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_AR, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    var y = '', m = '', d = '';
    parts.forEach(function (p) {
      if (p.type === 'year') y = p.value;
      if (p.type === 'month') m = p.value;
      if (p.type === 'day') d = p.value;
    });
    return y + '-' + m + '-' + d;
  }

  function isoAFechaArgentina(iso) {
    if (!iso) return '';
    var dt = new Date(iso);
    if (isNaN(dt.getTime())) return '';
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_AR, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(dt);
    var y = '', m = '', d = '';
    parts.forEach(function (p) {
      if (p.type === 'year') y = p.value;
      if (p.type === 'month') m = p.value;
      if (p.type === 'day') d = p.value;
    });
    return y && m && d ? y + '-' + m + '-' + d : '';
  }

  function excelSerialToYmd(n) {
    var serial = Math.floor(Number(n));
    if (!isFinite(serial) || serial < 1) return '';
    var utc = Date.UTC(1899, 11, 30) + serial * 86400000;
    var dt = new Date(utc);
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }

  function parseFechaCelda(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
      if (v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0) {
        return v.getUTCFullYear() + '-' + pad2(v.getUTCMonth() + 1) + '-' + pad2(v.getUTCDate());
      }
      return isoAFechaArgentina(v.toISOString());
    }
    if (typeof v === 'number') return excelSerialToYmd(v);
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      if (s.indexOf('T') >= 0 || /Z|[+-]\d{2}:?\d{2}$/.test(s)) return isoAFechaArgentina(s);
      return s.slice(0, 10);
    }
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (m2) {
      var yy = Number(m2[3]);
      var yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
      return yyyy + '-' + pad2(m2[2]) + '-' + pad2(m2[1]);
    }
    return '';
  }

  function parseHora(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
      return pad2(v.getUTCHours()) + ':' + pad2(v.getUTCMinutes());
    }
    if (typeof v === 'number' && v > 0 && v < 1) {
      var secs = Math.round(v * 86400);
      var h = Math.floor(secs / 3600);
      var mi = Math.floor((secs % 3600) / 60);
      return pad2(h) + ':' + pad2(mi);
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return pad2(m[1]) + ':' + m[2];
    return '';
  }

  function parseMonto(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return Math.round(v * 100) / 100;
    var s = String(v).trim().replace(/\s/g, '').replace(/^US\$/i, '').replace(/^USD/i, '').replace(/^\$/, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.indexOf(',') >= 0) {
      s = s.replace(',', '.');
    }
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function formatFecha(ymd) {
    if (!ymd) return '—';
    var p = String(ymd).slice(0, 10).split('-');
    if (p.length !== 3) return esc(ymd);
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function formatMonto(n) {
    if (n == null || n === '') return '—';
    var v = Number(n);
    if (!isFinite(v)) return '—';
    var s = v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return esCanalGalUsd(state.canal) ? ('US$ ' + s) : s;
  }

  function normHeader(h) {
    return String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  function esCanalGalicia(c) {
    return c === CANAL_GAL || c === CANAL_GAL_USD;
  }

  function esCanalGalUsd(c) {
    return c === CANAL_GAL_USD;
  }

  function labelCanalNombre(c) {
    if (c === CANAL_GAL_USD) return LABEL_GAL_USD;
    if (c === CANAL_GAL) return LABEL_GAL;
    return 'Mercado Pago';
  }

  function esArchivoExtractoGaliciaUsd(archivo) {
    var t = normHeader(archivo);
    if (/extracto[_\s-]*cce/.test(t)) return true;
    if (/\bcce\d{6,}/.test(t)) return true;
    return false;
  }

  function esTesoreriaGaliciaUsd(archivo, hoja, caja) {
    var t = normHeader([archivo, hoja, caja].filter(Boolean).join(' '));
    if (t.indexOf('tesoreria_transferencia_galicia_dolar') >= 0) return true;
    if (t.indexOf('transferencia galicia dolar') >= 0) return true;
    if (t.indexOf('galicia dolar') >= 0 && t.indexOf('efectivo') < 0) return true;
    if (t.indexOf('galicia_dolar') >= 0 && t.indexOf('efectivo') < 0) return true;
    return false;
  }

  function nroCuentaExtractoGaliciaUsd(archivo) {
    var m = String(archivo || '').match(/CCE\d+/i);
    return m ? m[0].toUpperCase() : 'CCE';
  }

  function mapHeaders(row) {
    var map = {};
    (row || []).forEach(function (h, i) { map[normHeader(h)] = i; });
    return map;
  }

  function cell(row, map, names) {
    for (var i = 0; i < names.length; i++) {
      var idx = map[normHeader(names[i])];
      if (idx != null && row[idx] != null && row[idx] !== '') return row[idx];
    }
    return '';
  }

  function esAperturaDeCajaTexto(tipo, desc) {
    var t = String(tipo || '').toLowerCase();
    var d = String(desc || '').toLowerCase();
    return t.indexOf('apertura de caja') >= 0 || d.indexOf('apertura de caja') >= 0;
  }

  function esApertura(m) {
    return esAperturaDeCajaTexto(m && m.tipo, m && m.descripcion);
  }

  function centsImporte(n) {
    var v = Number(n);
    if (!isFinite(v)) return null;
    return Math.round(v * 100);
  }

  function mismoImporteExacto(a, b) {
    var ca = centsImporte(a);
    var cb = centsImporte(b);
    return ca != null && cb != null && ca === cb;
  }

  function toleranciaImporte(monto) {
    var a = Math.abs(Number(monto));
    if (!isFinite(a)) return 0.01;
    if (a < 100) return 0.01;
    if (a < 10000) return 1;
    if (a < 1000000) return 10;
    return 100;
  }

  function mismoImporte(a, b) {
    var ca = centsImporte(a);
    var cb = centsImporte(b);
    if (ca == null || cb == null) return false;
    var tol = Math.min(toleranciaImporte(a), toleranciaImporte(b));
    var tolCents = Math.round(tol * 100);
    return Math.abs(ca - cb) <= tolCents;
  }

  function daysBetween(a, b) {
    if (!a || !b) return 9999;
    var pa = String(a).slice(0, 10).split('-').map(Number);
    var pb = String(b).slice(0, 10).split('-').map(Number);
    var da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
    var db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((da - db) / 86400000);
  }

  var MAX_DIAS_SUGERENCIA = 4;

  function movimientosCanal() {
    return (state.movimientos || []).filter(function (m) { return m.canal === state.canal; });
  }

  function bancoRowsTodos() {
    return movimientosCanal().filter(function (m) { return m.origen === 'banco'; });
  }

  function esTextoAnulacionMp(tipo) {
    var t = normTxt(tipo);
    return /\banulacion\b|\bdevolucion\b/.test(t);
  }

  function paresMpAutoanulados(banco) {
    if (state.canal !== CANAL_MP) return [];
    var groups = {};
    (banco || []).forEach(function (m) {
      var k = String(m.id_operacion_relacionada || '').trim();
      if (!k) return;
      if (!groups[k]) groups[k] = [];
      groups[k].push(m);
    });
    var pares = [];
    Object.keys(groups).forEach(function (opRel) {
      var rows = groups[opRel];
      var used = {};
      var ordered = rows.slice().sort(function (a, b) {
        return (esTextoAnulacionMp(a.tipo) ? 0 : 1) - (esTextoAnulacionMp(b.tipo) ? 0 : 1);
      });
      ordered.forEach(function (a) {
        if (used[a.id]) return;
        var ma = Number(a.monto);
        if (!isFinite(ma) || Math.round(ma * 100) === 0) return;
        var best = null;
        var bestScore = 1e9;
        rows.forEach(function (b) {
          if (used[b.id] || b.id === a.id) return;
          var mb = Number(b.monto);
          if (!isFinite(mb)) return;
          if (Math.round((ma + mb) * 100) !== 0) return;
          var tipoBonus = esTextoAnulacionMp(a.tipo) !== esTextoAnulacionMp(b.tipo) ? 0 : 100;
          var sc = tipoBonus * 1000 + Math.abs(daysBetween(a.fecha, b.fecha));
          if (sc < bestScore) {
            bestScore = sc;
            best = b;
          }
        });
        if (!best) return;
        used[a.id] = true;
        used[best.id] = true;
        var orig = a;
        var anul = best;
        if (esTextoAnulacionMp(a.tipo) && !esTextoAnulacionMp(best.tipo)) {
          orig = best;
          anul = a;
        } else if (esTextoAnulacionMp(best.tipo) && !esTextoAnulacionMp(a.tipo)) {
          orig = a;
          anul = best;
        } else if (String(best.fecha || '') < String(a.fecha || '')) {
          orig = best;
          anul = a;
        }
        pares.push({
          id: orig.id + '|' + anul.id,
          a: orig,
          b: anul,
          opRel: opRel
        });
      });
    });
    return pares;
  }

  function mapaIdsMpAnulados() {
    var map = {};
    paresMpAutoanulados(bancoRowsTodos()).forEach(function (p) {
      map[p.a.id] = p;
      map[p.b.id] = p;
    });
    return map;
  }

  function esPendienteBaja(m) {
    return !!(m && (m.pendiente_baja === true || m.pendiente_baja === 'true'));
  }

  function esNoRequiereConciliacion(m) {
    return !!(m && (m.no_requiere_conciliacion === true || m.no_requiere_conciliacion === 'true'));
  }

  function idTesoreriaVisible(m) {
    var s = String((m && m.origen_id) || '');
    if (s.indexOf('id|') === 0) return s.slice(3);
    if (s.indexOf('cierre|') === 0) return s.slice(7);
    return s || '—';
  }

  function bancoRows() {
    var anul = mapaIdsMpAnulados();
    return bancoRowsTodos().filter(function (m) { return !anul[m.id]; });
  }

  function bancoRowsConciliables() {
    return bancoRows().filter(function (m) { return !esNoRequiereConciliacion(m); });
  }

  function bancoRowsNoRequiere() {
    return bancoRows().filter(esNoRequiereConciliacion);
  }

  function sistemaRowsTodos() {
    return movimientosCanal().filter(function (m) { return m.origen === 'sistema'; });
  }

  function sistemaRows() {
    return sistemaRowsTodos().filter(function (m) { return !esPendienteBaja(m); });
  }

  function sistemaRowsBaja() {
    return sistemaRowsTodos().filter(esPendienteBaja);
  }

  function matchConTesoreriaPendienteBaja(m) {
    return idsMatchLado(m, 'sistema').some(function (id) { return esPendienteBaja(findMov(id)); });
  }

  function findMov(id) {
    var arr = state.movimientos || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function filasHoja(wb, sheetName) {
    var sheet = wb.Sheets[sheetName];
    if (!sheet) return { rows: [], map: {} };
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    return { rows: rows, map: mapHeaders(rows[0] || []) };
  }

  function esMapaExtractoMp(map) {
    return map['numero de movimiento'] != null && map['importe'] != null;
  }

  function esMapaExtractoGalicia(map) {
    if (esMapaTesoreria(map) || esMapaTesoreriaCierre(map)) return false;
    return map['fecha'] != null && map['descripcion'] != null && map['saldo'] != null &&
      (map['debitos'] != null || map['creditos'] != null);
  }

  function detectarTipoExtracto(wb) {
    var names = wb.SheetNames || [];
    var i;
    for (i = 0; i < names.length; i++) {
      var info = filasHoja(wb, names[i]);
      if (esMapaExtractoMp(info.map)) return { tipo: 'mp', hoja: names[i] };
    }
    for (i = 0; i < names.length; i++) {
      var infoG = filasHoja(wb, names[i]);
      if (esMapaExtractoGalicia(infoG.map)) return { tipo: 'galicia', hoja: names[i] };
    }
    return { tipo: '', hoja: names[0] || '' };
  }

  function nombreHojaTesoreria(wb) {
    var names = wb.SheetNames || [];
    var prefer = esCanalGalUsd(state.canal)
      ? ['Transferencia Galicia Dolar', 'Transferencia Galicia Dólar']
      : (state.canal === CANAL_GAL
        ? ['Transferencia Galicia', 'Galicia']
        : ['MercadoPago', 'Mercado Pago']);
    var i;
    var j;
    for (i = 0; i < prefer.length; i++) {
      for (j = 0; j < names.length; j++) {
        if (names[j] === prefer[i]) return names[j];
      }
    }
    var needle = esCanalGalUsd(state.canal)
      ? 'galicia dolar'
      : (state.canal === CANAL_GAL ? 'galicia' : 'mercadopago');
    for (j = 0; j < names.length; j++) {
      if (normHeader(names[j]).indexOf(needle) >= 0) return names[j];
    }
    if (esCanalGalicia(state.canal)) {
      for (j = 0; j < names.length; j++) {
        if (normHeader(names[j]).indexOf('galicia') >= 0) return names[j];
      }
    }
    return names[0];
  }

  function esMapaTesoreria(map) {
    return map['fecha'] != null && map['tipo'] != null && (map['credito'] != null || map['debito'] != null);
  }

  function esMapaTesoreriaCierre(map) {
    return map['fecha'] != null && map['tipo'] != null && map['monto'] != null &&
      map['credito'] == null && map['debito'] == null;
  }

  function mapaTesoreriaTieneIdCierre(map) {
    return !!(map && Object.prototype.hasOwnProperty.call(map, 'id'));
  }

  function origenIdEsTesoreriaConId(origenId) {
    var s = String(origenId || '');
    return s.indexOf('id|') === 0 || s.indexOf('cierre|') === 0;
  }

  function canalPorCaja(caja) {
    var t = normHeader(caja);
    if (!t) return '';
    if (esTesoreriaGaliciaUsd('', '', caja)) return CANAL_GAL_USD;
    if (t.indexOf('galicia') >= 0) return CANAL_GAL;
    if (t.indexOf('mercadopago') >= 0 || t.indexOf('mercado pago') >= 0) return CANAL_MP;
    if (/(^|\s)mp(\s|-|$)/.test(t)) return CANAL_MP;
    return '';
  }

  function canalPorArchivoTesoreria(archivo) {
    var t = normHeader(archivo);
    if (!t) return '';
    if (esTesoreriaGaliciaUsd(archivo, '', '')) return CANAL_GAL_USD;
    if (t.indexOf('galicia') >= 0) return CANAL_GAL;
    if (t.indexOf('mercadopago') >= 0 || t.indexOf('mercado pago') >= 0) return CANAL_MP;
    return '';
  }

  function labelCajaFisicaNoConciliable(archivo, hoja, caja) {
    if (esTesoreriaGaliciaUsd('', '', caja)) return '';
    var t = normHeader([archivo, hoja, caja].filter(Boolean).join(' '));
    if (t.indexOf('efectivo pesos') >= 0 || t.indexOf('tesoreria_efectivo_pesos') >= 0) return 'Efectivo-f (ARS)';
    if (/\bcierre[_\s-]*pes\b/.test(t) || (t.indexOf('cierre') >= 0 && /\bpes-/.test(t))) return 'Efectivo-f (ARS)';
    if (t.indexOf('efectivo dolar') >= 0 || t.indexOf('tesoreria_efectivo_dolar') >= 0) return 'Efectivo-f (USD)';
    if (/\bcierre[_\s-]*dol\b/.test(t) || (t.indexOf('cierre') >= 0 && /\bdol-/.test(t))) return 'Efectivo-f (USD)';
    if (t.indexOf('transferencia morba') >= 0 || t.indexOf('transferencia morva') >= 0) return 'Morba-s/f (ARS)';
    if (t.indexOf('tesoreria_transferencia_morba') >= 0 || t.indexOf('tesoreria_transferencia_morva') >= 0) return 'Morba-s/f (ARS)';
    if (/\bcierre[_\s-]*mor\b/.test(t) || (t.indexOf('cierre') >= 0 && /\bmor-/.test(t))) return 'Morba-s/f (ARS)';
    return '';
  }

  function esFilaPieTesoreria(fechaRaw, tipo) {
    var f = String(fechaRaw || '').trim().toLowerCase();
    var t = String(tipo || '').trim().toLowerCase();
    if (!f && !t) return true;
    if (/^total\b/.test(f) || /^total\b/.test(t)) return true;
    if (/^\$/.test(f) || /^\$/.test(t) || /^us\$/.test(f) || /^us\$/.test(t)) return true;
    return false;
  }

  function prefijoAntesDeGuionBajo(archivo) {
    var base = String(archivo || '').split(/[\\/]/).pop() || '';
    var punto = base.lastIndexOf('.');
    if (punto > 0) base = base.slice(0, punto);
    var i = base.indexOf('_');
    if (i <= 0) return '';
    return base.slice(0, i).trim();
  }

  function errorPrefijoCierreCanal(archivo, canalTab) {
    var pref = prefijoAntesDeGuionBajo(archivo);
    var prefN = normHeader(pref);
    var esper = esCanalGalicia(canalTab) ? 'Galicia' : 'MP';
    var ok = esCanalGalicia(canalTab) ? prefN === 'galicia' : prefN === 'mp';
    if (ok) return '';
    return 'En ' + labelCanalNombre(canalTab) +
      ' el cierre de caja tiene que llamarse ' + esper + '_… (primera palabra antes del _). ' +
      'Este archivo empieza por «' + (pref || 'sin _') + '». Si trae columna Id, también vale cierre_CIERRE-… o cierre_DOL-… con Caja = Transferencia Galicia Dolar.';
  }

  function detectarCanalTesoreria(wb, archivo) {
    var names = wb.SheetNames || [];
    var blob = names.map(normHeader).join(' ') + ' ' + normHeader(archivo || '');
    var i;
    var j;
    for (i = 0; i < names.length; i++) {
      var info = filasHoja(wb, names[i]);
      var rows = info.rows || [];
      for (j = 0; j < Math.min(rows.length, 200); j++) {
        blob += ' ' + ((rows[j] || []).join(' '));
      }
    }
    blob = normHeader(blob);
    if (esTesoreriaGaliciaUsd(archivo, (wb.SheetNames || []).join(' '), '')) return CANAL_GAL_USD;
    if (blob.indexOf('galicia dolar') >= 0 || blob.indexOf('galicia_dolar') >= 0) return CANAL_GAL_USD;
    if (blob.indexOf('galicia') >= 0) return CANAL_GAL;
    if (blob.indexOf('mercadopago') >= 0 || blob.indexOf('mercado pago') >= 0) return CANAL_MP;
    return state.canal;
  }

  function detectarArchivo(wb, archivo) {
    var names = wb.SheetNames || [];
    var i;
    for (i = 0; i < names.length; i++) {
      var info = filasHoja(wb, names[i]);
      if (esMapaTesoreria(info.map) || esMapaTesoreriaCierre(info.map)) {
        return { clase: 'sistema', canal: detectarCanalTesoreria(wb, archivo), hoja: names[i] };
      }
    }
    var det = detectarTipoExtracto(wb);
    if (det.tipo === 'mp') return { clase: 'banco', canal: CANAL_MP, hoja: det.hoja };
    if (det.tipo === 'galicia') {
      return {
        clase: 'banco',
        canal: esArchivoExtractoGaliciaUsd(archivo) ? CANAL_GAL_USD : CANAL_GAL,
        hoja: det.hoja
      };
    }
    return { clase: '', canal: state.canal, hoja: names[0] || '' };
  }

  function hojaTesoreria(wb, archivo) {
    var det = detectarArchivo(wb, archivo);
    if (det.clase === 'sistema' && det.hoja) return det.hoja;
    return nombreHojaTesoreria(wb);
  }

  function parseExtractoMp(wb, archivo, hoja) {
    var sheet = wb.Sheets[hoja || wb.SheetNames[0]];
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (!rows.length) return { error: 'El Excel de Mercado Pago no tiene filas.', filas: [] };
    var map = mapHeaders(rows[0]);
    if (map['numero de movimiento'] == null || map['importe'] == null) {
      return { error: 'No reconocí el extracto de Mercado Pago. Esperaba columnas Fecha de Pago, Tipo de Operación, Número de Movimiento, Operación Relacionada e Importe.', filas: [] };
    }
    var filas = [];
    var vistos = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var idMov = String(cell(row, map, ['Número de Movimiento', 'Numero de Movimiento']) || '').trim();
      if (!idMov) continue;
      if (vistos[idMov]) continue;
      vistos[idMov] = true;
      var fechaRaw = cell(row, map, ['Fecha de Pago', 'Fecha']);
      var fecha = parseFechaCelda(fechaRaw);
      var importe = parseMonto(cell(row, map, ['Importe']));
      if (importe == null) continue;
      var tipo = String(cell(row, map, ['Tipo de Operación', 'Tipo de Operacion', 'Tipo']) || '').trim();
      var opRel = String(cell(row, map, ['Operación Relacionada', 'Operacion Relacionada']) || '').trim();
      var fechaHora = null;
      if (fechaRaw instanceof Date && !isNaN(fechaRaw.getTime())) fechaHora = fechaRaw.toISOString();
      else if (typeof fechaRaw === 'string' && fechaRaw.indexOf('T') >= 0) {
        var iso = new Date(fechaRaw);
        if (!isNaN(iso.getTime())) fechaHora = iso.toISOString();
      }
      filas.push({
        origen_id: idMov,
        fecha: fecha || fechaHoyYmd(),
        fecha_hora: fechaHora,
        tipo: tipo || null,
        descripcion: tipo || null,
        contraparte: opRel || null,
        monto: importe,
        moneda: 'ARS',
        categoria: null,
        cuenta_contable: null,
        credito: importe > 0 ? importe : null,
        debito: importe < 0 ? Math.abs(importe) : null,
        saldo: null,
        id_operacion_relacionada: opRel || null,
        id_movimiento_banco: idMov,
        archivo: archivo,
        fila_excel: r + 1,
        raw: {
          fecha_pago: fechaRaw,
          tipo: tipo,
          numero_movimiento: idMov,
          operacion_relacionada: opRel,
          importe: importe
        }
      });
    }
    if (!filas.length) return { error: 'No encontré movimientos con Número de Movimiento e Importe.', filas: [] };
    return { error: null, filas: filas };
  }

  function parseExtractoGalicia(wb, archivo, hoja) {
    var name = hoja || (wb.SheetNames.indexOf('Movimientos') >= 0 ? 'Movimientos' : wb.SheetNames[0]);
    var sheet = wb.Sheets[name];
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (!rows.length) return { error: 'El extracto de Galicia no tiene filas.', filas: [] };
    var map = mapHeaders(rows[0]);
    if (!esMapaExtractoGalicia(map)) {
      return {
        error: esCanalGalicia(state.canal)
          ? 'No reconocí el extracto de Galicia. Esperaba Fecha, Descripción, Débitos, Créditos y Saldo (Extracto_CC… en ARS o Extracto_CCE… en USD).'
          : 'No reconocí el extracto de Galicia. Esperaba Fecha, Descripción, Débitos, Créditos y Saldo (p. ej. Extracto_CC…).',
        filas: []
      };
    }
    var counts = {};
    var filas = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var fechaRaw = cell(row, map, ['Fecha']);
      var fecha = parseFechaCelda(fechaRaw);
      var desc = String(cell(row, map, ['Descripción', 'Descripcion']) || '').trim();
      var deb = parseMonto(cell(row, map, ['Débitos', 'Debitos', 'Débito', 'Debito']));
      var cred = parseMonto(cell(row, map, ['Créditos', 'Creditos', 'Crédito', 'Credito']));
      var saldo = parseMonto(cell(row, map, ['Saldo']));
      if (!fecha && !desc && deb == null && cred == null) continue;
      if (deb == null && cred == null) continue;
      var monto = 0;
      if (cred != null && cred !== 0) monto = cred;
      else if (deb != null && deb !== 0) monto = -Math.abs(deb);
      var ley1 = String(cell(row, map, ['Leyendas Adicionales 1']) || '').trim();
      var ley2 = String(cell(row, map, ['Leyendas Adicionales 2']) || '').trim();
      var ley3 = String(cell(row, map, ['Leyendas Adicionales 3']) || '').trim();
      var ley4 = String(cell(row, map, ['Leyendas Adicionales 4']) || '').trim();
      var origenBanco = String(cell(row, map, ['Origen']) || '').trim();
      var terminal = String(cell(row, map, ['Número de Terminal', 'Numero de Terminal']) || '').trim();
      var obs = String(cell(row, map, ['Observaciones Cliente']) || '').trim();
      var comprob = String(cell(row, map, ['Número de Comprobante', 'Numero de Comprobante']) || '').trim();
      var grupo = String(cell(row, map, ['Grupo de Conceptos']) || '').trim();
      var concepto = String(cell(row, map, ['Concepto']) || '').trim();
      var tipoMov = String(cell(row, map, ['Tipo de Movimiento']) || '').trim();
      var contraparte = ley1 || obs || '';
      var descFull = desc;
      if (ley1 && desc.indexOf(ley1) < 0) descFull = desc ? (desc + ' · ' + ley1) : ley1;
      var debKey = deb == null ? '' : String(Math.round(deb * 100) / 100);
      var credKey = cred == null ? '' : String(Math.round(cred * 100) / 100);
      var prefId = esArchivoExtractoGaliciaUsd(archivo) ? 'galu' : 'gal';
      var base = [prefId, fecha, debKey, credKey, desc, comprob || ''].join('|');
      counts[base] = (counts[base] || 0) + 1;
      var origenId = base + '#' + counts[base];
      var fechaHora = null;
      if (fechaRaw instanceof Date && !isNaN(fechaRaw.getTime())) fechaHora = fechaRaw.toISOString();
      filas.push({
        origen_id: origenId,
        fecha: fecha || fechaHoyYmd(),
        fecha_hora: fechaHora,
        tipo: desc || null,
        descripcion: descFull || null,
        contraparte: contraparte || null,
        monto: Math.round(monto * 100) / 100,
        moneda: esArchivoExtractoGaliciaUsd(archivo) ? 'USD' : 'ARS',
        categoria: tipoMov || grupo || null,
        cuenta_contable: null,
        credito: cred != null && cred !== 0 ? cred : null,
        debito: deb != null && deb !== 0 ? Math.abs(deb) : null,
        saldo: saldo,
        id_operacion_relacionada: origenBanco || terminal || ley2 || null,
        id_movimiento_banco: comprob || null,
        archivo: archivo,
        fila_excel: r + 1,
        raw: {
          fecha: fecha,
          descripcion: desc,
          origen: origenBanco,
          debitos: deb,
          creditos: cred,
          grupo_conceptos: grupo,
          concepto: concepto,
          numero_terminal: terminal,
          observaciones_cliente: obs,
          numero_comprobante: comprob,
          leyenda_1: ley1,
          leyenda_2: ley2,
          leyenda_3: ley3,
          leyenda_4: ley4,
          tipo_movimiento: tipoMov,
          saldo: saldo
        }
      });
    }
    if (!filas.length) return { error: 'No encontré movimientos en el extracto de Galicia (Débitos/Créditos).', filas: [] };
    return { error: null, filas: filas };
  }

  function ensurePdfJs() {
    if (global.pdfjsLib) {
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return Promise.resolve(global.pdfjsLib);
    }
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_SRC;
      s.onload = function () {
        if (!global.pdfjsLib) {
          reject(new Error('No se pudo cargar el lector de PDF.'));
          return;
        }
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(global.pdfjsLib);
      };
      s.onerror = function () { reject(new Error('No se pudo cargar el lector de PDF.')); };
      document.head.appendChild(s);
    });
    return pdfjsReady;
  }

  function esArchivoPdf(file) {
    if (!file) return false;
    if (file.type && /pdf/i.test(file.type)) return true;
    return /\.pdf$/i.test(file.name || '');
  }

  function lineasPdfPorY(items, yTol) {
    yTol = yTol == null ? 2 : yTol;
    var rows = [];
    (items || []).forEach(function (it) {
      var t = String((it && it.str) || '').replace(/\u00a0/g, ' ').trim();
      if (!t) return;
      var x = it.transform ? it.transform[4] : 0;
      var y = it.transform ? it.transform[5] : 0;
      var row = null;
      var i;
      for (i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].y - y) <= yTol) { row = rows[i]; break; }
      }
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, t: t });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      return r.parts.sort(function (a, b) { return a.x - b.x; }).map(function (p) { return p.t; }).join(' ');
    });
  }

  async function pdfLineasArchivo(file) {
    var pdfjs = await ensurePdfJs();
    var buf = await file.arrayBuffer();
    var pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    var all = [];
    var n;
    for (n = 1; n <= pdf.numPages; n++) {
      var page = await pdf.getPage(n);
      var content = await page.getTextContent();
      all = all.concat(lineasPdfPorY(content.items || []));
    }
    return all;
  }

  function esHeaderPdfGalicia(line) {
    var s = String(line || '').trim();
    if (!s) return true;
    if (/^resumen de cuenta corriente/i.test(s)) return true;
    if (/^r\s*esumen de cuenta corriente/i.test(s)) return true;
    if (/p[aá]gina\s+\d+\s*\/\s*\d+/i.test(s)) return true;
    if (/^fecha\s+descripci[oó]n/i.test(s)) return true;
    if (/^\d{17}[A-Z]$/i.test(s)) return true;
    if (/^movimientos$/i.test(s)) return true;
    if (/^consolidado/i.test(s)) return true;
    if (/^total\s*(?:\$|usd|-usd)/i.test(s)) return true;
    if (/^canales de atenci/i.test(s)) return true;
    if (/^cuit del responsable/i.test(s)) return true;
    return false;
  }

  function blobPdfGalicia(lines, nombre) {
    return ((lines || []).slice(0, 80).join(' ') + ' ' + (nombre || '')).replace(/\s+/g, ' ');
  }

  function esPdfResumenGalicia(nombre, lines) {
    if (/extracto_cuentas_galicia/i.test(nombre || '')) return true;
    var blob = blobPdfGalicia(lines, '');
    return /r\s*esumen de cuenta corriente/i.test(blob) || /resumen de cuenta corriente/i.test(blob);
  }

  function esPdfGaliciaUsd(nombre, lines) {
    var blob = normHeader(blobPdfGalicia(lines, nombre));
    if (/cuenta corriente especial en dolares/.test(blob)) return true;
    if (/especial en dolares/.test(blob)) return true;
    return /en dolares/.test(blob) && /cuenta corriente especial/.test(blob);
  }

  function esPdfGaliciaArs(nombre, lines) {
    var blob = normHeader(blobPdfGalicia(lines, nombre));
    if (/cuenta corriente especial en dolares/.test(blob)) return false;
    return /cuenta corriente en pesos/.test(blob) || (/\ben pesos\b/.test(blob) && /cuenta corriente/.test(blob));
  }

  function filasDesdeMovsPdfGalicia(movs, archivo, esUsd) {
    var counts = {};
    var filas = [];
    var prefId = esUsd ? 'galu' : 'gal';
    (movs || []).forEach(function (mv, idx) {
      var imp = Number(mv.importe);
      if (!isFinite(imp)) return;
      var cred = imp > 0 ? imp : null;
      var deb = imp < 0 ? Math.abs(imp) : null;
      var tipo = String(mv.tipo || '').trim();
      var extras = mv.extras || [];
      var ley1 = extras[0] || '';
      var ley2 = extras[1] || '';
      var ley3 = extras[2] || '';
      var ley4 = extras[3] || '';
      var descFull = tipo;
      if (ley1 && tipo.indexOf(ley1) < 0) descFull = tipo ? (tipo + ' · ' + ley1) : ley1;
      var debKey = deb == null ? '0' : String(Math.round(deb * 100) / 100);
      var credKey = cred == null ? '0' : String(Math.round(cred * 100) / 100);
      var base = [prefId, mv.fecha, debKey, credKey, tipo, ''].join('|');
      counts[base] = (counts[base] || 0) + 1;
      filas.push({
        origen_id: base + '#' + counts[base],
        fecha: mv.fecha || fechaHoyYmd(),
        fecha_hora: null,
        tipo: tipo || null,
        descripcion: descFull || null,
        contraparte: ley1 || null,
        monto: Math.round(imp * 100) / 100,
        moneda: esUsd ? 'USD' : 'ARS',
        categoria: null,
        cuenta_contable: null,
        credito: cred,
        debito: deb,
        saldo: mv.saldo != null ? mv.saldo : null,
        id_operacion_relacionada: mv.origen || ley2 || null,
        id_movimiento_banco: null,
        archivo: archivo,
        fila_excel: idx + 1,
        raw: {
          fuente: 'pdf',
          fecha: mv.fecha,
          descripcion: tipo,
          origen: mv.origen || '',
          debitos: deb,
          creditos: cred,
          leyenda_1: ley1,
          leyenda_2: ley2,
          leyenda_3: ley3,
          leyenda_4: ley4,
          saldo: mv.saldo
        }
      });
    });
    return filas;
  }

  function parseExtractoGaliciaPdfLineas(lines, archivo, esUsd) {
    var RE_FECHA = /^(\d{2}\/\d{2}\/\d{2})\s+(.+)$/;
    var RE_MONTOS = /^(.*?)\s+(?:([A-Za-z0-9]{3,6})\s+)?(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;
    var RE_SOLO_MONTOS = /^(?:([A-Za-z0-9]{3,6})\s+)?(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;
    var movs = [];
    var cur = null;
    function flush() {
      if (cur && cur.fecha && cur.tipo && cur.importe != null) movs.push(cur);
      cur = null;
    }
    function aplicarMontos(target, origen, imp, saldo) {
      if (!target || imp == null) return false;
      target.origen = origen || target.origen || '';
      target.importe = imp;
      target.saldo = saldo;
      return true;
    }
    var i;
    for (i = 0; i < (lines || []).length; i++) {
      var line = String(lines[i] || '').replace(/\s+/g, ' ').trim();
      if (!line) continue;
      if (/^Total\s*(?:\$|USD|-USD)/i.test(line) || /^Consolidado/i.test(line)) {
        flush();
        break;
      }
      var df = line.match(RE_FECHA);
      if (df) {
        flush();
        var mm = df[2].match(RE_MONTOS);
        if (mm) {
          var desc = String(mm[1] || '').trim();
          var imp = parseMonto(mm[3]);
          var saldo = parseMonto(mm[4]);
          if (!desc || imp == null) continue;
          cur = {
            fecha: parseFechaCelda(df[1]),
            tipo: desc,
            origen: mm[2] || '',
            importe: imp,
            saldo: saldo,
            extras: []
          };
        } else {
          var tipoSolo = String(df[2] || '').trim();
          if (!tipoSolo) continue;
          cur = {
            fecha: parseFechaCelda(df[1]),
            tipo: tipoSolo,
            origen: '',
            importe: null,
            saldo: null,
            extras: []
          };
        }
        continue;
      }
      if (!cur) continue;
      if (cur.importe == null) {
        var solo = line.match(RE_SOLO_MONTOS);
        if (solo) {
          aplicarMontos(cur, solo[1] || '', parseMonto(solo[2]), parseMonto(solo[3]));
          continue;
        }
        var mmLate = line.match(RE_MONTOS);
        if (mmLate) {
          var descLate = String(mmLate[1] || '').trim();
          if (descLate && cur.tipo && descLate !== cur.tipo) cur.extras.push(descLate);
          aplicarMontos(cur, mmLate[2] || '', parseMonto(mmLate[3]), parseMonto(mmLate[4]));
          continue;
        }
      }
      if (!esHeaderPdfGalicia(line)) cur.extras.push(line);
    }
    flush();
    var filas = filasDesdeMovsPdfGalicia(movs, archivo, !!esUsd);
    if (!filas.length) {
      return { error: 'Encontré el PDF de Galicia pero no pude leer movimientos (Fecha, importe y saldo).', filas: [] };
    }
    return {
      error: null,
      filas: filas,
      fuentePdf: true,
      canal: esUsd ? CANAL_GAL_USD : CANAL_GAL,
      pdfText: (lines || []).join('\n')
    };
  }

  async function parseExtractoGaliciaPdfArchivo(file) {
    var nombre = (file && file.name) || 'extracto.pdf';
    var lines = await pdfLineasArchivo(file);
    if (!esPdfResumenGalicia(nombre, lines)) {
      return {
        error: 'No reconocí un resumen de Galicia (Extracto_Cuentas_Galicia_…, cuenta corriente en pesos o en dólares).',
        filas: []
      };
    }
    var esUsd = esPdfGaliciaUsd(nombre, lines);
    if (!esUsd && !esPdfGaliciaArs(nombre, lines)) {
      esUsd = /dolares|dólares|\busd\b/i.test(blobPdfGalicia(lines, ''));
    }
    return parseExtractoGaliciaPdfLineas(lines, nombre, esUsd);
  }

  function parseTesoreriaMp(wb, archivo, hoja) {
    var name = hoja || hojaTesoreria(wb, archivo);
    var sheet = wb.Sheets[name];
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (!rows.length) return { error: 'El Excel de tesorería no tiene filas.', filas: [] };
    var map = mapHeaders(rows[0]);
    var esCierre = esMapaTesoreriaCierre(map);
    if (!esMapaTesoreria(map) && !esCierre) {
      return {
        error: esCanalGalUsd(state.canal)
          ? 'No reconocí la tesorería de Galicia (USD). Esperaba tesoreria_transferencia_galicia_dolar_… (Tipo, Fecha, Crédito, Débito e Id) o el cierre de caja (Fecha, Tipo, Monto e Id; p. ej. cierre_CIERRE-… o cierre_DOL-…) con Caja = Transferencia Galicia Dolar.'
          : (state.canal === CANAL_GAL
          ? 'No reconocí la tesorería de Galicia. Esperaba Tipo, Fecha, Crédito, Débito e Id (p. ej. tesoreria_transferencia_galicia) o el cierre de caja (Fecha, Tipo, Monto e Id).'
          : 'No reconocí la tesorería de Mercado Pago. Esperaba Tipo, Fecha, Crédito, Débito e Id o el cierre de caja (Fecha, Tipo, Monto e Id; p. ej. cierre_CIERRE-…).'),
        filas: []
      };
    }
    var cajaMuestra = '';
    var rr;
    for (rr = 1; rr < Math.min(rows.length, 12); rr++) {
      cajaMuestra = String(cell(rows[rr] || [], map, ['Caja']) || '').trim();
      if (cajaMuestra) break;
    }
    var cajaFisica = labelCajaFisicaNoConciliable(archivo, name, cajaMuestra);
    if (cajaFisica) {
      return { error: 'Ese archivo es de la caja física ' + cajaFisica + '. Cargalo en el menú Cajas (físicas).', filas: [] };
    }
    var counts = {};
    var idsVistos = {};
    var filas = [];
    var omitidasApertura = 0;
    var omitidasCaja = 0;
    var omitidasIdDup = 0;
    var omitidasSinId = 0;
    var tieneIdCierre = false;
    var exigeId = mapaTesoreriaTieneIdCierre(map);
    var canalArchivo = canalPorArchivoTesoreria(archivo);
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var tipo = String(cell(row, map, ['Tipo']) || '').trim();
      var fechaRaw = cell(row, map, ['Fecha']);
      if (esFilaPieTesoreria(fechaRaw, tipo)) continue;
      var fecha = parseFechaCelda(fechaRaw);
      var hora = parseHora(cell(row, map, ['Hora']));
      var desc = String(cell(row, map, ['Descripción', 'Descripcion']) || '').trim();
      var cliente = String(cell(row, map, ['Cliente']) || '').trim();
      var cat = String(cell(row, map, ['Categoría', 'Categoria']) || '').trim();
      var cta = String(cell(row, map, ['Cuenta Contable']) || '').trim();
      var cred = parseMonto(cell(row, map, ['Crédito', 'Credito']));
      var deb = parseMonto(cell(row, map, ['Débito', 'Debito']));
      var saldo = parseMonto(cell(row, map, ['Saldo (ARS)', 'Saldo (USD)', 'Saldo']));
      var obs = String(cell(row, map, ['Observaciones']) || '').trim();
      var caja = String(cell(row, map, ['Caja']) || '').trim();
      var usuario = String(cell(row, map, ['Usuario']) || '').trim();
      var status = String(cell(row, map, ['Status', 'Estado']) || '').trim();
      var monedaFila = String(cell(row, map, ['Moneda']) || '').trim() || 'ARS';
      var idCierre = String(cell(row, map, ['Id', 'ID']) || '').trim();
      if (idCierre) tieneIdCierre = true;
      if (esAperturaDeCajaTexto(tipo, desc)) {
        omitidasApertura += 1;
        continue;
      }
      if (esCierre) {
        if (normHeader(status) === 'pendiente') continue;
        if (!fecha) continue;
        var montoCierre = parseMonto(cell(row, map, ['Monto']));
        var tipoN = tipo.toLowerCase();
        if (tipoN.indexOf('egreso') >= 0 && montoCierre != null) {
          deb = Math.abs(montoCierre);
          cred = null;
        } else if (tipoN.indexOf('ingreso') >= 0 && montoCierre != null) {
          cred = montoCierre;
          deb = null;
        }
        if (caja && !canalPorCaja(caja)) {
          omitidasCaja += 1;
          continue;
        }
      }
      if (!tipo && !fecha && cred == null && deb == null) continue;
      if (esCierre && cred == null && deb == null) continue;
      var monto = 0;
      if (cred != null && cred !== 0) monto = cred;
      else if (deb != null && deb !== 0) monto = -Math.abs(deb);
      var origenId;
      if (exigeId && !idCierre) {
        omitidasSinId += 1;
        continue;
      }
      if (idCierre) {
        if (idsVistos[idCierre]) {
          omitidasIdDup += 1;
          continue;
        }
        idsVistos[idCierre] = true;
        origenId = 'id|' + idCierre;
      } else {
        var base = esCierre
          ? [tipo, fecha, desc, cliente, cred == null ? '' : cred, deb == null ? '' : deb].join('|')
          : [tipo, fecha, hora, desc, cliente, cred == null ? '' : cred, deb == null ? '' : deb, saldo == null ? '' : saldo].join('|');
        counts[base] = (counts[base] || 0) + 1;
        origenId = 'tes|' + base + '#' + counts[base];
      }
      var fechaHora = null;
      if (fecha) fechaHora = fecha + 'T' + (hora || '00:00') + ':00-03:00';
      filas.push({
        origen_id: origenId,
        canal: canalPorCaja(caja) || canalArchivo || null,
        fecha: fecha || fechaHoyYmd(),
        fecha_hora: fechaHora,
        tipo: tipo || null,
        descripcion: desc || null,
        contraparte: cliente || null,
        monto: Math.round(monto * 100) / 100,
        moneda: (esTesoreriaGaliciaUsd(archivo, name, caja) || String(monedaFila).toUpperCase() === 'USD')
          ? 'USD'
          : (monedaFila || 'ARS'),
        categoria: cat || null,
        cuenta_contable: cta || null,
        credito: cred,
        debito: deb,
        saldo: saldo,
        id_operacion_relacionada: null,
        id_movimiento_banco: null,
        archivo: archivo,
        fila_excel: r + 1,
        raw: {
          tipo: tipo, fecha: fecha, hora: hora, categoria: cat, cuenta_contable: cta,
          descripcion: desc, cliente: cliente, credito: cred, debito: deb, saldo: saldo, observaciones: obs,
          caja: caja || null, usuario: usuario || null, status: status || null,
          id: idCierre || null,
          formato: esCierre ? 'cierre' : 'tesoreria'
        }
      });
    }
    var canalDetectado = canalPorCaja(cajaMuestra) || canalArchivo || null;
    if (!filas.length) {
      if (omitidasApertura && !omitidasCaja && !omitidasSinId) {
        return {
          error: null,
          filas: [],
          omitidasApertura: omitidasApertura,
          omitidasCaja: omitidasCaja,
          omitidasIdDup: omitidasIdDup,
          omitidasSinId: omitidasSinId,
          formatoCierre: esCierre,
          tieneIdCierre: tieneIdCierre,
          canalDetectado: canalDetectado
        };
      }
      return {
        error: exigeId && omitidasSinId && !omitidasApertura
          ? 'El archivo tiene columna Id pero ninguna fila con Id para cargar.'
          : 'No encontré filas de tesorería para cargar.',
        filas: [],
        omitidasApertura: omitidasApertura,
        omitidasCaja: omitidasCaja,
        omitidasSinId: omitidasSinId,
        canalDetectado: canalDetectado
      };
    }
    return {
      error: null,
      filas: filas,
      omitidasApertura: omitidasApertura,
      omitidasCaja: omitidasCaja,
      omitidasIdDup: omitidasIdDup,
      omitidasSinId: omitidasSinId,
      formatoCierre: esCierre,
      tieneIdCierre: tieneIdCierre,
      canalDetectado: canalDetectado
    };
  }

  function textoMov(m) {
    if (!m) return '';
    var raw = m.raw && typeof m.raw === 'object' ? m.raw : {};
    return [
      m.tipo, m.descripcion, m.contraparte, m.categoria, m.cuenta_contable,
      raw.leyenda_1, raw.leyenda_2, raw.leyenda_3, raw.cliente, raw.cuenta_contable,
      raw.descripcion, raw.concepto, raw.grupo_conceptos
    ].filter(Boolean).join(' ');
  }

  function normTxt(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function tagsConcepto(txt) {
    var t = ' ' + normTxt(txt) + ' ';
    var tags = [];
    if (/\bsircreb\b|\bsirtac\b|\breg recau\b/.test(t)) tags.push('sircreb');
    else if (/\bingresos brutos\b|\bing brutos\b|\biibb\b|\bperc ing\b/.test(t)) tags.push('iibb');
    if (/\biva\b/.test(t)) tags.push('iva');
    if (/\bganancias\b|\brg 5617\b|\b5617\b/.test(t)) tags.push('ganancias');
    if (/\b25413\b|\b25 413\b|\bdeb y cred\b|\bcreditos y debitos\b|\bimp deb\b|\bimp cre\b/.test(t)) tags.push('ley25413');
    if (/\bintereses absorbidos\b|\bintereses\b/.test(t)) tags.push('intereses');
    else if (/\bcosto de mercado pago\b|\bcosto financiero\b|\bcomision\b/.test(t)) tags.push('costo_mp');
    if (/\bcobranza\b|\bcobro\b/.test(t)) tags.push('cobro');
    if (/\bfacebk\b|\bfacebook\b|\bpublicidad\b/.test(t)) tags.push('publicidad');
    return tags;
  }

  function familiaTag(tag) {
    if (tag === 'sircreb') return 'iibb';
    return tag;
  }

  function tagsParaScore(txt) {
    return tagsConcepto(txt).map(familiaTag);
  }

  var STOP_DESC = {
    el: 1, la: 1, los: 1, las: 1, de: 1, del: 1, y: 1, en: 1, por: 1, para: 1, con: 1,
    un: 1, una: 1, al: 1, pago: 1, clau: 1, impuesto: 1, impuestos: 1, perc: 1, percep: 1,
    percepcion: 1, retencion: 1, sufrida: 1, general: 1, gral: 1, regimen: 1, tipo: 1,
    egreso: 1, ingreso: 1, transferencia: 1, cuenta: 1
  };

  function tokensDesc(txt) {
    return normTxt(txt).split(' ').filter(function (w) {
      return w.length >= 4 && !STOP_DESC[w] && !/^\d+$/.test(w);
    });
  }

  function scoreDescripcion(b, s) {
    var tb = textoMov(b);
    var ts = textoMov(s);
    var tagsB = tagsParaScore(tb);
    var tagsS = tagsParaScore(ts);
    var tax = { iibb: 1, iva: 1, ganancias: 1, ley25413: 1 };
    var tagHit = 0;
    tagsB.forEach(function (tag) {
      if (tagsS.indexOf(tag) >= 0) tagHit += 100;
    });
    var bTax = tagsB.filter(function (x) { return tax[x]; });
    var sTax = tagsS.filter(function (x) { return tax[x]; });
    if (bTax.length && sTax.length && tagHit === 0) return -80;
    var tokB = tokensDesc(tb);
    var tokS = tokensDesc(ts);
    var seen = {};
    var overlap = 0;
    tokB.forEach(function (w) {
      if (seen[w]) return;
      if (tokS.indexOf(w) >= 0) { overlap++; seen[w] = 1; }
    });
    var nom = 0;
    var nb = normTxt(b && b.contraparte);
    var ns = normTxt(s && s.contraparte);
    if (nb.length >= 5 && ns.length >= 5) {
      if (nb === ns || ns.indexOf(nb) >= 0 || nb.indexOf(ns) >= 0) nom = 60;
      else {
        var pb = nb.split(' ');
        var ps = ns.split(' ');
        pb.forEach(function (w) {
          if (w.length >= 5 && ps.indexOf(w) >= 0) nom += 20;
        });
      }
    }
    return tagHit + overlap * 8 + nom;
  }

  function candidatosMonto(b, S, usedS, rejected, ventana, opts) {
    opts = opts || {};
    return S.filter(function (s) {
      if (usedS[s.id] || rejected[b.id + '|' + s.id]) return false;
      var okMonto = opts.exact ? mismoImporteExacto(b.monto, s.monto) : mismoImporte(b.monto, s.monto);
      if (!okMonto) return false;
      var d = Math.abs(daysBetween(b.fecha, s.fecha));
      if (d > MAX_DIAS_SUGERENCIA) return false;
      if (ventana === 'mismo_dia') return d === 0;
      if (ventana === 'cerca') return d > 0 && d <= MAX_DIAS_SUGERENCIA;
      return false;
    });
  }

  function elegirCandidato(b, cands) {
    if (!cands || !cands.length) return null;
    var ranked = cands.slice().sort(function (a, c) {
      var sa = scoreDescripcion(b, a);
      var sc = scoreDescripcion(b, c);
      if (sa !== sc) return sc - sa;
      return Math.abs(daysBetween(b.fecha, a.fecha)) - Math.abs(daysBetween(b.fecha, c.fecha));
    });
    var best = ranked[0];
    if (cands.length > 1 && scoreDescripcion(b, best) < 0) return null;
    return best;
  }

  function bancosOrdenConcepto(B, S) {
    return B.slice().sort(function (a, b) {
      var sa = 0;
      var sb = 0;
      S.forEach(function (s) {
        if (mismoImporte(a.monto, s.monto)) sa = Math.max(sa, scoreDescripcion(a, s));
        if (mismoImporte(b.monto, s.monto)) sb = Math.max(sb, scoreDescripcion(b, s));
      });
      return sb - sa;
    });
  }

  function criterioPorDesc(b, s, d, ambiguo, lejos, exacto) {
    var sc = scoreDescripcion(b, s);
    if (exacto && d === 0 && sc >= 50) return 'monto_y_fecha_concepto_exacto';
    if (exacto && d === 0) return 'monto_y_fecha_exacto';
    if (d === 0 && sc >= 50) return 'monto_y_fecha_concepto';
    if (d === 0) return 'monto_y_fecha';
    if (sc >= 50) return lejos ? 'monto_fecha_lejana_concepto' : 'monto_fecha_cercana_concepto';
    if (lejos) return ambiguo ? 'monto_fecha_lejana_ambiguo' : 'monto_fecha_lejana';
    return ambiguo ? 'monto_fecha_cercana_ambiguo' : 'monto_fecha_cercana';
  }

  function generarSugerencias(banco, sistema, matches) {
    var lockedB = {};
    var lockedS = {};
    var rejected = {};
    (matches || []).forEach(function (m) {
      if (m.estado === 'confirmado') {
        idsMatchLado(m, 'banco').forEach(function (id) { lockedB[id] = true; });
        idsMatchLado(m, 'sistema').forEach(function (id) { lockedS[id] = true; });
      }
      if (m.estado === 'rechazado') rejected[m.banco_id + '|' + m.sistema_id] = true;
    });
    var B = banco.filter(function (x) { return !lockedB[x.id] && !esApertura(x); });
    var S = sistema.filter(function (x) { return !lockedS[x.id] && !esApertura(x); });
    var usedB = {};
    var usedS = {};
    var out = [];

    function tryPair(b, s, score, criterio) {
      if (!b || !s || usedB[b.id] || usedS[s.id]) return false;
      if (rejected[b.id + '|' + s.id]) return false;
      usedB[b.id] = true;
      usedS[s.id] = true;
      out.push({ banco_id: b.id, sistema_id: s.id, score: score, criterio: criterio });
      return true;
    }

    function pairar(b, s, ambiguo, exacto) {
      if (!s) return false;
      var d = Math.abs(daysBetween(b.fecha, s.fecha));
      if (d > MAX_DIAS_SUGERENCIA) return false;
      var sc = scoreDescripcion(b, s);
      var base = d === 0 ? 100 : 90;
      if (exacto) base += 15;
      if (sc >= 50) base += 10;
      if (ambiguo && sc < 50) base -= 10;
      return tryPair(b, s, base, criterioPorDesc(b, s, d, ambiguo, false, exacto));
    }

    function pasar(ventana, opts) {
      opts = opts || {};
      bancosOrdenConcepto(B, S).forEach(function (b) {
        if (usedB[b.id]) return;
        var cands = candidatosMonto(b, S, usedS, rejected, ventana, opts);
        if (opts.requireConcepto) {
          cands = cands.filter(function (s) { return scoreDescripcion(b, s) >= 50; });
        }
        if (opts.requireUnique && cands.length !== 1) return;
        var s = elegirCandidato(b, cands);
        if (!s) return;
        pairar(b, s, cands.length > 1, !!opts.exact);
      });
    }

    pasar('mismo_dia', { exact: true });
    pasar('cerca', { exact: true });
    pasar('cerca', { requireConcepto: true });
    pasar('cerca', { requireUnique: true });
    pasar('cerca', {});

    return out;
  }

  var SUPABASE_PAGE = 1000;

  async function fetchAllCanal(table, orderCols) {
    var all = [];
    var offset = 0;
    var cols = (orderCols || []).slice();
    var hasId = cols.some(function (c) { return c.name === 'id'; });
    if (!hasId) cols.push({ name: 'id', asc: true });
    for (;;) {
      var q = client().from(table).select('*').eq('canal', state.canal);
      cols.forEach(function (col) {
        q = q.order(col.name, { ascending: col.asc !== false });
      });
      var res = await q.range(offset, offset + SUPABASE_PAGE - 1);
      if (res.error) throw res.error;
      var chunk = res.data || [];
      all = all.concat(chunk);
      if (chunk.length < SUPABASE_PAGE) break;
      offset += SUPABASE_PAGE;
    }
    return all;
  }

  function claveDedupTesoreria(m) {
    var monto = Number(m && m.monto);
    var montoKey = isFinite(monto) ? (Math.round(monto * 100) / 100).toFixed(2) : '';
    return [
      String((m && m.fecha) || '').slice(0, 10),
      montoKey,
      normTxt(m && m.descripcion),
      normTxt(m && m.categoria),
      normTxt(m && m.contraparte),
      normTxt(m && m.cuenta_contable)
    ].join('|');
  }

  function filtrarTesoreriaYaCargada(filas) {
    var bag = {};
    sistemaRows().forEach(function (m) {
      var k = claveDedupTesoreria(m);
      bag[k] = (bag[k] || 0) + 1;
    });
    var out = [];
    var nYa = 0;
    (filas || []).forEach(function (f) {
      var k = claveDedupTesoreria(f);
      if ((bag[k] || 0) > 0) {
        bag[k] -= 1;
        nYa += 1;
      } else {
        out.push(f);
      }
    });
    return { filas: out, nYa: nYa };
  }

  function filasTesoreriaListasParaGuardar(filas) {
    var conId = [];
    var sinId = [];
    (filas || []).forEach(function (f) {
      if (origenIdEsTesoreriaConId(f.origen_id)) conId.push(f);
      else sinId.push(f);
    });
    var filDup = filtrarTesoreriaYaCargada(sinId);
    return { filas: conId.concat(filDup.filas), nYa: filDup.nYa };
  }

  function gruposCanalTesoreria(filas, canalDefault) {
    var groups = {};
    var order = [];
    (filas || []).forEach(function (f) {
      var c = f.canal || canalDefault;
      if (!groups[c]) {
        groups[c] = [];
        order.push(c);
      }
      groups[c].push(f);
    });
    return { groups: groups, order: order };
  }

  function stemConceptoGalicia(m) {
    var t = (m && m.tipo) || '';
    if (!t && m && m.descripcion) t = String(m.descripcion).split(' · ')[0];
    return normTxt(t).replace(/\bcoelsa\b/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function claveDedupExtractoGalicia(m, laxo) {
    var monto = Number(m && m.monto);
    var montoKey = isFinite(monto) ? (Math.round(monto * 100) / 100).toFixed(2) : '';
    if (laxo) {
      return [
        String((m && m.fecha) || '').slice(0, 10),
        montoKey,
        stemConceptoGalicia(m)
      ].join('|');
    }
    return [
      String((m && m.fecha) || '').slice(0, 10),
      montoKey,
      normTxt(m && m.descripcion),
      String((m && m.id_movimiento_banco) || '').trim()
    ].join('|');
  }

  function filtrarExtractoGaliciaYaCargado(filas) {
    var laxo = (filas || []).some(function (f) { return !!(f && f.raw && f.raw.fuente === 'pdf'); });
    var bag = {};
    bancoRowsTodos().forEach(function (m) {
      var k = claveDedupExtractoGalicia(m, laxo);
      bag[k] = (bag[k] || 0) + 1;
    });
    var out = [];
    var nYa = 0;
    (filas || []).forEach(function (f) {
      var k = claveDedupExtractoGalicia(f, laxo);
      if ((bag[k] || 0) > 0) {
        bag[k] -= 1;
        nYa += 1;
      } else {
        out.push(f);
      }
    });
    return { filas: out, nYa: nYa };
  }

  function countOrigen(origen) {
    return (state.movimientos || []).filter(function (m) {
      return m.canal === state.canal && m.origen === origen;
    }).length;
  }

  async function cargarDatos() {
    state.movimientos = await fetchAllCanal('cb_movimiento', [
      { name: 'fecha', asc: true },
      { name: 'origen_id', asc: true }
    ]);
    state.matches = await fetchAllCanal('cb_match', [
      { name: 'created_at', asc: false }
    ]);
  }

  var CB_RPC_CHUNK = 250;

  async function guardarFilas(origen, filas) {
    var total = 0;
    for (var i = 0; i < filas.length; i += CB_RPC_CHUNK) {
      var parte = filas.slice(i, i + CB_RPC_CHUNK);
      var rpc = await client().rpc('cb_guardar_movimientos', {
        p_canal: state.canal,
        p_origen: origen,
        p_filas: parte
      });
      if (rpc.error) throw rpc.error;
      total += Number(rpc.data || parte.length);
    }
    return total;
  }

  async function adoptarIdTesoreria(canal, filas) {
    var parte = (filas || []).filter(function (f) { return origenIdEsTesoreriaConId(f.origen_id); });
    if (!parte.length) return 0;
    var total = 0;
    var i;
    for (i = 0; i < parte.length; i += CB_RPC_CHUNK) {
      var rpc = await client().rpc('cb_adoptar_id_tesoreria', {
        p_canal: canal,
        p_filas: parte.slice(i, i + CB_RPC_CHUNK)
      });
      if (rpc.error) throw rpc.error;
      total += Number(rpc.data || 0);
    }
    return total;
  }

  async function marcarTesoreriaAbiertaAusente(canal, filas) {
    var ids = (filas || []).map(function (f) { return f.origen_id; }).filter(origenIdEsTesoreriaConId);
    if (!ids.length) return 0;
    var rpc = await client().rpc('cb_marcar_tesoreria_abierta_ausente', {
      p_canal: canal,
      p_origen_ids: ids
    });
    if (rpc.error) throw rpc.error;
    return Number(rpc.data || 0);
  }

  async function retirarTesoreriaDuplicadaCierre(canal, filas) {
    var ids = (filas || []).map(function (f) { return f.origen_id; }).filter(origenIdEsTesoreriaConId);
    if (!ids.length) return 0;
    var total = 0;
    var i;
    for (i = 0; i < ids.length; i += CB_RPC_CHUNK) {
      var rpc = await client().rpc('cb_retirar_tesoreria_duplicada_por_cierre', {
        p_canal: canal,
        p_origen_ids: ids.slice(i, i + CB_RPC_CHUNK)
      });
      if (rpc.error) throw rpc.error;
      total += Number(rpc.data || 0);
    }
    return total;
  }

  async function regenerarSugerencias() {
    var locked = {};
    (state.matches || []).forEach(function (m) {
      if (!m || m.estado !== 'confirmado') return;
      idsMatchLado(m, 'banco').forEach(function (id) { locked[id] = true; });
      idsMatchLado(m, 'sistema').forEach(function (id) { locked[id] = true; });
    });
    var seenB = {};
    var seenS = {};
    var sugeridas = generarSugerencias(bancoRowsConciliables(), sistemaRows(), state.matches).filter(function (p) {
      if (!p || !p.banco_id || !p.sistema_id) return false;
      if (locked[p.banco_id] || locked[p.sistema_id]) return false;
      if (seenB[p.banco_id] || seenS[p.sistema_id]) return false;
      if (String(p.criterio || '').indexOf('lejana') >= 0) return false;
      seenB[p.banco_id] = true;
      seenS[p.sistema_id] = true;
      return true;
    });
    var rpc = await client().rpc('cb_reemplazar_sugerencias', {
      p_canal: state.canal,
      p_filas: sugeridas
    });
    if (rpc.error) throw rpc.error;
    return Number(rpc.data || 0);
  }

  function matchSugeridoEsAnulado(m) {
    if (!m || m.estado !== 'sugerido') return false;
    var an = mapaIdsMpAnulados();
    return idsMatchLado(m, 'banco').some(function (id) { return !!an[id]; });
  }

  function matchSugeridoFueraDeVentana(m) {
    if (!m || m.estado !== 'sugerido' || esMatchImpuestos(m)) return false;
    var bs = movsMatchLado(m, 'banco');
    var ss = movsMatchLado(m, 'sistema');
    if (!bs.length || !ss.length) return false;
    return Math.abs(daysBetween(bs[0].fecha, ss[0].fecha)) > MAX_DIAS_SUGERENCIA;
  }

  async function recargarTodo() {
    state.loading = true;
    renderShell();
    try {
      await cargarDatos();
      state.err = '';
      if (can(PERM_CARGAR) || can(PERM_CONFIRMAR)) {
        var haySugAnul = state.canal === CANAL_MP && (state.matches || []).some(matchSugeridoEsAnulado);
        var haySugLejos = (state.matches || []).some(matchSugeridoFueraDeVentana);
        if (haySugAnul || haySugLejos) {
          try {
            await regenerarSugerencias();
            await cargarDatos();
            state.err = '';
          } catch (e2) {
            state.err = 'No se pudieron recálcular las sugerencias: ' + errMsg(e2);
          }
        }
      }
    } catch (e) {
      state.err = 'No se pudo cargar Conciliación Bancaria: ' + errMsg(e);
    } finally {
      state.loading = false;
      renderShell();
    }
  }

  function leerExcelFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var wb = global.XLSX.read(ev.target.result, { type: 'array', cellDates: true });
          resolve(wb);
        } catch (e) { reject(e); }
      };
      reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function pedirArchivo(accept, onFile) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (f) onFile(f);
    });
    input.click();
  }

  async function onUpload(origen) {
    if (!can(PERM_CARGAR)) return;
    var acceptGal = '.xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var acceptXlsx = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    pedirArchivo(esCanalGalicia(state.canal) ? acceptGal : acceptXlsx, async function (file) {
      state.loading = true;
      state.err = '';
      state.msg = '';
      renderShell();
      try {
        var parsed;
        var canalAntes = state.canal;
        var origenPedido = origen;
        if (esArchivoPdf(file)) {
          parsed = await parseExtractoGaliciaPdfArchivo(file);
          origen = 'banco';
          state.canal = parsed.canal || CANAL_GAL;
        } else {
          if (!global.XLSX) throw new Error('No está disponible la librería Excel.');
          var wb = await leerExcelFile(file);
          var detArch = detectarArchivo(wb, file.name);
          var esCierreTes = false;
          var mapCierre = null;
          if (detArch.clase === 'sistema' && detArch.hoja) {
            mapCierre = filasHoja(wb, detArch.hoja).map;
            esCierreTes = esMapaTesoreriaCierre(mapCierre);
          }
          if (esCierreTes) {
            origen = 'sistema';
            if (!mapaTesoreriaTieneIdCierre(mapCierre)) {
              var errPref = errorPrefijoCierreCanal(file.name, canalAntes);
              if (errPref) {
                state.canal = canalAntes;
                throw new Error(errPref);
              }
              state.canal = canalAntes;
            }
          } else if (detArch.clase === 'banco' || detArch.clase === 'sistema') {
            origen = detArch.clase === 'banco' ? 'banco' : 'sistema';
            state.canal = detArch.canal;
          }
          if (origen === 'banco') {
            if (esCanalGalicia(state.canal)) parsed = parseExtractoGalicia(wb, file.name, detArch.hoja);
            else parsed = parseExtractoMp(wb, file.name, detArch.hoja);
          } else {
            parsed = parseTesoreriaMp(wb, file.name, detArch.hoja);
          }
        }
        if (parsed.error) {
          state.canal = canalAntes;
          throw new Error(parsed.error);
        }
        if (origen === 'sistema' && parsed.canalDetectado) {
          state.canal = parsed.canalDetectado;
        }
        await cargarDatos();
        var nLeidas = parsed.filas.length;
        var filasParaSaldo = origen === 'banco' ? parsed.filas.slice() : null;
        var nYaContenido = 0;
        if (origen === 'sistema') {
          var filDup = filasTesoreriaListasParaGuardar(parsed.filas);
          parsed.filas = filDup.filas;
          nYaContenido = filDup.nYa;
        } else if (origen === 'banco' && esCanalGalicia(state.canal)) {
          var filDupGal = filtrarExtractoGaliciaYaCargado(parsed.filas);
          parsed.filas = filDupGal.filas;
          nYaContenido = filDupGal.nYa;
        }
        var nAntes = countOrigen(origen);
        var nRetiradas = 0;
        var nBajas = 0;
        var nSug = 0;
        if (origen === 'sistema' && parsed.tieneIdCierre) {
          var agrup = gruposCanalTesoreria(parsed.filas, state.canal);
          var ci;
          for (ci = 0; ci < agrup.order.length; ci++) {
            var canalSave = agrup.order[ci];
            state.canal = canalSave;
            await cargarDatos();
            var parte = agrup.groups[canalSave];
            if (parte.length) {
              await adoptarIdTesoreria(canalSave, parte);
              await guardarFilas(origen, parte);
              nRetiradas += await retirarTesoreriaDuplicadaCierre(canalSave, parte);
              if (!parsed.formatoCierre) {
                nBajas += await marcarTesoreriaAbiertaAusente(canalSave, parte);
              }
            }
            await cargarDatos();
            if (bancoRowsConciliables().length && sistemaRows().length) nSug += await regenerarSugerencias();
          }
          if (agrup.order.indexOf(canalAntes) >= 0) state.canal = canalAntes;
          else if (agrup.order.length) state.canal = agrup.order[0];
        } else {
          if (parsed.filas.length) await guardarFilas(origen, parsed.filas);
          await cargarDatos();
          if (bancoRowsConciliables().length && sistemaRows().length) nSug = await regenerarSugerencias();
        }
        await cargarDatos();
        var nDespues = countOrigen(origen);
        var nNuevos = Math.max(0, nDespues - nAntes);
        var nYa = Math.max(0, nLeidas - nNuevos);
        var extraCanal = state.canal !== canalAntes
          ? ' Lo dejé en la solapa ' + labelCanalNombre(state.canal) + '.'
          : '';
        var extraOrigen = origen !== origenPedido
          ? (origen === 'sistema' ? ' Detecté tesorería del sistema.' : ' Detecté extracto del banco.')
          : '';
        var extraDup;
        if (parsed.tieneIdCierre) {
          extraDup = parsed.formatoCierre
            ? ' Cierre de caja con Id único: alta o actualización sin duplicar.'
            : ' Tesorería con Id único: alta o actualización si cambió algún dato.';
          if (parsed.formatoCierre) extraDup += ' No hace falta el prefijo MP_/Galicia_ si la columna Caja indica el medio.';
          if (nRetiradas) extraDup += ' Se retiraron ' + nRetiradas + ' tesorerías viejas del mismo movimiento (sin Id).';
          if (nBajas) extraDup += ' ' + nBajas + ' de tesorería abierta no vinieron en el archivo: están en A eliminar.';
        } else {
          extraDup = nNuevos
            ? (nYa ? ' ' + nNuevos + ' nuevas; ' + nYa + ' ya estaban (no se duplican).' : ' ' + nNuevos + ' nuevas.')
            : ' Ninguna nueva: las ' + nLeidas + ' ya estaban (no se duplican).';
          extraDup += ' No se borró ningún movimiento anterior.';
        }
        if (nYaContenido && origen === 'sistema' && !parsed.tieneIdCierre) {
          extraDup += ' ' + nYaContenido + ' coincidían con tesorería ya cargada (misma fecha, monto, descripción, categoría y cliente).';
        } else if (nYaContenido && origen === 'banco') {
          extraDup += ' ' + nYaContenido + ' coincidían con extracto Galicia ya cargado (misma fecha, importe y concepto; el saldo del banco cambia entre archivos).';
        }
        if (parsed.formatoCierre && !parsed.tieneIdCierre) {
          extraDup = ' Cierre de caja (caja ya cerrada).' + extraDup;
        }
        if (parsed.omitidasApertura) {
          extraDup += ' Se omitieron ' + parsed.omitidasApertura + ' Apertura de Caja (no se cargan).';
        }
        if (parsed.omitidasCaja) {
          extraDup += ' Se omitieron ' + parsed.omitidasCaja + ' filas de cajas que no son Mercado Pago ni Galicia (ARS/USD).';
        }
        if (parsed.omitidasSinId) {
          extraDup += ' Se omitieron ' + parsed.omitidasSinId + ' filas sin Id.';
        }
        var extraSug = nSug ? ' Sugerencias: ' + nSug + '.' : '';
        if (origen === 'banco' && esCanalGalUsd(state.canal) && window.FornitaliaSaldosExtractos) {
          try {
            if (parsed.fuentePdf && parsed.pdfText &&
                typeof window.FornitaliaSaldosExtractos.guardarCorteDesdePdfGalicia === 'function') {
              await window.FornitaliaSaldosExtractos.guardarCorteDesdePdfGalicia(parsed.pdfText, file.name);
            } else if (filasParaSaldo && typeof window.FornitaliaSaldosExtractos.guardarCorteGaliciaUsd === 'function') {
              await window.FornitaliaSaldosExtractos.guardarCorteGaliciaUsd(filasParaSaldo, file.name);
            }
          } catch (eSaldo) {
            extraSug += ' El extracto se cargó, pero no pude pesificar el saldo en Saldos extractos: ' + errMsg(eSaldo);
          }
        }
        if (origen === 'banco' && esCanalGalicia(state.canal)) {
          state.msg = (parsed.fuentePdf ? 'Extracto ' + labelCanalNombre(state.canal) + ' (PDF): ' : 'Extracto ' + labelCanalNombre(state.canal) + ': ') + nLeidas + ' filas leídas (fecha + débito/crédito + descripción; no se duplica vs Excel ni vs otro PDF si coinciden fecha, importe y concepto).' + extraDup + extraOrigen + extraCanal + extraSug;
        } else if (origen === 'banco') {
          state.msg = 'Extracto Mercado Pago: ' + nLeidas + ' filas leídas (Número de Movimiento).' + extraDup + extraOrigen + extraCanal + extraSug;
        } else if (parsed.tieneIdCierre && parsed.formatoCierre) {
          state.msg = 'Tesorería cierre de caja: ' + nLeidas + ' filas leídas (Id único).' + extraDup + extraOrigen + extraCanal + extraSug;
        } else if (parsed.tieneIdCierre) {
          state.msg = 'Tesorería ' + labelCanalNombre(state.canal) + ': ' +
            nLeidas + ' filas leídas (Id único).' + extraDup + extraOrigen + extraCanal + extraSug;
        } else if (esCanalGalicia(state.canal)) {
          state.msg = 'Tesorería ' + labelCanalNombre(state.canal) + ': ' + nLeidas + ' filas leídas.' + extraDup + extraOrigen + extraCanal + extraSug;
        } else {
          state.msg = 'Tesorería Mercado Pago: ' + nLeidas + ' filas leídas.' + extraDup + extraOrigen + extraCanal + extraSug;
        }
        if (nBajas) state.lista = 'bajas';
      } catch (e) {
        state.err = errMsg(e);
      } finally {
        state.loading = false;
        renderShell();
      }
    });
  }

  async function onRecalc() {
    if (!can(PERM_CARGAR) && !can(PERM_CONFIRMAR)) return;
    state.loading = true;
    renderShell();
    try {
      await cargarDatos();
      var n = await regenerarSugerencias();
      await cargarDatos();
      state.err = '';
      state.msg = 'Sugerencias recalculadas: ' + n + ' pareja(s).';
    } catch (e) {
      state.err = errMsg(e);
    } finally {
      state.loading = false;
      renderShell();
    }
  }

  async function setEstado(id, estado) {
    if (!can(PERM_CONFIRMAR)) return;
    if (estado === 'sugerido') {
      var matchUndo = null;
      (state.matches || []).forEach(function (x) { if (x.id === id) matchUndo = x; });
      if (esMatchImpuestos(matchUndo)) {
        if (!confirm('¿Deshacer esta conciliación de Impuestos?\n\nEl tesorería vuelve a Solo sistema y las percepciones quedan no conciliadas.')) return;
      } else if (!confirm('¿Deshacer esta conciliación confirmada? La pareja vuelve a Sugeridos.')) return;
    }
    try {
      var rpc = await client().rpc('cb_set_match_estado', { p_match_id: id, p_estado: estado });
      if (rpc.error) throw rpc.error;
      cerrarModal();
      if (estado === 'sugerido') {
        var eraImp = false;
        (state.matches || []).forEach(function (x) { if (x.id === id && esMatchImpuestos(x)) eraImp = true; });
        if (eraImp) {
          state.msg = 'Conciliación de Impuestos deshecha. El tesorería volvió a Solo sistema.';
          state.lista = 'sistema';
        } else {
          state.msg = 'Conciliación deshecha: la pareja volvió a Sugeridos.';
          state.lista = 'sugeridos';
        }
      }
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function confirmarSugeridosVisibles(rows) {
    if (!can(PERM_CONFIRMAR)) return;
    var list = rows || filasVisiblesMatch('sugerido');
    if (!list.length) return;
    try {
      var ids = list.map(function (m) { return m.id; }).filter(Boolean);
      var rpc = await client().rpc('cb_confirmar_sugeridos', { p_canal: state.canal, p_ids: ids });
      if (rpc.error) throw rpc.error;
      var n = Number(rpc.data || 0);
      state.msg = n
        ? ('Se confirmaron ' + n + ' sugerencia' + (n === 1 ? '' : 's') + '.')
        : 'No había sugerencias para confirmar.';
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function borrarMovimientoSistema(id) {
    if (!can(PERM_CARGAR)) return;
    var m = findMov(id);
    if (!m || m.origen !== 'sistema') return;
    var det = (formatFecha(m.fecha) + ' · ' + formatMonto(m.monto) + ' · ' + (m.descripcion || m.tipo || '')).trim();
    if (!confirm('¿Eliminar este movimiento de tesorería?\n\n' + det + '\n\nNo se puede deshacer. Si lo necesitás, volvé a cargar el Excel.')) return;
    try {
      var rpc = await client().rpc('cb_borrar_movimiento_sistema', { p_id: id });
      if (rpc.error) throw rpc.error;
      state.msg = 'Movimiento de tesorería eliminado.';
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function borrarMovimientoBancoGalicia(id) {
    if (!can(PERM_CARGAR)) return;
    var m = findMov(id);
    if (!m || m.origen !== 'banco' || !esCanalGalicia(m.canal)) return;
    var det = (formatFecha(m.fecha) + ' · ' + formatMonto(m.monto) + ' · ' + (m.descripcion || m.tipo || '')).trim();
    if (!confirm('¿Eliminar este movimiento del extracto Galicia?\n\n' + det + '\n\nNo se puede deshacer. Si lo necesitás, volvé a cargar el Excel o el PDF del banco.')) return;
    try {
      var rpc = await client().rpc('cb_borrar_movimiento_banco_galicia', { p_id: id });
      if (rpc.error) throw rpc.error;
      state.msg = 'Movimiento del extracto Galicia eliminado.';
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  function abrirExcluirConciliacion(id) {
    if (!can(PERM_CONFIRMAR)) return;
    var m = findMov(id);
    if (!m || m.origen !== 'banco' || m.canal !== CANAL_MP) return;
    if (esNoRequiereConciliacion(m)) return;
    state.excluirId = id;
    state.excluirJustif = '';
    var det = formatFecha(m.fecha) + ' · ' + formatMonto(m.monto) + ' · ' + (m.tipo || m.descripcion || '—');
    var body =
      FornitaliaHelp.row('tpl-cb-noreq-modal', 'Ayuda: No requiere conciliación',
        '<p>El movimiento sigue en el extracto de Mercado Pago; no se borra. Deja de entrar a Sugeridos, Conciliación manual y Solo banco. Queda en la solapa <strong>No requiere</strong> con esta justificación.</p>') +
      '<p><strong>' + esc(det) + '</strong></p>' +
      '<p class="cb-field-hint">' + esc(m.descripcion || '') + (m.id_movimiento_banco ? ' · N° ' + esc(m.id_movimiento_banco) : '') + '</p>' +
      '<label class="cb-just-label" for="cb-excluir-just">Justificación</label>' +
      '<textarea id="cb-excluir-just" class="cb-just-area" maxlength="800" placeholder="Ej.: comisión de Mercado Pago; movimiento interno que no está en tesorería."></textarea>';
    var footer = '<button type="button" class="cb-btn cb-btn-ok" data-cb="no-req-ok"><span class="btn-icon">' + ICO.check + '</span>Marcar no requiere conciliación</button>';
    abrirModal('No requiere conciliación', body, footer);
    var ju = state.modal && state.modal.querySelector('#cb-excluir-just');
    if (ju) {
      ju.addEventListener('input', function () { state.excluirJustif = ju.value; });
      try { ju.focus(); } catch (e2) { /* ignore */ }
    }
  }

  async function confirmarExcluirConciliacion() {
    if (!can(PERM_CONFIRMAR)) return;
    var ju = state.modal && state.modal.querySelector('#cb-excluir-just');
    var just = (ju ? ju.value : state.excluirJustif || '').trim();
    if (just.length < 8) {
      alert('Escribí una justificación de al menos 8 caracteres. Queda registrada con el movimiento.');
      return;
    }
    try {
      var rpc = await client().rpc('cb_marcar_no_requiere_conciliacion', {
        p_id: state.excluirId,
        p_justificacion: just
      });
      if (rpc.error) throw rpc.error;
      cerrarModal();
      state.lista = 'norequiere';
      state.msg = 'Marcado como No requiere conciliación. Sigue en el extracto; no se eliminó.';
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function deshacerExcluirConciliacion(id) {
    if (!can(PERM_CONFIRMAR)) return;
    var m = findMov(id);
    if (!m || !esNoRequiereConciliacion(m)) return;
    if (!confirm('¿Volver a conciliar este movimiento?\n\n' + formatFecha(m.fecha) + ' · ' + formatMonto(m.monto) + '\n\nVuelve a Solo banco y puede entrar a sugerencias.')) return;
    try {
      var rpc = await client().rpc('cb_deshacer_no_requiere_conciliacion', { p_id: id });
      if (rpc.error) throw rpc.error;
      state.lista = 'banco';
      state.msg = 'Ya no está marcado. Volvió a Solo banco.';
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  function textoBajaTesoreria(m) {
    return 'Id: ' + idTesoreriaVisible(m) +
      '\nFecha: ' + formatFecha(m.fecha) +
      '\nImporte: ' + formatMonto(m.monto) +
      '\nCategoría: ' + (valorCatCta(m.categoria) || '—') +
      '\nCuenta contable: ' + (valorCatCta(m.cuenta_contable) || '—') +
      '\nDescripción: ' + (m.descripcion || m.tipo || '—');
  }

  function matchActivoDe(movId) {
    var found = null;
    (state.matches || []).forEach(function (m) {
      if ((m.estado === 'sugerido' || m.estado === 'confirmado') &&
          (idsMatchLado(m, 'banco').indexOf(movId) >= 0 || idsMatchLado(m, 'sistema').indexOf(movId) >= 0)) {
        found = m;
      }
    });
    return found;
  }

  async function confirmarBajaTesoreria(id) {
    if (!can(PERM_CARGAR)) return;
    var m = findMov(id);
    if (!m || !esPendienteBaja(m)) return;
    var extra = matchActivoDe(id) ? '\n\nEstá conciliado: se elimina también la pareja.' : '';
    if (!confirm('¿Eliminar definitivamente este movimiento de tesorería?\n\n' + textoBajaTesoreria(m) + extra + '\n\nNo se puede deshacer.')) return;
    try {
      var rpc = await client().rpc('cb_confirmar_baja_tesoreria', { p_id: id });
      if (rpc.error) throw rpc.error;
      state.msg = 'Tesorería eliminada (Id ' + idTesoreriaVisible(m) + ').';
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function confirmarBajasTesoreriaVisibles() {
    if (!can(PERM_CARGAR)) return;
    var list = filasVisiblesBaja();
    if (!list.length) return;
    if (!confirm('¿Eliminar definitivamente los ' + list.length + ' movimientos visibles en A eliminar?\n\nTambién se borran las conciliaciones asociadas. No se puede deshacer.')) return;
    try {
      var i;
      for (i = 0; i < list.length; i++) {
        var rpc = await client().rpc('cb_confirmar_baja_tesoreria', { p_id: list[i].id });
        if (rpc.error) throw rpc.error;
      }
      state.msg = 'Se eliminaron ' + list.length + ' movimientos de tesorería abierta.';
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
      await recargarTodo();
    }
  }

  function mesYYYYMM(ymd) {
    var s = String(ymd || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(s) ? s : '';
  }

  function formatMesLabel(ym) {
    var p = String(ym || '').split('-');
    if (p.length < 2) return String(ym || '');
    return p[1] + '/' + p[0];
  }

  function sortTxtEs(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base' });
  }

  function opcionesMesExtracto() {
    var set = {};
    bancoRows().forEach(function (m) {
      var ym = mesYYYYMM(m.fecha);
      if (ym) set[ym] = true;
    });
    return Object.keys(set).sort().reverse();
  }

  function opcionesMesSistema() {
    var set = {};
    sistemaRowsTodos().forEach(function (m) {
      var ym = mesYYYYMM(m.fecha);
      if (ym) set[ym] = true;
    });
    return Object.keys(set).sort().reverse();
  }

  function opcionesCategoria(filtro) {
    var f = filtro || {};
    var set = {};
    sistemaRowsTodos().forEach(function (m) {
      if (f.mesSistema && mesYYYYMM(m.fecha) !== f.mesSistema) return;
      var v = valorCatCta(m.categoria);
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(sortTxtEs);
  }

  function opcionesCuenta(filtro) {
    var f = filtro || {};
    var set = {};
    sistemaRowsTodos().forEach(function (m) {
      if (f.mesSistema && mesYYYYMM(m.fecha) !== f.mesSistema) return;
      if (f.categoria && valorCatCta(m.categoria) !== f.categoria) return;
      var v = valorCatCta(m.cuenta_contable);
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(sortTxtEs);
  }

  function syncCamposFiltro(src) {
    if (!src) return;
    var mesesExt = opcionesMesExtracto();
    if (src.mesExtracto && mesesExt.indexOf(src.mesExtracto) < 0) src.mesExtracto = '';
    var mesesSis = opcionesMesSistema();
    if (src.mesSistema && mesesSis.indexOf(src.mesSistema) < 0) src.mesSistema = '';
    var cats = opcionesCategoria({ mesSistema: src.mesSistema || '' });
    if (src.categoria && cats.indexOf(src.categoria) < 0) src.categoria = '';
    var ctas = opcionesCuenta({ mesSistema: src.mesSistema || '', categoria: src.categoria || '' });
    if (src.cuenta && ctas.indexOf(src.cuenta) < 0) src.cuenta = '';
  }

  function syncFiltrosConOpciones() {
    syncCamposFiltro(state);
    syncCamposFiltro(state.manual);
    if (state.filtrosDraft) syncCamposFiltro(state.filtrosDraft);
  }

  function contarFiltrosEstructurales(src) {
    var s = src || {};
    var n = 0;
    if (s.mesExtracto) n++;
    if (s.mesSistema) n++;
    if (s.categoria) n++;
    if (s.cuenta) n++;
    return n;
  }

  function hayFiltrosEstructuralesActivos() {
    return contarFiltrosEstructurales(state) > 0;
  }

  function hayFiltrosActivos() {
    return hayFiltrosEstructuralesActivos() || !!(state.q || '').trim();
  }

  function pasaFiltroMesValor(fecha, ym) {
    if (!ym) return true;
    return mesYYYYMM(fecha) === ym;
  }

  function pasaFiltroCategoriaValor(m, cat) {
    if (!cat) return true;
    return valorCatCta(m && m.categoria) === cat;
  }

  function pasaFiltroCuentaValor(m, cta) {
    if (!cta) return true;
    return valorCatCta(m && m.cuenta_contable) === cta;
  }

  function pasaFiltrosMatch(match) {
    var bs = movsMatchLado(match, 'banco');
    var ss = movsMatchLado(match, 'sistema');
    var blob = bs.concat(ss).map(blobMov).join(' ') + ' ' + criterioLabel(match.criterio) + ' ' + (match.justificacion || '');
    if (!pasaFiltro(blob)) return false;
    if (esMatchImpuestos(match)) {
      if (state.mesSistema && !ss.some(function (s) { return pasaFiltroMesValor(s && s.fecha, state.mesSistema); })) return false;
      if (state.categoria && !ss.some(function (s) { return pasaFiltroCategoriaValor(s, state.categoria); })) return false;
      if (state.cuenta && !ss.some(function (s) { return pasaFiltroCuentaValor(s, state.cuenta); })) return false;
      return true;
    }
    if (state.mesExtracto && !bs.some(function (b) { return pasaFiltroMesValor(b && b.fecha, state.mesExtracto); })) return false;
    if (ss.length) {
      if (state.mesSistema && !ss.some(function (s) { return pasaFiltroMesValor(s && s.fecha, state.mesSistema); })) return false;
      if (state.categoria && !ss.some(function (s) { return pasaFiltroCategoriaValor(s, state.categoria); })) return false;
      if (state.cuenta && !ss.some(function (s) { return pasaFiltroCuentaValor(s, state.cuenta); })) return false;
    } else if (state.categoria || state.cuenta) {
      return false;
    }
    return true;
  }

  function pasaFiltrosMov(m, origen) {
    if (!pasaFiltro(blobMov(m))) return false;
    if (origen === 'banco') {
      return pasaFiltroMesValor(m && m.fecha, state.mesExtracto);
    }
    return pasaFiltroMesValor(m && m.fecha, state.mesSistema) &&
      pasaFiltroCategoriaValor(m, state.categoria) &&
      pasaFiltroCuentaValor(m, state.cuenta);
  }

  function pasaFiltrosParAnulado(p) {
    if (!p || !p.a || !p.b) return false;
    var blob = blobMov(p.a) + ' ' + blobMov(p.b) + ' ' + (p.opRel || '');
    if (!pasaFiltro(blob)) return false;
    if (state.mesExtracto && !pasaFiltroMesValor(p.a.fecha, state.mesExtracto) && !pasaFiltroMesValor(p.b.fecha, state.mesExtracto)) return false;
    if (state.mesSistema || state.categoria || state.cuenta) return false;
    return true;
  }

  function pasaFiltrosNoRequiere(m) {
    if (!m) return false;
    var blob = blobMov(m) + ' ' + (m.no_requiere_justificacion || '') + ' no requiere conciliacion';
    if (!pasaFiltro(blob)) return false;
    if (state.mesExtracto && !pasaFiltroMesValor(m.fecha, state.mesExtracto)) return false;
    if (state.mesSistema || state.categoria || state.cuenta) return false;
    return true;
  }

  function kpis() {
    var b = bancoRows().filter(function (x) { return pasaFiltrosMov(x, 'banco'); });
    var s = sistemaRows().filter(function (x) { return pasaFiltrosMov(x, 'sistema'); });
    var sugList = [];
    var confList = [];
    var usedB = {};
    var usedS = {};
    (state.matches || []).forEach(function (m) {
      if (matchSugeridoEsAnulado(m) || matchConTesoreriaPendienteBaja(m)) return;
      if (m.estado === 'sugerido' || m.estado === 'confirmado') {
        idsMatchLado(m, 'banco').forEach(function (id) { usedB[id] = true; });
        idsMatchLado(m, 'sistema').forEach(function (id) { usedS[id] = true; });
      }
      if (!pasaFiltrosMatch(m)) return;
      if (m.estado === 'sugerido') sugList.push(m);
      if (m.estado === 'confirmado') confList.push(m);
    });
    var soloB = b.filter(function (x) { return !usedB[x.id] && !esNoRequiereConciliacion(x); });
    var soloS = s.filter(function (x) { return !usedS[x.id]; });
    var anulados = [];
    if (state.canal === CANAL_MP) {
      paresMpAutoanulados(bancoRowsTodos()).forEach(function (p) {
        if (pasaFiltrosParAnulado(p)) anulados.push(p);
      });
    }
    var norequiere = [];
    if (state.canal === CANAL_MP) {
      bancoRowsNoRequiere().forEach(function (m) {
        if (pasaFiltrosNoRequiere(m)) norequiere.push(m);
      });
    }
    var bajas = sistemaRowsBaja().filter(function (x) { return pasaFiltrosMov(x, 'sistema'); });
    return {
      banco: b.length,
      sistema: s.length,
      sugeridos: sugList.length,
      confirmados: confList.length,
      soloB: soloB.length,
      soloS: soloS.length,
      anulados: anulados.length,
      norequiere: norequiere.length,
      bajas: bajas.length,
      sumBanco: sumaOCero(b),
      sumSistema: sumaOCero(s),
      sumSug: sumaMontosMatch(sugList),
      sumConf: sumaMontosMatch(confList),
      sumSoloB: sumaOCero(soloB),
      sumSoloS: sumaOCero(soloS),
      sumAnul: sumaMontosParesAnulados(anulados),
      sumNorequiere: sumaOCero(norequiere),
      sumBajas: sumaOCero(bajas)
    };
  }

  function idsUsadosActivos() {
    var usedB = {};
    var usedS = {};
    (state.matches || []).forEach(function (m) {
      if (matchSugeridoEsAnulado(m) || matchConTesoreriaPendienteBaja(m)) return;
      if (m.estado === 'sugerido' || m.estado === 'confirmado') {
        idsMatchLado(m, 'banco').forEach(function (id) { usedB[id] = true; });
        idsMatchLado(m, 'sistema').forEach(function (id) { usedS[id] = true; });
      }
    });
    return { usedB: usedB, usedS: usedS };
  }

  function idsConfirmados() {
    var usedB = {};
    var usedS = {};
    (state.matches || []).forEach(function (m) {
      if (m.estado !== 'confirmado' || matchConTesoreriaPendienteBaja(m)) return;
      idsMatchLado(m, 'banco').forEach(function (id) { usedB[id] = true; });
      idsMatchLado(m, 'sistema').forEach(function (id) { usedS[id] = true; });
    });
    return { usedB: usedB, usedS: usedS };
  }

  function esMatchManual(m) {
    return !!(m && (m.origen_match === 'manual' || m.criterio === 'manual'));
  }

  function idsMatchLado(m, origen) {
    if (!m) return [];
    var arr = origen === 'banco' ? m.banco_ids : m.sistema_ids;
    var primary = origen === 'banco' ? m.banco_id : m.sistema_id;
    var out = [];
    function push(id) {
      if (id && out.indexOf(id) < 0) out.push(id);
    }
    push(primary);
    if (Array.isArray(arr)) arr.forEach(push);
    return out;
  }

  function movsMatchLado(m, origen) {
    return idsMatchLado(m, origen).map(findMov).filter(Boolean);
  }

  function idsSelManual(origen) {
    var arr = origen === 'banco' ? (state.manual && state.manual.bancoIds) : (state.manual && state.manual.sistemaIds);
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function sumaMontos(movs) {
    var t = 0;
    var ok = false;
    (movs || []).forEach(function (x) {
      var n = Number(x && x.monto);
      if (isFinite(n)) {
        t += n;
        ok = true;
      }
    });
    return ok ? Math.round(t * 100) / 100 : null;
  }

  function sumaOCero(movs) {
    var s = sumaMontos(movs);
    return s == null ? 0 : s;
  }

  function montoVisibleMatch(m) {
    if (esMatchImpuestos(m)) return montoPercibidoImpuestos(m);
    return sumaMontos(movsMatchLado(m, 'banco'));
  }

  function sumaMontosMatch(matches) {
    var t = 0;
    var ok = false;
    (matches || []).forEach(function (m) {
      var n = montoVisibleMatch(m);
      if (n == null || !isFinite(n)) return;
      t += n;
      ok = true;
    });
    return ok ? Math.round(t * 100) / 100 : 0;
  }

  function sumaMontosParesAnulados(pares) {
    var t = 0;
    var ok = false;
    (pares || []).forEach(function (p) {
      var a = Number(p && p.a && p.a.monto);
      var b = Number(p && p.b && p.b.monto);
      if (isFinite(a)) { t += a; ok = true; }
      if (isFinite(b)) { t += b; ok = true; }
    });
    return ok ? Math.round(t * 100) / 100 : 0;
  }

  function sumaMontosSigno(movs, positivos) {
    var t = 0;
    var ok = false;
    (movs || []).forEach(function (x) {
      var n = Number(x && x.monto);
      if (!isFinite(n)) return;
      if (positivos ? n > 0 : n < 0) {
        t += n;
        ok = true;
      }
    });
    return ok ? Math.round(t * 100) / 100 : null;
  }

  function montoAbsGrupo(movs) {
    var t = 0;
    (movs || []).forEach(function (x) {
      var n = Number(x && x.monto);
      if (isFinite(n)) t += Math.abs(n);
    });
    return Math.round(t * 100) / 200;
  }

  function fechaGrupo(movs) {
    var best = '';
    (movs || []).forEach(function (x) {
      var f = x && x.fecha;
      if (f && (!best || String(f) < String(best))) best = f;
    });
    return best;
  }

  function labelGrupo(movs, esBanco) {
    if (!movs || !movs.length) return '—';
    var first = esBanco
      ? (movs[0].tipo || movs[0].descripcion || '—')
      : (movs[0].descripcion || movs[0].tipo || '—');
    if (movs.length === 1) return first;
    return first + ' +' + (movs.length - 1);
  }

  function valorCatCta(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s || s === '-' || s === '—') return '';
    return s;
  }

  function celdaCatCta(v) {
    return esc(valorCatCta(v) || '—');
  }

  function valoresCampo(movs, campo) {
    var vals = [];
    (movs || []).forEach(function (x) {
      var raw = x && x[campo];
      var v = (campo === 'categoria' || campo === 'cuenta_contable') ? valorCatCta(raw) : String(raw || '').trim();
      if (v && vals.indexOf(v) < 0) vals.push(v);
    });
    return vals;
  }

  function labelCampoGrupo(movs, campo) {
    var vals = valoresCampo(movs, campo);
    if (!vals.length) return '—';
    if (vals.length === 1) return vals[0];
    return vals[0] + ' +' + (vals.length - 1);
  }

  function textoCampoGrupo(movs, campo) {
    return valoresCampo(movs, campo).join(' | ');
  }

  function textoGrupo(movs, esBanco) {
    return (movs || []).map(function (x) {
      return esBanco ? (x.tipo || x.descripcion || '') : (x.descripcion || x.tipo || '');
    }).filter(Boolean).join(' | ');
  }

  function idsOrigenGrupo(movs) {
    return (movs || []).map(function (x) {
      return x.id_movimiento_banco || x.origen_id || '';
    }).filter(Boolean).join(' | ');
  }

  function esGrupoMatch(m) {
    return idsMatchLado(m, 'banco').length > 1 || idsMatchLado(m, 'sistema').length > 1;
  }

  function esMatchSoloExtracto(m) {
    return idsMatchLado(m, 'banco').length >= 2 && idsMatchLado(m, 'sistema').length === 0;
  }

  function esMatchImpuestos(m) {
    return !!(m && m.criterio === 'impuestos');
  }

  function montoPercibidoImpuestos(m) {
    var ss = movsMatchLado(m, 'sistema');
    var tes = sumaMontos(ss);
    var d = m && m.diferencia != null && m.diferencia !== '' ? Number(m.diferencia) : 0;
    if (tes == null) return null;
    if (!isFinite(d)) d = 0;
    return Math.round((Math.abs(tes) + d) * 100) / 100;
  }

  function diffMatch(m, b, s) {
    if (m && m.diferencia != null && m.diferencia !== '') {
      var d = Number(m.diferencia);
      if (isFinite(d)) return Math.round(d * 100) / 100;
    }
    if (m) {
      var sb = sumaMontos(movsMatchLado(m, 'banco'));
      var ss = sumaMontos(movsMatchLado(m, 'sistema'));
      if (ss == null && idsMatchLado(m, 'sistema').length === 0) ss = 0;
      if (sb != null && ss != null) return Math.round((sb - ss) * 100) / 100;
    }
    var nb = Number(b && b.monto);
    var ns = Number(s && s.monto);
    if (!isFinite(nb) || !isFinite(ns)) return null;
    return Math.round((nb - ns) * 100) / 100;
  }

  function hayFiltrosManualEstructuralesActivos() {
    return contarFiltrosEstructurales(state.manual) > 0;
  }

  function hayFiltrosManualActivos() {
    var m = state.manual || {};
    return hayFiltrosManualEstructuralesActivos() || !!(m.qBanco || '').trim() || !!(m.qSistema || '').trim();
  }

  function movLibreManual(origen) {
    var ids = idsConfirmados();
    var used = origen === 'banco' ? ids.usedB : ids.usedS;
    var q = origen === 'banco' ? (state.manual.qBanco || '') : (state.manual.qSistema || '');
    q = q.trim().toLowerCase();
    var mesExtracto = state.manual.mesExtracto || '';
    var mesSistema = state.manual.mesSistema || '';
    var categoria = state.manual.categoria || '';
    var cuenta = state.manual.cuenta || '';
    var sels = idsSelManual(origen);
    return (origen === 'banco' ? bancoRowsConciliables() : sistemaRows()).filter(function (m) {
      if (used[m.id]) return false;
      if (esApertura(m)) return false;
      if (sels.indexOf(m.id) >= 0) return true;
      if (origen === 'banco') {
        if (mesExtracto && mesYYYYMM(m.fecha) !== mesExtracto) return false;
      } else {
        if (mesSistema && mesYYYYMM(m.fecha) !== mesSistema) return false;
        if (categoria && valorCatCta(m.categoria) !== categoria) return false;
        if (cuenta && valorCatCta(m.cuenta_contable) !== cuenta) return false;
      }
      if (!q) return true;
      return blobMov(m).toLowerCase().indexOf(q) >= 0;
    });
  }

  function matchSugeridoDe(movId) {
    var found = null;
    (state.matches || []).forEach(function (m) {
      if (m.estado === 'sugerido' && (idsMatchLado(m, 'banco').indexOf(movId) >= 0 || idsMatchLado(m, 'sistema').indexOf(movId) >= 0)) found = m;
    });
    return found;
  }

  function pasaFiltro(texto) {
    var q = (state.q || '').trim().toLowerCase();
    if (!q) return true;
    return String(texto || '').toLowerCase().indexOf(q) >= 0;
  }

  function htmlMonto(n) {
    if (n == null || n === '') return '<span class="cb-col-monto">—</span>';
    var v = Number(n);
    var cls = v > 0 ? 'cb-monto-pos' : (v < 0 ? 'cb-monto-neg' : '');
    return '<span class="cb-col-monto ' + cls + '">' + esc(formatMonto(n)) + '</span>';
  }

  function htmlKpiMonto(n) {
    var v = n == null || n === '' ? 0 : Number(n);
    if (!isFinite(v)) v = 0;
    var cls = v > 0 ? 'cb-monto-pos' : (v < 0 ? 'cb-monto-neg' : '');
    return '<p class="val-monto ' + cls + '" title="' + esc(formatMonto(v)) + '">' + esc(formatMonto(v)) + '</p>';
  }

  function htmlResumenCard(lab, n, sum, extraCls, dataLista, title) {
    var attrs = '';
    if (dataLista) attrs += ' data-cb="lista" data-lista="' + esc(dataLista) + '" role="button" tabindex="0"';
    if (title) attrs += ' title="' + esc(title) + '"';
    return '<div class="cb-resumen-card' + (extraCls ? ' ' + extraCls : '') + '"' + attrs + '>' +
      '<p class="lab">' + esc(lab) + '</p>' +
      '<p class="val">' + n + '</p>' +
      htmlKpiMonto(sum) +
    '</div>';
  }

  function htmlMontoSoloExtracto(movs) {
    var cred = sumaMontosSigno(movs, true);
    var deb = sumaMontosSigno(movs, false);
    var parts = [];
    if (cred != null) parts.push(htmlMonto(cred));
    if (deb != null) parts.push(htmlMonto(deb));
    if (!parts.length) return '—';
    return '<span class="cb-monto-par">' + parts.join('<span class="cb-monto-sep"> / </span>') + '</span>';
  }

  function btnIcon(action, id, title, svg, extraCls) {
    return '<button type="button" class="cb-btn cb-btn-ghost cb-btn-icon-only ' + (extraCls || '') + '" data-cb="' + esc(action) + '" data-id="' + esc(id) + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"><span class="btn-icon">' + svg + '</span></button>';
  }

  function criterioLabel(c) {
    var map = {
      monto_y_fecha: 'Mismo monto y fecha',
      monto_y_fecha_exacto: 'Mismo monto y fecha (exacto)',
      monto_y_fecha_concepto: 'Mismo monto, fecha y concepto',
      monto_y_fecha_concepto_exacto: 'Mismo monto, fecha y concepto (exacto)',
      monto_unico: 'Monto único (fecha distinta)',
      monto_fecha_cercana: 'Mismo monto, fecha cercana',
      monto_fecha_cercana_ambiguo: 'Mismo monto, fecha cercana (hay otros iguales)',
      monto_fecha_cercana_concepto: 'Mismo importe, fecha cercana y concepto',
      monto_fecha_lejana: 'Mismo importe, fecha lejana',
      monto_fecha_lejana_ambiguo: 'Mismo importe, fecha lejana (hay otros iguales)',
      monto_fecha_lejana_concepto: 'Mismo importe, fecha lejana y concepto',
      monto_sin_fecha: 'Mismo monto',
      manual: 'Conciliación manual',
      impuestos: 'Conciliación manual de impuestos'
    };
    return map[c] || c || 'Sugerido';
  }

  function blobMov(m) {
    if (!m) return '';
    return [m.fecha, m.tipo, m.descripcion, m.contraparte, m.origen_id, m.id_movimiento_banco, m.monto, m.categoria, m.cuenta_contable].join(' ');
  }

  function sortActual() {
    if (!state.sort[state.lista]) {
      state.sort[state.lista] = (state.lista === 'banco' || state.lista === 'sistema' || state.lista === 'anulados' || state.lista === 'bajas' || state.lista === 'norequiere')
        ? { key: 'fecha', dir: 'desc' }
        : { key: 'fecha_banco', dir: 'desc' };
    }
    return state.sort[state.lista];
  }

  function toggleSort(key) {
    if (!key) return;
    var cur = sortActual();
    if (cur.key === key) {
      cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
    } else {
      cur.key = key;
      cur.dir = (key.indexOf('fecha') >= 0 || key.indexOf('monto') >= 0) ? 'desc' : 'asc';
    }
  }

  function cmpVal(a, b, tipo) {
    if (tipo === 'num') {
      var na = Number(a);
      var nb = Number(b);
      if (!isFinite(na)) na = 0;
      if (!isFinite(nb)) nb = 0;
      return na - nb;
    }
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'es', { numeric: true, sensitivity: 'base' });
  }

  function valMatch(m, key) {
    var bs = movsMatchLado(m, 'banco');
    var ss = movsMatchLado(m, 'sistema');
    if (key === 'banco') return { v: esMatchImpuestos(m) ? 'Impuestos (percepciones MP)' : labelGrupo(bs, true), t: 'txt' };
    if (key === 'monto_banco') {
      if (esMatchImpuestos(m)) return { v: montoPercibidoImpuestos(m), t: 'num' };
      return { v: esMatchSoloExtracto(m) ? montoAbsGrupo(bs) : sumaMontos(bs), t: 'num' };
    }
    if (key === 'fecha_sistema') return { v: fechaGrupo(ss), t: 'fecha' };
    if (key === 'sistema') return { v: labelGrupo(ss, false), t: 'txt' };
    if (key === 'categoria_sistema') return { v: labelCampoGrupo(ss, 'categoria'), t: 'txt' };
    if (key === 'cuenta_sistema') return { v: labelCampoGrupo(ss, 'cuenta_contable'), t: 'txt' };
    if (key === 'monto_sistema') return { v: sumaMontos(ss), t: 'num' };
    if (key === 'criterio') return { v: criterioLabel(m.criterio), t: 'txt' };
    if (esMatchImpuestos(m)) return { v: fechaGrupo(ss), t: 'fecha' };
    return { v: fechaGrupo(bs), t: 'fecha' };
  }

  function valSolo(m, key) {
    if (key === 'tipo') return { v: m.tipo, t: 'txt' };
    if (key === 'concepto') return { v: m.tipo || m.descripcion, t: 'txt' };
    if (key === 'descripcion') return { v: m.descripcion, t: 'txt' };
    if (key === 'contraparte') return { v: m.contraparte, t: 'txt' };
    if (key === 'monto') return { v: m.monto, t: 'num' };
    if (key === 'sugerido') return { v: matchSugeridoDe(m.id) ? 1 : 0, t: 'num' };
    if (key === 'id') return { v: m.id_movimiento_banco || idTesoreriaVisible(m), t: 'txt' };
    if (key === 'categoria') return { v: valorCatCta(m.categoria), t: 'txt' };
    if (key === 'cuenta_contable') return { v: valorCatCta(m.cuenta_contable), t: 'txt' };
    if (key === 'justificacion') return { v: m.no_requiere_justificacion, t: 'txt' };
    if (key === 'marcado') return { v: isoAFechaArgentina(m.no_requiere_at), t: 'fecha' };
    return { v: m.fecha, t: 'fecha' };
  }

  function valAnulado(p, key) {
    if (key === 'tipo') return { v: p.a && p.a.tipo, t: 'txt' };
    if (key === 'descripcion') return { v: p.b && p.b.tipo, t: 'txt' };
    if (key === 'monto') return { v: p.a && p.a.monto, t: 'num' };
    if (key === 'monto_anula') return { v: p.b && p.b.monto, t: 'num' };
    if (key === 'fecha_anula') return { v: p.b && p.b.fecha, t: 'fecha' };
    if (key === 'id') return { v: p.opRel, t: 'txt' };
    return { v: p.a && p.a.fecha, t: 'fecha' };
  }

  function ordenarFilas(arr, getter, sortObj) {
    var cur = sortObj || sortActual();
    var dir = cur.dir === 'asc' ? 1 : -1;
    return arr.slice().sort(function (a, b) {
      var va = getter(a, cur.key);
      var vb = getter(b, cur.key);
      var c = cmpVal(va.v, vb.v, va.t);
      if (c === 0) c = String(a.id || '').localeCompare(String(b.id || ''));
      return c * dir;
    });
  }

  function esMatchMontoFechaExacto(m) {
    var bs = movsMatchLado(m, 'banco');
    var ss = movsMatchLado(m, 'sistema');
    if (bs.length !== 1 || ss.length !== 1) return false;
    if (!mismoImporteExacto(bs[0].monto, ss[0].monto)) return false;
    return String(bs[0].fecha || '').slice(0, 10) === String(ss[0].fecha || '').slice(0, 10);
  }

  function htmlCriterioBadge(m, estado) {
    var manual = esMatchManual(m);
    var exacto = !manual && esMatchMontoFechaExacto(m);
    var cls = manual ? 'cb-badge-manual' : ((estado === 'confirmado' || exacto) ? 'cb-badge-ok' : 'cb-badge-warn');
    var bs = movsMatchLado(m, 'banco');
    var ss = movsMatchLado(m, 'sistema');
    var d = diffMatch(m);
    var extra = '';
    if (esMatchSoloExtracto(m)) {
      extra += ' <span class="cb-badge cb-badge-manual">solo extracto</span>';
    } else if (esMatchImpuestos(m)) {
      extra += ' <span class="cb-badge cb-badge-manual">impuestos</span>';
    } else if (esGrupoMatch(m)) {
      extra += ' <span class="cb-badge cb-badge-manual">' + bs.length + '×' + ss.length + '</span>';
    }
    if (!exacto && d != null && Math.round(Math.abs(d) * 100) > 0) {
      extra += ' <span class="cb-badge cb-badge-warn">Dif. ' + esc(formatMonto(d)) + '</span>';
    }
    return '<span class="cb-badge ' + cls + '">' + esc(criterioLabel(m.criterio)) + '</span>' + extra;
  }

  function sortManual(origen) {
    if (origen === 'sistema') {
      if (!state.manual.sortSistema) state.manual.sortSistema = { key: 'fecha', dir: 'desc' };
      return state.manual.sortSistema;
    }
    if (!state.manual.sortBanco) state.manual.sortBanco = { key: 'fecha', dir: 'desc' };
    return state.manual.sortBanco;
  }

  function toggleSortManual(origen, key) {
    if (!key) return;
    var cur = sortManual(origen);
    if (cur.key === key) {
      cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
    } else {
      cur.key = key;
      cur.dir = (key.indexOf('fecha') >= 0 || key.indexOf('monto') >= 0) ? 'desc' : 'asc';
    }
  }

  function thSortWith(cur, key, label, extraCls, cb, extraData) {
    var activo = cur.key === key;
    var dirTxt = activo ? (cur.dir === 'asc' ? 'ascendente' : 'descendente') : 'sin ordenar';
    var ind = activo ? (cur.dir === 'asc' ? '▲' : '▼') : '↕';
    return '<th class="cb-th-sort ' + (extraCls || '') + (activo ? ' cb-th-sort-activo' : '') + '">' +
      '<button type="button" class="cb-th-sort-btn" data-cb="' + esc(cb || 'sort') + '" data-sort="' + esc(key) + '"' + (extraData || '') +
      ' title="Ordenar ' + esc(label) + ' (' + dirTxt + ')" aria-label="Ordenar por ' + esc(label) + ', ' + dirTxt + '">' +
      esc(label) + '<span class="cb-sort-ind" aria-hidden="true">' + ind + '</span></button></th>';
  }

  function thSort(key, label, extraCls) {
    return thSortWith(sortActual(), key, label, extraCls, 'sort', '');
  }

  function thSortManual(origen, key, label, extraCls) {
    return thSortWith(sortManual(origen), key, label, extraCls, 'sort-manual', ' data-origen="' + esc(origen) + '"');
  }

  function renderTablaSugeridos(estado) {
    var rows = filasVisiblesMatch(estado);
    var html = '';
    rows.forEach(function (m) {
      var bs = movsMatchLado(m, 'banco');
      var ss = movsMatchLado(m, 'sistema');
      html += '<tr>' +
        '<td>' + formatFecha(esMatchImpuestos(m) ? fechaGrupo(ss) : fechaGrupo(bs)) + '</td>' +
        '<td>' + esc(esMatchImpuestos(m) ? 'Impuestos (percepciones MP)' : labelGrupo(bs, true)) + '</td>' +
        '<td class="cb-col-monto">' + (esMatchImpuestos(m)
          ? htmlMonto(montoPercibidoImpuestos(m))
          : (esMatchSoloExtracto(m) ? htmlMontoSoloExtracto(bs) : htmlMonto(sumaMontos(bs)))) + '</td>' +
        '<td>' + formatFecha(fechaGrupo(ss)) + '</td>' +
        '<td>' + esc(esMatchSoloExtracto(m) ? 'Sin tesorería' : labelGrupo(ss, false)) + '</td>' +
        '<td>' + esc(labelCampoGrupo(ss, 'categoria')) + '</td>' +
        '<td>' + esc(labelCampoGrupo(ss, 'cuenta_contable')) + '</td>' +
        '<td class="cb-col-monto">' + htmlMonto(sumaMontos(ss)) + '</td>' +
        '<td>' + htmlCriterioBadge(m, estado) + '</td>' +
        '<td class="cb-col-acc">' +
          btnIcon('ver', m.id, 'Ver detalle de la conciliación', ICO.eye) +
          (estado === 'sugerido' && can(PERM_CONFIRMAR) ? btnIcon('ok', m.id, 'Confirmar conciliación', ICO.check) : '') +
          (estado === 'sugerido' && can(PERM_CONFIRMAR) ? btnIcon('no', m.id, 'Descartar sugerencia', ICO.x, 'cb-btn-danger') : '') +
          (estado === 'confirmado' && can(PERM_CONFIRMAR) ? btnIcon('undo', m.id, 'Deshacer conciliación', ICO.undo, 'cb-btn-danger') : '') +
        '</td>' +
      '</tr>';
    });
    if (!html) {
      return '<p class="cb-empty">' + (hayFiltrosActivos()
        ? 'No hay filas con el mes o concepto elegidos.'
        : (estado === 'confirmado'
          ? 'Todavía no hay conciliaciones confirmadas.'
          : 'No hay sugerencias. Cargá extracto y tesorería, o recalculá.')) + '</p>';
    }
    var bar = '';
    if (estado === 'sugerido' && can(PERM_CONFIRMAR)) {
      bar = '<div class="cb-check-bar">' +
        '<label class="cb-check-line" for="cb-ok-all" data-cb="ok-all">' +
          '<input type="checkbox" id="cb-ok-all" title="Confirmar todos los listados" aria-label="Confirmar todos los listados">' +
          'Confirmar todos los listados' +
        '</label>' +
        '<span class="cb-field-hint">' + rows.length + ' visible' + (rows.length === 1 ? '' : 's') +
          (hayFiltrosActivos() ? ' (con filtros)' : '') + '</span>' +
      '</div>';
    }
    return bar + '<div class="cb-tabla-wrap"><table class="cb-tabla">' +
      '<thead><tr>' +
        thSort('fecha_banco', 'Fecha banco') +
        thSort('banco', 'Banco') +
        thSort('monto_banco', 'Importe', 'cb-col-monto') +
        thSort('fecha_sistema', 'Fecha sistema') +
        thSort('sistema', 'Sistema') +
        thSort('categoria_sistema', 'Categoría') +
        thSort('cuenta_sistema', 'Cuenta contable') +
        thSort('monto_sistema', 'Importe', 'cb-col-monto') +
        thSort('criterio', 'Criterio') +
        '<th class="cb-col-acc">Acciones</th>' +
      '</tr></thead>' +
      '<tbody>' + html + '</tbody></table></div>';
  }

  function renderTablaSolo(origen) {
    var ids = idsUsadosActivos();
    var used = origen === 'banco' ? ids.usedB : ids.usedS;
    var list = (origen === 'banco' ? bancoRowsConciliables() : sistemaRows()).filter(function (m) {
      return !used[m.id] && pasaFiltrosMov(m, origen);
    });
    list = ordenarFilas(list, valSolo);
    var esSis = origen === 'sistema';
    var html = '';
    list.forEach(function (m) {
      html += '<tr>' +
        '<td>' + formatFecha(m.fecha) + '</td>' +
        '<td>' + esc(m.tipo || '—') + '</td>' +
        '<td>' + esc(m.descripcion || '—') + '</td>' +
        '<td>' + esc(m.contraparte || '—') + '</td>' +
        (esSis
          ? '<td>' + celdaCatCta(m.categoria) + '</td><td>' + celdaCatCta(m.cuenta_contable) + '</td>'
          : '') +
        '<td class="cb-col-monto">' + htmlMonto(m.monto) + '</td>' +
        '<td>' + esc(m.id_movimiento_banco || m.origen_id || '—') + '</td>' +
        '<td class="cb-col-acc">' +
          btnIcon('ver-mov', m.id, 'Ver detalle del movimiento', ICO.eye) +
          (esSis && can(PERM_CARGAR)
            ? btnIcon('del-mov', m.id, 'Eliminar movimiento de tesorería', ICO.trash, 'cb-btn-danger')
            : '') +
          (!esSis && esCanalGalicia(state.canal) && can(PERM_CARGAR)
            ? btnIcon('del-mov-banco', m.id, 'Eliminar movimiento del extracto Galicia', ICO.trash, 'cb-btn-danger')
            : '') +
          (!esSis && state.canal === CANAL_MP && can(PERM_CONFIRMAR)
            ? btnIcon('no-req', m.id, 'No requiere conciliación', ICO.skip)
            : '') +
        '</td>' +
      '</tr>';
    });
    if (!html) {
      return '<p class="cb-empty">' + (hayFiltrosActivos()
        ? 'No hay movimientos sin pareja con el mes o concepto elegidos.'
        : 'No hay movimientos sin pareja en este listado.') + '</p>';
    }
    return '<div class="cb-tabla-wrap"><table class="cb-tabla">' +
      '<thead><tr>' +
        thSort('fecha', 'Fecha') +
        thSort('tipo', 'Tipo') +
        thSort('descripcion', 'Descripción') +
        thSort('contraparte', 'Contraparte') +
        (esSis
          ? thSort('categoria', 'Categoría') + thSort('cuenta_contable', 'Cuenta contable')
          : '') +
        thSort('monto', 'Importe', 'cb-col-monto') +
        thSort('id', 'ID') +
        '<th class="cb-col-acc">Acciones</th>' +
      '</tr></thead>' +
      '<tbody>' + html +       '</tbody></table></div>';
  }

  function filasVisiblesBaja() {
    return ordenarFilas(
      sistemaRowsBaja().filter(function (m) { return pasaFiltrosMov(m, 'sistema'); }),
      valSolo
    );
  }

  function renderTablaBajas() {
    var list = filasVisiblesBaja();
    var html = '';
    list.forEach(function (m) {
      html += '<tr>' +
        '<td>' + esc(idTesoreriaVisible(m)) + '</td>' +
        '<td>' + formatFecha(m.fecha) + '</td>' +
        '<td class="cb-col-monto">' + htmlMonto(m.monto) + '</td>' +
        '<td>' + celdaCatCta(m.categoria) + '</td>' +
        '<td>' + celdaCatCta(m.cuenta_contable) + '</td>' +
        '<td>' + esc(m.descripcion || m.tipo || '—') + '</td>' +
        '<td class="cb-col-acc">' +
          btnIcon('ver-mov', m.id, 'Ver detalle del movimiento', ICO.eye) +
          (can(PERM_CARGAR)
            ? btnIcon('baja-ok', m.id, 'Confirmar eliminación definitiva', ICO.trash, 'cb-btn-danger')
            : '') +
        '</td>' +
      '</tr>';
    });
    if (!html) {
      return '<p class="cb-empty">' + (hayFiltrosActivos()
        ? 'No hay tesorería a eliminar con el mes o búsqueda elegidos.'
        : 'No hay tesorería abierta ausente. Al cargar tesoreria_*.xlsx con Id, los movimientos que ya no vengan aparecen acá para confirmar la baja.') + '</p>';
    }
    return FornitaliaHelp.row('tpl-cb-bajas', 'Ayuda: A eliminar',
      '<p>Tesorería abierta que ya no vino en el último Excel. Revisá Id, fecha, importe, categoría, cuenta y descripción; la baja es definitiva y también borra la conciliación asociada, si la hay.</p>') +
      '<div class="cb-tabla-wrap"><table class="cb-tabla">' +
      '<thead><tr>' +
        thSort('id', 'Id') +
        thSort('fecha', 'Fecha') +
        thSort('monto', 'Importe', 'cb-col-monto') +
        thSort('categoria', 'Categoría') +
        thSort('cuenta_contable', 'Cuenta contable') +
        thSort('descripcion', 'Descripción') +
        '<th class="cb-col-acc">Acciones</th>' +
      '</tr></thead>' +
      '<tbody>' + html + '</tbody></table></div>';
  }

  function filasVisiblesAnulados() {
    return ordenarFilas(
      paresMpAutoanulados(bancoRowsTodos()).filter(pasaFiltrosParAnulado),
      valAnulado
    );
  }

  function renderTablaAnulados() {
    var rows = filasVisiblesAnulados();
    var html = '';
    rows.forEach(function (p) {
      html += '<tr>' +
        '<td>' + formatFecha(p.a.fecha) + '</td>' +
        '<td>' + esc(p.a.tipo || p.a.descripcion || '—') + '</td>' +
        '<td class="cb-col-monto">' + htmlMonto(p.a.monto) + '</td>' +
        '<td>' + formatFecha(p.b.fecha) + '</td>' +
        '<td>' + esc(p.b.tipo || p.b.descripcion || '—') + '</td>' +
        '<td class="cb-col-monto">' + htmlMonto(p.b.monto) + '</td>' +
        '<td>' + esc(p.opRel || '—') + '</td>' +
        '<td class="cb-col-acc">' +
          btnIcon('ver-par-anulado', p.id, 'Ver el par anulado', ICO.eye) +
        '</td>' +
      '</tr>';
    });
    if (!html) {
      return '<p class="cb-empty">' + (hayFiltrosActivos()
        ? 'No hay pares anulados con el mes o concepto elegidos.'
        : 'No hay movimientos de Mercado Pago que se autoanulen (mismo ID de operación relacionada e importes opuestos).') + '</p>';
    }
    return FornitaliaHelp.row('tpl-cb-anulados', 'Ayuda: Mercado Pago Anulados',
      '<p>Pares del extracto con la misma operación relacionada e importes opuestos (cobro/devolución, impuesto/anulación, etc.). No entran a la conciliación: en tesorería no existen.</p>') +
      '<div class="cb-tabla-wrap"><table class="cb-tabla">' +
      '<thead><tr>' +
        thSort('fecha', 'Fecha') +
        thSort('tipo', 'Movimiento') +
        thSort('monto', 'Importe', 'cb-col-monto') +
        thSort('fecha_anula', 'Fecha anulación') +
        thSort('descripcion', 'Anulación') +
        thSort('monto_anula', 'Importe', 'cb-col-monto') +
        thSort('id', 'Operación relacionada') +
        '<th class="cb-col-acc">Acciones</th>' +
      '</tr></thead>' +
      '<tbody>' + html + '</tbody></table></div>';
  }

  function filasVisiblesNoRequiere() {
    return ordenarFilas(
      bancoRowsNoRequiere().filter(pasaFiltrosNoRequiere),
      valSolo
    );
  }

  function renderTablaNoRequiere() {
    var list = filasVisiblesNoRequiere();
    var html = '';
    list.forEach(function (m) {
      html += '<tr>' +
        '<td>' + formatFecha(m.fecha) + '</td>' +
        '<td>' + esc(m.tipo || '—') + '</td>' +
        '<td>' + esc(m.descripcion || '—') + '</td>' +
        '<td class="cb-col-monto">' + htmlMonto(m.monto) + '</td>' +
        '<td class="cb-just-cell">' + esc(m.no_requiere_justificacion || '—') + '</td>' +
        '<td>' + formatFecha(isoAFechaArgentina(m.no_requiere_at)) + '</td>' +
        '<td>' + esc(m.id_movimiento_banco || m.origen_id || '—') + '</td>' +
        '<td class="cb-col-acc">' +
          btnIcon('ver-mov', m.id, 'Ver detalle del movimiento', ICO.eye) +
          (can(PERM_CONFIRMAR)
            ? btnIcon('no-req-undo', m.id, 'Volver a Solo banco', ICO.undo)
            : '') +
        '</td>' +
      '</tr>';
    });
    if (!html) {
      return '<p class="cb-empty">' + (hayFiltrosActivos()
        ? 'No hay movimientos con No requiere conciliación para el mes o búsqueda elegidos.'
        : 'No hay movimientos marcados como No requiere conciliación. Desde Solo banco podés marcar uno con justificación; no se borra del extracto.') + '</p>';
    }
    return FornitaliaHelp.row('tpl-cb-norequiere', 'Ayuda: No requiere conciliación',
      '<p>Movimientos del extracto de Mercado Pago que no se concilian. Siguen en la base (el extracto los trae). La justificación queda registrada. Desde acá se puede deshacer y vuelven a Solo banco.</p>') +
      '<div class="cb-tabla-wrap"><table class="cb-tabla">' +
      '<thead><tr>' +
        thSort('fecha', 'Fecha') +
        thSort('tipo', 'Tipo') +
        thSort('descripcion', 'Descripción') +
        thSort('monto', 'Importe', 'cb-col-monto') +
        thSort('justificacion', 'Justificación') +
        thSort('marcado', 'Marcado') +
        thSort('id', 'ID') +
        '<th class="cb-col-acc">Acciones</th>' +
      '</tr></thead>' +
      '<tbody>' + html + '</tbody></table></div>';
  }

  function dlCampo(label, val) {
    return '<dt>' + esc(label) + '</dt><dd>' + esc(val == null || val === '' ? '—' : String(val)) + '</dd>';
  }

  function htmlDetalleMov(m, titulo) {
    if (!m) return '<div class="cb-detalle-bloque"><h3>' + esc(titulo) + '</h3><p>Sin movimiento.</p></div>';
    var raw = m.raw && typeof m.raw === 'object' ? m.raw : {};
    var extra = '';
    Object.keys(raw).forEach(function (k) {
      if (raw[k] == null || raw[k] === '') return;
      extra += dlCampo(k, raw[k]);
    });
    return '<div class="cb-detalle-bloque"><h3>' + esc(titulo) + '</h3><dl>' +
      dlCampo('Fecha', formatFecha(m.fecha)) +
      dlCampo('Tipo', m.tipo) +
      dlCampo('Descripción', m.descripcion) +
      dlCampo('Contraparte / cliente', m.contraparte) +
      dlCampo('Importe', formatMonto(m.monto) + ' ' + (m.moneda || 'ARS')) +
      dlCampo('Categoría', valorCatCta(m.categoria) || '—') +
      dlCampo('Cuenta contable', valorCatCta(m.cuenta_contable) || '—') +
      dlCampo('Crédito', m.credito != null ? formatMonto(m.credito) : '') +
      dlCampo('Débito', m.debito != null ? formatMonto(m.debito) : '') +
      dlCampo('Saldo', m.saldo != null ? formatMonto(m.saldo) : '') +
      dlCampo(esCanalGalicia(state.canal) ? 'N° comprobante Galicia' : 'N° movimiento MP', m.id_movimiento_banco) +
      dlCampo('Operación relacionada', m.id_operacion_relacionada) +
      dlCampo('ID origen', m.origen_id) +
      dlCampo('Archivo', m.archivo) +
      dlCampo('Fila Excel', m.fila_excel) +
      (esNoRequiereConciliacion(m)
        ? dlCampo('No requiere conciliación', 'Sí') +
          dlCampo('Justificación', m.no_requiere_justificacion) +
          dlCampo('Marcado', formatFecha(isoAFechaArgentina(m.no_requiere_at)))
        : '') +
      extra +
    '</dl></div>';
  }

  function abrirDetalleMatch(id) {
    var m = null;
    (state.matches || []).forEach(function (x) { if (x.id === id) m = x; });
    if (!m) return;
    var bs = movsMatchLado(m, 'banco');
    var ss = movsMatchLado(m, 'sistema');
    var footer = '';
    if (m.estado === 'sugerido' && can(PERM_CONFIRMAR)) {
      footer =
        '<button type="button" class="cb-btn cb-btn-danger" data-cb="no" data-id="' + esc(m.id) + '"><span class="btn-icon">' + ICO.x + '</span>Descartar</button>' +
        '<button type="button" class="cb-btn cb-btn-ok" data-cb="ok" data-id="' + esc(m.id) + '"><span class="btn-icon">' + ICO.check + '</span>Confirmar conciliación</button>';
    } else if (m.estado === 'confirmado' && can(PERM_CONFIRMAR)) {
      footer =
        '<button type="button" class="cb-btn cb-btn-danger" data-cb="undo" data-id="' + esc(m.id) + '"><span class="btn-icon">' + ICO.undo + '</span>Deshacer conciliación</button>';
    }
    var d = diffMatch(m);
    var meta = '<p class="cb-field-hint">' + esc(criterioLabel(m.criterio)) + (m.score != null ? ' · score ' + m.score : '') +
      (esMatchImpuestos(m)
        ? ' · tesorería Mercado Pago vs percepciones de Impuestos (sin extracto de retención)'
        : (esMatchSoloExtracto(m)
          ? ' · ' + bs.length + ' movimientos del extracto (sin tesorería)'
          : (esGrupoMatch(m) ? ' · grupo ' + bs.length + ' extractos × ' + ss.length + ' tesorería' : ''))) + '</p>';
    if (d != null) {
      meta += '<p class="cb-field-hint">' + (esMatchImpuestos(m)
        ? 'Diferencia (percibido − |tesorería|): <strong>' + esc(formatMonto(d)) + '</strong>'
        : (esMatchSoloExtracto(m)
          ? 'Suma neta del extracto: <strong>' + esc(formatMonto(d)) + '</strong>'
          : 'Diferencia (suma extracto − suma tesorería): <strong>' + esc(formatMonto(d)) + '</strong>')) + '</p>';
    }
    if (m.justificacion) {
      meta += '<p class="cb-field-hint">Justificación: ' + esc(m.justificacion) + '</p>';
    }
    if (m.confirmado_at) {
      meta += '<p class="cb-field-hint">Confirmado: ' + esc(formatFecha(isoAFechaArgentina(m.confirmado_at))) + '</p>';
    }
    var titB = esCanalGalicia(state.canal) ? (labelCanalNombre(state.canal) + ' (extracto)') : 'Mercado Pago (extracto)';
    var bloquesB = '';
    if (esMatchImpuestos(m)) {
      bloquesB = '<div class="cb-detalle-bloque"><h3>Impuestos (percepciones MP)</h3>' +
        '<p>Conciliación manual de percepciones contra un movimiento de tesorería. No usa el Nº de movimiento del reporte como extracto de retención.</p>' +
        '<p>Percibido: <strong>' + esc(formatMonto(montoPercibidoImpuestos(m))) + '</strong></p></div>';
    } else {
      bloquesB = bs.length ? bs.map(function (x, i) {
        return htmlDetalleMov(x, bs.length > 1 ? titB + ' (' + (i + 1) + '/' + bs.length + ')' : titB);
      }).join('') : htmlDetalleMov(null, titB);
    }
    var bloquesS = '';
    if (esMatchSoloExtracto(m) || !ss.length) {
      if (esMatchSoloExtracto(m)) {
        bloquesS = '<div class="cb-detalle-bloque"><h3>Tesorería (sistema)</h3><p>Sin contrapartida en tesorería: el crédito y el débito se compensan en el extracto.</p></div>';
      } else {
        bloquesS = htmlDetalleMov(null, 'Tesorería (sistema)');
      }
    } else {
      bloquesS = ss.map(function (x, i) {
        return htmlDetalleMov(x, ss.length > 1 ? 'Tesorería (sistema) (' + (i + 1) + '/' + ss.length + ')' : 'Tesorería (sistema)');
      }).join('');
    }
    abrirModal(
      'Detalle de conciliación',
      meta +
      '<div class="cb-detalle' + (bs.length > 1 || ss.length > 1 ? ' cb-detalle-grupo' : '') + '">' + bloquesB + bloquesS + '</div>',
      footer
    );
  }

  function abrirDetalleMov(id) {
    var m = findMov(id);
    if (!m) return;
    abrirModal(
      'Detalle del movimiento',
      '<div class="cb-detalle" style="grid-template-columns:1fr">' + htmlDetalleMov(m, m.origen === 'banco' ? 'Extracto banco' : 'Tesorería sistema') + '</div>',
      ''
    );
  }

  function abrirDetalleParAnulado(pairId) {
    var found = null;
    paresMpAutoanulados(bancoRowsTodos()).forEach(function (p) {
      if (p.id === pairId) found = p;
    });
    if (!found) return;
    abrirModal(
      'Par anulado Mercado Pago',
      '<p class="cb-field-hint">Operación relacionada: <strong>' + esc(found.opRel) + '</strong>. Importes opuestos; no se concilian con tesorería.</p>' +
      '<div class="cb-detalle">' +
        htmlDetalleMov(found.a, 'Movimiento') +
        htmlDetalleMov(found.b, 'Anulación') +
      '</div>',
      ''
    );
  }

  function abrirModal(titulo, bodyHtml, footerHtml, extraCls) {
    cerrarModalFiltros();
    cerrarModal();
    var bd = document.createElement('div');
    var wide = String(extraCls || '').indexOf('cb-modal-wide') >= 0;
    bd.className = 'cb-modal-backdrop' + (wide ? ' cb-modal-backdrop-wide' : '');
    bd.innerHTML =
      '<div class="cb-modal ' + (extraCls || '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-header">' +
          '<h2>' + esc(titulo) + '</h2>' +
          '<button type="button" class="cb-btn cb-btn-ghost cb-btn-icon-only" data-cb="cerrar-modal" title="Cerrar" aria-label="Cerrar"><span class="btn-icon">' + ICO.x + '</span></button>' +
        '</div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="cb-btn cb-btn-ghost" data-cb="cerrar-modal"><span class="btn-icon">' + ICO.x + '</span>Cerrar</button>' +
          (footerHtml || '') +
        '</div>' +
      '</div>';
    document.body.appendChild(bd);
    state.modal = bd;
    bd.addEventListener('click', onModalClick);
    function onEsc(ev) {
      if (ev.key !== 'Escape') return;
      if (state.modalFiltros) return;
      ev.preventDefault();
      cerrarModal();
    }
    document.addEventListener('keydown', onEsc);
    bd._cbEsc = onEsc;
  }

  function onModalClick(ev) {
    var bd = state.modal;
    if (!bd) return;
    if (ev.target === bd) { cerrarModal(); return; }
    var t = ev.target.closest && ev.target.closest('[data-cb]');
    if (!t || !bd.contains(t)) return;
    var a = t.getAttribute('data-cb');
    var id = t.getAttribute('data-id');
    if (a === 'cerrar-modal') { ev.preventDefault(); cerrarModal(); return; }
    if (a === 'ok') { ev.preventDefault(); setEstado(id, 'confirmado'); return; }
    if (a === 'no') { ev.preventDefault(); setEstado(id, 'rechazado'); return; }
    if (a === 'undo') { ev.preventDefault(); setEstado(id, 'sugerido'); return; }
    if (a === 'sort-manual') {
      ev.preventDefault();
      toggleSortManual(t.getAttribute('data-origen'), t.getAttribute('data-sort'));
      refreshManualModal();
      return;
    }
    if (a === 'pick-banco') { ev.preventDefault(); pickManual('banco', id); return; }
    if (a === 'pick-sistema') { ev.preventDefault(); pickManual('sistema', id); return; }
    if (a === 'manual-ok') { ev.preventDefault(); confirmarManual(); return; }
    if (a === 'filtros-manual') { ev.preventDefault(); abrirModalFiltros('manual'); return; }
    if (a === 'no-req-ok') { ev.preventDefault(); confirmarExcluirConciliacion(); return; }
  }

  function cerrarModal() {
    cerrarModalFiltros();
    if (state.modal) {
      if (state.modal._cbEsc) document.removeEventListener('keydown', state.modal._cbEsc);
      if (state.modal.parentNode) state.modal.parentNode.removeChild(state.modal);
    }
    state.modal = null;
  }

  function htmlOpcionesSelect(valores, seleccionado, placeholder) {
    var html = '<option value="">' + esc(placeholder) + '</option>';
    (valores || []).forEach(function (v) {
      html += '<option value="' + esc(v) + '"' + (seleccionado === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return html;
  }

  function htmlOpcionesMesSelect(valores, seleccionado, placeholder) {
    var html = '<option value="">' + esc(placeholder) + '</option>';
    (valores || []).forEach(function (ym) {
      html += '<option value="' + esc(ym) + '"' + (seleccionado === ym ? ' selected' : '') + '>' + esc(formatMesLabel(ym)) + '</option>';
    });
    return html;
  }

  function htmlCuerpoModalFiltros() {
    syncFiltrosConOpciones();
    var d = state.filtrosDraft || {};
    var filtroDyn = { mesSistema: d.mesSistema || '', categoria: d.categoria || '' };
    var mesExtOpts = htmlOpcionesMesSelect(opcionesMesExtracto(), d.mesExtracto || '', 'Todos los meses');
    var mesSisOpts = htmlOpcionesMesSelect(opcionesMesSistema(), d.mesSistema || '', 'Todos los meses');
    var catOpts = htmlOpcionesSelect(opcionesCategoria(filtroDyn), d.categoria || '', 'Todas las categorías');
    var ctaOpts = htmlOpcionesSelect(opcionesCuenta(filtroDyn), d.cuenta || '', 'Todas las cuentas');
    var mesExtOn = !!d.mesExtracto;
    var mesSisOn = !!d.mesSistema;
    var catOn = !!d.categoria;
    var ctaOn = !!d.cuenta;
    return FornitaliaHelp.row('tpl-cb-filtros', 'Ayuda: Filtros',
      '<p>Filtrá por mes del extracto, mes de tesorería, categoría y cuenta contable. El buscar de la pantalla sigue libre y no se restringe acá.</p>') +
      '<div class="cb-filtros-modal-grid">' +
        '<div class="form-group' + (mesExtOn ? ' cb-filtro-activo' : '') + '"><label for="cb-filtro-mes-extracto">Mes de extracto</label>' +
          '<select id="cb-filtro-mes-extracto" title="Filtrar por mes del extracto bancario">' + mesExtOpts + '</select></div>' +
        '<div class="form-group' + (mesSisOn ? ' cb-filtro-activo' : '') + '"><label for="cb-filtro-mes-sistema">Mes de sistema</label>' +
          '<select id="cb-filtro-mes-sistema" title="Filtrar por mes de tesorería">' + mesSisOpts + '</select></div>' +
        '<div class="form-group' + (catOn ? ' cb-filtro-activo' : '') + '"><label for="cb-filtro-categoria">Categoría</label>' +
          '<select id="cb-filtro-categoria" title="Filtrar por categoría de tesorería">' + catOpts + '</select></div>' +
        '<div class="form-group' + (ctaOn ? ' cb-filtro-activo' : '') + '"><label for="cb-filtro-cuenta">Cuenta contable</label>' +
          '<select id="cb-filtro-cuenta" title="Filtrar por cuenta contable de tesorería">' + ctaOpts + '</select></div>' +
      '</div>';
  }

  function bindModalFiltrosInputs() {
    var bd = state.modalFiltros;
    if (!bd || !state.filtrosDraft) return;
    function bindSel(id, campo, cascada) {
      var el = bd.querySelector(id);
      if (!el) return;
      el.addEventListener('change', function () {
        state.filtrosDraft[campo] = el.value || '';
        if (cascada) {
          if (campo === 'mesSistema' || campo === 'categoria') {
            syncCamposFiltro(state.filtrosDraft);
            refreshModalFiltros();
          }
        }
      });
    }
    bindSel('#cb-filtro-mes-extracto', 'mesExtracto', false);
    bindSel('#cb-filtro-mes-sistema', 'mesSistema', true);
    bindSel('#cb-filtro-categoria', 'categoria', true);
    bindSel('#cb-filtro-cuenta', 'cuenta', false);
  }

  function refreshModalFiltros() {
    if (!state.modalFiltros) return;
    var body = state.modalFiltros.querySelector('.modal-body');
    if (body) body.innerHTML = htmlCuerpoModalFiltros();
    bindModalFiltrosInputs();
  }

  function onModalFiltrosClick(ev) {
    var bd = state.modalFiltros;
    if (!bd) return;
    if (ev.target === bd) { cerrarModalFiltros(); return; }
    var t = ev.target.closest && ev.target.closest('[data-cb]');
    if (!t || !bd.contains(t)) return;
    var a = t.getAttribute('data-cb');
    if (a === 'cerrar-filtros') { ev.preventDefault(); cerrarModalFiltros(); return; }
    if (a === 'limpiar-filtros') {
      ev.preventDefault();
      if (!state.filtrosDraft) return;
      state.filtrosDraft.mesExtracto = '';
      state.filtrosDraft.mesSistema = '';
      state.filtrosDraft.categoria = '';
      state.filtrosDraft.cuenta = '';
      refreshModalFiltros();
      return;
    }
    if (a === 'aplicar-filtros') {
      ev.preventDefault();
      aplicarFiltrosModal();
    }
  }

  function aplicarFiltrosModal() {
    var d = state.filtrosDraft;
    if (!d) { cerrarModalFiltros(); return; }
    syncCamposFiltro(d);
    var target = d.target === 'manual' ? 'manual' : 'vista';
    var dest = target === 'manual' ? state.manual : state;
    dest.mesExtracto = d.mesExtracto || '';
    dest.mesSistema = d.mesSistema || '';
    dest.categoria = d.categoria || '';
    dest.cuenta = d.cuenta || '';
    cerrarModalFiltros();
    if (target === 'manual') refreshManualModal();
    else renderShell();
  }

  function abrirModalFiltros(target) {
    syncFiltrosConOpciones();
    cerrarModalFiltros();
    var src = target === 'manual' ? (state.manual || {}) : state;
    state.filtrosDraft = {
      target: target === 'manual' ? 'manual' : 'vista',
      mesExtracto: src.mesExtracto || '',
      mesSistema: src.mesSistema || '',
      categoria: src.categoria || '',
      cuenta: src.cuenta || ''
    };
    var bd = document.createElement('div');
    bd.className = 'cb-modal-backdrop cb-modal-filtros-backdrop';
    bd.innerHTML =
      '<div class="cb-modal cb-modal-filtros" role="dialog" aria-modal="true" aria-labelledby="cb-filtros-titulo">' +
        '<div class="modal-header">' +
          '<h2 id="cb-filtros-titulo">Filtros</h2>' +
          '<button type="button" class="cb-btn cb-btn-ghost cb-btn-icon-only" data-cb="cerrar-filtros" title="Cerrar" aria-label="Cerrar"><span class="btn-icon">' + ICO.x + '</span></button>' +
        '</div>' +
        '<div class="modal-body">' + htmlCuerpoModalFiltros() + '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="cb-btn cb-btn-ghost" data-cb="limpiar-filtros"><span class="btn-icon">' + ICO.trash + '</span>Limpiar</button>' +
          '<button type="button" class="cb-btn cb-btn-ghost" data-cb="cerrar-filtros"><span class="btn-icon">' + ICO.x + '</span>Cancelar</button>' +
          '<button type="button" class="cb-btn cb-btn-ok" data-cb="aplicar-filtros"><span class="btn-icon">' + ICO.check + '</span>Aplicar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bd);
    state.modalFiltros = bd;
    bd.addEventListener('click', onModalFiltrosClick);
    function onEsc(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); cerrarModalFiltros(); }
    }
    document.addEventListener('keydown', onEsc);
    bd._cbEsc = onEsc;
    bindModalFiltrosInputs();
  }

  function cerrarModalFiltros() {
    if (state.modalFiltros) {
      if (state.modalFiltros._cbEsc) document.removeEventListener('keydown', state.modalFiltros._cbEsc);
      if (state.modalFiltros.parentNode) state.modalFiltros.parentNode.removeChild(state.modalFiltros);
    }
    state.modalFiltros = null;
    state.filtrosDraft = null;
  }

  function htmlBtnFiltros(target, nActivos) {
    var action = target === 'manual' ? 'filtros-manual' : 'filtros';
    var title = nActivos
      ? (nActivos + ' filtro' + (nActivos === 1 ? '' : 's') + ' activo' + (nActivos === 1 ? '' : 's'))
      : 'Abrir filtros';
    return '<button type="button" class="cb-btn cb-btn-ghost' + (nActivos ? ' cb-btn-filtros-on' : '') + '" data-cb="' + action + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
      '<span class="btn-icon">' + ICO.filter + '</span>Filtros' +
      (nActivos ? '<span class="cb-filtros-count">' + nActivos + '</span>' : '') +
    '</button>';
  }

  function htmlPickTabla(origen) {
    var list = ordenarFilas(movLibreManual(origen), valSolo, sortManual(origen));
    var sels = idsSelManual(origen);
    var action = origen === 'banco' ? 'pick-banco' : 'pick-sistema';
    var esSis = origen === 'sistema';
    var html = '';
    list.forEach(function (m) {
      var sug = matchSugeridoDe(m.id);
      var sel = sels.indexOf(m.id) >= 0;
      html += '<tr class="cb-pick-row' + (sel ? ' cb-pick-sel' : '') + '" data-cb="' + action + '" data-id="' + esc(m.id) + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
        '<td class="cb-pick-check" aria-hidden="true">' + (sel ? '✓' : '') + '</td>' +
        '<td>' + formatFecha(m.fecha) + '</td>' +
        '<td>' + esc(m.tipo || m.descripcion || '—') + '</td>' +
        (esSis
          ? '<td>' + celdaCatCta(m.categoria) + '</td><td>' + celdaCatCta(m.cuenta_contable) + '</td>'
          : '') +
        '<td class="cb-col-monto">' + htmlMonto(m.monto) + '</td>' +
        '<td>' + (sug ? '<span class="cb-badge ' + (esMatchMontoFechaExacto(sug) ? 'cb-badge-ok' : 'cb-badge-warn') + '">Sugerido</span>' : '') + '</td>' +
      '</tr>';
    });
    if (!html) {
      var hayFiltro = hayFiltrosManualEstructuralesActivos() ||
        !!((origen === 'banco' ? state.manual.qBanco : state.manual.qSistema) || '').trim();
      return '<p class="cb-empty">No hay movimientos disponibles' + (hayFiltro ? ' con esos filtros.' : '.') + '</p>';
    }
    return '<div class="cb-tabla-wrap cb-pick-wrap' + (esSis ? ' cb-pick-sistema' : '') + '"><table class="cb-tabla">' +
      '<thead><tr>' +
        '<th class="cb-pick-check" aria-hidden="true"></th>' +
        thSortManual(origen, 'fecha', 'Fecha') +
        thSortManual(origen, 'concepto', 'Concepto') +
        (esSis
          ? thSortManual(origen, 'categoria', 'Categoría') + thSortManual(origen, 'cuenta_contable', 'Cuenta contable')
          : '') +
        thSortManual(origen, 'monto', 'Importe', 'cb-col-monto') +
        thSortManual(origen, 'sugerido', 'Estado') +
      '</tr></thead>' +
      '<tbody>' + html + '</tbody></table></div>';
  }

  function htmlFiltrosManual() {
    var n = contarFiltrosEstructurales(state.manual);
    return '<div class="cb-filtros cb-manual-filtros">' +
      htmlBtnFiltros('manual', n) +
      (n ? '<span class="cb-filtros-flag" title="Hay filtros aplicados en este modal">Filtros activos</span>' : '') +
    '</div>';
  }

  function htmlManualBody() {
    var banks = idsSelManual('banco').map(findMov).filter(Boolean);
    var sist = idsSelManual('sistema').map(findMov).filter(Boolean);
    var sumB = sumaMontos(banks);
    var sumS = sumaMontos(sist);
    var soloExtracto = banks.length >= 2 && !sist.length;
    var d = null;
    if (soloExtracto && sumB != null) d = sumB;
    else if (banks.length && sist.length && sumB != null && sumS != null) d = Math.round((sumB - sumS) * 100) / 100;
    var absD = d != null ? Math.abs(d) : 0;
    var warn = absD > 1;
    var diffHtml = '';
    if (soloExtracto) {
      diffHtml = '<div class="cb-diff-box' + (warn ? ' warn' : '') + '">' +
        '<strong>Solo extracto (' + banks.length + '):</strong> suma neta ' + esc(formatMonto(sumB)) +
        (warn
          ? '<br>La suma neta no cierra en cero. Queda registrada junto con la justificación (p. ej. comisión o diferencia de centavos).'
          : '<br>Crédito y débito del extracto se compensan; no hay contrapartida en tesorería.') +
      '</div>';
    } else if (banks.length && sist.length) {
      diffHtml = '<div class="cb-diff-box' + (warn ? ' warn' : '') + '">' +
        '<strong>Extracto (' + banks.length + '):</strong> ' + esc(formatMonto(sumB)) +
        ' &nbsp;·&nbsp; <strong>Tesorería (' + sist.length + '):</strong> ' + esc(formatMonto(sumS)) +
        ' &nbsp;·&nbsp; <strong>Diferencia:</strong> ' + esc(formatMonto(d)) +
        (warn
          ? '<br>La diferencia es mayor a $1. Queda registrada junto con la justificación.'
          : '<br>Aunque el importe coincida (o difiera hasta $1), el grupo queda como conciliación manual.') +
      '</div>';
    } else {
      diffHtml = '<div class="cb-diff-box">Elegí uno o más movimientos del extracto y uno o más de tesorería, o <strong>dos o más del extracto</strong> si el crédito y el débito se compensan entre sí (transferencia por error y devolución, sin tesorería). Clic para sumar o quitar. Si alguno está en Sugeridos, esa sugerencia se reemplaza al confirmar.</div>';
    }
    var nB = movLibreManual('banco').length;
    var nS = movLibreManual('sistema').length;
    var selB = banks.length;
    var selS = sist.length;
    return FornitaliaHelp.row('tpl-cb-manual', 'Ayuda: Conciliación manual',
      '<p>Podés conciliar varios extractos con una o más tesorerías, o cruzar dos movimientos del mismo extracto cuando no hay contrapartida en el sistema (crédito recibido por error y débito de la devolución).</p>' +
      '<p>La diferencia es la suma del extracto menos la suma de tesorería (o la suma neta si no hay tesorería). La justificación, los importes y quién confirmó quedan guardados.</p>' +
      '<p>Los filtros (mes extracto/sistema, categoría y cuenta) son los mismos de la vista; si ya los tenías aplicados, arrancan acá. El buscar por lado sigue amplio.</p>') +
      htmlFiltrosManual() +
      '<div class="cb-manual-cols">' +
        '<div class="cb-manual-col">' +
          '<h3>Extracto bancario <span class="cb-manual-count">(' + nB + ')</span>' +
            (selB ? ' <span class="cb-manual-sel">' + selB + ' elegidos</span>' : '') + '</h3>' +
          '<div class="form-group' + ((state.manual.qBanco || '').trim() ? ' cb-filtro-activo' : '') + '"><label class="cb-just-label" for="cb-manual-qb">Buscar extracto</label>' +
          '<input type="search" id="cb-manual-qb" value="' + esc(state.manual.qBanco) + '" placeholder="Fecha, importe, concepto…"></div>' +
          htmlPickTabla('banco') +
        '</div>' +
        '<div class="cb-manual-col">' +
          '<h3>Tesorería (sistema) <span class="cb-manual-count">(' + nS + ')</span>' +
            (selS ? ' <span class="cb-manual-sel">' + selS + ' elegidos</span>' : '') + '</h3>' +
          '<div class="form-group' + ((state.manual.qSistema || '').trim() ? ' cb-filtro-activo' : '') + '"><label class="cb-just-label" for="cb-manual-qs">Buscar tesorería</label>' +
          '<input type="search" id="cb-manual-qs" value="' + esc(state.manual.qSistema) + '" placeholder="Fecha, importe, cliente…"></div>' +
          htmlPickTabla('sistema') +
        '</div>' +
      '</div>' +
      diffHtml +
      '<label class="cb-just-label" for="cb-manual-just">Justificación de la diferencia / del cruce</label>' +
      '<textarea id="cb-manual-just" class="cb-just-area" maxlength="800" placeholder="Ej.: transferencia recibida por error y devolución; no está en tesorería. Comisión MP no reflejada; mismo pago con distinto importe por redondeo.">' + esc(state.manual.justif) + '</textarea>';
  }

  function bindManualInputs() {
    if (!state.modal) return;
    var qb = state.modal.querySelector('#cb-manual-qb');
    var qs = state.modal.querySelector('#cb-manual-qs');
    var ju = state.modal.querySelector('#cb-manual-just');
    function bindSearch(el, campo) {
      if (!el) return;
      el.addEventListener('input', function () {
        state.manual[campo] = el.value;
        var pos = el.selectionStart;
        refreshManualModal();
        var n = state.modal && state.modal.querySelector(campo === 'qBanco' ? '#cb-manual-qb' : '#cb-manual-qs');
        if (n) {
          n.focus();
          try { n.setSelectionRange(pos, pos); } catch (e2) { /* ignore */ }
        }
      });
    }
    bindSearch(qb, 'qBanco');
    bindSearch(qs, 'qSistema');
    if (ju) {
      ju.addEventListener('input', function () { state.manual.justif = ju.value; });
    }
  }

  function syncManualFromDom() {
    if (!state.modal) return;
    var ju = state.modal.querySelector('#cb-manual-just');
    if (ju) state.manual.justif = ju.value;
    var qb = state.modal.querySelector('#cb-manual-qb');
    if (qb) state.manual.qBanco = qb.value;
    var qs = state.modal.querySelector('#cb-manual-qs');
    if (qs) state.manual.qSistema = qs.value;
  }

  function refreshManualModal() {
    if (!state.modal) return;
    syncManualFromDom();
    var body = state.modal.querySelector('.modal-body');
    if (body) body.innerHTML = htmlManualBody();
    bindManualInputs();
  }

  function pickManual(lado, id) {
    syncManualFromDom();
    var arr = lado === 'banco' ? idsSelManual('banco') : idsSelManual('sistema');
    var i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(id);
    if (lado === 'banco') state.manual.bancoIds = arr;
    else state.manual.sistemaIds = arr;
    refreshManualModal();
  }

  function abrirManual() {
    if (!can(PERM_CONFIRMAR)) return;
    state.manual = {
      bancoIds: [],
      sistemaIds: [],
      qBanco: state.q || '',
      qSistema: state.q || '',
      mesExtracto: state.mesExtracto || '',
      mesSistema: state.mesSistema || '',
      categoria: state.categoria || '',
      cuenta: state.cuenta || '',
      justif: '',
      sortBanco: { key: 'fecha', dir: 'desc' },
      sortSistema: { key: 'fecha', dir: 'desc' }
    };
    var footer = '<button type="button" class="cb-btn cb-btn-ok" data-cb="manual-ok"><span class="btn-icon">' + ICO.check + '</span>Confirmar conciliación manual</button>';
    abrirModal('Conciliación manual', htmlManualBody(), footer, 'cb-modal-wide');
    bindManualInputs();
  }

  async function confirmarManual() {
    if (!can(PERM_CONFIRMAR)) return;
    syncManualFromDom();
    var bancoIds = idsSelManual('banco');
    var sistemaIds = idsSelManual('sistema');
    var just = (state.manual.justif || '').trim();
    if (!bancoIds.length) {
      alert('Elegí al menos un movimiento del extracto.');
      return;
    }
    if (!sistemaIds.length && bancoIds.length < 2) {
      alert('Sin tesorería, elegí al menos dos movimientos del extracto (crédito y débito). O elegí también tesorería.');
      return;
    }
    if (just.length < 8) {
      alert('Escribí una justificación de al menos 8 caracteres. Queda registrada junto con la diferencia.');
      return;
    }
    try {
      var rpc = await client().rpc('cb_confirmar_manual_grupo', {
        p_canal: state.canal,
        p_banco_ids: bancoIds,
        p_sistema_ids: sistemaIds,
        p_justificacion: just
      });
      if (rpc.error) throw rpc.error;
      cerrarModal();
      state.lista = 'confirmados';
      state.msg = sistemaIds.length
        ? 'Conciliación manual confirmada. La justificación y la diferencia quedaron registradas.'
        : 'Conciliación manual confirmada: crédito y débito del extracto, sin tesorería.';
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  function excelDate(ymd) {
    var s = String(ymd || '').slice(0, 10);
    var p = s.split('-');
    if (p.length !== 3) return null;
    var y = Number(p[0]);
    var m = Number(p[1]);
    var d = Number(p[2]);
    if (!y || !m || !d) return null;
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  function excelNum(n) {
    if (n == null || n === '') return null;
    var v = Number(n);
    return isFinite(v) ? v : null;
  }

  function listaLabel() {
    if (state.lista === 'confirmados') return 'Confirmados';
    if (state.lista === 'banco') return 'Solo banco';
    if (state.lista === 'sistema') return 'Solo sistema';
    if (state.lista === 'anulados') return 'Mercado Pago Anulados';
    if (state.lista === 'norequiere') return 'No requiere';
    if (state.lista === 'bajas') return 'A eliminar';
    return 'Sugeridos';
  }

  function canalLabel() {
    return labelCanalNombre(state.canal);
  }

  function filasVisiblesMatch(estado) {
    var rows = (state.matches || []).filter(function (m) {
      if (m.estado !== estado || !pasaFiltrosMatch(m)) return false;
      if (matchSugeridoEsAnulado(m) || matchConTesoreriaPendienteBaja(m)) return false;
      return true;
    });
    return ordenarFilas(rows, valMatch);
  }

  function filasVisiblesSolo(origen) {
    var ids = idsUsadosActivos();
    var used = origen === 'banco' ? ids.usedB : ids.usedS;
    var list = (origen === 'banco' ? bancoRowsConciliables() : sistemaRows()).filter(function (m) {
      return !used[m.id] && pasaFiltrosMov(m, origen);
    });
    return ordenarFilas(list, valSolo);
  }

  function aplicarFormatoExcel(ws, headerRow, dateCols, numCols) {
    if (!ws['!ref']) return;
    var range = global.XLSX.utils.decode_range(ws['!ref']);
    var r;
    var c;
    for (r = 0; r <= range.e.r; r++) {
      for (c = 0; c <= range.e.c; c++) {
        var addr = global.XLSX.utils.encode_cell({ r: r, c: c });
        var cell = ws[addr];
        if (!cell) continue;
        if (r === 0) {
          cell.s = { font: { bold: true, sz: 13, color: { rgb: 'FF0F172A' } } };
        }
        if (r === headerRow) {
          cell.s = {
            font: { bold: true, color: { rgb: 'FFFFFFFF' } },
            fill: { patternType: 'solid', fgColor: { rgb: 'FF1E293B' } },
            alignment: { vertical: 'center', wrapText: true }
          };
        }
        if (r > headerRow && dateCols.indexOf(c) >= 0 && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = 'dd/mm/yyyy';
        }
        if (r > headerRow && numCols.indexOf(c) >= 0 && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = '#,##0.00';
        }
      }
    }
  }

  function exportarExcel() {
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    var headerRow = 9;
    var aoa = [
      ['Conciliación Bancaria — ' + canalLabel()],
      ['Listado', listaLabel()],
      ['Filtro mes extracto', state.mesExtracto ? formatMesLabel(state.mesExtracto) : 'Todos'],
      ['Filtro mes sistema', state.mesSistema ? formatMesLabel(state.mesSistema) : 'Todos'],
      ['Filtro categoría', state.categoria || 'Todas'],
      ['Filtro cuenta contable', state.cuenta || 'Todas'],
      ['Buscar', (state.q || '').trim() || '—'],
      ['Exportado', formatFecha(fechaHoyYmd())],
      []
    ];
    var dateCols = [];
    var numCols = [];
    var cols = [];
    var esMatch = state.lista === 'sugeridos' || state.lista === 'confirmados';
    if (esMatch) {
      aoa.push(['Fecha banco', 'Extracto', 'Importe banco', 'Fecha sistema', 'Tesorería', 'Categoría', 'Cuenta contable', 'Importe sistema', 'Diferencia', 'Criterio', 'Justificación', 'Estado', 'ID extracto', 'ID tesorería']);
      dateCols = [0, 3];
      numCols = [2, 7, 8];
      cols = [{ wch: 12 }, { wch: 36 }, { wch: 14 }, { wch: 12 }, { wch: 36 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 32 }, { wch: 40 }, { wch: 12 }, { wch: 22 }, { wch: 22 }];
      var estado = state.lista === 'confirmados' ? 'confirmado' : 'sugerido';
      var matches = filasVisiblesMatch(estado);
      if (!matches.length) {
        alert('No hay filas visibles con los filtros activos para exportar.');
        return;
      }
      matches.forEach(function (m) {
        var bs = movsMatchLado(m, 'banco');
        var ss = movsMatchLado(m, 'sistema');
        aoa.push([
          excelDate(esMatchImpuestos(m) ? fechaGrupo(ss) : fechaGrupo(bs)),
          esMatchImpuestos(m) ? 'Impuestos (percepciones MP)' : textoGrupo(bs, true),
          excelNum(esMatchImpuestos(m)
            ? montoPercibidoImpuestos(m)
            : (esMatchSoloExtracto(m) ? sumaMontosSigno(bs, true) : sumaMontos(bs))),
          excelDate(fechaGrupo(ss)),
          esMatchSoloExtracto(m) ? 'Sin tesorería' : textoGrupo(ss, false),
          textoCampoGrupo(ss, 'categoria'),
          textoCampoGrupo(ss, 'cuenta_contable'),
          excelNum(esMatchSoloExtracto(m) ? sumaMontosSigno(bs, false) : sumaMontos(ss)),
          excelNum(diffMatch(m)),
          criterioLabel(m.criterio) + (esMatchImpuestos(m)
            ? ''
            : (esMatchSoloExtracto(m) ? ' (solo extracto)' : (esGrupoMatch(m) ? ' (' + bs.length + '×' + ss.length + ')' : ''))),
          m.justificacion || '',
          m.estado || '',
          esMatchImpuestos(m) ? '' : idsOrigenGrupo(bs),
          idsOrigenGrupo(ss)
        ]);
      });
    } else if (state.lista === 'anulados') {
      aoa.push(['Fecha', 'Movimiento', 'Importe', 'Fecha anulación', 'Anulación', 'Importe anulación', 'Operación relacionada', 'ID movimiento', 'ID anulación']);
      dateCols = [0, 3];
      numCols = [2, 5];
      cols = [{ wch: 12 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
      var pares = filasVisiblesAnulados();
      if (!pares.length) {
        alert('No hay filas visibles con los filtros activos para exportar.');
        return;
      }
      pares.forEach(function (p) {
        aoa.push([
          excelDate(p.a.fecha),
          p.a.tipo || p.a.descripcion || '',
          excelNum(p.a.monto),
          excelDate(p.b.fecha),
          p.b.tipo || p.b.descripcion || '',
          excelNum(p.b.monto),
          p.opRel || '',
          p.a.id_movimiento_banco || p.a.origen_id || '',
          p.b.id_movimiento_banco || p.b.origen_id || ''
        ]);
      });
    } else if (state.lista === 'norequiere') {
      aoa.push(['Fecha', 'Tipo', 'Descripción', 'Contraparte', 'Importe', 'Justificación', 'Marcado', 'ID']);
      dateCols = [0, 6];
      numCols = [4];
      cols = [{ wch: 12 }, { wch: 22 }, { wch: 40 }, { wch: 24 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 22 }];
      var excl = filasVisiblesNoRequiere();
      if (!excl.length) {
        alert('No hay filas visibles con los filtros activos para exportar.');
        return;
      }
      excl.forEach(function (m) {
        aoa.push([
          excelDate(m.fecha),
          m.tipo || '',
          m.descripcion || '',
          m.contraparte || '',
          excelNum(m.monto),
          m.no_requiere_justificacion || '',
          excelDate(isoAFechaArgentina(m.no_requiere_at)),
          m.id_movimiento_banco || m.origen_id || ''
        ]);
      });
    } else if (state.lista === 'bajas') {
      aoa.push(['Id', 'Fecha', 'Importe', 'Categoría', 'Cuenta contable', 'Descripción']);
      dateCols = [1];
      numCols = [2];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 28 }, { wch: 44 }];
      var bajas = filasVisiblesBaja();
      if (!bajas.length) {
        alert('No hay filas visibles con los filtros activos para exportar.');
        return;
      }
      bajas.forEach(function (m) {
        aoa.push([
          idTesoreriaVisible(m),
          excelDate(m.fecha),
          excelNum(m.monto),
          valorCatCta(m.categoria) || null,
          valorCatCta(m.cuenta_contable) || null,
          m.descripcion || m.tipo || ''
        ]);
      });
    } else {
      var origen = state.lista === 'banco' ? 'banco' : 'sistema';
      var esSis = origen === 'sistema';
      aoa.push(esSis
        ? ['Fecha', 'Tipo', 'Descripción', 'Contraparte', 'Categoría', 'Cuenta contable', 'Importe', 'ID']
        : ['Fecha', 'Tipo', 'Descripción', 'Contraparte', 'Importe', 'ID']);
      dateCols = [0];
      numCols = esSis ? [6] : [4];
      cols = esSis
        ? [{ wch: 12 }, { wch: 22 }, { wch: 40 }, { wch: 24 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 28 }]
        : [{ wch: 12 }, { wch: 22 }, { wch: 40 }, { wch: 24 }, { wch: 14 }, { wch: 28 }];
      var movs = filasVisiblesSolo(origen);
      if (!movs.length) {
        alert('No hay filas visibles con los filtros activos para exportar.');
        return;
      }
      movs.forEach(function (m) {
        var fila = [
          excelDate(m.fecha),
          m.tipo || '',
          m.descripcion || '',
          m.contraparte || ''
        ];
        if (esSis) {
          fila.push(valorCatCta(m.categoria) || null, valorCatCta(m.cuenta_contable) || null);
        }
        fila.push(excelNum(m.monto), m.id_movimiento_banco || m.origen_id || '');
        aoa.push(fila);
      });
    }
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols;
    aplicarFormatoExcel(ws, headerRow, dateCols, numCols);
    var wb = global.XLSX.utils.book_new();
    var sheetName = listaLabel().slice(0, 31);
    global.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    var canalFile = esCanalGalUsd(state.canal) ? 'Galicia_USD' : (state.canal === CANAL_GAL ? 'Galicia_ARS' : 'MP');
    var listaFile = (state.lista || 'sugeridos').replace(/[^a-z]/g, '_');
    global.XLSX.writeFile(wb, 'Conciliacion_Bancaria_' + canalFile + '_' + listaFile + '_' + fechaHoyYmd() + '.xlsx', { cellStyles: true, cellDates: false });
  }

  function renderFiltros() {
    syncFiltrosConOpciones();
    var n = contarFiltrosEstructurales(state);
    var qOn = !!(state.q || '').trim();
    return '<div class="cb-filtros">' +
      htmlBtnFiltros('vista', n) +
      (n ? '<span class="cb-filtros-flag" title="Hay filtros aplicados; el listado y el Excel respetan estos filtros">Filtros activos</span>' : '') +
      '<div class="form-group cb-filtro-buscar' + (qOn ? ' cb-filtro-activo' : '') + '"><label for="cb-q">Buscar</label><input type="search" id="cb-q" value="' + esc(state.q) + '" placeholder="Fecha, importe, cliente, ID, categoría…" title="Búsqueda amplia sobre el listado visible"></div>' +
    '</div>';
  }

  function labelsCanal() {
    if (esCanalGalUsd(state.canal)) {
      return {
        hintHtml:
          '<p>Cargá el extracto de Galicia en dólares: Excel <em>Extracto_CCE…</em> o el PDF <em>Extracto_Cuentas_Galicia_…</em> (Cuenta Corriente Especial en dólares; no duplica lo ya cargado: misma fecha, importe y concepto, aunque cambie el saldo).</p>' +
          '<p>Los importes se concilian en <strong>USD</strong> contra tesorería <em>tesoreria_transferencia_galicia_dolar_…</em> (Tipo, Fecha, Crédito, Débito e Id) o el cierre de caja (<em>cierre_CIERRE-…</em> o <em>cierre_DOL-…</em> con Caja = Transferencia Galicia Dolar y Moneda USD).</p>' +
          '<p>El Id evita duplicados y actualiza si cambió algún dato. Si un Id de tesorería abierta ya no viene, pasa a <strong>A eliminar</strong>. Apertura de Caja y filas Pendiente no se suben.</p>' +
          '<p>Al cargar el extracto, el saldo de corte se pesifica al MEP (fecha del último movimiento o cotización anterior) y entra a Saldos extractos. El match es por importe y fecha (máximo 4 días).</p>',
        btnBanco: 'Cargar extracto Galicia (USD)',
        btnSistema: 'Cargar tesorería Galicia (USD)',
        kpiBanco: 'Extracto Galicia (USD)'
      };
    }
    if (state.canal === CANAL_GAL) {
      return {
        hintHtml:
          '<p>Cargá el extracto de Galicia: Excel de cuenta corriente (<em>Extracto_CC…</em>) o el PDF <em>Extracto_Cuentas_Galicia_…</em> en pesos (no duplica lo ya cargado: misma fecha, importe y concepto, aunque cambie el saldo). El PDF en dólares se abre en la solapa Galicia (USD).</p>' +
          '<p>También la tesorería Transferencia Galicia (<em>tesoreria_transferencia_galicia_…</em>: Tipo, Fecha, Crédito, Débito e Id) o el Excel de cierre de caja (Fecha, Tipo, Monto e Id; p. ej. <em>cierre_CIERRE-…</em>). El Id evita duplicados y actualiza si cambió algún dato.</p>' +
          '<p>Si un Id de tesorería abierta ya no viene en el Excel, pasa a <strong>A eliminar</strong>. La columna Caja, si viene, define el canal. Apertura de Caja y filas Pendiente no se suben. Si el banco exporta de nuevo los mismos movimientos con otro saldo, no se duplican.</p>' +
          '<p>La app propone parejas por importe (tolerancia según el tamaño: centavos en montos chicos, $1/$10 en montos grandes) y concepto, solo si las fechas no difieren en más de 4 días. Si coinciden monto y fecha exactos, el criterio va en verde.</p>' +
          '<p>También podés conciliar a mano varios extractos con una o más tesorerías (con justificación, aunque la diferencia sea mayor a $1), o dos o más movimientos del mismo extracto si el crédito y el débito se compensan y no hay tesorería. El Excel exporta el listado visible con los filtros activos.</p>',
        btnBanco: 'Cargar extracto Galicia',
        btnSistema: 'Cargar tesorería Galicia',
        kpiBanco: 'Extracto Galicia (ARS)'
      };
    }
    return {
      hintHtml:
        '<p>Cargá el extracto de Mercado Pago (Número de Movimiento evita duplicados) y la tesorería del sistema (<em>tesoreria_mercadopago_…</em>: Tipo, Fecha, Crédito, Débito e Id) o el cierre de caja (Fecha, Tipo, Monto e Id; p. ej. <em>cierre_CIERRE-…</em> o <em>MP_CIERRE-…</em>).</p>' +
        '<p>El Id evita duplicados y actualiza si cambió algún dato. Si un Id de tesorería abierta ya no viene en el Excel, pasa a la solapa <strong>A eliminar</strong> para confirmar la baja. Apertura de Caja y filas Pendiente no se suben.</p>' +
        '<p>Los pares del extracto que se autoanulan (misma operación relacionada e importes opuestos) van a la solapa Anulados y no entran a la conciliación. En Solo banco podés marcar un movimiento como <strong>No requiere conciliación</strong> (con justificación): no se borra del extracto.</p>' +
        '<p>La app propone parejas por importe (tolerancia según el tamaño: centavos en montos chicos, $1/$10 en montos grandes) y concepto, solo si las fechas no difieren en más de 4 días. Si coinciden monto y fecha exactos, el criterio va en verde.</p>' +
        '<p>También podés conciliar a mano varios extractos con una o más tesorerías, o dos o más movimientos del mismo extracto si el crédito y el débito se compensan. El Excel exporta el listado visible con los filtros activos.</p>',
      btnBanco: 'Cargar extracto Mercado Pago',
      btnSistema: 'Cargar tesorería Mercado Pago',
      kpiBanco: 'Extracto MP'
    };
  }

  function renderCanal() {
    if (state.canal !== CANAL_MP && (state.lista === 'anulados' || state.lista === 'norequiere')) state.lista = 'sugeridos';
    syncFiltrosConOpciones();
    var k = kpis();
    var lab = labelsCanal();
    var canCargar = can(PERM_CARGAR);
    var listaHtml = '';
    if (state.lista === 'sugeridos') listaHtml = renderTablaSugeridos('sugerido');
    else if (state.lista === 'confirmados') listaHtml = renderTablaSugeridos('confirmado');
    else if (state.lista === 'banco') listaHtml = renderTablaSolo('banco');
    else if (state.lista === 'anulados') listaHtml = renderTablaAnulados();
    else if (state.lista === 'norequiere') listaHtml = renderTablaNoRequiere();
    else if (state.lista === 'bajas') listaHtml = renderTablaBajas();
    else listaHtml = renderTablaSolo('sistema');

    return FornitaliaHelp.row('tpl-cb-canal', 'Ayuda: ' + labelCanalNombre(state.canal), lab.hintHtml) +
      '<div class="cb-toolbar"><div class="cb-acciones">' +
        (canCargar ? '<button type="button" class="cb-btn cb-btn-navy" data-cb="up-banco"><span class="btn-icon">' + ICO.upload + '</span>' + esc(lab.btnBanco) + '</button>' : '') +
        (canCargar ? '<button type="button" class="cb-btn cb-btn-ghost" data-cb="up-sistema"><span class="btn-icon">' + ICO.upload + '</span>' + esc(lab.btnSistema) + '</button>' : '') +
        (can(PERM_CONFIRMAR) ? '<button type="button" class="cb-btn cb-btn-ghost" data-cb="manual"><span class="btn-icon">' + ICO.link + '</span>Conciliación manual</button>' : '') +
        ((canCargar || can(PERM_CONFIRMAR)) ? '<button type="button" class="cb-btn cb-btn-ghost" data-cb="recalc"><span class="btn-icon">' + ICO.refresh + '</span>Recalcular sugerencias</button>' : '') +
        (canCargar && state.lista === 'bajas' && k.bajas
          ? '<button type="button" class="cb-btn cb-btn-danger" data-cb="baja-all"><span class="btn-icon">' + ICO.trash + '</span>Eliminar visibles</button>'
          : '') +
        '<button type="button" class="cb-btn cb-btn-excel" data-cb="xlsx"><span class="btn-icon">' + ICO.download + '</span>Excel</button>' +
      '</div></div>' +
      (state.msg ? '<p class="cb-msg-ok">' + esc(state.msg) + '</p>' : '') +
      renderFiltros() +
      '<div class="cb-resumen">' +
        htmlResumenCard(lab.kpiBanco, k.banco, k.sumBanco) +
        htmlResumenCard('Tesorería', k.sistema, k.sumSistema) +
        htmlResumenCard('Sugeridos', k.sugeridos, k.sumSug) +
        htmlResumenCard('Confirmados', k.confirmados, k.sumConf) +
        htmlResumenCard('Solo banco', k.soloB, k.sumSoloB) +
        htmlResumenCard('Solo sistema', k.soloS, k.sumSoloS) +
        (state.canal === CANAL_MP
          ? htmlResumenCard('Anulados', k.anulados, k.sumAnul) +
            htmlResumenCard('No requiere', k.norequiere, k.sumNorequiere, '', 'norequiere', 'Ver movimientos que no requieren conciliación')
          : '') +
        htmlResumenCard('A eliminar', k.bajas, k.sumBajas, k.bajas ? 'cb-resumen-warn' : '', 'bajas', 'Ver tesorería a eliminar') +
      '</div>' +
      '<div class="cb-tabs">' +
        '<button type="button" class="' + (state.lista === 'sugeridos' ? 'activo' : '') + '" data-cb="lista" data-lista="sugeridos">Sugeridos</button>' +
        '<button type="button" class="' + (state.lista === 'confirmados' ? 'activo' : '') + '" data-cb="lista" data-lista="confirmados">Confirmados</button>' +
        '<button type="button" class="' + (state.lista === 'banco' ? 'activo' : '') + '" data-cb="lista" data-lista="banco">Solo banco</button>' +
        '<button type="button" class="' + (state.lista === 'sistema' ? 'activo' : '') + '" data-cb="lista" data-lista="sistema">Solo sistema</button>' +
        '<button type="button" class="' + (state.lista === 'bajas' ? 'activo' : '') + (k.bajas ? ' cb-tab-warn' : '') + '" data-cb="lista" data-lista="bajas">A eliminar' + (k.bajas ? ' (' + k.bajas + ')' : '') + '</button>' +
        (state.canal === CANAL_MP
          ? '<button type="button" class="' + (state.lista === 'anulados' ? 'activo' : '') + '" data-cb="lista" data-lista="anulados">Mercado Pago Anulados</button>' +
            '<button type="button" class="' + (state.lista === 'norequiere' ? 'activo' : '') + '" data-cb="lista" data-lista="norequiere">No requiere</button>'
          : '') +
      '</div>' +
      listaHtml;
  }

  function renderShell() {
    var el = root();
    if (!el) return;
    el.innerHTML =
      FornitaliaHelp.header(ICO.bank, 'Conciliación Bancaria', 'tpl-cb-intro', 'Ayuda: Conciliación Bancaria',
        '<p>Confrontá el extracto de cada medio con lo cargado en tesorería. Mercado Pago, Galicia (ARS) y Galicia (USD) usan el mismo flujo: extracto del banco + tesorería del sistema.</p>') +
      (state.loading ? '<p class="loading">Cargando conciliación…</p>' : '') +
      (state.err ? '<p class="cb-msg-err">' + esc(state.err) + '</p>' : '') +
      '<div class="cb-tabs">' +
        '<button type="button" class="' + (state.canal === CANAL_MP ? 'activo' : '') + '" data-cb="canal" data-canal="' + CANAL_MP + '">Mercado Pago</button>' +
        '<button type="button" class="' + (state.canal === CANAL_GAL ? 'activo' : '') + '" data-cb="canal" data-canal="' + CANAL_GAL + '">' + esc(LABEL_GAL) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_GAL_USD ? 'activo' : '') + '" data-cb="canal" data-canal="' + CANAL_GAL_USD + '">' + esc(LABEL_GAL_USD) + '</button>' +
      '</div>' +
      renderCanal();

    var q = el.querySelector('#cb-q');
    if (q) {
      q.addEventListener('input', function () {
        state.q = q.value;
        var pos = q.selectionStart;
        renderShell();
        var nq = root() && root().querySelector('#cb-q');
        if (nq) {
          nq.focus();
          try { nq.setSelectionRange(pos, pos); } catch (e2) { /* ignore */ }
        }
      });
    }
  }

  function onClick(ev) {
    var t = ev.target.closest && ev.target.closest('[data-cb]');
    if (!t) return;
    var rootEl = root();
    if (rootEl && !rootEl.contains(t) && !(state.modal && state.modal.contains(t)) && !(state.modalFiltros && state.modalFiltros.contains(t))) return;
    var a = t.getAttribute('data-cb');
    var id = t.getAttribute('data-id');
    if (a === 'canal') {
      state.canal = t.getAttribute('data-canal') || CANAL_MP;
      state.lista = 'sugeridos';
      state.mesExtracto = '';
      state.mesSistema = '';
      state.categoria = '';
      state.cuenta = '';
      recargarTodo();
      return;
    }
    if (a === 'filtros') { abrirModalFiltros('vista'); return; }
    if (a === 'lista') { state.lista = t.getAttribute('data-lista') || 'sugeridos'; renderShell(); return; }
    if (a === 'sort') { toggleSort(t.getAttribute('data-sort')); renderShell(); return; }
    if (a === 'up-banco') { onUpload('banco'); return; }
    if (a === 'up-sistema') { onUpload('sistema'); return; }
    if (a === 'recalc') { onRecalc(); return; }
    if (a === 'manual') { abrirManual(); return; }
    if (a === 'xlsx') { exportarExcel(); return; }
    if (a === 'ver') { abrirDetalleMatch(id); return; }
    if (a === 'ver-mov') { abrirDetalleMov(id); return; }
    if (a === 'ver-par-anulado') { abrirDetalleParAnulado(id); return; }
    if (a === 'del-mov') { borrarMovimientoSistema(id); return; }
    if (a === 'del-mov-banco') { borrarMovimientoBancoGalicia(id); return; }
    if (a === 'no-req') { abrirExcluirConciliacion(id); return; }
    if (a === 'no-req-undo') { deshacerExcluirConciliacion(id); return; }
    if (a === 'baja-ok') { confirmarBajaTesoreria(id); return; }
    if (a === 'baja-all') { confirmarBajasTesoreriaVisibles(); return; }
    if (a === 'ok-all') {
      var box = (t.tagName === 'INPUT') ? t : t.querySelector('input[type="checkbox"]');
      if (!box) return;
      if (!box.checked) return;
      var vis = filasVisiblesMatch('sugerido');
      if (!vis.length) { box.checked = false; return; }
      if (!confirm('¿Confirmar las ' + vis.length + ' sugerencias listadas?\n\nPasan a Confirmados. Si hay filtros, solo se confirman las visibles.')) {
        box.checked = false;
        return;
      }
      confirmarSugeridosVisibles(vis);
      return;
    }
    if (a === 'ok') { setEstado(id, 'confirmado'); return; }
    if (a === 'no') { setEstado(id, 'rechazado'); return; }
    if (a === 'undo') { setEstado(id, 'sugerido'); return; }
  }

  function ensureMounted() {
    var el = root();
    if (!el || state.mounted) return;
    el.classList.add('vista-cb');
    el.addEventListener('click', onClick);
    state.mounted = true;
  }

  function init(options) {
    opts = options || opts;
  }

  function show() {
    ensureMounted();
    recargarTodo();
  }

  global.FornitaliaConciliacionBancaria = {
    init: init,
    show: show
  };
})(window);
