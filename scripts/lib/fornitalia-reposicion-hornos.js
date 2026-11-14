/**
 * Reposición de hornos. Momento cero = la tabla del Excel al 13/11/2026.
 * Un upload de Ventas (misma hoja) recalcula ritmo, margen y fechas de orden.
 * La orden se emite 30 días de fabricación + 60 de transporte antes de que se agote.
 */
(function (root, factory) {
  var api = factory();
  root.FornitaliaReposicionHornos = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var ZONA = 'America/Argentina/Buenos_Aires';
  var ALERTA_KEY = 'fornitalia_reposicion_alerta_dias';
  var STOCK = {
    'Disponible': 1, 'Préstamo / SR': 1, 'Por ingresar': 1, 'Pago parcial': 1,
    'Pend. despacho': 1, 'Pago pendiente': 1, 'Stock total': 1, 'Sin vender (uds.)': 1,
    'Meses con disponible': 1, 'En inventario': 1
  };
  var COSTO = { 'Precio lista vigente': 1, 'Costo USD': 1, 'Costo ARS': 1, 'Margen $ / unidad': 1, 'Margen %': 1 };
  var ORDEN = { 'Se agota': 1, 'Emitir orden': 1, 'Fin de fabricación': 1 };
  var FECHAS = { 'Primera venta': 1, 'Última venta': 1, 'Se agota': 1, 'Emitir orden': 1, 'Fin de fabricación': 1 };
  var FACTURAS = { '16/11/2026': 1, '17/11/2026': 1, '31/12/2026': 1, '15/01/2027': 1, '16/01/2027': 1 };
  var TEXTO = { 'Modelo': 1, 'Artículo': 1, 'En inventario': 1 };

  var state = { rows: null, momentoCero: true, archivo: '', lineas: 0, hasta: '', bound: false };

  function host() {
    return typeof window !== 'undefined' ? window : globalThis;
  }

  function base() {
    return host().FORNITALIA_REPOSICION_BASE;
  }

  function col(nombre) {
    var i = base().headers.indexOf(nombre);
    if (i < 0) throw new Error('Falta la columna ' + nombre);
    return i;
  }

  function hoyAR() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    var y = '', m = '', d = '';
    parts.forEach(function (p) {
      if (p.type === 'year') y = p.value;
      if (p.type === 'month') m = p.value;
      if (p.type === 'day') d = p.value;
    });
    return y + '-' + m + '-' + d;
  }

  function isoFromUtc(dt) {
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    var d = String(dt.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function isoAdd(iso, days) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + Math.round(days)));
    return isoFromUtc(dt);
  }

  function isoDiff(a, b) {
    var pa = String(a).slice(0, 10).split('-').map(Number);
    var pb = String(b).slice(0, 10).split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  function fmtFecha(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length < 3) return '';
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function fmtNum(n, dec) {
    if (n == null || n === '' || !isFinite(Number(n))) return '';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtPesos(n) {
    if (n == null || !isFinite(Number(n))) return '';
    return '$ ' + Math.round(Number(n)).toLocaleString('es-AR');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtPct(n) {
    if (n == null || !isFinite(Number(n))) return '';
    return (Number(n) * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim().replace(/\s/g, '');
    if (!s) return 0;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : 0;
  }

  function fechaIso(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) return isoFromUtc(v);
    if (typeof v === 'number' && isFinite(v)) {
      var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return isoFromUtc(dt);
    }
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  }

  function pick(row, names) {
    var keys = Object.keys(row);
    for (var i = 0; i < names.length; i++) {
      var want = names[i].toLowerCase();
      for (var k = 0; k < keys.length; k++) {
        if (String(keys[k]).trim().toLowerCase() === want) return row[keys[k]];
      }
    }
    return null;
  }

  function clienteClave(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function alertaDias() {
    var n = 15;
    try { n = parseInt(localStorage.getItem(ALERTA_KEY) || '15', 10); } catch (e) { n = 15; }
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 180) n = 180;
    return n;
  }

  function guardarAlerta(n) {
    var d = parseInt(n, 10);
    if (!isFinite(d) || d < 1) d = 1;
    if (d > 180) d = 180;
    try { localStorage.setItem(ALERTA_KEY, String(d)); } catch (e) { /* sin almacenamiento */ }
    return d;
  }

  function simular(disponible, ritmo, llegadas, foto) {
    if (!(ritmo > 0) || disponible == null || disponible === '') return null;
    var on = Number(disponible);
    var t = foto;
    for (var i = 0; i < llegadas.length; i++) {
      var fecha = llegadas[i][0];
      var qty = llegadas[i][1];
      var dias = isoDiff(t, fecha);
      if (dias < 0) { on += qty; continue; }
      var consumo = ritmo * dias;
      if (consumo > on + 1e-9) {
        on = qty;
        t = fecha;
      } else {
        on = on - consumo + qty;
        t = fecha;
      }
    }
    var agota = on <= 1e-9 ? t : isoAdd(t, on / ritmo);
    var b = base();
    return {
      agota: agota,
      emitir: isoAdd(agota, -(b.fabricacion + b.transporte)),
      fin: isoAdd(agota, -b.transporte)
    };
  }

  function enAlerta(emitir, dias, hoy) {
    if (!emitir) return false;
    return isoDiff(hoy, emitir) <= dias;
  }

  function normalizarLinea(row) {
    return {
      tipo: String(pick(row, ['Tipo']) || '').trim(),
      modelo: String(pick(row, ['Modelo']) || '').trim(),
      articulo: String(pick(row, ['Artículo', 'Articulo']) || '').trim(),
      cantidad: num(pick(row, ['Cantidad'])),
      monto: num(pick(row, ['Monto'])),
      descuento: num(pick(row, ['Descuento'])),
      total: num(pick(row, ['Total'])),
      fecha: fechaIso(pick(row, ['Fecha Venta'])),
      idVenta: pick(row, ['ID_Venta', 'ID Venta']),
      cliente: clienteClave(pick(row, ['Cliente']))
    };
  }

  function leerWorkbook(wb) {
    var name = (wb.SheetNames || []).filter(function (n) {
      return String(n).trim().toLowerCase() === 'ventas';
    })[0];
    if (!name) throw new Error('El archivo no tiene la hoja Ventas.');
    var rows = host().XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true });
    if (!rows.length) throw new Error('La hoja Ventas está vacía.');
    return rows.map(normalizarLinea);
  }

  function recalcular(lineas) {
    var b = base();
    var H = {};
    b.headers.forEach(function (h, i) { H[h] = i; });
    var hornos = lineas.filter(function (l) { return l.tipo === 'Hornos' && l.articulo; });
    if (!hornos.length) throw new Error('En Ventas no hay filas con tipo Hornos.');
    var fechas = hornos.map(function (l) { return l.fecha; }).filter(Boolean).sort();
    var maxFecha = fechas[fechas.length - 1];
    var hasta = maxFecha > b.hasta ? maxFecha : b.hasta;
    var dias = isoDiff(b.desde, hasta) + 1;
    var inicio12 = (function () {
      var p = hasta.split('-').map(Number);
      return isoFromUtc(new Date(Date.UTC(p[0], p[1] - 1 - 11, 1)));
    })();
    var totalArchivoCant = 0;
    var totalArchivoFact = 0;
    lineas.forEach(function (l) {
      totalArchivoCant += l.cantidad;
      totalArchivoFact += l.total;
    });
    var porArt = {};
    hornos.forEach(function (l) {
      var g = porArt[l.articulo] || (porArt[l.articulo] = {
        modelo: '', cant: 0, monto: 0, descuento: 0, total: 0, lineas: 0,
        ids: {}, clientes: {}, primera: null, ultima: null, ult12: 0
      });
      if (l.modelo && !g.modelo) g.modelo = l.modelo;
      g.cant += l.cantidad;
      g.monto += l.monto;
      g.descuento += l.descuento;
      g.total += l.total;
      g.lineas += 1;
      if (l.idVenta != null && l.idVenta !== '') g.ids[String(l.idVenta)] = 1;
      if (l.cliente) g.clientes[l.cliente] = 1;
      if (l.fecha) {
        if (!g.primera || l.fecha < g.primera) g.primera = l.fecha;
        if (!g.ultima || l.fecha > g.ultima) g.ultima = l.fecha;
        if (l.fecha >= inicio12 && l.fecha <= maxFecha) g.ult12 += l.cantidad;
      }
    });
    var totalHornosCant = 0;
    var totalHornosFact = 0;
    Object.keys(porArt).forEach(function (k) {
      totalHornosCant += porArt[k].cant;
      totalHornosFact += porArt[k].total;
    });
    var basePorArt = {};
    b.rows.forEach(function (r) { basePorArt[r[H['Artículo']]] = r; });
    var nombres = {};
    Object.keys(basePorArt).forEach(function (k) { nombres[k] = 1; });
    Object.keys(porArt).forEach(function (k) { nombres[k] = 1; });
    var facturas = ['16/11/2026', '17/11/2026', '31/12/2026', '15/01/2027', '16/01/2027'];
    var filas = Object.keys(nombres).map(function (art) {
      var src = basePorArt[art];
      var g = porArt[art];
      var row = b.headers.map(function () { return null; });
      if (src) {
        ['Disponible', 'Préstamo / SR', 'Por ingresar', 'Pago parcial', 'Pend. despacho', 'Pago pendiente', 'Stock total', 'Sin vender (uds.)', 'En inventario', 'Precio lista vigente', 'Costo USD', 'Costo ARS'].concat(facturas).forEach(function (h) {
          row[H[h]] = src[H[h]];
        });
        row[H['Modelo']] = src[H['Modelo']] || (g && g.modelo) || null;
      } else if (g) {
        row[H['Modelo']] = g.modelo || null;
        row[H['En inventario']] = 'No';
      }
      row[H['Artículo']] = art;
      var cant = g ? g.cant : 0;
      row[H['Unidades vendidas']] = cant;
      var neto = g ? g.monto - g.descuento : 0;
      row[H['Facturación c/IVA']] = g ? g.total : 0;
      row[H['Neto sin IVA']] = neto;
      row[H['Descuento $']] = g ? g.descuento : 0;
      row[H['Líneas']] = g ? g.lineas : 0;
      row[H['Comprobantes']] = g ? Object.keys(g.ids).length : 0;
      row[H['Clientes']] = g ? Object.keys(g.clientes).length : 0;
      row[H['Uds. últ. 12 m']] = g ? g.ult12 : 0;
      row[H['Prom. mensual 12 m']] = g && g.ult12 ? g.ult12 / 12 : (g ? 0 : null);
      if (cant > 0 && g) {
        row[H['Precio lista unit.']] = g.monto / cant;
        row[H['Precio neto unit.']] = neto / cant;
        row[H['Precio final unit.']] = g.total / cant;
        row[H['Descuento prom.']] = g.monto ? g.descuento / g.monto : null;
        row[H['Uds. por mes']] = cant * b.mesDias / dias;
        row[H['Días por unidad']] = dias / cant;
        row[H['Primera venta']] = g.primera;
        row[H['Última venta']] = g.ultima;
        row[H['% uds. hornos']] = totalHornosCant ? cant / totalHornosCant : null;
        row[H['% uds. archivo']] = totalArchivoCant ? cant / totalArchivoCant : null;
        row[H['% $ hornos']] = totalHornosFact ? g.total / totalHornosFact : null;
        row[H['% $ archivo']] = totalArchivoFact ? g.total / totalArchivoFact : null;
      } else {
        row[H['% uds. hornos']] = 0;
        row[H['% uds. archivo']] = 0;
        row[H['% $ hornos']] = 0;
        row[H['% $ archivo']] = 0;
      }
      aplicarReglaPrestamo(row, H);
      var costo = row[H['Costo ARS']];
      var precioNeto = row[H['Precio neto unit.']];
      if (costo != null && precioNeto != null && cant > 0) {
        row[H['Margen $ / unidad']] = precioNeto - costo;
        row[H['Margen %']] = precioNeto ? (precioNeto - costo) / precioNeto : null;
      }
      var llegadas = facturas.map(function (h) {
        var p = h.split('/');
        return [p[2] + '-' + p[1] + '-' + p[0], row[H[h]]];
      }).filter(function (x) { return x[1]; });
      var enCamino = llegadas.reduce(function (s, x) { return s + x[1]; }, 0);
      row[H['En camino']] = enCamino || null;
      var sim = simular(row[H['Disponible']], cant > 0 ? cant / dias : 0, llegadas, b.fotoStock);
      if (sim) {
        row[H['Se agota']] = sim.agota;
        row[H['Emitir orden']] = sim.emitir;
        row[H['Fin de fabricación']] = sim.fin;
      }
      return row;
    });
    filas.sort(function (a, c) {
      var dc = (c[H['Unidades vendidas']] || 0) - (a[H['Unidades vendidas']] || 0);
      if (dc) return dc;
      var df = (c[H['Facturación c/IVA']] || 0) - (a[H['Facturación c/IVA']] || 0);
      if (df) return df;
      return String(a[H['Artículo']]).localeCompare(String(c[H['Artículo']]), 'es');
    });
    var acum = 0;
    filas.forEach(function (row, i) {
      row[H['Puesto uds.']] = i + 1;
      acum += row[H['Unidades vendidas']] || 0;
      row[H['% uds. acumulado']] = totalHornosCant ? acum / totalHornosCant : 0;
    });
    var porPlata = filas.slice().sort(function (a, c) {
      var df = (c[H['Facturación c/IVA']] || 0) - (a[H['Facturación c/IVA']] || 0);
      if (df) return df;
      return String(a[H['Artículo']]).localeCompare(String(c[H['Artículo']]), 'es');
    });
    var puestoPlata = {};
    porPlata.forEach(function (row, i) { puestoPlata[row[H['Artículo']]] = i + 1; });
    filas.forEach(function (row) { row[H['Puesto $']] = puestoPlata[row[H['Artículo']]]; });
    return { rows: filas, hasta: hasta, dias: dias, lineas: hornos.length };
  }

  function numOrNull(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function aplicarReglaPrestamo(row, H) {
    var partes = ['Disponible', 'Por ingresar', 'Pago parcial', 'Pend. despacho', 'Pago pendiente'];
    var hayStock = numOrNull(row[H['Préstamo / SR']]) != null || partes.some(function (h) {
      return numOrNull(row[H[h]]) != null;
    }) || numOrNull(row[H['Stock total']]) != null;
    if (!hayStock) return row;
    var disp = numOrNull(row[H['Disponible']]) || 0;
    var ing = numOrNull(row[H['Por ingresar']]) || 0;
    var parc = numOrNull(row[H['Pago parcial']]) || 0;
    var desp = numOrNull(row[H['Pend. despacho']]) || 0;
    var pend = numOrNull(row[H['Pago pendiente']]) || 0;
    row[H['Stock total']] = disp + ing + parc + desp + pend;
    row[H['Sin vender (uds.)']] = disp + ing;
    var ritmoMes = numOrNull(row[H['Uds. por mes']]);
    if (numOrNull(row[H['Disponible']]) == null) row[H['Meses con disponible']] = null;
    else row[H['Meses con disponible']] = ritmoMes > 0 ? disp / ritmoMes : 0;
    return row;
  }

  function filasActuales() {
    var rows = state.rows || base().rows;
    var H = {};
    base().headers.forEach(function (h, i) { H[h] = i; });
    return rows.map(function (r) { return aplicarReglaPrestamo(r.slice(), H); });
  }

  function ayudas(b) {
    var tc = (Number(b.tc) / 1000).toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    var mes = String(b.mesDias).replace('.', ',');
    var lead = b.fabricacion + b.transporte;
    var desde = fmtFecha(b.desde);
    var hasta = fmtFecha(b.hasta);
    var foto = fmtFecha(b.fotoStock);
    var prest = ' Préstamo / SR no entra: esas unidades no están para la venta.';
    return {
      'Puesto uds.': ['Orden por unidades vendidas, de mayor a menor', 'Si empatan, queda primero el de más facturación. Si siguen empatando, orden alfabético.'],
      'Puesto $': ['Orden por facturación con IVA, de mayor a menor', 'Si empatan, orden alfabético.'],
      'Unidades vendidas': ['Suma de Cantidad', 'Solo filas de tipo Hornos, en el período que arranca el ' + desde + '.'],
      'Stock total': ['Disponible + Por ingresar + Pago parcial + Pend. despacho + Pago pendiente', 'Foto del ' + foto + '.' + prest],
      'Sin vender (uds.)': ['Disponible + Por ingresar', 'Lo que todavía no se vendió y sí se puede vender.' + prest],
      'Meses con disponible': ['Disponible / Uds. por mes', 'Usa solo lo que está en Disponible.' + prest],
      '% uds. hornos': ['Unidades del artículo / unidades de todos los hornos', 'Participación dentro del tipo Hornos.'],
      '% uds. acumulado': ['Suma corrida de unidades, en el orden del puesto, / unidades de hornos', 'Al 100% ya entraron todos los hornos con ventas.'],
      '% uds. archivo': ['Unidades del artículo / unidades de todo el archivo', 'El denominador incluye lo que no es horno.'],
      'Facturación c/IVA': ['Suma de Total', 'Importe con IVA de las líneas de ese artículo.'],
      '% $ hornos': ['Facturación del artículo / facturación de todos los hornos', 'Participación en pesos, con IVA, dentro de Hornos.'],
      '% $ archivo': ['Facturación del artículo / facturación de todo el archivo', 'El denominador incluye lo que no es horno.'],
      'Neto sin IVA': ['Monto − Descuento', 'Lo cobrado sin IVA. El margen sale de este neto, no del precio con IVA.'],
      'Precio lista unit.': ['Monto / Unidades vendidas', 'Precio de lista promedio, con IVA, de lo ya vendido.'],
      'Precio neto unit.': ['Neto sin IVA / Unidades vendidas', 'Precio promedio ya cobrado, sin IVA.'],
      'Precio final unit.': ['Facturación c/IVA / Unidades vendidas', 'Precio promedio final, con IVA.'],
      'Descuento prom.': ['Descuento $ / Monto', 'Descuento promedio sobre el precio de lista.'],
      'Descuento $': ['Suma de Descuento', 'Descuento total del artículo en el período.'],
      'Uds. por mes': ['Unidades vendidas × ' + mes + ' / días del período', 'Un mes son 365,25 / 12 días. El período va del ' + desde + ' al ' + hasta + ', o hasta la última venta si es posterior.'],
      'Días por unidad': ['Días del período / Unidades vendidas', 'Cada cuántos días se vende una unidad, con el mismo período que Uds. por mes.'],
      'Uds. últ. 12 m': ['Suma de Cantidad desde el día 1 del mes, 11 meses antes del cierre', 'Si el cierre es ' + hasta + ', arranca el 1 de ese mes menos 11 meses.'],
      'Prom. mensual 12 m': ['Uds. últ. 12 m / 12', 'Promedio simple de esos doce meses, también si alguno vino en cero.'],
      'Líneas': ['Cantidad de filas de venta', 'Cada renglón del histórico cuenta una.'],
      'Comprobantes': ['Cantidad de ID_Venta distintos', 'Un mismo comprobante con varias líneas cuenta una vez.'],
      'Clientes': ['Cantidad de clientes distintos', 'Se unen los espacios de más del nombre.'],
      'Primera venta': ['Fecha de venta más antigua', 'Día de la primera línea de ese artículo.'],
      'Última venta': ['Fecha de venta más reciente', 'Día de la última línea de ese artículo.'],
      'Costo ARS': ['Costo USD × ' + tc, 'Dólar Banco Nación del archivo de importaciones. Si el costo en dólares está vacío, este queda vacío.'],
      'Margen $ / unidad': ['Precio neto unit. − Costo ARS', 'Pesos que deja cada unidad ya vendida, sin IVA. El costo es el de esta importación.'],
      'Margen %': ['Margen $ / Precio neto unit.', 'La lavavajilla con costo USD 2 no entra en «el que más deja».'],
      'En camino': ['Suma de las cinco facturas', 'Cada fecha es una factura distinta, aunque la cantidad se repita.'],
      'Se agota': ['Disponible el ' + foto + ', más cada factura, menos el ritmo diario', 'El ritmo diario es unidades vendidas / días del período.' + prest + ' Por ingresar del inventario no se vuelve a sumar: si esas unidades son las facturas, entrarían dos veces.'],
      'Emitir orden': ['Se agota − ' + lead + ' días', b.fabricacion + ' días de fabricación y ' + b.transporte + ' de transporte. ' + lead + ' días en total desde que se emite la orden hasta el puerto.'],
      'Fin de fabricación': ['Se agota − ' + b.transporte + ' días', 'Termina la fabricación y arrancan los ' + b.transporte + ' días de transporte. También es emitir la orden más ' + b.fabricacion + ' días.']
    };
  }

  function ayudaHtml(h, b) {
    var par = ayudas(b)[h];
    if (!par) return esc(h);
    var id = 'rh-help-' + h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var inner = '<p><code>' + esc(par[0]) + '</code></p><p>' + esc(par[1]) + '</p>';
    var marca = host().FornitaliaHelp
      ? host().FornitaliaHelp.inline(id, 'Ayuda: ' + h, inner)
      : '<button type="button" class="th-help th-help--inline" data-help-template="' + esc(id) + '" aria-label="' + esc('Ayuda: ' + h) + '" title="Ayuda"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></button><template id="' + esc(id) + '"><div class="th-help-rich-content">' + inner + '</div></template>';
    return '<span class="rh-th"><span>' + esc(h) + '</span>' + marca + '</span>';
  }

  function resumen(rows, diasAlerta) {
    var b = base();
    var H = {};
    b.headers.forEach(function (h, i) { H[h] = i; });
    var hoy = hoyAR();
    var alertas = rows.filter(function (r) { return enAlerta(r[H['Emitir orden']], diasAlerta, hoy); });
    var futuras = rows.filter(function (r) { return r[H['Emitir orden']] && r[H['Emitir orden']] >= hoy; });
    futuras.sort(function (a, c) { return a[H['Emitir orden']] < c[H['Emitir orden']] ? -1 : 1; });
    var proxima = futuras[0] || alertas.slice().sort(function (a, c) { return a[H['Emitir orden']] < c[H['Emitir orden']] ? -1 : 1; })[0];
    var conMargen = rows.filter(function (r) {
      return r[H['Margen $ / unidad']] != null && (r[H['Unidades vendidas']] || 0) > 0 && r[H['Costo USD']] !== 2;
    });
    var mejor = conMargen.slice().sort(function (a, c) {
      return (c[H['Margen $ / unidad']] * c[H['Unidades vendidas']]) - (a[H['Margen $ / unidad']] * a[H['Unidades vendidas']]);
    })[0];
    var fino = conMargen.slice().sort(function (a, c) { return a[H['Margen %']] - c[H['Margen %']]; })[0];
    return { alertas: alertas, proxima: proxima, mejor: mejor, fino: fino, hoy: hoy, H: H };
  }

  function celdaTexto(h, v) {
    if (v == null || v === '') return '';
    if (FECHAS[h]) return fmtFecha(v);
    if (h === 'Margen %' || h.indexOf('%') === 0 || h === 'Descuento prom.') return fmtPct(v);
    if (h === 'Uds. por mes' || h === 'Prom. mensual 12 m' || h === 'Meses con disponible') return fmtNum(v, 2);
    if (h === 'Días por unidad') return fmtNum(v, 1);
    if (h === 'Costo USD' || h === 'Costo ARS' || h === 'Margen $ / unidad' || h.indexOf('Precio') === 0 || h === 'Facturación c/IVA' || h === 'Neto sin IVA' || h === 'Descuento $') return fmtNum(v, h === 'Costo USD' ? 2 : 0);
    if (typeof v === 'number') return fmtNum(v, 0);
    return esc(v);
  }

  function icono(path) {
    return '<span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></span>';
  }

  function render() {
    var rootEl = document.getElementById('view-reposicion-hornos');
    if (!rootEl) return;
    var b = base();
    var rows = filasActuales();
    var dias = alertaDias();
    var info = resumen(rows, dias);
    var H = info.H;
    var estado = state.momentoCero
      ? 'Momento cero · la tabla del Excel al ' + fmtFecha(b.fotoStock) + '. El stock y las facturas son de esa fecha. Préstamo / SR no entra al stock: no se vende.'
      : 'Recalculado con ' + state.archivo + ' · ' + state.lineas + ' líneas de hornos. El ritmo llega hasta el ' + fmtFecha(state.hasta) + '. El stock y las facturas siguen siendo los del ' + fmtFecha(b.fotoStock) + '. Préstamo / SR no entra al stock: no se vende.';
    var banner = '';
    if (info.alertas.length) {
      banner = '<div class="rh-banner"><strong>Órdenes a mirar: faltan ' + dias + ' días o menos para emitirlas, o ya venció la fecha.</strong><ul>' +
        info.alertas.map(function (r) {
          return '<li>' + esc(r[H['Artículo']]) + ': emitir el ' + fmtFecha(r[H['Emitir orden']]) + ' (se agota el ' + fmtFecha(r[H['Se agota']]) + ')</li>';
        }).join('') + '</ul></div>';
    }
    function card(k, v, s) {
      return '<article class="rh-card"><div class="rh-k">' + k + '</div><div class="rh-v">' + v + '</div><div class="rh-s">' + s + '</div></article>';
    }
    var cards = card(
      'En alerta (T-' + dias + ')',
      String(info.alertas.length),
      info.alertas.length ? 'Hay que emitir la orden o ya pasó la fecha.' : 'Ninguna orden entra en esa ventana.'
    ) + card(
      'Próxima orden',
      info.proxima ? fmtFecha(info.proxima[H['Emitir orden']]) : '—',
      info.proxima ? esc(info.proxima[H['Artículo']]) + ' · se agota el ' + fmtFecha(info.proxima[H['Se agota']]) : 'Sin fecha de orden.'
    ) + card(
      'El que más deja',
      info.mejor ? fmtPesos(info.mejor[H['Margen $ / unidad']]) : '—',
      info.mejor ? esc(info.mejor[H['Artículo']]) + ' · ' + fmtPct(info.mejor[H['Margen %']]) + ' · ' + info.mejor[H['Unidades vendidas']] + ' u.' : ''
    ) + card(
      'Margen más fino',
      info.fino ? fmtPct(info.fino[H['Margen %']]) : '—',
      info.fino ? esc(info.fino[H['Artículo']]) + ' · ' + fmtPesos(info.fino[H['Margen $ / unidad']]) + ' por unidad' : ''
    );
    var head = b.headers.map(function (h) {
      var cls = 'rh-txt';
      if (STOCK[h]) cls = 'rh-stock';
      else if (COSTO[h]) cls = 'rh-costo';
      else if (ORDEN[h]) cls = 'rh-orden';
      if (h === 'Artículo') cls += ' rh-art';
      if (!TEXTO[h] && h !== 'Artículo') cls = cls.replace('rh-txt', '');
      return '<th class="' + cls.trim() + '">' + ayudaHtml(h, b) + '</th>';
    }).join('');
    var body = rows.map(function (r) {
      var alerta = enAlerta(r[H['Emitir orden']], dias, info.hoy);
      var tds = b.headers.map(function (h, i) {
        var cls = TEXTO[h] ? 'rh-txt' : '';
        if (h === 'Artículo') cls += ' rh-art';
        return '<td class="' + cls.trim() + '">' + celdaTexto(h, r[i]) + '</td>';
      }).join('');
      return '<tr class="' + (alerta ? 'rh-row-alerta' : '') + '">' + tds + '</tr>';
    }).join('');
    rootEl.innerHTML =
      '<div class="rh-head"><div><h1 class="rh-titulo">' +
      icono('<path d="M3 7h18"/><path d="M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2"/><path d="M4 7l1 13h14l1-13"/>').replace('btn-icon', 'vista-titulo-icon') +
      'Reposición hornos</h1><p class="rh-estado">' + estado + '</p></div>' +
      '<div class="rh-tools">' +
      '<label class="rh-alerta-dias">Avisar <input id="rh-alerta-dias" type="number" min="1" max="180" value="' + dias + '" aria-label="Días de anticipación para la alerta"> días antes de emitir la orden</label>' +
      '<button type="button" class="rh-btn" id="rh-upload">' + icono('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>') + 'Subir histórico de ventas</button>' +
      '<button type="button" class="rh-btn" id="rh-cero">' + icono('<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/>') + 'Momento cero</button>' +
      '<button type="button" class="rh-btn rh-btn-excel" id="rh-excel">' + icono('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>') + 'Exportar Excel</button>' +
      '<input id="rh-file" type="file" accept=".xlsx,.xls" hidden>' +
      '</div></div>' + banner +
      '<div class="rh-cards">' + cards + '</div>' +
      '<div class="rh-tabla-wrap"><table class="rh-tabla"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
    var inputDias = document.getElementById('rh-alerta-dias');
    if (inputDias) inputDias.addEventListener('change', function () {
      guardarAlerta(inputDias.value);
      render();
    });
    document.getElementById('rh-upload').addEventListener('click', function () {
      document.getElementById('rh-file').click();
    });
    document.getElementById('rh-file').addEventListener('change', onFile);
    document.getElementById('rh-cero').addEventListener('click', function () {
      state.rows = null;
      state.momentoCero = true;
      state.archivo = '';
      render();
    });
    document.getElementById('rh-excel').addEventListener('click', exportar);
  }

  function onFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (!host().XLSX) {
      if (host().FornitaliaMensajes) host().FornitaliaMensajes.avisar('No está disponible la librería Excel.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var wb = host().XLSX.read(reader.result, { type: 'array', cellDates: true });
        var lineas = leerWorkbook(wb);
        var out = recalcular(lineas);
        state.rows = out.rows;
        state.momentoCero = false;
        state.archivo = file.name;
        state.lineas = out.lineas;
        state.hasta = out.hasta;
        render();
      } catch (err) {
        if (host().FornitaliaMensajes) host().FornitaliaMensajes.avisar(err && err.message ? err.message : 'No se pudo leer el archivo de ventas.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function excelSerial(iso) {
    var p = String(iso).slice(0, 10).split('-').map(Number);
    return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  function exportar() {
    if (!host().XLSX) {
      if (host().FornitaliaMensajes) host().FornitaliaMensajes.avisar('No está disponible la librería Excel.');
      return;
    }
    var b = base();
    var rows = filasActuales();
    var ws = {};
    var fills = { v: '1F7A4D', s: '1F4E79', c: '8A5A32', o: '1F4E3D' };
    function kind(h) {
      if (STOCK[h] || FACTURAS[h] || h === 'En camino') return 's';
      if (COSTO[h]) return 'c';
      if (ORDEN[h]) return 'o';
      return 'v';
    }
    b.headers.forEach(function (h, c) {
      var ref = host().XLSX.utils.encode_cell({ r: 0, c: c });
      ws[ref] = {
        v: h, t: 's',
        s: { font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Calibri', sz: 9 }, fill: { fgColor: { rgb: fills[kind(h)] } }, alignment: { wrapText: true, horizontal: TEXTO[h] ? 'left' : 'right' } }
      };
    });
    rows.forEach(function (row, r) {
      b.headers.forEach(function (h, c) {
        var v = row[c];
        var ref = host().XLSX.utils.encode_cell({ r: r + 1, c: c });
        if (v == null || v === '') return;
        var cell = { v: v };
        if (FECHAS[h]) {
          cell.v = excelSerial(v);
          cell.t = 'n';
          cell.z = 'dd/mm/yyyy';
        } else if (typeof v === 'number') {
          cell.t = 'n';
          cell.z = (b.formats[c] && b.formats[c] !== 'General') ? b.formats[c] : (FACTURAS[h] || h === 'En camino' ? '#,##0' : 'General');
        } else cell.t = 's';
        ws[ref] = cell;
      });
    });
    ws['!ref'] = host().XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: b.headers.length - 1 } });
    ws['!cols'] = b.headers.map(function (h) { return { wch: h === 'Artículo' ? 36 : 16 }; });
    ws['!freeze'] = { xSplit: 4, ySplit: 1 };
    var wb = host().XLSX.utils.book_new();
    host().XLSX.utils.book_append_sheet(wb, ws, 'Rentabilidad y compra');
    var info = resumen(rows, alertaDias());
    var conclusiones = [
      ['Conclusiones'],
      [state.momentoCero ? 'Momento cero, tabla al ' + fmtFecha(b.fotoStock) + '.' : 'Recalculado con ' + state.archivo + '.'],
      ['La orden se emite ' + b.fabricacion + ' días de fabricación y ' + b.transporte + ' de transporte antes de que se agote. ' + (b.fabricacion + b.transporte) + ' días en total.'],
      ['Alerta configurada: ' + alertaDias() + ' días antes de emitir la orden. Hoy ' + fmtFecha(info.hoy) + '.'],
      info.mejor ? ['El que más deja: ' + info.mejor[info.H['Artículo']] + ' ' + fmtPesos(info.mejor[info.H['Margen $ / unidad']]) + ' (' + fmtPct(info.mejor[info.H['Margen %']]) + ').'] : ['Sin margen calculado.'],
      info.fino ? ['Margen más fino: ' + info.fino[info.H['Artículo']] + ' ' + fmtPct(info.fino[info.H['Margen %']]) + '.'] : [''],
      ['Órdenes en alerta: ' + info.alertas.map(function (r) { return r[info.H['Artículo']] + ' ' + fmtFecha(r[info.H['Emitir orden']]); }).join('; ')]
    ];
    host().XLSX.utils.book_append_sheet(wb, host().XLSX.utils.aoa_to_sheet(conclusiones), 'Conclusiones');
    host().XLSX.writeFile(wb, 'Ventas_Hornos_Analisis.xlsx', { cellStyles: true });
  }

  function show() {
    render();
  }

  return {
    show: show,
    recalcular: recalcular,
    simular: simular,
    leerWorkbook: leerWorkbook,
    normalizarLinea: normalizarLinea,
    hoyAR: hoyAR,
    alertaDias: alertaDias
  };
});
