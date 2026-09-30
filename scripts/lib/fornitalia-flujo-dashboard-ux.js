/**
 * Vista Flujo de caja (estilo Dashboard Everfit): filtro Período, gráfico G/P Mensual y PDF.
 * Los montos y ratios los arma dashboard-flujo-caja.html; acá solo período, gráfico y reporte.
 */
(function (global) {
  var ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';
  var PERIODO_DEFAULT = 'ultimo_anio';
  var chartGP = null;
  var gpResumenReporte = null;
  var flujoParaReporte = null;
  var reportePdfCleanupBound = false;

  function fechaPartesAhoraArgentina() {
    var d = new Date();
    var s = d.toLocaleDateString('en-CA', { timeZone: ZONA_ARGENTINA });
    if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split('-').map(Number);
      return { anio: p[0], mes: p[1], dia: p[2] };
    }
    return { anio: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate() };
  }

  function fechaHoyYYYYMMDDArgentina() {
    var fa = fechaPartesAhoraArgentina();
    return fa.anio + '-' + String(fa.mes).padStart(2, '0') + '-' + String(fa.dia).padStart(2, '0');
  }

  function keyMesEnCurso() {
    var fa = fechaPartesAhoraArgentina();
    return fa.anio + '-' + String(fa.mes).padStart(2, '0');
  }

  function siguienteMesKey(key) {
    var parts = String(key || '').split('-').map(Number);
    var anio = parts[0];
    var mes = parts[1];
    if (mes >= 12) return (anio + 1) + '-01';
    return anio + '-' + String(mes + 1).padStart(2, '0');
  }

  function mesAnteriorKey(key) {
    var p = String(key || '').split('-').map(Number);
    var m = p[1] - 1;
    var y = p[0];
    if (m < 1) { m = 12; y--; }
    return y + '-' + String(m).padStart(2, '0');
  }

  function formatoPeriodoFromKey(key) {
    if (!key || String(key).length < 7) return key;
    var parts = String(key).split('-');
    if (parts.length >= 2) return parts[1] + '-' + parts[0];
    return key;
  }

  function getPeriodoValor() {
    var sel = document.getElementById('filtro-periodo');
    return (sel && sel.value) || PERIODO_DEFAULT;
  }

  function getUltimos12Meses() {
    var fa = fechaPartesAhoraArgentina();
    var anio = fa.anio;
    var mes = fa.mes;
    var keys = [];
    for (var i = 0; i < 13; i++) {
      var m = mes - i;
      var y = anio;
      while (m < 1) { m += 12; y--; }
      keys.push(y + '-' + String(m).padStart(2, '0'));
    }
    return keys.reverse();
  }

  function getRangoPeriodo() {
    var v = getPeriodoValor();
    if (v === 'todo') return { valor: v, desde: null, hasta: null };
    if (v.indexOf('anio:') === 0) {
      var y = v.slice(5);
      return { valor: v, desde: y + '-01', hasta: y + '-12' };
    }
    var m = getUltimos12Meses();
    return { valor: PERIODO_DEFAULT, desde: m[0], hasta: m[m.length - 1] };
  }

  function keyEnRangoPeriodo(key, rango) {
    return (!rango.desde || key >= rango.desde) && (!rango.hasta || key <= rango.hasta);
  }

  function labelPeriodoActual() {
    var r = getRangoPeriodo();
    if (r.valor === 'todo') return 'Todo el histórico';
    if (r.valor.indexOf('anio:') === 0) return 'Año ' + r.valor.slice(5);
    return 'Último año (' + formatoPeriodoFromKey(r.desde) + ' a ' + formatoPeriodoFromKey(r.hasta) + ')';
  }

  function getMesesPeriodo(keysConDatos) {
    var rango = getRangoPeriodo();
    if (rango.valor === PERIODO_DEFAULT) return getUltimos12Meses();
    var ks = (keysConDatos || []).slice().sort();
    var cur = keyMesEnCurso();
    var desde = rango.desde || ks[0];
    if (!desde) return [];
    var tope = ks.length && ks[ks.length - 1] > cur ? ks[ks.length - 1] : cur;
    var hasta = rango.hasta && rango.hasta < tope ? rango.hasta : tope;
    var out = [];
    var k = desde;
    while (k <= hasta && out.length < 600) {
      out.push(k);
      k = siguienteMesKey(k);
    }
    return out;
  }

  function poblarFiltroPeriodo(anios) {
    var sel = document.getElementById('filtro-periodo');
    if (!sel) return;
    var actual = sel.value || PERIODO_DEFAULT;
    var lista = (anios || []).slice().sort().reverse();
    var m = getUltimos12Meses();
    var html = '<option value="ultimo_anio">Último año (' + formatoPeriodoFromKey(m[0]) + ' a ' + formatoPeriodoFromKey(m[m.length - 1]) + ')</option>' +
      lista.map(function (y) { return '<option value="anio:' + y + '">Año ' + y + '</option>'; }).join('') +
      '<option value="todo">Todo el histórico</option>';
    sel.innerHTML = html;
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === actual; }) ? actual : PERIODO_DEFAULT;
    syncFiltroPeriodoActivo();
  }

  function syncFiltroPeriodoActivo() {
    var sel = document.getElementById('filtro-periodo');
    if (sel) sel.classList.toggle('filtro-activo', sel.value !== 'todo');
  }

  function abreviarMonto(v, moneda) {
    var a = Math.abs(v);
    var s;
    if (a >= 1e9) s = (a / 1e9).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' MM';
    else if (a >= 1e6) s = (a / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
    else if (a >= 1e3) s = (a / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' k';
    else s = a.toLocaleString('es-AR', { maximumFractionDigits: moneda === 'USD' ? 2 : 0 });
    return (v < 0 ? '−' : '+') + s;
  }

  function formatearPct(p) {
    if (p == null || !isFinite(p)) return '–';
    return (p > 0 ? '+' : (p < 0 ? '−' : '')) + Math.abs(p).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function variacionMensual(actual, anterior) {
    if (anterior == null) return { monto: null, pct: null };
    var monto = actual - anterior;
    var pct = anterior !== 0 ? (monto / Math.abs(anterior)) * 100 : null;
    return { monto: monto, pct: pct };
  }

  function tendenciaLineal(valores) {
    var n = valores.length;
    if (n < 2) return { puntos: valores.slice(), pendiente: 0 };
    var sx = 0, sy = 0, sxy = 0, sxx = 0;
    valores.forEach(function (y, x) { sx += x; sy += y; sxy += x * y; sxx += x * x; });
    var den = n * sxx - sx * sx;
    var pendiente = den !== 0 ? (n * sxy - sx * sy) / den : 0;
    var ordenada = (sy - pendiente * sx) / n;
    return { puntos: valores.map(function (_, x) { return ordenada + pendiente * x; }), pendiente: pendiente };
  }

  var pluginEtiquetasVarGP = {
    id: 'etiquetasVarGP',
    afterDatasetsDraw: function (chart, args, opts) {
      var vars = opts && opts.variaciones;
      if (!vars || chart.width < 560) return;
      var meta = chart.getDatasetMeta(0);
      if (!meta || meta.hidden || !meta.data.length) return;
      if (chart.chartArea && chart.chartArea.width / meta.data.length < 46) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      function texto(t, x, y, peso) {
        ctx.font = peso + ' 10px system-ui, -apple-system, sans-serif';
        ctx.strokeText(t, x, y);
        ctx.fillText(t, x, y);
      }
      meta.data.forEach(function (bar, i) {
        var v = vars[i];
        if (!v || v.monto == null) return;
        var valor = chart.data.datasets[0].data[i];
        var arriba = valor >= 0;
        var y = arriba ? bar.y - 6 : bar.y + 6;
        ctx.fillStyle = v.monto > 0 ? '#0d7d3d' : (v.monto < 0 ? '#b91c1c' : '#64748b');
        ctx.textBaseline = arriba ? 'bottom' : 'top';
        texto(abreviarMonto(v.monto, opts.moneda), bar.x, y, '600');
        texto(formatearPct(v.pct), bar.x, arriba ? y - 12 : y + 12, '500');
      });
      ctx.restore();
    }
  };

  function actualizarGraficoGP(porMes, moneda, simbolo, porMesAll) {
    var meses12 = getMesesPeriodo(Object.keys(porMesAll || porMes || {}));
    var subEl = document.getElementById('grafico-gp-periodo');
    if (subEl) subEl.textContent = 'Período: ' + labelPeriodoActual() + '. Sobre cada barra: variación vs mes anterior (% y monto).';
    var wrapVacio = document.getElementById('grafico-gp-wrap');
    if (!meses12.length || typeof Chart === 'undefined') {
      if (chartGP) { chartGP.destroy(); chartGP = null; }
      if (wrapVacio) wrapVacio.style.display = 'none';
      gpResumenReporte = null;
      return;
    }
    var labels = meses12.map(formatoPeriodoFromKey);
    var gpDeKey = function (k) {
      var d = porMes[k];
      return d ? (Number(d.ingresos) || 0) - (Number(d.egresos) || 0) : 0;
    };
    var valores = meses12.map(gpDeKey);
    var keyPrevPrimero = mesAnteriorKey(meses12[0]);
    var fuenteAnterior = porMesAll || porMes;
    var dPrev = fuenteAnterior[keyPrevPrimero];
    var anteriorPrimero = dPrev ? (Number(dPrev.ingresos) || 0) - (Number(dPrev.egresos) || 0) : null;
    var variaciones = valores.map(function (v, i) {
      return variacionMensual(v, i === 0 ? anteriorPrimero : valores[i - 1]);
    });
    var tendencia = tendenciaLineal(valores);
    var fmtFull = function (n) {
      return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: moneda === 'USD' ? 2 : 0 });
    };
    var fmtSigno = function (n) {
      return (n > 0 ? '+' : (n < 0 ? '−' : '')) + simbolo + fmtFull(Math.abs(n));
    };
    var esc = function (t) {
      return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    var resumenEl = document.getElementById('grafico-gp-resumen');
    if (resumenEl) {
      var ult = variaciones[variaciones.length - 1];
      var htmlRes = '';
      if (ult && ult.monto != null && labels.length > 1) {
        var claseUlt = ult.monto > 0 ? 'positivo' : (ult.monto < 0 ? 'negativo' : '');
        htmlRes += '<span class="gp-resumen-item"><span class="gp-resumen-label">' + esc(labels[labels.length - 1]) + ' vs ' + esc(labels[labels.length - 2]) + ':</span> <strong class="' + claseUlt + '">' + fmtSigno(ult.monto) + ' (' + formatearPct(ult.pct) + ')</strong></span>';
      }
      var claseTend = tendencia.pendiente > 0 ? 'positivo' : (tendencia.pendiente < 0 ? 'negativo' : '');
      htmlRes += '<span class="gp-resumen-item"><span class="gp-resumen-label">Tendencia:</span> <strong class="' + claseTend + '">' + fmtSigno(tendencia.pendiente) + ' por mes</strong></span>';
      resumenEl.innerHTML = htmlRes;
    }
    var ultVar = variaciones[variaciones.length - 1];
    gpResumenReporte = {
      labelUlt: labels[labels.length - 1],
      labelPrev: labels.length > 1 ? labels[labels.length - 2] : null,
      ultMonto: ultVar ? ultVar.monto : null,
      ultPct: ultVar ? ultVar.pct : null,
      pendiente: tendencia.pendiente
    };
    var colores = valores.map(function (v) {
      if (v === 0) return 'rgba(100, 116, 139, 0.6)';
      return v > 0 ? 'rgba(13, 125, 61, 0.85)' : 'rgba(185, 28, 28, 0.85)';
    });
    var bordes = valores.map(function (v) {
      if (v === 0) return 'rgba(100, 116, 139, 0.8)';
      return v > 0 ? '#0d7d3d' : '#b91c1c';
    });

    var wrap = document.getElementById('grafico-gp-wrap');
    var canvas = document.getElementById('chart-gp-mensual');
    if (!canvas || !wrap) return;
    wrap.style.display = 'block';

    if (chartGP) chartGP.destroy();
    chartGP = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'G/P',
          data: valores,
          backgroundColor: colores,
          borderColor: bordes,
          borderWidth: 1,
          minBarLength: 6,
          order: 1
        }, {
          type: 'line',
          label: 'Tendencia',
          data: tendencia.puntos,
          borderColor: '#1e40af',
          backgroundColor: '#1e40af',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 3,
          fill: false,
          tension: 0,
          order: 0
        }]
      },
      plugins: [pluginEtiquetasVarGP],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8 } },
        plugins: {
          etiquetasVarGP: { variaciones: variaciones, moneda: moneda },
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 14,
              boxHeight: 10,
              font: { size: 11 },
              generateLabels: function (chart) {
                return [
                  { text: 'G/P', fillStyle: 'rgba(13, 125, 61, 0.85)', strokeStyle: '#0d7d3d', lineWidth: 1, datasetIndex: 0, hidden: !chart.isDatasetVisible(0) },
                  { text: 'Tendencia', fillStyle: 'rgba(0,0,0,0)', strokeStyle: '#1e40af', lineWidth: 2, lineDash: [6, 4], datasetIndex: 1, hidden: !chart.isDatasetVisible(1) }
                ];
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var v = ctx.raw;
                if (ctx.datasetIndex === 1) return 'Tendencia: ' + simbolo + fmtFull(v);
                var lineas = [];
                if (v === 0) lineas.push('G/P: ' + simbolo + '0 (ingresos = egresos)');
                else lineas.push((v > 0 ? 'G/P: ' : 'Pérdida: ') + simbolo + fmtFull(v));
                var va = variaciones[ctx.dataIndex];
                if (va && va.monto != null) lineas.push('Var. vs mes anterior: ' + fmtSigno(va.monto) + ' (' + formatearPct(va.pct) + ')');
                else lineas.push('Var. vs mes anterior: sin dato');
                return lineas;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grace: '18%',
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { font: { size: 11 } }
          },
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, minRotation: 0, font: { size: 11 } }
          }
        }
      }
    });
  }

  function filtrosReporteDashboard(getMoneda, getTipoDolar) {
    var chips = [];
    var rango = getRangoPeriodo();
    chips.push({ lab: 'Período', val: labelPeriodoActual(), activo: rango.valor !== 'todo', tag: rango.valor === PERIODO_DEFAULT ? 'Filtro por defecto' : null });
    var moneda = getMoneda();
    if (moneda === 'USD') {
      var tipo = getTipoDolar();
      chips.push({ lab: 'Moneda', val: 'USD', activo: true });
      chips.push({ lab: 'Conversión a dólar', val: tipo === 'ccl' ? 'CCL' : (tipo === 'oficial' ? 'Oficial' : 'MEP'), activo: true });
    } else {
      chips.push({ lab: 'Moneda', val: 'ARS (pesos)', activo: false });
    }
    return chips;
  }

  function fmtMilesReporte(v, moneda) {
    var n = (Number(v) || 0) / 1000;
    return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: moneda === 'USD' ? 1 : 0 });
  }

  function unidadMilesReporte(moneda) {
    return moneda === 'USD' ? 'miles de US$' : 'miles de $';
  }

  function pctRatio(num, den) {
    if (!(den > 0)) return null;
    return (Number(num) || 0) / den * 100;
  }

  function tablasFlujoParaReporte(maxCols) {
    var d = flujoParaReporte;
    if (!d) return { html: '', notas: [] };
    var meses = getMesesPeriodo(Object.keys(d.porMesAll || {}));
    if (!meses.length) return { html: '', notas: [] };
    var mon = d.moneda;
    var fmt = function (v) { return fmtMilesReporte(v, mon); };
    var fmtPct = function (x) {
      return x != null ? Number(x).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : '–';
    };
    var dato = function (k) { return d.porMesAll[k] || {}; };
    var ing = function (k) { return Number(dato(k).ingresos) || 0; };
    var egr = function (k) { return Number(dato(k).egresos) || 0; };

    var headCols = meses.map(function (k) { return '<th>' + formatoPeriodoFromKey(k) + '</th>'; }).concat(['<th>Total</th>']);
    var totIng = meses.reduce(function (s, k) { return s + ing(k); }, 0);
    var totEgr = meses.reduce(function (s, k) { return s + egr(k); }, 0);
    var totGp = totIng - totEgr;
    var claseGp = function (v) { return 'balance ' + (v >= 0 ? 'positivo' : 'negativo'); };

    function filaMontos(getMes, clase, total) {
      return meses.map(function (k) { return '<td class="' + clase + '">' + fmt(getMes(k)) + '</td>'; })
        .concat(['<td class="' + clase + '">' + fmt(total) + '</td>']);
    }
    var filaGp = meses.map(function (k) {
      var v = ing(k) - egr(k);
      return '<td class="' + claseGp(v) + '">' + fmt(v) + '</td>';
    }).concat(['<td class="' + claseGp(totGp) + '">' + fmt(totGp) + '</td>']);

    var svgSubio = '<span class="ratio-var-icon ratio-var-subio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg></span>';
    var svgBajo = '<span class="ratio-var-icon ratio-var-bajo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg></span>';
    var svgIgual = '<span class="ratio-var-icon ratio-var-igual"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg></span>';
    function iconoVar(actual, anterior) {
      if (actual == null || anterior == null) return '';
      var dif = actual - anterior;
      return dif > 0.05 ? svgSubio : (dif < -0.05 ? svgBajo : svgIgual);
    }
    function filaRatio(getNum, getDen) {
      var denFn = getDen || ing;
      var pctMes = function (k) { return pctRatio(getNum(k), denFn(k)); };
      var serie = meses.map(pctMes);
      var anteriorPrimero = pctMes(mesAnteriorKey(meses[0]));
      var vals = serie.map(function (p, i) {
        return '<td class="valor-ratio"><span class="ratio-con-variacion">' + fmtPct(p) + iconoVar(p, i === 0 ? anteriorPrimero : serie[i - 1]) + '</span></td>';
      });
      var num = meses.reduce(function (s, k) { return s + (Number(getNum(k)) || 0); }, 0);
      var denTot = meses.reduce(function (s, k) { return s + (Number(denFn(k)) || 0); }, 0);
      vals.push('<td class="valor-ratio">' + fmtPct(pctRatio(num, denTot)) + '</td>');
      return vals;
    }

    var ventas = function (k) { return Number(dato(k).ventas) || 0; };
    var ventasMp = function (k) { return Number(dato(k).ventasMp) || 0; };
    var filas = [
      { tipo: 'datos', item: 'Ingresos', vals: filaMontos(ing, 'ingresos', totIng) },
      { tipo: 'datos', item: 'Egresos', vals: filaMontos(egr, 'egresos', totEgr) },
      { tipo: 'datos', item: 'G/P', vals: filaGp },
      { tipo: 'titulo', item: 'Ratios del Negocio' },
      { tipo: 'datos', item: 'Comisiones / Ventas', vals: filaRatio(function (k) { return Number(dato(k).comisionesParaRatio) || 0; }, ventas) },
      { tipo: 'datos', item: 'Sueldos / Ingresos', vals: filaRatio(function (k) { return Number(dato(k).sueldos) || 0; }) },
      { tipo: 'datos', item: 'Costo Financiero MP / Ventas MP', vals: filaRatio(function (k) { return Number(dato(k).costoFinancieroMp) || 0; }, ventasMp) },
      { tipo: 'datos', item: 'Costo dir. / Ingresos', vals: filaRatio(function (k) { return Number(dato(k).egresosCostoDirecto) || 0; }) },
      { tipo: 'datos', item: 'Costo ind. / Ingresos', vals: filaRatio(function (k) { return Number(dato(k).egresosCostoIndirecto) || 0; }) },
      { tipo: 'datos', item: 'Costo total / Ingreso total', vals: filaRatio(egr) }
    ];
    var headItem = 'Item <span class="rep-unidad">(' + unidadMilesReporte(mon) + ')</span>';
    var notas = ['Importes expresados en ' + unidadMilesReporte(mon) + ' (redondeados). Período ' + labelPeriodoActual() + '; la columna Total suma esos meses. No incluye meses proyectados.'];
    var n = headCols.length;
    var bloques = Math.max(1, Math.ceil(n / maxCols));
    var porBloque = Math.ceil(n / bloques);
    var html = '';
    for (var b = 0; b < bloques; b++) {
      var desde = b * porBloque, hasta = Math.min(n, desde + porBloque);
      html += '<table class="rep-tabla"><thead><tr><th>' + headItem + '</th>' + headCols.slice(desde, hasta).join('') + '</tr></thead><tbody>';
      filas.forEach(function (f) {
        if (f.tipo === 'titulo') {
          html += '<tr class="rep-fila-titulo"><td>' + f.item + '</td><td colspan="' + (hasta - desde) + '"></td></tr>';
          return;
        }
        html += '<tr' + (f.tipo === 'total' ? ' class="rep-fila-total"' : '') + '><td>' + f.item + '</td>' + f.vals.slice(desde, hasta).join('') + '</tr>';
      });
      html += '</tbody></table>';
    }
    return { html: html, notas: notas };
  }

  function limpiarReportePdf() {
    document.body.classList.remove('rep-printing');
    var mount = document.getElementById('rep-print-root');
    if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
    var prev = document.body.getAttribute('data-rep-title-prev');
    if (prev != null) {
      document.title = prev;
      document.body.removeAttribute('data-rep-title-prev');
    }
  }

  function asegurarLimpiezaReportePdf() {
    if (reportePdfCleanupBound) return;
    reportePdfCleanupBound = true;
    window.addEventListener('afterprint', limpiarReportePdf);
    if (window.matchMedia) {
      try {
        window.matchMedia('print').addEventListener('change', function (e) { if (!e.matches) limpiarReportePdf(); });
      } catch (err) { /* sin addEventListener en MediaQueryList */ }
    }
  }

  /** Captura el G/P con proporción ancha (A4 apaisado) para que no quede miniatura. */
  function capturarGraficoGPParaPdf() {
    var canvas = document.getElementById('chart-gp-mensual');
    var container = canvas && canvas.parentElement;
    if (!canvas || !chartGP || canvas.width < 8) return '';
    var prevH = container ? container.style.height : '';
    var prevW = container ? container.style.width : '';
    try {
      if (container) {
        container.style.width = '1400px';
        container.style.height = '355px';
      }
      chartGP.resize();
      return canvas.toDataURL('image/png');
    } catch (e) {
      try { return canvas.toDataURL('image/png'); } catch (e2) { return ''; }
    } finally {
      if (container) {
        container.style.height = prevH;
        container.style.width = prevW;
      }
      try { chartGP.resize(); } catch (e3) { /* ignore */ }
    }
  }

  function mmPageSizePx() {
    var probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-99999px;top:0;width:297mm;height:210mm;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    var size = { w: probe.offsetWidth, h: probe.offsetHeight };
    document.body.removeChild(probe);
    return size;
  }

  /**
   * Una sola hoja A4 apaisada. El gráfico mantiene su alto; solo se escala
   * el bloque entero si la tabla no entra (sin achicar el gráfico por separado).
   * zoom (Chrome/Safari) sí reduce el box de impresión; transform no, y deja
   * un resto que Chrome pinta en página 2 (thead / última fila repetida).
   */
  function ajustarReporteUnaPagina(mount) {
    if (!mount) return;
    var inner = mount.querySelector('.rep-fit-inner') || mount;
    inner.style.transform = '';
    inner.style.zoom = '';
    inner.style.width = '';
    mount.style.height = '';
    var page = mmPageSizePx();
    var availW = page.w * (281 / 297);
    var availH = page.h * (194 / 210);
    var w = Math.max(inner.scrollWidth, inner.offsetWidth, 1);
    var h = Math.max(inner.scrollHeight, inner.offsetHeight, 1);
    var scale = Math.min(1, availW / w, availH / h);
    mount.style.maxHeight = Math.floor(availH) + 'px';
    mount.style.overflow = 'hidden';
    if (scale < 0.999) {
      var useZoom = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '0.5');
      if (useZoom) {
        inner.style.zoom = String(scale);
      } else {
        inner.style.transformOrigin = 'top left';
        inner.style.transform = 'scale(' + scale + ')';
        mount.style.height = Math.ceil(h * scale) + 'px';
      }
    }
  }

  function generarReportePdfDashboard(opts) {
    opts = opts || {};
    var panelFlujo = document.getElementById('panel-flujo');
    if (!panelFlujo || !panelFlujo.classList.contains('activo')) {
      FornitaliaMensajes.avisar('Abrí la solapa Flujo por mes para armar el reporte.');
      return;
    }
    if (!flujoParaReporte) {
      FornitaliaMensajes.avisar('Todavía no hay datos cargados para armar el reporte.');
      return;
    }
    asegurarLimpiezaReportePdf();
    limpiarReportePdf();

    var esc = typeof opts.escapeHtml === 'function' ? opts.escapeHtml : function (v) {
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var getMoneda = opts.getMoneda || function () { return 'ARS'; };
    var getTipoDolar = opts.getTipoDolar || function () { return 'mep'; };
    var ahora = new Date();
    var fechaHora = ahora.toLocaleString('es-AR', { timeZone: ZONA_ARGENTINA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    var hoy = fechaHoyYYYYMMDDArgentina().split('-');
    var chips = filtrosReporteDashboard(getMoneda, getTipoDolar);
    var hayFiltros = chips.some(function (c) { return c.activo; });

    var mount = document.createElement('div');
    mount.id = 'rep-print-root';
    mount.setAttribute('aria-hidden', 'true');
    var html = '';
    html += '<div class="rep-head">' +
      '<div class="rep-brand"><img src="' + esc(opts.logoSrc || 'favicon.svg') + '" alt="Fornitalia" onerror="this.style.display=\'none\'" />' +
        '<div><p class="rep-kicker">Fornitalia · Flujo de caja</p><h1>Reporte de flujo</h1></div></div>' +
      '<div class="rep-meta"><p><strong>Generado:</strong> ' + esc(fechaHora) + ' (Argentina)</p>' +
        '<p><strong>Usuario:</strong> ' + esc(opts.usuarioLabel || '—') + '</p></div>' +
      '</div>';
    html += '<div class="rep-filtros"><p class="rep-filtros-titulo">Filtros aplicados<span class="rep-filtros-estado">' +
      (hayFiltros ? '— Base filtrada: los importes reflejan solo lo resaltado' : '— Sin filtros: vista completa') + '</span></p><div class="rep-chips">' +
      chips.map(function (c) {
        return '<span class="rep-chip' + (c.activo ? ' activo' : '') + '"><span class="rep-chip-lab">' + esc(c.lab) + '</span><span class="rep-chip-val">' + esc(c.val) + '</span>' +
          (c.activo ? '<span class="rep-chip-tag">' + esc(c.tag || 'Filtro activo') + '</span>' : '') + '</span>';
      }).join('') + '</div></div>';

    var mon = getMoneda();
    var unidad = unidadMilesReporte(mon);
    html += '<p class="rep-unidad-aviso">Importes expresados en <strong>' + unidad + '</strong> · Período ' + esc(labelPeriodoActual()) + ' · sin meses proyectados</p>';

    var fr = flujoParaReporte;
    var gpTot = fr.totalIngresos - fr.totalEgresos;
    html += '<div class="rep-cards">' +
      '<div class="card"><div class="card-titulo">Total ingresos</div><div class="valor ingresos">' + fmtMilesReporte(fr.totalIngresos, mon) + '</div></div>' +
      '<div class="card"><div class="card-titulo">Total egresos</div><div class="valor egresos">' + fmtMilesReporte(fr.totalEgresos, mon) + '</div></div>' +
      '<div class="card"><div class="card-titulo">G/P Total</div><div class="valor ' + (gpTot >= 0 ? 'positivo' : 'negativo') + '">' + fmtMilesReporte(gpTot, mon) + '</div></div>' +
      '</div>';

    var chartSrc = capturarGraficoGPParaPdf();
    if (chartSrc) {
      var gpResHtml = '';
      var g = gpResumenReporte;
      if (g) {
        var signo = function (v) { return (v > 0 ? '+' : '') + fmtMilesReporte(v, mon); };
        if (g.ultMonto != null && g.labelPrev) {
          gpResHtml += '<span class="gp-resumen-item"><span class="gp-resumen-label">' + esc(g.labelUlt) + ' vs ' + esc(g.labelPrev) + ':</span> <strong class="' + (g.ultMonto >= 0 ? 'positivo' : 'negativo') + '">' + signo(g.ultMonto) + ' (' + formatearPct(g.ultPct) + ')</strong></span>';
        }
        gpResHtml += '<span class="gp-resumen-item"><span class="gp-resumen-label">Tendencia:</span> <strong class="' + (g.pendiente >= 0 ? 'positivo' : 'negativo') + '">' + signo(g.pendiente) + ' por mes</strong></span>';
      }
      html += '<div class="rep-seccion"><h2>G/P Mensual</h2>' +
        (gpResHtml ? '<div class="gp-resumen">' + gpResHtml + '</div>' : '') +
        '<img class="rep-chart" alt="Gráfico G/P mensual" src="' + chartSrc + '" /></div>';
    }

    var tablas = tablasFlujoParaReporte(99);
    if (tablas.html) html += '<div class="rep-seccion-tabla"><h2>Flujo por mes y ratios</h2>' + tablas.html + '</div>';
    if (tablas.notas.length) html += '<ul class="rep-notas">' + tablas.notas.slice(0, 1).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';

    mount.innerHTML = '<div class="rep-fit-inner">' + html + '</div>';
    var host = document.getElementById('main-content') || document.body;
    host.appendChild(mount);
    document.body.setAttribute('data-rep-title-prev', document.title);
    document.title = 'Fornitalia — Flujo de caja — ' + getMoneda() + ' — ' + hoy[2] + '-' + hoy[1] + '-' + hoy[0];
    document.body.classList.add('rep-printing');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ajustarReporteUnaPagina(mount);
        window.print();
      });
    });
  }

  function setFlujoParaReporte(obj) {
    flujoParaReporte = obj || null;
  }

  global.FornitaliaFlujoUx = {
    PERIODO_DEFAULT: PERIODO_DEFAULT,
    ZONA_ARGENTINA: ZONA_ARGENTINA,
    fechaPartesAhoraArgentina: fechaPartesAhoraArgentina,
    fechaHoyYYYYMMDDArgentina: fechaHoyYYYYMMDDArgentina,
    keyMesEnCurso: keyMesEnCurso,
    siguienteMesKey: siguienteMesKey,
    formatoPeriodoFromKey: formatoPeriodoFromKey,
    getPeriodoValor: getPeriodoValor,
    getRangoPeriodo: getRangoPeriodo,
    keyEnRangoPeriodo: keyEnRangoPeriodo,
    labelPeriodoActual: labelPeriodoActual,
    getUltimos12Meses: getUltimos12Meses,
    getMesesPeriodo: getMesesPeriodo,
    poblarFiltroPeriodo: poblarFiltroPeriodo,
    syncFiltroPeriodoActivo: syncFiltroPeriodoActivo,
    actualizarGraficoGP: actualizarGraficoGP,
    setFlujoParaReporte: setFlujoParaReporte,
    generarReportePdfDashboard: generarReportePdfDashboard
  };
})(typeof window !== 'undefined' ? window : this);
