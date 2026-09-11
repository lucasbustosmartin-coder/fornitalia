/**
 * Conciliación Bancaria – Fornitalia
 * Canales: Mercado Pago y Banco Galicia (extracto + tesorería).
 * window.FornitaliaConciliacionBancaria.init({ client, hasPerm, getRoot })
 */
(function (global) {
  'use strict';

  var ZONA_AR = 'America/Argentina/Buenos_Aires';
  var CANAL_MP = 'mercadopago';
  var CANAL_GAL = 'galicia';
  var PERM_VER = 'ver_conciliacion_bancaria';
  var PERM_CARGAR = 'cargar_conciliacion_bancaria';
  var PERM_CONFIRMAR = 'confirmar_conciliacion_bancaria';

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
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>'
  };

  var opts = { client: null, hasPerm: function () { return true; }, getRoot: function () { return null; } };
  var state = {
    mounted: false,
    loading: false,
    canal: CANAL_MP,
    lista: 'sugeridos',
    q: '',
    mes: '',
    concepto: '',
    sort: {
      sugeridos: { key: 'fecha_banco', dir: 'desc' },
      confirmados: { key: 'fecha_banco', dir: 'desc' },
      banco: { key: 'fecha', dir: 'desc' },
      sistema: { key: 'fecha', dir: 'desc' }
    },
    movimientos: [],
    matches: [],
    msg: '',
    err: '',
    modal: null,
    manual: { bancoIds: [], sistemaIds: [], qBanco: '', qSistema: '', mes: '', concepto: '', justif: '', sortBanco: { key: 'fecha', dir: 'desc' }, sortSistema: { key: 'fecha', dir: 'desc' } }
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
    var s = String(v).trim().replace(/\s/g, '').replace(/^\$/, '');
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
    return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function normHeader(h) {
    return String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
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

  function mismoImporte(a, b) {
    var na = Number(a);
    var nb = Number(b);
    if (!isFinite(na) || !isFinite(nb)) return false;
    return Math.round(Math.abs(na - nb) * 100) <= 100;
  }

  function countMismoImporte(arr, monto) {
    var n = 0;
    (arr || []).forEach(function (x) {
      if (mismoImporte(x.monto, monto)) n++;
    });
    return n;
  }

  function daysBetween(a, b) {
    if (!a || !b) return 9999;
    var pa = String(a).slice(0, 10).split('-').map(Number);
    var pb = String(b).slice(0, 10).split('-').map(Number);
    var da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
    var db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((da - db) / 86400000);
  }

  function movimientosCanal() {
    return (state.movimientos || []).filter(function (m) { return m.canal === state.canal; });
  }

  function bancoRows() {
    return movimientosCanal().filter(function (m) { return m.origen === 'banco'; });
  }

  function sistemaRows() {
    return movimientosCanal().filter(function (m) { return m.origen === 'sistema'; });
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
    var prefer = state.canal === CANAL_GAL
      ? ['Transferencia Galicia', 'Galicia']
      : ['MercadoPago', 'Mercado Pago'];
    var i;
    var j;
    for (i = 0; i < prefer.length; i++) {
      for (j = 0; j < names.length; j++) {
        if (names[j] === prefer[i]) return names[j];
      }
    }
    var needle = state.canal === CANAL_GAL ? 'galicia' : 'mercadopago';
    for (j = 0; j < names.length; j++) {
      if (normHeader(names[j]).indexOf(needle) >= 0) return names[j];
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

  function esFilaPieTesoreria(fechaRaw, tipo) {
    var f = String(fechaRaw || '').trim().toLowerCase();
    var t = String(tipo || '').trim().toLowerCase();
    if (!f && !t) return true;
    if (/^total\b/.test(f) || /^total\b/.test(t)) return true;
    if (/^\$/.test(f) || /^\$/.test(t)) return true;
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
    var esper = canalTab === CANAL_GAL ? 'Galicia' : 'MP';
    var ok = canalTab === CANAL_GAL ? prefN === 'galicia' : prefN === 'mp';
    if (ok) return '';
    return 'En ' + (canalTab === CANAL_GAL ? 'Banco Galicia' : 'Mercado Pago') +
      ' el cierre de caja tiene que llamarse ' + esper + '_… (primera palabra antes del _). ' +
      'Este archivo empieza por «' + (pref || 'sin _') + '».';
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
    if (blob.indexOf('galicia') >= 0) return CANAL_GAL;
    if (blob.indexOf('mercadopago') >= 0 || blob.indexOf('mercado pago') >= 0) return CANAL_MP;
    return state.canal;
  }

  function detectarArchivo(wb, archivo) {
    var det = detectarTipoExtracto(wb);
    if (det.tipo === 'mp') return { clase: 'banco', canal: CANAL_MP, hoja: det.hoja };
    if (det.tipo === 'galicia') return { clase: 'banco', canal: CANAL_GAL, hoja: det.hoja };
    var names = wb.SheetNames || [];
    var i;
    for (i = 0; i < names.length; i++) {
      var info = filasHoja(wb, names[i]);
      if (esMapaTesoreria(info.map) || esMapaTesoreriaCierre(info.map)) {
        return { clase: 'sistema', canal: detectarCanalTesoreria(wb, archivo), hoja: names[i] };
      }
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
        error: 'No reconocí el extracto de Galicia. Esperaba Fecha, Descripción, Débitos, Créditos y Saldo (p. ej. Extracto_CC…).',
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
      var base = ['gal', fecha, deb == null ? '' : deb, cred == null ? '' : cred, saldo == null ? '' : saldo, desc].join('|');
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
        moneda: 'ARS',
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

  function parseTesoreriaMp(wb, archivo, hoja) {
    var name = hoja || hojaTesoreria(wb, archivo);
    var sheet = wb.Sheets[name];
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (!rows.length) return { error: 'El Excel de tesorería no tiene filas.', filas: [] };
    var map = mapHeaders(rows[0]);
    var esCierre = esMapaTesoreriaCierre(map);
    if (!esMapaTesoreria(map) && !esCierre) {
      return {
        error: state.canal === CANAL_GAL
          ? 'No reconocí la tesorería de Galicia. Esperaba Tipo, Fecha, Crédito, Débito (p. ej. tesoreria_transferencia_galicia) o el cierre de caja (Fecha, Tipo, Monto).'
          : 'No reconocí la tesorería de Mercado Pago. Esperaba Tipo, Fecha, Crédito, Débito o el cierre de caja (Fecha, Tipo, Monto; p. ej. cierre_CIERRE-…).',
        filas: []
      };
    }
    var counts = {};
    var filas = [];
    var omitidasApertura = 0;
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
      }
      if (!tipo && !fecha && cred == null && deb == null) continue;
      if (esCierre && cred == null && deb == null) continue;
      var monto = 0;
      if (cred != null && cred !== 0) monto = cred;
      else if (deb != null && deb !== 0) monto = -Math.abs(deb);
      var base = esCierre
        ? [tipo, fecha, desc, cliente, cred == null ? '' : cred, deb == null ? '' : deb].join('|')
        : [tipo, fecha, hora, desc, cliente, cred == null ? '' : cred, deb == null ? '' : deb, saldo == null ? '' : saldo].join('|');
      counts[base] = (counts[base] || 0) + 1;
      var origenId = 'tes|' + base + '#' + counts[base];
      var fechaHora = null;
      if (fecha) fechaHora = fecha + 'T' + (hora || '00:00') + ':00-03:00';
      filas.push({
        origen_id: origenId,
        fecha: fecha || fechaHoyYmd(),
        fecha_hora: fechaHora,
        tipo: tipo || null,
        descripcion: desc || null,
        contraparte: cliente || null,
        monto: Math.round(monto * 100) / 100,
        moneda: monedaFila || 'ARS',
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
          formato: esCierre ? 'cierre' : 'tesoreria'
        }
      });
    }
    if (!filas.length) {
      return {
        error: omitidasApertura
          ? 'El archivo solo tenía Apertura de Caja; ese tipo no se carga.'
          : 'No encontré filas de tesorería para cargar.',
        filas: [],
        omitidasApertura: omitidasApertura
      };
    }
    return { error: null, filas: filas, omitidasApertura: omitidasApertura, formatoCierre: esCierre };
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
    var tagsB = tagsConcepto(tb);
    var tagsS = tagsConcepto(ts);
    var tax = { sircreb: 1, iibb: 1, iva: 1, ganancias: 1, ley25413: 1 };
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

  function candidatosMonto(b, S, usedS, rejected, ventana) {
    return S.filter(function (s) {
      if (usedS[s.id] || !mismoImporte(s.monto, b.monto) || rejected[b.id + '|' + s.id]) return false;
      var d = Math.abs(daysBetween(b.fecha, s.fecha));
      if (ventana === 'cerca') return d <= 14;
      if (ventana === 'lejos') return d > 14;
      return true;
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
    if (scoreDescripcion(b, best) < 0) return null;
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

  function criterioPorDesc(b, s, d, ambiguo, lejos) {
    var sc = scoreDescripcion(b, s);
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

    function pairar(b, s, ambiguo, lejos) {
      if (!s) return false;
      var d = Math.abs(daysBetween(b.fecha, s.fecha));
      var sc = scoreDescripcion(b, s);
      var base = 50;
      if (d === 0) base = 100;
      else if (d <= 7) base = 90;
      else if (d <= 14) base = 70;
      else base = 40;
      if (sc >= 50) base += 10;
      if (ambiguo && sc < 50) base -= 10;
      return tryPair(b, s, base, criterioPorDesc(b, s, d, ambiguo, lejos || d > 14));
    }

    bancosOrdenConcepto(B, S).forEach(function (b) {
      if (usedB[b.id]) return;
      if (countMismoImporte(B, b.monto) !== 1 || countMismoImporte(S, b.monto) !== 1) return;
      var s = elegirCandidato(b, candidatosMonto(b, S, usedS, rejected, 'todas'));
      if (!s) return;
      pairar(b, s, false, Math.abs(daysBetween(b.fecha, s.fecha)) > 14);
    });

    bancosOrdenConcepto(B, S).forEach(function (b) {
      if (usedB[b.id]) return;
      var cands = candidatosMonto(b, S, usedS, rejected, 'todas').filter(function (s) {
        return scoreDescripcion(b, s) >= 50;
      });
      var s = elegirCandidato(b, cands);
      if (!s) return;
      pairar(b, s, cands.length > 1, Math.abs(daysBetween(b.fecha, s.fecha)) > 14);
    });

    bancosOrdenConcepto(B, S).forEach(function (b) {
      if (usedB[b.id]) return;
      var cands = candidatosMonto(b, S, usedS, rejected, 'cerca');
      var s = elegirCandidato(b, cands);
      if (!s) return;
      pairar(b, s, cands.length > 1, false);
    });

    bancosOrdenConcepto(B, S).forEach(function (b) {
      if (usedB[b.id]) return;
      var cands = candidatosMonto(b, S, usedS, rejected, 'lejos');
      var s = elegirCandidato(b, cands);
      if (!s) return;
      pairar(b, s, cands.length > 1, true);
    });

    bancosOrdenConcepto(B, S).forEach(function (b) {
      if (usedB[b.id]) return;
      var cands = candidatosMonto(b, S, usedS, rejected, 'todas');
      if (cands.length !== 1) return;
      var s = elegirCandidato(b, cands);
      if (!s) return;
      pairar(b, s, false, Math.abs(daysBetween(b.fecha, s.fecha)) > 14);
    });

    return out;
  }

  var SUPABASE_PAGE = 1000;

  async function fetchAllCanal(table, orderCols) {
    var all = [];
    var offset = 0;
    for (;;) {
      var q = client().from(table).select('*').eq('canal', state.canal);
      (orderCols || []).forEach(function (col) {
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
      normTxt(m && m.contraparte)
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

  async function guardarFilas(origen, filas) {
    var chunk = 250;
    var total = 0;
    for (var i = 0; i < filas.length; i += chunk) {
      var parte = filas.slice(i, i + chunk);
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

  async function regenerarSugerencias() {
    var sugeridas = generarSugerencias(bancoRows(), sistemaRows(), state.matches);
    var rpc = await client().rpc('cb_reemplazar_sugerencias', {
      p_canal: state.canal,
      p_filas: sugeridas
    });
    if (rpc.error) throw rpc.error;
    return Number(rpc.data || 0);
  }

  async function recargarTodo() {
    state.loading = true;
    renderShell();
    try {
      await cargarDatos();
      state.err = '';
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
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    pedirArchivo('.xlsx', async function (file) {
      state.loading = true;
      state.err = '';
      state.msg = '';
      renderShell();
      try {
        var wb = await leerExcelFile(file);
        var parsed;
        var canalAntes = state.canal;
        var origenPedido = origen;
        var detArch = detectarArchivo(wb, file.name);
        var esCierreTes = false;
        if (detArch.clase === 'sistema' && detArch.hoja) {
          esCierreTes = esMapaTesoreriaCierre(filasHoja(wb, detArch.hoja).map);
        }
        if (esCierreTes) {
          var errPref = errorPrefijoCierreCanal(file.name, canalAntes);
          if (errPref) {
            state.canal = canalAntes;
            throw new Error(errPref);
          }
          origen = 'sistema';
          state.canal = canalAntes;
        } else if (detArch.clase === 'banco' || detArch.clase === 'sistema') {
          origen = detArch.clase === 'banco' ? 'banco' : 'sistema';
          state.canal = detArch.canal;
        }
        if (origen === 'banco') {
          if (state.canal === CANAL_GAL) parsed = parseExtractoGalicia(wb, file.name, detArch.hoja);
          else parsed = parseExtractoMp(wb, file.name, detArch.hoja);
        } else {
          parsed = parseTesoreriaMp(wb, file.name, detArch.hoja);
        }
        if (parsed.error) {
          state.canal = canalAntes;
          throw new Error(parsed.error);
        }
        await cargarDatos();
        var nLeidas = parsed.filas.length;
        var nYaContenido = 0;
        if (origen === 'sistema') {
          var filDup = filtrarTesoreriaYaCargada(parsed.filas);
          parsed.filas = filDup.filas;
          nYaContenido = filDup.nYa;
        }
        var nAntes = countOrigen(origen);
        if (parsed.filas.length) await guardarFilas(origen, parsed.filas);
        await cargarDatos();
        var nDespues = countOrigen(origen);
        var nNuevos = Math.max(0, nDespues - nAntes);
        var nYa = Math.max(0, nLeidas - nNuevos);
        var nSug = 0;
        if (bancoRows().length && sistemaRows().length) nSug = await regenerarSugerencias();
        await cargarDatos();
        var extraCanal = state.canal !== canalAntes
          ? (state.canal === CANAL_GAL ? ' Lo dejé en la solapa Banco Galicia.' : ' Lo dejé en la solapa Mercado Pago.')
          : '';
        var extraOrigen = origen !== origenPedido
          ? (origen === 'sistema' ? ' Detecté tesorería del sistema.' : ' Detecté extracto del banco.')
          : '';
        var extraDup = nNuevos
          ? (nYa ? ' ' + nNuevos + ' nuevas; ' + nYa + ' ya estaban (no se duplican).' : ' ' + nNuevos + ' nuevas.')
          : ' Ninguna nueva: las ' + nLeidas + ' ya estaban (no se duplican).';
        extraDup += ' No se borró ningún movimiento anterior.';
        if (nYaContenido) {
          extraDup += ' ' + nYaContenido + ' coincidían con tesorería ya cargada (misma fecha, monto, descripción, categoría y cliente).';
        }
        if (parsed.formatoCierre) {
          extraDup = ' Cierre de caja (caja ya cerrada).' + extraDup;
        }
        if (parsed.omitidasApertura) {
          extraDup += ' Se omitieron ' + parsed.omitidasApertura + ' Apertura de Caja (no se cargan).';
        }
        var extraSug = nSug ? ' Sugerencias: ' + nSug + '.' : '';
        if (origen === 'banco' && state.canal === CANAL_GAL) {
          state.msg = 'Extracto Galicia: ' + nLeidas + ' filas leídas (clave fecha + débito/crédito + saldo).' + extraDup + extraOrigen + extraCanal + extraSug;
        } else if (origen === 'banco') {
          state.msg = 'Extracto Mercado Pago: ' + nLeidas + ' filas leídas (Número de Movimiento).' + extraDup + extraOrigen + extraCanal + extraSug;
        } else if (state.canal === CANAL_GAL) {
          state.msg = 'Tesorería Galicia: ' + nLeidas + ' filas leídas.' + extraDup + extraOrigen + extraCanal + extraSug;
        } else {
          state.msg = 'Tesorería Mercado Pago: ' + nLeidas + ' filas leídas.' + extraDup + extraOrigen + extraCanal + extraSug;
        }
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
      if (!confirm('¿Deshacer esta conciliación confirmada? La pareja vuelve a Sugeridos.')) return;
    }
    try {
      var rpc = await client().rpc('cb_set_match_estado', { p_match_id: id, p_estado: estado });
      if (rpc.error) throw rpc.error;
      cerrarModal();
      if (estado === 'sugerido') {
        state.msg = 'Conciliación deshecha: la pareja volvió a Sugeridos.';
        state.lista = 'sugeridos';
      }
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

  function mesYYYYMM(ymd) {
    var s = String(ymd || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(s) ? s : '';
  }

  function formatMesLabel(ym) {
    var p = String(ym || '').split('-');
    if (p.length < 2) return String(ym || '');
    return p[1] + '/' + p[0];
  }

  function opcionesMes() {
    var set = {};
    movimientosCanal().forEach(function (m) {
      var ym = mesYYYYMM(m.fecha);
      if (ym) set[ym] = true;
    });
    return Object.keys(set).sort().reverse();
  }

  function opcionesConcepto() {
    var set = {};
    bancoRows().forEach(function (m) {
      var t = String(m.tipo || '').trim();
      if (t) set[t] = true;
    });
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
  }

  function syncFiltrosConOpciones() {
    var meses = opcionesMes();
    if (state.mes && meses.indexOf(state.mes) < 0) state.mes = '';
    var cons = opcionesConcepto();
    if (state.concepto && cons.indexOf(state.concepto) < 0) state.concepto = '';
  }

  function hayFiltrosActivos() {
    return !!(state.mes || state.concepto || (state.q || '').trim());
  }

  function pasaFiltroMes(fecha) {
    if (!state.mes) return true;
    return mesYYYYMM(fecha) === state.mes;
  }

  function pasaFiltroConceptoBanco(m) {
    if (!state.concepto) return true;
    return String(m && m.tipo || '').trim() === state.concepto;
  }

  function pasaFiltrosMatch(match) {
    var bs = movsMatchLado(match, 'banco');
    var ss = movsMatchLado(match, 'sistema');
    var blob = bs.concat(ss).map(blobMov).join(' ') + ' ' + criterioLabel(match.criterio) + ' ' + (match.justificacion || '');
    if (!pasaFiltro(blob)) return false;
    if (state.mes && !bs.some(function (b) { return pasaFiltroMes(b && b.fecha); })) return false;
    if (state.concepto && !bs.some(function (b) { return pasaFiltroConceptoBanco(b); })) return false;
    return true;
  }

  function pasaFiltrosMov(m, origen) {
    if (!pasaFiltro(blobMov(m))) return false;
    if (!pasaFiltroMes(m && m.fecha)) return false;
    if (origen === 'banco' && !pasaFiltroConceptoBanco(m)) return false;
    return true;
  }

  function kpis() {
    var b = bancoRows().filter(function (x) { return pasaFiltrosMov(x, 'banco'); });
    var s = sistemaRows().filter(function (x) { return pasaFiltrosMov(x, 'sistema'); });
    var sug = 0;
    var conf = 0;
    var usedB = {};
    var usedS = {};
    (state.matches || []).forEach(function (m) {
      if (m.estado === 'sugerido' || m.estado === 'confirmado') {
        idsMatchLado(m, 'banco').forEach(function (id) { usedB[id] = true; });
        idsMatchLado(m, 'sistema').forEach(function (id) { usedS[id] = true; });
      }
      if (!pasaFiltrosMatch(m)) return;
      if (m.estado === 'sugerido') sug++;
      if (m.estado === 'confirmado') conf++;
    });
    var soloB = b.filter(function (x) { return !usedB[x.id]; }).length;
    var soloS = s.filter(function (x) { return !usedS[x.id]; }).length;
    return { banco: b.length, sistema: s.length, sugeridos: sug, confirmados: conf, soloB: soloB, soloS: soloS };
  }

  function idsUsadosActivos() {
    var usedB = {};
    var usedS = {};
    (state.matches || []).forEach(function (m) {
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
      if (m.estado === 'confirmado') {
        idsMatchLado(m, 'banco').forEach(function (id) { usedB[id] = true; });
        idsMatchLado(m, 'sistema').forEach(function (id) { usedS[id] = true; });
      }
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
    if (Array.isArray(arr) && arr.length) arr.forEach(push);
    else push(primary);
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

  function valoresCampo(movs, campo) {
    var vals = [];
    (movs || []).forEach(function (x) {
      var v = String((x && x[campo]) || '').trim();
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

  function diffMatch(m, b, s) {
    if (m && m.diferencia != null && m.diferencia !== '') {
      var d = Number(m.diferencia);
      if (isFinite(d)) return Math.round(d * 100) / 100;
    }
    if (m) {
      var sb = sumaMontos(movsMatchLado(m, 'banco'));
      var ss = sumaMontos(movsMatchLado(m, 'sistema'));
      if (sb != null && ss != null) return Math.round((sb - ss) * 100) / 100;
    }
    var nb = Number(b && b.monto);
    var ns = Number(s && s.monto);
    if (!isFinite(nb) || !isFinite(ns)) return null;
    return Math.round((nb - ns) * 100) / 100;
  }

  function hayFiltrosManualActivos() {
    var m = state.manual || {};
    return !!(m.mes || m.concepto || (m.qBanco || '').trim() || (m.qSistema || '').trim());
  }

  function movLibreManual(origen) {
    var ids = idsConfirmados();
    var used = origen === 'banco' ? ids.usedB : ids.usedS;
    var q = origen === 'banco' ? (state.manual.qBanco || '') : (state.manual.qSistema || '');
    q = q.trim().toLowerCase();
    var mes = state.manual.mes || '';
    var concepto = state.manual.concepto || '';
    var sels = idsSelManual(origen);
    return (origen === 'banco' ? bancoRows() : sistemaRows()).filter(function (m) {
      if (used[m.id]) return false;
      if (esApertura(m)) return false;
      if (sels.indexOf(m.id) >= 0) return true;
      if (mes && mesYYYYMM(m.fecha) !== mes) return false;
      if (origen === 'banco' && concepto && String(m.tipo || '').trim() !== concepto) return false;
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
    var v = Number(n);
    var cls = v > 0 ? 'cb-monto-pos' : (v < 0 ? 'cb-monto-neg' : '');
    return '<span class="cb-col-monto ' + cls + '">' + esc(formatMonto(n)) + '</span>';
  }

  function btnIcon(action, id, title, svg, extraCls) {
    return '<button type="button" class="cb-btn cb-btn-ghost cb-btn-icon-only ' + (extraCls || '') + '" data-cb="' + esc(action) + '" data-id="' + esc(id) + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"><span class="btn-icon">' + svg + '</span></button>';
  }

  function criterioLabel(c) {
    var map = {
      monto_y_fecha: 'Mismo monto y fecha',
      monto_y_fecha_concepto: 'Mismo monto, fecha y concepto',
      monto_unico: 'Monto único (fecha distinta)',
      monto_fecha_cercana: 'Mismo monto, fecha cercana',
      monto_fecha_cercana_ambiguo: 'Mismo monto, fecha cercana (hay otros iguales)',
      monto_fecha_cercana_concepto: 'Mismo importe, fecha cercana y concepto',
      monto_fecha_lejana: 'Mismo importe, fecha lejana',
      monto_fecha_lejana_ambiguo: 'Mismo importe, fecha lejana (hay otros iguales)',
      monto_fecha_lejana_concepto: 'Mismo importe, fecha lejana y concepto',
      monto_sin_fecha: 'Mismo monto',
      manual: 'Conciliación manual'
    };
    return map[c] || c || 'Sugerido';
  }

  function blobMov(m) {
    if (!m) return '';
    return [m.fecha, m.tipo, m.descripcion, m.contraparte, m.origen_id, m.id_movimiento_banco, m.monto, m.categoria, m.cuenta_contable].join(' ');
  }

  function sortActual() {
    if (!state.sort[state.lista]) {
      state.sort[state.lista] = (state.lista === 'banco' || state.lista === 'sistema')
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
    if (key === 'banco') return { v: labelGrupo(bs, true), t: 'txt' };
    if (key === 'monto_banco') return { v: sumaMontos(bs), t: 'num' };
    if (key === 'fecha_sistema') return { v: fechaGrupo(ss), t: 'fecha' };
    if (key === 'sistema') return { v: labelGrupo(ss, false), t: 'txt' };
    if (key === 'categoria_sistema') return { v: labelCampoGrupo(ss, 'categoria'), t: 'txt' };
    if (key === 'cuenta_sistema') return { v: labelCampoGrupo(ss, 'cuenta_contable'), t: 'txt' };
    if (key === 'monto_sistema') return { v: sumaMontos(ss), t: 'num' };
    if (key === 'criterio') return { v: criterioLabel(m.criterio), t: 'txt' };
    return { v: fechaGrupo(bs), t: 'fecha' };
  }

  function valSolo(m, key) {
    if (key === 'tipo') return { v: m.tipo, t: 'txt' };
    if (key === 'concepto') return { v: m.tipo || m.descripcion, t: 'txt' };
    if (key === 'descripcion') return { v: m.descripcion, t: 'txt' };
    if (key === 'contraparte') return { v: m.contraparte, t: 'txt' };
    if (key === 'monto') return { v: m.monto, t: 'num' };
    if (key === 'sugerido') return { v: matchSugeridoDe(m.id) ? 1 : 0, t: 'num' };
    if (key === 'id') return { v: m.id_movimiento_banco || m.origen_id, t: 'txt' };
    return { v: m.fecha, t: 'fecha' };
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

  function htmlCriterioBadge(m, estado) {
    var manual = esMatchManual(m);
    var cls = manual ? 'cb-badge-manual' : (estado === 'confirmado' ? 'cb-badge-ok' : 'cb-badge-warn');
    var bs = movsMatchLado(m, 'banco');
    var ss = movsMatchLado(m, 'sistema');
    var d = diffMatch(m);
    var extra = '';
    if (esGrupoMatch(m)) {
      extra += ' <span class="cb-badge cb-badge-manual">' + bs.length + '×' + ss.length + '</span>';
    }
    if (d != null && Math.round(Math.abs(d) * 100) > 100) {
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
    var rows = (state.matches || []).filter(function (m) {
      return m.estado === estado && pasaFiltrosMatch(m);
    });
    rows = ordenarFilas(rows, valMatch);
    var html = '';
    rows.forEach(function (m) {
      var bs = movsMatchLado(m, 'banco');
      var ss = movsMatchLado(m, 'sistema');
      html += '<tr>' +
        '<td>' + formatFecha(fechaGrupo(bs)) + '</td>' +
        '<td>' + esc(labelGrupo(bs, true)) + '</td>' +
        '<td class="cb-col-monto">' + htmlMonto(sumaMontos(bs)) + '</td>' +
        '<td>' + formatFecha(fechaGrupo(ss)) + '</td>' +
        '<td>' + esc(labelGrupo(ss, false)) + '</td>' +
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
    return '<div class="cb-tabla-wrap"><table class="cb-tabla">' +
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
    var list = (origen === 'banco' ? bancoRows() : sistemaRows()).filter(function (m) {
      return !used[m.id] && pasaFiltrosMov(m, origen);
    });
    list = ordenarFilas(list, valSolo);
    var html = '';
    list.forEach(function (m) {
      html += '<tr>' +
        '<td>' + formatFecha(m.fecha) + '</td>' +
        '<td>' + esc(m.tipo || '—') + '</td>' +
        '<td>' + esc(m.descripcion || '—') + '</td>' +
        '<td>' + esc(m.contraparte || '—') + '</td>' +
        '<td class="cb-col-monto">' + htmlMonto(m.monto) + '</td>' +
        '<td>' + esc(m.id_movimiento_banco || m.origen_id || '—') + '</td>' +
        '<td class="cb-col-acc">' +
          btnIcon('ver-mov', m.id, 'Ver detalle del movimiento', ICO.eye) +
          (origen === 'sistema' && can(PERM_CARGAR)
            ? btnIcon('del-mov', m.id, 'Eliminar movimiento de tesorería', ICO.trash, 'cb-btn-danger')
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
        thSort('monto', 'Importe', 'cb-col-monto') +
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
      dlCampo('Categoría', m.categoria) +
      dlCampo('Cuenta contable', m.cuenta_contable) +
      dlCampo('Crédito', m.credito != null ? formatMonto(m.credito) : '') +
      dlCampo('Débito', m.debito != null ? formatMonto(m.debito) : '') +
      dlCampo('Saldo', m.saldo != null ? formatMonto(m.saldo) : '') +
      dlCampo(state.canal === CANAL_GAL ? 'N° comprobante Galicia' : 'N° movimiento MP', m.id_movimiento_banco) +
      dlCampo('Operación relacionada', m.id_operacion_relacionada) +
      dlCampo('ID origen', m.origen_id) +
      dlCampo('Archivo', m.archivo) +
      dlCampo('Fila Excel', m.fila_excel) +
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
      (esGrupoMatch(m) ? ' · grupo ' + bs.length + ' extractos × ' + ss.length + ' tesorería' : '') + '</p>';
    if (d != null) {
      meta += '<p class="cb-field-hint">Diferencia (suma extracto − suma tesorería): <strong>' + esc(formatMonto(d)) + '</strong></p>';
    }
    if (m.justificacion) {
      meta += '<p class="cb-field-hint">Justificación: ' + esc(m.justificacion) + '</p>';
    }
    if (m.confirmado_at) {
      meta += '<p class="cb-field-hint">Confirmado: ' + esc(formatFecha(isoAFechaArgentina(m.confirmado_at))) + '</p>';
    }
    var titB = state.canal === CANAL_GAL ? 'Banco Galicia (extracto)' : 'Mercado Pago (extracto)';
    var bloquesB = bs.length ? bs.map(function (x, i) {
      return htmlDetalleMov(x, bs.length > 1 ? titB + ' (' + (i + 1) + '/' + bs.length + ')' : titB);
    }).join('') : htmlDetalleMov(null, titB);
    var bloquesS = ss.length ? ss.map(function (x, i) {
      return htmlDetalleMov(x, ss.length > 1 ? 'Tesorería (sistema) (' + (i + 1) + '/' + ss.length + ')' : 'Tesorería (sistema)');
    }).join('') : htmlDetalleMov(null, 'Tesorería (sistema)');
    abrirModal(
      'Detalle de conciliación',
      meta +
      '<div class="cb-detalle' + (bs.length + ss.length > 2 ? ' cb-detalle-grupo' : '') + '">' + bloquesB + bloquesS + '</div>',
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

  function abrirModal(titulo, bodyHtml, footerHtml, extraCls) {
    cerrarModal();
    var bd = document.createElement('div');
    bd.className = 'cb-modal-backdrop';
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
      if (ev.key === 'Escape') { ev.preventDefault(); cerrarModal(); }
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
  }

  function cerrarModal() {
    if (state.modal) {
      if (state.modal._cbEsc) document.removeEventListener('keydown', state.modal._cbEsc);
      if (state.modal.parentNode) state.modal.parentNode.removeChild(state.modal);
    }
    state.modal = null;
  }

  function htmlPickTabla(origen) {
    var list = ordenarFilas(movLibreManual(origen), valSolo, sortManual(origen));
    var sels = idsSelManual(origen);
    var action = origen === 'banco' ? 'pick-banco' : 'pick-sistema';
    var html = '';
    list.forEach(function (m) {
      var sug = matchSugeridoDe(m.id);
      var sel = sels.indexOf(m.id) >= 0;
      html += '<tr class="cb-pick-row' + (sel ? ' cb-pick-sel' : '') + '" data-cb="' + action + '" data-id="' + esc(m.id) + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
        '<td class="cb-pick-check" aria-hidden="true">' + (sel ? '✓' : '') + '</td>' +
        '<td>' + formatFecha(m.fecha) + '</td>' +
        '<td>' + esc(m.tipo || m.descripcion || '—') + '</td>' +
        '<td class="cb-col-monto">' + htmlMonto(m.monto) + '</td>' +
        '<td>' + (sug ? '<span class="cb-badge cb-badge-warn">Sugerido</span>' : '') + '</td>' +
      '</tr>';
    });
    if (!html) {
      var hayFiltro = !!(state.manual.mes || (origen === 'banco' && state.manual.concepto) ||
        ((origen === 'banco' ? state.manual.qBanco : state.manual.qSistema) || '').trim());
      return '<p class="cb-empty">No hay movimientos disponibles' + (hayFiltro ? ' con esos filtros.' : '.') + '</p>';
    }
    return '<div class="cb-tabla-wrap cb-pick-wrap"><table class="cb-tabla">' +
      '<thead><tr>' +
        '<th class="cb-pick-check" aria-hidden="true"></th>' +
        thSortManual(origen, 'fecha', 'Fecha') +
        thSortManual(origen, 'concepto', 'Concepto') +
        thSortManual(origen, 'monto', 'Importe', 'cb-col-monto') +
        thSortManual(origen, 'sugerido', 'Estado') +
      '</tr></thead>' +
      '<tbody>' + html + '</tbody></table></div>';
  }

  function htmlFiltrosManual() {
    var meses = opcionesMes();
    var conceptos = opcionesConcepto();
    var mesOpts = '<option value="">Todos los meses</option>';
    meses.forEach(function (ym) {
      mesOpts += '<option value="' + esc(ym) + '"' + (state.manual.mes === ym ? ' selected' : '') + '>' + esc(formatMesLabel(ym)) + '</option>';
    });
    var conOpts = '<option value="">Todos los conceptos</option>';
    conceptos.forEach(function (c) {
      conOpts += '<option value="' + esc(c) + '"' + (state.manual.concepto === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    var mesOn = !!state.manual.mes;
    var conOn = !!state.manual.concepto;
    return '<div class="cb-filtros cb-manual-filtros">' +
      (hayFiltrosManualActivos() ? '<span class="cb-filtros-flag" title="Hay filtros aplicados en este modal">Filtros activos</span>' : '') +
      '<div class="form-group' + (mesOn ? ' cb-filtro-activo' : '') + '"><label for="cb-manual-mes">Mes</label>' +
      '<select id="cb-manual-mes" title="Filtrar extracto y tesorería por mes">' + mesOpts + '</select></div>' +
      '<div class="form-group' + (conOn ? ' cb-filtro-activo' : '') + '"><label for="cb-manual-concepto">Concepto del extracto</label>' +
      '<select id="cb-manual-concepto" title="Filtrar el extracto por concepto">' + conOpts + '</select></div>' +
    '</div>';
  }

  function htmlManualBody() {
    var banks = idsSelManual('banco').map(findMov).filter(Boolean);
    var sist = idsSelManual('sistema').map(findMov).filter(Boolean);
    var sumB = sumaMontos(banks);
    var sumS = sumaMontos(sist);
    var d = (banks.length && sist.length && sumB != null && sumS != null)
      ? Math.round((sumB - sumS) * 100) / 100
      : null;
    var absD = d != null ? Math.abs(d) : 0;
    var warn = absD > 1;
    var diffHtml = '';
    if (banks.length && sist.length) {
      diffHtml = '<div class="cb-diff-box' + (warn ? ' warn' : '') + '">' +
        '<strong>Extracto (' + banks.length + '):</strong> ' + esc(formatMonto(sumB)) +
        ' &nbsp;·&nbsp; <strong>Tesorería (' + sist.length + '):</strong> ' + esc(formatMonto(sumS)) +
        ' &nbsp;·&nbsp; <strong>Diferencia:</strong> ' + esc(formatMonto(d)) +
        (warn
          ? '<br>La diferencia es mayor a $1. Queda registrada junto con la justificación.'
          : '<br>Aunque el importe coincida (o difiera hasta $1), el grupo queda como conciliación manual.') +
      '</div>';
    } else {
      diffHtml = '<div class="cb-diff-box">Elegí uno o más movimientos del extracto y uno o más de tesorería (clic para sumar o quitar). Si alguno está en Sugeridos, esa sugerencia se reemplaza al confirmar.</div>';
    }
    var nB = movLibreManual('banco').length;
    var nS = movLibreManual('sistema').length;
    var selB = banks.length;
    var selS = sist.length;
    return '<p class="cb-field-hint">Podés conciliar varios extractos con una o más tesorerías. La diferencia es la suma del extracto menos la suma de tesorería. La justificación, los importes y quién confirmó quedan guardados. Mes y concepto son los mismos filtros de la vista; si ya los tenías aplicados, arrancan acá.</p>' +
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
      '<textarea id="cb-manual-just" class="cb-just-area" maxlength="800" placeholder="Ej.: comisión MP no reflejada en tesorería; mismo pago con distinto importe por redondeo; compensación de dos operaciones.">' + esc(state.manual.justif) + '</textarea>';
  }

  function bindManualInputs() {
    if (!state.modal) return;
    var qb = state.modal.querySelector('#cb-manual-qb');
    var qs = state.modal.querySelector('#cb-manual-qs');
    var ju = state.modal.querySelector('#cb-manual-just');
    var mesEl = state.modal.querySelector('#cb-manual-mes');
    var conEl = state.modal.querySelector('#cb-manual-concepto');
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
    if (mesEl) {
      mesEl.addEventListener('change', function () {
        state.manual.mes = mesEl.value || '';
        refreshManualModal();
      });
    }
    if (conEl) {
      conEl.addEventListener('change', function () {
        state.manual.concepto = conEl.value || '';
        refreshManualModal();
      });
    }
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
    var mesEl = state.modal.querySelector('#cb-manual-mes');
    if (mesEl) state.manual.mes = mesEl.value || '';
    var conEl = state.modal.querySelector('#cb-manual-concepto');
    if (conEl) state.manual.concepto = conEl.value || '';
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
      mes: state.mes || '',
      concepto: state.concepto || '',
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
    if (!bancoIds.length || !sistemaIds.length) {
      alert('Elegí al menos un movimiento del extracto y uno de tesorería.');
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
      state.msg = 'Conciliación manual confirmada. La justificación y la diferencia quedaron registradas.';
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
    return 'Sugeridos';
  }

  function canalLabel() {
    return state.canal === CANAL_GAL ? 'Banco Galicia' : 'Mercado Pago';
  }

  function filasVisiblesMatch(estado) {
    var rows = (state.matches || []).filter(function (m) {
      return m.estado === estado && pasaFiltrosMatch(m);
    });
    return ordenarFilas(rows, valMatch);
  }

  function filasVisiblesSolo(origen) {
    var ids = idsUsadosActivos();
    var used = origen === 'banco' ? ids.usedB : ids.usedS;
    var list = (origen === 'banco' ? bancoRows() : sistemaRows()).filter(function (m) {
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
    var headerRow = 7;
    var aoa = [
      ['Conciliación Bancaria — ' + canalLabel()],
      ['Listado', listaLabel()],
      ['Filtro mes', state.mes ? formatMesLabel(state.mes) : 'Todos'],
      ['Filtro concepto extracto', state.concepto || 'Todos'],
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
          excelDate(fechaGrupo(bs)),
          textoGrupo(bs, true),
          excelNum(sumaMontos(bs)),
          excelDate(fechaGrupo(ss)),
          textoGrupo(ss, false),
          textoCampoGrupo(ss, 'categoria'),
          textoCampoGrupo(ss, 'cuenta_contable'),
          excelNum(sumaMontos(ss)),
          excelNum(diffMatch(m)),
          criterioLabel(m.criterio) + (esGrupoMatch(m) ? ' (' + bs.length + '×' + ss.length + ')' : ''),
          m.justificacion || '',
          m.estado || '',
          idsOrigenGrupo(bs),
          idsOrigenGrupo(ss)
        ]);
      });
    } else {
      aoa.push(['Fecha', 'Tipo', 'Descripción', 'Contraparte', 'Importe', 'ID']);
      dateCols = [0];
      numCols = [4];
      cols = [{ wch: 12 }, { wch: 22 }, { wch: 40 }, { wch: 24 }, { wch: 14 }, { wch: 28 }];
      var origen = state.lista === 'banco' ? 'banco' : 'sistema';
      var movs = filasVisiblesSolo(origen);
      if (!movs.length) {
        alert('No hay filas visibles con los filtros activos para exportar.');
        return;
      }
      movs.forEach(function (m) {
        aoa.push([
          excelDate(m.fecha),
          m.tipo || '',
          m.descripcion || '',
          m.contraparte || '',
          excelNum(m.monto),
          m.id_movimiento_banco || m.origen_id || ''
        ]);
      });
    }
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols;
    aplicarFormatoExcel(ws, headerRow, dateCols, numCols);
    var wb = global.XLSX.utils.book_new();
    var sheetName = listaLabel().slice(0, 31);
    global.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    var canalFile = state.canal === CANAL_GAL ? 'Galicia' : 'MP';
    var listaFile = (state.lista || 'sugeridos').replace(/[^a-z]/g, '_');
    global.XLSX.writeFile(wb, 'Conciliacion_Bancaria_' + canalFile + '_' + listaFile + '_' + fechaHoyYmd() + '.xlsx', { cellStyles: true, cellDates: false });
  }

  function renderFiltros() {
    syncFiltrosConOpciones();
    var meses = opcionesMes();
    var conceptos = opcionesConcepto();
    var mesOpts = '<option value="">Todos los meses</option>';
    meses.forEach(function (ym) {
      mesOpts += '<option value="' + esc(ym) + '"' + (state.mes === ym ? ' selected' : '') + '>' + esc(formatMesLabel(ym)) + '</option>';
    });
    var conOpts = '<option value="">Todos los conceptos</option>';
    conceptos.forEach(function (c) {
      conOpts += '<option value="' + esc(c) + '"' + (state.concepto === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    var mesOn = !!state.mes;
    var conOn = !!state.concepto;
    var qOn = !!(state.q || '').trim();
    return '<div class="cb-filtros">' +
      (hayFiltrosActivos() ? '<span class="cb-filtros-flag" title="Hay filtros aplicados; el listado y el Excel respetan estos filtros">Filtros activos</span>' : '') +
      '<div class="form-group' + (mesOn ? ' cb-filtro-activo' : '') + '"><label for="cb-mes">Mes</label><select id="cb-mes" title="Filtrar por mes">' + mesOpts + '</select></div>' +
      '<div class="form-group' + (conOn ? ' cb-filtro-activo' : '') + '"><label for="cb-concepto">Concepto del extracto</label><select id="cb-concepto" title="Filtrar por concepto del extracto">' + conOpts + '</select></div>' +
      '<div class="form-group' + (qOn ? ' cb-filtro-activo' : '') + '"><label for="cb-q">Buscar</label><input type="search" id="cb-q" value="' + esc(state.q) + '" placeholder="Fecha, importe, cliente, ID…"></div>' +
    '</div>';
  }

  function labelsCanal() {
    if (state.canal === CANAL_GAL) {
      return {
        hint: 'Cargá el extracto de Galicia (cuenta corriente, p. ej. Extracto_CC…) y la tesorería Transferencia Galicia del sistema (Tipo, Fecha, Crédito, Débito) o el Excel de cierre de caja nombrado Galicia_CIERRE-… (Fecha, Tipo, Monto). Cada carga es incremental: nunca borra lo ya cargado. Apertura de Caja y filas Pendiente del cierre no se suben. La app propone parejas por importe y concepto; también podés conciliar a mano varios extractos con una o más tesorerías (con justificación, aunque la diferencia sea mayor a $1). El Excel exporta el listado visible con los filtros activos.',
        btnBanco: 'Cargar extracto Galicia',
        btnSistema: 'Cargar tesorería Galicia',
        kpiBanco: 'Extracto Galicia'
      };
    }
    return {
      hint: 'Cargá el extracto de Mercado Pago (Número de Movimiento evita duplicados) y el Excel de tesorería del sistema, o el cierre de caja nombrado MP_CIERRE-… (mismos movimientos ya cerrados, columna Monto). Cada carga es incremental: nunca borra lo ya cargado. Apertura de Caja y filas Pendiente del cierre no se suben. La app propone parejas por importe y concepto; también podés conciliar a mano varios extractos con una o más tesorerías (con justificación, aunque la diferencia sea mayor a $1). El Excel exporta el listado visible con los filtros activos.',
      btnBanco: 'Cargar extracto Mercado Pago',
      btnSistema: 'Cargar tesorería Mercado Pago',
      kpiBanco: 'Extracto MP'
    };
  }

  function renderCanal() {
    syncFiltrosConOpciones();
    var k = kpis();
    var lab = labelsCanal();
    var canCargar = can(PERM_CARGAR);
    var listaHtml = '';
    if (state.lista === 'sugeridos') listaHtml = renderTablaSugeridos('sugerido');
    else if (state.lista === 'confirmados') listaHtml = renderTablaSugeridos('confirmado');
    else if (state.lista === 'banco') listaHtml = renderTablaSolo('banco');
    else listaHtml = renderTablaSolo('sistema');

    return '<p class="cb-field-hint">' + esc(lab.hint) + '</p>' +
      '<div class="cb-toolbar"><div class="cb-acciones">' +
        (canCargar ? '<button type="button" class="cb-btn cb-btn-navy" data-cb="up-banco"><span class="btn-icon">' + ICO.upload + '</span>' + esc(lab.btnBanco) + '</button>' : '') +
        (canCargar ? '<button type="button" class="cb-btn cb-btn-ghost" data-cb="up-sistema"><span class="btn-icon">' + ICO.upload + '</span>' + esc(lab.btnSistema) + '</button>' : '') +
        (can(PERM_CONFIRMAR) ? '<button type="button" class="cb-btn cb-btn-ghost" data-cb="manual"><span class="btn-icon">' + ICO.link + '</span>Conciliación manual</button>' : '') +
        ((canCargar || can(PERM_CONFIRMAR)) ? '<button type="button" class="cb-btn cb-btn-ghost" data-cb="recalc"><span class="btn-icon">' + ICO.refresh + '</span>Recalcular sugerencias</button>' : '') +
        '<button type="button" class="cb-btn cb-btn-excel" data-cb="xlsx"><span class="btn-icon">' + ICO.download + '</span>Excel</button>' +
      '</div></div>' +
      (state.msg ? '<p class="cb-msg-ok">' + esc(state.msg) + '</p>' : '') +
      renderFiltros() +
      '<div class="cb-resumen">' +
        '<div class="cb-resumen-card"><p class="lab">' + esc(lab.kpiBanco) + '</p><p class="val">' + k.banco + '</p></div>' +
        '<div class="cb-resumen-card"><p class="lab">Tesorería</p><p class="val">' + k.sistema + '</p></div>' +
        '<div class="cb-resumen-card"><p class="lab">Sugeridos</p><p class="val">' + k.sugeridos + '</p></div>' +
        '<div class="cb-resumen-card"><p class="lab">Confirmados</p><p class="val">' + k.confirmados + '</p></div>' +
        '<div class="cb-resumen-card"><p class="lab">Solo banco</p><p class="val">' + k.soloB + '</p></div>' +
        '<div class="cb-resumen-card"><p class="lab">Solo sistema</p><p class="val">' + k.soloS + '</p></div>' +
      '</div>' +
      '<div class="cb-tabs">' +
        '<button type="button" class="' + (state.lista === 'sugeridos' ? 'activo' : '') + '" data-cb="lista" data-lista="sugeridos">Sugeridos</button>' +
        '<button type="button" class="' + (state.lista === 'confirmados' ? 'activo' : '') + '" data-cb="lista" data-lista="confirmados">Confirmados</button>' +
        '<button type="button" class="' + (state.lista === 'banco' ? 'activo' : '') + '" data-cb="lista" data-lista="banco">Solo banco</button>' +
        '<button type="button" class="' + (state.lista === 'sistema' ? 'activo' : '') + '" data-cb="lista" data-lista="sistema">Solo sistema</button>' +
      '</div>' +
      listaHtml;
  }

  function renderShell() {
    var el = root();
    if (!el) return;
    el.innerHTML =
      '<div class="cb-header">' +
        '<h1 class="vista-titulo"><span class="vista-titulo-icon" aria-hidden="true">' + ICO.bank + '</span>Conciliación Bancaria</h1>' +
      '</div>' +
      '<p style="color:#666;margin:0 0 1rem;font-size:0.92rem">Confrontá el extracto de cada medio con lo cargado en tesorería. Mercado Pago y Banco Galicia usan el mismo flujo: extracto del banco + tesorería del sistema.</p>' +
      (state.loading ? '<p class="loading">Cargando conciliación…</p>' : '') +
      (state.err ? '<p class="cb-msg-err">' + esc(state.err) + '</p>' : '') +
      '<div class="cb-tabs">' +
        '<button type="button" class="' + (state.canal === CANAL_MP ? 'activo' : '') + '" data-cb="canal" data-canal="' + CANAL_MP + '">Mercado Pago</button>' +
        '<button type="button" class="' + (state.canal === CANAL_GAL ? 'activo' : '') + '" data-cb="canal" data-canal="' + CANAL_GAL + '">Banco Galicia</button>' +
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
    var mesEl = el.querySelector('#cb-mes');
    if (mesEl) {
      mesEl.addEventListener('change', function () {
        state.mes = mesEl.value || '';
        renderShell();
      });
    }
    var conEl = el.querySelector('#cb-concepto');
    if (conEl) {
      conEl.addEventListener('change', function () {
        state.concepto = conEl.value || '';
        renderShell();
      });
    }
  }

  function onClick(ev) {
    var t = ev.target.closest && ev.target.closest('[data-cb]');
    if (!t) return;
    var rootEl = root();
    if (rootEl && !rootEl.contains(t) && !(state.modal && state.modal.contains(t))) return;
    var a = t.getAttribute('data-cb');
    var id = t.getAttribute('data-id');
    if (a === 'canal') {
      state.canal = t.getAttribute('data-canal') || CANAL_MP;
      state.lista = 'sugeridos';
      state.mes = '';
      state.concepto = '';
      recargarTodo();
      return;
    }
    if (a === 'lista') { state.lista = t.getAttribute('data-lista') || 'sugeridos'; renderShell(); return; }
    if (a === 'sort') { toggleSort(t.getAttribute('data-sort')); renderShell(); return; }
    if (a === 'up-banco') { onUpload('banco'); return; }
    if (a === 'up-sistema') { onUpload('sistema'); return; }
    if (a === 'recalc') { onRecalc(); return; }
    if (a === 'manual') { abrirManual(); return; }
    if (a === 'xlsx') { exportarExcel(); return; }
    if (a === 'ver') { abrirDetalleMatch(id); return; }
    if (a === 'ver-mov') { abrirDetalleMov(id); return; }
    if (a === 'del-mov') { borrarMovimientoSistema(id); return; }
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
