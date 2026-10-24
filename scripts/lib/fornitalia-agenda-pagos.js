/**
 * Agenda de pagos: estimado de egresos de las próximas 4 semanas
 * a partir de los últimos 3 meses de tesorería.
 * Con ID compra: serie por proveedor, categoría y cuenta contable.
 * Ya pagado = hubo un egreso con ID compra a ese mismo proveedor en esa semana
 * (no compara el monto). Sin ID compra: solo si es frecuente, y nunca se marca
 * como pagado. Sueldos y Jornales se proyecta el día 1, cada 30 días, con los
 * pagos cargados desde septiembre de 2026.
 */
(function (root) {
  'use strict';

  var ZONA = 'America/Argentina/Buenos_Aires';
  var HISTORIA_DIAS = 92;
  var SEMANAS = 4;
  var UMBRAL_IMPUESTO_ARS = 500000;
  var DESDE_NOMINA = '2026-09-01';

  function ymdDe(f) {
    if (f == null || f === '') return '';
    var s = String(f).trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function hoyArgentina() {
    return new Date().toLocaleDateString('en-CA', { timeZone: ZONA });
  }

  function addDays(ymd, days) {
    var p = String(ymd || '').split('-');
    var y = Number(p[0]);
    var m = Number(p[1]);
    var d = Number(p[2]);
    if (!y || !m || !d) return '';
    var utc = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
    var mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(utc.getUTCDate()).padStart(2, '0');
    return utc.getUTCFullYear() + '-' + mm + '-' + dd;
  }

  function diffDays(a, b) {
    var pa = String(a).split('-');
    var pb = String(b).split('-');
    var ua = Date.UTC(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
    var ub = Date.UTC(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
    return Math.round((ub - ua) / 86400000);
  }

  function lunesDe(ymd) {
    var p = String(ymd).split('-');
    var utc = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    var dow = utc.getUTCDay();
    var delta = dow === 0 ? -6 : 1 - dow;
    return addDays(ymd, delta);
  }

  /** Sábado o domingo pasan al lunes siguiente. */
  function diaHabil(ymd) {
    var p = String(ymd || '').split('-');
    if (p.length !== 3) return ymd;
    var dow = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay();
    if (dow === 6) return addDays(ymd, 2);
    if (dow === 0) return addDays(ymd, 1);
    return ymd;
  }

  function fmtDia(ymd) {
    var p = String(ymd || '').split('-');
    if (p.length !== 3) return '';
    return p[2] + '/' + p[1];
  }

  function fmtPesos(n) {
    var v = Math.round(Number(n) || 0);
    return '$ ' + v.toLocaleString('es-AR');
  }

  function norm(s) {
    return String(s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function titulo(s, vacio) {
    var t = String(s || '').trim();
    return t || vacio;
  }

  function median(nums) {
    var a = (nums || []).filter(function (n) { return Number.isFinite(n); }).slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var i = Math.floor(a.length / 2);
    return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function esAjuste(cat) {
    return /^ajuste\b/.test(norm(cat));
  }

  function esImpuesto(cat) {
    return norm(cat).indexOf('impuesto') !== -1;
  }

  function esGastoBancario(cat) {
    return /gastos?\s+bancari/.test(norm(cat));
  }

  function esSueldosYJornales(cuenta) {
    return norm(cuenta).indexOf('sueldos y jornales') !== -1;
  }

  function diaDelMes(ymd) {
    return Number(String(ymd || '').split('-')[2]) || 0;
  }

  function mesDe(ymd) {
    return String(ymd || '').slice(0, 7);
  }

  function diaUnoMesSiguiente(ymd) {
    var p = String(ymd || '').split('-');
    var y = Number(p[0]);
    var m = Number(p[1]) + 1;
    if (!y || !m) return '';
    if (m > 12) { m = 1; y += 1; }
    return y + '-' + String(m).padStart(2, '0') + '-01';
  }

  /** Últimos 3 pagos, en orden. El más reciente pesa 3, el anterior 2 y el más viejo de esos tres pesa 1. */
  function montoEstimado(montos) {
    var ult = (montos || []).filter(function (n) { return Number.isFinite(n) && n > 0; }).slice(-3);
    if (!ult.length) return null;
    var pesos = ult.length === 1 ? [1] : (ult.length === 2 ? [1, 2] : [1, 2, 3]);
    var acc = 0;
    var sw = 0;
    ult.forEach(function (m, i) {
      acc += m * pesos[i];
      sw += pesos[i];
    });
    return acc / sw;
  }

  function armarSemanas(hoy) {
    var inicio = lunesDe(hoy);
    var out = [];
    for (var i = 0; i < SEMANAS; i++) {
      var desde = addDays(inicio, i * 7);
      var hasta = addDays(desde, 4);
      out.push({
        i: i,
        desde: desde,
        hasta: hasta,
        label: i === 0 ? 'Esta semana' : ('Semana ' + (i + 1)),
        rango: fmtDia(desde) + ' – ' + fmtDia(hasta)
      });
    }
    return out;
  }

  function semanaDe(ymd, semanas) {
    for (var i = 0; i < semanas.length; i++) {
      if (ymd >= semanas[i].desde && ymd <= semanas[i].hasta) return semanas[i];
    }
    return null;
  }

  function proyectar(fechas, montos, hoy, semanas) {
    var orden = fechas.slice().sort();
    var gaps = [];
    for (var i = 1; i < orden.length; i++) {
      var g = diffDays(orden[i - 1], orden[i]);
      if (g >= 1) gaps.push(g);
    }
    var medGap = median(gaps);
    if (medGap == null) return [];
    medGap = Math.round(medGap);
    if (medGap < 5 || medGap > 45) return [];
    var nFechas = orden.length;
    if (nFechas < 2) return [];
    if (nFechas < 3 && (medGap < 20 || medGap > 40)) return [];
    var ultima = orden[orden.length - 1];
    var diasDesde = diffDays(ultima, hoy);
    if (diasDesde > medGap * 1.75 + 3) return [];
    var medMonto = montoEstimado(montos);
    if (medMonto == null || medMonto <= 0) return [];
    var cursor = addDays(ultima, medGap);
    var guard = 0;
    while (cursor && diaHabil(cursor) < hoy && guard < 8) {
      cursor = addDays(cursor, medGap);
      guard++;
    }
    var fin = semanas[semanas.length - 1].hasta;
    var fechasProj = [];
    var vistos = {};
    while (cursor && cursor <= addDays(fin, 2) && guard < 14) {
      var habil = diaHabil(cursor);
      if (habil >= semanas[0].desde && habil <= fin && !vistos[habil]) {
        vistos[habil] = true;
        fechasProj.push(habil);
      }
      cursor = addDays(cursor, medGap);
      guard++;
    }
    return fechasProj.map(function (f) {
      return { fecha: f, monto: medMonto, cada: medGap, veces: nFechas };
    });
  }

  /** Nómina: el día 1 del mes siguiente al último pago oportuno (desde septiembre). */
  function proyectarNomina(fechas, montos, hoy, semanas) {
    if (!fechas.length) return [];
    var monto = montoEstimado(montos);
    if (monto == null || monto <= 0) return [];
    var cursor = diaUnoMesSiguiente(fechas[fechas.length - 1]);
    var guard = 0;
    while (cursor && diaHabil(cursor) < hoy && guard < 6) {
      cursor = diaUnoMesSiguiente(cursor);
      guard++;
    }
    var fin = semanas[semanas.length - 1].hasta;
    var out = [];
    while (cursor && cursor <= addDays(fin, 2) && guard < 8) {
      var habil = diaHabil(cursor);
      if (habil >= semanas[0].desde && habil <= fin) out.push({ fecha: habil, monto: monto, cada: 30, veces: fechas.length });
      cursor = diaUnoMesSiguiente(cursor);
      guard++;
    }
    return out;
  }

  function calcularAgenda(rows, opts) {
    opts = opts || {};
    var hoy = opts.hoy || hoyArgentina();
    var desdeHist = addDays(hoy, -HISTORIA_DIAS);
    var montoArs = typeof opts.montoArs === 'function' ? opts.montoArs : function (r) { return Number(r.monto) || 0; };
    var excluir = typeof opts.excluir === 'function' ? opts.excluir : function () { return false; };
    var semanas = armarSemanas(hoy);
    var pagos = [];

    (rows || []).forEach(function (r) {
      if (!r || excluir(r)) return;
      if (String(r.tipo_movimiento || '') !== 'Egreso') return;
      var fecha = ymdDe(r.fecha);
      if (!fecha || fecha < desdeHist || fecha > hoy) return;
      var cat = titulo(r.nueva_categoria || r.categoria, 'Sin categoría');
      if (esAjuste(cat) || esGastoBancario(cat)) return;
      var monto = montoArs(r);
      if (monto == null || !Number.isFinite(Number(monto)) || Number(monto) <= 0) return;
      if (esImpuesto(cat) && Number(monto) <= UMBRAL_IMPUESTO_ARS) return;
      var prov = titulo(r.cliente, 'Sin identificar');
      var cuenta = titulo(r.nueva_cuenta_contable || r.cuenta_contable, 'Sin cuenta contable');
      pagos.push({
        fecha: fecha,
        prov: prov,
        provKey: norm(prov),
        cat: cat,
        catKey: norm(cat),
        cuenta: cuenta,
        cuentaKey: norm(cuenta),
        idc: String(r.id_compra || '').trim(),
        monto: Number(monto)
      });
    });

    var nominaPagos = [];
    var conCompra = {};
    var sinCompra = {};
    pagos.forEach(function (p) {
      if (esSueldosYJornales(p.cuenta)) {
        if (p.fecha >= DESDE_NOMINA) nominaPagos.push(p);
        return;
      }
      var key = p.provKey + '|' + p.catKey + '|' + p.cuentaKey;
      if (p.idc) {
        if (!conCompra[key]) conCompra[key] = { prov: p.prov, cat: p.cat, cuenta: p.cuenta, provKey: p.provKey, eventos: {} };
        var ev = conCompra[key].eventos[p.idc];
        if (!ev) conCompra[key].eventos[p.idc] = { fecha: p.fecha, monto: p.monto };
        else {
          if (p.fecha > ev.fecha) ev.fecha = p.fecha;
          ev.monto += p.monto;
        }
      } else {
        if (!sinCompra[key]) sinCompra[key] = { prov: p.prov, cat: p.cat, cuenta: p.cuenta, provKey: p.provKey, catKey: p.catKey, dias: {} };
        if (!sinCompra[key].dias[p.fecha]) sinCompra[key].dias[p.fecha] = 0;
        sinCompra[key].dias[p.fecha] += p.monto;
      }
    });

    var items = [];
    var cubiertos = {};

    Object.keys(conCompra).forEach(function (key) {
      var g = conCompra[key];
      var fechas = [];
      var montos = [];
      var porDia = {};
      Object.keys(g.eventos).forEach(function (idc) {
        var ev = g.eventos[idc];
        if (!porDia[ev.fecha]) porDia[ev.fecha] = 0;
        porDia[ev.fecha] += ev.monto;
      });
      Object.keys(porDia).sort().forEach(function (f) {
        fechas.push(f);
        montos.push(porDia[f]);
      });
      proyectar(fechas, montos, hoy, semanas).forEach(function (pr) {
        var sem = semanaDe(pr.fecha, semanas);
        if (!sem) return;
        cubiertos[key] = true;
        items.push({
          semana: sem.i,
          fecha: pr.fecha,
          prov: g.prov,
          provKey: g.provKey,
          cat: g.cat,
          cuenta: g.cuenta,
          monto: pr.monto,
          origen: 'compra',
          cada: pr.cada,
          veces: pr.veces,
          yaPagado: false
        });
      });
    });

    Object.keys(sinCompra).forEach(function (key) {
      if (cubiertos[key]) return;
      var g = sinCompra[key];
      if (g.provKey === norm('Sin identificar') && (g.catKey === 'transferencia' || g.catKey === 'deposito')) return;
      var fechas = Object.keys(g.dias).sort();
      if (fechas.length < (g.provKey === norm('Sin identificar') ? 6 : 4)) return;
      var montos = fechas.map(function (f) { return g.dias[f]; });
      proyectar(fechas, montos, hoy, semanas).forEach(function (pr) {
        var sem = semanaDe(pr.fecha, semanas);
        if (!sem) return;
        items.push({
          semana: sem.i,
          fecha: pr.fecha,
          prov: g.prov,
          provKey: g.provKey,
          cat: g.cat,
          cuenta: g.cuenta,
          monto: pr.monto,
          origen: 'frecuente',
          cada: pr.cada,
          veces: pr.veces,
          yaPagado: false
        });
      });
    });

    var anclaNomina = '';
    nominaPagos.forEach(function (p) {
      if (diaDelMes(p.fecha) <= 7 && (!anclaNomina || p.fecha > anclaNomina)) anclaNomina = p.fecha;
    });
    if (!anclaNomina) {
      nominaPagos.forEach(function (p) {
        if (!anclaNomina || p.fecha > anclaNomina) anclaNomina = p.fecha;
      });
    }
    if (anclaNomina) {
      var mesNomina = mesDe(anclaNomina);
      var enPrimera = diaDelMes(anclaNomina) <= 7;
      var sumaNomina = 0;
      var nominaCat = 'Sueldos';
      var nominaCuenta = 'Sueldos y Jornales a pagar';
      nominaPagos.forEach(function (p) {
        if (mesDe(p.fecha) !== mesNomina) return;
        if (enPrimera && diaDelMes(p.fecha) > 7) return;
        if (!enPrimera && p.fecha !== anclaNomina) return;
        sumaNomina += p.monto;
        if (norm(p.cat).indexOf('sueldo') !== -1) nominaCat = p.cat;
        nominaCuenta = p.cuenta;
      });
      proyectarNomina([anclaNomina], [sumaNomina], hoy, semanas).forEach(function (pr) {
        var sem = semanaDe(pr.fecha, semanas);
        if (!sem) return;
        items.push({
          semana: sem.i,
          fecha: pr.fecha,
          prov: 'Nómina',
          provKey: norm('Nómina'),
          cat: nominaCat,
          cuenta: nominaCuenta,
          monto: pr.monto,
          origen: 'nomina',
          cada: pr.cada,
          veces: pr.veces,
          yaPagado: false
        });
      });
    }

    var pagadoEnSemana = {};
    pagos.forEach(function (p) {
      if (!p.idc) return;
      if (p.provKey === norm('Sin identificar')) return;
      if (p.fecha > hoy) return;
      var sem = semanaDe(diaHabil(p.fecha), semanas);
      if (!sem) return;
      pagadoEnSemana[p.provKey + '|' + sem.i] = true;
    });
    items.forEach(function (it) {
      if (it.origen !== 'compra') return;
      if (it.provKey === norm('Sin identificar')) return;
      if (pagadoEnSemana[it.provKey + '|' + it.semana]) it.yaPagado = true;
    });

    items.sort(function (a, b) {
      if (a.semana !== b.semana) return a.semana - b.semana;
      return b.monto - a.monto;
    });

    var semanasOut = semanas.map(function (s) {
      return { i: s.i, desde: s.desde, hasta: s.hasta, label: s.label, rango: s.rango, pendiente: 0, pagado: 0 };
    });
    items.forEach(function (it) {
      var s = semanasOut[it.semana];
      if (it.yaPagado) s.pagado += it.monto;
      else s.pendiente += it.monto;
    });

    return { hoy: hoy, desdeHist: desdeHist, semanas: semanasOut, items: items };
  }

  var semanaFiltro = null;

  function svgAyuda() {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';
  }

  function htmlBarras(modelo, activo) {
    var max = 1;
    modelo.semanas.forEach(function (s) {
      var t = s.pendiente + s.pagado;
      if (t > max) max = t;
    });
    return '<div class="agp-barras" role="list">' + modelo.semanas.map(function (s) {
      var t = s.pendiente + s.pagado;
      var h = t > 0 ? Math.max(8, Math.round((t / max) * 92)) : 0;
      var hPag = t > 0 ? Math.round((s.pagado / t) * h) : 0;
      var hPen = h - hPag;
      var on = activo === s.i ? ' agp-barra-on' : '';
      return '<button type="button" class="agp-barra' + on + '" data-semana="' + s.i + '" role="listitem" title="' + esc(s.label + ' ' + s.rango) + '" aria-label="' + esc(s.label + ', ' + s.rango + ', por pagar ' + fmtPesos(s.pendiente) + ', ya pagado ' + fmtPesos(s.pagado)) + '">' +
        '<span class="agp-barra-monto">' + esc(fmtPesos(t)) + '</span>' +
        '<span class="agp-barra-col" style="height:' + h + 'px">' +
          '<span class="agp-barra-pen" style="height:' + hPen + 'px"></span>' +
          '<span class="agp-barra-pag" style="height:' + hPag + 'px"></span>' +
        '</span>' +
        '<span class="agp-barra-lab">' + esc(s.label) + '</span>' +
        '<span class="agp-barra-rango">' + esc(s.rango) + '</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function htmlTabla(modelo) {
    var lista = modelo.items.filter(function (it) {
      return semanaFiltro == null || it.semana === semanaFiltro;
    });
    if (!lista.length) {
      return '<p class="agp-vacio">No hay pagos estimados para este recorte.</p>';
    }
    var html = '<div class="agp-tabla-wrap"><table class="agp-tabla"><thead><tr>' +
      '<th>Semana</th><th>Categoría</th><th>Cuenta contable</th><th>Proveedor</th><th class="num">Estimado</th><th>Estado</th><th>Base</th>' +
      '</tr></thead><tbody>';
    var semActual = null;
    var subPen = 0;
    var subPag = 0;
    function filaTotal(sem) {
      var s = modelo.semanas[sem];
      return '<tr class="agp-total"><td colspan="4">Total ' + esc(s.label) + ' · ' + esc(s.rango) + '</td>' +
        '<td class="num">' + esc(fmtPesos(subPen + subPag)) + '</td>' +
        '<td colspan="2">Por pagar ' + esc(fmtPesos(subPen)) + (subPag ? ' · ya pagado ' + esc(fmtPesos(subPag)) : '') + '</td></tr>';
    }
    lista.forEach(function (it) {
      if (semActual != null && it.semana !== semActual) {
        html += filaTotal(semActual);
        subPen = 0;
        subPag = 0;
      }
      semActual = it.semana;
      if (it.yaPagado) subPag += it.monto;
      else subPen += it.monto;
      var s = modelo.semanas[it.semana];
      var estado = it.yaPagado
        ? '<span class="agp-badge agp-badge-ok">Ya pagado</span>'
        : '<span class="agp-badge agp-badge-pend">Por pagar</span>';
      var base = it.origen === 'nomina'
        ? 'Día 1 del mes · cada 30 días · carga desde septiembre'
        : (it.origen === 'compra'
          ? 'Con ID compra · cada ' + it.cada + ' días'
          : 'Frecuente, sin ID compra · cada ' + it.cada + ' días');
      html += '<tr' + (it.yaPagado ? ' class="agp-row-ok"' : '') + '>' +
        '<td>' + esc(s.label) + '<div class="agp-sub">' + esc(fmtDia(it.fecha)) + '</div></td>' +
        '<td>' + esc(it.cat) + '</td>' +
        '<td>' + esc(it.cuenta || 'Sin cuenta contable') + '</td>' +
        '<td>' + esc(it.prov) + '</td>' +
        '<td class="num">' + esc(fmtPesos(it.monto)) + '</td>' +
        '<td>' + estado + '</td>' +
        '<td>' + esc(base) + '</td></tr>';
    });
    if (semActual != null) html += filaTotal(semActual);
    html += '</tbody></table></div>';
    return html;
  }

  var modeloActual = null;

  function pintar() {
    var mount = document.getElementById('agenda-pagos-mount');
    if (!mount || !modeloActual) return;
    var m = modeloActual;
    var pendiente = 0;
    var pagado = 0;
    var nPag = 0;
    m.items.forEach(function (it) {
      if (it.yaPagado) { pagado += it.monto; nPag += 1; }
      else pendiente += it.monto;
    });
    var cats = {};
    m.items.forEach(function (it) {
      if (it.yaPagado) return;
      if (!cats[it.cat]) cats[it.cat] = 0;
      cats[it.cat] += it.monto;
    });
    var top = Object.keys(cats).map(function (c) { return { cat: c, monto: cats[c] }; })
      .sort(function (a, b) { return b.monto - a.monto; }).slice(0, 4);
    var chips = top.map(function (c) {
      return '<span class="agp-chip"><strong>' + esc(c.cat) + '</strong> ' + esc(fmtPesos(c.monto)) + '</span>';
    }).join('');
    var filtroTxt = '';
    if (semanaFiltro != null && m.semanas[semanaFiltro]) {
      var sf = m.semanas[semanaFiltro];
      filtroTxt = '<p class="agp-nota">Detalle de <strong>' + esc(sf.label) + '</strong> (' + esc(sf.rango) + '). Tocá de nuevo la barra para ver las 4 semanas.</p>';
    }
    mount.innerHTML =
      '<section class="agp-card" aria-label="Agenda de pagos">' +
        '<div class="agp-card-top">' +
          '<button type="button" class="th-help th-help--inline" data-help="Estimado de egresos de las próximas 4 semanas, según los últimos 3 meses. El importe usa los últimos 3 pagos de ese proveedor y categoría: el más reciente pesa más. Primero las series con ID compra. También entran los pagos frecuentes sin ID compra. Impuestos de hasta $ 500.000 y Gastos bancarios no entran. Cada serie se abre por cuenta contable. Las semanas son de lunes a viernes. Si el cálculo cae sábado o domingo, el pago pasa al lunes. Sueldos y Jornales a pagar toma la primera semana del último mes cargado desde septiembre y el próximo cae el primer día hábil. Ya pagado no compara el monto: en esa semana ya hay un egreso con ID compra al mismo proveedor. Eso no se aplica si la serie no tiene ID compra. Tocá una semana para ver solo ese detalle." aria-label="Ayuda: agenda de pagos" title="Ayuda">' + svgAyuda() + '</button>' +
          '<p class="agp-lead">Por pagar en 4 semanas <strong>' + esc(fmtPesos(pendiente)) + '</strong>' +
            (nPag ? ' · ' + nPag + ' ya pagado' + (nPag === 1 ? '' : 's') + ' (' + esc(fmtPesos(pagado)) + ')' : '') +
          '</p>' +
        '</div>' +
        htmlBarras(m, semanaFiltro) +
        '<p class="agp-leyenda"><span><i class="pen"></i>Por pagar</span><span><i class="pag"></i>Ya pagado al proveedor</span></p>' +
        (chips ? '<div class="agp-chips">' + chips + '</div>' : '') +
        '<p class="agp-nota">El monto es un estimado. El verde de cada barra es lo ya pagado a ese proveedor en la semana.</p>' +
      '</section>' +
      filtroTxt +
      htmlTabla(m);
    mount.querySelectorAll('.agp-barra').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = Number(b.getAttribute('data-semana'));
        semanaFiltro = semanaFiltro === n ? null : n;
        pintar();
      });
    });
  }

  function actualizar(opts) {
    modeloActual = calcularAgenda((opts && opts.rows) || [], opts || {});
    pintar();
  }

  var api = { actualizar: actualizar, calcular: calcularAgenda };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FornitaliaAgendaPagos = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
