/**
 * Reposición de hornos. Momento cero = inventario al 13/11/2026.
 * Las fechas de entrega solo dicen cuándo ese inventario llega a puerto.
 * Un upload de Ventas recalcula stock (descuenta lo vendido después de la foto),
 * ritmo y la fecha de la orden. La orden es 30 días de fabricación + 60 de transporte.
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

  var ESTADOS_STOCK = ['Disponible', 'Préstamo / SR', 'Por ingresar', 'Pago parcial', 'Pend. despacho', 'Pago pendiente'];
  var FECHAS_ARRIBO = ['16/11/2026', '17/11/2026', '31/12/2026', '15/01/2027', '16/01/2027'];
  var PERM_EDITAR_COSTO = 'editar_costo_reposicion_hornos';
  var PERM_DESACTIVAR = 'desactivar_producto_reposicion_hornos';
  var opts = { client: null, hasPerm: function () { return false; } };
  var state = {
    rows: null, momentoCero: true, archivo: '', lineas: 0, hasta: '', dias: 0, bound: false,
    ventasDespues: {}, unidadesDespues: 0,
    cotizacion: null, costos: {}, bajas: {}, carga: 0,
    orden: { key: 'Puesto uds.', dir: 'asc' }
  };

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

  function init(o) {
    if (!o) return;
    if (o.client) opts.client = o.client;
    if (typeof o.hasPerm === 'function') opts.hasPerm = o.hasPerm;
  }

  function puedeEditarCosto() {
    return opts.hasPerm(PERM_EDITAR_COSTO) === true;
  }

  function puedeDesactivar() {
    return opts.hasPerm(PERM_DESACTIVAR) === true;
  }

  function enLista(art) {
    return !state.bajas || state.bajas[art] !== true;
  }

  function cotizacionEnFecha(map, hoy) {
    if (!map || !hoy) return null;
    if (Number(map[hoy]) > 0) return { tasa: Number(map[hoy]), fecha: hoy };
    var fechas = Object.keys(map).filter(function (d) { return Number(map[d]) > 0; }).sort();
    var best = null;
    for (var i = 0; i < fechas.length; i++) {
      if (fechas[i] <= hoy) best = fechas[i];
      else break;
    }
    if (!best) return null;
    return { tasa: Number(map[best]), fecha: best };
  }

  function mapaOficial(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      var f = String(r && r.fecha || '').slice(0, 10);
      var t = Number(r && r.usd_oficial);
      if (f && isFinite(t) && t > 0 && map[f] == null) map[f] = t;
    });
    return map;
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

  function numPrecio(v) {
    var n = num(v);
    if (n || v == null || typeof v === 'number') return n;
    var s = String(v).trim().replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
    return 0;
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

  function isoFactura(h) {
    var p = String(h).split('/');
    return p[2] + '-' + p[1] + '-' + p[0];
  }

  function repartirEnteros(total, pesos) {
    var n = Math.round(Number(total) || 0);
    if (!(n > 0) || !pesos.length) return pesos.map(function () { return 0; });
    var suma = 0;
    pesos.forEach(function (p) { suma += p > 0 ? p : 0; });
    if (!(suma > 0)) return pesos.map(function () { return 0; });
    var raw = pesos.map(function (p) { return n * (p > 0 ? p : 0) / suma; });
    var floors = raw.map(function (x) { return Math.floor(x + 1e-9); });
    var rest = n - floors.reduce(function (a, b) { return a + b; }, 0);
    var order = raw.map(function (x, i) { return { i: i, frac: x - floors[i] }; });
    order.sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    for (var k = 0; k < order.length && rest > 0; k++) {
      floors[order[k].i] += 1;
      rest -= 1;
    }
    return floors;
  }

  function consumir(disp, ing, ventas) {
    var d = disp;
    var g = ing;
    var v = ventas > 0 ? ventas : 0;
    var a = Math.min(Math.max(d, 0), v);
    d -= a;
    v -= a;
    var b = Math.min(Math.max(g, 0), v);
    g -= b;
    v -= b;
    if (v > 0) d -= v;
    return { disp: d, ing: g, comidoIng: b };
  }

  function simular(disponible, ritmo, llegadas, foto) {
    if (!(ritmo > 0) || disponible == null || disponible === '') return null;
    var on = Number(disponible);
    var t = foto;
    if (on < -1e-9) {
      var deuda = base();
      return {
        agota: foto,
        emitir: isoAdd(foto, -(deuda.fabricacion + deuda.transporte)),
        fin: isoAdd(foto, -deuda.transporte)
      };
    }
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
      precio: numPrecio(pick(row, ['Precio', 'Precio Unitario', 'Precio Lista', 'Precio de venta'])),
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
        ids: {}, clientes: {}, primera: null, ultima: null, ult12: 0, despues: 0,
        precioVigente: null, precioFecha: ''
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
        if (l.fecha > b.fotoStock) g.despues += l.cantidad;
        var unit = l.precio > 0 ? l.precio : (l.cantidad > 0 ? l.monto / l.cantidad : 0);
        if (unit > 0 && (!g.precioFecha || l.fecha >= g.precioFecha)) {
          g.precioFecha = l.fecha || g.precioFecha;
          g.precioVigente = unit;
        }
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
    var ventasDespues = {};
    var unidadesDespues = 0;
    Object.keys(porArt).forEach(function (art) {
      var d = porArt[art].despues || 0;
      if (d) {
        ventasDespues[art] = d;
        unidadesDespues += d;
      }
    });
    var filas = Object.keys(nombres).map(function (art) {
      var src = basePorArt[art];
      var g = porArt[art];
      var row = b.headers.map(function () { return null; });
      if (src) {
        ['Disponible', 'Préstamo / SR', 'Por ingresar', 'Pago parcial', 'Pend. despacho', 'Pago pendiente', 'Stock total', 'Sin vender (uds.)', 'En inventario', 'Precio lista vigente', 'Costo USD', 'Costo ARS'].concat(FECHAS_ARRIBO).forEach(function (h) {
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
        if (g.precioVigente > 0) row[H['Precio lista vigente']] = g.precioVigente;
      } else {
        row[H['% uds. hornos']] = 0;
        row[H['% uds. archivo']] = 0;
        row[H['% $ hornos']] = 0;
        row[H['% $ archivo']] = 0;
      }
      var costo = row[H['Costo ARS']];
      var precioNeto = row[H['Precio neto unit.']];
      if (costo != null && precioNeto != null && cant > 0) {
        row[H['Margen $ / unidad']] = precioNeto - costo;
        row[H['Margen %']] = precioNeto ? (precioNeto - costo) / precioNeto : null;
      }
      return cerrarFila(row, H, dias, { ventas: ventasDespues, hasta: hasta });
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
    return {
      rows: filas, hasta: hasta, dias: dias, lineas: hornos.length,
      ventasDespues: ventasDespues, unidadesDespues: unidadesDespues
    };
  }

  function numOrNull(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function sinInventario(row, H) {
    if (row[H['En inventario']] === 'No') return true;
    return ESTADOS_STOCK.every(function (h) { return numOrNull(row[H[h]]) == null; });
  }

  function filaBase(art, H) {
    var rows = base().rows;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][H['Artículo']] === art) return rows[i];
    }
    return null;
  }

  // El inventario manda en las unidades. Cada fecha reparte Por ingresar
  // (cuándo llega a puerto) y no suma hornos de más. Las ventas posteriores
  // a la foto bajan Disponible y, si no alcanza, Por ingresar.
  function stockAlCorte(src, H, vendidas, foto, hasta) {
    var disp0 = src ? (numOrNull(src[H['Disponible']]) || 0) : 0;
    var ing0 = src ? (numOrNull(src[H['Por ingresar']]) || 0) : 0;
    var pesos = FECHAS_ARRIBO.map(function (h) { return src ? (numOrNull(src[H[h]]) || 0) : 0; });
    var hayFecha = pesos.some(function (p) { return p > 0; });
    var T = hasta && hasta > foto ? hasta : foto;
    var asignado = hayFecha ? repartirEnteros(ing0, pesos) : pesos.map(function () { return 0; });
    var disp = disp0;
    var ing = ing0;
    var futuro = [];
    if (hayFecha) {
      var arrived = 0;
      FECHAS_ARRIBO.forEach(function (h, i) {
        var q = asignado[i];
        if (!(q > 0)) return;
        var iso = isoFactura(h);
        if (iso > foto && iso <= T) arrived += q;
        else futuro.push([iso, q, h]);
      });
      disp += arrived;
      ing -= arrived;
    }
    var uso = consumir(disp, ing, vendidas);
    disp = uso.disp;
    ing = uso.ing;
    if (uso.comidoIng > 0) {
      var queda = uso.comidoIng;
      for (var i = 0; i < futuro.length && queda > 1e-9; i++) {
        var take = Math.min(futuro[i][1], queda);
        futuro[i][1] -= take;
        queda -= take;
      }
    }
    futuro = futuro.filter(function (x) { return x[1] > 1e-9; });
    var fechas = {};
    FECHAS_ARRIBO.forEach(function (h) { fechas[h] = null; });
    var enCamino = 0;
    if (hayFecha) {
      futuro.forEach(function (x) {
        fechas[x[2]] = x[1];
        enCamino += x[1];
      });
    }
    return {
      disp: disp,
      ing: hayFecha ? enCamino : (ing > 0 ? ing : 0),
      fechas: fechas,
      enCamino: enCamino > 0 ? enCamino : null,
      on: disp,
      futuro: futuro.map(function (x) { return [x[0], x[1]]; }),
      T: hayFecha ? T : T,
      sinFecha: !hayFecha
    };
  }

  function cerrarFila(row, H, dias, opts) {
    var b = base();
    var foto = b.fotoStock;
    var art = row[H['Artículo']];
    var src = filaBase(art, H);
    if (sinInventario(row, H) && !src) {
      ESTADOS_STOCK.forEach(function (h) { row[H[h]] = 0; });
      row[H['En inventario']] = 'No';
    }
    var vendidas = opts && opts.ventas && opts.ventas[art] ? opts.ventas[art] : 0;
    var hasta = opts && opts.hasta ? opts.hasta : foto;
    var pos = stockAlCorte(src, H, vendidas, foto, hasta);
    var prest = src ? (numOrNull(src[H['Préstamo / SR']]) || 0) : 0;
    var parc = src ? (numOrNull(src[H['Pago parcial']]) || 0) : 0;
    var desp = src ? (numOrNull(src[H['Pend. despacho']]) || 0) : 0;
    var pend = src ? (numOrNull(src[H['Pago pendiente']]) || 0) : 0;
    var enInventario = src && row[H['En inventario']] !== 'No' && src[H['En inventario']] !== 'No';
    if (!src || src[H['En inventario']] === 'No' || sinInventario(src, H)) {
      ESTADOS_STOCK.forEach(function (h) { row[H[h]] = 0; });
      row[H['En inventario']] = 'No';
      FECHAS_ARRIBO.forEach(function (h) { row[H[h]] = null; });
      row[H['En camino']] = null;
      pos = { on: 0, futuro: [], T: hasta && hasta > foto ? hasta : foto };
    } else {
      row[H['Disponible']] = pos.disp;
      row[H['Préstamo / SR']] = prest;
      row[H['Por ingresar']] = pos.ing;
      row[H['Pago parcial']] = parc;
      row[H['Pend. despacho']] = desp;
      row[H['Pago pendiente']] = pend;
      row[H['Stock total']] = pos.disp + pos.ing + parc + desp + pend;
      row[H['Sin vender (uds.)']] = pos.disp + pos.ing;
      row[H['En inventario']] = enInventario || src[H['En inventario']] === 'Sí' ? 'Sí' : src[H['En inventario']];
      FECHAS_ARRIBO.forEach(function (h) { row[H[h]] = pos.fechas[h]; });
      row[H['En camino']] = pos.enCamino;
      var ritmoMes = numOrNull(row[H['Uds. por mes']]);
      row[H['Meses con disponible']] = ritmoMes > 0 && pos.disp > 0 ? pos.disp / ritmoMes : 0;
    }
    var cant = numOrNull(row[H['Unidades vendidas']]) || 0;
    var on = pos.sinFecha ? (numOrNull(row[H['Disponible']]) || 0) + (numOrNull(row[H['Por ingresar']]) || 0) : pos.on;
    var sim = simular(on, cant > 0 && dias > 0 ? cant / dias : 0, pos.futuro || [], pos.T || foto);
    row[H['Se agota']] = sim ? sim.agota : null;
    row[H['Emitir orden']] = sim ? sim.emitir : null;
    row[H['Fin de fabricación']] = sim ? sim.fin : null;
    aplicarCosto(row, H, src);
    return row;
  }

  function costoEditado(art) {
    return !!(state.costos && Object.prototype.hasOwnProperty.call(state.costos, art));
  }

  function costoUsdArticulo(art, src, H) {
    if (costoEditado(art)) return state.costos[art];
    if (!src) return null;
    var v = src[H['Costo USD']];
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function aplicarCosto(row, H, src) {
    var art = row[H['Artículo']];
    var usd = costoUsdArticulo(art, src, H);
    var tasa = state.cotizacion && state.cotizacion.tasa > 0 ? state.cotizacion.tasa : null;
    var ars = null;
    if (usd != null && tasa) ars = usd * tasa;
    else if (usd != null && src && !costoEditado(art)) {
      var baseArs = Number(src[H['Costo ARS']]);
      ars = isFinite(baseArs) ? baseArs : null;
    }
    row[H['Costo USD']] = usd;
    row[H['Costo ARS']] = ars;
    var precioNeto = numOrNull(row[H['Precio neto unit.']]);
    var cant = numOrNull(row[H['Unidades vendidas']]) || 0;
    if (ars != null && precioNeto != null && cant > 0) {
      row[H['Margen $ / unidad']] = precioNeto - ars;
      row[H['Margen %']] = precioNeto ? (precioNeto - ars) / precioNeto : null;
    } else if (tasa || costoEditado(art)) {
      row[H['Margen $ / unidad']] = null;
      row[H['Margen %']] = null;
    }
  }

  function filasActuales() {
    var b = base();
    var H = {};
    b.headers.forEach(function (h, i) { H[h] = i; });
    var dias = state.dias || (isoDiff(b.desde, b.hasta) + 1);
    var opts = {
      ventas: state.momentoCero ? {} : (state.ventasDespues || {}),
      hasta: state.momentoCero ? b.fotoStock : (state.hasta || b.fotoStock)
    };
    return (state.rows || b.rows).map(function (r) { return cerrarFila(r.slice(), H, dias, opts); });
  }

  function claseAlerta(emitir, agota, dias, hoy) {
    if (agota && agota <= hoy) return 'agotado';
    if (emitir && emitir < hoy) return 'vencida';
    if (emitir && isoDiff(hoy, emitir) <= dias) return 'proxima';
    return '';
  }

  function ayudas(b) {
    var mes = String(b.mesDias).replace('.', ',');
    var lead = b.fabricacion + b.transporte;
    var desde = fmtFecha(b.desde);
    var hasta = fmtFecha(b.hasta);
    var foto = fmtFecha(b.fotoStock);
    var prest = ' Préstamo / SR no entra: esas unidades no están para la venta.';
    var out = {
      'Puesto uds.': ['Orden por unidades vendidas, de mayor a menor', 'Si empatan, queda primero el de más facturación. Si siguen empatando, orden alfabético.'],
      'Puesto $': ['Orden por facturación con IVA, de mayor a menor', 'Si empatan, orden alfabético.'],
      'Unidades vendidas': ['Suma de Cantidad', 'Solo filas de tipo Hornos, en el período que arranca el ' + desde + '.'],
      'Stock total': ['Disponible + Por ingresar + Pago parcial + Pend. despacho + Pago pendiente', 'Esas cantidades son las del inventario al ' + foto + '. Si el upload trae ventas posteriores, se descuentan de Disponible y después de Por ingresar.' + prest + ' Si el artículo no estaba en el inventario, cada estado queda en 0.'],
      'Sin vender (uds.)': ['Disponible + Por ingresar', 'Lo que todavía no se vendió y sí se puede vender, ya descontadas las ventas posteriores a la foto.' + prest],
      'Meses con disponible': ['Disponible / Uds. por mes', 'Cuántos meses de venta cubre lo que hay disponible, al ritmo actual. Si dice 3, alcanza para unos 3 meses.' + prest],
      '% uds. hornos': ['Unidades del artículo / unidades de todos los hornos', 'De cada 100 hornos vendidos, cuántos fueron este modelo. Un 20% quiere decir que 1 de cada 5 fue este.'],
      '% uds. acumulado': ['Suma corrida de unidades, en el orden del puesto, / unidades de hornos', 'Leyendo de arriba hacia abajo, qué parte de los hornos vendidos ya suman esta fila y las de arriba. Un 80% quiere decir que esos modelos concentran 8 de cada 10 unidades.'],
      '% uds. archivo': ['Unidades del artículo / unidades de todo el archivo', 'De cada 100 unidades vendidas en el archivo, hornos y lo demás, cuántas fueron este artículo. Mide el peso del modelo en toda la venta, no solo entre hornos.'],
      'Facturación c/IVA': ['Suma de Total', 'Importe con IVA de las líneas de ese artículo.'],
      '% $ hornos': ['Facturación del artículo / facturación de todos los hornos', 'De cada peso facturado en hornos, con IVA, cuánto aporta este artículo. Un 25% quiere decir que 25 centavos de cada peso de hornos salieron de este modelo.'],
      '% $ archivo': ['Facturación del artículo / facturación de todo el archivo', 'De cada peso facturado en todo el archivo, con IVA, cuánto aporta este artículo. Incluye lo que no es horno, para ver el peso del modelo en la venta total.'],
      'Neto sin IVA': ['Monto − Descuento', 'Lo cobrado sin IVA. El margen sale de este neto, no del precio con IVA.'],
      'Precio lista vigente': ['Precio de lista de la venta más reciente, con IVA', 'Lo trae el archivo de ventas del sistema. Si esa venta viene con otro precio, este número cambia. Si el artículo no tiene una venta con precio, queda el de la foto del ' + foto + '.'],
      'Precio lista unit.': ['Monto / Unidades vendidas', 'Precio de lista promedio, con IVA, de lo ya vendido.'],
      'Precio neto unit.': ['Neto sin IVA / Unidades vendidas', 'Precio promedio ya cobrado, sin IVA.'],
      'Precio final unit.': ['Facturación c/IVA / Unidades vendidas', 'Precio promedio final, con IVA.'],
      'Descuento prom.': ['Descuento $ / Monto', 'De cada peso de precio de lista, cuánto se descontó. Un 10% quiere decir que se bajaron 10 centavos.'],
      'Descuento $': ['Suma de Descuento', 'Descuento total del artículo en el período.'],
      'Uds. por mes': ['Unidades vendidas × ' + mes + ' / días del período', 'Cuántas unidades salen en un mes, al ritmo de este período. Un mes son 365,25 / 12 días. El período va del ' + desde + ' al ' + hasta + ', o hasta la última venta si es posterior.'],
      'Días por unidad': ['Días del período / Unidades vendidas', 'Cada cuántos días se vende una unidad, al ritmo de este período. Si dice 15, se vende una unidad cada 15 días.'],
      'Uds. últ. 12 m': ['Suma de Cantidad desde el día 1 del mes, 11 meses antes del cierre', 'Si el cierre es ' + hasta + ', arranca el 1 de ese mes menos 11 meses.'],
      'Prom. mensual 12 m': ['Uds. últ. 12 m / 12', 'Cuántas unidades por mes salieron en el último año. Cuenta también los meses en cero.'],
      'Líneas': ['Cantidad de filas de venta', 'Cada renglón del histórico cuenta una.'],
      'Comprobantes': ['Cantidad de ID_Venta distintos', 'Un mismo comprobante con varias líneas cuenta una vez.'],
      'Clientes': ['Cantidad de clientes distintos', 'Se unen los espacios de más del nombre.'],
      'Primera venta': ['Fecha de venta más antigua', 'Día de la primera línea de ese artículo.'],
      'Última venta': ['Fecha de venta más reciente', 'Día de la última línea de ese artículo.'],
      'Costo USD': ['Costo unitario en dólares', 'Sale de la foto del ' + foto + '. Con el permiso de Seguridad, el lápiz al final de la fila lo actualiza. El costo en pesos y el margen se recalculan con el dólar oficial.'],
      'Costo ARS': ['Costo USD × dólar oficial de hoy', (state.cotizacion && state.cotizacion.tasa > 0 ? 'Hoy ' + fmtNum(state.cotizacion.tasa, 2) + (state.cotizacion.fecha && state.cotizacion.fecha !== hoyAR() ? ' del ' + fmtFecha(state.cotizacion.fecha) : '') + '. ' : 'Si hoy no tiene cotización, se usa la inmediata anterior. ') + 'Es la misma serie que el dólar oficial del Flujo. Sin cotización, queda el costo en pesos de la foto.'],
      'Margen $ / unidad': ['Precio neto unit. − Costo ARS', 'Pesos que deja cada unidad ya vendida, sin IVA, después de reponerla.'],
      'Margen %': ['Margen $ / Precio neto unit.', 'De cada peso cobrado sin IVA, la parte que queda después del costo de reponer el horno. Un 60% quiere decir que quedan 60 centavos.'],
      'En camino': ['Por ingresar que todavía no llegó a puerto', 'Es el mismo número del inventario, no una suma aparte. Las fechas solo dicen el día de arribo.'],
      'Se agota': ['Disponible, más Por ingresar el día que llega a puerto, menos el ritmo diario', 'El ritmo es unidades vendidas / días del período. Si se vende más rápido, esta fecha se adelanta; si se vende más lento, se corre.' + prest + ' Las fechas no agregan hornos: ya están en el inventario.'],
      'Emitir orden': ['Se agota − ' + lead + ' días', b.fabricacion + ' días de fabricación y ' + b.transporte + ' de transporte. ' + lead + ' días en total desde que se emite la orden hasta el puerto. Se adelanta o se demora con el ritmo de cada upload.'],
      'Fin de fabricación': ['Se agota − ' + b.transporte + ' días', 'Termina la fabricación y arrancan los ' + b.transporte + ' días de transporte. También es emitir la orden más ' + b.fabricacion + ' días.']
    };
    FECHAS_ARRIBO.forEach(function (h) {
      out[h] = ['Día de arribo a puerto argentino', 'Reparte las unidades de Por ingresar. No es stock de más: esos hornos ya están en el inventario.'];
    });
    return out;
  }

  function ayudaIcono(h, b) {
    var par = ayudas(b)[h];
    if (!par) return '';
    var id = 'rh-help-' + h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var inner = '<p><code>' + esc(par[0]) + '</code></p><p>' + esc(par[1]) + '</p>';
    if (host().FornitaliaHelp) return host().FornitaliaHelp.inline(id, 'Ayuda: ' + h, inner);
    return '<button type="button" class="th-help th-help--inline" data-help-template="' + esc(id) + '" aria-label="' + esc('Ayuda: ' + h) + '" title="Ayuda"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></button><template id="' + esc(id) + '"><div class="th-help-rich-content">' + inner + '</div></template>';
  }

  function celdaVacia(v) {
    return v == null || v === '' || (typeof v === 'number' && !isFinite(v));
  }

  function cmpCelda(a, c, dir) {
    var va = celdaVacia(a);
    var vc = celdaVacia(c);
    if (va && vc) return 0;
    if (va) return 1;
    if (vc) return -1;
    var r = 0;
    if (typeof a === 'number' && typeof c === 'number') r = a - c;
    else r = String(a).localeCompare(String(c), 'es', { numeric: true, sensitivity: 'base' });
    return dir === 'desc' ? -r : r;
  }

  function ordenarFilas(rows, H) {
    var key = state.orden && state.orden.key;
    if (!key || H[key] == null) return rows;
    var dir = state.orden.dir === 'desc' ? 'desc' : 'asc';
    var i = H[key];
    return rows.map(function (r, n) { return { r: r, n: n }; }).sort(function (a, c) {
      var cmp = cmpCelda(a.r[i], c.r[i], dir);
      return cmp || (a.n - c.n);
    }).map(function (x) { return x.r; });
  }

  function alternarOrden(col) {
    if (!col) return;
    if (state.orden.key === col) state.orden.dir = state.orden.dir === 'asc' ? 'desc' : 'asc';
    else {
      state.orden.key = col;
      state.orden.dir = (TEXTO[col] || FECHAS[col]) ? 'asc' : 'desc';
    }
    render();
  }

  function botonOrden(h) {
    var activo = state.orden && state.orden.key === h;
    var dir = activo ? state.orden.dir : '';
    var flecha = !activo ? '↕' : (dir === 'asc' ? '▲' : '▼');
    var sentido = !activo ? 'sin ordenar' : (dir === 'asc' ? 'ascendente' : 'descendente');
    return '<button type="button" class="rh-sort' + (activo ? ' rh-sort-activo' : '') + '" data-col="' + esc(h) + '" title="Ordenar ' + esc(h) + ' (' + sentido + ')" aria-label="Ordenar por ' + esc(h) + ', ' + sentido + '"><span>' + esc(h) + '</span><span class="rh-sort-ind" aria-hidden="true">' + flecha + '</span></button>';
  }

  function resumen(rows, diasAlerta) {
    var b = base();
    var H = {};
    b.headers.forEach(function (h, i) { H[h] = i; });
    var hoy = hoyAR();
    function ordenar(lista, campo) {
      return lista.slice().sort(function (a, c) { return a[H[campo]] < c[H[campo]] ? -1 : 1; });
    }
    var agotados = [];
    var vencidas = [];
    var proximas = [];
    rows.forEach(function (r) {
      var clase = claseAlerta(r[H['Emitir orden']], r[H['Se agota']], diasAlerta, hoy);
      if (clase === 'agotado') agotados.push(r);
      else if (clase === 'vencida') vencidas.push(r);
      else if (clase === 'proxima') proximas.push(r);
    });
    agotados = ordenar(agotados, 'Se agota');
    vencidas = ordenar(vencidas, 'Emitir orden');
    proximas = ordenar(proximas, 'Emitir orden');
    var futuras = rows.filter(function (r) { return r[H['Emitir orden']] && r[H['Emitir orden']] >= hoy; });
    futuras.sort(function (a, c) { return a[H['Emitir orden']] < c[H['Emitir orden']] ? -1 : 1; });
    var proxima = futuras[0];
    var conMargen = rows.filter(function (r) {
      return r[H['Margen $ / unidad']] != null && (r[H['Unidades vendidas']] || 0) > 0 && r[H['Costo USD']] !== 2;
    });
    var mejor = conMargen.slice().sort(function (a, c) {
      return (c[H['Margen $ / unidad']] * c[H['Unidades vendidas']]) - (a[H['Margen $ / unidad']] * a[H['Unidades vendidas']]);
    })[0];
    var fino = conMargen.slice().sort(function (a, c) { return a[H['Margen %']] - c[H['Margen %']]; })[0];
    return { agotados: agotados, vencidas: vencidas, proximas: proximas, proxima: proxima, mejor: mejor, fino: fino, hoy: hoy, H: H };
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
    var partes = partirFilas();
    var rows = partes.rows;
    var dias = alertaDias();
    var info = resumen(rows, dias);
    var H = info.H;
    var vendidasTxt = state.unidadesDespues
      ? ' Descuenta ' + fmtNum(state.unidadesDespues, 0) + ' unidades vendidas después de esa fecha.'
      : ' No hay ventas posteriores a esa fecha.';
    var oficialTxt = textoOficial();
    var estado = state.momentoCero
      ? 'Momento cero · inventario al ' + fmtFecha(b.fotoStock) + '. ' + oficialTxt + ' Las fechas de entrega dicen cuándo llega a puerto lo que ya está en Por ingresar; no suman unidades. Préstamo / SR no se vende.'
      : 'Recalculado con ' + esc(state.archivo) + ' · ' + state.lineas + ' líneas de hornos. El ritmo llega hasta el ' + fmtFecha(state.hasta) + '. El stock parte del inventario al ' + fmtFecha(b.fotoStock) + '.' + vendidasTxt + ' ' + oficialTxt + ' La fecha de orden se adelanta o se corre según ese ritmo. Préstamo / SR no se vende.';
    function itemAlerta(r, tipo) {
      var art = esc(r[H['Artículo']]);
      var emitir = fmtFecha(r[H['Emitir orden']]);
      var agota = fmtFecha(r[H['Se agota']]);
      if (tipo === 'agotado') return '<li>' + art + ': ya no hay stock desde el ' + agota + '. La orden era el ' + emitir + '.</li>';
      if (tipo === 'vencida') return '<li>' + art + ': la orden era el ' + emitir + ' y esa fecha ya pasó. Se agota el ' + agota + '.</li>';
      return '<li>' + art + ': emitir el ' + emitir + ' (faltan ' + isoDiff(info.hoy, r[H['Emitir orden']]) + ' días). Se agota el ' + agota + '.</li>';
    }
    function bloque(tipo, titulo, lista) {
      if (!lista.length) return '';
      return '<div class="rh-banner rh-banner-' + tipo + '"><strong>' + titulo + '</strong><ul>' +
        lista.map(function (r) { return itemAlerta(r, tipo); }).join('') + '</ul></div>';
    }
    var banner = bloque('agotado', 'Ya agotados', info.agotados) +
      bloque('vencida', 'La fecha de la orden ya pasó', info.vencidas) +
      bloque('proxima', 'Faltan ' + dias + ' días o menos para emitir la orden', info.proximas);
    function card(k, v, s) {
      return '<article class="rh-card"><div class="rh-k">' + k + '</div><div class="rh-v">' + v + '</div><div class="rh-s">' + s + '</div></article>';
    }
    var enAlertaN = info.agotados.length + info.vencidas.length + info.proximas.length;
    var cards = card(
      'En alerta (T-' + dias + ')',
      String(enAlertaN),
      enAlertaN ? info.agotados.length + ' ya agotados · ' + info.vencidas.length + ' con la orden vencida · ' + info.proximas.length + ' dentro de los ' + dias + ' días' : 'Ninguna orden entra en esa ventana.'
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
    var filasTabla = ordenarFilas(rows, H);
    var head = b.headers.map(function (h) {
      var cls = 'rh-txt';
      if (STOCK[h]) cls = 'rh-stock';
      else if (COSTO[h]) cls = 'rh-costo';
      else if (ORDEN[h]) cls = 'rh-orden';
      if (h === 'Artículo') cls += ' rh-art';
      if (!TEXTO[h] && h !== 'Artículo') cls = cls.replace('rh-txt', '');
      var activo = state.orden && state.orden.key === h;
      var aria = !activo ? 'none' : (state.orden.dir === 'asc' ? 'ascending' : 'descending');
      return '<th class="' + cls.trim() + '" aria-sort="' + aria + '"><span class="rh-th">' + botonOrden(h) + ayudaIcono(h, b) + '</span></th>';
    }).join('');
    var hayAcciones = puedeEditarCosto() || puedeDesactivar();
    if (hayAcciones) head += '<th class="rh-acc">Acciones</th>';
    var body = filasTabla.map(function (r) {
      var alerta = claseAlerta(r[H['Emitir orden']], r[H['Se agota']], dias, info.hoy);
      var art = r[H['Artículo']];
      var tds = b.headers.map(function (h, i) {
        var cls = TEXTO[h] ? 'rh-txt' : '';
        if (h === 'Artículo') cls += ' rh-art';
        return '<td class="' + cls.trim() + '">' + celdaTexto(h, r[i]) + '</td>';
      }).join('');
      if (hayAcciones) tds += '<td class="rh-acc"><span class="rh-acc-btns">' + iconosFila(art, true) + '</span></td>';
      return '<tr class="' + (alerta ? 'rh-row-' + alerta : '') + '">' + tds + '</tr>';
    }).join('');
    var wrapPrevio = rootEl.querySelector('.rh-tabla-wrap');
    var scrollTop = wrapPrevio ? wrapPrevio.scrollTop : 0;
    var scrollLeft = wrapPrevio ? wrapPrevio.scrollLeft : 0;
    rootEl.innerHTML =
      '<div class="rh-head"><div><h1 class="rh-titulo">' +
      icono('<path d="M3 7h18"/><path d="M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2"/><path d="M4 7l1 13h14l1-13"/>').replace('btn-icon', 'vista-titulo-icon') +
      'Reposición hornos</h1>' + htmlTc() + '<p class="rh-estado">' + estado + '</p></div>' +
      '<div class="rh-tools">' +
      '<label class="rh-alerta-dias">Avisar <input id="rh-alerta-dias" type="number" min="1" max="180" value="' + dias + '" aria-label="Días de anticipación para la alerta"> días antes de emitir la orden</label>' +
      '<button type="button" class="rh-btn" id="rh-upload">' + icono('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>') + 'Subir histórico de ventas</button>' +
      '<button type="button" class="rh-btn" id="rh-cero">' + icono('<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/>') + 'Momento cero</button>' +
      '<button type="button" class="rh-btn rh-btn-excel" id="rh-excel">' + icono('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>') + 'Exportar Excel</button>' +
      '<input id="rh-file" type="file" accept=".xlsx,.xls" hidden>' +
      '</div></div>' + banner +
      '<div class="rh-cards">' + cards + '</div>' +
      '<div class="rh-tabla-wrap"><table class="rh-tabla"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      htmlFuera(partes.fuera, H) +
      htmlModalCosto();
    var wrapNuevo = rootEl.querySelector('.rh-tabla-wrap');
    if (wrapNuevo) {
      wrapNuevo.scrollTop = scrollTop;
      wrapNuevo.scrollLeft = scrollLeft;
    }
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
      state.dias = 0;
      state.ventasDespues = {};
      state.unidadesDespues = 0;
      state.hasta = '';
      render();
    });
    document.getElementById('rh-excel').addEventListener('click', exportar);
    rootEl.querySelectorAll('.rh-sort').forEach(function (btn) {
      btn.addEventListener('click', function () { alternarOrden(btn.getAttribute('data-col')); });
    });
    rootEl.querySelectorAll('[data-rh-acc]').forEach(function (btn) {
      btn.addEventListener('click', function () { accionFila(btn); });
    });
    var form = document.getElementById('rh-costo-form');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var art = form.getAttribute('data-art');
        var input = document.getElementById('rh-costo-valor');
        guardarCostoValor(art, input ? input.value : '');
      });
      document.getElementById('rh-costo-cancel').addEventListener('click', cerrarModalCosto);
      document.getElementById('rh-costo-foto').addEventListener('click', function () {
        guardarCostoValor(form.getAttribute('data-art'), '');
      });
      document.getElementById('rh-costo-modal').addEventListener('click', function (ev) {
        if (ev.target.id === 'rh-costo-modal') cerrarModalCosto();
      });
      form.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          cerrarModalCosto();
        }
      });
    }
  }

  function iconosFila(art, enLaLista) {
    var out = '';
    if (enLaLista && puedeEditarCosto()) {
      out += botonAccion('editar', art, 'Editar costo en dólares', '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>');
    }
    if (puedeDesactivar()) {
      out += enLaLista
        ? botonAccion('sacar', art, 'Sacar de la lista', '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>')
        : botonAccion('volver', art, 'Volver a la lista', '<path d="M20 6L9 17l-5-5"/>');
    }
    return out;
  }

  function botonAccion(accion, art, titulo, path) {
    return '<button type="button" class="rh-btn rh-btn-icon" data-rh-acc="' + accion + '" data-art="' + esc(art) + '" title="' + titulo + '" aria-label="' + titulo + ': ' + esc(art) + '">' + icono(path) + '</button>';
  }

  function accionFila(btn) {
    var art = btn.getAttribute('data-art');
    var accion = btn.getAttribute('data-rh-acc');
    if (accion === 'editar') abrirModalCosto(art);
    else if (accion === 'sacar') cambiarLista(art, true);
    else if (accion === 'volver') cambiarLista(art, false);
  }

  function htmlModalCosto() {
    if (!puedeEditarCosto()) return '';
    return '<div class="rh-modal" id="rh-costo-modal" hidden>' +
      '<form class="rh-modal-card" id="rh-costo-form">' +
      '<h2>Costo unitario en dólares</h2>' +
      '<p id="rh-costo-art"></p>' +
      '<label class="rh-modal-label">Costo USD<input id="rh-costo-valor" class="rh-costo-input" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Costo unitario en dólares"></label>' +
      '<div class="rh-modal-actions">' +
      '<button type="submit" class="rh-btn">' + icono('<path d="M20 6L9 17l-5-5"/>') + 'Guardar</button>' +
      '<button type="button" class="rh-btn" id="rh-costo-cancel">' + icono('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>') + 'Cancelar</button>' +
      '<button type="button" class="rh-btn" id="rh-costo-foto">' + icono('<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/>') + 'Volver a la foto</button>' +
      '</div></form></div>';
  }

  function abrirModalCosto(art) {
    var modal = document.getElementById('rh-costo-modal');
    var form = document.getElementById('rh-costo-form');
    var input = document.getElementById('rh-costo-valor');
    var titulo = document.getElementById('rh-costo-art');
    var foto = document.getElementById('rh-costo-foto');
    if (!modal || !form || !input) return;
    var b = base();
    var iArt = b.headers.indexOf('Artículo');
    var iUsd = b.headers.indexOf('Costo USD');
    var fila = null;
    filasActuales().forEach(function (r) { if (r[iArt] === art) fila = r; });
    form.setAttribute('data-art', art);
    if (titulo) titulo.textContent = art;
    input.value = fila && fila[iUsd] != null && fila[iUsd] !== '' ? String(fila[iUsd]) : '';
    if (foto) foto.hidden = !costoEditado(art);
    modal.hidden = false;
    input.focus();
  }

  function cerrarModalCosto() {
    var modal = document.getElementById('rh-costo-modal');
    if (modal) modal.hidden = true;
  }

  function htmlFuera(fuera, H) {
    if (!fuera.length) return '';
    var items = fuera.map(function (r) {
      var art = r[H['Artículo']];
      var btn = puedeDesactivar() ? iconosFila(art, false) : '';
      return '<li><span>' + esc(art) + '</span><span class="rh-acc-btns">' + btn + '</span></li>';
    }).join('');
    return '<section class="rh-bajas"><h2>Fuera de la lista</h2><p>Estos productos no entran en las alertas ni en las tarjetas.</p><ul>' + items + '</ul></section>';
  }

  function partirFilas() {
    var b = base();
    var iArt = b.headers.indexOf('Artículo');
    var rows = [];
    var fuera = [];
    filasActuales().forEach(function (r) {
      if (enLista(r[iArt])) rows.push(r);
      else fuera.push(r);
    });
    return { rows: rows, fuera: fuera };
  }

  function textoOficial() {
    var c = state.cotizacion;
    if (!c || !(c.tasa > 0)) return 'Sin cotización del dólar oficial.';
    var txt = 'Dólar oficial ' + fmtNum(c.tasa, 2);
    if (c.fecha && c.fecha !== hoyAR()) txt += ' del ' + fmtFecha(c.fecha);
    else txt += ' de hoy';
    return txt + '.';
  }

  function htmlTc() {
    var c = state.cotizacion;
    if (!c || !(c.tasa > 0)) return '<p class="rh-tc" id="rh-tc">Dólar oficial: sin cotización</p>';
    var cuando = c.fecha && c.fecha !== hoyAR() ? 'del ' + fmtFecha(c.fecha) : 'hoy';
    return '<p class="rh-tc" id="rh-tc">Dólar oficial ' + cuando + ': <strong>' + fmtNum(c.tasa, 2) + '</strong></p>';
  }

  function client() {
    return opts.client || null;
  }

  async function cargarOficial() {
    var rows = [];
    var globalTc = host().FornitaliaTipoCambioGlobal;
    if (globalTc && typeof globalTc.listar === 'function') {
      try { rows = await globalTc.listar(); } catch (e) { rows = []; }
    }
    if (!rows.length && client()) {
      var offset = 0;
      var all = [];
      for (;;) {
        var res = await client().from('tipo_de_cambio')
          .select('fecha, usd_oficial')
          .order('fecha', { ascending: true })
          .range(offset, offset + 999);
        if (res.error) break;
        var chunk = res.data || [];
        all = all.concat(chunk);
        if (chunk.length < 1000) break;
        offset += 1000;
      }
      rows = all;
    }
    state.cotizacion = cotizacionEnFecha(mapaOficial(rows), hoyAR());
  }

  async function cargarCostos() {
    if (!client()) return;
    var res = await client().from('reposicion_horno_costo').select('articulo, costo_usd');
    if (res.error) return;
    var map = {};
    (res.data || []).forEach(function (r) {
      var art = String(r.articulo || '').trim();
      if (!art) return;
      if (r.costo_usd == null || r.costo_usd === '') return;
      var n = Number(r.costo_usd);
      if (isFinite(n)) map[art] = n;
    });
    state.costos = map;
  }

  function avisar(msg) {
    if (host().FornitaliaMensajes) host().FornitaliaMensajes.avisar(msg);
  }

  async function guardarCostoValor(art, crudo) {
    if (!art) return;
    if (!puedeEditarCosto()) return;
    if (!client()) {
      avisar('No se puede guardar el costo desde acá.');
      return;
    }
    var leido = leerImporte(crudo);
    if (!leido.ok) {
      avisar('El costo en dólares tiene que ser un número mayor o igual a cero.');
      return;
    }
    var res;
    if (leido.n == null) {
      res = await client().from('reposicion_horno_costo').delete().eq('articulo', art);
      if (!res.error) delete state.costos[art];
    } else {
      res = await client().from('reposicion_horno_costo').upsert({ articulo: art, costo_usd: leido.n });
      if (!res.error) state.costos[art] = leido.n;
    }
    if (res.error) {
      avisar(mensajeTabla(res.error, 'reposicion_horno_costo', 'Este perfil no tiene permiso para editar el costo en dólares.'));
      return;
    }
    render();
  }

  async function cambiarLista(art, sacar) {
    if (!art || !puedeDesactivar()) return;
    if (!client()) {
      avisar('No se puede actualizar la lista desde acá.');
      return;
    }
    var ok = true;
    if (host().FornitaliaMensajes) {
      ok = await host().FornitaliaMensajes.confirmar(
        sacar
          ? '¿Sacar ' + art + ' de la lista? Deja de entrar en las alertas y en las tarjetas.'
          : '¿Volver a mostrar ' + art + ' en la lista?',
        { titulo: sacar ? 'Sacar de la lista' : 'Volver a la lista', aceptar: sacar ? 'Sacar' : 'Volver', peligro: !!sacar }
      );
    }
    if (!ok) return;
    var res = sacar
      ? await client().from('reposicion_horno_baja').upsert({ articulo: art })
      : await client().from('reposicion_horno_baja').delete().eq('articulo', art);
    if (res.error) {
      avisar(mensajeTabla(res.error, 'reposicion_horno_baja', 'Este perfil no tiene permiso para sacar productos de la lista.'));
      return;
    }
    if (sacar) state.bajas[art] = true;
    else delete state.bajas[art];
    render();
  }

  function leerImporte(crudo) {
    var s = String(crudo || '').trim();
    if (!s) return { ok: true, n: null };
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
    var n = Number(s);
    if (!isFinite(n) || n < 0) return { ok: false, n: null };
    return { ok: true, n: n };
  }

  function mensajeTabla(error, tabla, sinPermiso) {
    var m = (error && error.message) || 'No se pudo guardar.';
    if (new RegExp(tabla + '|schema cache|does not exist|relation', 'i').test(m)) {
      return 'Falta preparar la lista en el servidor. Corré sql/supabase_reposicion_horno_baja.sql.';
    }
    if (/permission|policy|row-level|42501/i.test(m)) return sinPermiso;
    return m;
  }

  async function cargarBajas() {
    if (!client()) return;
    var res = await client().from('reposicion_horno_baja').select('articulo');
    if (res.error) return;
    var map = {};
    (res.data || []).forEach(function (r) {
      var art = String(r.articulo || '').trim();
      if (art) map[art] = true;
    });
    state.bajas = map;
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
        state.dias = out.dias;
        state.ventasDespues = out.ventasDespues || {};
        state.unidadesDespues = out.unidadesDespues || 0;
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
    var partes = partirFilas();
    var map = {};
    b.headers.forEach(function (h, i) { map[h] = i; });
    var rows = ordenarFilas(partes.rows, map);
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
      ['El stock es el inventario al ' + fmtFecha(b.fotoStock) + '. Las fechas de entrega solo ubican el arribo a puerto y no suman unidades. Cada upload descuenta las ventas posteriores y mueve la orden con el ritmo.'],
      [textoOficial() + ' El costo en pesos es el costo en dólares por esa cotización.'],
      ['Alerta configurada: ' + alertaDias() + ' días antes de emitir la orden. Hoy ' + fmtFecha(info.hoy) + '.'],
      info.mejor ? ['El que más deja: ' + info.mejor[info.H['Artículo']] + ' ' + fmtPesos(info.mejor[info.H['Margen $ / unidad']]) + ' (' + fmtPct(info.mejor[info.H['Margen %']]) + ').'] : ['Sin margen calculado.'],
      info.fino ? ['Margen más fino: ' + info.fino[info.H['Artículo']] + ' ' + fmtPct(info.fino[info.H['Margen %']]) + '.'] : [''],
      ['Ya agotados: ' + info.agotados.map(function (r) { return r[info.H['Artículo']]; }).join('; ')],
      ['Orden vencida: ' + info.vencidas.map(function (r) { return r[info.H['Artículo']] + ' ' + fmtFecha(r[info.H['Emitir orden']]); }).join('; ')],
      ['Por emitir: ' + info.proximas.map(function (r) { return r[info.H['Artículo']] + ' ' + fmtFecha(r[info.H['Emitir orden']]); }).join('; ')],
      ['Fuera de la lista: ' + partes.fuera.map(function (r) { return r[info.H['Artículo']]; }).join('; ')]
    ];
    host().XLSX.utils.book_append_sheet(wb, host().XLSX.utils.aoa_to_sheet(conclusiones), 'Conclusiones');
    host().XLSX.writeFile(wb, 'Ventas_Hornos_Analisis.xlsx', { cellStyles: true });
  }

  function show() {
    var token = ++state.carga;
    render();
    Promise.all([cargarOficial(), cargarCostos(), cargarBajas()]).then(function () {
      if (token !== state.carga) return;
      render();
    }).catch(function () {
      if (token !== state.carga) return;
      render();
    });
  }

  return {
    init: init,
    show: show,
    recalcular: recalcular,
    simular: simular,
    leerWorkbook: leerWorkbook,
    normalizarLinea: normalizarLinea,
    hoyAR: hoyAR,
    alertaDias: alertaDias,
    tabla: filasActuales,
    cotizacionEnFecha: cotizacionEnFecha,
    usarCotizacion: function (c) { state.cotizacion = c; },
    usarCosto: function (art, n) {
      if (n == null) delete state.costos[art];
      else state.costos[art] = n;
    },
    usarBaja: function (art, sacar) {
      if (sacar) state.bajas[art] = true;
      else delete state.bajas[art];
    },
    enLista: enLista
  };
});
