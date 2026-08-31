/**
 * Gestión de Proyectos / Planes de trabajo – Fornitalia
 * Componente aparte: no ampliar el JS embebido del dashboard.
 * window.FornitaliaGestionProyectos.init({ client, hasPerm, getRoot })
 */
(function (global) {
  'use strict';

  var ZONA_AR = 'America/Argentina/Buenos_Aires';
  var LS_PROY = 'fornitalia_gp_proyecto_id';
  var LS_SOLO = 'fornitalia_gp_solo_entregables';
  var LS_ORDEN = 'fornitalia_gp_orden_entregables';
  var ORDEN_MODOS = [
    { v: 'manual', l: 'Manual (↑↓)' },
    { v: 'inicio', l: 'Fecha inicio' },
    { v: 'fin', l: 'Fecha fin' },
    { v: 'nombre', l: 'Nombre' },
    { v: 'estado', l: 'Estado' }
  ];

  var ICO = {
    folder: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    gantt: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M9 4v18"/><path d="M12 13h6M12 17h4"/></svg>',
    chevronR: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    chevronU: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>',
    chevronD: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  var EST_PROY = [
    { v: 'planificado', l: 'Planificado' },
    { v: 'en_curso', l: 'En curso' },
    { v: 'pausado', l: 'Pausado' },
    { v: 'completado', l: 'Completado' },
    { v: 'cancelado', l: 'Cancelado' }
  ];
  var EST_ITEM = [
    { v: 'pendiente', l: 'Pendiente' },
    { v: 'en_curso', l: 'En curso' },
    { v: 'hecha', l: 'Hecha' },
    { v: 'cancelada', l: 'Cancelada' }
  ];

  var opts = { client: null, hasPerm: function () { return true; }, getRoot: function () { return null; } };
  var state = {
    mounted: false,
    loading: false,
    tab: 'plan',
    proyectos: [],
    selectedId: null,
    entregables: [],
    tareas: [],
    horas: [],
    horasEnt: [],
    horasProy: [],
    dependencias: [],
    catalogos: { usuarios: [], perfiles: [] },
    soloEntregables: false,
    ordenEntregables: 'inicio',
    moviendo: false,
    collapsed: {},
    modal: null
  };

  function client() { return opts.client; }
  function can(perm) { return typeof opts.hasPerm === 'function' ? opts.hasPerm(perm) : true; }
  function root() { return typeof opts.getRoot === 'function' ? opts.getRoot() : null; }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function partesYmd(ymd) {
    if (ymd == null || ymd === '') return null;
    var s = String(ymd).slice(0, 10);
    var p = s.split('-');
    if (p.length !== 3) return null;
    var y = Number(p[0]);
    var m = Number(p[1]);
    var d = Number(p[2]);
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { y: y, m: m, d: d };
  }

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

  function ymdToDate(ymd) {
    var p = partesYmd(ymd);
    if (!p) return null;
    var dt = new Date(p.y, p.m - 1, p.d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function formatFecha(ymd) {
    var p = partesYmd(ymd);
    if (!p) return '—';
    return String(p.d).padStart(2, '0') + '/' + String(p.m).padStart(2, '0') + '/' + p.y;
  }

  function formatFechaBarra(ymd) {
    var p = partesYmd(ymd);
    if (!p) return '';
    return String(p.d).padStart(2, '0') + '/' + String(p.m).padStart(2, '0') + '/' + String(p.y).slice(-2);
  }

  /** Serial Excel del día calendario (sin zona). No usar Date UTC: en Argentina corre un día. */
  function excelDate(ymd) {
    var p = partesYmd(ymd);
    if (!p) return null;
    return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  function diasEntre(a, b) {
    var da = ymdToDate(a);
    var db = ymdToDate(b);
    if (!da || !db) return 1;
    var n = Math.round((db.getTime() - da.getTime()) / 86400000) + 1;
    return Math.max(1, n);
  }

  function clampPct(n) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
  }

  function labelEstado(v, esProy) {
    var arr = esProy ? EST_PROY : EST_ITEM;
    for (var i = 0; i < arr.length; i++) if (arr[i].v === v) return arr[i].l;
    return v || '—';
  }

  function badgeHtml(estado, esProy) {
    var cls = 'gp-badge gp-badge-' + esc(estado || '');
    return '<span class="' + cls + '">' + esc(labelEstado(estado, esProy)) + '</span>';
  }

  function mapPerfiles() {
    var m = {};
    (state.catalogos.perfiles || []).forEach(function (p) { m[p.role] = p.label || p.role; });
    return m;
  }

  function usuarioById(id) {
    var list = state.catalogos.usuarios || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function inicialesDesdeEmail(email) {
    var local = String(email || '').split('@')[0].trim();
    if (!local) return '';
    var parts = local.split(/[._\-+]+/).filter(function (p) { return p.length; });
    if (parts.length >= 2) {
      return parts.slice(0, 3).map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
    }
    return local.slice(0, Math.min(2, local.length)).toUpperCase();
  }

  function usuarioCorto(u) {
    if (!u) return '';
    var n = String(u.nombre_usuario || '').trim();
    if (n) return n;
    var ini = inicialesDesdeEmail(u.email);
    if (ini) return ini;
    return String(u.email || '').trim();
  }

  function usuarioComboLabel(u) {
    if (!u) return 'Usuario';
    var corto = usuarioCorto(u);
    var em = String(u.email || '').trim();
    if (em && corto && corto !== em) return corto + ' · ' + em;
    return corto || em || 'Usuario';
  }

  function responsableMeta(row) {
    if (!row) return { label: '—', email: '' };
    if (row.responsable_tipo === 'usuario') {
      var u = usuarioById(row.responsable_user_id);
      return { label: usuarioCorto(u) || 'Usuario', email: u ? String(u.email || '').trim() : '' };
    }
    if (row.responsable_tipo === 'perfil') {
      return { label: mapPerfiles()[row.responsable_role] || row.responsable_role || '—', email: '' };
    }
    return { label: '—', email: '' };
  }

  function labelResponsable(row) {
    return responsableMeta(row).label;
  }

  function htmlResponsable(row) {
    var meta = responsableMeta(row);
    var label = meta.label || '—';
    if (meta.email) {
      return '<span class="gp-persona" title="' + esc(meta.email) + '">' + esc(label) + '</span>';
    }
    return esc(label);
  }

  function cmpTexto(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base', numeric: true });
  }

  function idxEstadoItem(est) {
    for (var i = 0; i < EST_ITEM.length; i++) if (EST_ITEM[i].v === est) return i;
    return 99;
  }

  function cmpEntregables(a, b, modo) {
    var m = modo || state.ordenEntregables || 'inicio';
    var r = 0;
    if (m === 'fin') r = cmpTexto(a.fecha_fin, b.fecha_fin);
    else if (m === 'nombre') r = cmpTexto(a.nombre, b.nombre);
    else if (m === 'estado') r = idxEstadoItem(a.estado) - idxEstadoItem(b.estado);
    else if (m === 'manual') {
      var oa = Number(a.orden);
      var ob = Number(b.orden);
      if (isNaN(oa)) oa = 0;
      if (isNaN(ob)) ob = 0;
      r = oa - ob;
    } else {
      r = cmpTexto(a.fecha_inicio, b.fecha_inicio);
    }
    if (r !== 0) return r;
    r = cmpTexto(a.fecha_inicio, b.fecha_inicio);
    if (r !== 0) return r;
    return cmpTexto(a.nombre, b.nombre);
  }

  function entregablesVista() {
    return (state.entregables || []).slice().sort(function (a, b) {
      return cmpEntregables(a, b, state.ordenEntregables);
    });
  }

  function optionsOrdenEntregables() {
    return ORDEN_MODOS.map(function (x) {
      return '<option value="' + esc(x.v) + '"' + (x.v === state.ordenEntregables ? ' selected' : '') + '>' + esc(x.l) + '</option>';
    }).join('');
  }

  function pctBar(pct, spi) {
    var cls = 'gp-pct-bar';
    if (spi != null && spi < 0.85) cls += ' atrasado';
    else if (spi != null && spi < 1) cls += ' alerta';
    var p = clampPct(pct);
    return '<div class="gp-pct-wrap"><div class="' + cls + '"><span style="width:' + p.toFixed(1) + '%"></span></div><span class="gp-pct-num">' + p.toFixed(0) + '%</span></div>';
  }

  function esperadoPct(inicio, fin) {
    var hoy = fechaHoyYmd();
    var da = ymdToDate(inicio);
    var db = ymdToDate(fin);
    var dh = ymdToDate(hoy);
    if (!da || !db || !dh) return 0;
    if (dh < da) return 0;
    if (dh > db) return 100;
    var total = diasEntre(inicio, fin);
    var elapsed = diasEntre(inicio, hoy);
    return clampPct((elapsed / total) * 100);
  }

  function spiDe(pct, inicio, fin) {
    var exp = esperadoPct(inicio, fin);
    if (exp <= 0) return pct > 0 ? 1 : 1;
    return pct / exp;
  }

  function pesoAvance(horas, inicio, fin, estado) {
    var h = Number(horas);
    if (isFinite(h) && h > 0) return h;
    var hoy = fechaHoyYmd();
    if (estado !== 'hecha' && estado !== 'en_curso' && estado !== 'completado' && inicio && inicio > hoy) {
      return 0;
    }
    return diasEntre(inicio, fin);
  }

  /** Peso del SPI / avance: horas propias (proyecto o entregable) + hijas. Sin horas, no diluye. */
  function pesoHorasSpi(horas, estado) {
    var h = Number(horas);
    if (isFinite(h) && h > 0) return h;
    if (estado === 'hecha' || estado === 'completado') return 1;
    return 0;
  }

  function progresoTarea(t) {
    if (!t || t.estado === 'cancelada') return null;
    if (t.estado === 'hecha') return 100;
    return clampPct(t.progreso_pct);
  }

  function tareasDe(entId) {
    return (state.tareas || []).filter(function (t) { return t.entregable_id === entId; });
  }
  function depsDe(entId) {
    return (state.dependencias || []).filter(function (d) { return d.entregable_id === entId; });
  }

  function progresoEntregable(e) {
    if (!e || e.estado === 'cancelada') return null;
    var ts = tareasDe(e.id).filter(function (t) { return t.estado !== 'cancelada'; });
    if (!ts.length) {
      if (e.estado === 'hecha') return 100;
      return clampPct(e.progreso_pct);
    }
    var w = 0;
    var acc = 0;
    ts.forEach(function (t) {
      var p = progresoTarea(t);
      if (p == null) return;
      var wt = pesoAvance(horasDeTarea(t), t.fecha_inicio, t.fecha_fin, t.estado);
      acc += wt * p;
      w += wt;
    });
    return w ? acc / w : 0;
  }

  function proyectoSel() {
    var id = state.selectedId;
    for (var i = 0; i < state.proyectos.length; i++) {
      if (state.proyectos[i].id === id) return state.proyectos[i];
    }
    return null;
  }

  function avanceHorasPropiasProyecto(p) {
    if (!p) return 0;
    if (p.estado === 'completado') return 100;
    if (p.estado === 'cancelado') return null;
    return clampPct(p.progreso_pct);
  }

  function progresoProyecto(p) {
    if (!p) return 0;
    var ents = state.entregables.filter(function (e) { return e.estado !== 'cancelada'; });
    var w = 0;
    var acc = 0;
    ents.forEach(function (e) {
      var pr = progresoEntregable(e);
      if (pr == null) return;
      var wt = pesoHorasSpi(horasEntregable(e), e.estado);
      if (!(wt > 0)) return;
      acc += wt * pr;
      w += wt;
    });
    var pp = avanceHorasPropiasProyecto(p);
    var wp = pp == null ? 0 : pesoHorasSpi(horasPropiasProyecto(), p.estado);
    if (wp > 0) {
      acc += wp * pp;
      w += wp;
    }
    if (w > 0) return acc / w;
    if (p.estado === 'completado') return 100;
    return clampPct(p.progreso_pct);
  }

  function spiProyecto(p) {
    if (!p) return 1;
    var ents = (state.entregables || []).filter(function (e) { return e.estado !== 'cancelada'; });
    var ev = 0;
    var pv = 0;
    ents.forEach(function (e) {
      var pr = progresoEntregable(e);
      if (pr == null) return;
      var wt = pesoHorasSpi(horasEntregable(e), e.estado);
      if (!(wt > 0)) return;
      ev += wt * pr;
      pv += wt * esperadoPct(e.fecha_inicio, e.fecha_fin);
    });
    var pp = avanceHorasPropiasProyecto(p);
    var wp = pp == null ? 0 : pesoHorasSpi(horasPropiasProyecto(), p.estado);
    if (wp > 0) {
      ev += wp * pp;
      pv += wp * esperadoPct(p.fecha_inicio, p.fecha_fin);
    }
    if (pv > 0) return ev / pv;
    return spiDe(progresoProyecto(p), p.fecha_inicio, p.fecha_fin);
  }

  function esperadoProyecto(p) {
    if (!p) return 0;
    var ents = (state.entregables || []).filter(function (e) { return e.estado !== 'cancelada'; });
    var pv = 0;
    var w = 0;
    ents.forEach(function (e) {
      if (progresoEntregable(e) == null) return;
      var wt = pesoHorasSpi(horasEntregable(e), e.estado);
      if (!(wt > 0)) return;
      pv += wt * esperadoPct(e.fecha_inicio, e.fecha_fin);
      w += wt;
    });
    var pp = avanceHorasPropiasProyecto(p);
    var wp = pp == null ? 0 : pesoHorasSpi(horasPropiasProyecto(), p.estado);
    if (wp > 0) {
      pv += wp * esperadoPct(p.fecha_inicio, p.fecha_fin);
      w += wp;
    }
    return w ? pv / w : esperadoPct(p.fecha_inicio, p.fecha_fin);
  }

  function parseHoras(val) {
    if (val == null || String(val).trim() === '') return 0;
    var n = Number(String(val).replace(',', '.'));
    if (!isFinite(n) || n < 0) return NaN;
    return Math.round(n * 100) / 100;
  }

  function horasFilasDe(tareaId) {
    return (state.horas || []).filter(function (h) { return h.tarea_id === tareaId; });
  }

  function horasFilasEntregable(entId) {
    return (state.horasEnt || []).filter(function (h) { return h.entregable_id === entId; });
  }

  function horasFilasProyecto(proyId) {
    var id = proyId || state.selectedId;
    return (state.horasProy || []).filter(function (h) { return h.proyecto_id === id; });
  }

  function horasDeTarea(t) {
    if (!t || t.estado === 'cancelada') return 0;
    var sum = 0;
    horasFilasDe(t.id).forEach(function (h) {
      var n = Number(h.horas);
      if (isFinite(n) && n > 0) sum += n;
    });
    return Math.round(sum * 100) / 100;
  }

  function horasPropiasEntregable(e) {
    if (!e || e.estado === 'cancelada') return 0;
    var sum = 0;
    horasFilasEntregable(e.id).forEach(function (h) {
      var n = Number(h.horas);
      if (isFinite(n) && n > 0) sum += n;
    });
    return Math.round(sum * 100) / 100;
  }

  function horasTareasEntregable(e) {
    if (!e) return 0;
    var sum = 0;
    tareasDe(e.id).forEach(function (t) { sum += horasDeTarea(t); });
    return Math.round(sum * 100) / 100;
  }

  function horasEntregable(e) {
    if (!e || e.estado === 'cancelada') return 0;
    return Math.round((horasPropiasEntregable(e) + horasTareasEntregable(e)) * 100) / 100;
  }

  function entregableDeTarea(t) {
    if (!t) return null;
    return findById(state.entregables, t.entregable_id);
  }

  function alertaDeadlineTarea(t, ent, filasHoras) {
    if (!t || t.estado === 'cancelada') return null;
    ent = ent || entregableDeTarea(t);
    if (!ent || ent.estado === 'cancelada' || !ent.fecha_fin) return null;
    var msgs = [];
    if (t.fecha_fin && t.fecha_fin > ent.fecha_fin) {
      msgs.push('La tarea termina el ' + formatFecha(t.fecha_fin) + ' y el entregable vence el ' + formatFecha(ent.fecha_fin) + '.');
    }
    var horas = filasHoras || horasFilasDe(t.id);
    var fuera = [];
    (horas || []).forEach(function (h) {
      if (h.fecha && h.fecha > ent.fecha_fin) fuera.push(formatFecha(h.fecha));
    });
    if (fuera.length) {
      msgs.push('Hay horas consumidas después del deadline (' + fuera.join(', ') + ').');
    }
    if (!msgs.length) return null;
    return msgs.join(' ') + ' Ajustá la fecha de la tarea, las horas o el deadline del entregable.';
  }

  function alertaDeadlineHorasEntregable(ent, filasHoras) {
    if (!ent || ent.estado === 'cancelada' || !ent.fecha_fin) return null;
    var horas = filasHoras || horasFilasEntregable(ent.id);
    var fuera = [];
    (horas || []).forEach(function (h) {
      if (h.fecha && h.fecha > ent.fecha_fin) fuera.push(formatFecha(h.fecha));
    });
    if (!fuera.length) return null;
    return 'Hay horas propias del entregable después del deadline (' + fuera.join(', ') + '). Ajustá las horas o el deadline del entregable.';
  }

  function alertaDeadlineHorasProyecto(p, filasHoras) {
    if (!p || p.estado === 'cancelado' || !p.fecha_fin) return null;
    var horas = filasHoras || horasFilasProyecto(p.id);
    var fuera = [];
    (horas || []).forEach(function (h) {
      if (h.fecha && h.fecha > p.fecha_fin) fuera.push(formatFecha(h.fecha));
    });
    if (!fuera.length) return null;
    return 'Hay horas propias del proyecto después del deadline (' + fuera.join(', ') + '). Ajustá las horas o el deadline del proyecto.';
  }

  function countDeadlineAlertas() {
    var n = 0;
    (state.tareas || []).forEach(function (t) {
      if (alertaDeadlineTarea(t)) n++;
    });
    (state.entregables || []).forEach(function (e) {
      if (alertaDeadlineHorasEntregable(e)) n++;
    });
    var p = proyectoSel();
    if (p && alertaDeadlineHorasProyecto(p)) n++;
    return n;
  }

  function htmlAlertaDeadline(msg) {
    if (!msg) return '';
    return '<span class="gp-alerta-dl" title="' + esc(msg) + '">' + ICO.warn + '</span>';
  }

  function htmlFilaHora(fecha, horas, observaciones) {
    var qty = horas != null && horas !== '' ? horas : '';
    return '<tr class="gp-hora-row">' +
      '<td><input type="date" class="gp-hora-fecha" value="' + esc(fecha || fechaHoyYmd()) + '"></td>' +
      '<td><input type="number" class="gp-hora-qty" min="0" max="9999" step="0.25" value="' + esc(qty) + '"></td>' +
      '<td><input type="text" class="gp-hora-obs" maxlength="500" placeholder="Opcional" value="' + esc(observaciones || '') + '"></td>' +
      '<td><button type="button" class="gp-btn gp-btn-ghost gp-btn-icon-only" data-gp="del-hora-row" title="Quitar fecha" aria-label="Quitar fecha"><span class="btn-icon">' + ICO.x + '</span></button></td>' +
    '</tr>';
  }

  function htmlTablaHoras(filas, hint) {
    var list = filas && filas.length ? filas : [{ fecha: fechaHoyYmd(), horas: '', observaciones: '' }];
    var txt = hint || 'Horas reales trabajadas ese día (no es alocación planificada). Calendario Argentina.';
    return '<div class="form-group full">' +
      '<label>Horas consumidas por fecha</label>' +
      '<p class="gp-field-hint">' + esc(txt) + ' En Observaciones podés anotar qué hiciste ese día.</p>' +
      '<div class="gp-horas-form-wrap"><table class="gp-horas-form">' +
        '<thead><tr><th>Fecha</th><th>Horas</th><th>Observaciones</th><th></th></tr></thead>' +
        '<tbody>' + list.map(function (f) { return htmlFilaHora(f.fecha, f.horas, f.observaciones); }).join('') + '</tbody>' +
      '</table></div>' +
      '<button type="button" class="gp-btn gp-btn-ghost" data-gp="add-hora-row"><span class="btn-icon">' + ICO.plus + '</span>Agregar fecha</button>' +
    '</div>';
  }

  function bindHorasForm(form) {
    form.addEventListener('click', function (ev) {
      var add = ev.target.closest && ev.target.closest('[data-gp="add-hora-row"]');
      if (add && form.contains(add)) {
        ev.preventDefault();
        var tbody = form.querySelector('.gp-horas-form tbody');
        if (tbody) tbody.insertAdjacentHTML('beforeend', htmlFilaHora(fechaHoyYmd(), '', ''));
        return;
      }
      var del = ev.target.closest && ev.target.closest('[data-gp="del-hora-row"]');
      if (del && form.contains(del)) {
        ev.preventDefault();
        var tr = del.closest('tr');
        var body = form.querySelector('.gp-horas-form tbody');
        if (!tr || !body) return;
        if (body.querySelectorAll('tr').length <= 1) {
          var qty = tr.querySelector('.gp-hora-qty');
          var obs = tr.querySelector('.gp-hora-obs');
          if (qty) qty.value = '';
          if (obs) obs.value = '';
          return;
        }
        body.removeChild(tr);
      }
    });
  }

  function juntarObsHora(a, b) {
    var x = String(a || '').trim();
    var y = String(b || '').trim();
    if (!x) return y;
    if (!y || x === y) return x;
    return x + '; ' + y;
  }

  function leerFilasHoras(form) {
    var map = {};
    var rows = form.querySelectorAll('.gp-hora-row');
    for (var i = 0; i < rows.length; i++) {
      var fechaEl = rows[i].querySelector('.gp-hora-fecha');
      var qtyEl = rows[i].querySelector('.gp-hora-qty');
      var obsEl = rows[i].querySelector('.gp-hora-obs');
      var fecha = fechaEl ? fechaEl.value : '';
      var raw = qtyEl ? qtyEl.value : '';
      var obs = obsEl ? String(obsEl.value || '').trim() : '';
      if (!fecha && String(raw).trim() === '' && !obs) continue;
      if (!fecha) return { error: 'Cada carga de horas necesita una fecha.', filas: [] };
      var horas = parseHoras(raw);
      if (isNaN(horas)) return { error: 'Las horas de ' + formatFecha(fecha) + ' tienen que ser un número mayor o igual a 0.', filas: [] };
      if (horas > 9999) return { error: 'Las horas no pueden superar 9999.', filas: [] };
      if (horas === 0 && !obs) continue;
      if (horas === 0) return { error: 'La fecha ' + formatFecha(fecha) + ' tiene observaciones pero 0 horas. Cargá las horas o quitá la fila.', filas: [] };
      if (!map[fecha]) map[fecha] = { horas: 0, observaciones: '' };
      map[fecha].horas += horas;
      map[fecha].observaciones = juntarObsHora(map[fecha].observaciones, obs);
    }
    var out = Object.keys(map).sort().map(function (f) {
      return {
        fecha: f,
        horas: Math.round(map[f].horas * 100) / 100,
        observaciones: map[f].observaciones || null
      };
    });
    return { error: null, filas: out };
  }

  async function guardarHorasTarea(tareaId, filas) {
    var rpc = await client().rpc('gp_guardar_horas_tarea', {
      p_tarea_id: tareaId,
      p_filas: filas || []
    });
    if (rpc.error) throw rpc.error;
  }

  async function guardarHorasEntregable(entregableId, filas) {
    var rpc = await client().rpc('gp_guardar_horas_entregable', {
      p_entregable_id: entregableId,
      p_filas: filas || []
    });
    if (rpc.error) throw rpc.error;
  }

  async function guardarHorasProyecto(proyectoId, filas) {
    var rpc = await client().rpc('gp_guardar_horas_proyecto', {
      p_proyecto_id: proyectoId,
      p_filas: filas || []
    });
    if (rpc.error) throw rpc.error;
  }

  function horasPropiasProyecto(p) {
    p = p || proyectoSel();
    if (!p || p.estado === 'cancelado') return 0;
    var sum = 0;
    horasFilasProyecto(p.id).forEach(function (h) {
      var n = Number(h.horas);
      if (isFinite(n) && n > 0) sum += n;
    });
    return Math.round(sum * 100) / 100;
  }

  function horasProyecto(p) {
    p = p || proyectoSel();
    var sum = horasPropiasProyecto(p);
    (state.entregables || []).forEach(function (e) { sum += horasEntregable(e); });
    return Math.round(sum * 100) / 100;
  }

  function formatHoras(n) {
    if (n == null || n === 0) return '—';
    return (Math.round(Number(n) * 100) / 100).toLocaleString('es-AR', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }) + ' h';
  }

  function excelHoras(n) {
    if (n == null || n === '') return null;
    var v = Number(n);
    if (!isFinite(v)) return null;
    return Number(v.toFixed(2));
  }

  var XL = {
    navy: 'FF0D2137',
    blue: 'FF0369A1',
    red: 'FFB91C1C',
    head: 'FF1E293B',
    today: 'FFDC2626',
    track: 'FFF1F5F9',
    entBg: 'FFF8FAFC',
    white: 'FFFFFFFF',
    ink: 'FF0F172A',
    muted: 'FF64748B',
    line: 'FFE2E8F0',
    note: 'FFF8FAFC'
  };

  function xlFill(rgb) {
    return { patternType: 'solid', fgColor: { rgb: rgb }, bgColor: { rgb: rgb } };
  }
  function xlFont(bold, color, sz) {
    return { name: 'Calibri', sz: sz || 11, bold: !!bold, color: { rgb: color || XL.ink } };
  }
  function xlBorder() {
    var b = { style: 'thin', color: { rgb: XL.line } };
    return { top: b, bottom: b, left: b, right: b };
  }
  function xlCell(v, style, z) {
    var cell = { s: style || {} };
    if (v instanceof Date) {
      cell.t = 'd';
      cell.v = v;
      cell.z = z || 'dd/mm/yyyy';
    } else if (typeof v === 'number' && isFinite(v)) {
      cell.t = 'n';
      cell.v = v;
      if (z) cell.z = z;
    } else if (v == null || v === '') {
      cell.t = 's';
      cell.v = '';
    } else {
      cell.t = 's';
      cell.v = String(v);
    }
    return cell;
  }
  function estiloCabeceraTabla() {
    return {
      fill: xlFill(XL.head),
      font: xlFont(true, XL.white, 10),
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: xlBorder()
    };
  }
  function estilarHojaTabla(ws, headerRow, opts) {
    if (!ws || !ws['!ref']) return;
    opts = opts || {};
    var range = XLSX.utils.decode_range(ws['!ref']);
    var r;
    var c;
    var addr;
    for (c = range.s.c; c <= range.e.c; c++) {
      addr = XLSX.utils.encode_cell({ r: headerRow, c: c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = estiloCabeceraTabla();
    }
    var tipoCol = opts.tipoCol != null ? opts.tipoCol : 1;
    var nombreCol = opts.nombreCol != null ? opts.nombreCol : 2;
    var wrapCols = opts.wrapCols || [];
    var dateCols = opts.dateCols || [];
    for (r = headerRow + 1; r <= range.e.r; r++) {
      var tipoCell = ws[XLSX.utils.encode_cell({ r: r, c: tipoCol })];
      var tipo = tipoCell && tipoCell.v;
      var esEnt = tipo === 'Entregable' || tipo === 'Proyecto';
      for (c = range.s.c; c <= range.e.c; c++) {
        addr = XLSX.utils.encode_cell({ r: r, c: c });
        if (!ws[addr]) continue;
        var cell = ws[addr];
        var bold = !!(esEnt && (c === nombreCol || c === tipoCol));
        var wrap = wrapCols.indexOf(c) >= 0;
        var esFecha = dateCols.indexOf(c) >= 0 && cell.t === 'n' && cell.v != null && cell.v !== '';
        var st = {
          font: xlFont(bold, XL.ink, 11),
          alignment: {
            vertical: 'center',
            wrapText: wrap,
            horizontal: esFecha ? 'center' : (cell.t === 'n' ? 'right' : 'left')
          },
          border: xlBorder(),
          fill: xlFill(esEnt ? XL.entBg : XL.white)
        };
        if (esFecha) cell.z = 'dd/mm/yyyy';
        cell.s = st;
      }
    }
    if (!ws['!rows']) ws['!rows'] = [];
    ws['!rows'][headerRow] = { hpt: 22 };
  }

  function periodosGanttExcel(rango) {
    var days = Math.max(1, Math.round((rango.max - rango.min) / 86400000) + 1);
    var step = days > 420 ? 30 : 7;
    var list = [];
    var cur = new Date(rango.min.getTime());
    if (step === 7) {
      cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
    } else {
      cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    }
    var guard = 0;
    while (cur <= rango.max && guard < 120) {
      guard++;
      var end;
      var label;
      if (step === 7) {
        end = new Date(cur.getTime());
        end.setDate(end.getDate() + 6);
        label = String(cur.getDate()).padStart(2, '0') + '/' + String(cur.getMonth() + 1).padStart(2, '0');
      } else {
        end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
        label = String(cur.getMonth() + 1).padStart(2, '0') + '/' + cur.getFullYear();
      }
      list.push({ start: new Date(cur.getTime()), end: end, label: label });
      if (step === 7) cur.setDate(cur.getDate() + 7);
      else cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return { step: step, list: list };
  }

  function itemsGanttExport() {
    var items = [];
    entregablesVista().forEach(function (e) {
      if (e.estado === 'cancelada') return;
      items.push({
        tipo: 'entregable',
        nombre: e.nombre,
        inicio: e.fecha_inicio,
        fin: e.fecha_fin,
        pct: progresoEntregable(e),
        horas: horasEntregable(e)
      });
      if (state.soloEntregables) return;
      tareasDe(e.id).forEach(function (t) {
        if (t.estado === 'cancelada') return;
        items.push({
          tipo: 'tarea',
          nombre: t.nombre,
          inicio: t.fecha_inicio,
          fin: t.fecha_fin,
          pct: progresoTarea(t),
          horas: horasDeTarea(t)
        });
      });
    });
    return items.filter(function (it) { return it.inicio && it.fin; });
  }

  function hojaGanttExcel(p, k) {
    var rango = rangoPlan();
    var periodos = periodosGanttExcel(rango);
    var hoy = ymdToDate(fechaHoyYmd());
    var metaCols = 5;
    var nCols = Math.max(metaCols, metaCols + periodos.list.length);
    var estiloTitulo = {
      fill: xlFill(XL.navy),
      font: xlFont(true, XL.white, 16),
      alignment: { horizontal: 'left', vertical: 'center' }
    };
    var estiloMeta = {
      fill: xlFill(XL.note),
      font: xlFont(false, XL.muted, 10),
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
    };
    var estiloNota = {
      fill: xlFill(XL.note),
      font: xlFont(false, XL.ink, 10),
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
    };
    function filaVaciaEstilo(style) {
      var row = [];
      var i;
      for (i = 0; i < nCols; i++) row.push(xlCell(i === 0 ? '' : '', style));
      return row;
    }
    function filaTexto(texto, style) {
      var row = [xlCell(texto, style)];
      var i;
      for (i = 1; i < nCols; i++) row.push(xlCell('', style));
      return row;
    }

    var spiTxt = k.spi >= 1 ? 'En tiempo' : (k.spi >= 0.85 ? 'Atención' : 'Atrasado');
    var aoa = [];
    aoa.push(filaTexto('Plan de trabajo — ' + (p.nombre || ''), estiloTitulo));
    aoa.push(filaTexto(
      formatFecha(p.fecha_inicio) + ' → ' + formatFecha(p.fecha_fin) +
        ' · Responsable: ' + labelResponsable(p) +
        ' · ' + labelEstado(p.estado, true) +
        ' · ' + spiTxt + ' (SPI ' + k.spi.toFixed(2) + ')' +
        ' · Horas consumidas: ' + (k.horas ? formatHoras(k.horas) : '0 h'),
      estiloMeta
    ));
    aoa.push(filaTexto(
      'Horas consumidas (reales): ' + (k.horas ? formatHoras(k.horas) : '0 h') +
        '  —  No es alocación planificada: son horas realmente trabajadas, por fecha en el proyecto, el entregable y/o cada tarea.',
      estiloNota
    ));
    aoa.push(filaTexto(
      'Evolución vs calendario: real ' + k.pct.toFixed(0) + '% · esperado a hoy ' + k.esperado.toFixed(0) + '%.',
      estiloNota
    ));
    aoa.push(filaVaciaEstilo({ fill: xlFill(XL.white) }));

    var ley = [];
    ley.push(xlCell('Leyenda', { font: xlFont(true, XL.ink, 10), alignment: { vertical: 'center' } }));
    ley.push(xlCell('Entregable', {
      fill: xlFill(XL.navy), font: xlFont(true, XL.white, 10),
      alignment: { horizontal: 'center', vertical: 'center' }, border: xlBorder()
    }));
    ley.push(xlCell('Tarea', {
      fill: xlFill(XL.blue), font: xlFont(true, XL.white, 10),
      alignment: { horizontal: 'center', vertical: 'center' }, border: xlBorder()
    }));
    ley.push(xlCell('Atrasado', {
      fill: xlFill(XL.red), font: xlFont(true, XL.white, 10),
      alignment: { horizontal: 'center', vertical: 'center' }, border: xlBorder()
    }));
    ley.push(xlCell(periodos.step === 7 ? 'Semana de hoy' : 'Mes de hoy', {
      fill: xlFill(XL.today), font: xlFont(true, XL.white, 10),
      alignment: { horizontal: 'center', vertical: 'center' }, border: xlBorder()
    }));
    var li;
    for (li = 5; li < nCols; li++) ley.push(xlCell(''));
    aoa.push(ley);
    aoa.push(filaTexto(
      'Las celdas de color son la duración del ítem. Al final de la barra está la fecha fin planificada; al inicio, el % de avance. Rojo = atrasado vs calendario.',
      { font: xlFont(false, XL.muted, 9), alignment: { wrapText: true, vertical: 'center' } }
    ));

    var headStyle = estiloCabeceraTabla();
    var headRot = {
      fill: xlFill(XL.head),
      font: xlFont(true, XL.white, 8),
      alignment: { horizontal: 'center', vertical: 'center', textRotation: 90, wrapText: true },
      border: xlBorder()
    };
    var headHoy = {
      fill: xlFill(XL.today),
      font: xlFont(true, XL.white, 8),
      alignment: { horizontal: 'center', vertical: 'center', textRotation: 90, wrapText: true },
      border: xlBorder()
    };
    var header = [
      xlCell('Ítem', headStyle),
      xlCell('Inicio', headStyle),
      xlCell('Fin', headStyle),
      xlCell('Avance %', headStyle),
      xlCell('Horas cons.', headStyle)
    ];
    periodos.list.forEach(function (per) {
      var esHoy = !!(hoy && hoy >= per.start && hoy <= per.end);
      header.push(xlCell(per.label, esHoy ? headHoy : headRot));
    });
    aoa.push(header);

    var items = itemsGanttExport();
    if (!items.length) {
      aoa.push([xlCell('Sin ítems con fechas para graficar.', { font: xlFont(false, XL.muted, 11) })]);
    }
    items.forEach(function (it) {
      var esEnt = it.tipo === 'entregable';
      var pct = it.pct == null ? 0 : clampPct(it.pct);
      var spi = spiDe(pct, it.inicio, it.fin);
      var atras = spi < 0.85;
      var barRgb = atras ? XL.red : (esEnt ? XL.navy : XL.blue);
      var rowFill = esEnt ? XL.entBg : XL.white;
      var stMeta = {
        fill: xlFill(rowFill),
        font: xlFont(esEnt, XL.ink, 11),
        alignment: { vertical: 'center', wrapText: true, horizontal: 'left' },
        border: xlBorder()
      };
      var stNum = {
        fill: xlFill(rowFill),
        font: xlFont(esEnt, XL.ink, 11),
        alignment: { vertical: 'center', horizontal: 'right' },
        border: xlBorder()
      };
      var stDate = {
        fill: xlFill(rowFill),
        font: xlFont(false, XL.ink, 10),
        alignment: { vertical: 'center', horizontal: 'center' },
        border: xlBorder()
      };
      var a = ymdToDate(it.inicio);
      var b = ymdToDate(it.fin);
      var row = [
        xlCell((esEnt ? '' : '    ') + it.nombre, stMeta),
        xlCell(excelDate(it.inicio), stDate, 'dd/mm/yyyy'),
        xlCell(excelDate(it.fin), stDate, 'dd/mm/yyyy'),
        xlCell(it.pct == null ? null : Number(Number(it.pct).toFixed(2)), stNum, '0.00'),
        xlCell(excelHoras(it.horas), stNum, '0.00')
      ];
      var overlaps = periodos.list.map(function (per) {
        return !!(a && b && a <= per.end && b >= per.start);
      });
      var firstBar = overlaps.indexOf(true);
      var lastBar = overlaps.lastIndexOf(true);
      var finTxt = formatFechaBarra(it.fin);
      periodos.list.forEach(function (per, pi) {
        var esHoy = !!(hoy && hoy >= per.start && hoy <= per.end);
        if (overlaps[pi]) {
          var stBar = {
            fill: xlFill(barRgb),
            font: xlFont(true, XL.white, 7),
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: xlBorder()
          };
          var txt = ' ';
          if (firstBar === lastBar && pi === firstBar) txt = pct.toFixed(0) + '%  ' + finTxt;
          else if (pi === firstBar) txt = pct.toFixed(0) + '%';
          else if (pi === lastBar) txt = finTxt;
          row.push(xlCell(txt, stBar));
        } else {
          row.push(xlCell(' ', {
            fill: xlFill(esHoy ? 'FFFECACA' : XL.track),
            border: xlBorder()
          }));
        }
      });
      aoa.push(row);
    });

    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    var merges = [];
    var mr;
    for (mr = 0; mr <= 3; mr++) {
      merges.push({ s: { r: mr, c: 0 }, e: { r: mr, c: nCols - 1 } });
    }
    merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: nCols - 1 } });
    ws['!merges'] = merges;
    var cols = [{ wch: 38 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 12 }];
    periodos.list.forEach(function () { cols.push({ wch: 5.5 }); });
    ws['!cols'] = cols;
    var rowsH = [{ hpt: 26 }, { hpt: 18 }, { hpt: 32 }, { hpt: 18 }, { hpt: 10 }, { hpt: 20 }, { hpt: 28 }, { hpt: 48 }];
    var ir;
    for (ir = 8; ir < aoa.length; ir++) rowsH[ir] = { hpt: 18 };
    ws['!rows'] = rowsH;
    ws['!views'] = [{ state: 'frozen', xSplit: 1, ySplit: 8, topLeftCell: 'B9' }];
    return ws;
  }

  function kpisPlan() {
    var p = proyectoSel();
    var pct = progresoProyecto(p);
    var ents = state.entregables;
    var tars = state.tareas;
    var hechasE = ents.filter(function (e) { return e.estado === 'hecha'; }).length;
    var hechasT = tars.filter(function (t) { return t.estado === 'hecha'; }).length;
    var pend = tars.filter(function (t) { return t.estado === 'pendiente'; }).length;
    var curso = tars.filter(function (t) { return t.estado === 'en_curso'; }).length;
    var hoy = fechaHoyYmd();
    var venc = tars.filter(function (t) {
      return t.estado !== 'hecha' && t.estado !== 'cancelada' && t.fecha_fin && t.fecha_fin < hoy;
    }).length;
    var spi = p ? spiProyecto(p) : 1;
    return {
      pct: pct,
      esperado: p ? esperadoProyecto(p) : 0,
      spi: spi,
      hechasE: hechasE,
      totalE: ents.length,
      hechasT: hechasT,
      totalT: tars.length,
      pend: pend,
      curso: curso,
      venc: venc,
      deadline: countDeadlineAlertas(),
      horas: horasProyecto()
    };
  }

  function errMsg(err) {
    if (!err) return 'Error desconocido';
    var m = err.message || String(err);
    if (/row-level security|42501|permission denied/i.test(m)) {
      return 'No se pudo guardar (permiso o sesión). Recargá la página, iniciá sesión y probá de nuevo.';
    }
    return m;
  }

  async function cargarCatalogos() {
    var res = await client().rpc('gp_listar_catalogos');
    if (res.error) throw res.error;
    var data = res.data || { usuarios: [], perfiles: [] };
    state.catalogos = {
      usuarios: data.usuarios || [],
      perfiles: data.perfiles || []
    };
  }

  async function cargarProyectos() {
    var res = await client().from('gp_proyecto').select('*').order('fecha_inicio', { ascending: false }).order('nombre');
    if (res.error) throw res.error;
    state.proyectos = res.data || [];
    var saved = localStorage.getItem(LS_PROY);
    if (state.selectedId && state.proyectos.some(function (p) { return p.id === state.selectedId; })) return;
    if (saved && state.proyectos.some(function (p) { return p.id === saved; })) {
      state.selectedId = saved;
    } else {
      state.selectedId = state.proyectos[0] ? state.proyectos[0].id : null;
    }
  }

  async function cargarPlan() {
    if (!state.selectedId) {
      state.entregables = [];
      state.tareas = [];
      state.dependencias = [];
      state.horas = [];
      state.horasEnt = [];
      state.horasProy = [];
      return;
    }
    var hpRes = await client().from('gp_proyecto_hora').select('*').eq('proyecto_id', state.selectedId).order('fecha');
    if (hpRes.error) throw hpRes.error;
    state.horasProy = hpRes.data || [];
    var eRes = await client().from('gp_entregable').select('*').eq('proyecto_id', state.selectedId).order('orden').order('fecha_inicio');
    if (eRes.error) throw eRes.error;
    state.entregables = eRes.data || [];
    var ids = state.entregables.map(function (e) { return e.id; });
    if (!ids.length) {
      state.tareas = [];
      state.dependencias = [];
      state.horas = [];
      state.horasEnt = [];
      return;
    }
    var tRes = await client().from('gp_tarea').select('*').in('entregable_id', ids).order('orden').order('fecha_inicio');
    if (tRes.error) throw tRes.error;
    state.tareas = tRes.data || [];
    var dRes = await client().from('gp_dependencia').select('*').in('entregable_id', ids).order('orden');
    if (dRes.error) throw dRes.error;
    state.dependencias = dRes.data || [];
    var heRes = await client().from('gp_entregable_hora').select('*').in('entregable_id', ids).order('fecha');
    if (heRes.error) throw heRes.error;
    state.horasEnt = heRes.data || [];
    var tIds = state.tareas.map(function (t) { return t.id; });
    if (!tIds.length) {
      state.horas = [];
      return;
    }
    var hRes = await client().from('gp_tarea_hora').select('*').in('tarea_id', tIds).order('fecha');
    if (hRes.error) throw hRes.error;
    state.horas = hRes.data || [];
  }

  async function recargarTodo() {
    state.loading = true;
    renderShell();
    try {
      await cargarCatalogos();
      await cargarProyectos();
      await cargarPlan();
    } catch (e) {
      alert('No se pudo cargar Gestión de Proyectos: ' + errMsg(e));
    } finally {
      state.loading = false;
      renderShell();
    }
  }

  function optionsEstado(lista, val) {
    return lista.map(function (x) {
      return '<option value="' + esc(x.v) + '"' + (x.v === val ? ' selected' : '') + '>' + esc(x.l) + '</option>';
    }).join('');
  }

  function optionsUsuarios(val) {
    return '<option value="">Elegí usuario</option>' + (state.catalogos.usuarios || []).map(function (u) {
      return '<option value="' + esc(u.id) + '"' + (u.id === val ? ' selected' : '') + '>' + esc(usuarioComboLabel(u)) + '</option>';
    }).join('');
  }

  function optionsPerfiles(val) {
    return '<option value="">Elegí perfil</option>' + (state.catalogos.perfiles || []).map(function (p) {
      return '<option value="' + esc(p.role) + '"' + (p.role === val ? ' selected' : '') + '>' + esc(p.label || p.role) + '</option>';
    }).join('');
  }

  function payloadResponsable(form) {
    var tipo = form.querySelector('[name="responsable_tipo"]').value;
    var out = {
      responsable_tipo: tipo,
      responsable_user_id: null,
      responsable_role: null
    };
    if (tipo === 'usuario') {
      out.responsable_user_id = form.querySelector('[name="responsable_user_id"]').value || null;
    } else {
      out.responsable_role = form.querySelector('[name="responsable_role"]').value || null;
    }
    return out;
  }

  function validarResponsable(p) {
    if (p.responsable_tipo === 'usuario' && !p.responsable_user_id) return 'Elegí un usuario responsable.';
    if (p.responsable_tipo === 'perfil' && !p.responsable_role) return 'Elegí un perfil responsable.';
    return null;
  }

  function syncPctConEstado(estado, pct) {
    if (estado === 'hecha' || estado === 'completado') return 100;
    if (estado === 'pendiente' || estado === 'planificado') return pct || 0;
    return clampPct(pct);
  }

  function bindResponsableTipo(form) {
    var tipo = form.querySelector('[name="responsable_tipo"]');
    var wrapU = form.querySelector('.gp-resp-usuario');
    var wrapP = form.querySelector('.gp-resp-perfil');
    function sync() {
      var t = tipo.value;
      if (wrapU) wrapU.style.display = t === 'usuario' ? '' : 'none';
      if (wrapP) wrapP.style.display = t === 'perfil' ? '' : 'none';
    }
    tipo.addEventListener('change', sync);
    sync();
  }

  function camposResponsable(row) {
    var tipo = (row && row.responsable_tipo) || 'usuario';
    return (
      '<div class="form-group">' +
        '<label>Responsable (tipo)</label>' +
        '<select name="responsable_tipo">' +
          '<option value="usuario"' + (tipo === 'usuario' ? ' selected' : '') + '>Usuario</option>' +
          '<option value="perfil"' + (tipo === 'perfil' ? ' selected' : '') + '>Perfil</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group gp-resp-usuario">' +
        '<label>Usuario</label>' +
        '<select name="responsable_user_id">' + optionsUsuarios(row && row.responsable_user_id) + '</select>' +
      '</div>' +
      '<div class="form-group gp-resp-perfil">' +
        '<label>Perfil</label>' +
        '<select name="responsable_role">' + optionsPerfiles(row && row.responsable_role) + '</select>' +
      '</div>'
    );
  }

  function camposFechasNombre(row, conAlcance, nombreLabel) {
    var hoy = fechaHoyYmd();
    return (
      '<div class="form-group full">' +
        '<label>' + esc(nombreLabel || 'Nombre') + '</label>' +
        '<input name="nombre" required maxlength="200" value="' + esc(row && (row.nombre || row.descripcion) || '') + '">' +
      '</div>' +
      (conAlcance
        ? '<div class="form-group full"><label>Alcance</label><textarea name="alcance">' + esc(row && row.alcance || '') + '</textarea></div>'
        : '') +
      '<div class="form-group"><label>Fecha inicio</label><input type="date" name="fecha_inicio" required value="' + esc((row && row.fecha_inicio) || hoy) + '"></div>' +
      '<div class="form-group"><label>Fecha final</label><input type="date" name="fecha_fin" required value="' + esc((row && row.fecha_fin) || hoy) + '"></div>'
    );
  }

  function abrirModal(titulo, bodyHtml, onSubmit, afterOpen) {
    cerrarModal();
    var bd = document.createElement('div');
    bd.className = 'modal-backdrop gp-modal-backdrop';
    bd.innerHTML =
      '<div class="modal gp-modal" role="dialog" aria-modal="true">' +
        '<div class="modal-header">' +
          '<h2>' + esc(titulo) + '</h2>' +
          '<button type="button" class="modal-close" data-gp="cerrar-modal" aria-label="Cerrar"><span class="icon-close">' + ICO.x + '</span></button>' +
        '</div>' +
        '<form class="gp-modal-form" novalidate>' +
          '<div class="modal-body"><div class="gp-form-grid">' + bodyHtml + '</div><p class="gp-form-error" hidden></p></div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="gp-btn gp-btn-ghost" data-gp="cerrar-modal"><span class="btn-icon">' + ICO.x + '</span>Cancelar</button>' +
            '<button type="submit" class="gp-btn gp-btn-nueva"><span class="btn-icon">' + ICO.check + '</span>Guardar</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(bd);
    state.modal = bd;
    var form = bd.querySelector('form');
    bindResponsableTipo(form);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errEl = form.querySelector('.gp-form-error');
      errEl.hidden = true;
      Promise.resolve(onSubmit(form)).then(function (msg) {
        if (msg) {
          errEl.textContent = msg;
          errEl.hidden = false;
          errEl.scrollIntoView({ block: 'nearest' });
          return;
        }
        cerrarModal();
        return recargarTodo();
      }).catch(function (e) {
        errEl.textContent = errMsg(e);
        errEl.hidden = false;
        errEl.scrollIntoView({ block: 'nearest' });
      });
    });
    bd.addEventListener('click', function (ev) {
      if (ev.target === bd) {
        cerrarModal();
        return;
      }
      var closeBtn = ev.target.closest && ev.target.closest('[data-gp="cerrar-modal"]');
      if (closeBtn && bd.contains(closeBtn)) {
        ev.preventDefault();
        cerrarModal();
      }
    });
    function onEsc(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cerrarModal();
      }
    }
    document.addEventListener('keydown', onEsc);
    bd._gpEsc = onEsc;
    if (typeof afterOpen === 'function') afterOpen(form, bd);
  }

  function cerrarModal() {
    if (state.modal) {
      if (state.modal._gpEsc) {
        document.removeEventListener('keydown', state.modal._gpEsc);
        state.modal._gpEsc = null;
      }
      if (state.modal.parentNode) state.modal.parentNode.removeChild(state.modal);
    }
    state.modal = null;
  }

  function formProyecto(row) {
    var est = (row && row.estado) || 'planificado';
    var proyIdGuardada = row ? row.id : null;
    var filasInit = row
      ? horasFilasProyecto(row.id).map(function (h) { return { fecha: h.fecha, horas: h.horas, observaciones: h.observaciones }; })
      : [];
    var propias = row ? horasPropiasProyecto(row) : 0;
    var deHijos = row ? Math.round((horasProyecto(row) - propias) * 100) / 100 : 0;
    var totalHint = row
      ? '<p class="gp-field-hint">Total del proyecto: ' + esc(formatHoras(horasProyecto(row))) +
        ' (propias ' + esc(formatHoras(propias)) + ' + entregables/tareas ' + esc(formatHoras(deHijos)) + ').</p>'
      : '';
    abrirModal(row ? 'Editar proyecto' : 'Nuevo proyecto',
      camposFechasNombre(row, true, 'Nombre del proyecto') +
      camposResponsable(row) +
      '<div class="form-group"><label>Estado</label><select name="estado">' + optionsEstado(EST_PROY, est) + '</select></div>' +
      '<div class="form-group"><label>Avance % (sin entregables, o para las horas propias del proyecto)</label><input type="number" name="progreso_pct" min="0" max="100" step="1" value="' + esc(row && row.progreso_pct != null ? row.progreso_pct : 0) + '"></div>' +
      htmlTablaHoras(filasInit, 'Horas reales propias del proyecto (no atribuidas a un entregable o tarea). El total del proyecto es estas más las de los entregables y las tareas.') +
      (totalHint ? '<div class="form-group full">' + totalHint + '</div>' : ''),
      async function (form) {
        var p = payloadResponsable(form);
        var v = validarResponsable(p);
        if (v) return v;
        var fi = form.querySelector('[name="fecha_inicio"]').value;
        var ff = form.querySelector('[name="fecha_fin"]').value;
        if (ff < fi) return 'La fecha final no puede ser anterior al inicio.';
        var leidas = leerFilasHoras(form);
        if (leidas.error) return leidas.error;
        var estado = form.querySelector('[name="estado"]').value;
        var payload = Object.assign({
          nombre: form.querySelector('[name="nombre"]').value.trim(),
          alcance: form.querySelector('[name="alcance"]').value.trim() || null,
          fecha_inicio: fi,
          fecha_fin: ff,
          estado: estado,
          progreso_pct: syncPctConEstado(estado, form.querySelector('[name="progreso_pct"]').value)
        }, p);
        if (!payload.nombre) return 'El nombre es obligatorio.';
        var preview = Object.assign({}, row || {}, { fecha_fin: ff, estado: estado, id: proyIdGuardada });
        var alertaH = alertaDeadlineHorasProyecto(preview, leidas.filas);
        if (alertaH && !window.confirm(alertaH + '\n\n¿Guardar igual? Podés ajustar las horas o el deadline del proyecto.')) {
          return 'Revisá el deadline del proyecto o las horas.';
        }
        if (proyIdGuardada) {
          var up = await client().from('gp_proyecto').update(payload).eq('id', proyIdGuardada);
          if (up.error) throw up.error;
        } else {
          payload.orden = state.proyectos.length;
          var ins = await client().from('gp_proyecto').insert(payload).select('id').single();
          if (ins.error) throw ins.error;
          proyIdGuardada = ins.data.id;
          state.selectedId = proyIdGuardada;
          localStorage.setItem(LS_PROY, state.selectedId);
        }
        await guardarHorasProyecto(proyIdGuardada, leidas.filas);
        return null;
      },
      function (form) { bindHorasForm(form); }
    );
  }

  function formEntregable(row) {
    var est = (row && row.estado) || 'pendiente';
    var entIdGuardada = row ? row.id : null;
    var filasInit = row
      ? horasFilasEntregable(row.id).map(function (h) { return { fecha: h.fecha, horas: h.horas, observaciones: h.observaciones }; })
      : [];
    var propias = row ? horasPropiasEntregable(row) : 0;
    var deTareas = row ? horasTareasEntregable(row) : 0;
    var totalHint = row
      ? '<p class="gp-field-hint">Total del entregable: ' + esc(formatHoras(horasEntregable(row))) +
        ' (propias ' + esc(formatHoras(propias)) + ' + tareas ' + esc(formatHoras(deTareas)) + ').</p>'
      : '';
    abrirModal(row ? 'Editar entregable' : 'Nuevo entregable',
      camposFechasNombre(row, true, 'Nombre del entregable') +
      camposResponsable(row) +
      '<div class="form-group"><label>Estado</label><select name="estado">' + optionsEstado(EST_ITEM, est) + '</select></div>' +
      '<div class="form-group"><label>Avance % (si no hay tareas)</label><input type="number" name="progreso_pct" min="0" max="100" step="1" value="' + esc(row && row.progreso_pct != null ? row.progreso_pct : 0) + '"></div>' +
      htmlTablaHoras(filasInit, 'Horas reales propias del entregable (también si no hay tareas). El total del entregable es estas más las de las tareas.') +
      (totalHint ? '<div class="form-group full">' + totalHint + '</div>' : ''),
      async function (form) {
        var p = payloadResponsable(form);
        var v = validarResponsable(p);
        if (v) return v;
        var fi = form.querySelector('[name="fecha_inicio"]').value;
        var ff = form.querySelector('[name="fecha_fin"]').value;
        if (ff < fi) return 'La fecha final no puede ser anterior al inicio.';
        var leidas = leerFilasHoras(form);
        if (leidas.error) return leidas.error;
        var estado = form.querySelector('[name="estado"]').value;
        var payload = Object.assign({
          proyecto_id: state.selectedId,
          nombre: form.querySelector('[name="nombre"]').value.trim(),
          alcance: form.querySelector('[name="alcance"]').value.trim() || null,
          fecha_inicio: fi,
          fecha_fin: ff,
          estado: estado,
          progreso_pct: syncPctConEstado(estado, form.querySelector('[name="progreso_pct"]').value)
        }, p);
        if (!payload.nombre) return 'El nombre es obligatorio.';
        var preview = Object.assign({}, row || {}, { fecha_fin: ff, estado: estado, id: entIdGuardada });
        var nDl = 0;
        if (entIdGuardada) {
          tareasDe(entIdGuardada).forEach(function (t) {
            if (alertaDeadlineTarea(t, preview)) nDl++;
          });
        }
        var alertaH = alertaDeadlineHorasEntregable(preview, leidas.filas);
        if (alertaH) nDl++;
        if (nDl && !window.confirm((alertaH ? alertaH + ' ' : '') + (nDl ? 'Hay ' + nDl + ' alerta(s) de deadline. ' : '') + '¿Guardar igual? Podés ajustar el entregable, las horas o las tareas.')) {
          return 'Revisá el deadline del entregable o las horas.';
        }
        if (entIdGuardada) {
          var up = await client().from('gp_entregable').update(payload).eq('id', entIdGuardada);
          if (up.error) throw up.error;
        } else {
          payload.orden = state.entregables.length;
          var ins = await client().from('gp_entregable').insert(payload).select('id').single();
          if (ins.error) throw ins.error;
          entIdGuardada = ins.data.id;
        }
        await guardarHorasEntregable(entIdGuardada, leidas.filas);
        return null;
      },
      function (form) { bindHorasForm(form); }
    );
  }

  function formTarea(row, entregableId) {
    var est = (row && row.estado) || 'pendiente';
    var eid = row ? row.entregable_id : entregableId;
    var tareaIdGuardada = row ? row.id : null;
    var filasInit = row
      ? horasFilasDe(row.id).map(function (h) { return { fecha: h.fecha, horas: h.horas, observaciones: h.observaciones }; })
      : [];
    abrirModal(row ? 'Editar tarea' : 'Nueva tarea',
      camposFechasNombre(row, true, 'Nombre de la tarea') +
      camposResponsable(row) +
      '<div class="form-group"><label>Estado</label><select name="estado">' + optionsEstado(EST_ITEM, est) + '</select></div>' +
      '<div class="form-group"><label>Avance %</label><input type="number" name="progreso_pct" min="0" max="100" step="1" value="' + esc(row && row.progreso_pct != null ? row.progreso_pct : 0) + '"></div>' +
      htmlTablaHoras(filasInit, 'Horas reales de esta tarea. El total del entregable es estas más las horas propias del entregable.'),
      async function (form) {
        var p = payloadResponsable(form);
        var v = validarResponsable(p);
        if (v) return v;
        var fi = form.querySelector('[name="fecha_inicio"]').value;
        var ff = form.querySelector('[name="fecha_fin"]').value;
        if (ff < fi) return 'La fecha final no puede ser anterior al inicio.';
        var leidas = leerFilasHoras(form);
        if (leidas.error) return leidas.error;
        var estado = form.querySelector('[name="estado"]').value;
        var payload = Object.assign({
          entregable_id: eid,
          nombre: form.querySelector('[name="nombre"]').value.trim(),
          alcance: form.querySelector('[name="alcance"]').value.trim() || null,
          fecha_inicio: fi,
          fecha_fin: ff,
          estado: estado,
          progreso_pct: syncPctConEstado(estado, form.querySelector('[name="progreso_pct"]').value)
        }, p);
        if (!payload.nombre) return 'El nombre es obligatorio.';
        var ent = findById(state.entregables, eid);
        var alerta = alertaDeadlineTarea({
          estado: estado,
          fecha_fin: ff,
          entregable_id: eid,
          id: tareaIdGuardada
        }, ent, leidas.filas);
        if (alerta && !window.confirm(alerta + '\n\n¿Guardar igual?')) {
          return 'Revisá las fechas o las horas antes de guardar.';
        }
        if (tareaIdGuardada) {
          var up = await client().from('gp_tarea').update(payload).eq('id', tareaIdGuardada);
          if (up.error) throw up.error;
        } else {
          payload.orden = tareasDe(entregableId).length;
          var ins = await client().from('gp_tarea').insert(payload).select('id').single();
          if (ins.error) throw ins.error;
          tareaIdGuardada = ins.data.id;
        }
        await guardarHorasTarea(tareaIdGuardada, leidas.filas);
        return null;
      },
      function (form) { bindHorasForm(form); }
    );
  }

  function formDependencia(row, entregableId) {
    abrirModal(row ? 'Editar dependencia' : 'Nueva dependencia',
      '<div class="form-group full"><label>Descripción</label><textarea name="descripcion" required>' + esc(row && row.descripcion || '') + '</textarea></div>' +
      camposResponsable(row),
      async function (form) {
        var p = payloadResponsable(form);
        var v = validarResponsable(p);
        if (v) return v;
        var payload = Object.assign({
          entregable_id: row ? row.entregable_id : entregableId,
          descripcion: form.querySelector('[name="descripcion"]').value.trim()
        }, p);
        if (!payload.descripcion) return 'La descripción es obligatoria.';
        if (row) {
          var up = await client().from('gp_dependencia').update(payload).eq('id', row.id);
          if (up.error) throw up.error;
        } else {
          payload.orden = depsDe(entregableId).length;
          var ins = await client().from('gp_dependencia').insert(payload);
          if (ins.error) throw ins.error;
        }
        return null;
      }
    );
  }

  async function eliminar(tabla, id, msg) {
    if (!confirm(msg)) return;
    var res = await client().from(tabla).delete().eq('id', id);
    if (res.error) {
      alert('No se pudo eliminar: ' + errMsg(res.error));
      return;
    }
    if (tabla === 'gp_proyecto' && state.selectedId === id) {
      state.selectedId = null;
      localStorage.removeItem(LS_PROY);
    }
    await recargarTodo();
  }

  async function cambiarEstado(tabla, id, estado) {
    var patch = { estado: estado, progreso_pct: syncPctConEstado(estado, 0) };
    if (estado !== 'hecha' && estado !== 'completado' && estado !== 'pendiente' && estado !== 'planificado') {
      delete patch.progreso_pct;
    }
    if (estado === 'en_curso' || estado === 'pausado' || estado === 'cancelada' || estado === 'cancelado') {
      delete patch.progreso_pct;
    }
    var res = await client().from(tabla).update(patch).eq('id', id);
    if (res.error) {
      alert('No se pudo actualizar el estado: ' + errMsg(res.error));
      return;
    }
    await recargarTodo();
  }

  function btnIcon(action, id, title, icon, extraClass) {
    return '<button type="button" class="gp-btn gp-btn-ghost gp-btn-icon-only ' + (extraClass || '') + '" data-gp="' + action + '" data-id="' + esc(id) + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"><span class="btn-icon">' + icon + '</span></button>';
  }

  function btnMoveEnt(id, delta, title, icon, disabled) {
    return '<button type="button" class="gp-btn gp-btn-ghost gp-btn-icon-only"' +
      (disabled ? ' disabled' : '') +
      ' data-gp="move-ent" data-id="' + esc(id) + '" data-delta="' + delta + '"' +
      ' title="' + esc(title) + '" aria-label="' + esc(title) + '"><span class="btn-icon">' + icon + '</span></button>';
  }

  async function moverEntregable(id, delta) {
    if (!can('editar_proyecto') || state.moviendo) return;
    var arr = entregablesVista();
    var i = -1;
    for (var k = 0; k < arr.length; k++) if (arr[k].id === id) { i = k; break; }
    var j = i + Number(delta);
    if (i < 0 || j < 0 || j >= arr.length) return;
    state.moviendo = true;
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    arr.forEach(function (e, idx) { e.orden = idx; });
    state.entregables = arr;
    state.ordenEntregables = 'manual';
    localStorage.setItem(LS_ORDEN, 'manual');
    renderShell();
    try {
      var results = await Promise.all(arr.map(function (e, idx) {
        return client().from('gp_entregable').update({ orden: idx }).eq('id', e.id);
      }));
      for (var r = 0; r < results.length; r++) {
        if (results[r] && results[r].error) {
          alert('No se pudo guardar el orden: ' + errMsg(results[r].error));
          break;
        }
      }
    } finally {
      state.moviendo = false;
    }
  }

  function renderCardsProyecto() {
    if (!state.proyectos.length) {
      return '<p class="gp-empty">Todavía no hay proyectos. Creá el primero para armar el plan de trabajo.</p>';
    }
    return '<div class="gp-proy-cards">' + state.proyectos.map(function (p) {
      var activa = p.id === state.selectedId ? ' activa' : '';
      return '<button type="button" class="gp-proy-card' + activa + '" data-gp="sel-proy" data-id="' + esc(p.id) + '">' +
        '<div class="nom">' + esc(p.nombre) + '</div>' +
        '<div class="sub">' + formatFecha(p.fecha_inicio) + ' – ' + formatFecha(p.fecha_fin) + ' · ' + htmlResponsable(p) + '</div>' +
        '<div style="margin-top:0.45rem">' + badgeHtml(p.estado, true) + '</div>' +
      '</button>';
    }).join('') + '</div>';
  }

  function renderResumen() {
    if (!proyectoSel()) return '';
    var k = kpisPlan();
    var spiCls = k.spi < 0.85 ? 'bad' : (k.spi < 1 ? 'warn' : 'ok');
    return '<div class="gp-resumen">' +
      '<div class="gp-resumen-card"><p class="lab">Avance del plan</p><p class="val">' + k.pct.toFixed(0) + '%</p></div>' +
      '<div class="gp-resumen-card"><p class="lab">Pendientes</p><p class="val">' + k.pend + '</p></div>' +
      '<div class="gp-resumen-card"><p class="lab">En curso</p><p class="val">' + k.curso + '</p></div>' +
      '<div class="gp-resumen-card' + (k.venc ? ' bad' : '') + '"><p class="lab">Vencidas</p><p class="val">' + k.venc + '</p></div>' +
      '<div class="gp-resumen-card' + (k.deadline ? ' warn' : '') + '"><p class="lab">Fuera de deadline</p><p class="val">' + k.deadline + '</p></div>' +
      '<div class="gp-resumen-card"><p class="lab">Entregables hechos</p><p class="val">' + k.hechasE + '/' + k.totalE + '</p></div>' +
      '<div class="gp-resumen-card"><p class="lab">Tareas hechas</p><p class="val">' + k.hechasT + '/' + k.totalT + '</p></div>' +
      '<div class="gp-resumen-card ' + spiCls + '"><p class="lab">SPI (horas vs calendario)</p><p class="val">' + k.spi.toFixed(2) + '</p></div>' +
      '<div class="gp-resumen-card"><p class="lab">Esperado a hoy</p><p class="val">' + k.esperado.toFixed(0) + '%</p></div>' +
      '<div class="gp-resumen-card"><p class="lab">Horas consumidas</p><p class="val">' + (k.horas ? formatHoras(k.horas) : '0 h') + '</p></div>' +
    '</div>';
  }

  function celdaPlan(nivelCls, chevHtml, tipo, nombre, alcance, extraHtml) {
    return '<td class="col-nombre"><div class="gp-plan-cell ' + nivelCls + '">' +
      (chevHtml || '') +
      '<div class="gp-plan-text">' +
        (tipo ? '<span class="gp-tipo-tag">' + esc(tipo) + '</span>' : '') +
        '<span class="gp-plan-nombre">' + esc(nombre) + (extraHtml || '') + '</span>' +
        (alcance ? '<span class="gp-plan-alcance">' + esc(alcance) + '</span>' : '') +
      '</div></div></td>';
  }

  function renderPlanTabla() {
    var p = proyectoSel();
    if (!p) return '<p class="gp-empty">Elegí un proyecto para ver el plan.</p>';
    if (!state.entregables.length) {
      return '<p class="gp-empty">Este proyecto no tiene entregables. Agregá el primero o cargá horas propias desde Editar proyecto.</p>';
    }
    var canEdit = can('editar_proyecto');
    var canDel = can('eliminar_proyecto');
    var canCrear = can('crear_proyecto');
    var lista = entregablesVista();
    var rows = '';
    lista.forEach(function (e, idx) {
      var open = !state.collapsed[e.id];
      var pr = progresoEntregable(e);
      var spi = pr == null ? null : spiDe(pr, e.fecha_inicio, e.fecha_fin);
      var chev = (tareasDe(e.id).length || depsDe(e.id).length)
        ? '<button type="button" class="gp-toggle-row" data-gp="toggle-ent" data-id="' + esc(e.id) + '" aria-label="' + (open ? 'Contraer' : 'Ampliar') + '">' + (open ? ICO.chevronD : ICO.chevronR) + '</button>'
        : '<span class="gp-toggle-row" style="visibility:hidden">' + ICO.chevronR + '</span>';
      var hoy = fechaHoyYmd();
      var venc = e.estado !== 'hecha' && e.estado !== 'cancelada' && e.fecha_fin && e.fecha_fin < hoy;
      var nDlEnt = 0;
      tareasDe(e.id).forEach(function (t) { if (alertaDeadlineTarea(t, e)) nDlEnt++; });
      var alertaEntH = alertaDeadlineHorasEntregable(e);
      var alertaEntParts = [];
      if (nDlEnt) alertaEntParts.push('Hay ' + nDlEnt + ' tarea(s) que superan el deadline de este entregable. Ajustá el entregable o las tareas.');
      if (alertaEntH) alertaEntParts.push(alertaEntH);
      var alertaEnt = alertaEntParts.length ? alertaEntParts.join(' ') : null;
      rows += '<tr class="gp-row-entregable' + (alertaEnt ? ' gp-row-dl' : '') + '">' +
        celdaPlan('gp-indent-ent', chev, 'Entregable', e.nombre, e.alcance, htmlAlertaDeadline(alertaEnt)) +
        '<td>' + formatFecha(e.fecha_inicio) + '</td>' +
        '<td>' + formatFecha(e.fecha_fin) + '</td>' +
        '<td class="gp-col-resp">' + htmlResponsable(e) + '</td>' +
        '<td>' + (venc && e.estado !== 'hecha' ? badgeHtml('vencida', false) : badgeHtml(e.estado, false)) + '</td>' +
        '<td class="gp-col-horas">' + esc(formatHoras(horasEntregable(e))) + '</td>' +
        '<td>' + (pr == null ? '—' : pctBar(pr, spi)) + '</td>' +
        '<td class="gp-row-actions">' +
          (canEdit ? '<span class="gp-orden-btns">' +
            btnMoveEnt(e.id, -1, 'Subir entregable', ICO.chevronU, idx === 0) +
            btnMoveEnt(e.id, 1, 'Bajar entregable', ICO.chevronD, idx === lista.length - 1) +
          '</span>' : '') +
          (canEdit ? '<select data-gp="est-ent" data-id="' + esc(e.id) + '" aria-label="Estado entregable">' + optionsEstado(EST_ITEM, e.estado) + '</select>' : '') +
          (canCrear ? btnIcon('add-tar', e.id, 'Agregar tarea', ICO.plus) : '') +
          (canCrear ? btnIcon('add-dep', e.id, 'Agregar dependencia', ICO.list) : '') +
          (canEdit ? btnIcon('edit-ent', e.id, 'Editar entregable', ICO.pencil) : '') +
          (canDel ? btnIcon('del-ent', e.id, 'Eliminar entregable', ICO.trash, 'danger') : '') +
        '</td>' +
      '</tr>';
      if (state.soloEntregables || !open) return;
      tareasDe(e.id).forEach(function (t) {
        var pt = progresoTarea(t);
        var st = pt == null ? null : spiDe(pt, t.fecha_inicio, t.fecha_fin);
        var tv = t.estado !== 'hecha' && t.estado !== 'cancelada' && t.fecha_fin && t.fecha_fin < hoy;
        var alertaT = alertaDeadlineTarea(t, e);
        rows += '<tr class="gp-row-tarea' + (alertaT ? ' gp-row-dl' : '') + '">' +
          celdaPlan('gp-indent-tar', '', 'Tarea', t.nombre, t.alcance, htmlAlertaDeadline(alertaT)) +
          '<td>' + formatFecha(t.fecha_inicio) + '</td>' +
          '<td>' + formatFecha(t.fecha_fin) + '</td>' +
          '<td class="gp-col-resp">' + htmlResponsable(t) + '</td>' +
          '<td>' + (tv ? badgeHtml('vencida', false) : badgeHtml(t.estado, false)) + '</td>' +
          '<td class="gp-col-horas">' + esc(formatHoras(horasDeTarea(t))) + '</td>' +
          '<td>' + (pt == null ? '—' : pctBar(pt, st)) + '</td>' +
          '<td class="gp-row-actions">' +
            (canEdit ? '<select data-gp="est-tar" data-id="' + esc(t.id) + '" aria-label="Estado tarea">' + optionsEstado(EST_ITEM, t.estado) + '</select>' : '') +
            (canEdit ? btnIcon('edit-tar', t.id, 'Editar tarea', ICO.pencil) : '') +
            (canDel ? btnIcon('del-tar', t.id, 'Eliminar tarea', ICO.trash, 'danger') : '') +
          '</td>' +
        '</tr>';
      });
      depsDe(e.id).forEach(function (d) {
        rows += '<tr class="gp-row-dep">' +
          celdaPlan('gp-indent-dep gp-dep-bullet', '', 'Dependencia', d.descripcion, null) +
          '<td>—</td><td>—</td>' +
          '<td class="gp-col-resp">' + htmlResponsable(d) + '</td>' +
          '<td>—</td><td class="gp-col-horas">—</td><td>—</td>' +
          '<td class="gp-row-actions">' +
            (canEdit ? btnIcon('edit-dep', d.id, 'Editar dependencia', ICO.pencil) : '') +
            (canDel ? btnIcon('del-dep', d.id, 'Eliminar dependencia', ICO.trash, 'danger') : '') +
          '</td>' +
        '</tr>';
      });
    });
    var k = kpisPlan();
    var banner = k.deadline
      ? '<div class="gp-dl-banner" role="status">' +
          '<span class="gp-alerta-dl" aria-hidden="true">' + ICO.warn + '</span>' +
          'Hay ' + k.deadline + ' ítem(s) fuera de deadline (tarea, horas de entregable o del proyecto). Revisá fechas u horas.' +
        '</div>'
      : '';
    return banner + '<div class="gp-tabla-wrap"><table class="gp-tabla">' +
      '<thead><tr><th>Plan</th><th>Inicio</th><th>Fin</th><th>Responsable</th><th>Estado</th><th>Horas cons.</th><th>Avance</th><th>Acciones</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function itemsGantt() {
    var items = [];
    entregablesVista().forEach(function (e) {
      items.push({
        tipo: 'entregable',
        id: e.id,
        nombre: e.nombre + (horasEntregable(e) ? ' · ' + formatHoras(horasEntregable(e)) + ' cons.' : ''),
        inicio: e.fecha_inicio,
        fin: e.fecha_fin,
        pct: progresoEntregable(e),
        estado: e.estado
      });
      if (state.soloEntregables) return;
      tareasDe(e.id).forEach(function (t) {
        items.push({
          tipo: 'tarea',
          id: t.id,
          nombre: t.nombre + (horasDeTarea(t) ? ' · ' + formatHoras(horasDeTarea(t)) + ' cons.' : ''),
          inicio: t.fecha_inicio,
          fin: t.fecha_fin,
          pct: progresoTarea(t),
          estado: t.estado,
          parent: e.id
        });
      });
    });
    return items.filter(function (it) { return it.inicio && it.fin && it.estado !== 'cancelada' && it.estado !== 'cancelado'; });
  }

  function rangoPlan() {
    var p = proyectoSel();
    var min = p ? ymdToDate(p.fecha_inicio) : null;
    var max = p ? ymdToDate(p.fecha_fin) : null;
    itemsGantt().forEach(function (it) {
      var a = ymdToDate(it.inicio);
      var b = ymdToDate(it.fin);
      if (a && (!min || a < min)) min = a;
      if (b && (!max || b > max)) max = b;
    });
    if (!min || !max) {
      var h = ymdToDate(fechaHoyYmd());
      return { min: h, max: h };
    }
    return { min: min, max: max };
  }

  function ymdFromDate(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }

  function ticksRango(min, max) {
    var total = Math.max(1, Math.round((max - min) / 86400000) + 1);
    var step = total > 90 ? 30 : (total > 21 ? 7 : 1);
    var ticks = [];
    var cur = new Date(min.getTime());
    while (cur <= max) {
      ticks.push(new Date(cur.getTime()));
      cur.setDate(cur.getDate() + step);
    }
    return ticks;
  }

  function barStyle(inicio, fin, min, max) {
    var total = Math.max(1, (max - min) / 86400000);
    var a = ymdToDate(inicio);
    var b = ymdToDate(fin);
    if (!a || !b) return 'display:none';
    var left = ((a - min) / 86400000) / total * 100;
    var width = (diasEntre(inicio, fin) / (total + 0.0001)) * 100;
    if (left < 0) { width += left; left = 0; }
    if (left + width > 100) width = 100 - left;
    return 'left:' + Math.max(0, left).toFixed(2) + '%;width:' + Math.max(0.4, width).toFixed(2) + '%';
  }

  function renderGantt() {
    var p = proyectoSel();
    if (!p) return '<p class="gp-empty">Elegí un proyecto para ver el Gantt.</p>';
    var k = kpisPlan();
    var ringPct = Math.round(k.pct);
    var spiTxt = k.spi >= 1 ? 'En tiempo' : (k.spi >= 0.85 ? 'Atención' : 'Atrasado');
    var rango = rangoPlan();
    var ticks = ticksRango(rango.min, rango.max);
    var hoy = ymdToDate(fechaHoyYmd());
    var total = Math.max(1, (rango.max - rango.min) / 86400000);
    var todayLeft = hoy ? ((hoy - rango.min) / 86400000) / total * 100 : null;
    var ticksHtml = ticks.map(function (t) {
      return '<div class="gp-gantt-tick">' + String(t.getDate()).padStart(2, '0') + '/' + String(t.getMonth() + 1).padStart(2, '0') + '</div>';
    }).join('');
    var items = itemsGantt();
    var body = items.map(function (it) {
      var pct = it.pct == null ? 0 : clampPct(it.pct);
      var spi = spiDe(pct, it.inicio, it.fin);
      var atras = spi < 0.85 ? ' atrasado' : '';
      var cls = it.tipo === 'entregable' ? 'gp-bar gp-bar-ent' : 'gp-bar gp-bar-tar';
      return '<tr class="' + (it.tipo === 'entregable' ? 'gp-gantt-row-ent' : 'gp-gantt-row-tar') + '">' +
        '<td class="gp-gantt-name">' + (it.tipo === 'tarea' ? '&nbsp;&nbsp;' : '') + esc(it.nombre) + '</td>' +
        '<td><div class="gp-gantt-timeline">' +
          (todayLeft != null ? '<div class="gp-today" style="left:' + todayLeft.toFixed(2) + '%"></div>' : '') +
          '<div class="' + cls + atras + '" style="' + barStyle(it.inicio, it.fin, rango.min, rango.max) + '" title="' + esc(it.nombre) + ' · fin planificado ' + formatFecha(it.fin) + ' · ' + pct.toFixed(0) + '%">' +
            '<div class="gp-bar-fill" style="width:' + pct.toFixed(1) + '%"></div>' +
            '<span class="gp-bar-label">' + esc(formatFechaBarra(it.fin)) + '</span>' +
          '</div>' +
        '</div></td>' +
      '</tr>';
    }).join('');
    if (!body) body = '<tr><td class="gp-gantt-name" colspan="2">Sin ítems con fechas para graficar.</td></tr>';

    var depsHtml = '';
    entregablesVista().forEach(function (e) {
      var ds = depsDe(e.id);
      if (!ds.length) return;
      depsHtml += '<li><strong>' + esc(e.nombre) + '</strong><ul>' + ds.map(function (d) {
        return '<li>' + esc(d.descripcion) + ' — ' + htmlResponsable(d) + '</li>';
      }).join('') + '</ul></li>';
    });

    return '<div class="gp-onepager" id="gp-onepager">' +
      '<div class="gp-onepager-head">' +
        '<div>' +
          '<h2>Plan de trabajo — ' + esc(p.nombre) + '</h2>' +
          '<div class="gp-onepager-meta">' + formatFecha(p.fecha_inicio) + ' → ' + formatFecha(p.fecha_fin) +
            ' · Responsable: ' + htmlResponsable(p) + ' · ' + esc(labelEstado(p.estado, true)) +
            ' · ' + spiTxt + ' (SPI ' + k.spi.toFixed(2) + ')' +
            ' · Horas consumidas: ' + (k.horas ? formatHoras(k.horas) : '0 h') + '</div>' +
        '</div>' +
        '<div class="gp-ring" style="--gp-pct:' + (ringPct * 3.6) + 'deg"><div class="gp-ring-inner">' + ringPct + '%</div></div>' +
      '</div>' +
      '<div class="gp-onepager-horas">' +
        '<strong>Horas consumidas (reales):</strong> ' + (k.horas ? formatHoras(k.horas) : '0 h') +
        '<span>No es alocación planificada: son horas realmente trabajadas, cargadas por fecha en el proyecto, el entregable y/o cada tarea.</span>' +
      '</div>' +
      '<div class="gp-evol">' +
        '<div class="gp-evol-label"><span>Evolución vs calendario</span><span>Real ' + k.pct.toFixed(0) + '% · Esperado ' + k.esperado.toFixed(0) + '%</span></div>' +
        '<div class="gp-evol-track">' +
          '<div class="gp-evol-esperado" style="width:' + k.esperado.toFixed(1) + '%"></div>' +
          '<div class="gp-evol-real" style="width:' + k.pct.toFixed(1) + '%"></div>' +
        '</div>' +
      '</div>' +
      '<div class="gp-gantt-wrap"><table class="gp-gantt">' +
        '<thead><tr><th class="gp-gantt-name">Ítem</th><th><div class="gp-gantt-ticks">' + ticksHtml + '</div></th></tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table></div>' +
      '<div class="gp-legend">' +
        '<span><i style="background:#0d2137"></i>Avance entregable</span>' +
        '<span><i style="background:#0369a1"></i>Avance tarea</span>' +
        '<span><i style="background:#b91c1c"></i>Atrasado</span>' +
        '<span><i style="background:#dc2626;width:2px;height:14px"></i>Hoy</span>' +
        '<span>Xh cons. = horas reales consumidas (no planificadas)</span>' +
        '<span>Fecha en la barra = fin planificado</span>' +
      '</div>' +
      (depsHtml ? '<div style="margin-top:0.85rem"><h3 style="font-size:0.95rem;margin:0 0 0.35rem">Dependencias</h3><ul style="margin:0;padding-left:1.1rem;font-size:0.88rem;color:#334155">' + depsHtml + '</ul></div>' : '') +
    '</div>';
  }

  function gruposHorasConciliacion() {
    var byFecha = {};
    var p = proyectoSel();
    function pushItem(fecha, n, item) {
      if (!byFecha[fecha]) byFecha[fecha] = { fecha: fecha, horas: 0, items: [] };
      byFecha[fecha].horas += n;
      byFecha[fecha].items.push(item);
    }
    if (p && p.estado !== 'cancelado') {
      (state.horasProy || []).forEach(function (h) {
        if (h.proyecto_id !== p.id) return;
        var n = Number(h.horas);
        if (!isFinite(n) || n <= 0) return;
        var fuera = !!(p.fecha_fin && h.fecha > p.fecha_fin);
        pushItem(h.fecha, n, {
          origen: 'proyecto',
          entregable: { nombre: p.nombre },
          tarea: null,
          etiquetaTarea: 'Horas propias del proyecto',
          horas: n,
          observaciones: h.observaciones || '',
          fuera: fuera,
          alerta: alertaDeadlineHorasProyecto(p, [{ fecha: h.fecha, horas: n }])
        });
      });
    }
    (state.horasEnt || []).forEach(function (h) {
      var e = findById(state.entregables, h.entregable_id);
      if (!e || e.estado === 'cancelada') return;
      var n = Number(h.horas);
      if (!isFinite(n) || n <= 0) return;
      var fuera = !!(e.fecha_fin && h.fecha > e.fecha_fin);
      pushItem(h.fecha, n, {
        origen: 'entregable',
        entregable: e,
        tarea: null,
        etiquetaTarea: 'Horas propias',
        horas: n,
        observaciones: h.observaciones || '',
        fuera: fuera,
        alerta: alertaDeadlineHorasEntregable(e, [{ fecha: h.fecha, horas: n }])
      });
    });
    (state.horas || []).forEach(function (h) {
      var t = findById(state.tareas, h.tarea_id);
      if (!t || t.estado === 'cancelada') return;
      var e = entregableDeTarea(t);
      if (!e || e.estado === 'cancelada') return;
      var n = Number(h.horas);
      if (!isFinite(n) || n <= 0) return;
      var fueraHora = !!(e.fecha_fin && h.fecha > e.fecha_fin);
      var fueraTarea = !!(t.fecha_fin && e.fecha_fin && t.fecha_fin > e.fecha_fin);
      pushItem(h.fecha, n, {
        origen: 'tarea',
        entregable: e,
        tarea: t,
        etiquetaTarea: t.nombre,
        horas: n,
        observaciones: h.observaciones || '',
        fuera: fueraHora || fueraTarea,
        alerta: alertaDeadlineTarea(t, e, [{ fecha: h.fecha, horas: n }])
      });
    });
    return Object.keys(byFecha).sort().reverse().map(function (k) {
      var g = byFecha[k];
      g.horas = Math.round(g.horas * 100) / 100;
      g.items.sort(function (a, b) {
        var oa = a.origen === 'proyecto' ? '0' : (a.origen === 'tarea' ? '2' : '1');
        var ob = b.origen === 'proyecto' ? '0' : (b.origen === 'tarea' ? '2' : '1');
        var na = oa + (a.entregable.nombre || '') + (a.etiquetaTarea || '');
        var nb = ob + (b.entregable.nombre || '') + (b.etiquetaTarea || '');
        return na.localeCompare(nb, 'es');
      });
      return g;
    });
  }

  function renderHorasConciliacion() {
    var p = proyectoSel();
    if (!p) return '<p class="gp-empty">Elegí un proyecto para ver la conciliación de horas.</p>';
    var grupos = gruposHorasConciliacion();
    if (!grupos.length) {
      return '<p class="gp-empty">No hay horas consumidas. Cargá fecha + horas reales en el proyecto, el entregable y/o cada tarea.</p>';
    }
    var total = 0;
    var nFuera = 0;
    var rows = '';
    grupos.forEach(function (g) {
      total += g.horas;
      rows += '<tr class="gp-hora-dia">' +
        '<td>' + formatFecha(g.fecha) + '</td>' +
        '<td colspan="2"><strong>Total del día</strong></td>' +
        '<td class="gp-col-horas"><strong>' + esc(formatHoras(g.horas)) + '</strong></td>' +
        '<td></td>' +
        '<td></td>' +
      '</tr>';
      g.items.forEach(function (it) {
        if (it.fuera) nFuera++;
        rows += '<tr class="gp-hora-item' + (it.fuera ? ' gp-row-dl' : '') + '">' +
          '<td></td>' +
          '<td class="gp-hora-ent">' + esc(it.entregable.nombre) + '</td>' +
          '<td class="' + (it.origen === 'tarea' ? 'gp-hora-tar' : 'gp-hora-propia' + (it.origen === 'proyecto' ? ' gp-hora-proy' : '')) + '">' + esc(it.etiquetaTarea) + htmlAlertaDeadline(it.alerta) + '</td>' +
          '<td class="gp-col-horas">' + esc(formatHoras(it.horas)) + '</td>' +
          '<td class="gp-hora-obs-cell">' + esc(it.observaciones || '—') + '</td>' +
          '<td class="' + (it.fuera ? 'gp-hora-fuera' : '') + '">' + (it.fuera ? 'Fuera de deadline' : '—') + '</td>' +
        '</tr>';
      });
    });
    var banner = nFuera
      ? '<div class="gp-dl-banner" role="status">' +
          '<span class="gp-alerta-dl" aria-hidden="true">' + ICO.warn + '</span>' +
          nFuera + ' carga(s) de horas están fuera del deadline del proyecto o del entregable.' +
        '</div>'
      : '';
    return banner +
      '<p class="gp-field-hint" style="margin:0 0 0.65rem">Conciliación de horas consumidas (reales) por fecha. El total es la suma de horas propias del proyecto más las de los entregables y las tareas.</p>' +
      '<div class="gp-tabla-wrap"><table class="gp-tabla gp-tabla-horas">' +
        '<thead><tr><th>Fecha</th><th>Entregable</th><th>Tarea</th><th>Horas cons.</th><th>Observaciones</th><th>Control</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr><td colspan="3"><strong>Total consumido</strong></td><td class="gp-col-horas"><strong>' + esc(formatHoras(Math.round(total * 100) / 100)) + '</strong></td><td></td><td></td></tr></tfoot>' +
      '</table></div>';
  }

  function renderShell() {
    var el = root();
    if (!el) return;
    var p = proyectoSel();
    var canCrear = can('crear_proyecto');
    var canEdit = can('editar_proyecto');
    var canDel = can('eliminar_proyecto');
    var optsProy = '<option value="">Seleccioná un proyecto</option>' + state.proyectos.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === state.selectedId ? ' selected' : '') + '>' + esc(x.nombre) + '</option>';
    }).join('');

    el.innerHTML =
      '<div class="gp-header">' +
        '<h1 class="vista-titulo">' +
          '<span class="vista-titulo-icon" aria-hidden="true">' + ICO.folder + '</span>' +
          'Gestión de Proyectos' +
        '</h1>' +
      '</div>' +
      '<p style="color:#666;margin:0 0 1rem;font-size:0.92rem">Planes de trabajo: proyecto → entregables → tareas y dependencias. Las horas consumidas se cargan por fecha en el proyecto, el entregable y/o las tareas (el total del proyecto es la suma). Si una tarea o las horas superan el deadline, aparece una alerta para ajustar fechas.</p>' +
      (state.loading ? '<p class="loading">Cargando planes…</p>' : '') +
      renderCardsProyecto() +
      '<div class="gp-toolbar">' +
        '<div class="gp-filtros">' +
          '<div class="form-group"><label for="gp-sel-proy">Proyecto</label><select id="gp-sel-proy">' + optsProy + '</select></div>' +
          '<div class="form-group"><label for="gp-orden-ent">Ordenar entregables</label><select id="gp-orden-ent">' + optionsOrdenEntregables() + '</select></div>' +
          '<label class="gp-check"><input type="checkbox" id="gp-solo-ent"' + (state.soloEntregables ? ' checked' : '') + '> Solo entregables</label>' +
        '</div>' +
        '<div class="gp-acciones">' +
          (canCrear ? '<button type="button" class="gp-btn gp-btn-nueva" data-gp="nuevo-proy"><span class="btn-icon">' + ICO.plus + '</span>Nuevo proyecto</button>' : '') +
          (canEdit && p ? '<button type="button" class="gp-btn gp-btn-ghost" data-gp="edit-proy"><span class="btn-icon">' + ICO.pencil + '</span>Editar proyecto</button>' : '') +
          (canDel && p ? '<button type="button" class="gp-btn gp-btn-danger" data-gp="del-proy"><span class="btn-icon">' + ICO.trash + '</span>Eliminar proyecto</button>' : '') +
          (canCrear && p ? '<button type="button" class="gp-btn gp-btn-ghost" data-gp="nuevo-ent"><span class="btn-icon">' + ICO.plus + '</span>Nuevo entregable</button>' : '') +
          (p ? '<button type="button" class="gp-btn gp-btn-excel" data-gp="xlsx"><span class="btn-icon">' + ICO.download + '</span>Excel</button>' : '') +
          (p ? '<button type="button" class="gp-btn gp-btn-ghost" data-gp="pdf"><span class="btn-icon">' + ICO.pdf + '</span>PDF one-page</button>' : '') +
        '</div>' +
      '</div>' +
      (p ? renderResumen() : '') +
      (p ? '<div class="gp-tabs">' +
        '<button type="button" class="' + (state.tab === 'plan' ? 'activo' : '') + '" data-gp="tab" data-tab="plan"><span class="tab-icon">' + ICO.list + '</span>To-Do / Plan</button>' +
        '<button type="button" class="' + (state.tab === 'gantt' ? 'activo' : '') + '" data-gp="tab" data-tab="gantt"><span class="tab-icon">' + ICO.gantt + '</span>Gantt</button>' +
        '<button type="button" class="' + (state.tab === 'horas' ? 'activo' : '') + '" data-gp="tab" data-tab="horas"><span class="tab-icon">' + ICO.clock + '</span>Horas cons.</button>' +
      '</div>' : '') +
      '<div class="gp-panel' + (state.tab === 'plan' ? ' activo' : '') + '" id="gp-panel-plan">' + (p ? renderPlanTabla() : '') + '</div>' +
      '<div class="gp-panel' + (state.tab === 'gantt' ? ' activo' : '') + '" id="gp-panel-gantt">' + (p ? renderGantt() : '') + '</div>' +
      '<div class="gp-panel' + (state.tab === 'horas' ? ' activo' : '') + '" id="gp-panel-horas">' + (p ? renderHorasConciliacion() : '') + '</div>';
  }

  function findById(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function onClick(ev) {
    var t = ev.target.closest('[data-gp]');
    if (!t) return;
    var a = t.getAttribute('data-gp');
    var id = t.getAttribute('data-id');
    if (a === 'cerrar-modal') { cerrarModal(); return; }
    if (a === 'tab') { state.tab = t.getAttribute('data-tab') || 'plan'; renderShell(); return; }
    if (a === 'sel-proy') {
      state.selectedId = id;
      localStorage.setItem(LS_PROY, id);
      recargarTodo();
      return;
    }
    if (a === 'nuevo-proy') { if (can('crear_proyecto')) formProyecto(null); return; }
    if (a === 'edit-proy') { if (can('editar_proyecto')) formProyecto(proyectoSel()); return; }
    if (a === 'del-proy') {
      var p = proyectoSel();
      if (p && can('eliminar_proyecto')) eliminar('gp_proyecto', p.id, '¿Eliminar el proyecto «' + p.nombre + '» y todo su plan?');
      return;
    }
    if (a === 'nuevo-ent') { if (can('crear_proyecto') && state.selectedId) formEntregable(null); return; }
    if (a === 'toggle-ent') {
      state.collapsed[id] = !state.collapsed[id];
      renderShell();
      return;
    }
    if (a === 'add-tar') { if (can('crear_proyecto')) formTarea(null, id); return; }
    if (a === 'add-dep') { if (can('crear_proyecto')) formDependencia(null, id); return; }
    if (a === 'edit-ent') { if (can('editar_proyecto')) formEntregable(findById(state.entregables, id)); return; }
    if (a === 'del-ent') {
      var e = findById(state.entregables, id);
      if (e && can('eliminar_proyecto')) eliminar('gp_entregable', id, '¿Eliminar el entregable «' + e.nombre + '», sus tareas y dependencias?');
      return;
    }
    if (a === 'edit-tar') { if (can('editar_proyecto')) formTarea(findById(state.tareas, id)); return; }
    if (a === 'del-tar') {
      var tar = findById(state.tareas, id);
      if (tar && can('eliminar_proyecto')) eliminar('gp_tarea', id, '¿Eliminar la tarea «' + tar.nombre + '»?');
      return;
    }
    if (a === 'edit-dep') { if (can('editar_proyecto')) formDependencia(findById(state.dependencias, id)); return; }
    if (a === 'del-dep') {
      if (can('eliminar_proyecto')) eliminar('gp_dependencia', id, '¿Eliminar esta dependencia?');
      return;
    }
    if (a === 'move-ent') {
      moverEntregable(id, t.getAttribute('data-delta'));
      return;
    }
    if (a === 'xlsx') { exportarExcel(); return; }
    if (a === 'pdf') { exportarPdf(); return; }
  }

  function onChange(ev) {
    var t = ev.target;
    if (t && t.id === 'gp-sel-proy') {
      state.selectedId = t.value || null;
      if (state.selectedId) localStorage.setItem(LS_PROY, state.selectedId);
      recargarTodo();
      return;
    }
    if (t && t.id === 'gp-solo-ent') {
      state.soloEntregables = !!t.checked;
      localStorage.setItem(LS_SOLO, state.soloEntregables ? '1' : '0');
      renderShell();
      return;
    }
    if (t && t.id === 'gp-orden-ent') {
      var modo = t.value || 'inicio';
      state.ordenEntregables = modo;
      localStorage.setItem(LS_ORDEN, modo);
      renderShell();
      return;
    }
    var a = t && t.getAttribute && t.getAttribute('data-gp');
    var id = t && t.getAttribute && t.getAttribute('data-id');
    if (a === 'est-ent' && can('editar_proyecto')) cambiarEstado('gp_entregable', id, t.value);
    if (a === 'est-tar' && can('editar_proyecto')) cambiarEstado('gp_tarea', id, t.value);
  }

  function filasPlanExcel() {
    var rows = [['Nivel', 'Tipo', 'Nombre', 'Alcance', 'Fecha inicio', 'Fecha fin', 'Responsable', 'Estado', 'Avance %', 'Horas consumidas']];
    var p = proyectoSel();
    if (p) {
      rows.push(['0', 'Proyecto', p.nombre, p.alcance || '', excelDate(p.fecha_inicio), excelDate(p.fecha_fin), labelResponsable(p), labelEstado(p.estado, true), Number(progresoProyecto(p).toFixed(2)), excelHoras(horasProyecto())]);
    }
    entregablesVista().forEach(function (e) {
      var pr = progresoEntregable(e);
      rows.push(['1', 'Entregable', e.nombre, e.alcance || '', excelDate(e.fecha_inicio), excelDate(e.fecha_fin), labelResponsable(e), labelEstado(e.estado, false), pr == null ? null : Number(Number(pr).toFixed(2)), excelHoras(horasEntregable(e))]);
      if (state.soloEntregables) return;
      tareasDe(e.id).forEach(function (t) {
        var pt = progresoTarea(t);
        rows.push(['2', 'Tarea', t.nombre, t.alcance || '', excelDate(t.fecha_inicio), excelDate(t.fecha_fin), labelResponsable(t), labelEstado(t.estado, false), pt == null ? null : Number(Number(pt).toFixed(2)), excelHoras(horasDeTarea(t))]);
      });
      depsDe(e.id).forEach(function (d) {
        rows.push(['2', 'Dependencia', d.descripcion, '', null, null, labelResponsable(d), '', null, null]);
      });
    });
    return rows;
  }

  function filasConciliacionExcel() {
    var rows = [['Fecha', 'Entregable', 'Tarea', 'Origen', 'Horas consumidas', 'Observaciones', 'Fuera de deadline']];
    gruposHorasConciliacion().forEach(function (g) {
      g.items.forEach(function (it) {
        rows.push([
          excelDate(g.fecha),
          it.entregable.nombre,
          it.origen === 'proyecto' ? 'Horas propias del proyecto' : (it.tarea ? it.tarea.nombre : null),
          it.origen === 'proyecto' ? 'Proyecto' : (it.origen === 'tarea' ? 'Tarea' : 'Entregable'),
          excelHoras(it.horas),
          it.observaciones || '',
          it.fuera ? 'Sí' : 'No'
        ]);
      });
    });
    return rows;
  }

  function exportarExcel() {
    if (!global.XLSX) {
      alert('No está disponible la librería Excel.');
      return;
    }
    var p = proyectoSel();
    if (!p) return;
    var k = kpisPlan();
    var resumen = [
      ['KPI', 'Valor'],
      ['Proyecto', p.nombre],
      ['Alcance', p.alcance || ''],
      ['Avance %', Number(k.pct.toFixed(2))],
      ['Esperado a hoy %', Number(k.esperado.toFixed(2))],
      ['SPI', Number(k.spi.toFixed(4))],
      ['Entregables hechos', k.hechasE],
      ['Entregables total', k.totalE],
      ['Tareas hechas', k.hechasT],
      ['Tareas total', k.totalT],
      ['Pendientes', k.pend],
      ['En curso', k.curso],
      ['Vencidas', k.venc],
      ['Fuera de deadline', k.deadline],
      ['Horas consumidas', excelHoras(k.horas)]
    ];
    var wsResumen = XLSX.utils.aoa_to_sheet(resumen);
    estilarHojaTabla(wsResumen, 0, { tipoCol: 0, nombreCol: 0, wrapCols: [1] });
    wsResumen['!cols'] = [{ wch: 22 }, { wch: 72 }];
    var alcanceCell = wsResumen[XLSX.utils.encode_cell({ r: 2, c: 1 })];
    if (alcanceCell) {
      alcanceCell.s = {
        font: xlFont(false, XL.ink, 11),
        alignment: { wrapText: true, vertical: 'top' },
        border: xlBorder(),
        fill: xlFill(XL.white)
      };
    }
    wsResumen['!rows'] = [{ hpt: 22 }, { hpt: 18 }, { hpt: 48 }];

    var wsPlan = XLSX.utils.aoa_to_sheet(filasPlanExcel());
    estilarHojaTabla(wsPlan, 0, { tipoCol: 1, nombreCol: 2, wrapCols: [2, 3], dateCols: [4, 5] });
    wsPlan['!cols'] = [
      { wch: 8 }, { wch: 14 }, { wch: 36 }, { wch: 42 }, { wch: 12 },
      { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 16 }
    ];

    var wsHoras = XLSX.utils.aoa_to_sheet(filasConciliacionExcel());
    estilarHojaTabla(wsHoras, 0, { tipoCol: 3, nombreCol: 1, wrapCols: [1, 2, 5], dateCols: [0] });
    wsHoras['!cols'] = [
      { wch: 12 }, { wch: 28 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 18 }
    ];

    var wsGantt = hojaGanttExcel(p, k);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsPlan, 'Plan');
    XLSX.utils.book_append_sheet(wb, wsHoras, 'Horas cons.');
    XLSX.utils.book_append_sheet(wb, wsGantt, 'Gantt');
    var safe = (p.nombre || 'plan').replace(/[^\w\-]+/g, '_').slice(0, 40);
    XLSX.writeFile(wb, 'Plan_Trabajo_' + safe + '_' + fechaHoyYmd() + '.xlsx', { cellStyles: true, cellDates: false });
  }

  var printCleanupBound = false;

  function limpiarImpresionPdf() {
    document.body.classList.remove('gp-printing');
    var mount = document.getElementById('gp-print-root');
    if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
    var prev = document.body.getAttribute('data-gp-title-prev');
    if (prev != null) {
      document.title = prev;
      document.body.removeAttribute('data-gp-title-prev');
    }
  }

  function asegurarLimpiezaPrint() {
    if (printCleanupBound) return;
    printCleanupBound = true;
    window.addEventListener('afterprint', limpiarImpresionPdf);
    if (window.matchMedia) {
      try {
        window.matchMedia('print').addEventListener('change', function (e) {
          if (!e.matches) limpiarImpresionPdf();
        });
      } catch (err) { /* ignore */ }
    }
  }

  function exportarPdf() {
    var p = proyectoSel();
    if (!p) return;
    state.tab = 'gantt';
    renderShell();
    var node = document.getElementById('gp-onepager');
    if (!node) {
      alert('No se pudo armar el one-page.');
      return;
    }
    asegurarLimpiezaPrint();
    limpiarImpresionPdf();
    var clone = node.cloneNode(true);
    clone.removeAttribute('id');
    var mount = document.createElement('div');
    mount.id = 'gp-print-root';
    mount.setAttribute('aria-hidden', 'true');
    mount.appendChild(clone);
    document.body.appendChild(mount);
    document.body.setAttribute('data-gp-title-prev', document.title);
    document.title = 'Plan de trabajo — ' + (p.nombre || 'plan');
    document.body.classList.add('gp-printing');
    window.print();
  }

  function ensureMounted() {
    var el = root();
    if (!el || state.mounted) return;
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    state.mounted = true;
    state.soloEntregables = localStorage.getItem(LS_SOLO) === '1';
    var ordenGuardado = localStorage.getItem(LS_ORDEN);
    var modosOk = ORDEN_MODOS.some(function (x) { return x.v === ordenGuardado; });
    state.ordenEntregables = modosOk ? ordenGuardado : 'inicio';
  }

  function init(o) {
    opts = o || opts;
    ensureMounted();
  }

  function show() {
    ensureMounted();
    recargarTodo();
  }

  global.FornitaliaGestionProyectos = {
    init: init,
    show: show,
    recargarCatalogos: function () {
      return cargarCatalogos().then(function () {
        if (root()) renderShell();
      }).catch(function () { /* catálogo opcional si la vista no está activa */ });
    }
  };
})(window);
