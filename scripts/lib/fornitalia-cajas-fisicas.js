/**
 * Cajas (físicas) – Fornitalia
 * Efectivo-f (ARS) (tesoreria_efectivo_pesos / cierre_PES),
 * Morba-s/f (ARS) (tesoreria_transferencia_morba / cierre_MOR),
 * Efectivo-f (USD) (tesoreria_efectivo_dolar / cierre_DOL, pesificado al MEP),
 * Efectivo-s/f (ARS) y Efectivo-s/f (USD) (histórico Caja Efectivo … sin factura).
 * Misma lógica de carga que conciliación, sin extracto ni match.
 * window.FornitaliaCajasFisicas.init({ client, hasPerm, getRoot })
 */
(function (global) {
  'use strict';

  var ZONA_AR = 'America/Argentina/Buenos_Aires';
  var CANAL_GF = 'galicia_facturada';
  var LABEL_GF = 'Efectivo-f (ARS)';
  var CANAL_MOR = 'morba_sf';
  var LABEL_MOR = 'Morba-s/f (ARS)';
  var CANAL_USD = 'galicia_dolar';
  var LABEL_USD = 'Efectivo-f (USD)';
  var CANAL_SF = 'efectivo_sf';
  var LABEL_SF = 'Efectivo-s/f (ARS)';
  var CANAL_SF_USD = 'efectivo_sf_usd';
  var LABEL_SF_USD = 'Efectivo-s/f (USD)';
  var PERM_VER = 'ver_cajas_fisicas';
  var PERM_CARGAR = 'cargar_cajas_fisicas';
  var PERM_EXPORTAR = 'exportar_cajas_fisicas';
  var SUPABASE_PAGE = 1000;
  var RPC_LOTE = 250;

  var ICO = {
    cash: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
  };

  var opts = { client: null, hasPerm: function () { return true; }, getRoot: function () { return null; } };
  var state = {
    mounted: false,
    loading: false,
    canal: CANAL_GF,
    lista: 'movimientos',
    movimientos: [],
    tcMap: {},
    tcFechas: [],
    tcLoaded: false,
    q: '',
    mes: '',
    tipo: '',
    categoria: '',
    cuenta: '',
    sort: {
      movimientos: { key: 'fecha', dir: 'desc' },
      bajas: { key: 'fecha', dir: 'desc' }
    },
    modalFiltros: null,
    filtrosDraft: null,
    modal: null,
    resumenCarga: null,
    msg: '',
    err: ''
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
    return '';
  }

  function parseHora(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
      return pad2(v.getUTCHours()) + ':' + pad2(v.getUTCMinutes());
    }
    if (typeof v === 'number' && v > 0 && v < 1) {
      var secs = Math.round(v * 86400);
      return pad2(Math.floor(secs / 3600)) + ':' + pad2(Math.floor((secs % 3600) / 60));
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    return m ? pad2(m[1]) + ':' + m[2] : '';
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

  function round2(n) {
    var v = Number(n);
    if (!isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  }

  function normHeader(h) {
    return String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  function esStatusAnulado(status) {
    return normHeader(status) === 'anulado';
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

  function esMapaTesoreria(map) {
    return map['fecha'] != null && map['tipo'] != null && (map['credito'] != null || map['debito'] != null);
  }

  function esMapaTesoreriaCierre(map) {
    return map['fecha'] != null && map['tipo'] != null && map['monto'] != null &&
      map['credito'] == null && map['debito'] == null;
  }

  function mapaTesoreriaTieneId(map) {
    return !!(map && Object.prototype.hasOwnProperty.call(map, 'id'));
  }

  function esNombreTesoreriaHistorico(archivo) {
    var t = normHeader(archivo);
    return /movimientos[_\s-]*historico/.test(t) || /historico[_\s-]*importar/.test(t);
  }

  function esFilaPieTesoreria(fechaRaw, tipo) {
    var f = String(fechaRaw || '').trim().toLowerCase();
    var t = String(tipo || '').trim().toLowerCase();
    if (!f && !t) return true;
    if (/^total\b/.test(f) || /^total\b/.test(t)) return true;
    if (/^\$/.test(f) || /^\$/.test(t)) return true;
    return false;
  }

  function labelDeCanal(c) {
    if (c === CANAL_MOR) return LABEL_MOR;
    if (c === CANAL_USD) return LABEL_USD;
    if (c === CANAL_SF) return LABEL_SF;
    if (c === CANAL_SF_USD) return LABEL_SF_USD;
    return LABEL_GF;
  }

  function archivosHint(c) {
    if (c === CANAL_MOR) return 'tesoreria_transferencia_morba_… o cierre_MOR-…';
    if (c === CANAL_USD) return 'tesoreria_efectivo_dolar_… o cierre_DOL-…';
    if (c === CANAL_SF || c === CANAL_SF_USD) return 'histórico movimientos-historico_… (Caja Efectivo … sin factura)';
    return 'tesoreria_efectivo_pesos_… o cierre_PES-…';
  }

  function excelNombreCanal(c) {
    if (c === CANAL_MOR) return 'Cajas_Morba-sf_ARS_';
    if (c === CANAL_USD) return 'Cajas_Efectivo-f_USD_';
    if (c === CANAL_SF) return 'Cajas_Efectivo-sf_ARS_';
    if (c === CANAL_SF_USD) return 'Cajas_Efectivo-sf_USD_';
    return 'Cajas_Efectivo-f_ARS_';
  }

  function esCanalCaja(c) {
    return c === CANAL_GF || c === CANAL_MOR || c === CANAL_USD || c === CANAL_SF || c === CANAL_SF_USD;
  }

  function esCanalUsd(c) {
    return c === CANAL_USD || c === CANAL_SF_USD;
  }

  async function ensureTipoCambio() {
    if (state.tcLoaded) return;
    var all = [];
    var offset = 0;
    for (;;) {
      var res = await client().from('tipo_de_cambio')
        .select('fecha, usd_mep')
        .order('fecha', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + SUPABASE_PAGE - 1);
      if (res.error) throw res.error;
      var chunk = res.data || [];
      all = all.concat(chunk);
      if (chunk.length < SUPABASE_PAGE) break;
      offset += SUPABASE_PAGE;
    }
    var map = {};
    all.forEach(function (r) {
      var f = String(r && r.fecha || '').slice(0, 10);
      var t = Number(r && r.usd_mep);
      if (f && isFinite(t) && t > 0 && !map[f]) map[f] = t;
    });
    state.tcMap = map;
    state.tcFechas = Object.keys(map).sort();
    state.tcLoaded = true;
  }

  function tasaMepParaFecha(fecha) {
    var f = String(fecha || '').slice(0, 10);
    if (!f) return null;
    if (state.tcMap[f] > 0) return { tasa: state.tcMap[f], fechaTc: f };
    var list = state.tcFechas || [];
    var best = null;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] <= f) best = list[i];
      else break;
    }
    if (!best || !(state.tcMap[best] > 0)) return null;
    return { tasa: state.tcMap[best], fechaTc: best };
  }

  function formatFechaCorta(ymd) {
    var p = String(ymd || '').slice(0, 10).split('-');
    if (p.length !== 3) return String(ymd || '');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function pesificarParsed(parsed) {
    var faltan = [];
    function conv(usd, fecha) {
      var t = tasaMepParaFecha(fecha);
      if (!t) {
        if (fecha && faltan.indexOf(fecha) < 0) faltan.push(fecha);
        return null;
      }
      var n = Number(usd);
      if (!isFinite(n)) return { ars: null, tasa: t.tasa, fechaTc: t.fechaTc };
      return { ars: round2(n * t.tasa), tasa: t.tasa, fechaTc: t.fechaTc };
    }
    var iniArs = null;
    (parsed.aperturas || []).forEach(function (a) {
      var c = conv(a.usd, a.fecha || parsed.fechaApertura);
      if (c && c.ars != null) iniArs = (iniArs == null ? 0 : iniArs) + c.ars;
    });
    if (!(parsed.aperturas || []).length && parsed.saldoApertura != null) {
      var ap = conv(parsed.saldoApertura, parsed.fechaApertura);
      if (ap && ap.ars != null) iniArs = ap.ars;
    }
    parsed.saldoAperturaUsd = parsed.saldoApertura;
    parsed.saldoApertura = iniArs != null ? round2(iniArs) : null;
    (parsed.filas || []).forEach(function (f) {
      var t = conv(f.monto, f.fecha);
      var cred = f.credito != null ? conv(f.credito, f.fecha) : null;
      var deb = f.debito != null ? conv(f.debito, f.fecha) : null;
      var sal = f.saldo != null ? conv(f.saldo, f.fecha) : null;
      if (!t) return;
      f.monto_usd = round2(f.monto);
      f.tipo_cambio_mep = t.tasa;
      f.tipo_cambio_fecha = t.fechaTc;
      f.monto = t.ars != null ? t.ars : 0;
      f.credito = cred && cred.ars != null ? cred.ars : null;
      f.debito = deb && deb.ars != null ? Math.abs(deb.ars) : null;
      f.saldo = sal && sal.ars != null ? sal.ars : null;
      f.moneda = 'ARS';
      if (!f.raw) f.raw = {};
      f.raw.monto_usd = f.monto_usd;
      f.raw.tipo_cambio_mep = t.tasa;
      f.raw.tipo_cambio_fecha = t.fechaTc;
      f.raw.moneda_origen = 'USD';
    });
    if (faltan.length) {
      throw new Error(
        'No hay tipo de cambio MEP en la tabla tipo_de_cambio para ' +
        faltan.slice(0, 5).map(formatFechaCorta).join(', ') +
        (faltan.length > 5 ? ' y ' + (faltan.length - 5) + ' fecha(s) más' : '') +
        ' ni para un día anterior. Cargá cotizaciones y reintentá.'
      );
    }
    return parsed;
  }

  function esCajaSinFacturaTexto(archivo, caja, hoja) {
    var t = normHeader([archivo, caja, hoja].filter(Boolean).join(' '));
    if (t.indexOf('sin factura') >= 0) return true;
    if (t.indexOf('s/f') >= 0) return true;
    if (t.indexOf('sinfactura') >= 0) return true;
    return false;
  }

  function esArchivoCajaGaliciaFacturada(archivo, caja, hoja) {
    if (esCajaSinFacturaTexto(archivo, caja, hoja)) return false;
    var t = normHeader([archivo, caja, hoja].filter(Boolean).join(' '));
    if (t.indexOf('efectivo pesos') >= 0) return true;
    if (t.indexOf('tesoreria_efectivo_pesos') >= 0) return true;
    if (/\bcierre[_\s-]*pes\b/.test(t) || /\bpes-/.test(t)) return true;
    return false;
  }

  function esArchivoCajaMorba(archivo, caja, hoja) {
    var t = normHeader([archivo, caja, hoja].filter(Boolean).join(' '));
    if (t.indexOf('transferencia morba') >= 0 || t.indexOf('transferencia morva') >= 0) return true;
    if (t.indexOf('tesoreria_transferencia_morba') >= 0 || t.indexOf('tesoreria_transferencia_morva') >= 0) return true;
    if (/\bcierre[_\s-]*mor\b/.test(t) || /\bmor-/.test(t)) return true;
    return false;
  }

  function esArchivoCajaDolar(archivo, caja, hoja) {
    if (esCajaSinFacturaTexto(archivo, caja, hoja)) return false;
    var cajaN = normHeader(caja);
    if (cajaN.indexOf('transferencia galicia dolar') >= 0) return false;
    var t = normHeader([archivo, caja, hoja].filter(Boolean).join(' '));
    if (t.indexOf('efectivo dolar') >= 0 || t.indexOf('efectivo dollar') >= 0) return true;
    if (t.indexOf('tesoreria_efectivo_dolar') >= 0) return true;
    if (/\bcierre[_\s-]*dol\b/.test(t) || /\bdol-/.test(t)) return true;
    return false;
  }

  function canalDetectadoArchivo(archivo, caja, hoja, moneda) {
    if (esCajaSinFacturaTexto(archivo, caja, hoja)) {
      var mon = String(moneda || '').trim().toUpperCase();
      var blob = normHeader([archivo, caja, hoja, moneda].filter(Boolean).join(' '));
      if (mon === 'USD' || blob.indexOf('dolar') >= 0 || blob.indexOf('dollar') >= 0 || /\busd\b/.test(blob)) return CANAL_SF_USD;
      return CANAL_SF;
    }
    var mor = esArchivoCajaMorba(archivo, caja, hoja);
    var gf = esArchivoCajaGaliciaFacturada(archivo, caja, hoja);
    var usd = esArchivoCajaDolar(archivo, caja, hoja);
    if (usd && !mor && !gf) return CANAL_USD;
    if (mor && !gf && !usd) return CANAL_MOR;
    if (gf && !mor && !usd) return CANAL_GF;
    var a = normHeader(archivo);
    if (usd || /\bcierre[_\s-]*dol\b/.test(a) || /\bdol-/.test(a) || a.indexOf('efectivo_dolar') >= 0) return CANAL_USD;
    if (mor || a.indexOf('morba') >= 0 || a.indexOf('morva') >= 0 || /\bcierre[_\s-]*mor\b/.test(a) || /\bmor-/.test(a)) return CANAL_MOR;
    if (gf || a.indexOf('efectivo_pesos') >= 0 || /\bcierre[_\s-]*pes\b/.test(a) || /\bpes-/.test(a)) return CANAL_GF;
    return '';
  }

  function esArchivoBancoConciliable(archivo, caja, hoja) {
    var t = normHeader([archivo, caja, hoja].filter(Boolean).join(' '));
    if (t.indexOf('mercadopago') >= 0 || t.indexOf('mercado pago') >= 0) return true;
    if (t.indexOf('transferencia galicia') >= 0) return true;
    if (t.indexOf('extracto') >= 0 && t.indexOf('galicia') >= 0) return true;
    if (t.indexOf('credicoop') >= 0 || t.indexOf('credicop') >= 0) return true;
    return false;
  }

  function filasHoja(wb, name) {
    var sheet = wb.Sheets[name];
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    return { rows: rows, map: mapHeaders(rows[0] || []) };
  }

  function detectarHojaCaja(wb, archivo) {
    var names = wb.SheetNames || [];
    var i;
    for (i = 0; i < names.length; i++) {
      var info = filasHoja(wb, names[i]);
      if (esMapaTesoreria(info.map) || esMapaTesoreriaCierre(info.map)) {
        return { hoja: names[i], map: info.map, rows: info.rows };
      }
    }
    return { hoja: names[0] || '', map: {}, rows: [] };
  }

  function parseCajaExcel(wb, archivo) {
    var det = detectarHojaCaja(wb, archivo);
    if (!det.rows.length) return { error: 'El Excel no tiene filas.', filas: [] };
    var map = det.map;
    var esCierre = esMapaTesoreriaCierre(map);
    if (!esMapaTesoreria(map) && !esCierre) {
      return {
        error: 'No reconocí el archivo de caja. Esperaba tesorería (Tipo, Fecha, Crédito, Débito e Id) o cierre (Fecha, Tipo, Monto e Id). En esta solapa: ' + archivosHint(state.canal) + '.',
        filas: []
      };
    }
    var cajaMuestra = '';
    var r;
    for (r = 1; r < Math.min(det.rows.length, 8); r++) {
      cajaMuestra = String(cell(det.rows[r] || [], map, ['Caja']) || '').trim();
      if (cajaMuestra) break;
    }
    var historicoMixto = esNombreTesoreriaHistorico(archivo);
    if (!historicoMixto && esArchivoBancoConciliable(archivo, cajaMuestra, det.hoja)) {
      return {
        error: 'Este archivo es de Conciliación Bancaria (Galicia, Credicoop o Mercado Pago). Cargalo en ese menú.',
        filas: []
      };
    }
    var canalArch = historicoMixto ? state.canal : canalDetectadoArchivo(archivo, cajaMuestra, det.hoja);
    if (!canalArch) {
      return {
        error: 'En ' + labelDeCanal(state.canal) + ' esperaba ' + archivosHint(state.canal) + '.',
        filas: []
      };
    }
    if (canalArch !== state.canal) {
      return {
        error: 'Ese archivo es de ' + labelDeCanal(canalArch) + '. Pasá a esa solapa y volvé a cargar. Ahora estás en ' + labelDeCanal(state.canal) + '.',
        filas: []
      };
    }
    if (!mapaTesoreriaTieneId(map)) {
      return { error: 'El archivo tiene que traer columna Id (igual que en tesorería de conciliación).', filas: [] };
    }
    var idsVistos = {};
    var filas = [];
    var omitidasPend = 0;
    var omitidasAnulado = 0;
    var origenIdsAnulado = [];
    var omitidasSinId = 0;
    var omitidasIdDup = 0;
    var omitidasApertura = 0;
    var omitidasOtraCaja = 0;
    var saldoApertura = null;
    var fechaApertura = '';
    var aperturas = [];
    for (r = 1; r < det.rows.length; r++) {
      var row = det.rows[r] || [];
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
      var monedaFila = String(cell(row, map, ['Moneda']) || '').trim() || 'ARS';
      if (historicoMixto) {
        if (!caja || canalDetectadoArchivo('', caja, '', monedaFila) !== state.canal) {
          omitidasOtraCaja += 1;
          continue;
        }
      } else if (caja && canalDetectadoArchivo('', caja, '', monedaFila) !== state.canal) {
        omitidasOtraCaja += 1;
        continue;
      }
      var usuario = String(cell(row, map, ['Usuario']) || '').trim();
      var status = String(cell(row, map, ['Status', 'Estado']) || '').trim();
      var tcFila = parseMonto(cell(row, map, ['Tipo de Cambio', 'Tipo_Cambio', 'TC', 'Tipo Cambio']));
      var idCierre = String(cell(row, map, ['Id', 'ID']) || '').trim();
      if (esAperturaDeCajaTexto(tipo, desc)) {
        omitidasApertura += 1;
        var salAp = saldo;
        if (salAp == null && esCierre) salAp = parseMonto(cell(row, map, ['Monto']));
        if (salAp != null) {
          saldoApertura = (saldoApertura == null ? 0 : saldoApertura) + Number(salAp);
          if (fecha && (!fechaApertura || fecha < fechaApertura)) fechaApertura = fecha;
          aperturas.push({ fecha: fecha || fechaApertura, usd: Number(salAp) });
        }
        continue;
      }
      if (esStatusAnulado(status)) {
        omitidasAnulado += 1;
        if (idCierre) origenIdsAnulado.push('id|' + idCierre);
        continue;
      }
      var esPendiente = normHeader(status) === 'pendiente';
      if (esPendiente && !idCierre) {
        omitidasPend += 1;
        continue;
      }
      if (esCierre) {
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
      if (!tipo && !fecha && cred == null && deb == null && saldo == null) continue;
      if (!idCierre) {
        omitidasSinId += 1;
        continue;
      }
      if (idsVistos[idCierre]) {
        omitidasIdDup += 1;
        continue;
      }
      idsVistos[idCierre] = true;
      var monto = 0;
      if (cred != null && cred !== 0) monto = cred;
      else if (deb != null && deb !== 0) monto = -Math.abs(deb);
      var fechaHora = fecha ? fecha + 'T' + (hora || '00:00') + ':00-03:00' : null;
      filas.push({
        origen_id: 'id|' + idCierre,
        fecha: fecha || fechaHoyYmd(),
        fecha_hora: fechaHora,
        tipo: tipo || null,
        descripcion: desc || null,
        contraparte: cliente || null,
        monto: round2(monto) || 0,
        moneda: monedaFila,
        categoria: cat || null,
        cuenta_contable: cta || null,
        credito: cred,
        debito: deb,
        saldo: saldo,
        archivo: archivo,
        fila_excel: r + 1,
        raw: {
          tipo: tipo, fecha: fecha, hora: hora, categoria: cat, cuenta_contable: cta,
          descripcion: desc, cliente: cliente, credito: cred, debito: deb, saldo: saldo,
          observaciones: obs, caja: caja || null, usuario: usuario || null, status: status || null,
          moneda: monedaFila, tipo_cambio: tcFila,
          id: idCierre, formato: esCierre ? 'cierre' : 'tesoreria'
        },
        soloSiExiste: esPendiente
      });
    }
    if (!filas.length) {
      if (omitidasAnulado && !omitidasOtraCaja) {
        return {
          error: null,
          filas: [],
          formatoCierre: esCierre,
          formatoHistorico: historicoMixto,
          omitidasPend: omitidasPend,
          omitidasAnulado: omitidasAnulado,
          origenIdsAnulado: origenIdsAnulado,
          omitidasIdDup: omitidasIdDup,
          omitidasApertura: omitidasApertura,
          omitidasOtraCaja: omitidasOtraCaja,
          omitidasSinId: omitidasSinId,
          saldoApertura: saldoApertura,
          fechaApertura: fechaApertura,
          aperturas: aperturas
        };
      }
      return {
        error: omitidasOtraCaja && historicoMixto
          ? 'Este histórico no tiene filas de ' + labelDeCanal(state.canal) + '. Mercado Pago, Galicia y Credicoop van a Conciliación Bancaria; en esta solapa solo entra ' + archivosHint(state.canal) + '.'
          : omitidasApertura
          ? 'El archivo solo tenía Apertura de Caja; ese tipo no se carga.'
          : omitidasSinId
            ? 'El archivo tiene columna Id pero ninguna fila con Id para cargar.'
            : 'No encontré filas de caja para cargar.',
        filas: []
      };
    }
    return {
      error: null,
      filas: filas,
      formatoCierre: esCierre,
      formatoHistorico: historicoMixto,
      omitidasPend: omitidasPend,
      omitidasAnulado: omitidasAnulado,
      origenIdsAnulado: origenIdsAnulado,
      omitidasIdDup: omitidasIdDup,
      omitidasApertura: omitidasApertura,
      omitidasOtraCaja: omitidasOtraCaja,
      omitidasSinId: omitidasSinId,
      saldoApertura: saldoApertura,
      fechaApertura: fechaApertura,
      aperturas: aperturas
    };
  }

  function snapshotSaldo(filas, archivo, formatoCierre, saldoApertura, fechaApertura, canal) {
    if (!filas || !filas.length) return null;
    var orden = filas.slice().sort(function (a, b) {
      var c = String(a.fecha).localeCompare(String(b.fecha));
      if (c) return c;
      return (a.fila_excel || 0) - (b.fila_excel || 0);
    });
    var fechas = orden.map(function (f) { return f.fecha; }).filter(Boolean);
    if (fechaApertura) fechas.push(fechaApertura);
    fechas.sort();
    var ini = saldoApertura != null && isFinite(Number(saldoApertura)) ? Number(saldoApertura) : null;
    var fin = null;
    var i;
    if (!formatoCierre) {
      for (i = orden.length - 1; i >= 0; i--) {
        if (orden[i].saldo != null) { fin = Number(orden[i].saldo); break; }
      }
      if (ini == null) {
        for (i = 0; i < orden.length; i++) {
          if (orden[i].saldo != null) { ini = Number(orden[i].saldo); break; }
        }
      }
    }
    if (fin == null) {
      var run = ini != null && isFinite(ini) ? ini : 0;
      for (i = 0; i < orden.length; i++) {
        if (orden[i].credito != null) run += Number(orden[i].credito) || 0;
        if (orden[i].debito != null) run -= Math.abs(Number(orden[i].debito) || 0);
      }
      fin = round2(run);
      if (ini == null) ini = 0;
    }
    var c = esCanalCaja(canal) ? canal : CANAL_GF;
    return {
      canal: c,
      moneda: 'ARS',
      nro_cuenta: c,
      tipo_cuenta: labelDeCanal(c),
      fecha_desde: fechas[0] || fechaHoyYmd(),
      fecha_hasta: fechas[fechas.length - 1] || fechaHoyYmd(),
      saldo_inicial: round2(ini),
      saldo_final: round2(fin),
      documento_id: String(archivo || '').replace(/\.[^.]+$/, ''),
      archivo: archivo,
      raw: { formato: formatoCierre ? 'cierre' : 'tesoreria', movimientos: filas.length, pesificado_mep: esCanalUsd(c) }
    };
  }

  function movimientosCanal() {
    return (state.movimientos || []).filter(function (m) { return m.canal === state.canal; });
  }

  function filasMovimientos() {
    return movimientosCanal().filter(function (m) { return !m.pendiente_baja; });
  }

  function filasBajas() {
    return movimientosCanal().filter(function (m) { return m.pendiente_baja; });
  }

  function valorCatCta(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s || s === '-' || s === '—') return '';
    return s;
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

  function filasParaOpciones() {
    return movimientosCanal();
  }

  function opcionesMes() {
    var set = {};
    filasParaOpciones().forEach(function (m) {
      var ym = mesYYYYMM(m.fecha);
      if (ym) set[ym] = true;
    });
    return Object.keys(set).sort().reverse();
  }

  function opcionesTipo(filtro) {
    var f = filtro || {};
    var set = {};
    filasParaOpciones().forEach(function (m) {
      if (f.mes && mesYYYYMM(m.fecha) !== f.mes) return;
      var v = String(m.tipo || '').trim();
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(sortTxtEs);
  }

  function opcionesCategoria(filtro) {
    var f = filtro || {};
    var set = {};
    filasParaOpciones().forEach(function (m) {
      if (f.mes && mesYYYYMM(m.fecha) !== f.mes) return;
      if (f.tipo && String(m.tipo || '').trim() !== f.tipo) return;
      var v = valorCatCta(m.categoria);
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(sortTxtEs);
  }

  function opcionesCuenta(filtro) {
    var f = filtro || {};
    var set = {};
    filasParaOpciones().forEach(function (m) {
      if (f.mes && mesYYYYMM(m.fecha) !== f.mes) return;
      if (f.tipo && String(m.tipo || '').trim() !== f.tipo) return;
      if (f.categoria && valorCatCta(m.categoria) !== f.categoria) return;
      var v = valorCatCta(m.cuenta_contable);
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(sortTxtEs);
  }

  function syncCamposFiltro(src) {
    if (!src) return;
    var meses = opcionesMes();
    if (src.mes && meses.indexOf(src.mes) < 0) src.mes = '';
    var tipos = opcionesTipo({ mes: src.mes || '' });
    if (src.tipo && tipos.indexOf(src.tipo) < 0) src.tipo = '';
    var cats = opcionesCategoria({ mes: src.mes || '', tipo: src.tipo || '' });
    if (src.categoria && cats.indexOf(src.categoria) < 0) src.categoria = '';
    var ctas = opcionesCuenta({ mes: src.mes || '', tipo: src.tipo || '', categoria: src.categoria || '' });
    if (src.cuenta && ctas.indexOf(src.cuenta) < 0) src.cuenta = '';
  }

  function contarFiltrosEstructurales(src) {
    var s = src || {};
    var n = 0;
    if (s.mes) n++;
    if (s.tipo) n++;
    if (s.categoria) n++;
    if (s.cuenta) n++;
    return n;
  }

  function pasaBuscar(m) {
    var q = normHeader(state.q);
    if (!q) return true;
    var blob = normHeader([
      m.fecha, m.tipo, m.descripcion, m.contraparte, m.categoria, m.cuenta_contable,
      m.origen_id, m.monto, m.credito, m.debito, m.saldo, m.monto_usd, m.tipo_cambio_mep
    ].join(' '));
    return blob.indexOf(q) >= 0;
  }

  function pasaFiltros(m) {
    if (!pasaBuscar(m)) return false;
    if (state.mes && mesYYYYMM(m.fecha) !== state.mes) return false;
    if (state.tipo && String(m.tipo || '').trim() !== state.tipo) return false;
    if (state.categoria && valorCatCta(m.categoria) !== state.categoria) return false;
    if (state.cuenta && valorCatCta(m.cuenta_contable) !== state.cuenta) return false;
    return true;
  }

  function sortActual() {
    if (!state.sort[state.lista]) state.sort[state.lista] = { key: 'fecha', dir: 'desc' };
    return state.sort[state.lista];
  }

  function toggleSort(key) {
    if (!key) return;
    var cur = sortActual();
    if (cur.key === key) {
      cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
    } else {
      cur.key = key;
      cur.dir = (key === 'fecha' || key === 'credito' || key === 'debito' || key === 'saldo' || key === 'monto' || key === 'monto_usd' || key === 'tipo_cambio_mep') ? 'desc' : 'asc';
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

  function valFila(m, key) {
    if (key === 'tipo') return { v: m.tipo, t: 'txt' };
    if (key === 'descripcion') return { v: m.descripcion, t: 'txt' };
    if (key === 'contraparte') return { v: m.contraparte, t: 'txt' };
    if (key === 'categoria') return { v: valorCatCta(m.categoria), t: 'txt' };
    if (key === 'cuenta_contable') return { v: valorCatCta(m.cuenta_contable), t: 'txt' };
    if (key === 'credito') return { v: m.credito, t: 'num' };
    if (key === 'debito') return { v: m.debito, t: 'num' };
    if (key === 'saldo') return { v: m.saldo, t: 'num' };
    if (key === 'monto') return { v: m.monto, t: 'num' };
    if (key === 'monto_usd') return { v: m.monto_usd, t: 'num' };
    if (key === 'tipo_cambio_mep') return { v: m.tipo_cambio_mep, t: 'num' };
    if (key === 'id') return { v: idVisible(m), t: 'txt' };
    return { v: m.fecha, t: 'fecha' };
  }

  function ordenarFilas(arr) {
    var cur = sortActual();
    var dir = cur.dir === 'asc' ? 1 : -1;
    return arr.slice().sort(function (a, b) {
      var va = valFila(a, cur.key);
      var vb = valFila(b, cur.key);
      var c = cmpVal(va.v, vb.v, va.t);
      if (c === 0) c = String(a.id || '').localeCompare(String(b.id || ''));
      return c * dir;
    });
  }

  function thSort(key, label, extraCls) {
    var cur = sortActual();
    var activo = cur.key === key;
    var dirTxt = activo ? (cur.dir === 'asc' ? 'ascendente' : 'descendente') : 'sin ordenar';
    var ind = activo ? (cur.dir === 'asc' ? '▲' : '▼') : '↕';
    return '<th class="cf-th-sort ' + (extraCls || '') + (activo ? ' cf-th-sort-activo' : '') + '">' +
      '<button type="button" class="cf-th-sort-btn" data-cf="sort" data-sort="' + esc(key) + '"' +
      ' title="Ordenar ' + esc(label) + ' (' + dirTxt + ')" aria-label="Ordenar por ' + esc(label) + ', ' + dirTxt + '">' +
      esc(label) + '<span class="cf-sort-ind" aria-hidden="true">' + ind + '</span></button></th>';
  }

  function filasVisibles() {
    var list = state.lista === 'bajas' ? filasBajas() : filasMovimientos();
    return ordenarFilas(list.filter(pasaFiltros));
  }

  function kpis() {
    var movs = filasMovimientos().filter(pasaFiltros);
    var ing = 0;
    var egr = 0;
    var saldo = null;
    var lastFecha = '';
    movs.forEach(function (m) {
      if (m.credito != null) ing += Number(m.credito) || 0;
      if (m.debito != null) egr += Math.abs(Number(m.debito) || 0);
    });
    filasMovimientos().forEach(function (m) {
      if (m.saldo != null && String(m.fecha) >= lastFecha) {
        lastFecha = String(m.fecha);
        saldo = Number(m.saldo);
      }
    });
    return {
      n: movs.length,
      ingresos: round2(ing),
      egresos: round2(egr),
      saldo: saldo != null ? round2(saldo) : round2(ing - egr),
      bajas: filasBajas().length
    };
  }

  function htmlMonto(n) {
    var v = Number(n);
    var cls = '';
    if (isFinite(v) && v > 0) cls = ' cf-monto-pos';
    else if (isFinite(v) && v < 0) cls = ' cf-monto-neg';
    return '<span class="' + cls + '">' + esc(formatMonto(n)) + '</span>';
  }

  function idVisible(m) {
    var oid = String(m.origen_id || '');
    if (oid.indexOf('id|') === 0) return oid.slice(3);
    return oid || '—';
  }

  function btnIcon(action, id, title, svg, extraCls) {
    return '<button type="button" class="cf-btn cf-btn-ghost cf-btn-icon-only' + (extraCls ? ' ' + extraCls : '') +
      '" data-cf="' + esc(action) + '" data-id="' + esc(id) + '" title="' + esc(title) + '" aria-label="' + esc(title) +
      '"><span class="btn-icon">' + svg + '</span></button>';
  }

  async function cargarDatos() {
    var all = [];
    var offset = 0;
    for (;;) {
      var res = await client().from('cf_movimiento').select('*')
        .eq('canal', state.canal)
        .order('fecha', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + SUPABASE_PAGE - 1);
      if (res.error) throw res.error;
      var chunk = res.data || [];
      all = all.concat(chunk);
      if (chunk.length < SUPABASE_PAGE) break;
      offset += SUPABASE_PAGE;
    }
    state.movimientos = all;
  }

  async function recargarTodo() {
    state.loading = true;
    renderShell();
    try {
      await cargarDatos();
      state.err = '';
    } catch (e) {
      state.err = 'No se pudo cargar Cajas (físicas): ' + errMsg(e);
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

  function pedirArchivo(onFile) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (f) onFile(f);
    });
    input.click();
  }

  async function rpcLotes(nombre, canal, filas) {
    var i;
    var n = 0;
    for (i = 0; i < filas.length; i += RPC_LOTE) {
      var lote = filas.slice(i, i + RPC_LOTE);
      var res = await client().rpc(nombre, { p_canal: canal, p_filas: lote });
      if (res.error) throw res.error;
      n += Number(res.data) || lote.length;
    }
    return n;
  }

  async function filtrarPendienteCajaSoloSiExiste(parsed) {
    var filas = (parsed && parsed.filas) || [];
    var ids = [];
    filas.forEach(function (f) {
      if (f && f.soloSiExiste && f.origen_id) ids.push(f.origen_id);
    });
    if (!ids.length) return parsed;
    var found = {};
    var i;
    for (i = 0; i < ids.length; i += 400) {
      var q = await client().from('cf_movimiento')
        .select('origen_id,canal')
        .in('origen_id', ids.slice(i, i + 400));
      if (q.error) throw q.error;
      (q.data || []).forEach(function (r) {
        if (r && r.origen_id) found[r.origen_id] = r.canal || true;
      });
    }
    var kept = [];
    var nOmit = 0;
    filas.forEach(function (f) {
      if (!f || !f.soloSiExiste) {
        kept.push(f);
        return;
      }
      if (!found[f.origen_id]) {
        nOmit += 1;
        return;
      }
      kept.push(f);
    });
    parsed.filas = kept;
    parsed.omitidasPend = (parsed.omitidasPend || 0) + nOmit;
    return parsed;
  }

  async function borrarTesoreriaAnulada(ids) {
    var list = (ids || []).filter(Boolean);
    if (!list.length) return 0;
    var total = 0;
    var i;
    for (i = 0; i < list.length; i += RPC_LOTE) {
      var res = await client().rpc('cf_borrar_tesoreria_anulada', {
        p_origen_ids: list.slice(i, i + RPC_LOTE)
      });
      if (res.error) throw res.error;
      total += Number(res.data || 0);
    }
    return total;
  }

  function txtEqCarga(a, b) {
    return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
  }

  function numEqCarga(a, b) {
    var na = Number(a);
    var nb = Number(b);
    if (!isFinite(na) && !isFinite(nb)) return true;
    if (!isFinite(na) || !isFinite(nb)) return false;
    return Math.round(na * 100) === Math.round(nb * 100);
  }

  function filaCambioVsExistente(ex, f) {
    if (!ex || !f) return true;
    return String(ex.fecha || '').slice(0, 10) !== String(f.fecha || '').slice(0, 10)
      || !numEqCarga(ex.monto, f.monto)
      || !txtEqCarga(ex.tipo, f.tipo)
      || !txtEqCarga(ex.descripcion, f.descripcion)
      || !txtEqCarga(ex.contraparte, f.contraparte)
      || !txtEqCarga(ex.categoria, f.categoria)
      || !txtEqCarga(ex.cuenta_contable, f.cuenta_contable)
      || !txtEqCarga(ex.moneda, f.moneda);
  }

  function clasificarFilasUpload(filas) {
    var map = {};
    movimientosCanal().forEach(function (m) {
      if (!m || !m.origen_id) return;
      map[m.origen_id] = m;
    });
    var r = { nNuevos: 0, nCambiaron: 0, nIguales: 0 };
    (filas || []).forEach(function (f) {
      if (!f || !f.origen_id) {
        r.nNuevos += 1;
        return;
      }
      var ex = map[f.origen_id];
      if (!ex) {
        r.nNuevos += 1;
        return;
      }
      if (filaCambioVsExistente(ex, f)) r.nCambiaron += 1;
      else r.nIguales += 1;
    });
    return r;
  }

  function tipoCargaLabel(parsed, archivo) {
    if (parsed && parsed.formatoCierre) return 'Tesorería cierre de caja (Id único)';
    if (parsed && parsed.formatoHistorico) return 'Tesorería histórica (Id + Caja)';
    if (esNombreTesoreriaHistorico(archivo)) return 'Tesorería histórica';
    return 'Tesorería abierta (Id único)';
  }

  function htmlResumenCarga(r) {
    function item(label, n, cls, hint) {
      var nShow = n == null ? 0 : n;
      return '<div class="cf-resumen-item' + (cls ? ' ' + cls : '') + '">' +
        '<dt>' + esc(label) + '</dt>' +
        '<dd>' + esc(String(nShow)) + '</dd>' +
        (hint ? '<p class="cf-resumen-hint">' + esc(hint) + '</p>' : '') +
        '</div>';
    }
    function itemSi(label, n, cls, hint) {
      if (!n) return '';
      return item(label, n, cls, hint);
    }
    var omitHtml = itemSi('Apertura de Caja', r.omitidasApertura, '', 'No se cargan (el saldo, si viene, solo alimenta el corte).')
      + itemSi('Anulado', r.omitidasAnulado, '', 'Status Anulado no entra a tesorería. Si el Id ya existía, se elimina.')
      + itemSi('Pendiente (nuevos)', r.omitidasPend, '', 'No se dan de alta. Si el Id ya existía, categoría y cuenta sí se actualizan.')
      + itemSi('Otras cajas', r.omitidasOtraCaja, '', 'Mercado Pago, Galicia y Credicoop van a Conciliación Bancaria.')
      + itemSi('Sin Id', r.omitidasSinId, '', 'La columna Id es obligatoria.')
      + itemSi('Id duplicado en el archivo', r.omitidasIdDup, '', 'Se tomó la primera fila de cada Id.');
    return '<div class="cf-resumen-carga">' +
      '<p class="cf-resumen-lead">Se procesó <strong>' + esc(r.archivo || 'el archivo') + '</strong> como <strong>' + esc(r.tipo) + '</strong>.</p>' +
      '<p class="cf-resumen-canales">Caja: ' + esc(r.canal || labelDeCanal(state.canal)) + '</p>' +
      '<h3>Qué se hizo</h3>' +
      '<dl class="cf-resumen-grid">' +
        item('Filas reconocidas', r.nReconocidas, '', 'Movimientos que se procesan (incluye Pendiente cuyo Id ya estaba, para actualizar categoría y cuenta).') +
        item('Registros nuevos', r.nNuevos, 'cf-resumen-ok', 'No estaban: se dieron de alta.') +
        item('Registros que cambiaron', r.nCambiaron, 'cf-resumen-warn', 'Mismo Id: se actualizaron fecha, monto, categoría, cuenta u otro dato.') +
        item('Sin cambios', r.nIguales, '', 'Mismo Id y mismos datos: no se duplicaron.') +
        itemSi('A eliminar', r.nBajas, 'cf-resumen-warn', 'Tesorería abierta cuyo Id no vino en este archivo.') +
      '</dl>' +
      (omitHtml
        ? '<h3>Se omitieron</h3><dl class="cf-resumen-grid cf-resumen-omit">' + omitHtml + '</dl>'
        : '') +
      (r.nota ? '<p class="cf-resumen-nota">' + esc(r.nota) + '</p>' : '') +
    '</div>';
  }

  function msgCortoResumen(r) {
    var partes = [];
    partes.push((r.tipo || 'Carga') + ': ' + (r.nReconocidas || 0) + ' reconocidas');
    partes.push((r.nNuevos || 0) + ' nuevas');
    partes.push((r.nCambiaron || 0) + ' actualizadas');
    partes.push((r.nIguales || 0) + ' sin cambios');
    if (r.nBajas) partes.push(r.nBajas + ' a eliminar');
    return partes.join(' · ') + '.';
  }

  function abrirModal(titulo, bodyHtml, footerHtml, extraCls) {
    cerrarModalFiltros();
    cerrarModal();
    var bd = document.createElement('div');
    bd.className = 'cf-modal-backdrop';
    bd.innerHTML =
      '<div class="cf-modal ' + (extraCls || '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-header">' +
          '<h2>' + esc(titulo) + '</h2>' +
          '<button type="button" class="cf-btn cf-btn-ghost cf-btn-icon-only" data-cf="cerrar-modal" title="Cerrar" aria-label="Cerrar"><span class="btn-icon">' + ICO.x + '</span></button>' +
        '</div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="cf-btn cf-btn-ghost" data-cf="cerrar-modal"><span class="btn-icon">' + ICO.x + '</span>Cerrar</button>' +
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
    bd._cfEsc = onEsc;
  }

  function onModalClick(ev) {
    var bd = state.modal;
    if (!bd) return;
    if (ev.target === bd) { cerrarModal(); return; }
    var t = ev.target.closest && ev.target.closest('[data-cf]');
    if (!t || !bd.contains(t)) return;
    if (t.getAttribute('data-cf') === 'cerrar-modal') {
      ev.preventDefault();
      cerrarModal();
    }
  }

  function cerrarModal() {
    if (state.modal) {
      if (state.modal._cfEsc) document.removeEventListener('keydown', state.modal._cfEsc);
      if (state.modal.parentNode) state.modal.parentNode.removeChild(state.modal);
    }
    state.modal = null;
  }

  function abrirModalResumenCarga(r) {
    abrirModal('Resultado de la carga', htmlResumenCarga(r), '', 'cf-modal-resumen');
  }

  async function onUpload() {
    if (!can(PERM_CARGAR)) return;
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    pedirArchivo(async function (file) {
      state.loading = true;
      state.err = '';
      state.msg = '';
      state.resumenCarga = null;
      renderShell();
      try {
        var wb = await leerExcelFile(file);
        var parsed = parseCajaExcel(wb, file.name);
        if (parsed.error) throw new Error(parsed.error);
        await borrarTesoreriaAnulada(parsed.origenIdsAnulado);
        parsed = await filtrarPendienteCajaSoloSiExiste(parsed);
        var hayOmit = !!(parsed.omitidasPend || parsed.omitidasApertura || parsed.omitidasIdDup
          || parsed.omitidasOtraCaja || parsed.omitidasSinId || parsed.omitidasAnulado);
        if (!parsed.filas.length && !hayOmit) {
          throw new Error('No encontré filas de caja para cargar.');
        }
        var nReconocidas = parsed.filas.length;
        var snap = null;
        if (parsed.filas.length) {
          if (esCanalUsd(state.canal)) {
            state.tcLoaded = false;
            await ensureTipoCambio();
            pesificarParsed(parsed);
          }
        }
        var clsTot = clasificarFilasUpload(parsed.filas);
        if (parsed.filas.length) {
          await rpcLotes('cf_guardar_movimientos', state.canal, parsed.filas);
          if (!parsed.formatoCierre) {
            var ids = parsed.filas.map(function (f) { return f.origen_id; });
            var baja = await client().rpc('cf_marcar_tesoreria_abierta_ausente', {
              p_canal: state.canal,
              p_origen_ids: ids
            });
            if (baja.error) throw baja.error;
          }
          snap = snapshotSaldo(
            parsed.filas,
            file.name,
            parsed.formatoCierre,
            parsed.saldoApertura,
            parsed.fechaApertura,
            state.canal
          );
          if (snap) {
            var sRes = await client().rpc('cf_guardar_saldo_caja', { p_filas: [snap] });
            if (sRes.error) throw sRes.error;
          }
          await cargarDatos();
        }
        var nBajas = (!parsed.formatoCierre && parsed.filas.length) ? filasBajas().length : 0;
        if (nBajas) state.lista = 'bajas';
        var nota = '';
        if (snap) {
          nota = 'Saldo al ' + formatFecha(snap.fecha_hasta) + ': $ ' + formatMonto(snap.saldo_final) +
            (esCanalUsd(state.canal) ? ' ARS (pesificado al MEP de cada fecha, o el último anterior).' : '.');
        }
        var resumen = {
          archivo: file.name,
          tipo: tipoCargaLabel(parsed, file.name),
          canal: labelDeCanal(state.canal),
          nReconocidas: nReconocidas,
          nNuevos: clsTot.nNuevos,
          nCambiaron: clsTot.nCambiaron,
          nIguales: clsTot.nIguales,
          nBajas: nBajas,
          omitidasApertura: parsed.omitidasApertura || 0,
          omitidasPend: parsed.omitidasPend || 0,
          omitidasAnulado: parsed.omitidasAnulado || 0,
          omitidasOtraCaja: parsed.omitidasOtraCaja || 0,
          omitidasSinId: parsed.omitidasSinId || 0,
          omitidasIdDup: parsed.omitidasIdDup || 0,
          nota: nota
        };
        state.msg = msgCortoResumen(resumen);
        state.resumenCarga = resumen;
        if (window.FornitaliaSaldosExtractos && typeof window.FornitaliaSaldosExtractos.recargar === 'function') {
          window.FornitaliaSaldosExtractos.recargar();
        }
      } catch (e) {
        state.err = errMsg(e);
      } finally {
        state.loading = false;
        renderShell();
        if (state.resumenCarga) {
          abrirModalResumenCarga(state.resumenCarga);
          state.resumenCarga = null;
        }
      }
    });
  }

  async function onBorrar(id) {
    if (!can(PERM_CARGAR) || !id) return;
    if (!window.confirm('¿Eliminar este movimiento de caja?')) return;
    try {
      var res = await client().rpc('cf_borrar_movimiento', { p_id: id });
      if (res.error) throw res.error;
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function onBaja(id) {
    if (!can(PERM_CARGAR) || !id) return;
    if (!window.confirm('¿Confirmar la baja definitiva de este movimiento de tesorería abierta?')) return;
    try {
      var res = await client().rpc('cf_confirmar_baja', { p_id: id });
      if (res.error) throw res.error;
      await recargarTodo();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  function exportarExcel() {
    if (!can(PERM_EXPORTAR) && !can(PERM_VER)) return;
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    var list = filasVisibles();
    if (!list.length) {
      alert('No hay filas visibles con los filtros activos para exportar.');
      return;
    }
    var usd = esCanalUsd(state.canal);
    var headers = usd
      ? ['Fecha', 'Tipo', 'Descripción', 'Cliente', 'Categoría', 'Cuenta contable', 'Crédito ARS', 'Débito ARS', 'Saldo ARS', 'Importe ARS', 'USD orig.', 'TC MEP', 'Fecha TC', 'ID']
      : ['Fecha', 'Tipo', 'Descripción', 'Cliente', 'Categoría', 'Cuenta contable', 'Crédito', 'Débito', 'Saldo', 'Importe', 'ID'];
    var aoa = [headers];
    list.forEach(function (m) {
      var row = [
        excelDate(m.fecha),
        m.tipo || '',
        m.descripcion || '',
        m.contraparte || '',
        m.categoria || '',
        m.cuenta_contable || '',
        excelNum(m.credito),
        excelNum(m.debito),
        excelNum(m.saldo),
        excelNum(m.monto)
      ];
      if (usd) {
        row.push(excelNum(m.monto_usd), excelNum(m.tipo_cambio_mep), excelDate(m.tipo_cambio_fecha));
      }
      row.push(idVisible(m));
      aoa.push(row);
    });
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = usd
      ? [
        { wch: 12 }, { wch: 22 }, { wch: 40 }, { wch: 24 }, { wch: 22 }, { wch: 28 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }
      ]
      : [
        { wch: 12 }, { wch: 22 }, { wch: 40 }, { wch: 24 }, { wch: 22 }, { wch: 28 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }
      ];
    var range = global.XLSX.utils.decode_range(ws['!ref']);
    var r;
    var c;
    var dateSet = usd ? { 0: true, 12: true } : { 0: true };
    var numSet = usd
      ? { 6: true, 7: true, 8: true, 9: true, 10: true, 11: true }
      : { 6: true, 7: true, 8: true, 9: true };
    for (r = 0; r <= range.e.r; r++) {
      for (c = 0; c <= range.e.c; c++) {
        var addr = global.XLSX.utils.encode_cell({ r: r, c: c });
        var cellX = ws[addr];
        if (!cellX) continue;
        if (r === 0) {
          cellX.s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF1E293B' } } };
        }
        if (r > 0 && dateSet[c] && typeof cellX.v === 'number') {
          cellX.t = 'n';
          cellX.z = 'dd/mm/yyyy';
        }
        if (r > 0 && numSet[c] && typeof cellX.v === 'number') {
          cellX.t = 'n';
          cellX.z = '#,##0.00';
        }
      }
    }
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, state.lista === 'bajas' ? 'A eliminar' : 'Movimientos');
    global.XLSX.writeFile(wb, excelNombreCanal(state.canal) + fechaHoyYmd() + '.xlsx', { cellStyles: true, cellDates: false });
  }

  function renderTabla() {
    var list = filasVisibles();
    if (!list.length) {
      return '<p class="cf-empty">' + (state.lista === 'bajas'
        ? 'No hay tesorería abierta a eliminar. Al cargar tesorería abierta con Id, los movimientos que ya no vengan aparecen acá.'
        : (movimientosCanal().length
          ? 'No hay filas con los filtros o la búsqueda activos.'
          : 'Todavía no hay movimientos. Cargá ' + archivosHint(state.canal) + '.')) + '</p>';
    }
    var usd = esCanalUsd(state.canal);
    var html = '';
    var canCargar = can(PERM_CARGAR);
    list.forEach(function (m) {
      html += '<tr>' +
        '<td>' + formatFecha(m.fecha) + '</td>' +
        '<td>' + esc(m.tipo || '—') + '</td>' +
        '<td>' + esc(m.descripcion || '—') + '</td>' +
        '<td>' + esc(m.contraparte || '—') + '</td>' +
        '<td>' + esc(m.categoria || '—') + '</td>' +
        '<td>' + esc(m.cuenta_contable || '—') + '</td>' +
        '<td class="cf-col-monto">' + htmlMonto(m.credito) + '</td>' +
        '<td class="cf-col-monto">' + htmlMonto(m.debito != null ? -Math.abs(m.debito) : null) + '</td>' +
        '<td class="cf-col-monto">' + htmlMonto(m.saldo) + '</td>' +
        '<td class="cf-col-monto">' + htmlMonto(m.monto) + '</td>' +
        (usd ? '<td class="cf-col-monto">' + htmlMonto(m.monto_usd) + '</td>' +
          '<td class="cf-col-monto">' + esc(formatMonto(m.tipo_cambio_mep)) + '</td>' : '') +
        '<td>' + esc(idVisible(m)) + '</td>' +
        '<td class="cf-col-acc">' +
          (canCargar && state.lista === 'bajas'
            ? btnIcon('baja', m.id, 'Confirmar baja', ICO.trash, 'cf-btn-danger')
            : (canCargar ? btnIcon('del', m.id, 'Eliminar movimiento', ICO.trash, 'cf-btn-danger') : '')) +
        '</td>' +
      '</tr>';
    });
    return '<div class="cf-tabla-wrap"><table class="cf-tabla">' +
      '<thead><tr>' +
        thSort('fecha', 'Fecha') +
        thSort('tipo', 'Tipo') +
        thSort('descripcion', 'Descripción') +
        thSort('contraparte', 'Cliente') +
        thSort('categoria', 'Categoría') +
        thSort('cuenta_contable', 'Cuenta contable') +
        thSort('credito', usd ? 'Crédito ARS' : 'Crédito', 'cf-col-monto') +
        thSort('debito', usd ? 'Débito ARS' : 'Débito', 'cf-col-monto') +
        thSort('saldo', usd ? 'Saldo ARS' : 'Saldo', 'cf-col-monto') +
        thSort('monto', usd ? 'Importe ARS' : 'Importe', 'cf-col-monto') +
        (usd ? thSort('monto_usd', 'USD orig.', 'cf-col-monto') + thSort('tipo_cambio_mep', 'TC MEP', 'cf-col-monto') : '') +
        thSort('id', 'ID') +
        '<th class="cf-col-acc"></th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function htmlOpcionesSelect(valores, seleccionado, placeholder) {
    var out = '<option value="">' + esc(placeholder) + '</option>';
    (valores || []).forEach(function (v) {
      out += '<option value="' + esc(v) + '"' + (seleccionado === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return out;
  }

  function htmlOpcionesMesSelect(valores, seleccionado, placeholder) {
    var out = '<option value="">' + esc(placeholder) + '</option>';
    (valores || []).forEach(function (ym) {
      out += '<option value="' + esc(ym) + '"' + (seleccionado === ym ? ' selected' : '') + '>' + esc(formatMesLabel(ym)) + '</option>';
    });
    return out;
  }

  function htmlCuerpoModalFiltros() {
    syncCamposFiltro(state.filtrosDraft);
    var d = state.filtrosDraft || {};
    var filtroDyn = { mes: d.mes || '', tipo: d.tipo || '', categoria: d.categoria || '' };
    var mesOpts = htmlOpcionesMesSelect(opcionesMes(), d.mes || '', 'Todos los meses');
    var tipoOpts = htmlOpcionesSelect(opcionesTipo(filtroDyn), d.tipo || '', 'Todos los tipos');
    var catOpts = htmlOpcionesSelect(opcionesCategoria(filtroDyn), d.categoria || '', 'Todas las categorías');
    var ctaOpts = htmlOpcionesSelect(opcionesCuenta(filtroDyn), d.cuenta || '', 'Todas las cuentas');
    return FornitaliaHelp.row('tpl-cf-filtros', 'Ayuda: Filtros',
      '<p>Filtrá por mes, tipo, categoría y cuenta contable. El buscar de la pantalla sigue libre y no se restringe acá.</p>') +
      '<div class="cf-filtros-modal-grid">' +
        '<div class="form-group' + (d.mes ? ' cf-filtro-activo' : '') + '"><label for="cf-filtro-mes">Mes</label>' +
          '<select id="cf-filtro-mes" title="Filtrar por mes">' + mesOpts + '</select></div>' +
        '<div class="form-group' + (d.tipo ? ' cf-filtro-activo' : '') + '"><label for="cf-filtro-tipo">Tipo</label>' +
          '<select id="cf-filtro-tipo" title="Filtrar por tipo">' + tipoOpts + '</select></div>' +
        '<div class="form-group' + (d.categoria ? ' cf-filtro-activo' : '') + '"><label for="cf-filtro-categoria">Categoría</label>' +
          '<select id="cf-filtro-categoria" title="Filtrar por categoría">' + catOpts + '</select></div>' +
        '<div class="form-group' + (d.cuenta ? ' cf-filtro-activo' : '') + '"><label for="cf-filtro-cuenta">Cuenta contable</label>' +
          '<select id="cf-filtro-cuenta" title="Filtrar por cuenta contable">' + ctaOpts + '</select></div>' +
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
          syncCamposFiltro(state.filtrosDraft);
          refreshModalFiltros();
        }
      });
    }
    bindSel('#cf-filtro-mes', 'mes', true);
    bindSel('#cf-filtro-tipo', 'tipo', true);
    bindSel('#cf-filtro-categoria', 'categoria', true);
    bindSel('#cf-filtro-cuenta', 'cuenta', false);
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
    var t = ev.target.closest && ev.target.closest('[data-cf]');
    if (!t || !bd.contains(t)) return;
    var a = t.getAttribute('data-cf');
    if (a === 'cerrar-filtros') { ev.preventDefault(); cerrarModalFiltros(); return; }
    if (a === 'limpiar-filtros') {
      ev.preventDefault();
      if (!state.filtrosDraft) return;
      state.filtrosDraft.mes = '';
      state.filtrosDraft.tipo = '';
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
    state.mes = d.mes || '';
    state.tipo = d.tipo || '';
    state.categoria = d.categoria || '';
    state.cuenta = d.cuenta || '';
    cerrarModalFiltros();
    renderShell();
  }

  function abrirModalFiltros() {
    syncCamposFiltro(state);
    cerrarModalFiltros();
    state.filtrosDraft = {
      mes: state.mes || '',
      tipo: state.tipo || '',
      categoria: state.categoria || '',
      cuenta: state.cuenta || ''
    };
    var bd = document.createElement('div');
    bd.className = 'cf-modal-backdrop cf-modal-filtros-backdrop';
    bd.innerHTML =
      '<div class="cf-modal cf-modal-filtros" role="dialog" aria-modal="true" aria-labelledby="cf-filtros-titulo">' +
        '<div class="modal-header">' +
          '<h2 id="cf-filtros-titulo">Filtros</h2>' +
          '<button type="button" class="cf-btn cf-btn-ghost cf-btn-icon-only" data-cf="cerrar-filtros" title="Cerrar" aria-label="Cerrar"><span class="btn-icon">' + ICO.x + '</span></button>' +
        '</div>' +
        '<div class="modal-body">' + htmlCuerpoModalFiltros() + '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="cf-btn cf-btn-ghost" data-cf="limpiar-filtros"><span class="btn-icon">' + ICO.trash + '</span>Limpiar</button>' +
          '<button type="button" class="cf-btn cf-btn-ghost" data-cf="cerrar-filtros"><span class="btn-icon">' + ICO.x + '</span>Cancelar</button>' +
          '<button type="button" class="cf-btn cf-btn-ok" data-cf="aplicar-filtros"><span class="btn-icon">' + ICO.check + '</span>Aplicar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bd);
    state.modalFiltros = bd;
    bd.addEventListener('click', onModalFiltrosClick);
    function onEsc(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); cerrarModalFiltros(); }
    }
    document.addEventListener('keydown', onEsc);
    bd._cfEsc = onEsc;
    bindModalFiltrosInputs();
  }

  function cerrarModalFiltros() {
    if (state.modalFiltros) {
      if (state.modalFiltros._cfEsc) document.removeEventListener('keydown', state.modalFiltros._cfEsc);
      if (state.modalFiltros.parentNode) state.modalFiltros.parentNode.removeChild(state.modalFiltros);
    }
    state.modalFiltros = null;
    state.filtrosDraft = null;
  }

  function htmlBtnFiltros(nActivos) {
    var title = nActivos
      ? (nActivos + ' filtro' + (nActivos === 1 ? '' : 's') + ' activo' + (nActivos === 1 ? '' : 's'))
      : 'Abrir filtros';
    return '<button type="button" class="cf-btn cf-btn-ghost' + (nActivos ? ' cf-btn-filtros-on' : '') + '" data-cf="filtros" title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
      '<span class="btn-icon">' + ICO.filter + '</span>Filtros' +
      (nActivos ? '<span class="cf-filtros-count">' + nActivos + '</span>' : '') +
    '</button>';
  }

  function renderFiltros() {
    syncCamposFiltro(state);
    var n = contarFiltrosEstructurales(state);
    var qOn = !!(state.q || '').trim();
    return '<div class="cf-filtros">' +
      htmlBtnFiltros(n) +
      (n ? '<span class="cf-filtros-flag" title="Hay filtros aplicados; el listado y el Excel respetan estos filtros">Filtros activos</span>' : '') +
      '<div class="form-group cf-filtro-buscar' + (qOn ? ' cf-filtro-activo' : '') + '"><label for="cf-q">Buscar</label>' +
        '<input type="search" id="cf-q" value="' + esc(state.q) + '" placeholder="Fecha, importe, cliente, ID, categoría…" title="Búsqueda amplia sobre el listado visible"></div>' +
    '</div>';
  }

  function renderShell() {
    var el = root();
    if (!el) return;
    if (!can(PERM_VER)) {
      el.innerHTML = '<p class="cf-empty">No tenés permiso para ver Cajas (físicas).</p>';
      return;
    }
    var k = kpis();
    syncCamposFiltro(state);
    el.innerHTML =
      FornitaliaHelp.header(ICO.cash, 'Cajas (físicas)', 'tpl-cf-help', 'Ayuda: Cajas (físicas)',
        '<p>Cajas que <strong>no se concilian</strong> con extracto bancario. Solapas <strong>' + esc(LABEL_GF) + '</strong> (efectivo pesos), <strong>' + esc(LABEL_MOR) + '</strong> (Transferencia Morba), <strong>' + esc(LABEL_USD) + '</strong> (efectivo dólar, pesificado al MEP), <strong>' + esc(LABEL_SF) + '</strong> y <strong>' + esc(LABEL_SF_USD) + '</strong> (histórico Caja Efectivo … sin factura).</p>' +
        '<p>Mismos Excel que tesorería/cierre, con Id para no duplicar. El saldo alimenta Saldos extractos.</p>' +
        '<p>Cargá <em>' + esc(archivosHint(state.canal).split(' o ')[0]) + '</em> o <em>' + esc(archivosHint(state.canal).split(' o ')[1] || '') + '</em>. Tesorería abierta trae saldo corrido; el cierre ya cerrado trae Fecha, Tipo, Monto e Id.</p>' +
        '<p>Apertura de Caja, Status Anulado y filas Pendiente no se suben (el saldo de apertura, si viene, solo alimenta el corte de Saldos extractos). Si un Id de tesorería abierta ya no viene, pasa a <strong>A eliminar</strong>.' +
        (esCanalUsd(state.canal) ? ' Los montos del Excel están en <strong>USD</strong> y se pesifican al <strong>MEP</strong> de <em>tipo_de_cambio</em> (fecha del movimiento o última cotización anterior). La grilla muestra ARS, USD original y el TC usado.' : '') + '</p>') +
      (state.loading ? '<p class="loading">Cargando caja…</p>' : '') +
      (state.err ? '<p class="cf-msg-err">' + esc(state.err) + '</p>' : '') +
      (state.msg ? '<p class="cf-msg-ok">' + esc(state.msg) + '</p>' : '') +
      '<div class="cf-tabs">' +
        '<button type="button" class="' + (state.canal === CANAL_GF ? 'activo' : '') + '" data-cf="canal" data-canal="' + CANAL_GF + '">' + esc(LABEL_GF) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_MOR ? 'activo' : '') + '" data-cf="canal" data-canal="' + CANAL_MOR + '">' + esc(LABEL_MOR) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_USD ? 'activo' : '') + '" data-cf="canal" data-canal="' + CANAL_USD + '">' + esc(LABEL_USD) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_SF ? 'activo' : '') + '" data-cf="canal" data-canal="' + CANAL_SF + '">' + esc(LABEL_SF) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_SF_USD ? 'activo' : '') + '" data-cf="canal" data-canal="' + CANAL_SF_USD + '">' + esc(LABEL_SF_USD) + '</button>' +
      '</div>' +
      '<div class="cf-toolbar"><div class="cf-acciones">' +
        (can(PERM_CARGAR) ? '<button type="button" class="cf-btn cf-btn-navy" data-cf="up"><span class="btn-icon">' + ICO.upload + '</span>Cargar tesorería / cierre</button>' : '') +
        ((can(PERM_EXPORTAR) || can(PERM_VER)) ? '<button type="button" class="cf-btn cf-btn-excel" data-cf="xlsx"><span class="btn-icon">' + ICO.download + '</span>Excel</button>' : '') +
      '</div></div>' +
      renderFiltros() +
      '<div class="cf-resumen">' +
        '<div class="cf-resumen-card"><p class="lab">Movimientos</p><p class="val">' + k.n + '</p></div>' +
        '<div class="cf-resumen-card"><p class="lab">' + (esCanalUsd(state.canal) ? 'Ingresos ARS' : 'Ingresos') + '</p><p class="val">' + esc(formatMonto(k.ingresos)) + '</p></div>' +
        '<div class="cf-resumen-card"><p class="lab">' + (esCanalUsd(state.canal) ? 'Egresos ARS' : 'Egresos') + '</p><p class="val">' + esc(formatMonto(k.egresos)) + '</p></div>' +
        '<div class="cf-resumen-card"><p class="lab">' + (esCanalUsd(state.canal) ? 'Saldo ARS' : 'Saldo') + '</p><p class="val">' + esc(formatMonto(k.saldo)) + '</p></div>' +
        '<div class="cf-resumen-card' + (k.bajas ? ' cf-resumen-warn' : '') + '" data-cf="lista" data-lista="bajas" role="button" tabindex="0"><p class="lab">A eliminar</p><p class="val">' + k.bajas + '</p></div>' +
      '</div>' +
      '<div class="cf-tabs">' +
        '<button type="button" class="' + (state.lista === 'movimientos' ? 'activo' : '') + '" data-cf="lista" data-lista="movimientos">Movimientos</button>' +
        '<button type="button" class="' + (state.lista === 'bajas' ? 'activo' : '') + (k.bajas ? ' cf-tab-warn' : '') + '" data-cf="lista" data-lista="bajas">A eliminar' + (k.bajas ? ' (' + k.bajas + ')' : '') + '</button>' +
      '</div>' +
      renderTabla();

    var qEl = el.querySelector('#cf-q');
    if (qEl) {
      qEl.addEventListener('input', function () {
        state.q = qEl.value || '';
      });
      qEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          renderShell();
        }
      });
      qEl.addEventListener('search', function () { renderShell(); });
    }
  }

  function onClick(ev) {
    var t = ev.target.closest && ev.target.closest('[data-cf]');
    if (!t) return;
    var el = root();
    if (el && !el.contains(t)) return;
    var a = t.getAttribute('data-cf');
    if (a === 'up') { onUpload(); return; }
    if (a === 'xlsx') { exportarExcel(); return; }
    if (a === 'filtros') { abrirModalFiltros(); return; }
    if (a === 'sort') { toggleSort(t.getAttribute('data-sort')); renderShell(); return; }
    if (a === 'lista') {
      state.lista = t.getAttribute('data-lista') || 'movimientos';
      renderShell();
      return;
    }
    if (a === 'canal') {
      var c = t.getAttribute('data-canal') || CANAL_GF;
      if (!esCanalCaja(c) || c === state.canal) return;
      state.canal = c;
      state.lista = 'movimientos';
      state.q = '';
      state.mes = '';
      state.tipo = '';
      state.categoria = '';
      state.cuenta = '';
      state.msg = '';
      state.err = '';
      cerrarModal();
      recargarTodo();
      return;
    }
    if (a === 'del') { onBorrar(t.getAttribute('data-id')); return; }
    if (a === 'baja') { onBaja(t.getAttribute('data-id')); return; }
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
    recargarTodo();
  }

  global.FornitaliaCajasFisicas = { init: init, show: show };
})(window);
