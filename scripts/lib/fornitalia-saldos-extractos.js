/**
 * Saldos de extractos – Fornitalia
 * Galicia ARS (resumen PDF), Galicia USD (PDF Extracto_Cuentas_Galicia_… o Excel Extracto_CCE, pesificado al MEP),
 * Mercado Pago (Carta de saldo MP_Saldos_…), Credicoop (corte desde tesorería; no hay extractos históricos)
 * y cajas físicas Efectivo-f (ARS) / Morba-s/f (ARS) / Efectivo-f (USD) / Efectivo-s/f (ARS) / Efectivo-s/f (USD).
 * window.FornitaliaSaldosExtractos.init({ client, hasPerm, getRoot })
 */
(function (global) {
  'use strict';

  var ZONA_AR = 'America/Argentina/Buenos_Aires';
  var CANAL_GAL = 'galicia';
  var CANAL_MP = 'mercadopago';
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
  var CANAL_GAL_USD = 'galicia_usd';
  var LABEL_GAL = 'Galicia (ARS)';
  var LABEL_GAL_USD = 'Galicia (USD)';
  var CANAL_CRED = 'credicoop';
  var LABEL_CRED = 'Credicoop';
  var CANAL_CONS = 'consolidado';
  var PERM_VER = 'ver_saldos_extractos';
  var PERM_CARGAR = 'cargar_saldos_extractos';
  var PERM_EXPORTAR = 'exportar_saldos_extractos';
  var PDFJS_VER = '3.11.174';
  var PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.worker.min.js';
  var MESES_ES = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12
  };

  var ICO = {
    chart: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><polyline points="7 14 12 9 16 13 21 6"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
  };

  var opts = { client: null, hasPerm: function () { return true; }, getRoot: function () { return null; } };
  var state = {
    mounted: false,
    loading: false,
    canal: CANAL_MP,
    rows: [],
    mesDesde: '',
    mesHasta: '',
    msg: '',
    err: '',
    chart: null,
    tcLoaded: false,
    tcMap: {},
    tcFechas: []
  };
  var pdfjsReady = null;

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

  function pad2(n) { return String(n).padStart(2, '0'); }

  function round2(n) {
    var v = Number(n);
    if (!isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  }

  function normHeader(h) {
    return String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  function parseMontoSe(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return round2(v);
    var s = String(v).trim().replace(/\s/g, '').replace(/^\$/, '').replace(/^US\$/i, '').replace(/^USD/i, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.indexOf(',') >= 0) {
      s = s.replace(',', '.');
    }
    var n = Number(s);
    return isFinite(n) ? round2(n) : null;
  }

  function parseFechaYmd(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_AR, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(v);
    }
    if (typeof v === 'number' && isFinite(v)) {
      var epoch = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(epoch));
    }
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    return '';
  }

  async function ensureTipoCambio() {
    state.tcLoaded = false;
    var all = [];
    var offset = 0;
    for (;;) {
      var res = await client().from('tipo_de_cambio')
        .select('fecha, usd_mep')
        .order('fecha', { ascending: true })
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

  function nroCuentaExtractoCce(archivo) {
    var m = String(archivo || '').match(/CCE\d+/i);
    return m ? m[0].toUpperCase() : 'CCE';
  }

  function snapshotGaliciaUsd(filas, archivo) {
    var list = (filas || []).slice().filter(function (f) { return f && f.fecha; })
      .sort(function (a, b) {
        var c = String(a.fecha).localeCompare(String(b.fecha));
        if (c) return c;
        return (a.fila_excel || 0) - (b.fila_excel || 0);
      });
    if (!list.length) return null;
    var last = list[list.length - 1];
    var usd = last.saldo != null ? Number(last.saldo) : null;
    if (usd == null || !isFinite(usd)) {
      usd = 0;
      list.forEach(function (f) { usd += Number(f.monto) || 0; });
    }
    var tc = tasaMepParaFecha(last.fecha);
    if (!tc) {
      throw new Error(
        'No hay tipo de cambio MEP en tipo_de_cambio para ' + last.fecha +
        ' ni para un día anterior. Cargá cotizaciones y reintentá.'
      );
    }
    var ars = round2(usd * tc.tasa);
    var nro = nroCuentaExtractoCce(archivo);
    return {
      canal: CANAL_GAL_USD,
      moneda: 'ARS',
      nro_cuenta: nro,
      tipo_cuenta: LABEL_GAL_USD,
      fecha_desde: list[0].fecha,
      fecha_hasta: last.fecha,
      saldo_inicial: null,
      saldo_final: ars,
      documento_id: nro,
      archivo: archivo,
      raw: {
        saldo_usd: round2(usd),
        tipo_cambio_mep: tc.tasa,
        tipo_cambio_fecha: tc.fechaTc,
        pesificado_mep: true
      }
    };
  }

  async function guardarCorteGaliciaUsd(filas, archivo) {
    await ensureTipoCambio();
    var snap = snapshotGaliciaUsd(filas, archivo);
    if (!snap) return null;
    var res = await client().rpc('eb_guardar_saldos', { p_filas: [snap] });
    if (res.error) throw res.error;
    try { await cargarDatos(); } catch (e) { /* ignore */ }
    return snap;
  }

  function snapshotCredicoop(filas, archivo) {
    var orden = (filas || []).filter(function (f) { return f && f.fecha; }).slice().sort(function (a, b) {
      var c = String(a.fecha).localeCompare(String(b.fecha));
      if (c) return c;
      return String(a.origen_id || '').localeCompare(String(b.origen_id || ''));
    });
    if (!orden.length) return null;
    var ini = null;
    var fin = null;
    var i;
    for (i = orden.length - 1; i >= 0; i--) {
      if (orden[i].saldo != null && isFinite(Number(orden[i].saldo))) {
        fin = Number(orden[i].saldo);
        break;
      }
    }
    for (i = 0; i < orden.length; i++) {
      if (orden[i].saldo != null && isFinite(Number(orden[i].saldo))) {
        ini = Number(orden[i].saldo);
        break;
      }
    }
    if (fin == null) {
      var run = 0;
      for (i = 0; i < orden.length; i++) {
        if (orden[i].credito != null) run += Number(orden[i].credito) || 0;
        if (orden[i].debito != null) run -= Math.abs(Number(orden[i].debito) || 0);
      }
      fin = round2(run);
      if (ini == null) ini = 0;
    }
    var fechas = orden.map(function (f) { return String(f.fecha).slice(0, 10); }).sort();
    return {
      canal: CANAL_CRED,
      moneda: 'ARS',
      nro_cuenta: CANAL_CRED,
      tipo_cuenta: LABEL_CRED,
      fecha_desde: fechas[0],
      fecha_hasta: fechas[fechas.length - 1],
      saldo_inicial: round2(ini),
      saldo_final: round2(fin),
      documento_id: String(archivo || '').replace(/\.[^.]+$/, '') || CANAL_CRED,
      archivo: archivo || null,
      raw: { formato: 'tesoreria', sin_apertura: true, movimientos: orden.length }
    };
  }

  async function guardarCorteCredicoop(filas, archivo) {
    var snap = snapshotCredicoop(filas, archivo);
    if (!snap) return null;
    var res = await client().rpc('eb_guardar_saldos', { p_filas: [snap] });
    if (res.error) throw res.error;
    try { await cargarDatos(); } catch (e) { /* ignore */ }
    return snap;
  }

  function meanNums(arr) {
    var vals = (arr || []).filter(function (n) { return n != null && isFinite(Number(n)); }).map(Number);
    if (!vals.length) return null;
    var s = 0;
    vals.forEach(function (n) { s += n; });
    return round2(s / vals.length);
  }

  function dmyToIso(s) {
    var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
  }

  function parseMontoAR(s) {
    if (s == null || s === '') return null;
    var t = String(s).replace(/US\$/gi, '').replace(/USD/gi, '').replace(/\$/g, '').trim().replace(/\s/g, '');
    if (!t) return null;
    t = t.replace(/\./g, '').replace(',', '.');
    var n = Number(t);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function formatFecha(ymd) {
    if (!ymd) return '—';
    var p = String(ymd).slice(0, 10).split('-');
    if (p.length !== 3) return esc(ymd);
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function formatMesLabel(ym) {
    var p = String(ym || '').split('-');
    if (p.length < 2) return String(ym || '');
    return p[1] + '/' + p[0];
  }

  function mesYYYYMM(ymd) {
    var s = String(ymd || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(s) ? s : '';
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

  function hoyYmd() {
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

  function montoTrasEtiqueta(raw, flat, etiqueta) {
    var re = new RegExp(etiqueta.replace(/ /g, '\\s+') + '\\s*\\$?\\s*([\\d.]+,\\d{2})', 'i');
    var m = String(raw || '').match(re) || String(flat || '').match(re);
    return m ? parseMontoAR(m[1]) : null;
  }

  function fechaAlEspanol(text) {
    var m = String(text || '').match(/Al\s+(\d{1,2})\s+de\s+([A-Za-záéíóúñ]+)\s+de\s+(\d{4})/i);
    if (!m) return '';
    var mes = MESES_ES[m[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    if (!mes) return '';
    return m[3] + '-' + pad2(mes) + '-' + pad2(m[1]);
  }

  function fechaDesdeNombreMp(archivo) {
    var m = String(archivo || '').match(/MP_Saldos_(\d{4})(\d{2})(\d{2})/i);
    if (!m) return '';
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  function matchPeriodoSaldosGalicia(raw, flat) {
    var reA = /(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})\s*Per[ií]odo de movimientos\s*(?:USD|US\$|\$)?\s*(-?[\d.]+,\d{2})\s*(?:USD|US\$|\$)?\s*(-?[\d.]+,\d{2})\s*Saldos/i;
    var reB = /(\d{2}\/\d{2}\/\d{4})\s*(\d{2}\/\d{2}\/\d{4})\s*Per[ií]odo de movimientos\s*(?:USD|US\$|\$)?\s*(-?[\d.]+,\d{2})\s*(?:USD|US\$|\$)?\s*(-?[\d.]+,\d{2})\s*Saldos/i;
    return String(raw || '').match(reA) || String(flat || '').match(reA)
      || String(raw || '').match(reB) || String(flat || '').match(reB);
  }

  function esTextoGaliciaUsd(text, archivo) {
    var blob = normHeader(String(text || '') + ' ' + (archivo || ''));
    if (/cuenta corriente especial en dolares/.test(blob)) return true;
    if (/especial en dolares/.test(blob)) return true;
    return /en dolares/.test(blob) && /cuenta corriente especial/.test(blob);
  }

  function parseGaliciaResumenTexto(text, archivo) {
    var raw = String(text || '');
    var flat = raw.replace(/\s+/g, ' ');
    var esGal = /resumen de cuenta corriente/i.test(raw) || /extracto_cuentas_galicia/i.test(archivo || '');
    if (!esGal) {
      return { error: 'No reconocí un resumen de Galicia (cuenta corriente en pesos o en dólares). Archivo: ' + (archivo || '') };
    }
    var esUsd = esTextoGaliciaUsd(raw, archivo);
    var m = matchPeriodoSaldosGalicia(raw, flat);
    if (!m) {
      return { error: 'Encontré un PDF de Galicia pero no pude leer los saldos del encabezado. Archivo: ' + (archivo || '') };
    }
    var fechaHasta = dmyToIso(m[1]);
    var fechaDesde = dmyToIso(m[2]);
    var saldoFinal = parseMontoAR(m[3]);
    var saldoInicial = parseMontoAR(m[4]);
    if (!fechaHasta || saldoFinal == null) {
      return { error: 'El resumen de Galicia no tiene fecha de cierre o saldo final. Archivo: ' + (archivo || '') };
    }
    var cbuM = raw.match(/CBU\s*(\d{22})/i) || flat.match(/CBU\s*(\d{22})/i);
    var ctaM = raw.match(/N[°ºo]\s*([0-9][0-9\- ]+[0-9])/i) || flat.match(/N[°ºo]\s*([0-9][0-9\- ]+[0-9])/i);
    var docM = raw.match(/(\d{17}[A-Z])/);
    var tipoM = raw.match(/Tipo de cuenta\s*([^\n]+)/i);
    var nro = ctaM ? ctaM[1].replace(/\s+/g, ' ').trim() : '';
    var tipo = tipoM ? tipoM[1].replace(/\s+/g, ' ').trim() : (esUsd ? 'Cuenta Corriente Especial en dolares' : 'Cuenta Corriente en Pesos');
    var nroCanon = nroCuentaExtractoCce(archivo);
    if (nroCanon === 'CCE' && nro) nroCanon = nro;
    if (esUsd) {
      return {
        error: null,
        esUsd: true,
        meta: {
          nro_cuenta: nroCanon,
          cbu: cbuM ? cbuM[1] : '',
          tipo_cuenta: tipo || LABEL_GAL_USD,
          fecha_desde: fechaDesde || fechaHasta,
          fecha_hasta: fechaHasta,
          saldo_inicial_usd: saldoInicial,
          saldo_final_usd: saldoFinal,
          documento_id: docM ? docM[1] : '',
          archivo: archivo || ''
        }
      };
    }
    return {
      error: null,
      esUsd: false,
      fila: {
        canal: CANAL_GAL,
        moneda: 'ARS',
        nro_cuenta: nro,
        cbu: cbuM ? cbuM[1] : '',
        tipo_cuenta: tipo,
        fecha_desde: fechaDesde || fechaHasta,
        fecha_hasta: fechaHasta,
        saldo_inicial: saldoInicial,
        saldo_final: saldoFinal,
        documento_id: docM ? docM[1] : '',
        archivo: archivo || '',
        raw: {
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta,
          saldo_inicial: saldoInicial,
          saldo_final: saldoFinal
        }
      }
    };
  }

  function pesificarResumenGaliciaUsd(meta) {
    var m = meta || {};
    var tc = tasaMepParaFecha(m.fecha_hasta);
    if (!tc) {
      throw new Error(
        'No hay tipo de cambio MEP en tipo_de_cambio para ' + m.fecha_hasta +
        ' ni para un día anterior. Cargá cotizaciones y reintentá.'
      );
    }
    var usdFin = m.saldo_final_usd != null ? Number(m.saldo_final_usd) : null;
    var usdIni = m.saldo_inicial_usd != null ? Number(m.saldo_inicial_usd) : null;
    if (usdFin == null || !isFinite(usdFin)) {
      throw new Error('El resumen de Galicia (USD) no tiene saldo de cierre.');
    }
    return {
      canal: CANAL_GAL_USD,
      moneda: 'ARS',
      nro_cuenta: m.nro_cuenta || nroCuentaExtractoCce(m.archivo) || 'CCE',
      cbu: m.cbu || '',
      tipo_cuenta: m.tipo_cuenta || LABEL_GAL_USD,
      fecha_desde: m.fecha_desde || m.fecha_hasta,
      fecha_hasta: m.fecha_hasta,
      saldo_inicial: usdIni != null && isFinite(usdIni) ? round2(usdIni * tc.tasa) : null,
      saldo_final: round2(usdFin * tc.tasa),
      documento_id: m.documento_id || '',
      archivo: m.archivo || '',
      raw: {
        saldo_usd: round2(usdFin),
        saldo_usd_inicial: usdIni != null && isFinite(usdIni) ? round2(usdIni) : null,
        tipo_cambio_mep: tc.tasa,
        tipo_cambio_fecha: tc.fechaTc,
        pesificado_mep: true,
        fuente: 'pdf'
      }
    };
  }

  async function guardarCorteDesdePdfGalicia(text, archivo) {
    var parsed = parseGaliciaResumenTexto(text, archivo);
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.esUsd || !parsed.meta) {
      throw new Error((archivo || 'PDF') + ': es un resumen de Galicia (ARS). Cargalo en la solapa ' + LABEL_GAL + '.');
    }
    await ensureTipoCambio();
    var fila = pesificarResumenGaliciaUsd(parsed.meta);
    var res = await client().rpc('eb_guardar_saldos', { p_filas: [fila] });
    if (res.error) throw res.error;
    try { await cargarDatos(); } catch (e) { /* ignore */ }
    return fila;
  }

  function parseMpCartaSaldo(text, archivo) {
    var nombre = archivo || '';
    var raw = String(text || '');
    var flat = raw.replace(/\s+/g, ' ');
    var esMp = /carta de saldo/i.test(raw)
      || /mercado\s*pago/i.test(raw)
      || /MP_Saldos_/i.test(nombre);
    if (!esMp) {
      return { error: 'No reconocí una Carta de saldo de Mercado Pago (archivos MP_Saldos_…). Archivo: ' + nombre };
    }
    var fecha = fechaAlEspanol(raw) || fechaAlEspanol(flat) || fechaDesdeNombreMp(nombre);
    var total = montoTrasEtiqueta(raw, flat, 'Saldo total');
    var disp = montoTrasEtiqueta(raw, flat, 'Saldo disponible');
    var liberar = montoTrasEtiqueta(raw, flat, 'Saldo a liberar');
    var reservado = montoTrasEtiqueta(raw, flat, 'Saldo reservado');
    var retirar = montoTrasEtiqueta(raw, flat, 'Saldo a retirar');
    var comprometido = montoTrasEtiqueta(raw, flat, 'Saldo comprometido');
    if (!fecha || total == null) {
      return { error: 'La Carta de saldo de Mercado Pago no tiene fecha (“Al …”) o saldo total. Archivo: ' + nombre };
    }
    var cust = raw.match(/CUST_ID:\s*(\d+)/i) || flat.match(/CUST_ID:\s*(\d+)/i);
    var cuit = raw.match(/(\d{11})\s*CUIT/i) || flat.match(/CUIT:\s*(\d{11})/i);
    var nro = cust ? cust[1] : '';
    return {
      error: null,
      fila: {
        canal: CANAL_MP,
        moneda: 'ARS',
        nro_cuenta: nro,
        cbu: '',
        tipo_cuenta: 'Cuenta de pago Mercado Pago',
        fecha_desde: fecha,
        fecha_hasta: fecha,
        saldo_inicial: null,
        saldo_final: total,
        documento_id: nro || (cuit ? cuit[1] : ''),
        archivo: nombre,
        raw: {
          saldo_total: total,
          saldo_disponible: disp,
          saldo_a_liberar: liberar,
          saldo_reservado: reservado,
          saldo_a_retirar: retirar,
          saldo_comprometido: comprometido,
          cuit: cuit ? cuit[1] : ''
        }
      }
    };
  }

  async function pdfTextoPagina1(file) {
    var pdfjs = await ensurePdfJs();
    var buf = await file.arrayBuffer();
    var pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    var page = await pdf.getPage(1);
    var content = await page.getTextContent();
    return content.items.map(function (it) { return it.str; }).join('\n');
  }

  async function parseArchivo(file, canalEsperado) {
    var nombre = file && file.name ? file.name : 'archivo.pdf';
    var text = await pdfTextoPagina1(file);
    var mp = parseMpCartaSaldo(text, nombre);
    var gal = parseGaliciaResumenTexto(text, nombre);
    if (canalEsperado === CANAL_MP) {
      if (!mp.error) return mp;
      if (!gal.error) {
        return { error: nombre + ': es un resumen de Galicia. Cargalo en la solapa ' + (gal.esUsd ? LABEL_GAL_USD : LABEL_GAL) + '.' };
      }
      return mp;
    }
    if (canalEsperado === CANAL_GAL) {
      if (!gal.error && gal.esUsd) {
        return { error: nombre + ': es un resumen de Galicia (USD). Cargalo en la solapa ' + LABEL_GAL_USD + '.' };
      }
      if (!gal.error) return gal;
      if (!mp.error) {
        return { error: nombre + ': es una Carta de saldo de Mercado Pago. Cargalo en la solapa Mercado Pago.' };
      }
      return gal;
    }
    if (canalEsperado === CANAL_GAL_USD) {
      if (!gal.error && gal.esUsd && gal.meta) {
        await ensureTipoCambio();
        return { error: null, fila: pesificarResumenGaliciaUsd(gal.meta) };
      }
      if (!gal.error && !gal.esUsd) {
        return { error: nombre + ': es un resumen de Galicia (ARS). Cargalo en la solapa ' + LABEL_GAL + '.' };
      }
      if (!mp.error) {
        return { error: nombre + ': es una Carta de saldo de Mercado Pago. Cargalo en la solapa Mercado Pago.' };
      }
      return gal;
    }
    if (!mp.error) return mp;
    if (!gal.error && gal.esUsd && gal.meta) {
      await ensureTipoCambio();
      return { error: null, fila: pesificarResumenGaliciaUsd(gal.meta) };
    }
    if (!gal.error) return gal;
    return { error: mp.error || gal.error };
  }

  function extraSaldo(r, key) {
    var raw = r && r.raw;
    if (!raw || typeof raw !== 'object') return null;
    var n = Number(raw[key]);
    return isFinite(n) ? n : null;
  }

  function pasaFiltroMes(ymd) {
    var ym = mesYYYYMM(ymd);
    if (state.mesDesde && ym < state.mesDesde) return false;
    if (state.mesHasta && ym > state.mesHasta) return false;
    return true;
  }

  function filasCanal(canal) {
    return (state.rows || []).filter(function (r) {
      return r.canal === canal && pasaFiltroMes(r.fecha_hasta);
    }).slice().sort(function (a, b) {
      return String(b.fecha_hasta).localeCompare(String(a.fecha_hasta));
    });
  }

  function conAnterior(rows) {
    var last = {};
    (state.rows || []).slice().sort(function (a, b) {
      var c = String(a.fecha_hasta).localeCompare(String(b.fecha_hasta));
      if (c) return c;
      return String(a.nro_cuenta || '').localeCompare(String(b.nro_cuenta || ''));
    }).forEach(function (r) {
      var k = String(r.canal) + '|' + String(r.nro_cuenta || '');
      r._prev = last[k] || null;
      last[k] = r;
    });
    return rows;
  }

  function saldoInicialMostrar(r) {
    if (r.saldo_inicial != null && r.saldo_inicial !== '') {
      var ini = Number(r.saldo_inicial);
      if (isFinite(ini)) return ini;
    }
    if (r._prev && r._prev.saldo_final != null) {
      var p = Number(r._prev.saldo_final);
      if (isFinite(p)) return p;
    }
    return null;
  }

  function variacionFila(r) {
    var fin = Number(r.saldo_final);
    var ini = saldoInicialMostrar(r);
    if (!isFinite(fin) || ini == null) return null;
    return round2(fin - ini);
  }

  function opcionesMes() {
    var set = {};
    (state.rows || []).forEach(function (r) {
      var ym = mesYYYYMM(r.fecha_hasta);
      if (ym) set[ym] = true;
    });
    return Object.keys(set).sort();
  }

  function ultimoSaldoHasta(canal, ymInclusive) {
    var best = null;
    (state.rows || []).forEach(function (r) {
      if (r.canal !== canal) return;
      var ym = mesYYYYMM(r.fecha_hasta);
      if (!ym || ym > ymInclusive) return;
      if (!best || String(r.fecha_hasta) > String(best.fecha_hasta)) best = r;
    });
    return best;
  }

  function mesesConsolidado() {
    var set = {};
    (state.rows || []).forEach(function (r) {
      var ym = mesYYYYMM(r.fecha_hasta);
      if (ym && pasaFiltroMes(r.fecha_hasta)) set[ym] = true;
    });
    return Object.keys(set).sort();
  }

  function filasConsolidado() {
    var meses = mesesConsolidado();
    var prevTotal = null;
    return meses.map(function (ym) {
      var g = ultimoSaldoHasta(CANAL_GAL, ym);
      var gUsdRow = ultimoSaldoHasta(CANAL_GAL_USD, ym);
      var m = ultimoSaldoHasta(CANAL_MP, ym);
      var credRow = ultimoSaldoHasta(CANAL_CRED, ym);
      var gfRow = ultimoSaldoHasta(CANAL_GF, ym);
      var morRow = ultimoSaldoHasta(CANAL_MOR, ym);
      var usdRow = ultimoSaldoHasta(CANAL_USD, ym);
      var sfRow = ultimoSaldoHasta(CANAL_SF, ym);
      var sfUsdRow = ultimoSaldoHasta(CANAL_SF_USD, ym);
      var gal = g && mesYYYYMM(g.fecha_hasta) <= ym ? Number(g.saldo_final) : null;
      var galUsd = gUsdRow && mesYYYYMM(gUsdRow.fecha_hasta) <= ym ? Number(gUsdRow.saldo_final) : null;
      var mp = m && mesYYYYMM(m.fecha_hasta) <= ym ? Number(m.saldo_final) : null;
      var cred = credRow && mesYYYYMM(credRow.fecha_hasta) <= ym ? Number(credRow.saldo_final) : null;
      var gf = gfRow && mesYYYYMM(gfRow.fecha_hasta) <= ym ? Number(gfRow.saldo_final) : null;
      var mor = morRow && mesYYYYMM(morRow.fecha_hasta) <= ym ? Number(morRow.saldo_final) : null;
      var usd = usdRow && mesYYYYMM(usdRow.fecha_hasta) <= ym ? Number(usdRow.saldo_final) : null;
      var sf = sfRow && mesYYYYMM(sfRow.fecha_hasta) <= ym ? Number(sfRow.saldo_final) : null;
      var sfUsd = sfUsdRow && mesYYYYMM(sfUsdRow.fecha_hasta) <= ym ? Number(sfUsdRow.saldo_final) : null;
      if (gal != null && !isFinite(gal)) gal = null;
      if (galUsd != null && !isFinite(galUsd)) galUsd = null;
      if (mp != null && !isFinite(mp)) mp = null;
      if (cred != null && !isFinite(cred)) cred = null;
      if (gf != null && !isFinite(gf)) gf = null;
      if (mor != null && !isFinite(mor)) mor = null;
      if (usd != null && !isFinite(usd)) usd = null;
      if (sf != null && !isFinite(sf)) sf = null;
      if (sfUsd != null && !isFinite(sfUsd)) sfUsd = null;
      var total = round2((gal || 0) + (galUsd || 0) + (mp || 0) + (cred || 0) + (gf || 0) + (mor || 0) + (usd || 0) + (sf || 0) + (sfUsd || 0));
      if (gal == null && galUsd == null && mp == null && cred == null && gf == null && mor == null && usd == null && sf == null && sfUsd == null) total = null;
      var vari = (prevTotal != null && total != null) ? round2(total - prevTotal) : null;
      if (total != null) prevTotal = total;
      return {
        mes: ym,
        galicia: gal,
        galicia_usd: galUsd,
        mercadopago: mp,
        credicoop: cred,
        galicia_facturada: gf,
        morba_sf: mor,
        galicia_dolar: usd,
        efectivo_sf: sf,
        efectivo_sf_usd: sfUsd,
        total: total,
        variacion: vari
      };
    });
  }

  function kpisCanal(rows) {
    var list = conAnterior(rows.slice());
    if (!list.length) {
      return { n: 0, ultimo: null, varPer: null, fechaUltimo: null, promedioSaldo: null, promedioVar: null };
    }
    var orden = list.slice().sort(function (a, b) {
      return String(a.fecha_hasta).localeCompare(String(b.fecha_hasta));
    });
    var first = orden[0];
    var last = orden[orden.length - 1];
    var ini = saldoInicialMostrar(first);
    if (ini == null) ini = Number(first.saldo_final);
    var fin = Number(last.saldo_final);
    var varPer = (isFinite(ini) && isFinite(fin)) ? round2(fin - ini) : null;
    var vars = orden.map(variacionFila);
    return {
      n: list.length,
      ultimo: last.saldo_final,
      varPer: varPer,
      fechaUltimo: last.fecha_hasta,
      promedioSaldo: meanNums(orden.map(function (r) { return r.saldo_final; })),
      promedioVar: meanNums(vars)
    };
  }

  function kpisConsolidado(meses) {
    if (!meses.length) {
      return { n: 0, ultimo: null, varPer: null, fechaUltimo: null, promedioSaldo: null, promedioVar: null };
    }
    var first = meses[0];
    var last = meses[meses.length - 1];
    var ini = first.total;
    var fin = last.total;
    var varPer = (ini != null && fin != null) ? round2(fin - ini) : null;
    return {
      n: meses.length,
      ultimo: last.total,
      varPer: varPer,
      fechaUltimo: last.mes,
      promedioSaldo: meanNums(meses.map(function (x) { return x.total; })),
      promedioVar: meanNums(meses.map(function (x) { return x.variacion; }))
    };
  }

  var SUPABASE_PAGE = 1000;

  async function cargarDatos() {
    var all = [];
    var offset = 0;
    for (;;) {
      var res = await client().from('eb_saldo_extracto').select('*')
        .order('fecha_hasta', { ascending: true })
        .range(offset, offset + SUPABASE_PAGE - 1);
      if (res.error) throw res.error;
      var chunk = res.data || [];
      all = all.concat(chunk);
      if (chunk.length < SUPABASE_PAGE) break;
      offset += SUPABASE_PAGE;
    }
    state.rows = all;
  }

  async function recargar() {
    state.loading = true;
    renderShell();
    try {
      await cargarUsuarios();
      await cargarDatos();
      state.err = '';
    } catch (e) {
      state.err = 'No se pudo cargar Saldos extractos: ' + errMsg(e);
    } finally {
      state.loading = false;
      renderShell();
    }
  }

  function pedirPdfs(onFiles) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.multiple = true;
    input.addEventListener('change', function () {
      var list = input.files ? Array.prototype.slice.call(input.files) : [];
      if (list.length) onFiles(list);
    });
    input.click();
  }

  function pedirXlsx(onFiles) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.multiple = true;
    input.addEventListener('change', function () {
      var list = input.files ? Array.prototype.slice.call(input.files) : [];
      if (list.length) onFiles(list);
    });
    input.click();
  }

  function pedirPdfOXlsx(onFiles) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.multiple = true;
    input.addEventListener('change', function () {
      var list = input.files ? Array.prototype.slice.call(input.files) : [];
      if (list.length) onFiles(list);
    });
    input.click();
  }

  function esArchivoPdfSe(file) {
    if (!file) return false;
    if (file.type && /pdf/i.test(file.type)) return true;
    return /\.pdf$/i.test(file.name || '');
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

  function parseExtractoCceExcel(wb, archivo) {
    if (!/extracto[_\s-]*cce/i.test(normHeader(archivo)) && !/\bcce\d{6,}/i.test(normHeader(archivo))) {
      return { error: (archivo || '') + ': esperaba Extracto_CCE… de Galicia (USD).' };
    }
    var names = wb.SheetNames || [];
    var name = names.indexOf('Movimientos') >= 0 ? 'Movimientos' : names[0];
    var sheet = wb.Sheets[name];
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (!rows.length) return { error: (archivo || '') + ': el Excel no tiene filas.' };
    var map = {};
    (rows[0] || []).forEach(function (h, i) { map[normHeader(h)] = i; });
    if (map.fecha == null || map.saldo == null) {
      return { error: (archivo || '') + ': no reconocí Fecha y Saldo del extracto CCE.' };
    }
    var filas = [];
    var r;
    for (r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var fecha = parseFechaYmd(row[map.fecha]);
      var deb = parseMontoSe(row[map.debitos != null ? map.debitos : map.debito]);
      var cred = parseMontoSe(row[map.creditos != null ? map.creditos : map.credito]);
      var saldo = parseMontoSe(row[map.saldo]);
      if (!fecha && deb == null && cred == null) continue;
      var monto = 0;
      if (cred != null && cred !== 0) monto = cred;
      else if (deb != null && deb !== 0) monto = -Math.abs(deb);
      filas.push({ fecha: fecha || hoyYmd(), monto: monto, saldo: saldo, fila_excel: r + 1 });
    }
    if (!filas.length) return { error: (archivo || '') + ': no encontré movimientos en el extracto CCE.' };
    return { error: null, filas: filas };
  }

  async function onUploadGaliciaUsd() {
    if (!can(PERM_CARGAR)) return;
    pedirPdfOXlsx(async function (files) {
      state.loading = true;
      state.err = '';
      state.msg = '';
      renderShell();
      try {
        var okPdf = [];
        var okXls = 0;
        var fallos = [];
        var i;
        for (i = 0; i < files.length; i++) {
          try {
            if (esArchivoPdfSe(files[i])) {
              var parsedPdf = await parseArchivo(files[i], CANAL_GAL_USD);
              if (parsedPdf.error) { fallos.push(parsedPdf.error); continue; }
              okPdf.push(parsedPdf.fila);
            } else {
              if (!global.XLSX) throw new Error('No está disponible la librería Excel.');
              var wb = await leerExcelFile(files[i]);
              var parsed = parseExtractoCceExcel(wb, files[i].name);
              if (parsed.error) { fallos.push(parsed.error); continue; }
              await guardarCorteGaliciaUsd(parsed.filas, files[i].name);
              okXls += 1;
            }
          } catch (e) {
            fallos.push((files[i] && files[i].name ? files[i].name + ': ' : '') + errMsg(e));
          }
        }
        if (okPdf.length) {
          await cargarDatos();
          var rpc = await client().rpc('eb_guardar_saldos', { p_filas: okPdf });
          if (rpc.error) throw rpc.error;
        }
        var ok = okPdf.length + okXls;
        if (!ok) throw new Error(fallos.length ? fallos.join('\n') : 'No se pudo leer ningún resumen Galicia (USD).');
        await cargarDatos();
        state.msg = LABEL_GAL_USD + ': ' + ok + ' extracto(s) pesificado(s) al MEP.' +
          (fallos.length ? ' No reconocí ' + fallos.length + ' archivo(s).' : '');
        if (fallos.length) state.err = fallos.slice(0, 4).join(' · ');
      } catch (e) {
        state.err = errMsg(e);
      } finally {
        state.loading = false;
        renderShell();
      }
    });
  }

  async function onUpload(canalEsperado) {
    if (!can(PERM_CARGAR) || canalEsperado === CANAL_CONS) return;
    pedirPdfs(async function (files) {
      state.loading = true;
      state.err = '';
      state.msg = '';
      renderShell();
      try {
        await ensurePdfJs();
        var ok = [];
        var fallos = [];
        var i;
        for (i = 0; i < files.length; i++) {
          try {
            var parsed = await parseArchivo(files[i], canalEsperado);
            if (parsed.error) fallos.push(parsed.error);
            else ok.push(parsed.fila);
          } catch (e) {
            fallos.push((files[i] && files[i].name ? files[i].name + ': ' : '') + errMsg(e));
          }
        }
        if (!ok.length) throw new Error(fallos.length ? fallos.join('\n') : 'No se pudo leer ningún PDF.');
        await cargarDatos();
        var nAntes = state.rows.length;
        var rpc = await client().rpc('eb_guardar_saldos', { p_filas: ok });
        if (rpc.error) throw rpc.error;
        await cargarDatos();
        var nNuevos = Math.max(0, state.rows.length - nAntes);
        var nYa = Math.max(0, ok.length - nNuevos);
        var extraDup = nNuevos
          ? (nYa ? ' ' + nNuevos + ' nuevos; ' + nYa + ' ya estaban (no se duplican).' : ' ' + nNuevos + ' nuevos.')
          : ' Ninguno nuevo: los ' + ok.length + ' ya estaban (no se duplican).';
        extraDup += ' No se borró ningún resumen anterior.';
        if (fallos.length) extraDup += ' No reconocí ' + fallos.length + ' archivo(s).';
        var lab = canalEsperado === CANAL_MP ? 'Mercado Pago' : 'Galicia';
        state.msg = lab + ': ' + ok.length + ' resumen(es) leído(s).' + extraDup;
        if (fallos.length) state.err = fallos.slice(0, 4).join(' · ');
      } catch (e) {
        state.err = errMsg(e);
      } finally {
        state.loading = false;
        renderShell();
      }
    });
  }

  function destruirChart() {
    if (state.chart && typeof state.chart.destroy === 'function') {
      try { state.chart.destroy(); } catch (e) { /* ignore */ }
    }
    state.chart = null;
  }

  function pintarChartCanal(rows, titulo, labelCierre) {
    destruirChart();
    var canvas = root() && root().querySelector('#se-chart');
    if (!canvas || typeof global.Chart === 'undefined') return;
    var orden = conAnterior(rows.slice()).sort(function (a, b) {
      return String(a.fecha_hasta).localeCompare(String(b.fecha_hasta));
    });
    if (!orden.length) return;
    state.chart = new global.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: orden.map(function (r) { return formatFecha(r.fecha_hasta); }),
        datasets: [
          {
            label: labelCierre,
            data: orden.map(function (r) { return Number(r.saldo_final); }),
            borderColor: '#0f172a',
            backgroundColor: 'rgba(15, 23, 42, 0.08)',
            tension: 0.15,
            pointRadius: 4,
            fill: true
          },
          {
            label: 'Saldo anterior / inicial (ARS)',
            data: orden.map(function (r) {
              var ini = saldoInicialMostrar(r);
              return ini == null ? null : ini;
            }),
            borderColor: '#ea580c',
            backgroundColor: 'transparent',
            borderDash: [6, 4],
            tension: 0.15,
            pointRadius: 3,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: titulo }
        },
        scales: {
          y: {
            ticks: {
              callback: function (v) {
                return Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 });
              }
            }
          }
        }
      }
    });
  }

  function pintarChartConsolidado(meses) {
    destruirChart();
    var canvas = root() && root().querySelector('#se-chart');
    if (!canvas || typeof global.Chart === 'undefined' || !meses.length) return;
    state.chart = new global.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: meses.map(function (x) { return formatMesLabel(x.mes); }),
        datasets: [
          {
            label: 'Total consolidado (ARS)',
            data: meses.map(function (x) { return x.total; }),
            borderColor: '#0f172a',
            backgroundColor: 'rgba(15, 23, 42, 0.08)',
            tension: 0.15,
            pointRadius: 4,
            fill: true
          },
          {
            label: LABEL_GAL,
            data: meses.map(function (x) { return x.galicia; }),
            borderColor: '#64748b',
            backgroundColor: 'transparent',
            borderDash: [5, 4],
            tension: 0.15,
            pointRadius: 3,
            fill: false
          },
          {
            label: LABEL_GAL_USD + ' (ARS, MEP)',
            data: meses.map(function (x) { return x.galicia_usd; }),
            borderColor: '#0e7490',
            backgroundColor: 'transparent',
            borderDash: [8, 4],
            tension: 0.15,
            pointRadius: 3,
            fill: false
          },
          {
            label: 'Mercado Pago (ARS)',
            data: meses.map(function (x) { return x.mercadopago; }),
            borderColor: '#0d7d3d',
            backgroundColor: 'transparent',
            tension: 0.15,
            pointRadius: 3,
            fill: false
          },
          {
            label: LABEL_CRED,
            data: meses.map(function (x) { return x.credicoop; }),
            borderColor: '#111111',
            backgroundColor: 'transparent',
            tension: 0.15,
            pointRadius: 3,
            fill: false
          },
          {
            label: LABEL_GF,
            data: meses.map(function (x) { return x.galicia_facturada; }),
            borderColor: '#b45309',
            backgroundColor: 'transparent',
            borderDash: [2, 3],
            tension: 0.15,
            pointRadius: 3,
            fill: false
          },
          {
            label: LABEL_MOR,
            data: meses.map(function (x) { return x.morba_sf; }),
            borderColor: '#7c3aed',
            backgroundColor: 'transparent',
            borderDash: [4, 3],
            tension: 0.15,
            pointRadius: 3,
            fill: false
          },
          {
            label: LABEL_USD + ' (ARS)',
            data: meses.map(function (x) { return x.galicia_dolar; }),
            borderColor: '#0369a1',
            backgroundColor: 'transparent',
            borderDash: [1, 3],
            tension: 0.15,
            pointRadius: 3,
            fill: false
          },
          {
            label: LABEL_SF,
            data: meses.map(function (x) { return x.efectivo_sf; }),
            borderColor: '#57534e',
            backgroundColor: 'transparent',
            borderDash: [6, 2],
            tension: 0.15,
            pointRadius: 3,
            fill: false
          },
          {
            label: LABEL_SF_USD + ' (ARS)',
            data: meses.map(function (x) { return x.efectivo_sf_usd; }),
            borderColor: '#44403c',
            backgroundColor: 'transparent',
            borderDash: [2, 2],
            tension: 0.15,
            pointRadius: 3,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: 'Posición consolidada de saldos por mes' }
        },
        scales: {
          y: {
            ticks: {
              callback: function (v) {
                return Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 });
              }
            }
          }
        }
      }
    });
  }

  function aplicarEstilosExcel(ws, headerRow, dateCols, numCols) {
    if (!ws['!ref']) return;
    var range = global.XLSX.utils.decode_range(ws['!ref']);
    var r;
    var c;
    var dateSet = {};
    var numSet = {};
    (dateCols || []).forEach(function (i) { dateSet[i] = true; });
    (numCols || []).forEach(function (i) { numSet[i] = true; });
    for (r = 0; r <= range.e.r; r++) {
      for (c = 0; c <= range.e.c; c++) {
        var addr = global.XLSX.utils.encode_cell({ r: r, c: c });
        var cell = ws[addr];
        if (!cell) continue;
        if (r === 0) cell.s = { font: { bold: true, sz: 13 } };
        if (r === headerRow) {
          cell.s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF1E293B' } } };
        }
        if (r > headerRow && dateSet[c] && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = 'dd/mm/yyyy';
        }
        if (r > headerRow && numSet[c] && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = '#,##0.00';
        }
      }
    }
  }

  function exportarExcel() {
    if (!can(PERM_EXPORTAR) && !can(PERM_VER)) return;
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    var headerRow = 6;
    var aoa = [];
    var dateCols = [];
    var numCols = [];
    var cols = [];
    var sheetName = 'Saldos';
    var fileName = 'Saldos_Extractos.xlsx';
    var meta = [
      ['Período desde', state.mesDesde ? formatMesLabel(state.mesDesde) : 'Todos'],
      ['Período hasta', state.mesHasta ? formatMesLabel(state.mesHasta) : 'Todos'],
      ['Exportado', formatFecha(hoyYmd())],
      []
    ];

    if (state.canal === CANAL_CONS) {
      var meses = filasConsolidado();
      if (!meses.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — Posición consolidada']].concat(meta);
      aoa.push(['Mes', LABEL_GAL, LABEL_GAL_USD, 'Mercado Pago', LABEL_CRED, LABEL_GF, LABEL_MOR, LABEL_USD, LABEL_SF, LABEL_SF_USD, 'Total', 'Variación']);
      dateCols = [];
      numCols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      cols = [{ wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
      meses.forEach(function (x) {
        aoa.push([
          formatMesLabel(x.mes),
          excelNum(x.galicia),
          excelNum(x.galicia_usd),
          excelNum(x.mercadopago),
          excelNum(x.credicoop),
          excelNum(x.galicia_facturada),
          excelNum(x.morba_sf),
          excelNum(x.galicia_dolar),
          excelNum(x.efectivo_sf),
          excelNum(x.efectivo_sf_usd),
          excelNum(x.total),
          excelNum(x.variacion)
        ]);
      });
      sheetName = 'Consolidado';
      fileName = 'Saldos_Extractos_Consolidado.xlsx';
    } else if (state.canal === CANAL_MP) {
      var rowsMp = conAnterior(filasCanal(CANAL_MP));
      if (!rowsMp.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — Mercado Pago']].concat(meta);
      aoa.push(['Fecha', 'Saldo total', 'Saldo disponible', 'Saldo a liberar', 'Saldo anterior', 'Variación', 'CUST_ID', 'Archivo', 'Usuario']);
      dateCols = [0];
      numCols = [1, 2, 3, 4, 5];
      cols = [{ wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 40 }];
      rowsMp.forEach(function (r) {
        aoa.push([
          excelDate(r.fecha_hasta),
          excelNum(r.saldo_final),
          excelNum(extraSaldo(r, 'saldo_disponible')),
          excelNum(extraSaldo(r, 'saldo_a_liberar')),
          excelNum(saldoInicialMostrar(r)),
          excelNum(variacionFila(r)),
          r.nro_cuenta || '',
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = 'Saldos MP';
      fileName = 'Saldos_Extractos_MercadoPago.xlsx';
    } else if (state.canal === CANAL_GAL) {
      var rowsG = conAnterior(filasCanal(CANAL_GAL));
      if (!rowsG.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — ' + LABEL_GAL]].concat(meta);
      aoa.push(['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial', 'Saldo final', 'Variación', 'Cuenta', 'CBU', 'Documento', 'Archivo', 'Usuario']);
      dateCols = [0, 1, 2];
      numCols = [3, 4, 5];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 40 }];
      rowsG.forEach(function (r) {
        aoa.push([
          excelDate(r.fecha_hasta),
          excelDate(r.fecha_desde),
          excelDate(r.fecha_hasta),
          excelNum(saldoInicialMostrar(r)),
          excelNum(r.saldo_final),
          excelNum(variacionFila(r)),
          r.nro_cuenta || '',
          r.cbu || '',
          r.documento_id || '',
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = 'Saldos Galicia ARS';
      fileName = 'Saldos_Extractos_Galicia_ARS.xlsx';
    } else if (state.canal === CANAL_GAL_USD) {
      var rowsGUsd = conAnterior(filasCanal(CANAL_GAL_USD));
      if (!rowsGUsd.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — ' + LABEL_GAL_USD + ' (ARS, MEP)']].concat(meta);
      aoa.push(['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial ARS', 'Saldo final ARS', 'USD orig.', 'TC MEP', 'Fecha TC', 'Cuenta', 'Archivo', 'Usuario']);
      dateCols = [0, 1, 2, 7];
      numCols = [3, 4, 5, 6];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 40 }];
      rowsGUsd.forEach(function (r) {
        var raw = r.raw || {};
        aoa.push([
          excelDate(r.fecha_hasta),
          excelDate(r.fecha_desde),
          excelDate(r.fecha_hasta),
          excelNum(saldoInicialMostrar(r)),
          excelNum(r.saldo_final),
          excelNum(raw.saldo_usd),
          excelNum(raw.tipo_cambio_mep),
          excelDate(raw.tipo_cambio_fecha),
          r.nro_cuenta || '',
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = 'Galicia USD';
      fileName = 'Saldos_Extractos_Galicia_USD.xlsx';
    } else if (state.canal === CANAL_CRED) {
      var rowsCredX = conAnterior(filasCanal(CANAL_CRED));
      if (!rowsCredX.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — ' + LABEL_CRED + ' (desde tesorería)']].concat(meta);
      aoa.push(['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial', 'Saldo final', 'Variación', 'Archivo', 'Usuario']);
      dateCols = [0, 1, 2];
      numCols = [3, 4, 5];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 40 }];
      rowsCredX.forEach(function (r) {
        aoa.push([
          excelDate(r.fecha_hasta),
          excelDate(r.fecha_desde),
          excelDate(r.fecha_hasta),
          excelNum(saldoInicialMostrar(r)),
          excelNum(r.saldo_final),
          excelNum(variacionFila(r)),
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = 'Credicoop';
      fileName = 'Saldos_Extractos_Credicoop.xlsx';
    } else if (state.canal === CANAL_GF) {
      var rowsGf = conAnterior(filasCanal(CANAL_GF));
      if (!rowsGf.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — ' + LABEL_GF]].concat(meta);
      aoa.push(['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial', 'Saldo final', 'Variación', 'Archivo', 'Usuario']);
      dateCols = [0, 1, 2];
      numCols = [3, 4, 5];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 40 }];
      rowsGf.forEach(function (r) {
        aoa.push([
          excelDate(r.fecha_hasta),
          excelDate(r.fecha_desde),
          excelDate(r.fecha_hasta),
          excelNum(saldoInicialMostrar(r)),
          excelNum(r.saldo_final),
          excelNum(variacionFila(r)),
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = LABEL_GF;
      fileName = 'Saldos_Extractos_Efectivo-f_ARS.xlsx';
    } else if (state.canal === CANAL_MOR) {
      var rowsMor = conAnterior(filasCanal(CANAL_MOR));
      if (!rowsMor.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — ' + LABEL_MOR]].concat(meta);
      aoa.push(['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial', 'Saldo final', 'Variación', 'Archivo', 'Usuario']);
      dateCols = [0, 1, 2];
      numCols = [3, 4, 5];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 40 }];
      rowsMor.forEach(function (r) {
        aoa.push([
          excelDate(r.fecha_hasta),
          excelDate(r.fecha_desde),
          excelDate(r.fecha_hasta),
          excelNum(saldoInicialMostrar(r)),
          excelNum(r.saldo_final),
          excelNum(variacionFila(r)),
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = 'Morba-sf (ARS)';
      fileName = 'Saldos_Extractos_Morba-sf_ARS.xlsx';
    } else if (state.canal === CANAL_USD) {
      var rowsUsd = conAnterior(filasCanal(CANAL_USD));
      if (!rowsUsd.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — ' + LABEL_USD + ' (ARS, MEP)']].concat(meta);
      aoa.push(['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial ARS', 'Saldo final ARS', 'Variación', 'Archivo', 'Usuario']);
      dateCols = [0, 1, 2];
      numCols = [3, 4, 5];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 40 }];
      rowsUsd.forEach(function (r) {
        aoa.push([
          excelDate(r.fecha_hasta),
          excelDate(r.fecha_desde),
          excelDate(r.fecha_hasta),
          excelNum(saldoInicialMostrar(r)),
          excelNum(r.saldo_final),
          excelNum(variacionFila(r)),
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = 'Efectivo-f USD';
      fileName = 'Saldos_Extractos_Efectivo-f_USD.xlsx';
    } else if (state.canal === CANAL_SF) {
      var rowsSf = conAnterior(filasCanal(CANAL_SF));
      if (!rowsSf.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — ' + LABEL_SF]].concat(meta);
      aoa.push(['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial', 'Saldo final', 'Variación', 'Archivo', 'Usuario']);
      dateCols = [0, 1, 2];
      numCols = [3, 4, 5];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 40 }];
      rowsSf.forEach(function (r) {
        aoa.push([
          excelDate(r.fecha_hasta),
          excelDate(r.fecha_desde),
          excelDate(r.fecha_hasta),
          excelNum(saldoInicialMostrar(r)),
          excelNum(r.saldo_final),
          excelNum(variacionFila(r)),
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = LABEL_SF;
      fileName = 'Saldos_Extractos_Efectivo-sf_ARS.xlsx';
    } else if (state.canal === CANAL_SF_USD) {
      var rowsSfUsd = conAnterior(filasCanal(CANAL_SF_USD));
      if (!rowsSfUsd.length) {
        alert('No hay saldos visibles con el período elegido.');
        return;
      }
      aoa = [['Saldos extractos — ' + LABEL_SF_USD + ' (ARS, MEP)']].concat(meta);
      aoa.push(['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial ARS', 'Saldo final ARS', 'Variación', 'Archivo', 'Usuario']);
      dateCols = [0, 1, 2];
      numCols = [3, 4, 5];
      cols = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 40 }];
      rowsSfUsd.forEach(function (r) {
        aoa.push([
          excelDate(r.fecha_hasta),
          excelDate(r.fecha_desde),
          excelDate(r.fecha_hasta),
          excelNum(saldoInicialMostrar(r)),
          excelNum(r.saldo_final),
          excelNum(variacionFila(r)),
          r.archivo || '',
          textoUsuario(r.updated_by, r.created_by)
        ]);
      });
      sheetName = 'Efectivo-sf USD';
      fileName = 'Saldos_Extractos_Efectivo-sf_USD.xlsx';
    }

    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols;
    aplicarEstilosExcel(ws, headerRow, dateCols, numCols);
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    global.XLSX.writeFile(wb, fileName, { cellStyles: true, cellDates: false });
  }

  function htmlMonto(n, clsExtra) {
    var v = Number(n);
    var cls = '';
    if (clsExtra === 'var') {
      if (v > 0) cls = ' se-monto-pos';
      else if (v < 0) cls = ' se-monto-neg';
    }
    return '<span class="se-col-monto' + cls + '">' + esc(formatMonto(n)) + '</span>';
  }

  function renderFiltros() {
    var meses = opcionesMes();
    function opts(sel) {
      var html = '<option value="">Todos</option>';
      meses.forEach(function (ym) {
        html += '<option value="' + esc(ym) + '"' + (sel === ym ? ' selected' : '') + '>' + esc(formatMesLabel(ym)) + '</option>';
      });
      return html;
    }
    var dOn = !!state.mesDesde;
    var hOn = !!state.mesHasta;
    return '<div class="se-filtros">' +
      ((dOn || hOn) ? '<span class="se-filtros-flag">Filtros activos</span>' : '') +
      '<div class="form-group' + (dOn ? ' se-filtro-activo' : '') + '"><label for="se-mes-desde">Desde</label>' +
      '<select id="se-mes-desde" title="Mes de cierre desde">' + opts(state.mesDesde) + '</select></div>' +
      '<div class="form-group' + (hOn ? ' se-filtro-activo' : '') + '"><label for="se-mes-hasta">Hasta</label>' +
      '<select id="se-mes-hasta" title="Mes de cierre hasta">' + opts(state.mesHasta) + '</select></div>' +
    '</div>';
  }

  function renderTablaGalicia(rows) {
    var list = conAnterior(rows);
    if (!list.length) {
      return '<p class="se-empty">' + ((state.rows || []).some(function (r) { return r.canal === CANAL_GAL; })
        ? 'No hay resúmenes Galicia en el período elegido.'
        : 'Todavía no hay saldos Galicia. Cargá uno o varios PDF Extracto_Cuentas_Galicia_…') + '</p>';
    }
    var html = '';
    list.forEach(function (r) {
      html += '<tr>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td>' + formatFecha(r.fecha_desde) + '</td>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(saldoInicialMostrar(r)) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(r.saldo_final) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(variacionFila(r), 'var') + '</td>' +
        '<td>' + esc(r.nro_cuenta || '—') + '</td>' +
        '<td>' + esc(r.archivo || '—') + '</td>' +
        '<td>' + htmlUsuario(r.updated_by, r.created_by) + '</td>' +
      '</tr>';
    });
    return '<div class="se-tabla-wrap"><table class="se-tabla">' +
      '<thead><tr>' +
        '<th>Cierre</th><th>Desde</th><th>Hasta</th>' +
        '<th class="se-col-monto">Saldo inicial</th><th class="se-col-monto">Saldo final</th>' +
        '<th class="se-col-monto">Variación</th><th>Cuenta</th><th>Archivo</th><th>Usuario</th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function renderTablaMp(rows) {
    var list = conAnterior(rows);
    if (!list.length) {
      return '<p class="se-empty">' + ((state.rows || []).some(function (r) { return r.canal === CANAL_MP; })
        ? 'No hay cartas de saldo de Mercado Pago en el período elegido.'
        : 'Todavía no hay saldos de Mercado Pago. Cargá uno o varios PDF MP_Saldos_…') + '</p>';
    }
    var html = '';
    list.forEach(function (r) {
      html += '<tr>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(r.saldo_final) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(extraSaldo(r, 'saldo_disponible')) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(extraSaldo(r, 'saldo_a_liberar')) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(saldoInicialMostrar(r)) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(variacionFila(r), 'var') + '</td>' +
        '<td>' + esc(r.nro_cuenta || '—') + '</td>' +
        '<td>' + esc(r.archivo || '—') + '</td>' +
        '<td>' + htmlUsuario(r.updated_by, r.created_by) + '</td>' +
      '</tr>';
    });
    return '<div class="se-tabla-wrap"><table class="se-tabla se-tabla-mp">' +
      '<thead><tr>' +
        '<th>Al</th>' +
        '<th class="se-col-monto">Saldo total</th>' +
        '<th class="se-col-monto">Disponible</th>' +
        '<th class="se-col-monto">A liberar</th>' +
        '<th class="se-col-monto">Saldo anterior</th>' +
        '<th class="se-col-monto">Variación</th>' +
        '<th>CUST_ID</th><th>Archivo</th><th>Usuario</th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function renderTablaGaliciaUsd() {
    var list = conAnterior(filasCanal(CANAL_GAL_USD));
    if (!list.length) {
      return '<p class="se-empty">' + ((state.rows || []).some(function (r) { return r.canal === CANAL_GAL_USD; })
        ? 'No hay cortes de ' + esc(LABEL_GAL_USD) + ' en el período elegido.'
        : 'Todavía no hay saldo de ' + esc(LABEL_GAL_USD) + '. Cargá el PDF Extracto_Cuentas_Galicia_… (cuenta en dólares) o el Excel Extracto_CCE… en Conciliación Bancaria o acá. El saldo en USD se pesifica al MEP.') + '</p>';
    }
    var html = '';
    list.forEach(function (r) {
      var raw = r.raw || {};
      html += '<tr>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td>' + formatFecha(r.fecha_desde) + '</td>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(saldoInicialMostrar(r)) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(r.saldo_final) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(raw.saldo_usd) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(raw.tipo_cambio_mep) + '</td>' +
        '<td>' + formatFecha(raw.tipo_cambio_fecha) + '</td>' +
        '<td>' + esc(r.nro_cuenta || '—') + '</td>' +
        '<td>' + esc(r.archivo || '—') + '</td>' +
        '<td>' + htmlUsuario(r.updated_by, r.created_by) + '</td>' +
      '</tr>';
    });
    return '<div class="se-tabla-wrap"><table class="se-tabla se-tabla-gal-usd">' +
      '<thead><tr>' +
        '<th>Cierre</th><th>Desde</th><th>Hasta</th>' +
        '<th class="se-col-monto">Saldo inicial ARS</th><th class="se-col-monto">Saldo final ARS</th>' +
        '<th class="se-col-monto">USD orig.</th><th class="se-col-monto">TC MEP</th><th>Fecha TC</th>' +
        '<th>Cuenta</th><th>Archivo</th><th>Usuario</th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function renderTablaCajaFisica(canal, label, hintCarga, menuDestino) {
    var list = conAnterior(filasCanal(canal));
    var menu = menuDestino || 'Cajas (físicas)';
    if (!list.length) {
      return '<p class="se-empty">' + ((state.rows || []).some(function (r) { return r.canal === canal; })
        ? 'No hay cortes de ' + esc(label) + ' en el período elegido.'
        : 'Todavía no hay saldo de ' + esc(label) + '. Cargá ' + esc(hintCarga) + ' en el menú <strong>' + esc(menu) + '</strong>.') + '</p>';
    }
    var html = '';
    list.forEach(function (r) {
      html += '<tr>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td>' + formatFecha(r.fecha_desde) + '</td>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(saldoInicialMostrar(r)) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(r.saldo_final) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(variacionFila(r), 'var') + '</td>' +
        '<td>' + esc(r.archivo || '—') + '</td>' +
        '<td>' + htmlUsuario(r.updated_by, r.created_by) + '</td>' +
      '</tr>';
    });
    return '<div class="se-tabla-wrap"><table class="se-tabla">' +
      '<thead><tr>' +
        '<th>Cierre</th><th>Desde</th><th>Hasta</th>' +
        '<th class="se-col-monto">Saldo inicial</th><th class="se-col-monto">Saldo final</th>' +
        '<th class="se-col-monto">Variación</th><th>Archivo</th><th>Usuario</th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function renderTablaGf(rows) {
    return renderTablaCajaFisica(CANAL_GF, LABEL_GF, 'tesoreria_efectivo_pesos_… o cierre_PES-…');
  }

  function renderTablaConsolidado(meses) {
    if (!meses.length) {
      return '<p class="se-empty">No hay saldos para consolidar. Cargá ' + esc(LABEL_GAL) + ', ' + esc(LABEL_GAL_USD) + ', Mercado Pago, ' + esc(LABEL_CRED) + ' y/o las cajas físicas (' + esc(LABEL_GF) + ', ' + esc(LABEL_MOR) + ', ' + esc(LABEL_USD) + ', ' + esc(LABEL_SF) + ', ' + esc(LABEL_SF_USD) + ').</p>';
    }
    var html = '';
    meses.slice().reverse().forEach(function (x) {
      html += '<tr>' +
        '<td>' + esc(formatMesLabel(x.mes)) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.galicia) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.galicia_usd) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.mercadopago) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.credicoop) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.galicia_facturada) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.morba_sf) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.galicia_dolar) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.efectivo_sf) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.efectivo_sf_usd) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.total) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(x.variacion, 'var') + '</td>' +
      '</tr>';
    });
    return '<div class="se-tabla-wrap"><table class="se-tabla se-tabla-consolidado">' +
      '<thead><tr>' +
        '<th>Mes</th>' +
        '<th class="se-col-monto">' + esc(LABEL_GAL) + '</th>' +
        '<th class="se-col-monto">' + esc(LABEL_GAL_USD) + '</th>' +
        '<th class="se-col-monto">Mercado Pago</th>' +
        '<th class="se-col-monto">' + esc(LABEL_CRED) + '</th>' +
        '<th class="se-col-monto">' + esc(LABEL_GF) + '</th>' +
        '<th class="se-col-monto">' + esc(LABEL_MOR) + '</th>' +
        '<th class="se-col-monto">' + esc(LABEL_USD) + '</th>' +
        '<th class="se-col-monto">' + esc(LABEL_SF) + '</th>' +
        '<th class="se-col-monto">' + esc(LABEL_SF_USD) + '</th>' +
        '<th class="se-col-monto">Total</th>' +
        '<th class="se-col-monto">Variación</th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function renderKpis(k, nLabel) {
    return '<div class="se-resumen">' +
      '<div class="se-resumen-card"><p class="lab">' + esc(nLabel) + '</p><p class="val">' + k.n + '</p></div>' +
      '<div class="se-resumen-card"><p class="lab">Último saldo</p><p class="val">' + esc(formatMonto(k.ultimo)) + '</p>' +
        (k.fechaUltimo ? '<p class="sub">' + (String(k.fechaUltimo).length === 10 ? formatFecha(k.fechaUltimo) : esc(formatMesLabel(String(k.fechaUltimo).slice(0, 7)))) + '</p>' : '') + '</div>' +
      '<div class="se-resumen-card"><p class="lab">Variación del período</p><p class="val">' + esc(formatMonto(k.varPer)) + '</p></div>' +
      '<div class="se-resumen-card"><p class="lab">Promedio de saldo</p><p class="val">' + esc(formatMonto(k.promedioSaldo)) + '</p>' +
        '<p class="sub">Cuánto queda en promedio</p></div>' +
      '<div class="se-resumen-card"><p class="lab">Promedio de variación</p><p class="val">' + esc(formatMonto(k.promedioVar)) + '</p>' +
        '<p class="sub">Cambio medio entre cortes</p></div>' +
    '</div>';
  }

  function hintCanal() {
    if (state.canal === CANAL_MP) {
      return 'Cartas de saldo de <strong>Mercado Pago</strong> (PDF <em>MP_Saldos_YYYYMMDD</em>). Cada archivo es el saldo al día (total, disponible, a liberar). La variación es contra la carta anterior. Se guardan sin duplicar ni borrar lo previo.';
    }
    if (state.canal === CANAL_GAL) {
      return 'Resúmenes de <strong>' + esc(LABEL_GAL) + '</strong> (PDF <em>Extracto_Cuentas_Galicia_…</em>): saldo inicial y de cierre del período. Elegí uno o varios; se leen de a uno y se guardan juntos, sin duplicar ni borrar lo anterior.';
    }
    if (state.canal === CANAL_GAL_USD) {
      return 'Resúmenes de <strong>' + esc(LABEL_GAL_USD) + '</strong> (PDF <em>Extracto_Cuentas_Galicia_…</em> de Cuenta Corriente Especial en dólares, o Excel <em>Extracto_CCE…</em>). El saldo en USD se pesifica al MEP de la fecha de cierre (o la última cotización anterior) para verlo en pesos. Elegí uno o varios; se guardan juntos, sin duplicar ni borrar lo anterior.';
    }
    if (state.canal === CANAL_CRED) {
      return 'Saldo de <strong>' + esc(LABEL_CRED) + '</strong> (caja banco). No hay extractos históricos: el corte se arma con la tesorería de <strong>Conciliación Bancaria</strong> (<em>tesoreria_transferencia_credicoop_…</em>, cierre o histórico Transferencia Credicoop). Apertura de Caja no entra. Si un mes no tiene corte, el consolidado arrastra el anterior.';
    }
    if (state.canal === CANAL_GF) {
      return 'Saldo de <strong>' + esc(LABEL_GF) + '</strong> (caja física / efectivo pesos). No se carga acá: se actualiza al importar <em>tesoreria_efectivo_pesos_…</em> o <em>cierre_PES-…</em> en el menú <strong>Cajas (físicas)</strong>.';
    }
    if (state.canal === CANAL_MOR) {
      return 'Saldo de <strong>' + esc(LABEL_MOR) + '</strong> (caja física / Transferencia Morba). No se carga acá: se actualiza al importar <em>tesoreria_transferencia_morba_…</em> o <em>cierre_MOR-…</em> en el menú <strong>Cajas (físicas)</strong>.';
    }
    if (state.canal === CANAL_USD) {
      return 'Saldo de <strong>' + esc(LABEL_USD) + '</strong> (caja física / efectivo dólar, en ARS). No se carga acá: se actualiza al importar <em>tesoreria_efectivo_dolar_…</em> o <em>cierre_DOL-…</em> en <strong>Cajas (físicas)</strong>. Cada movimiento se pesifica al MEP de la fecha (o el último anterior).';
    }
    if (state.canal === CANAL_SF) {
      return 'Saldo de <strong>' + esc(LABEL_SF) + '</strong> (caja física / efectivo pesos sin factura). No se carga acá: se actualiza al importar el histórico con Caja <em>Efectivo Pesos (sin factura)</em> en <strong>Cajas (físicas)</strong>.';
    }
    if (state.canal === CANAL_SF_USD) {
      return 'Saldo de <strong>' + esc(LABEL_SF_USD) + '</strong> (caja física / efectivo dólar sin factura, en ARS). No se carga acá: se actualiza al importar el histórico con Caja <em>Efectivo Dolar (sin factura)</em> o Moneda USD en <strong>Cajas (físicas)</strong>.';
    }
    return 'Posición <strong>consolidada al mes</strong>: último saldo de ' + esc(LABEL_GAL) + ', ' + esc(LABEL_GAL_USD) + ', Mercado Pago, ' + esc(LABEL_CRED) + ', ' + esc(LABEL_GF) + ', ' + esc(LABEL_MOR) + ', ' + esc(LABEL_USD) + ', ' + esc(LABEL_SF) + ' y ' + esc(LABEL_SF_USD) + ' (si un canal no tiene corte ese mes, se arrastra el anterior). El promedio de saldo es cuánto dinero queda en promedio.';
  }

  function renderShell() {
    var el = root();
    if (!el) return;
    if (!can(PERM_VER)) {
      el.innerHTML = '<p class="se-empty">No tenés permiso para ver Saldos extractos.</p>';
      return;
    }
    var canCargar = can(PERM_CARGAR);
    var canXls = can(PERM_EXPORTAR);
    var tabla = '';
    var kpisHtml = '';
    var hayChart = false;
    var rowsMp = filasCanal(CANAL_MP);
    var rowsGal = filasCanal(CANAL_GAL);
    var rowsGf = filasCanal(CANAL_GF);
    var rowsMor = filasCanal(CANAL_MOR);
    var rowsUsd = filasCanal(CANAL_USD);
    var rowsGalUsd = filasCanal(CANAL_GAL_USD);
    var rowsCred = filasCanal(CANAL_CRED);
    var meses = filasConsolidado();

    if (state.canal === CANAL_MP) {
      kpisHtml = renderKpis(kpisCanal(rowsMp), 'Cartas');
      tabla = renderTablaMp(rowsMp);
      hayChart = !!rowsMp.length;
    } else if (state.canal === CANAL_GAL) {
      kpisHtml = renderKpis(kpisCanal(rowsGal), 'Resúmenes');
      tabla = renderTablaGalicia(rowsGal);
      hayChart = !!rowsGal.length;
    } else if (state.canal === CANAL_GAL_USD) {
      kpisHtml = renderKpis(kpisCanal(rowsGalUsd), 'Cortes');
      tabla = renderTablaGaliciaUsd();
      hayChart = !!rowsGalUsd.length;
    } else if (state.canal === CANAL_CRED) {
      kpisHtml = renderKpis(kpisCanal(rowsCred), 'Cortes');
      tabla = renderTablaCajaFisica(CANAL_CRED, LABEL_CRED, 'tesoreria_transferencia_credicoop_… o el histórico Transferencia Credicoop', 'Conciliación Bancaria');
      hayChart = !!rowsCred.length;
    } else if (state.canal === CANAL_GF) {
      kpisHtml = renderKpis(kpisCanal(rowsGf), 'Cortes');
      tabla = renderTablaGf(rowsGf);
      hayChart = !!rowsGf.length;
    } else if (state.canal === CANAL_MOR) {
      kpisHtml = renderKpis(kpisCanal(rowsMor), 'Cortes');
      tabla = renderTablaCajaFisica(CANAL_MOR, LABEL_MOR, 'tesoreria_transferencia_morba_… o cierre_MOR-…');
      hayChart = !!rowsMor.length;
    } else if (state.canal === CANAL_USD) {
      kpisHtml = renderKpis(kpisCanal(rowsUsd), 'Cortes');
      tabla = renderTablaCajaFisica(CANAL_USD, LABEL_USD, 'tesoreria_efectivo_dolar_… o cierre_DOL-…');
      hayChart = !!rowsUsd.length;
    } else if (state.canal === CANAL_SF) {
      kpisHtml = renderKpis(kpisCanal(filasCanal(CANAL_SF)), 'Cortes');
      tabla = renderTablaCajaFisica(CANAL_SF, LABEL_SF, 'histórico Efectivo Pesos (sin factura)');
      hayChart = !!filasCanal(CANAL_SF).length;
    } else if (state.canal === CANAL_SF_USD) {
      kpisHtml = renderKpis(kpisCanal(filasCanal(CANAL_SF_USD)), 'Cortes');
      tabla = renderTablaCajaFisica(CANAL_SF_USD, LABEL_SF_USD, 'histórico Efectivo Dolar (sin factura)');
      hayChart = !!filasCanal(CANAL_SF_USD).length;
    } else {
      kpisHtml = renderKpis(kpisConsolidado(meses), 'Meses');
      tabla = renderTablaConsolidado(meses);
      hayChart = !!meses.length;
    }

    var btnUp = '';
    if (canCargar && state.canal === CANAL_MP) {
      btnUp = '<button type="button" class="se-btn se-btn-mp" data-se="up-mp"><span class="btn-icon">' + ICO.upload + '</span>Cargar cartas Mercado Pago</button>';
    } else if (canCargar && state.canal === CANAL_GAL) {
      btnUp = '<button type="button" class="se-btn se-btn-gal" data-se="up-gal"><span class="btn-icon">' + ICO.upload + '</span>Cargar resúmenes Galicia</button>';
    } else if (canCargar && state.canal === CANAL_GAL_USD) {
      btnUp = '<button type="button" class="se-btn se-btn-gal" data-se="up-gal-usd"><span class="btn-icon">' + ICO.upload + '</span>Cargar resúmenes Galicia (USD)</button>';
    }

    el.innerHTML =
      FornitaliaHelp.header(ICO.chart, 'Saldos extractos', 'tpl-se-help', 'Ayuda: Saldos extractos',
        '<p>Serie de <strong>saldos de cierre</strong> (no el detalle de movimientos).</p>' +
        '<p>' + hintCanal() + '</p>') +
      (state.loading ? '<p class="loading">Procesando resúmenes…</p>' : '') +
      (state.err ? '<p class="se-msg-err">' + esc(state.err) + '</p>' : '') +
      (state.msg ? '<p class="se-msg-ok">' + esc(state.msg) + '</p>' : '') +
      '<div class="se-tabs">' +
        '<button type="button" class="se-tab-mp' + (state.canal === CANAL_MP ? ' activo' : '') + '" data-se="canal" data-canal="' + CANAL_MP + '">Mercado Pago</button>' +
        '<button type="button" class="se-tab-gal' + (state.canal === CANAL_GAL ? ' activo' : '') + '" data-se="canal" data-canal="' + CANAL_GAL + '">' + esc(LABEL_GAL) + '</button>' +
        '<button type="button" class="se-tab-gal' + (state.canal === CANAL_GAL_USD ? ' activo' : '') + '" data-se="canal" data-canal="' + CANAL_GAL_USD + '">' + esc(LABEL_GAL_USD) + '</button>' +
        '<button type="button" class="se-tab-cred' + (state.canal === CANAL_CRED ? ' activo' : '') + '" data-se="canal" data-canal="' + CANAL_CRED + '">' + esc(LABEL_CRED) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_GF ? 'activo' : '') + '" data-se="canal" data-canal="' + CANAL_GF + '">' + esc(LABEL_GF) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_MOR ? 'activo' : '') + '" data-se="canal" data-canal="' + CANAL_MOR + '">' + esc(LABEL_MOR) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_USD ? 'activo' : '') + '" data-se="canal" data-canal="' + CANAL_USD + '">' + esc(LABEL_USD) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_SF ? 'activo' : '') + '" data-se="canal" data-canal="' + CANAL_SF + '">' + esc(LABEL_SF) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_SF_USD ? 'activo' : '') + '" data-se="canal" data-canal="' + CANAL_SF_USD + '">' + esc(LABEL_SF_USD) + '</button>' +
        '<button type="button" class="' + (state.canal === CANAL_CONS ? 'activo' : '') + '" data-se="canal" data-canal="' + CANAL_CONS + '">Consolidado</button>' +
      '</div>' +
      '<div class="se-toolbar">' +
        '<div class="se-acciones">' +
          btnUp +
          (canXls ? '<button type="button" class="se-btn se-btn-excel" data-se="xlsx"><span class="btn-icon">' + ICO.download + '</span>Excel</button>' : '') +
        '</div>' +
        renderFiltros() +
      '</div>' +
      kpisHtml +
      (hayChart ? '<div class="se-chart-wrap"><canvas id="se-chart" aria-label="Gráfico de saldos"></canvas></div>' : '') +
      tabla;

    if (state.canal === CANAL_MP && hayChart) pintarChartCanal(rowsMp, 'Serie de saldos Mercado Pago (carta de saldo)', 'Saldo total (ARS)');
    else if (state.canal === CANAL_GAL && hayChart) pintarChartCanal(rowsGal, 'Serie de saldos ' + LABEL_GAL, 'Saldo de cierre (ARS)');
    else if (state.canal === CANAL_GAL_USD && hayChart) pintarChartCanal(rowsGalUsd, 'Serie de saldos ' + LABEL_GAL_USD + ' (ARS al MEP)', 'Saldo de caja (ARS)');
    else if (state.canal === CANAL_CRED && hayChart) pintarChartCanal(rowsCred, 'Serie de saldos ' + LABEL_CRED + ' (desde tesorería)', 'Saldo de caja (ARS)');
    else if (state.canal === CANAL_GF && hayChart) pintarChartCanal(rowsGf, 'Serie de saldos ' + LABEL_GF + ' (caja física)', 'Saldo de caja (ARS)');
    else if (state.canal === CANAL_MOR && hayChart) pintarChartCanal(rowsMor, 'Serie de saldos ' + LABEL_MOR + ' (caja física)', 'Saldo de caja (ARS)');
    else if (state.canal === CANAL_USD && hayChart) pintarChartCanal(rowsUsd, 'Serie de saldos ' + LABEL_USD + ' (caja física, ARS al MEP)', 'Saldo de caja (ARS)');
    else if (state.canal === CANAL_SF && hayChart) pintarChartCanal(filasCanal(CANAL_SF), 'Serie de saldos ' + LABEL_SF + ' (caja física)', 'Saldo de caja (ARS)');
    else if (state.canal === CANAL_SF_USD && hayChart) pintarChartCanal(filasCanal(CANAL_SF_USD), 'Serie de saldos ' + LABEL_SF_USD + ' (caja física, ARS al MEP)', 'Saldo de caja (ARS)');
    else if (state.canal === CANAL_CONS && hayChart) pintarChartConsolidado(meses);

    var dEl = el.querySelector('#se-mes-desde');
    if (dEl) {
      dEl.addEventListener('change', function () {
        state.mesDesde = dEl.value || '';
        renderShell();
      });
    }
    var hEl = el.querySelector('#se-mes-hasta');
    if (hEl) {
      hEl.addEventListener('change', function () {
        state.mesHasta = hEl.value || '';
        renderShell();
      });
    }
  }

  function onClick(ev) {
    var t = ev.target.closest && ev.target.closest('[data-se]');
    if (!t) return;
    var el = root();
    if (el && !el.contains(t)) return;
    var a = t.getAttribute('data-se');
    if (a === 'up-mp') { onUpload(CANAL_MP); return; }
    if (a === 'up-gal') { onUpload(CANAL_GAL); return; }
    if (a === 'up-gal-usd') { onUploadGaliciaUsd(); return; }
    if (a === 'xlsx') { exportarExcel(); return; }
    if (a === 'canal') {
      state.canal = t.getAttribute('data-canal') || CANAL_MP;
      state.msg = '';
      state.err = '';
      renderShell();
    }
  }

  function ensureMounted() {
    var el = root();
    if (!el || state.mounted) return;
    el.classList.add('vista-se');
    el.addEventListener('click', onClick);
    state.mounted = true;
  }

  function init(options) {
    opts = options || opts;
  }

  function show() {
    ensureMounted();
    recargar();
  }

  global.FornitaliaSaldosExtractos = {
    init: init,
    show: show,
    recargar: recargar,
    guardarCorteGaliciaUsd: guardarCorteGaliciaUsd,
    guardarCorteCredicoop: guardarCorteCredicoop,
    guardarCorteDesdePdfGalicia: guardarCorteDesdePdfGalicia
  };
})(typeof window !== 'undefined' ? window : this);
