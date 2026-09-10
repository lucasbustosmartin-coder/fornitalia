/**
 * Saldos de extractos bancarios – Fornitalia
 * Arranca con resúmenes PDF de Galicia (saldo inicial / de cierre).
 * window.FornitaliaSaldosExtractos.init({ client, hasPerm, getRoot })
 */
(function (global) {
  'use strict';

  var ZONA_AR = 'America/Argentina/Buenos_Aires';
  var CANAL_GAL = 'galicia';
  var PERM_VER = 'ver_saldos_extractos';
  var PERM_CARGAR = 'cargar_saldos_extractos';
  var PERM_EXPORTAR = 'exportar_saldos_extractos';
  var PDFJS_VER = '3.11.174';
  var PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.worker.min.js';

  var ICO = {
    chart: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><polyline points="7 14 12 9 16 13 21 6"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
  };

  var opts = { client: null, hasPerm: function () { return true; }, getRoot: function () { return null; } };
  var state = {
    mounted: false,
    loading: false,
    rows: [],
    mesDesde: '',
    mesHasta: '',
    msg: '',
    err: '',
    chart: null
  };
  var pdfjsReady = null;

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

  function dmyToIso(s) {
    var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
  }

  function parseMontoAR(s) {
    if (s == null || s === '') return null;
    var t = String(s).replace(/\$/g, '').trim().replace(/\s/g, '');
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

  function parseGaliciaResumenTexto(text, archivo) {
    var raw = String(text || '');
    var flat = raw.replace(/\s+/g, ' ');
    var esGal = /resumen de cuenta corriente/i.test(raw) || /extracto_cuentas_galicia/i.test(archivo || '');
    if (!esGal) {
      return { error: 'No reconocí un resumen de Galicia (Cuenta Corriente en Pesos). Archivo: ' + (archivo || '') };
    }
    var m = raw.match(/(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})\s*Per[ií]odo de movimientos\s*\$?\s*([\d.]+,\d{2})\s*\$?\s*([\d.]+,\d{2})\s*Saldos/i);
    if (!m) {
      m = flat.match(/(\d{2}\/\d{2}\/\d{4})\s*(\d{2}\/\d{2}\/\d{4})\s*Per[ií]odo de movimientos\s*\$?\s*([\d.]+,\d{2})\s*\$?\s*([\d.]+,\d{2})\s*Saldos/i);
    }
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
    var tipo = tipoM ? tipoM[1].replace(/\s+/g, ' ').trim() : 'Cuenta Corriente en Pesos';
    return {
      error: null,
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

  async function pdfTextoPagina1(file) {
    var pdfjs = await ensurePdfJs();
    var buf = await file.arrayBuffer();
    var pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    var page = await pdf.getPage(1);
    var content = await page.getTextContent();
    return content.items.map(function (it) { return it.str; }).join('\n');
  }

  async function parseArchivo(file) {
    var nombre = file && file.name ? file.name : 'archivo.pdf';
    var text = await pdfTextoPagina1(file);
    return parseGaliciaResumenTexto(text, nombre);
  }

  function filasFiltradas() {
    return (state.rows || []).filter(function (r) {
      var ym = mesYYYYMM(r.fecha_hasta);
      if (state.mesDesde && ym < state.mesDesde) return false;
      if (state.mesHasta && ym > state.mesHasta) return false;
      return true;
    }).slice().sort(function (a, b) {
      return String(b.fecha_hasta).localeCompare(String(a.fecha_hasta));
    });
  }

  function opcionesMes() {
    var set = {};
    (state.rows || []).forEach(function (r) {
      var ym = mesYYYYMM(r.fecha_hasta);
      if (ym) set[ym] = true;
    });
    return Object.keys(set).sort();
  }

  function kpis(rows) {
    if (!rows.length) return { n: 0, ultimo: null, varPer: null };
    var orden = rows.slice().sort(function (a, b) {
      return String(a.fecha_hasta).localeCompare(String(b.fecha_hasta));
    });
    var first = orden[0];
    var last = orden[orden.length - 1];
    var ini = first.saldo_inicial != null ? Number(first.saldo_inicial) : Number(first.saldo_final);
    var fin = Number(last.saldo_final);
    var varPer = (isFinite(ini) && isFinite(fin)) ? Math.round((fin - ini) * 100) / 100 : null;
    return { n: rows.length, ultimo: last.saldo_final, varPer: varPer, fechaUltimo: last.fecha_hasta };
  }

  var SUPABASE_PAGE = 1000;

  async function cargarDatos() {
    var all = [];
    var offset = 0;
    for (;;) {
      var res = await client().from('eb_saldo_extracto').select('*').eq('canal', CANAL_GAL)
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

  async function onUpload() {
    if (!can(PERM_CARGAR)) return;
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
            var parsed = await parseArchivo(files[i]);
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
        state.msg = 'Galicia: ' + ok.length + ' resumen(es) leído(s).' + extraDup;
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

  function pintarChart(rows) {
    destruirChart();
    var canvas = root() && root().querySelector('#se-chart');
    if (!canvas || typeof global.Chart === 'undefined') return;
    var orden = rows.slice().sort(function (a, b) {
      return String(a.fecha_hasta).localeCompare(String(b.fecha_hasta));
    });
    if (!orden.length) return;
    state.chart = new global.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: orden.map(function (r) { return formatFecha(r.fecha_hasta); }),
        datasets: [
          {
            label: 'Saldo de cierre (ARS)',
            data: orden.map(function (r) { return Number(r.saldo_final); }),
            borderColor: '#0f172a',
            backgroundColor: 'rgba(15, 23, 42, 0.08)',
            tension: 0.15,
            pointRadius: 4,
            fill: true
          },
          {
            label: 'Saldo inicial (ARS)',
            data: orden.map(function (r) { return r.saldo_inicial == null ? null : Number(r.saldo_inicial); }),
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
          title: { display: true, text: 'Serie de saldos Galicia (resumen de cuenta)' }
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

  function exportarExcel() {
    if (!can(PERM_EXPORTAR) && !can(PERM_VER)) return;
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    var rows = filasFiltradas();
    if (!rows.length) {
      alert('No hay saldos visibles con el período elegido.');
      return;
    }
    var headerRow = 6;
    var aoa = [
      ['Saldos extractos — Banco Galicia'],
      ['Período desde', state.mesDesde ? formatMesLabel(state.mesDesde) : 'Todos'],
      ['Período hasta', state.mesHasta ? formatMesLabel(state.mesHasta) : 'Todos'],
      ['Exportado', formatFecha((function () {
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
      })())],
      [],
      ['Fecha cierre', 'Desde', 'Hasta', 'Saldo inicial', 'Saldo final', 'Variación', 'Cuenta', 'CBU', 'Documento', 'Archivo']
    ];
    rows.forEach(function (r) {
      var ini = r.saldo_inicial == null ? null : Number(r.saldo_inicial);
      var fin = Number(r.saldo_final);
      var vari = (ini != null && isFinite(ini) && isFinite(fin)) ? Math.round((fin - ini) * 100) / 100 : null;
      aoa.push([
        excelDate(r.fecha_hasta),
        excelDate(r.fecha_desde),
        excelDate(r.fecha_hasta),
        excelNum(ini),
        excelNum(fin),
        excelNum(vari),
        r.nro_cuenta || '',
        r.cbu || '',
        r.documento_id || '',
        r.archivo || ''
      ]);
    });
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 40 }];
    if (ws['!ref']) {
      var range = global.XLSX.utils.decode_range(ws['!ref']);
      var r;
      var c;
      for (r = 0; r <= range.e.r; r++) {
        for (c = 0; c <= range.e.c; c++) {
          var addr = global.XLSX.utils.encode_cell({ r: r, c: c });
          var cell = ws[addr];
          if (!cell) continue;
          if (r === 0) cell.s = { font: { bold: true, sz: 13 } };
          if (r === headerRow) {
            cell.s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF1E293B' } } };
          }
          if (r > headerRow && (c === 0 || c === 1 || c === 2) && typeof cell.v === 'number') {
            cell.t = 'n';
            cell.z = 'dd/mm/yyyy';
          }
          if (r > headerRow && (c === 3 || c === 4 || c === 5) && typeof cell.v === 'number') {
            cell.t = 'n';
            cell.z = '#,##0.00';
          }
        }
      }
    }
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, 'Saldos Galicia');
    global.XLSX.writeFile(wb, 'Saldos_Extractos_Galicia.xlsx', { cellStyles: true, cellDates: false });
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

  function renderTabla(rows) {
    if (!rows.length) {
      return '<p class="se-empty">' + (state.rows.length
        ? 'No hay resúmenes en el período elegido.'
        : 'Todavía no hay saldos. Cargá uno o varios PDF de resumen Galicia.') + '</p>';
    }
    var html = '';
    rows.forEach(function (r) {
      var ini = r.saldo_inicial == null ? null : Number(r.saldo_inicial);
      var fin = Number(r.saldo_final);
      var vari = (ini != null && isFinite(ini) && isFinite(fin)) ? Math.round((fin - ini) * 100) / 100 : null;
      html += '<tr>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td>' + formatFecha(r.fecha_desde) + '</td>' +
        '<td>' + formatFecha(r.fecha_hasta) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(ini) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(fin) + '</td>' +
        '<td class="se-col-monto">' + htmlMonto(vari, 'var') + '</td>' +
        '<td>' + esc(r.nro_cuenta || '—') + '</td>' +
        '<td>' + esc(r.archivo || '—') + '</td>' +
      '</tr>';
    });
    return '<div class="se-tabla-wrap"><table class="se-tabla">' +
      '<thead><tr>' +
        '<th>Cierre</th><th>Desde</th><th>Hasta</th>' +
        '<th class="se-col-monto">Saldo inicial</th><th class="se-col-monto">Saldo final</th>' +
        '<th class="se-col-monto">Variación</th><th>Cuenta</th><th>Archivo</th>' +
      '</tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function renderShell() {
    var el = root();
    if (!el) return;
    if (!can(PERM_VER)) {
      el.innerHTML = '<p class="se-empty">No tenés permiso para ver Saldos extractos.</p>';
      return;
    }
    var rows = filasFiltradas();
    var k = kpis(rows);
    var canCargar = can(PERM_CARGAR);
    var canXls = can(PERM_EXPORTAR);
    el.innerHTML =
      '<div class="se-header">' +
        '<h1 class="vista-titulo"><span class="vista-titulo-icon" aria-hidden="true">' + ICO.chart + '</span>Saldos extractos</h1>' +
      '</div>' +
      '<p class="se-hint">Serie de <strong>saldos de cierre</strong> de los resúmenes de cuenta (no el detalle de movimientos). Por ahora Banco Galicia: elegí uno o varios PDF <em>Extracto_Cuentas_Galicia_…</em>; se leen de a uno y se guardan juntos, sin duplicar ni borrar lo anterior.</p>' +
      (state.loading ? '<p class="loading">Procesando resúmenes…</p>' : '') +
      (state.err ? '<p class="se-msg-err">' + esc(state.err) + '</p>' : '') +
      (state.msg ? '<p class="se-msg-ok">' + esc(state.msg) + '</p>' : '') +
      '<div class="se-toolbar">' +
        '<div class="se-acciones">' +
          (canCargar ? '<button type="button" class="se-btn se-btn-navy" data-se="up"><span class="btn-icon">' + ICO.upload + '</span>Cargar resúmenes Galicia</button>' : '') +
          (canXls ? '<button type="button" class="se-btn se-btn-excel" data-se="xlsx"><span class="btn-icon">' + ICO.download + '</span>Excel</button>' : '') +
        '</div>' +
        renderFiltros() +
      '</div>' +
      '<div class="se-resumen">' +
        '<div class="se-resumen-card"><p class="lab">Resúmenes</p><p class="val">' + k.n + '</p></div>' +
        '<div class="se-resumen-card"><p class="lab">Último saldo de cierre</p><p class="val">' + esc(formatMonto(k.ultimo)) + '</p>' +
          (k.fechaUltimo ? '<p class="sub">' + formatFecha(k.fechaUltimo) + '</p>' : '') + '</div>' +
        '<div class="se-resumen-card"><p class="lab">Variación del período</p><p class="val">' + esc(formatMonto(k.varPer)) + '</p></div>' +
      '</div>' +
      (rows.length ? '<div class="se-chart-wrap"><canvas id="se-chart" aria-label="Gráfico de saldos Galicia"></canvas></div>' : '') +
      renderTabla(rows);

    pintarChart(rows);

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
    if (a === 'up') { onUpload(); return; }
    if (a === 'xlsx') { exportarExcel(); return; }
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

  global.FornitaliaSaldosExtractos = { init: init, show: show };
})(typeof window !== 'undefined' ? window : this);
