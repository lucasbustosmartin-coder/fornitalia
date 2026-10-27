/**
 * Agenda de pagos: estimado de egresos de 4 semanas, desde el lunes de la semana en curso.
 * Un día de esa semana sigue aunque ya haya pasado.
 * Con ID compra: serie por proveedor, categoría y cuenta contable.
 * Ya pagado = hubo un egreso con ID compra a ese mismo proveedor en esa semana
 * (no compara el monto). Sin ID compra: un pago de la misma categoría y cuenta
 * toma una fila de esa semana, le pone el importe real y la deja pagada.
 * Si hay más pagos que filas, los que sobran no marcan nada y no cortan el tablero.
 * Sueldos y Jornales se proyecta el día 1, cada 30 días, con los
 * pagos cargados desde septiembre de 2026.
 * Cada semana suma un colchón de entre 5% y 30% del estimado.
 * El porcentaje sale de la dispersión de esa semana del mes en los
 * últimos 6 meses: la más pareja queda en 5% y la más variable en 30%.
 * Mercaderías no entra en esa dispersión.
 */
(function (root) {
  'use strict';

  var ZONA = 'America/Argentina/Buenos_Aires';
  var HISTORIA_DIAS = 92;
  var HISTORIA_COLCHON_MESES = 6;
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

  /** Compra de mercadería: sumas grandes y espaciadas. No entra en el colchón. */
  function esMercaderia(cuenta) {
    return norm(cuenta).indexOf('mercaderia') !== -1;
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

  function addMonths(ymd, delta) {
    var p = String(ymd || '').split('-');
    var y = Number(p[0]);
    var m = Number(p[1]) + Number(delta || 0);
    var d = Number(p[2]);
    if (!y || !Number(p[1]) || !d) return '';
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > last) d = last;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /** 1 = días 1 a 7 del mes, 2 = 8 a 14, 3 = 15 a 21, 4 = 22 a 28, 5 = 29 a 31. El día es el lunes de esa semana. */
  function semanaDelMes(lunes) {
    var d = diaDelMes(lunes);
    if (d <= 7) return 1;
    if (d <= 14) return 2;
    if (d <= 21) return 3;
    if (d <= 28) return 4;
    return 5;
  }

  function desvioMuestral(nums) {
    var a = (nums || []).filter(function (n) { return Number.isFinite(n); });
    if (a.length < 2) return 0;
    var mean = 0;
    a.forEach(function (n) { mean += n; });
    mean /= a.length;
    var acc = 0;
    a.forEach(function (n) {
      var d = n - mean;
      acc += d * d;
    });
    return Math.sqrt(acc / (a.length - 1));
  }

  /** La semana del mes más pareja suma 5% del estimado; la más variable, 30%. */
  function porcentajesColchon(stats) {
    var cvs = [];
    Object.keys(stats || {}).forEach(function (k) {
      if (stats[k].n >= 2) cvs.push(stats[k].cv);
    });
    var cvMin = cvs.length ? Math.min.apply(null, cvs) : 0;
    var cvMax = cvs.length ? Math.max.apply(null, cvs) : 0;
    var out = {};
    Object.keys(stats || {}).forEach(function (k) {
      var cv = stats[k].cv;
      var t = 0;
      if (cvMax > cvMin) {
        t = (cv - cvMin) / (cvMax - cvMin);
        if (t < 0) t = 0;
        if (t > 1) t = 1;
      }
      out[k] = 0.05 + 0.25 * t;
    });
    return out;
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
    var piso = semanas[0].desde;
    var pares = [];
    for (var i = 0; i < fechas.length; i++) {
      if (fechas[i] && fechas[i] < piso) pares.push({ f: fechas[i], m: montos[i] });
    }
    pares.sort(function (a, b) { return a.f < b.f ? -1 : (a.f > b.f ? 1 : 0); });
    var orden = pares.map(function (p) { return p.f; });
    var montosBase = pares.map(function (p) { return p.m; });
    var gaps = [];
    for (var g = 1; g < orden.length; g++) {
      var gap = diffDays(orden[g - 1], orden[g]);
      if (gap >= 1) gaps.push(gap);
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
    var medMonto = montoEstimado(montosBase);
    if (medMonto == null || medMonto <= 0) return [];
    var cursor = addDays(ultima, medGap);
    var guard = 0;
    while (cursor && diaHabil(cursor) < piso && guard < 8) {
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
    var piso = semanas[0].desde;
    while (cursor && diaHabil(cursor) < piso && guard < 6) {
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
    var desdeColchon = addMonths(hoy, -HISTORIA_COLCHON_MESES);
    var montoArs = typeof opts.montoArs === 'function' ? opts.montoArs : function (r) { return Number(r.monto) || 0; };
    var excluir = typeof opts.excluir === 'function' ? opts.excluir : function () { return false; };
    var semanas = armarSemanas(hoy);
    var pagos = [];
    var totalesPorLunes = {};

    (rows || []).forEach(function (r) {
      if (!r || excluir(r)) return;
      if (String(r.tipo_movimiento || '') !== 'Egreso') return;
      var fecha = ymdDe(r.fecha);
      if (!fecha || fecha > hoy || fecha < desdeColchon) return;
      var cat = titulo(r.nueva_categoria || r.categoria, 'Sin categoría');
      if (esAjuste(cat) || esGastoBancario(cat)) return;
      var monto = montoArs(r);
      if (monto == null || !Number.isFinite(Number(monto)) || Number(monto) <= 0) return;
      if (esImpuesto(cat) && Number(monto) <= UMBRAL_IMPUESTO_ARS) return;
      var cuenta = titulo(r.nueva_cuenta_contable || r.cuenta_contable, 'Sin cuenta contable');
      var lunes = lunesDe(diaHabil(fecha));
      if (!esMercaderia(cuenta) && lunes >= desdeColchon && addDays(lunes, 4) <= hoy) {
        totalesPorLunes[lunes] = (totalesPorLunes[lunes] || 0) + Number(monto);
      }
      if (fecha < desdeHist) return;
      var prov = titulo(r.cliente, 'Sin identificar');
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

    var pagosCombo = {};
    pagos.forEach(function (p) {
      if (p.fecha > hoy) return;
      var sem = semanaDe(diaHabil(p.fecha), semanas);
      if (!sem) return;
      var k = sem.i + '|' + p.catKey + '|' + p.cuentaKey;
      if (!pagosCombo[k]) pagosCombo[k] = [];
      pagosCombo[k].push(p);
    });
    var itemsCombo = {};
    items.forEach(function (it) {
      if (it.origen === 'colchon' || it.yaPagado) return;
      var k = it.semana + '|' + norm(it.cat) + '|' + norm(it.cuenta);
      if (!itemsCombo[k]) itemsCombo[k] = [];
      itemsCombo[k].push(it);
    });
    Object.keys(pagosCombo).forEach(function (k) {
      var libres = itemsCombo[k];
      if (!libres || !libres.length) return;
      pagosCombo[k].slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : (a.fecha > b.fecha ? 1 : 0); }).forEach(function (p) {
        if (!p || !libres.length) return;
        var pool = libres.filter(function (it) { return it && it.provKey === p.provKey; });
        if (!pool.length) pool = libres.filter(function (it) { return it && it.fecha; });
        var best = null;
        var bestD = Infinity;
        pool.forEach(function (it) {
          if (!it || !it.fecha) return;
          var d = Math.abs(diffDays(it.fecha, p.fecha));
          if (!best || d < bestD || (d === bestD && it.fecha < best.fecha)) {
            best = it;
            bestD = d;
          }
        });
        if (!best) return;
        best.yaPagado = true;
        best.monto = p.monto;
        var idx = libres.indexOf(best);
        if (idx >= 0) libres.splice(idx, 1);
      });
    });

    var porSemMes = {};
    Object.keys(totalesPorLunes).forEach(function (lunes) {
      var k = String(semanaDelMes(lunes));
      if (!porSemMes[k]) porSemMes[k] = [];
      porSemMes[k].push(totalesPorLunes[lunes]);
    });
    var statsSemMes = {};
    Object.keys(porSemMes).forEach(function (k) {
      var nums = porSemMes[k];
      var media = 0;
      nums.forEach(function (n) { media += n; });
      media = nums.length ? media / nums.length : 0;
      var desvio = desvioMuestral(nums);
      statsSemMes[k] = { n: nums.length, media: media, desvio: desvio, cv: media > 0 ? desvio / media : 0 };
    });
    var pctPorSemMes = porcentajesColchon(statsSemMes);

    var semanasOut = semanas.map(function (s) {
      var semMes = semanaDelMes(s.desde);
      var st = statsSemMes[String(semMes)] || { n: 0, cv: 0 };
      var nHist = st.n;
      var cv = st.cv || 0;
      if (nHist < 2 && semMes === 5 && statsSemMes['4']) {
        nHist = statsSemMes['4'].n;
        cv = statsSemMes['4'].cv || 0;
      }
      var pct = pctPorSemMes[String(semMes)];
      if (nHist < 2 && semMes === 5 && pctPorSemMes['4'] != null) pct = pctPorSemMes['4'];
      if (pct == null) pct = 0.05;
      return {
        i: s.i, desde: s.desde, hasta: s.hasta, label: s.label, rango: s.rango,
        pendiente: 0, pagado: 0, colchon: 0, pct: pct, semMes: semMes, colchonN: nHist
      };
    });

    items.forEach(function (it) {
      var s = semanasOut[it.semana];
      if (it.yaPagado) s.pagado += it.monto;
      else s.pendiente += it.monto;
    });
    semanasOut.forEach(function (s) {
      var estimado = s.pendiente + s.pagado;
      s.colchon = estimado > 0 ? s.pct * estimado : 0;
      if (!(s.colchon > 0)) return;
      items.push({
        semana: s.i,
        fecha: s.desde,
        prov: 'Últimos 6 meses',
        provKey: 'colchon',
        cat: 'Colchón de liquidez',
        cuenta: 'Semana ' + s.semMes + ' del mes',
        monto: s.colchon,
        origen: 'colchon',
        cada: null,
        veces: s.colchonN,
        pct: s.pct,
        yaPagado: false
      });
    });

    items.sort(function (a, b) {
      if (a.semana !== b.semana) return a.semana - b.semana;
      if ((a.origen === 'colchon') !== (b.origen === 'colchon')) return a.origen === 'colchon' ? 1 : -1;
      return b.monto - a.monto;
    });

    return { hoy: hoy, desdeHist: desdeHist, desdeColchon: desdeColchon, semanas: semanasOut, items: items };
  }

  var semanaFiltro = null;

  function svgAyuda() {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';
  }

  function totalSemana(s) {
    return s.pendiente + s.pagado + (s.colchon || 0);
  }

  function htmlBarras(modelo, activo) {
    var max = 1;
    modelo.semanas.forEach(function (s) {
      var t = totalSemana(s);
      if (t > max) max = t;
    });
    return '<div class="agp-barras" role="list">' + modelo.semanas.map(function (s) {
      var t = totalSemana(s);
      var col = s.colchon || 0;
      var h = t > 0 ? Math.max(8, Math.round((t / max) * 92)) : 0;
      var hPag = t > 0 ? Math.round((s.pagado / t) * h) : 0;
      var hPen = t > 0 ? Math.round((s.pendiente / t) * h) : 0;
      var hCol = Math.max(0, h - hPag - hPen);
      var on = activo === s.i ? ' agp-barra-on' : '';
      return '<button type="button" class="agp-barra' + on + '" data-semana="' + s.i + '" role="listitem" title="' + esc(s.label + ' ' + s.rango) + '" aria-label="' + esc(s.label + ', ' + s.rango + ', por pagar ' + fmtPesos(s.pendiente) + ', colchón ' + fmtPesos(col) + ', ya pagado ' + fmtPesos(s.pagado)) + '">' +
        '<span class="agp-barra-monto">' + esc(fmtPesos(t)) + '</span>' +
        '<span class="agp-barra-col" style="height:' + h + 'px">' +
          '<span class="agp-barra-buf" style="height:' + hCol + 'px"></span>' +
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
    var subCol = 0;
    function filaTotal(sem) {
      var s = modelo.semanas[sem];
      var partes = ['Por pagar ' + fmtPesos(subPen)];
      if (subCol) partes.push('colchón ' + fmtPesos(subCol));
      if (subPag) partes.push('ya pagado ' + fmtPesos(subPag));
      return '<tr class="agp-total"><td colspan="4">Total ' + esc(s.label) + ' · ' + esc(s.rango) + '</td>' +
        '<td class="num">' + esc(fmtPesos(subPen + subPag + subCol)) + '</td>' +
        '<td colspan="2">' + esc(partes.join(' · ')) + '</td></tr>';
    }
    lista.forEach(function (it) {
      if (semActual != null && it.semana !== semActual) {
        html += filaTotal(semActual);
        subPen = 0;
        subPag = 0;
        subCol = 0;
      }
      semActual = it.semana;
      if (it.origen === 'colchon') subCol += it.monto;
      else if (it.yaPagado) subPag += it.monto;
      else subPen += it.monto;
      var s = modelo.semanas[it.semana];
      var estado = it.origen === 'colchon'
        ? '<span class="agp-badge agp-badge-buf">Colchón</span>'
        : (it.yaPagado
          ? '<span class="agp-badge agp-badge-ok">Ya pagado</span>'
          : '<span class="agp-badge agp-badge-pend">Por pagar</span>');
      var base = it.origen === 'colchon'
        ? (Math.round(it.pct * 100) + '% del estimado · semana ' + s.semMes + ' del mes · ' + it.veces + ' semanas en 6 meses')
        : (it.origen === 'nomina'
          ? 'Día 1 del mes · cada 30 días · carga desde septiembre'
          : (it.origen === 'compra'
            ? 'Con ID compra · cada ' + it.cada + ' días'
            : 'Frecuente, sin ID compra · cada ' + it.cada + ' días'));
      var sub = it.origen === 'colchon' ? ('Semana ' + s.semMes + ' del mes') : fmtDia(it.fecha);
      var filaClase = it.origen === 'colchon' ? 'agp-row-buf' : (it.yaPagado ? 'agp-row-ok' : '');
      html += '<tr' + (filaClase ? ' class="' + filaClase + '"' : '') + '>' +
        '<td>' + esc(s.label) + '<div class="agp-sub">' + esc(sub) + '</div></td>' +
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
    var colchon = 0;
    var nPag = 0;
    m.items.forEach(function (it) {
      if (it.origen === 'colchon') return;
      if (it.yaPagado) { pagado += it.monto; nPag += 1; }
      else pendiente += it.monto;
    });
    m.semanas.forEach(function (s) { colchon += s.colchon || 0; });
    var cats = {};
    m.items.forEach(function (it) {
      if (it.yaPagado || it.origen === 'colchon') return;
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
          '<button type="button" class="th-help th-help--inline" data-help="Estimado de egresos de las próximas 4 semanas, según los últimos 3 meses. El importe usa los últimos 3 pagos de ese proveedor y categoría: el más reciente pesa más. Primero las series con ID compra. También entran los pagos frecuentes sin ID compra. Impuestos de hasta $ 500.000 y Gastos bancarios no entran. Cada serie se abre por cuenta contable. Las semanas son de lunes a viernes. Un día de la semana en curso sigue en la agenda aunque ya haya pasado: el pago no cae justo en la fecha estimada. Si en esa semana ya hubo un pago al proveedor, el estado pasa a Ya pagado y la fila sigue en la tabla. Sin ID compra, un pago de la misma categoría y cuenta contable toma una sola fila de esa semana, le pone el importe real y la deja en Ya pagado: el importe no tiene que coincidir. Si el cálculo cae sábado o domingo, el pago pasa al lunes. Sueldos y Jornales a pagar toma la primera semana del último mes cargado desde septiembre y el próximo cae el primer día hábil. Cada semana suma un colchón de entre 5% y 30% del estimado, según la dispersión de esa semana del mes en los últimos 6 meses. La más pareja queda en 5% y la más variable en 30%. La cuenta Mercaderías no entra en esa dispersión. Ya pagado no compara el monto: en esa semana ya hay un egreso con ID compra al mismo proveedor. Eso no se aplica si la serie no tiene ID compra. Tocá una semana para ver solo ese detalle." aria-label="Ayuda: agenda de pagos" title="Ayuda">' + svgAyuda() + '</button>' +
          '<p class="agp-lead">Por pagar en 4 semanas <strong>' + esc(fmtPesos(pendiente)) + '</strong>' +
            (colchon ? ' · colchón ' + esc(fmtPesos(colchon)) : '') +
            (nPag ? ' · ' + nPag + ' ya pagado' + (nPag === 1 ? '' : 's') + ' (' + esc(fmtPesos(pagado)) + ')' : '') +
          '</p>' +
        '</div>' +
        htmlBarras(m, semanaFiltro) +
        '<p class="agp-leyenda"><span><i class="pen"></i>Por pagar</span><span><i class="buf"></i>Colchón de liquidez</span><span><i class="pag"></i>Ya pagado al proveedor</span></p>' +
        (chips ? '<div class="agp-chips">' + chips + '</div>' : '') +
        '<p class="agp-nota">El monto es un estimado. La banda azul es el colchón: entre 5% y 30% de ese estimado, según la dispersión de la semana del mes. Mercaderías no entra. El verde es lo ya pagado en la semana. Con ID compra, al mismo proveedor. Sin ID compra, una fila de esa categoría y cuenta, con el importe del pago.</p>' +
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
