/**
 * Agenda de pagos: estimado de egresos de 4 semanas, desde el lunes de la semana en curso.
 * Un día de esa semana sigue aunque ya haya pasado.
 * Con ID compra: serie por proveedor, categoría y cuenta contable.
 * Ya pagado = hubo un egreso con ID compra a ese mismo proveedor en esa semana
 * (no compara el monto). Sin ID compra: un pago de la misma categoría y cuenta
 * toma una fila de esa semana, le pone el importe real y la deja pagada.
 * Si hay más pagos que filas, los que sobran no marcan nada y no cortan el tablero.
 * Cada una de las 4 semanas es una semana del mes (1ª, 2ª, 3ª o 4ª)
 * y el estimado es lo que habitualmente se paga en esa misma semana.
 * La ventana siempre mira hacia adelante: al pasar de semana, entra
 * la 1ª del mes siguiente y sale la que quedó atrás.
 * La semana en curso muestra lo pagado, por categoría y cuenta, con el
 * importe real, más lo habitual de esa semana que todavía no se pagó.
 * Un pago de la semana anterior, o uno que entró antes, se descuenta.
 * Comisiones de venta se proyectan en la última semana del mes.
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

  /** Comisión comercial de ventas. No incluye gastos ni comisiones bancarias. */
  function esComisionVenta(cat, cuenta) {
    var c = norm(cat);
    var u = norm(cuenta);
    if (u.indexOf('bancari') !== -1 || c.indexOf('bancari') !== -1) return false;
    if (c.indexOf('mercado pago') !== -1) return false;
    if (u.indexOf('comisones ventas') !== -1 || u.indexOf('comisiones ventas') !== -1) return true;
    return c.indexOf('comision fuerza de venta') !== -1;
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

  function mesAnteriorYm(ym) {
    var p = String(ym || '').split('-');
    var y = Number(p[0]);
    var m = Number(p[1]) - 1;
    if (!y || !Number(p[1])) return '';
    if (m < 1) { m = 12; y -= 1; }
    return y + '-' + String(m).padStart(2, '0');
  }

  function mesSiguienteYm(ym) {
    return mesDe(diaUnoMesSiguiente(ym + '-01'));
  }

  /** Lunes de la semana que contiene el primer día hábil del mes. Esa semana es la 1ª. */
  function lunesSemana1(ym) {
    return lunesDe(diaHabil(ym + '-01'));
  }

  /**
   * Semana del mes de un lunes. La semana del día 1 es la 1ª de ese mes
   * (aunque el lunes caiga en el mes anterior). La siguiente es la 2ª, y así.
   */
  function clasificarLunes(lunes) {
    var ymL = mesDe(lunes);
    var ymVie = mesDe(addDays(lunes, 4));
    var candidatos = [ymVie, ymL, mesSiguienteYm(ymVie), mesAnteriorYm(ymL)];
    var visto = {};
    var i;
    for (i = 0; i < candidatos.length; i++) {
      var ym = candidatos[i];
      if (!ym || visto[ym]) continue;
      visto[ym] = true;
      if (lunesSemana1(ym) === lunes) return { ym: ym, n: 1 };
    }
    var bestYm = '';
    var bestS1 = '';
    Object.keys(visto).forEach(function (ym) {
      var s1 = lunesSemana1(ym);
      if (!s1 || s1 > lunes) return;
      if (!bestS1 || s1 > bestS1) { bestS1 = s1; bestYm = ym; }
    });
    var n = bestS1 ? (1 + Math.round(diffDays(bestS1, lunes) / 7)) : 1;
    if (n < 1) n = 1;
    return { ym: bestYm || ymL, n: n };
  }

  function etiquetaSemanaMes(c) {
    var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var m = Number(String(c && c.ym || '').split('-')[1]) - 1;
    var nom = meses[m] || '';
    return (c && c.n ? c.n : 1) + 'ª de ' + nom;
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

  function ultimoDiaMes(ym) {
    var p = String(ym || '').split('-');
    var y = Number(p[0]);
    var m = Number(p[1]);
    if (!y || !m) return '';
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return y + '-' + String(m).padStart(2, '0') + '-' + String(last).padStart(2, '0');
  }

  /** Lunes de la semana que contiene el último día del mes. */
  function lunesCierreMes(ym) {
    return lunesDe(ultimoDiaMes(ym));
  }

  /** Cierre de comisiones: día 22 en adelante, o la semana del último día del mes. */
  function esCierreMes(fecha) {
    if (diaDelMes(fecha) >= 22) return true;
    return lunesDe(diaHabil(fecha)) === lunesCierreMes(mesDe(fecha));
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

  /**
   * Nómina: el día 1 hábil de cada mes que entre en las 4 semanas.
   * El importe es la primera semana (días 1 a 7) del mes anterior.
   * Así, si este mes ya se pagó, la fila sigue en la semana en curso
   * y el ajuste posterior la deja en el importe real.
   */
  function proyectarNomina(pagos, hoy, semanas) {
    if (!pagos.length || !semanas.length) return [];
    var porMes = {};
    var cat = 'Sueldos';
    var cuenta = 'Sueldos y Jornales a pagar';
    pagos.forEach(function (p) {
      if (!p || diaDelMes(p.fecha) > 7) return;
      if (norm(p.cat).indexOf('sueldo') === -1 && norm(p.cat).indexOf('jornal') === -1) return;
      var ym = mesDe(p.fecha);
      if (!ym) return;
      porMes[ym] = (porMes[ym] || 0) + p.monto;
      cat = p.cat;
      if (p.cuenta) cuenta = p.cuenta;
    });
    var meses = Object.keys(porMes).sort();
    if (!meses.length) return [];
    var piso = semanas[0].desde;
    var fin = semanas[semanas.length - 1].hasta;
    var ym = mesDe(piso);
    var out = [];
    var guard = 0;
    while (ym && guard < 6) {
      var fecha = diaHabil(ym + '-01');
      if (fecha && fecha > addDays(fin, 2)) break;
      if (fecha && fecha >= piso && fecha <= fin) {
        var prev = null;
        meses.forEach(function (k) { if (k < ym) prev = porMes[k]; });
        var monto = prev != null ? prev : porMes[ym];
        if (monto > 0) out.push({ fecha: fecha, monto: monto, cada: 30, veces: meses.length, cat: cat, cuenta: cuenta });
      }
      ym = mesDe(diaUnoMesSiguiente(ym + '-01'));
      guard++;
    }
    return out;
  }

  /**
   * Comisiones de venta: una fila en la última semana de cada mes que entre
   * en las 4 semanas. El importe sale de los cierres anteriores (día 22 en adelante).
   * Si esta semana ya se pagó, la fila queda con la suma real.
   */
  function proyectarComisiones(pagos, hoy, semanas) {
    if (!pagos.length) return [];
    var porMes = {};
    pagos.forEach(function (p) {
      if (!p || !esCierreMes(p.fecha) || p.fecha > hoy) return;
      var ym = mesDe(p.fecha);
      if (!porMes[ym]) porMes[ym] = 0;
      porMes[ym] += p.monto;
    });
    var ultimo = pagos[0];
    pagos.forEach(function (p) { if (!ultimo || p.fecha >= ultimo.fecha) ultimo = p; });
    var cat = ultimo.cat;
    var cuenta = ultimo.cuenta;
    var out = [];
    semanas.forEach(function (sem) {
      var ym = mesDe(sem.hasta);
      if (lunesCierreMes(ym) !== sem.desde && lunesCierreMes(mesDe(sem.desde)) !== sem.desde) return;
      var ymCierre = lunesCierreMes(mesDe(sem.desde)) === sem.desde ? mesDe(sem.desde) : ym;
      var hist = [];
      Object.keys(porMes).sort().forEach(function (k) {
        if (k < ymCierre) hist.push(porMes[k]);
      });
      var estimado = montoEstimado(hist);
      var reales = pagos.filter(function (p) {
        if (!p || p.fecha > hoy) return false;
        var s = semanaDe(diaHabil(p.fecha), semanas);
        return s && s.i === sem.i;
      });
      var monto = estimado;
      var yaPagado = false;
      var prov = 'Comisiones';
      if (reales.length) {
        yaPagado = true;
        monto = 0;
        var nombres = {};
        reales.forEach(function (p) {
          monto += p.monto;
          p._usado = true;
          if (p.prov && p.provKey !== norm('Sin identificar')) nombres[p.prov] = true;
          cat = p.cat;
          cuenta = p.cuenta;
        });
        var lista = Object.keys(nombres);
        prov = !lista.length ? 'Comisiones' : (lista.length <= 2 ? lista.join(' · ') : 'Varios');
      }
      if (monto == null || !(monto > 0)) return;
      out.push({
        semana: sem.i,
        fecha: sem.desde,
        prov: prov,
        provKey: norm(prov),
        cat: cat,
        cuenta: cuenta,
        monto: monto,
        origen: 'comision',
        cada: 30,
        veces: hist.length,
        yaPagado: yaPagado
      });
    });
    return out;
  }

  /**
   * Cada semana hacia adelante muestra lo habitual de esa semana del mes
   * (1ª, 2ª, 3ª…). El hábito sale de los meses ya cerrados: en cada mes
   * manda la semana en la que más se pagó esa serie, y el importe pondera
   * los últimos tres. Nómina va junta. Comisiones tienen su propia semana.
   */
  function proyectarHabitual(pagos, semanas, hoy) {
    var mesActual = mesDe(hoy);
    var series = {};
    (pagos || []).forEach(function (p) {
      if (!p || esComisionVenta(p.cat, p.cuenta)) return;
      var lunes = lunesDe(diaHabil(p.fecha));
      var c = clasificarLunes(lunes);
      if (!c || !c.ym || c.ym >= mesActual) return;
      var key;
      var meta;
      if (esSueldosYJornales(p.cuenta) && (norm(p.cat).indexOf('sueldo') !== -1 || norm(p.cat).indexOf('jornal') !== -1)) {
        key = 'nomina';
        meta = { prov: 'Nómina', provKey: norm('Nómina'), cat: p.cat, cuenta: p.cuenta, origen: 'nomina' };
      } else {
        if (p.provKey === norm('Sin identificar') && (p.catKey === 'transferencia' || p.catKey === 'deposito')) return;
        key = p.provKey + '|' + p.catKey + '|' + p.cuentaKey;
        meta = { prov: p.prov, provKey: p.provKey, cat: p.cat, cuenta: p.cuenta, origen: p.idc ? 'compra' : 'frecuente' };
      }
      if (!series[key]) series[key] = { meta: meta, meses: {} };
      else if (meta.origen === 'nomina' && norm(p.cat).indexOf('sueldo') !== -1) series[key].meta.cat = p.cat;
      if (!series[key].meses[c.ym]) series[key].meses[c.ym] = {};
      series[key].meses[c.ym][c.n] = (series[key].meses[c.ym][c.n] || 0) + p.monto;
    });

    var habito = {};
    Object.keys(series).forEach(function (key) {
      var meses = Object.keys(series[key].meses).sort();
      if (meses.length < 2 && key !== 'nomina') return;
      if (!meses.length) return;
      var sums = [];
      var slot = null;
      meses.slice(-3).forEach(function (ym) {
        var slots = series[key].meses[ym];
        var bestN = null;
        var bestV = 0;
        Object.keys(slots).forEach(function (n) {
          if (slots[n] > bestV) { bestV = slots[n]; bestN = Number(n); }
        });
        if (bestN != null && bestV > 0) {
          sums.push(bestV);
          slot = bestN;
        }
      });
      var monto = montoEstimado(sums);
      if (slot == null || monto == null || !(monto > 0)) return;
      habito[key] = { meta: series[key].meta, n: slot, monto: monto, veces: sums.length };
    });

    var items = [];
    (semanas || []).forEach(function (sem) {
      var c = clasificarLunes(sem.desde);
      Object.keys(habito).forEach(function (key) {
        var h = habito[key];
        if (h.n !== c.n) return;
        items.push({
          semana: sem.i,
          fecha: sem.desde,
          prov: h.meta.prov,
          provKey: h.meta.provKey,
          cat: h.meta.cat,
          cuenta: h.meta.cuenta,
          monto: h.monto,
          origen: h.meta.origen,
          cada: null,
          veces: h.veces,
          semMes: c.n,
          yaPagado: false
        });
      });
    });
    return items;
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function mismaCatCuenta(it, p) {
    return it && p && norm(it.cat) === p.catKey && norm(it.cuenta) === p.cuentaKey;
  }

  /** Resta el importe de las proyecciones, primero las del mismo proveedor. */
  function restarProyecciones(lista, monto) {
    var pool = (lista || []).filter(function (it) { return it && !it._consumido && it.monto > 1; });
    var resta = Number(monto) || 0;
    pool.forEach(function (it) {
      if (!(resta > 0)) return;
      if (resta >= it.monto - 1) {
        resta = round2(resta - it.monto);
        it._consumido = true;
      } else {
        it.monto = round2(it.monto - resta);
        resta = 0;
      }
    });
    return resta;
  }

  function proyeccionesDe(items, p, pred) {
    var propias = [];
    var otras = [];
    items.forEach(function (it) {
      if (!it || it._consumido || it.origen === 'colchon' || it.yaPagado) return;
      if (!mismaCatCuenta(it, p) || !(it.monto > 1)) return;
      if (pred && !pred(it)) return;
      if (p.provKey && it.provKey === p.provKey) propias.push(it);
      else otras.push(it);
    });
    function porFecha(a, b) {
      if (a.semana !== b.semana) return a.semana - b.semana;
      return a.fecha < b.fecha ? -1 : (a.fecha > b.fecha ? 1 : 0);
    }
    propias.sort(porFecha);
    otras.sort(porFecha);
    return propias.concat(otras);
  }

  /**
   * La semana en curso queda con el importe real pagado, por categoría y cuenta,
   * más el habitual de esa semana que no se cubrió.
   * Un pago de la semana anterior, o uno que entra antes de la semana prevista,
   * se descuenta de esa proyección.
   */
  function ajustarConLoPagado(items, pagos, semanas, hoy) {
    if (!semanas.length) return;
    var hayEnSemana = {};
    (pagos || []).forEach(function (p) {
      if (!p || p._usado || p.fecha > hoy) return;
      var sem = semanaDe(diaHabil(p.fecha), semanas);
      if (!sem) return;
      p._sem = sem.i;
      if (proyeccionesDe(items, p, function (it) { return it.semana === sem.i; }).length) {
        hayEnSemana[sem.i + '|' + p.catKey + '|' + p.cuentaKey] = true;
      }
    });

    (pagos || []).slice().sort(function (a, b) {
      return a.fecha < b.fecha ? -1 : (a.fecha > b.fecha ? 1 : 0);
    }).forEach(function (p) {
      if (!p || p._usado || p.fecha > hoy) return;
      if (p._sem != null) return;
      var dest = proyeccionesDe(items, p, function (it) {
        var desde = addDays(lunesDe(it.fecha), -7);
        return p.fecha >= desde && p.fecha < it.fecha;
      });
      if (!dest.length) return;
      restarProyecciones([dest[0]], p.monto);
    });

    (pagos || []).forEach(function (p) {
      if (!p || p._usado || p._sem == null || p.fecha > hoy) return;
      var k = p._sem + '|' + p.catKey + '|' + p.cuentaKey;
      if (hayEnSemana[k]) {
        var queda = restarProyecciones(proyeccionesDe(items, p, function (it) { return it.semana === p._sem; }), p.monto);
        if (queda > 1) restarProyecciones(proyeccionesDe(items, p, function (it) { return it.semana > p._sem; }), queda);
        return;
      }
      restarProyecciones(proyeccionesDe(items, p, function (it) { return it.semana > p._sem; }), p.monto);
    });

    for (var i = items.length - 1; i >= 0; i--) {
      if (items[i] && items[i]._consumido) items.splice(i, 1);
    }

    var grupos = {};
    (pagos || []).forEach(function (p) {
      if (!p || p._usado || p._sem == null || p.fecha > hoy) return;
      var k = p._sem + '|' + p.catKey + '|' + p.cuentaKey;
      if (!grupos[k]) {
        grupos[k] = { sem: p._sem, cat: p.cat, cuenta: p.cuenta, monto: 0, provs: {}, fecha: p.fecha };
      }
      grupos[k].monto += p.monto;
      if (p.fecha > grupos[k].fecha) grupos[k].fecha = p.fecha;
      if (p.prov && p.provKey !== norm('Sin identificar')) grupos[k].provs[p.prov] = true;
    });
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k];
      var nombres = Object.keys(g.provs);
      var prov = !nombres.length ? 'Varios' : (nombres.length <= 2 ? nombres.join(' · ') : 'Varios');
      if (esSueldosYJornales(g.cuenta) && nombres.length > 2) prov = 'Nómina';
      var cubierta = !!hayEnSemana[k];
      items.push({
        semana: g.sem,
        fecha: g.fecha,
        prov: prov,
        provKey: norm(prov),
        cat: g.cat,
        cuenta: g.cuenta,
        monto: round2(g.monto),
        origen: cubierta ? 'real' : 'adelanto',
        cada: null,
        veces: nombres.length,
        yaPagado: true
      });
    });
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

    var comisionPagos = [];
    pagos.forEach(function (p) {
      if (esComisionVenta(p.cat, p.cuenta)) comisionPagos.push(p);
    });

    var items = proyectarHabitual(pagos, semanas, hoy);
    proyectarComisiones(comisionPagos, hoy, semanas).forEach(function (it) { items.push(it); });

    ajustarConLoPagado(items, pagos, semanas, hoy);

    var porSemMes = {};
    Object.keys(totalesPorLunes).forEach(function (lunes) {
      var k = String(clasificarLunes(lunes).n);
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
      var clase = clasificarLunes(s.desde);
      var semMes = clase.n;
      s.etiqueta = etiquetaSemanaMes(clase);
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
        i: s.i, desde: s.desde, hasta: s.hasta, label: s.label,
        rango: s.rango + ' · ' + s.etiqueta,
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
        : (it.origen === 'real'
          ? 'Pagado en la semana · importe real'
          : (it.origen === 'nomina'
            ? ('Semana ' + (it.semMes || s.semMes) + ' del mes · nómina habitual')
            : (it.origen === 'comision'
              ? 'Última semana del mes'
              : (it.origen === 'adelanto'
                ? 'Entró antes de lo previsto · se descuenta de la semana estimada'
                : ('Semana ' + (it.semMes || s.semMes) + ' del mes')))));
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
          '<button type="button" class="th-help th-help--inline" data-help="Las próximas 4 semanas, de lunes a viernes, siempre hacia adelante. Cada una es una semana del mes: 1ª, 2ª, 3ª o 4ª. El estimado es lo que habitualmente se paga en esa misma semana, con los meses ya cerrados. Hoy, en la 1ª de noviembre, se ve la 1ª, la 2ª, la 3ª y la 4ª. La semana que viene se ven la 2ª, la 3ª, la 4ª y la 1ª de diciembre. La semana en curso muestra lo ya pagado, por categoría y cuenta, con el importe real, y lo habitual que todavía no se pagó. Un pago de la semana anterior, o uno que entra antes, se descuenta de la semana estimada. Impuestos de hasta $ 500.000 y Gastos bancarios no entran. Comisiones de venta van en la última semana del mes. Cada semana suma un colchón de entre 5% y 30% del estimado. La cuenta Mercaderías no entra en esa dispersión. Tocá una semana para ver solo ese detalle." aria-label="Ayuda: agenda de pagos" title="Ayuda">' + svgAyuda() + '</button>' +
          '<p class="agp-lead">Por pagar en 4 semanas <strong>' + esc(fmtPesos(pendiente)) + '</strong>' +
            (colchon ? ' · colchón ' + esc(fmtPesos(colchon)) : '') +
            (nPag ? ' · ' + nPag + ' ya pagado' + (nPag === 1 ? '' : 's') + ' (' + esc(fmtPesos(pagado)) + ')' : '') +
          '</p>' +
        '</div>' +
        htmlBarras(m, semanaFiltro) +
        '<p class="agp-leyenda"><span><i class="pen"></i>Por pagar</span><span><i class="buf"></i>Colchón de liquidez</span><span><i class="pag"></i>Ya pagado al proveedor</span></p>' +
        (chips ? '<div class="agp-chips">' + chips + '</div>' : '') +
        '<p class="agp-nota">Cada barra es una semana del mes, siempre hacia adelante. El estimado es lo habitual de esa semana. La semana en curso muestra lo pagado, por categoría y cuenta, con el importe real, y lo habitual que todavía no se pagó. El verde es lo ya pagado. La banda azul es el colchón.</p>' +
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
