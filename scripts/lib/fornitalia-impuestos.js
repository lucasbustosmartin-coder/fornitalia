/**
 * Impuestos – Fornitalia
 * Solapa Mercado Pago: percepciones por régimen (combo CIBBPP / CIBCPP / CIVAPP).
 * Cruce por Número de movimiento contra el extracto MP.
 * window.FornitaliaImpuestos.init({ client, hasPerm, getRoot })
 */
(function (global) {
  'use strict';

  var ZONA_AR = 'America/Argentina/Buenos_Aires';
  var PERM_VER = 'ver_impuestos';
  var PERM_CARGAR = 'cargar_impuestos';
  var PERM_EXPORTAR = 'exportar_impuestos';
  var RPC_LOTE = 250;
  var SVG_HELP = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';
  var REGIMENES = [
    {
      id: 'CIBBPP',
      leyenda: 'IIBB Reg. General Buenos Aires',
      help: 'IIBB Reg. General Buenos Aires. Percepción de Mercado Pago sobre los cargos de la factura. El cruce con el extracto es por Número de movimiento.',
      archivo: 'Reporte-Percepción-CIBBPP-…-MercadoPago.xlsx'
    },
    {
      id: 'CIBCPP',
      leyenda: 'IIBB Rég. General CABA',
      help: 'IIBB Rég. General CABA. Percepción de Mercado Pago sobre los cargos de la factura. El cruce con el extracto es por Número de movimiento.',
      archivo: 'Reporte-Percepción-CIBCPP-…-MercadoPago.xlsx'
    },
    {
      id: 'CIVAPP',
      leyenda: 'Percepción IVA',
      help: 'CIVAPP — Percepción IVA. Percepción de Mercado Pago sobre los cargos de la factura. El cruce con el extracto es por Número de movimiento.',
      archivo: 'Reporte-Percepción-CIVAPP-…-MercadoPago.xlsx'
    }
  ];

  var ICO = {
    tax: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>'
  };

  var opts = { client: null, hasPerm: function () { return true; }, getRoot: function () { return null; } };
  var state = {
    mounted: false,
    loading: false,
    canal: 'mercadopago',
    regimen: REGIMENES[0].id,
    filas: [],
    q: '',
    mes: '',
    extracto: '',
    conciliado: '',
    modalFiltros: null,
    filtrosDraft: null,
    modalManual: null,
    manual: null,
    sort: { key: 'fecha', dir: 'desc' },
    msg: '',
    err: ''
  };

  function regimenMeta(id) {
    var i;
    for (i = 0; i < REGIMENES.length; i++) {
      if (REGIMENES[i].id === id) return REGIMENES[i];
    }
    return REGIMENES[0];
  }

  function labelRegimen(meta) {
    return meta.id + ' — ' + meta.leyenda;
  }

  function regimenConocido(id) {
    var i;
    for (i = 0; i < REGIMENES.length; i++) {
      if (REGIMENES[i].id === id) return true;
    }
    return false;
  }

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
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      var yy = m[3].length === 2 ? ('20' + m[3]) : m[3];
      return yy + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    }
    return '';
  }

  function formatFecha(ymd) {
    var s = String(ymd || '').slice(0, 10);
    var p = s.split('-');
    if (p.length !== 3) return s || '—';
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function ymdToExcelSerial(ymd) {
    var p = String(ymd || '').slice(0, 10).split('-');
    if (p.length !== 3) return null;
    var y = Number(p[0]);
    var m = Number(p[1]);
    var d = Number(p[2]);
    if (!y || !m || !d) return null;
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function parseMonto(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim().replace(/\s/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.indexOf(',') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function idDesdeCelda(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) return String(Math.round(v));
    var s = String(v).trim();
    if (!s) return '';
    if (/e/i.test(s)) {
      var n = Number(s);
      if (isFinite(n)) return String(Math.round(n));
    }
    if (/^\d+\.0+$/.test(s)) return s.split('.')[0];
    return s.replace(/\s/g, '');
  }

  function round4(n) {
    if (n == null || !isFinite(n)) return null;
    return Math.round(n * 10000) / 10000;
  }

  function formatMonto(n) {
    if (n == null || n === '' || !isFinite(Number(n))) return '—';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatAlicuota(n) {
    if (n == null || n === '' || !isFinite(Number(n))) return '—';
    var pct = Number(n);
    if (Math.abs(pct) <= 1) pct = pct * 100;
    return pct.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
  }

  function normHeader(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  function mapHeaders(row) {
    var map = {};
    (row || []).forEach(function (h, i) {
      var k = normHeader(h);
      if (k) map[k] = i;
    });
    return map;
  }

  function cell(row, map, names) {
    var i;
    for (i = 0; i < names.length; i++) {
      var idx = map[normHeader(names[i])];
      if (idx != null) return row[idx];
    }
    return '';
  }

  function regimenDeArchivo(nombre) {
    var t = String(nombre || '').toUpperCase();
    if (t.indexOf('CIBBPP') >= 0) return 'CIBBPP';
    if (t.indexOf('CIBCPP') >= 0) return 'CIBCPP';
    if (t.indexOf('CIVAPP') >= 0) return 'CIVAPP';
    return '';
  }

  function periodoDeArchivo(nombre) {
    var m = String(nombre || '').match(/([a-z]{3})-(\d{4})/i);
    return m ? (m[1].toLowerCase() + '-' + m[2]) : '';
  }

  function filasHoja(wb, name) {
    var sheet = wb.Sheets[name];
    if (!sheet) return [];
    return global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  }

  function encontrarHeader(rows) {
    var r;
    for (r = 0; r < Math.min(rows.length, 30); r++) {
      var map = mapHeaders(rows[r] || []);
      if (map['numero de movimiento'] != null && map['monto percibido'] != null) {
        return { idx: r, map: map };
      }
    }
    return null;
  }

  function parsePercepcionMp(wb, archivo) {
    var names = wb.SheetNames || [];
    var i;
    var header = null;
    var rows = [];
    for (i = 0; i < names.length; i++) {
      rows = filasHoja(wb, names[i]);
      header = encontrarHeader(rows);
      if (header) break;
    }
    if (!header) {
      return { error: 'No reconocí el reporte de percepción de Mercado Pago. Esperaba la columna Número de movimiento.', filas: [] };
    }
    var map = header.map;
    var filas = [];
    var vistos = {};
    var omitidasDup = 0;
    for (var r = header.idx + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var origenId = idDesdeCelda(cell(row, map, ['Número de movimiento', 'Numero de movimiento']));
      if (!origenId) continue;
      if (vistos[origenId]) {
        omitidasDup += 1;
        continue;
      }
      vistos[origenId] = true;
      var fecha = parseFechaCelda(cell(row, map, ['Fecha del cargo', 'Fecha']));
      var alic = parseMonto(cell(row, map, ['Alícuota', 'Alicuota']));
      filas.push({
        origen_id: origenId,
        numero_cargo: idDesdeCelda(cell(row, map, ['Número de cargo', 'Numero de cargo'])) || null,
        fecha: fecha || fechaHoyYmd(),
        factura_legal: String(cell(row, map, ['Número de factura legal', 'Numero de factura legal']) || '').trim() || null,
        detalle: String(cell(row, map, ['Detalle']) || '').trim() || null,
        operacion_relacionada: idDesdeCelda(cell(row, map, ['Operación relacionada', 'Operacion relacionada'])) || null,
        importe_con_iva: round4(parseMonto(cell(row, map, ['Importe con IVA', 'Importe con Iva']))),
        importe_sin_iva: round4(parseMonto(cell(row, map, ['Importe sin IVA', 'Importe sin Iva']))),
        base_imponible: round4(parseMonto(cell(row, map, ['Base imponible']))),
        alicuota: alic,
        monto_percibido: round4(parseMonto(cell(row, map, ['Monto percibido']))),
        archivo: archivo,
        fila_excel: r + 1,
        periodo_reporte: periodoDeArchivo(archivo) || null,
        raw: {
          fecha_cargo: fecha,
          numero_cargo: idDesdeCelda(cell(row, map, ['Número de cargo', 'Numero de cargo'])),
          numero_movimiento: origenId
        }
      });
    }
    if (!filas.length) {
      return { error: 'El archivo no tiene filas con Número de movimiento.', filas: [] };
    }
    return { error: null, filas: filas, omitidasDup: omitidasDup };
  }

  function truthy(v) {
    return v === true || v === 'true' || v === 't';
  }

  function etiquetaConciliado(f) {
    if (f.tesoreria_id) return 'Sí';
    if (!truthy(f.en_extracto)) return '—';
    if (truthy(f.no_requiere)) return 'No requiere';
    return truthy(f.conciliado) ? 'Sí' : 'No';
  }

  function claseConciliado(f) {
    if (f.tesoreria_id) return 'imp-badge-ok';
    if (!truthy(f.en_extracto)) return 'imp-badge-na';
    if (truthy(f.no_requiere)) return 'imp-badge-skip';
    return truthy(f.conciliado) ? 'imp-badge-ok' : 'imp-badge-no';
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
    (state.filas || []).forEach(function (f) {
      var ym = mesYYYYMM(f.fecha);
      if (ym) set[ym] = true;
    });
    return Object.keys(set).sort().reverse();
  }

  function contarFiltrosEstructurales(src) {
    var s = src || state;
    var n = 0;
    if (s.mes) n += 1;
    if (s.extracto) n += 1;
    if (s.conciliado) n += 1;
    return n;
  }

  function pasaEstructural(f, src) {
    var s = src || state;
    if (s.mes && mesYYYYMM(f.fecha) !== s.mes) return false;
    if (s.extracto === 'si' && !truthy(f.en_extracto)) return false;
    if (s.extracto === 'no' && truthy(f.en_extracto)) return false;
    if (s.conciliado === 'si' && (!truthy(f.conciliado) || truthy(f.no_requiere))) return false;
    if (s.conciliado === 'no' && (truthy(f.conciliado) || truthy(f.no_requiere))) return false;
    if (s.conciliado === 'noreq' && !truthy(f.no_requiere)) return false;
    return true;
  }

  function pasaBuscar(f) {
    var q = String(state.q || '').trim().toLowerCase();
    if (!q) return true;
    return [
      f.origen_id, f.numero_cargo, f.detalle, f.factura_legal, f.operacion_relacionada,
      f.archivo, formatFecha(f.fecha), etiquetaConciliado(f)
    ].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function filasVisibles() {
    var list = (state.filas || []).filter(function (f) { return pasaEstructural(f) && pasaBuscar(f); });
    var key = state.sort.key;
    var dir = state.sort.dir === 'asc' ? 1 : -1;
    list.sort(function (a, b) {
      var va = a[key];
      var vb = b[key];
      if (key === 'en_extracto' || key === 'conciliado') {
        va = truthy(va) ? 1 : 0;
        vb = truthy(vb) ? 1 : 0;
      }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'es') * dir;
    });
    return list;
  }

  function kpis() {
    var all = (state.filas || []).filter(function (f) { return pasaEstructural(f); });
    var n = all.length;
    var en = 0;
    var conc = 0;
    var perc = 0;
    var percNoConc = 0;
    all.forEach(function (f) {
      var percibido = Number(f.monto_percibido) || 0;
      if (truthy(f.en_extracto)) en += 1;
      if (truthy(f.en_extracto) && truthy(f.conciliado)) conc += 1;
      perc += percibido;
      if (!truthy(f.conciliado)) percNoConc += percibido;
    });
    return { n: n, en: en, sin: n - en, conc: conc, noConc: en - conc, perc: perc, percNoConc: percNoConc };
  }

  function thSort(key, label, extraClass) {
    var activo = state.sort.key === key;
    var dirTxt = activo && state.sort.dir === 'asc' ? 'ascendente' : 'descendente';
    var ind = activo ? (state.sort.dir === 'asc' ? '▲' : '▼') : '↕';
    return '<th class="imp-th-sort' + (extraClass ? ' ' + extraClass : '') + (activo ? ' imp-th-sort-activo' : '') + '">' +
      '<button type="button" class="imp-th-sort-btn" data-imp="sort" data-sort="' + esc(key) +
      '" title="Ordenar ' + esc(label) + ' (' + dirTxt + ')" aria-label="Ordenar por ' + esc(label) + ', ' + dirTxt + '">' +
      esc(label) + '<span class="imp-sort-ind">' + ind + '</span></button></th>';
  }

  function renderTabla() {
    var list = filasVisibles();
    if (!list.length) {
      return '<p class="imp-empty">' + (state.filas.length ? 'Ninguna fila con estos filtros.' : 'Todavía no hay percepciones ' + esc(state.regimen) + ' cargadas.') + '</p>';
    }
    var body = list.map(function (f) {
      return '<tr>' +
        '<td>' + esc(formatFecha(f.fecha)) + '</td>' +
        '<td class="imp-col-id">' + esc(f.origen_id || '—') + '</td>' +
        '<td class="imp-col-id">' + esc(f.numero_cargo || '—') + '</td>' +
        '<td>' + esc(f.detalle || '—') + '</td>' +
        '<td class="imp-col-id">' + esc(f.factura_legal || '—') + '</td>' +
        '<td class="imp-col-monto">' + esc(formatMonto(f.importe_con_iva)) + '</td>' +
        '<td class="imp-col-monto">' + esc(formatMonto(f.base_imponible)) + '</td>' +
        '<td class="imp-col-monto">' + esc(formatAlicuota(f.alicuota)) + '</td>' +
        '<td class="imp-col-monto">' + esc(formatMonto(f.monto_percibido)) + '</td>' +
        '<td><span class="imp-badge ' + (truthy(f.en_extracto) ? 'imp-badge-ok' : 'imp-badge-no') + '">' +
          (truthy(f.en_extracto) ? 'Sí' : 'No') + '</span></td>' +
        '<td><span class="imp-badge ' + claseConciliado(f) + '">' + esc(etiquetaConciliado(f)) + '</span></td>' +
      '</tr>';
    }).join('');
    return '<div class="imp-tabla-wrap"><table class="imp-tabla">' +
      '<thead><tr>' +
        thSort('fecha', 'Fecha cargo') +
        thSort('origen_id', 'Nº movimiento') +
        thSort('numero_cargo', 'Nº cargo') +
        thSort('detalle', 'Detalle') +
        thSort('factura_legal', 'Factura legal') +
        thSort('importe_con_iva', 'Importe c/IVA', 'imp-col-monto') +
        thSort('base_imponible', 'Base imponible', 'imp-col-monto') +
        thSort('alicuota', 'Alícuota', 'imp-col-monto') +
        thSort('monto_percibido', 'Percibido', 'imp-col-monto') +
        thSort('en_extracto', 'En extracto MP') +
        thSort('conciliado', 'Conciliado') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function htmlOpcionesMesSelect(valores, seleccionado) {
    var out = '<option value="">Todos los meses</option>';
    (valores || []).forEach(function (ym) {
      out += '<option value="' + esc(ym) + '"' + (seleccionado === ym ? ' selected' : '') + '>' + esc(formatMesLabel(ym)) + '</option>';
    });
    return out;
  }

  function htmlCuerpoModalFiltros() {
    var d = state.filtrosDraft || {};
    return FornitaliaHelp.row('tpl-imp-filtros', 'Ayuda: Filtros',
      '<p>Filtrá por mes, extracto y conciliación. El buscar de la pantalla sigue libre y no se restringe acá.</p>') +
      '<div class="imp-filtros-modal-grid">' +
        '<div class="form-group' + (d.mes ? ' imp-filtro-activo' : '') + '"><label for="imp-filtro-mes">Mes</label>' +
          '<select id="imp-filtro-mes" title="Filtrar por mes">' + htmlOpcionesMesSelect(opcionesMes(), d.mes || '') + '</select></div>' +
        '<div class="form-group' + (d.extracto ? ' imp-filtro-activo' : '') + '"><label for="imp-filtro-extracto">En extracto MP</label>' +
          '<select id="imp-filtro-extracto" title="Filtrar por extracto">' +
            '<option value="">Todos</option>' +
            '<option value="si"' + (d.extracto === 'si' ? ' selected' : '') + '>Sí</option>' +
            '<option value="no"' + (d.extracto === 'no' ? ' selected' : '') + '>No</option>' +
          '</select></div>' +
        '<div class="form-group' + (d.conciliado ? ' imp-filtro-activo' : '') + '"><label for="imp-filtro-conciliado">Conciliado</label>' +
          '<select id="imp-filtro-conciliado" title="Filtrar por conciliación">' +
            '<option value="">Todos</option>' +
            '<option value="si"' + (d.conciliado === 'si' ? ' selected' : '') + '>Sí</option>' +
            '<option value="no"' + (d.conciliado === 'no' ? ' selected' : '') + '>No</option>' +
            '<option value="noreq"' + (d.conciliado === 'noreq' ? ' selected' : '') + '>No requiere</option>' +
          '</select></div>' +
      '</div>';
  }

  function bindModalFiltrosInputs() {
    var bd = state.modalFiltros;
    if (!bd || !state.filtrosDraft) return;
    function bindSel(id, campo) {
      var el = bd.querySelector(id);
      if (!el) return;
      el.addEventListener('change', function () {
        state.filtrosDraft[campo] = el.value || '';
        var wrap = el.closest('.form-group');
        if (wrap) wrap.classList.toggle('imp-filtro-activo', !!el.value);
      });
    }
    bindSel('#imp-filtro-mes', 'mes');
    bindSel('#imp-filtro-extracto', 'extracto');
    bindSel('#imp-filtro-conciliado', 'conciliado');
  }

  function onModalFiltrosClick(ev) {
    var bd = state.modalFiltros;
    if (!bd) return;
    if (ev.target === bd) { cerrarModalFiltros(); return; }
    var t = ev.target.closest && ev.target.closest('[data-imp]');
    if (!t || !bd.contains(t)) return;
    var a = t.getAttribute('data-imp');
    if (a === 'cerrar-filtros') { ev.preventDefault(); cerrarModalFiltros(); return; }
    if (a === 'limpiar-filtros') {
      ev.preventDefault();
      if (!state.filtrosDraft) return;
      state.filtrosDraft.mes = '';
      state.filtrosDraft.extracto = '';
      state.filtrosDraft.conciliado = '';
      var body = bd.querySelector('.modal-body');
      if (body) body.innerHTML = htmlCuerpoModalFiltros();
      bindModalFiltrosInputs();
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
    state.mes = d.mes || '';
    state.extracto = d.extracto || '';
    state.conciliado = d.conciliado || '';
    cerrarModalFiltros();
    renderShell();
  }

  function abrirModalFiltros() {
    cerrarModalFiltros();
    state.filtrosDraft = {
      mes: state.mes || '',
      extracto: state.extracto || '',
      conciliado: state.conciliado || ''
    };
    var bd = document.createElement('div');
    bd.className = 'imp-modal-backdrop';
    bd.innerHTML =
      '<div class="imp-modal" role="dialog" aria-modal="true" aria-labelledby="imp-filtros-titulo">' +
        '<div class="modal-header">' +
          '<h2 id="imp-filtros-titulo">Filtros</h2>' +
          '<button type="button" class="imp-btn imp-btn-ghost imp-btn-icon-only" data-imp="cerrar-filtros" title="Cerrar" aria-label="Cerrar"><span class="btn-icon">' + ICO.x + '</span></button>' +
        '</div>' +
        '<div class="modal-body">' + htmlCuerpoModalFiltros() + '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="imp-btn imp-btn-ghost" data-imp="limpiar-filtros"><span class="btn-icon">' + ICO.trash + '</span>Limpiar</button>' +
          '<button type="button" class="imp-btn imp-btn-ghost" data-imp="cerrar-filtros"><span class="btn-icon">' + ICO.x + '</span>Cancelar</button>' +
          '<button type="button" class="imp-btn imp-btn-ok" data-imp="aplicar-filtros"><span class="btn-icon">' + ICO.check + '</span>Aplicar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bd);
    state.modalFiltros = bd;
    bd.addEventListener('click', onModalFiltrosClick);
    function onEsc(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); cerrarModalFiltros(); }
    }
    document.addEventListener('keydown', onEsc);
    bd._impEsc = onEsc;
    bindModalFiltrosInputs();
  }

  function cerrarModalFiltros() {
    if (state.modalFiltros) {
      if (state.modalFiltros._impEsc) document.removeEventListener('keydown', state.modalFiltros._impEsc);
      if (state.modalFiltros.parentNode) state.modalFiltros.parentNode.removeChild(state.modalFiltros);
    }
    state.modalFiltros = null;
    state.filtrosDraft = null;
  }

  function filasNoConciliadas() {
    return (state.filas || []).filter(function (f) {
      if (state.mes && mesYYYYMM(f.fecha) !== state.mes) return false;
      if (state.extracto === 'si' && !truthy(f.en_extracto)) return false;
      if (state.extracto === 'no' && truthy(f.en_extracto)) return false;
      if (truthy(f.conciliado) || truthy(f.no_requiere) || f.tesoreria_id) return false;
      return true;
    });
  }

  function labelArchivo(nombre) {
    var s = String(nombre || '').trim();
    return s || '(sin archivo)';
  }

  function opcionesArchivoNoConc() {
    var set = {};
    filasNoConciliadas().forEach(function (f) { set[labelArchivo(f.archivo)] = true; });
    return Object.keys(set).sort();
  }

  function filasManualPerc() {
    var m = state.manual;
    if (!m) return [];
    return filasNoConciliadas().filter(function (f) {
      if (m.archivo && labelArchivo(f.archivo) !== m.archivo) return false;
      return true;
    });
  }

  function idsPercSeleccionadas() {
    return (state.manual && state.manual.ids) || [];
  }

  function percIdElegida(id) {
    return idsPercSeleccionadas().indexOf(id) >= 0;
  }

  function sumaPercSeleccionada() {
    var set = {};
    idsPercSeleccionadas().forEach(function (id) { set[id] = true; });
    var s = 0;
    (state.filas || []).forEach(function (f) {
      if (set[f.id]) s += Number(f.monto_percibido) || 0;
    });
    return s;
  }

  function tesoreriaElegida() {
    var id = state.manual && state.manual.tesoreriaId;
    if (!id) return null;
    var list = (state.manual && state.manual.tesoreria) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function tesoreriaFiltrada() {
    var m = state.manual || {};
    var q = String(m.qTes || '').trim().toLowerCase();
    return (m.tesoreria || []).filter(function (t) {
      if (truthy(t.usado_impuestos) && t.id !== m.tesoreriaId) return false;
      if (m.soloImpuestos && !truthy(t.es_impuesto)) return false;
      if (!q) return true;
      return [
        formatFecha(t.fecha), t.descripcion, t.categoria, t.cuenta_contable,
        t.origen_id, t.contraparte, formatMonto(t.monto)
      ].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  function justifDefault() {
    var n = idsPercSeleccionadas().length;
    var tes = tesoreriaElegida();
    var arch = (state.manual && state.manual.archivo) || '';
    var txt = 'Conciliación manual Impuestos ' + state.regimen + ': ' + n +
      ' percepción' + (n === 1 ? '' : 'es');
    if (arch && arch !== '(sin archivo)') txt += ' de ' + arch;
    if (tes) txt += ' vs tesorería ' + formatFecha(tes.fecha) + ' $ ' + formatMonto(tes.monto);
    return txt + '.';
  }

  function syncJustifAuto() {
    if (!state.manual || state.manual.justifTouched) return;
    state.manual.justif = justifDefault();
  }

  function seleccionarTodasPercArchivo() {
    if (!state.manual) return;
    state.manual.ids = filasManualPerc().map(function (f) { return f.id; });
    syncJustifAuto();
  }

  function htmlPickPerc() {
    var list = filasManualPerc();
    var ids = idsPercSeleccionadas();
    var nSel = ids.length;
    var allOn = list.length && list.every(function (f) { return percIdElegida(f.id); });
    if (!list.length) {
      return '<p class="imp-empty">No hay percepciones no conciliadas para este archivo.</p>';
    }
    var body = list.map(function (f) {
      var on = percIdElegida(f.id);
      return '<tr class="imp-pick-row' + (on ? ' imp-pick-sel' : '') + '" data-imp="manual-perc" data-id="' + esc(f.id) + '">' +
        '<td class="imp-pick-check"><input type="checkbox"' + (on ? ' checked' : '') + ' tabindex="-1" aria-hidden="true"></td>' +
        '<td>' + esc(formatFecha(f.fecha)) + '</td>' +
        '<td class="imp-col-id">' + esc(f.origen_id || '—') + '</td>' +
        '<td>' + esc(f.detalle || '—') + '</td>' +
        '<td class="imp-col-monto">' + esc(formatMonto(f.monto_percibido)) + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="imp-pick-wrap"><table class="imp-tabla imp-pick-tabla">' +
      '<thead><tr>' +
        '<th class="imp-pick-check"><label class="imp-sr-only" for="imp-manual-all">Seleccionar todas</label>' +
          '<input type="checkbox" id="imp-manual-all" data-imp="manual-all" title="Seleccionar todas"' +
          (allOn ? ' checked' : '') + (nSel && !allOn ? ' aria-checked="mixed"' : '') + '></th>' +
        '<th>Fecha</th><th>Nº movimiento</th><th>Detalle</th><th class="imp-col-monto">Percibido</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function htmlPickTesoreria() {
    var list = tesoreriaFiltrada();
    var sel = state.manual && state.manual.tesoreriaId;
    if (!(state.manual && state.manual.tesoreria && state.manual.tesoreria.length) && state.manual && state.manual.loadingTes) {
      return '<p class="loading">Cargando tesorería Mercado Pago…</p>';
    }
    if (!list.length) {
      return '<p class="imp-empty">' + ((state.manual && (state.manual.qTes || '').trim())
        ? 'Ningún movimiento de tesorería con esa búsqueda.'
        : 'No hay movimientos de tesorería Mercado Pago para elegir.') + '</p>';
    }
    var body = list.map(function (t) {
      var on = t.id === sel;
      return '<tr class="imp-pick-row' + (on ? ' imp-pick-sel' : '') + '" data-imp="manual-tes" data-id="' + esc(t.id) + '">' +
        '<td class="imp-pick-check"><input type="radio" name="imp-manual-tes"' + (on ? ' checked' : '') + ' tabindex="-1" aria-hidden="true"></td>' +
        '<td>' + esc(formatFecha(t.fecha)) + '</td>' +
        '<td class="imp-col-monto">' + esc(formatMonto(t.monto)) + '</td>' +
        '<td>' + esc(t.descripcion || '—') + '</td>' +
        '<td>' + esc(t.categoria || '—') + '</td>' +
        '<td>' + esc(t.cuenta_contable || '—') + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="imp-pick-wrap"><table class="imp-tabla imp-pick-tabla">' +
      '<thead><tr>' +
        '<th class="imp-pick-check"></th>' +
        '<th>Fecha</th><th class="imp-col-monto">Importe</th><th>Descripción</th><th>Categoría</th><th>Cuenta</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function htmlDiffManual() {
    var n = idsPercSeleccionadas().length;
    var tes = tesoreriaElegida();
    var sumP = sumaPercSeleccionada();
    if (!n && !tes) {
      return '<div class="imp-diff-box">Elegí las percepciones no conciliadas (podés marcar todas las del archivo) y un único movimiento de tesorería Mercado Pago.</div>';
    }
    if (!tes) {
      return '<div class="imp-diff-box"><strong>Percepciones (' + n + '):</strong> $ ' + esc(formatMonto(sumP)) +
        '<br>Falta elegir el movimiento de tesorería.</div>';
    }
    var tesAbs = Math.abs(Number(tes.monto) || 0);
    var d = Math.round((sumP - tesAbs) * 100) / 100;
    var warn = Math.abs(d) > 1;
    return '<div class="imp-diff-box' + (warn ? ' warn' : '') + '">' +
      '<strong>Percepciones (' + n + '):</strong> $ ' + esc(formatMonto(sumP)) +
      ' &nbsp;·&nbsp; <strong>Tesorería:</strong> $ ' + esc(formatMonto(tes.monto)) +
      ' &nbsp;·&nbsp; <strong>Diferencia</strong> (percibido − |tesorería|): $ ' + esc(formatMonto(d)) +
      (warn
        ? '<br>La diferencia es mayor a $1. Queda registrada junto con la justificación.'
        : '<br>El grupo queda conciliado en Impuestos (no modifica Conciliación Bancaria).') +
    '</div>';
  }

  function htmlCuerpoModalManual() {
    var m = state.manual || {};
    var archivos = opcionesArchivoNoConc();
    var nPerc = filasManualPerc().length;
    var nSel = idsPercSeleccionadas().length;
    var nTes = tesoreriaFiltrada().length;
    var optsArch = archivos.map(function (a) {
      return '<option value="' + esc(a) + '"' + (m.archivo === a ? ' selected' : '') + '>' + esc(a) + '</option>';
    }).join('');
    return FornitaliaHelp.row('tpl-imp-manual', 'Ayuda: Conciliación manual de impuestos',
      '<p>Conciliá las percepciones <strong>no conciliadas</strong> de un archivo con <strong>un</strong> movimiento de tesorería Mercado Pago.</p>' +
      '<p>No usa el match del extracto (el Nº de movimiento del reporte es el cargo, no el débito de la percepción).</p>') +
      '<div class="imp-manual-toolbar">' +
        '<div class="form-group' + (m.archivo ? ' imp-filtro-activo' : '') + '"><label for="imp-manual-archivo">Tipo de archivo</label>' +
          '<select id="imp-manual-archivo" title="Filtrar percepciones por archivo">' +
            '<option value="">Todos los archivos</option>' + optsArch +
          '</select></div>' +
        '<button type="button" class="imp-btn imp-btn-ghost" data-imp="manual-all-btn" title="Seleccionar todas las no conciliadas de este archivo">' +
          '<span class="btn-icon">' + ICO.check + '</span>Seleccionar todas</button>' +
      '</div>' +
      '<div class="imp-manual-cols">' +
        '<div class="imp-manual-col">' +
          '<h3>No conciliadas <span class="imp-manual-count">(' + nPerc + ')</span>' +
            (nSel ? ' <span class="imp-manual-sel">' + nSel + ' elegidas</span>' : '') + '</h3>' +
          htmlPickPerc() +
        '</div>' +
        '<div class="imp-manual-col">' +
          '<h3>Tesorería Mercado Pago <span class="imp-manual-count">(' + nTes + ')</span>' +
            (m.tesoreriaId ? ' <span class="imp-manual-sel">1 elegida</span>' : '') + '</h3>' +
          '<div class="imp-manual-tes-filtros">' +
            '<div class="form-group' + ((m.qTes || '').trim() ? ' imp-filtro-activo' : '') + '"><label for="imp-manual-qtes">Buscar tesorería</label>' +
              '<input type="search" id="imp-manual-qtes" value="' + esc(m.qTes || '') + '" placeholder="Fecha, importe, descripción, categoría…"></div>' +
            '<label class="imp-check-line"><input type="checkbox" id="imp-manual-solo-imp"' + (m.soloImpuestos ? ' checked' : '') + '>' +
              'Solo impuestos / retenciones</label>' +
          '</div>' +
          htmlPickTesoreria() +
        '</div>' +
      '</div>' +
      htmlDiffManual() +
      '<label class="imp-just-label" for="imp-manual-just">Justificación</label>' +
      '<textarea id="imp-manual-just" class="imp-just-area" maxlength="800" placeholder="Queda registrada junto con la diferencia.">' +
        esc(m.justif || '') + '</textarea>';
  }

  function bindManualInputs() {
    var bd = state.modalManual;
    if (!bd || !state.manual) return;
    var arch = bd.querySelector('#imp-manual-archivo');
    var qtes = bd.querySelector('#imp-manual-qtes');
    var solo = bd.querySelector('#imp-manual-solo-imp');
    var ju = bd.querySelector('#imp-manual-just');
    if (arch) {
      arch.addEventListener('change', function () {
        state.manual.archivo = arch.value || '';
        seleccionarTodasPercArchivo();
        refreshManualModal();
      });
    }
    if (qtes) {
      qtes.addEventListener('input', function () {
        state.manual.qTes = qtes.value || '';
        var pos = qtes.selectionStart;
        refreshManualModal();
        var n = state.modalManual && state.modalManual.querySelector('#imp-manual-qtes');
        if (n) {
          n.focus();
          try { n.setSelectionRange(pos, pos); } catch (e) {}
        }
      });
    }
    if (solo) {
      solo.addEventListener('change', function () {
        state.manual.soloImpuestos = !!solo.checked;
        refreshManualModal();
      });
    }
    if (ju) {
      ju.addEventListener('input', function () {
        state.manual.justif = ju.value;
        state.manual.justifTouched = true;
      });
    }
  }

  function refreshManualModal() {
    var bd = state.modalManual;
    if (!bd || !state.manual) return;
    var body = bd.querySelector('.modal-body');
    if (!body) return;
    body.innerHTML = htmlCuerpoModalManual();
    bindManualInputs();
  }

  function onModalManualClick(ev) {
    var bd = state.modalManual;
    if (!bd) return;
    if (ev.target === bd) { cerrarModalManual(); return; }
    var t = ev.target.closest && ev.target.closest('[data-imp]');
    if (!t || !bd.contains(t)) return;
    var a = t.getAttribute('data-imp');
    if (a === 'cerrar-manual') { ev.preventDefault(); cerrarModalManual(); return; }
    if (a === 'manual-all' || a === 'manual-all-btn') {
      ev.preventDefault();
      var listAll = filasManualPerc();
      var allOn = listAll.length && listAll.every(function (f) { return percIdElegida(f.id); });
      if (allOn && a === 'manual-all') {
        state.manual.ids = [];
        syncJustifAuto();
      } else {
        seleccionarTodasPercArchivo();
      }
      refreshManualModal();
      return;
    }
    if (a === 'manual-perc') {
      ev.preventDefault();
      var id = t.getAttribute('data-id');
      if (!id || !state.manual) return;
      var ids = state.manual.ids.slice();
      var ix = ids.indexOf(id);
      if (ix >= 0) ids.splice(ix, 1);
      else ids.push(id);
      state.manual.ids = ids;
      syncJustifAuto();
      refreshManualModal();
      return;
    }
    if (a === 'manual-tes') {
      ev.preventDefault();
      var tid = t.getAttribute('data-id');
      if (!tid || !state.manual) return;
      state.manual.tesoreriaId = state.manual.tesoreriaId === tid ? '' : tid;
      syncJustifAuto();
      refreshManualModal();
      return;
    }
    if (a === 'aplicar-manual') {
      ev.preventDefault();
      confirmarManual();
    }
  }

  function cerrarModalManual() {
    if (state.modalManual) {
      if (state.modalManual._impEsc) document.removeEventListener('keydown', state.modalManual._impEsc);
      if (state.modalManual.parentNode) state.modalManual.parentNode.removeChild(state.modalManual);
    }
    state.modalManual = null;
    state.manual = null;
  }

  async function abrirModalManual() {
    if (!can(PERM_CARGAR)) return;
    var list = filasNoConciliadas();
    if (!list.length) {
      alert('No hay percepciones no conciliadas para conciliar (con los filtros de mes/extracto actuales).');
      return;
    }
    cerrarModalFiltros();
    cerrarModalManual();
    var archivos = opcionesArchivoNoConc();
    state.manual = {
      archivo: archivos.length === 1 ? archivos[0] : (archivos[0] || ''),
      ids: [],
      tesoreriaId: '',
      tesoreria: [],
      qTes: '',
      soloImpuestos: true,
      justif: '',
      justifTouched: false,
      loadingTes: true
    };
    seleccionarTodasPercArchivo();
    var bd = document.createElement('div');
    bd.className = 'imp-modal-backdrop';
    bd.innerHTML =
      '<div class="imp-modal imp-modal-wide" role="dialog" aria-modal="true" aria-labelledby="imp-manual-titulo">' +
        '<div class="modal-header">' +
          '<h2 id="imp-manual-titulo">Conciliación manual</h2>' +
          '<button type="button" class="imp-btn imp-btn-ghost imp-btn-icon-only" data-imp="cerrar-manual" title="Cerrar" aria-label="Cerrar"><span class="btn-icon">' + ICO.x + '</span></button>' +
        '</div>' +
        '<div class="modal-body">' + htmlCuerpoModalManual() + '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="imp-btn imp-btn-ghost" data-imp="cerrar-manual"><span class="btn-icon">' + ICO.x + '</span>Cancelar</button>' +
          '<button type="button" class="imp-btn imp-btn-ok" data-imp="aplicar-manual"><span class="btn-icon">' + ICO.check + '</span>Confirmar conciliación</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bd);
    state.modalManual = bd;
    bd.addEventListener('click', onModalManualClick);
    function onEsc(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); cerrarModalManual(); }
    }
    document.addEventListener('keydown', onEsc);
    bd._impEsc = onEsc;
    bindManualInputs();
    try {
      var res = await client().rpc('imp_listar_tesoreria_mp');
      if (res.error) throw res.error;
      if (state.manual) {
        state.manual.tesoreria = Array.isArray(res.data) ? res.data : [];
        state.manual.loadingTes = false;
        if (state.modalManual) refreshManualModal();
      }
    } catch (e) {
      if (state.manual) state.manual.loadingTes = false;
      alert('No se pudo cargar tesorería Mercado Pago: ' + errMsg(e));
    }
  }

  async function confirmarManual() {
    if (!can(PERM_CARGAR) || !state.manual) return;
    var juEl = state.modalManual && state.modalManual.querySelector('#imp-manual-just');
    if (juEl) state.manual.justif = juEl.value;
    var ids = idsPercSeleccionadas();
    var tesId = state.manual.tesoreriaId;
    var just = String(state.manual.justif || '').trim();
    if (!ids.length) {
      alert('Elegí al menos una percepción no conciliada.');
      return;
    }
    if (!tesId) {
      alert('Elegí un movimiento de tesorería Mercado Pago.');
      return;
    }
    if (just.length < 8) {
      alert('Escribí una justificación de al menos 8 caracteres.');
      return;
    }
    try {
      var rpc = await client().rpc('imp_conciliar_percepciones_mp', {
        p_regimen: state.regimen,
        p_ids: ids,
        p_sistema_id: tesId,
        p_justificacion: just
      });
      if (rpc.error) throw rpc.error;
      var out = rpc.data || {};
      cerrarModalManual();
      await cargarDatos();
      state.msg = 'Se conciliaron ' + (out.n || ids.length) + ' percepciones ' + state.regimen +
        ' con tesorería Mercado Pago. Diferencia $ ' + formatMonto(out.diferencia) +
        '. Quedó en Confirmados de Conciliación Bancaria.';
      state.err = '';
      renderShell();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  function htmlBtnFiltros(nActivos) {
    var title = nActivos
      ? (nActivos + ' filtro' + (nActivos === 1 ? '' : 's') + ' activo' + (nActivos === 1 ? '' : 's'))
      : 'Abrir filtros';
    return '<button type="button" class="imp-btn imp-btn-ghost' + (nActivos ? ' imp-btn-filtros-on' : '') + '" data-imp="filtros" title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
      '<span class="btn-icon">' + ICO.filter + '</span>Filtros' +
      (nActivos ? '<span class="imp-filtros-count">' + nActivos + '</span>' : '') +
    '</button>';
  }

  function renderFiltros() {
    var n = contarFiltrosEstructurales(state);
    var qOn = !!(state.q || '').trim();
    return '<div class="imp-filtros">' +
      htmlBtnFiltros(n) +
      (n ? '<span class="imp-filtros-flag" title="Hay filtros aplicados; el listado y el Excel respetan estos filtros">Filtros activos</span>' : '') +
      '<div class="form-group' + (qOn ? ' imp-filtro-activo' : '') + '"><label for="imp-q">Buscar</label>' +
        '<input type="search" id="imp-q" value="' + esc(state.q) + '" placeholder="Movimiento, cargo, detalle, factura…" title="Búsqueda amplia sobre el listado visible"></div>' +
    '</div>';
  }

  function renderShell() {
    var el = root();
    if (!el) return;
    if (!can(PERM_VER)) {
      el.innerHTML = '<p class="imp-empty">No tenés permiso para ver Impuestos.</p>';
      return;
    }
    var k = kpis();
    var meta = regimenMeta(state.regimen);
    el.innerHTML =
      FornitaliaHelp.header(ICO.tax, 'Impuestos', 'tpl-imp-help', 'Ayuda: Impuestos',
        '<p>Cruce de percepciones de Mercado Pago contra el extracto cargado en Conciliación Bancaria, por <strong>Número de movimiento</strong>.</p>' +
        '<p>Elegí el régimen en el combo y cargá el Excel correspondiente (<em>' + esc(meta.archivo) + '</em> para ' + esc(meta.id) + ').</p>' +
        '<p>Si el número está en el extracto MP, se marca En extracto; Conciliado mira si ese movimiento ya está confirmado (o marcado como no requiere) en Conciliación Bancaria.</p>' +
        '<p>' + esc(meta.help) + '</p>') +
      (state.loading ? '<p class="loading">Cargando impuestos…</p>' : '') +
      (state.err ? '<p class="imp-msg-err">' + esc(state.err) + '</p>' : '') +
      (state.msg ? '<p class="imp-msg-ok">' + esc(state.msg) + '</p>' : '') +
      '<div class="imp-tabs">' +
        '<button type="button" class="' + (state.canal === 'mercadopago' ? 'activo' : '') + '" data-imp="canal" data-canal="mercadopago">Mercado Pago</button>' +
      '</div>' +
      '<div class="imp-regimen-title">' +
        '<label class="imp-regimen-label" for="imp-regimen">Régimen</label>' +
        '<select id="imp-regimen" class="imp-regimen-combo" title="Elegí el reporte de percepción" aria-label="Régimen de percepción">' +
          REGIMENES.map(function (r) {
            return '<option value="' + esc(r.id) + '"' + (r.id === state.regimen ? ' selected' : '') + '>' +
              esc(labelRegimen(r)) + '</option>';
          }).join('') +
        '</select>' +
        '<button type="button" class="th-help th-help--inline" data-help="' + esc(meta.help) + '" aria-label="Ayuda: ' + esc(meta.id) + '" title="Ayuda">' + SVG_HELP + '</button>' +
      '</div>' +
      '<div class="imp-toolbar"><div class="imp-acciones">' +
        (can(PERM_CARGAR) ? '<button type="button" class="imp-btn imp-btn-navy" data-imp="up"><span class="btn-icon">' + ICO.upload + '</span>Cargar reporte</button>' : '') +
        (can(PERM_CARGAR) ? '<button type="button" class="imp-btn imp-btn-ghost" data-imp="manual" title="Conciliar percepciones no conciliadas con un movimiento de tesorería Mercado Pago"><span class="btn-icon">' + ICO.link + '</span>Conciliación manual</button>' : '') +
        ((can(PERM_EXPORTAR) || can(PERM_VER)) ? '<button type="button" class="imp-btn imp-btn-excel" data-imp="xlsx"><span class="btn-icon">' + ICO.download + '</span>Excel</button>' : '') +
      '</div></div>' +
      renderFiltros() +
      '<div class="imp-resumen">' +
        '<div class="imp-resumen-card"><p class="lab">Filas</p><p class="val">' + k.n + '</p></div>' +
        '<div class="imp-resumen-card imp-resumen-ok"><p class="lab">En extracto</p><p class="val">' + k.en + '</p></div>' +
        '<div class="imp-resumen-card' + (k.sin ? ' imp-resumen-bad' : '') + '"><p class="lab">Sin extracto</p><p class="val">' + k.sin + '</p></div>' +
        '<div class="imp-resumen-card imp-resumen-ok"><p class="lab">Conciliados</p><p class="val">' + k.conc + '</p></div>' +
        '<div class="imp-resumen-card' + (k.noConc ? ' imp-resumen-warn' : '') + '"><p class="lab">No conciliados</p><p class="val">' + k.noConc + '</p></div>' +
        '<div class="imp-resumen-card' + (k.percNoConc ? ' imp-resumen-warn' : '') + '"><p class="lab">Percibido</p><p class="val">$ ' + esc(formatMonto(k.perc)) + '</p>' +
          '<p class="sub-lab">No conciliado</p><p class="sub">$ ' + esc(formatMonto(k.percNoConc)) + '</p></div>' +
      '</div>' +
      renderTabla();

    var qEl = el.querySelector('#imp-q');
    if (qEl) {
      qEl.addEventListener('input', function () { state.q = qEl.value || ''; });
      qEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          renderShell();
        }
      });
      qEl.addEventListener('search', function () { renderShell(); });
    }
    var regEl = el.querySelector('#imp-regimen');
    if (regEl) {
      regEl.addEventListener('change', function () {
        var next = regimenMeta(regEl.value).id;
        if (next === state.regimen) return;
        state.regimen = next;
        state.q = '';
        state.mes = '';
        state.extracto = '';
        state.conciliado = '';
        cerrarModalFiltros();
        recargarTodo();
      });
    }
  }

  async function cargarDatos() {
    var res = await client().rpc('imp_listar_percepcion_mp', { p_regimen: state.regimen });
    if (res.error) throw res.error;
    state.filas = Array.isArray(res.data) ? res.data : [];
  }

  async function recargarTodo() {
    state.loading = true;
    renderShell();
    try {
      await cargarDatos();
      state.err = '';
    } catch (e) {
      state.err = 'No se pudo cargar Impuestos: ' + errMsg(e);
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
          resolve(global.XLSX.read(ev.target.result, { type: 'array', cellDates: true }));
        } catch (e) { reject(e); }
      };
      reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function pedirArchivos(onFiles) {
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.addEventListener('change', function () {
      var list = input.files ? Array.prototype.slice.call(input.files) : [];
      if (list.length) onFiles(list);
    });
    input.click();
  }

  async function rpcLotes(filas) {
    var i;
    var n = 0;
    for (i = 0; i < filas.length; i += RPC_LOTE) {
      var lote = filas.slice(i, i + RPC_LOTE);
      var res = await client().rpc('imp_guardar_percepcion_mp', { p_regimen: state.regimen, p_filas: lote });
      if (res.error) throw res.error;
      n += Number(res.data) || lote.length;
    }
    return n;
  }

  async function onUpload() {
    if (!can(PERM_CARGAR)) return;
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    pedirArchivos(async function (files) {
      state.loading = true;
      state.err = '';
      state.msg = '';
      renderShell();
      try {
        var total = 0;
        var archivosOk = 0;
        var omitidos = [];
        var dup = 0;
        var i;
        for (i = 0; i < files.length; i++) {
          var file = files[i];
          var reg = regimenDeArchivo(file.name);
          if (reg && !regimenConocido(reg)) {
            omitidos.push(file.name + ' (' + reg + ')');
            continue;
          }
          if (reg && reg !== state.regimen) {
            omitidos.push(file.name + ' (' + labelRegimen(regimenMeta(reg)) + ')');
            continue;
          }
          var wb = await leerExcelFile(file);
          var parsed = parsePercepcionMp(wb, file.name);
          if (parsed.error) throw new Error(file.name + ': ' + parsed.error);
          total += await rpcLotes(parsed.filas);
          archivosOk += 1;
          dup += parsed.omitidasDup || 0;
        }
        await cargarDatos();
        var extra = '';
        if (dup) extra += ' Se omitieron ' + dup + ' Números de movimiento duplicados en el archivo.';
        if (omitidos.length) extra += ' No se cargaron (otro régimen; cambiá el combo): ' + omitidos.join(', ') + '.';
        if (!archivosOk) throw new Error(omitidos.length ? 'Ningún archivo era ' + state.regimen + '.' + extra : 'No se cargó ningún archivo.');
        var k = kpis();
        state.msg = 'Se cargaron o actualizaron ' + total + ' percepciones ' + state.regimen + ' en ' + archivosOk + ' archivo' + (archivosOk === 1 ? '' : 's') +
          '. En extracto MP: ' + k.en + ' · sin extracto: ' + k.sin + '.' + extra;
      } catch (e) {
        state.err = errMsg(e);
      } finally {
        state.loading = false;
        renderShell();
      }
    });
  }

  function excelNum(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function exportarExcel() {
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    var list = filasVisibles();
    var headers = [
      'Fecha cargo', 'Nº movimiento', 'Nº cargo', 'Detalle', 'Factura legal',
      'Importe c/IVA', 'Importe s/IVA', 'Base imponible', 'Alícuota', 'Monto percibido',
      'En extracto MP', 'Conciliado', 'Tipo extracto', 'Importe extracto', 'Fecha extracto',
      'Tesorería fecha', 'Tesorería importe', 'Tesorería', 'Archivo'
    ];
    var aoa = [headers];
    var dateCols = { 0: true, 14: true, 15: true };
    var numCols = { 5: true, 6: true, 7: true, 8: true, 9: true, 13: true, 16: true };
    list.forEach(function (f) {
      aoa.push([
        ymdToExcelSerial(f.fecha),
        f.origen_id || '',
        f.numero_cargo || '',
        f.detalle || '',
        f.factura_legal || '',
        excelNum(f.importe_con_iva),
        excelNum(f.importe_sin_iva),
        excelNum(f.base_imponible),
        excelNum(f.alicuota),
        excelNum(f.monto_percibido),
        truthy(f.en_extracto) ? 'Sí' : 'No',
        etiquetaConciliado(f),
        f.extracto_tipo || '',
        truthy(f.en_extracto) ? excelNum(f.extracto_monto) : null,
        truthy(f.en_extracto) ? ymdToExcelSerial(f.extracto_fecha) : null,
        f.tesoreria_id ? ymdToExcelSerial(f.tesoreria_fecha) : null,
        f.tesoreria_id ? excelNum(f.tesoreria_monto) : null,
        f.tesoreria_id ? (f.tesoreria_descripcion || 'Sí') : '',
        f.archivo || ''
      ]);
    });
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    var r;
    for (r = 2; r <= aoa.length; r++) {
      Object.keys(dateCols).forEach(function (c) {
        var addr = global.XLSX.utils.encode_cell({ r: r - 1, c: Number(c) });
        if (ws[addr] && typeof ws[addr].v === 'number') {
          ws[addr].t = 'n';
          ws[addr].z = 'dd/mm/yyyy';
        }
      });
      Object.keys(numCols).forEach(function (c) {
        var addr = global.XLSX.utils.encode_cell({ r: r - 1, c: Number(c) });
        if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].t = 'n';
      });
    }
    ws['!cols'] = headers.map(function (_, i) { return { wch: i === 3 ? 42 : 16 }; });
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, state.regimen);
    global.XLSX.writeFile(wb, 'Impuestos_MP_' + state.regimen + '.xlsx');
  }

  function toggleSort(key) {
    if (!key) return;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else {
      state.sort.key = key;
      state.sort.dir = key === 'fecha' ? 'desc' : 'asc';
    }
  }

  function onClick(ev) {
    var t = ev.target.closest && ev.target.closest('[data-imp]');
    if (!t) return;
    var el = root();
    if (el && !el.contains(t)) return;
    var a = t.getAttribute('data-imp');
    if (a === 'up') { onUpload(); return; }
    if (a === 'xlsx') { exportarExcel(); return; }
    if (a === 'manual') { abrirModalManual(); return; }
    if (a === 'filtros') { abrirModalFiltros(); return; }
    if (a === 'sort') { toggleSort(t.getAttribute('data-sort')); renderShell(); return; }
  }

  function ensureMounted() {
    var el = root();
    if (!el || state.mounted) return;
    el.addEventListener('click', onClick);
    state.mounted = true;
  }

  function init(o) {
    opts = o || opts;
    ensureMounted();
  }

  function show() {
    ensureMounted();
    cerrarModalFiltros();
    cerrarModalManual();
    recargarTodo();
  }

  global.FornitaliaImpuestos = { init: init, show: show };
})(window);
