/**
 * Bandeja To-Do (mismo modelo que Everfit): tareas, recurrencia, responsable usuario o perfil.
 * Permisos: ver_todo, crear_todo, editar_todo, eliminar_todo, completar_todo.
 */
(function (global) {
  var ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';
  var client = null;
  var hasPermFn = function () { return false; };
  var getUserId = function () { return ''; };
  var userPermissions = [];
  var currentUserId = '';
  var currentUserRole = '';
  var ROL_ORDER = ['admin', 'encargado', 'visor'];
  var todoBooted = false;

  function syncPerms() {
    var keys = ['ver_todo', 'crear_todo', 'editar_todo', 'eliminar_todo', 'completar_todo', 'ver_configuracion'];
    userPermissions = keys.filter(function (p) { return !!hasPermFn(p); });
    currentUserId = getUserId() || '';
  }

  function showToast(mensaje) {
    if (global.FornitaliaMensajes && global.FornitaliaMensajes.avisar) {
      global.FornitaliaMensajes.avisar(String(mensaje == null ? '' : mensaje));
    }
  }

  function showConfirm(mensaje, textoConfirmar, onConfirm, onCancel, textoCancelar, tituloModal, opciones) {
    var extraSrc = opciones && opciones.extra;
    var extra = extraSrc && extraSrc.texto ? { texto: extraSrc.texto, peligro: !!extraSrc.danger } : null;
    if (!global.FornitaliaMensajes || !global.FornitaliaMensajes.confirmar) return;
    global.FornitaliaMensajes.confirmar(String(mensaje == null ? '' : mensaje), {
      titulo: tituloModal || 'Confirmar',
      aceptar: textoConfirmar || 'Confirmar',
      cancelar: textoCancelar == null ? 'Cancelar' : textoCancelar,
      extra: extra
    }).then(function (val) {
      if (val === 'extra' && extraSrc && typeof extraSrc.onClick === 'function') extraSrc.onClick();
      else if (val === true && typeof onConfirm === 'function') onConfirm();
      else if (typeof onCancel === 'function') onCancel();
    });
  }

  function userProfileComboLabel(u) {
    if (!u) return '—';
    var name = (u.label || u.nombre_usuario || '').trim() || (u.email || '').trim();
    var role = u.role_label || u.role || '';
    if (role) return name + ' (' + role + ')';
    return name || '—';
  }

  function esc(v) {
    if (v == null || v === '') return '–';
    return String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escHtmlMsg(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var SVG_HELP_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';

  function todoHtmlAyudaDescripcion(desc) {
    var t = desc == null ? '' : String(desc).trim();
    if (!t) return '';
    return '<button type="button" class="th-help th-help--inline" data-help="' + escHtmlMsg(t) + '" aria-label="Descripción de la tarea" title="Ayuda">' + SVG_HELP_ICON + '</button>';
  }

  function todoHtmlTitulo(row) {
    return '<div class="todo-titulo-cell"><span class="todo-titulo-texto">' + esc(row && row.titulo) + '</span>' + todoHtmlAyudaDescripcion(row && row.descripcion) + '</div>';
  }

  function setupBackdropCloseOnlyOnRealClick(backdrop, onClose) {
    if (!backdrop || typeof onClose !== 'function') return;
    var mousedownOnBackdrop = false;
    backdrop.addEventListener('mousedown', function (e) { mousedownOnBackdrop = (e.target === backdrop); }, true);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop && mousedownOnBackdrop) onClose();
      mousedownOnBackdrop = false;
    }, true);
  }

  function excelSerialTodo(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_ARGENTINA,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    var parts = {};
    fmt.formatToParts(d).forEach(function (p) { if (p.type !== 'literal') parts[p.type] = p.value; });
    var y = Number(parts.year), m = Number(parts.month), day = Number(parts.day);
    var hh = Number(parts.hour), mm = Number(parts.minute);
    if (!y || !m || !day) return null;
    var utc = Date.UTC(y, m - 1, day);
    var serial = (utc - Date.UTC(1899, 11, 30)) / 86400000;
    return serial + ((hh * 60 + mm) / 1440);
  }


      var todoPersonaFloatEl = null;
      var todoPersonaFloatEmail = '';
      var todoPersonaFloatHideTimer = null;
      var todoPersonaFloatAnchor = null;
      var todoPersonaHintsReady = false;

      function ensureTodoPersonaFloat() {
        if (todoPersonaFloatEl) return todoPersonaFloatEl;
        var el = document.createElement('div');
        el.id = 'todo-persona-float';
        el.className = 'todo-persona-float oculto';
        el.setAttribute('role', 'tooltip');
        el.innerHTML =
          '<span class="todo-persona-float-email" id="todo-persona-float-email"></span>' +
          '<button type="button" class="todo-persona-copy" id="todo-persona-float-copy">' +
            '<span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span>' +
            'Copiar email' +
          '</button>';
        document.body.appendChild(el);
        el.addEventListener('mouseenter', function() {
          if (todoPersonaFloatHideTimer) { clearTimeout(todoPersonaFloatHideTimer); todoPersonaFloatHideTimer = null; }
        });
        el.addEventListener('mouseleave', function() { ocultarTodoPersonaFloat(120); });
        el.querySelector('#todo-persona-float-copy').addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          copiarTextoPortapapeles(todoPersonaFloatEmail).then(function() {
            showToast('Email copiado.', 'success');
          }).catch(function() {
            showToast('No se pudo copiar el email.', 'error');
          });
        });
        todoPersonaFloatEl = el;
        return el;
      }

      function posicionarTodoPersonaFloat(anchor) {
        var float = ensureTodoPersonaFloat();
        var r = anchor.getBoundingClientRect();
        var top = r.bottom + 6;
        var left = r.left;
        float.style.top = top + 'px';
        float.style.left = left + 'px';
        var fr = float.getBoundingClientRect();
        if (fr.right > window.innerWidth - 8) {
          left = Math.max(8, window.innerWidth - fr.width - 8);
          float.style.left = left + 'px';
        }
        if (fr.bottom > window.innerHeight - 8) {
          top = Math.max(8, r.top - fr.height - 6);
          float.style.top = top + 'px';
        }
      }

      function mostrarTodoPersonaFloat(anchor, email) {
        var em = String(email || '').trim();
        if (!em || !anchor) return;
        if (todoPersonaFloatHideTimer) { clearTimeout(todoPersonaFloatHideTimer); todoPersonaFloatHideTimer = null; }
        todoPersonaFloatAnchor = anchor;
        todoPersonaFloatEmail = em;
        var float = ensureTodoPersonaFloat();
        var emailEl = document.getElementById('todo-persona-float-email');
        if (emailEl) emailEl.textContent = em;
        float.classList.remove('oculto');
        posicionarTodoPersonaFloat(anchor);
      }

      function ocultarTodoPersonaFloat(delayMs) {
        if (todoPersonaFloatHideTimer) clearTimeout(todoPersonaFloatHideTimer);
        var ms = delayMs != null ? delayMs : 0;
        todoPersonaFloatHideTimer = setTimeout(function() {
          todoPersonaFloatHideTimer = null;
          if (todoPersonaFloatEl) todoPersonaFloatEl.classList.add('oculto');
          todoPersonaFloatAnchor = null;
          document.querySelectorAll('.todo-persona-hint.activo').forEach(function(el) { el.classList.remove('activo'); });
        }, ms);
      }

      function todoHtmlCeldaPersona(label, email) {
        var em = String(email || '').trim();
        if (!em) return esc(label || '—');
        return '<span class="todo-persona-hint" tabindex="0" data-email="' + escHtmlMsg(em) + '" title="Ver email">' +
          esc(label || em) + '</span>';
      }

      function setupTodoPersonaHints() {
        if (todoPersonaHintsReady) return;
        todoPersonaHintsReady = true;
        var puedeHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        document.addEventListener('mouseover', function(e) {
          if (!puedeHover) return;
          var hint = e.target.closest && e.target.closest('.todo-persona-hint');
          if (!hint || !hint.getAttribute('data-email')) return;
          if (e.relatedTarget && hint.contains(e.relatedTarget)) return;
          mostrarTodoPersonaFloat(hint, hint.getAttribute('data-email'));
        });
        document.addEventListener('mouseout', function(e) {
          if (!puedeHover) return;
          var hint = e.target.closest && e.target.closest('.todo-persona-hint');
          if (!hint) return;
          if (e.relatedTarget && (hint.contains(e.relatedTarget) || (todoPersonaFloatEl && todoPersonaFloatEl.contains(e.relatedTarget)))) return;
          ocultarTodoPersonaFloat(160);
        });
        document.addEventListener('focusin', function(e) {
          var hint = e.target.closest && e.target.closest('.todo-persona-hint');
          if (!hint || !hint.getAttribute('data-email')) return;
          mostrarTodoPersonaFloat(hint, hint.getAttribute('data-email'));
        });
        document.addEventListener('focusout', function(e) {
          var hint = e.target.closest && e.target.closest('.todo-persona-hint');
          if (!hint) return;
          if (e.relatedTarget && (hint.contains(e.relatedTarget) || (todoPersonaFloatEl && todoPersonaFloatEl.contains(e.relatedTarget)))) return;
          ocultarTodoPersonaFloat(160);
        });
        document.addEventListener('click', function(e) {
          var hint = e.target.closest && e.target.closest('.todo-persona-hint');
          if (hint && hint.getAttribute('data-email') && !puedeHover) {
            e.preventDefault();
            var activo = hint.classList.contains('activo');
            document.querySelectorAll('.todo-persona-hint.activo').forEach(function(el) { el.classList.remove('activo'); });
            if (!activo) {
              hint.classList.add('activo');
              mostrarTodoPersonaFloat(hint, hint.getAttribute('data-email'));
            } else {
              ocultarTodoPersonaFloat(0);
            }
            return;
          }
          if (todoPersonaFloatEl && !todoPersonaFloatEl.classList.contains('oculto')) {
            if (!e.target.closest('.todo-persona-hint') && !todoPersonaFloatEl.contains(e.target)) {
              ocultarTodoPersonaFloat(0);
            }
          }
        });
        window.addEventListener('scroll', function() {
          if (todoPersonaFloatAnchor && todoPersonaFloatEl && !todoPersonaFloatEl.classList.contains('oculto')) {
            posicionarTodoPersonaFloat(todoPersonaFloatAnchor);
          }
        }, true);
        window.addEventListener('resize', function() {
          if (todoPersonaFloatAnchor && todoPersonaFloatEl && !todoPersonaFloatEl.classList.contains('oculto')) {
            posicionarTodoPersonaFloat(todoPersonaFloatAnchor);
          }
        });
      }
      var TODO_LISTA_ACTUAL = [];
      var TODO_HECHAS_HOY = [];
      var todoModuleReady = false;
      var TODO_MATRIZ_ESTADOS = ['pendiente', 'en_curso', 'vencida', 'hecha', 'cancelada'];

      function todoPuedeVerMatriz() {
        return currentUserRole === 'admin' || currentUserRole === 'encargado';
      }

      function syncTodoMatrizTabVisibility() {
        var tab = document.getElementById('todo-tab-matriz');
        var puede = todoPuedeVerMatriz();
        if (tab) tab.style.display = puede ? '' : 'none';
        if (!puede) activarTodoTab('tareas');
      }

      function activarTodoTab(nombre) {
        var tabs = document.querySelectorAll('#todo-tabs [data-todo-tab]');
        var panels = {
          tareas: document.getElementById('todo-panel-tareas'),
          matriz: document.getElementById('todo-panel-matriz')
        };
        if (nombre === 'matriz' && !todoPuedeVerMatriz()) nombre = 'tareas';
        tabs.forEach(function(btn) {
          var on = btn.getAttribute('data-todo-tab') === nombre;
          btn.classList.toggle('activo', on);
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        Object.keys(panels).forEach(function(k) {
          if (!panels[k]) return;
          panels[k].classList.toggle('activo', k === nombre);
        });
        if (nombre === 'matriz') renderTodoMatriz();
      }

      function todoResponsableKey(row) {
        if ((row.responsable_tipo || '') === 'rol') {
          return 'rol:' + String(row.responsable_role || '');
        }
        return 'usuario:' + String(row.responsable_user_id || row.responsable_label || 'sin');
      }

      function todoResponsableMeta(row) {
        var tipo = row.responsable_tipo || 'usuario';
        var label = row.responsable_label || '—';
        var sub = tipo === 'rol' ? 'Perfil' : 'Usuario';
        return { key: todoResponsableKey(row), tipo: tipo, label: label, sub: sub };
      }

      function todoListaPorResponsableEstado(key, estado) {
        return todoListaFiltradaLocal().filter(function(r) {
          if (todoResponsableKey(r) !== key) return false;
          var est = todoEstadoParaConteo(r);
          return est === estado;
        });
      }

      function renderTodoMatriz() {
        var tbody = document.getElementById('todo-matriz-tbody');
        if (!tbody || !todoPuedeVerMatriz()) return;
        var rows = todoListaFiltradaLocal();
        var map = {};
        rows.forEach(function(r) {
          var meta = todoResponsableMeta(r);
          if (!map[meta.key]) {
            map[meta.key] = {
              key: meta.key,
              label: meta.label,
              tipo: meta.tipo,
              sub: meta.sub,
              counts: { pendiente: 0, en_curso: 0, vencida: 0, hecha: 0, cancelada: 0 }
            };
          }
          var est = todoEstadoParaConteo(r);
          if (map[meta.key].counts[est] == null) map[meta.key].counts[est] = 0;
          map[meta.key].counts[est] += 1;
        });
        var list = Object.keys(map).map(function(k) { return map[k]; });
        list.sort(function(a, b) {
          if (a.tipo !== b.tipo) return a.tipo === 'rol' ? -1 : 1;
          if (a.tipo === 'rol') {
            var ia = ROL_ORDER.indexOf(a.key.replace(/^rol:/, ''));
            var ib = ROL_ORDER.indexOf(b.key.replace(/^rol:/, ''));
            if (ia < 0) ia = 99;
            if (ib < 0) ib = 99;
            if (ia !== ib) return ia - ib;
          }
          return String(a.label).localeCompare(String(b.label), 'es');
        });
        if (!list.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="todo-empty">No hay tareas para los filtros seleccionados.</td></tr>';
          return;
        }
        tbody.innerHTML = list.map(function(item) {
          var total = TODO_MATRIZ_ESTADOS.reduce(function(acc, e) { return acc + (item.counts[e] || 0); }, 0);
          var cells = TODO_MATRIZ_ESTADOS.map(function(est) {
            var n = item.counts[est] || 0;
            if (n <= 0) {
              return '<td class="num"><span class="todo-matriz-count cero" aria-hidden="true">0</span></td>';
            }
            return '<td class="num"><button type="button" class="todo-matriz-count" data-key="' + esc(item.key) + '" data-estado="' + esc(est) + '" data-label="' + esc(item.label) + '" title="Ver tareas" aria-label="' + esc(item.label + ' · ' + labelEstadoTodo(est) + ': ' + n) + '">' + n + '</button></td>';
          }).join('');
          return '<tr>' +
            '<td class="sticky-col">' + esc(item.label) +
              '<div class="todo-matriz-sub">' + esc(item.sub) + '</div>' +
            '</td>' +
            cells +
            '<td class="num"><strong>' + total + '</strong></td>' +
          '</tr>';
        }).join('');
        tbody.querySelectorAll('.todo-matriz-count:not(.cero)').forEach(function(btn) {
          btn.addEventListener('click', function() {
            abrirModalTodoMatrizDetalle(
              btn.getAttribute('data-key'),
              btn.getAttribute('data-estado'),
              btn.getAttribute('data-label')
            );
          });
        });
      }

      function cerrarModalTodoMatrizDetalle() {
        var backdrop = document.getElementById('modal-todo-matriz-backdrop');
        if (!backdrop) return;
        backdrop.classList.add('oculto');
        backdrop.setAttribute('aria-hidden', 'true');
      }

      function abrirModalTodoMatrizDetalle(key, estado, labelResp) {
        if (!todoPuedeVerMatriz()) return;
        var rows = todoListaPorResponsableEstado(key, estado);
        var titulo = document.getElementById('modal-todo-matriz-titulo');
        var tbody = document.getElementById('todo-matriz-modal-tbody');
        if (titulo) {
          titulo.textContent = (labelResp || 'Responsable') + ' · ' + labelEstadoTodo(estado) + ' (' + rows.length + ')';
        }
        if (!tbody) return;
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="todo-empty">Sin tareas en este cruce.</td></tr>';
        } else {
          tbody.innerHTML = rows.map(function(row) {
            var est = todoEstadoParaConteo(row);
            var prio = Number(row.prioridad) || 2;
            return '<tr>' +
              '<td>' + todoHtmlTitulo(row) + '</td>' +
              '<td>' + esc(row.sede || 'Empresa') + '</td>' +
              '<td>' + esc(formatearVencimientoTodo(row.vencimiento_at)) + '</td>' +
              '<td><span class="todo-badge todo-badge-prio-' + prio + '">' + esc(labelPrioridadTodo(prio)) + '</span></td>' +
              '<td><span class="todo-badge todo-badge-' + esc(est) + '">' + esc(labelEstadoTodo(est)) + '</span></td>' +
              '<td>' + (row.estado_modificado_email
                ? todoHtmlCeldaPersona(row.estado_modificado_label, row.estado_modificado_email)
                : esc(row.estado_modificado_label || '—')) + '</td>' +
              '<td>' + esc(labelRecurrenciaTodo(row.recurrencia)) + '</td>' +
            '</tr>';
          }).join('');
        }
        var backdrop = document.getElementById('modal-todo-matriz-backdrop');
        if (backdrop) {
          backdrop.classList.remove('oculto');
          backdrop.setAttribute('aria-hidden', 'false');
        }
      }

      function todoVistaMenuActiva() {
        var v = document.getElementById('view-todo');
        return !!(v && v.style.display !== 'none');
      }

      function fechaHoyYYYYMMDDArgentina() {
        return new Date().toLocaleDateString('en-CA', { timeZone: ZONA_ARGENTINA });
      }

      function fechaAddDaysYYYYMMDDArgentina(yyyyMmDd, days) {
        var parts = String(yyyyMmDd || '').split('-');
        var y = Number(parts[0]);
        var m = Number(parts[1]);
        var d = Number(parts[2]);
        if (!y || !m || !d) return fechaHoyYYYYMMDDArgentina();
        var utc = Date.UTC(y, m - 1, d + Number(days || 0));
        return new Date(utc).toLocaleDateString('en-CA', { timeZone: 'UTC' });
      }

      function esDomingoYYYYMMDD(yyyyMmDd) {
        var parts = String(yyyyMmDd || '').split('-');
        if (parts.length !== 3) return false;
        var y = Number(parts[0]);
        var m = Number(parts[1]);
        var d = Number(parts[2]);
        if (!y || !m || !d) return false;
        return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
      }

      /** Diaria: bloquear Hecha solo si el día de vencimiento (AR) es posterior a hoy. No mira la hora. */
      function todoDiariaHechaAntesDelDia(row) {
        if (!row || (row.recurrencia || '') !== 'diaria') return false;
        if (!row.vencimiento_at) return false;
        var d = new Date(row.vencimiento_at);
        if (isNaN(d.getTime())) return false;
        var diaVenc = d.toLocaleDateString('en-CA', { timeZone: ZONA_ARGENTINA });
        return diaVenc > fechaHoyYYYYMMDDArgentina();
      }

      function todoEstadoParaConteo(row) {
        var raw = (row && row.estado) || 'pendiente';
        if (raw === 'en_curso') return 'en_curso';
        return (row && row.estado_efectivo) || raw;
      }

      function formatearVencimientoTodo(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('es-AR', {
          timeZone: ZONA_ARGENTINA,
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false
        });
      }

      function labelEstadoTodo(est) {
        var map = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha', cancelada: 'Cancelada', vencida: 'Vencida' };
        return map[est] || est || '—';
      }

      function labelPrioridadTodo(p) {
        if (Number(p) === 1) return 'Alta';
        if (Number(p) === 3) return 'Baja';
        return 'Media';
      }

      function labelRecurrenciaTodo(r) {
        var map = { ninguna: 'Única', diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral', anual: 'Anual' };
        return map[r] || r || '—';
      }

      function todoTextoBusqueda(row) {
        return ((row.titulo || '') + ' ' + (row.descripcion || '') + ' ' + (row.responsable_label || '')).toLowerCase();
      }

      function todoListaFiltradaLocal() {
        var q = ((document.getElementById('todo-filtro-q') || {}).value || '').trim().toLowerCase();
        if (!q) return TODO_LISTA_ACTUAL.slice();
        return TODO_LISTA_ACTUAL.filter(function(row) {
          return todoTextoBusqueda(row).indexOf(q) !== -1;
        });
      }

      function renderTodoResumenDesdeFiltros() {
        var rows = todoListaFiltradaLocal();
        var q = ((document.getElementById('todo-filtro-q') || {}).value || '').trim().toLowerCase();
        var sum = { pendientes: 0, en_curso: 0, vencidas: 0, hechas_hoy: 0 };
        rows.forEach(function(r) {
          var est = todoEstadoParaConteo(r);
          if (est === 'pendiente') sum.pendientes += 1;
          else if (est === 'en_curso') sum.en_curso += 1;
          else if (est === 'vencida') sum.vencidas += 1;
        });
        (TODO_HECHAS_HOY || []).forEach(function(r) {
          if (q && todoTextoBusqueda(r).indexOf(q) === -1) return;
          sum.hechas_hoy += 1;
        });
        renderTodoResumen(sum);
      }

      function renderTodoResumen(sum) {
        var s = sum || {};
        var elP = document.getElementById('todo-sum-pendientes');
        var elC = document.getElementById('todo-sum-en-curso');
        var elV = document.getElementById('todo-sum-vencidas');
        var elH = document.getElementById('todo-sum-hechas');
        if (elP) elP.textContent = String(s.pendientes != null ? s.pendientes : 0);
        if (elC) elC.textContent = String(s.en_curso != null ? s.en_curso : 0);
        if (elV) elV.textContent = String(s.vencidas != null ? s.vencidas : 0);
        if (elH) elH.textContent = String(s.hechas_hoy != null ? s.hechas_hoy : 0);
      }

      function syncTodoTablaAccionSticky() {
        var table = document.getElementById('todo-tabla');
        if (!table) return;
        if (window.matchMedia('(max-width: 768px)').matches) {
          table.style.removeProperty('--todo-accion-sticky-left');
          return;
        }
        var row = table.querySelector('tbody tr[data-id]');
        if (!row) {
          table.style.removeProperty('--todo-accion-sticky-left');
          return;
        }
        var cells = row.querySelectorAll('td');
        if (cells.length < 4) return;
        var left = 0;
        for (var i = 0; i < 3; i++) left += cells[i].getBoundingClientRect().width;
        table.style.setProperty('--todo-accion-sticky-left', Math.round(left) + 'px');
      }

      function renderTodoTabla() {
        var tbody = document.getElementById('todo-tbody');
        if (!tbody) return;
        var rows = todoListaFiltradaLocal();
        var canComplete = userPermissions.indexOf('completar_todo') !== -1;
        var canEdit = userPermissions.indexOf('editar_todo') !== -1;
        var canDelete = userPermissions.indexOf('eliminar_todo') !== -1;
        var iconEdit = '<span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></span>';
        var iconDel = '<span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></span>';
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="9" class="todo-empty">No hay tareas para los filtros seleccionados.</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(function(row) {
          var est = todoEstadoParaConteo(row);
          var prio = Number(row.prioridad) || 2;
          var partes = [];
          if (canComplete && est !== 'hecha' && row.estado !== 'cancelada') {
            var bloquearHecha = todoDiariaHechaAntesDelDia(row);
            var titleHecha = bloquearHecha ? ' title="Se puede dar por hecha el día de vencimiento (no hace falta esperar la hora)"' : '';
            partes.push(
              '<select class="todo-estado-select" data-id="' + esc(row.id) + '" data-recurrencia="' + esc(row.recurrencia || '') + '" data-vencimiento="' + esc(row.vencimiento_at || '') + '" aria-label="Cambiar estado">' +
              '<option value="">Estado…</option>' +
              '<option value="pendiente"' + (row.estado === 'pendiente' ? ' selected' : '') + '>Pendiente</option>' +
              '<option value="en_curso"' + (row.estado === 'en_curso' ? ' selected' : '') + '>En curso</option>' +
              '<option value="hecha"' + (bloquearHecha ? ' disabled' : '') + titleHecha + '>Hecha</option>' +
              '<option value="cancelada">Cancelada</option>' +
              '</select>'
            );
          } else if (canComplete && (est === 'hecha' || row.estado === 'cancelada')) {
            partes.push(
              '<select class="todo-estado-select" data-id="' + esc(row.id) + '" aria-label="Reabrir estado">' +
              '<option value="">Reabrir…</option>' +
              '<option value="pendiente">Pendiente</option>' +
              '<option value="en_curso">En curso</option>' +
              '</select>'
            );
          }
          if (canEdit) {
            partes.push('<button type="button" class="btn-todo-icon todo-btn-editar" data-id="' + esc(row.id) + '" title="Editar tarea" aria-label="Editar tarea">' + iconEdit + '</button>');
          }
          if (canDelete) {
            partes.push('<button type="button" class="btn-todo-icon danger todo-btn-eliminar" data-id="' + esc(row.id) + '" data-recurrencia="' + esc(row.recurrencia || 'ninguna') + '" title="Eliminar tarea" aria-label="Eliminar tarea">' + iconDel + '</button>');
          }
          var acciones = partes.length ? ('<div class="todo-row-actions">' + partes.join('') + '</div>') : '—';
          var respHtml = (row.responsable_tipo === 'usuario' && row.responsable_email)
            ? todoHtmlCeldaPersona(row.responsable_label, row.responsable_email)
            : esc(row.responsable_label || '—');
          var usrHtml = row.estado_modificado_email
            ? todoHtmlCeldaPersona(row.estado_modificado_label, row.estado_modificado_email)
            : esc(row.estado_modificado_label || '—');
          return '<tr data-id="' + esc(row.id) + '">' +
            '<td class="col-tarea">' + todoHtmlTitulo(row) + '</td>' +
            '<td class="col-sede">' + esc(row.sede || 'Empresa') + '</td>' +
            '<td class="col-responsable">' + respHtml + '</td>' +
            '<td class="col-accion">' + acciones + '</td>' +
            '<td class="col-venc">' + esc(formatearVencimientoTodo(row.vencimiento_at)) + '</td>' +
            '<td class="col-prio"><span class="todo-badge todo-badge-prio-' + prio + '">' + esc(labelPrioridadTodo(prio)) + '</span></td>' +
            '<td class="col-estado"><span class="todo-badge todo-badge-' + esc(est) + '">' + esc(labelEstadoTodo(est)) + '</span></td>' +
            '<td class="col-usuario">' + usrHtml + '</td>' +
            '<td class="col-rec">' + esc(labelRecurrenciaTodo(row.recurrencia)) + '</td>' +
          '</tr>';
        }).join('');
        tbody.querySelectorAll('.todo-estado-select').forEach(function(sel) {
          sel.addEventListener('change', function() {
            var id = sel.getAttribute('data-id');
            var estado = sel.value;
            if (!id || !estado) return;
            var rec = sel.getAttribute('data-recurrencia') || '';
            var venc = sel.getAttribute('data-vencimiento') || '';
            if (estado === 'hecha' && rec === 'diaria' && venc) {
              var dv = new Date(venc);
              if (!isNaN(dv.getTime())) {
                var diaVenc = dv.toLocaleDateString('en-CA', { timeZone: ZONA_ARGENTINA });
                if (diaVenc > fechaHoyYYYYMMDDArgentina()) {
                  showToast('Esta tarea diaria se puede dar por hecha a partir del día de vencimiento (cualquier hora de ese día).', 'info');
                  sel.value = '';
                  return;
                }
              }
            }
            client.rpc('todo_cambiar_estado', { p_instancia_id: id, p_estado: estado }).then(function(r) {
              if (r.error) {
                showToast(r.error.message || 'No se pudo actualizar.', 'error');
                sel.value = '';
                return;
              }
              showToast('Estado actualizado.', 'success');
              cargarTodoBandeja();
            });
          });
        });
        tbody.querySelectorAll('.todo-btn-editar').forEach(function(btn) {
          btn.addEventListener('click', function() {
            abrirModalTodoEditar(btn.getAttribute('data-id'));
          });
        });
        tbody.querySelectorAll('.todo-btn-eliminar').forEach(function(btn) {
          btn.addEventListener('click', function() {
            eliminarTodoInstancia(btn.getAttribute('data-id'), btn.getAttribute('data-recurrencia'));
          });
        });
        requestAnimationFrame(function() { syncTodoTablaAccionSticky(); });
      }

      function todoFiltroEstaActivo(el) {
        if (!el) return false;
        var v = (el.value || '').trim();
        if (el.id === 'todo-filtro-ventana') return v !== '' && v !== 'todas';
        return v !== '';
      }

      function syncTodoFiltrosActivos() {
        ['todo-filtro-estado', 'todo-filtro-prioridad', 'todo-filtro-ventana', 'todo-filtro-sede', 'todo-filtro-q'].forEach(function(id) {
          var el = document.getElementById(id);
          if (!el) return;
          var group = el.closest ? el.closest('.form-group') : el.parentElement;
          if (!group) return;
          var on = todoFiltroEstaActivo(el);
          group.classList.toggle('filtro-activo', on);
          if (on) {
            el.setAttribute('title', 'Filtro activo: el listado está recortado');
          } else {
            el.removeAttribute('title');
          }
        });
      }

      function cargarTodoBandeja() {
        if (!client || userPermissions.indexOf('ver_todo') === -1) return;
        syncTodoFiltrosActivos();
        var estadoEl = document.getElementById('todo-estado');
        var selEstado = document.getElementById('todo-filtro-estado');
        var filtroEstado = selEstado ? selEstado.value : 'abiertas';
        var filtroPrio = (document.getElementById('todo-filtro-prioridad') || {}).value || null;
        var filtroVentana = (document.getElementById('todo-filtro-ventana') || {}).value || 'hoy';
        var filtroSede = (document.getElementById('todo-filtro-sede') || {}).value || null;
        if (estadoEl) {
          estadoEl.style.display = 'block';
          estadoEl.textContent = 'Cargando bandeja…';
        }
        var pEstado = filtroEstado || null;
        var pPrio = filtroPrio ? Number(filtroPrio) : null;
        var filtrosInbox = { p_estado: pEstado, p_prioridad: pPrio, p_ventana: filtroVentana, p_sede: filtroSede || null };
        var filtrosHechasHoy = { p_prioridad: pPrio, p_sede: filtroSede || null };

        function pintarBandeja(results) {
          if (estadoEl) estadoEl.style.display = 'none';
          var listRes = results[0];
          var sedesRes = results[1];
          var hechasRes = results[2];
          TODO_HECHAS_HOY = (hechasRes && !hechasRes.error && Array.isArray(hechasRes.data)) ? hechasRes.data : [];
          var selSede = document.getElementById('todo-filtro-sede');
          if (selSede && sedesRes && !sedesRes.error && Array.isArray(sedesRes.data)) {
            var cur = selSede.value;
            selSede.innerHTML = '<option value="">Todas</option>' + (sedesRes.data || []).map(function(s) {
              return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
            }).join('');
            if (cur) selSede.value = cur;
            syncTodoFiltrosActivos();
          }
          if (!listRes || listRes.error) {
            if (estadoEl) {
              estadoEl.style.display = 'block';
              estadoEl.textContent = 'Error: ' + ((listRes && listRes.error && listRes.error.message) || 'No se pudo cargar el To-Do.');
            }
            TODO_LISTA_ACTUAL = [];
            renderTodoTabla();
            renderTodoResumenDesdeFiltros();
            renderTodoMatriz();
            return;
          }
          TODO_LISTA_ACTUAL = listRes.data || [];
          renderTodoTabla();
          renderTodoResumenDesdeFiltros();
          renderTodoMatriz();
        }

        // Listar de inmediato (no bloquear la UI). Materializar recurrencias en paralelo/background.
        Promise.all([
          client.rpc('todo_list_inbox', filtrosInbox),
          client.rpc('get_sucursales_list'),
          client.rpc('todo_list_hechas_hoy', filtrosHechasHoy)
        ]).then(function(results) {
          pintarBandeja(results);
          client.rpc('todo_generar_instancias_todas').then(function(genRes) {
            if (genRes && genRes.error) return;
            if (genRes && genRes.data > 0) {
              Promise.all([
                client.rpc('todo_list_inbox', filtrosInbox),
                client.rpc('get_sucursales_list'),
                client.rpc('todo_list_hechas_hoy', filtrosHechasHoy)
              ]).then(pintarBandeja).catch(function() {});
            }
          }).catch(function() {});
        }).catch(function(e) {
          if (estadoEl) {
            estadoEl.style.display = 'block';
            estadoEl.textContent = 'Error: ' + (e && e.message ? e.message : e);
          }
        });
      }

      function exportarTodoExcel() {
        if (!window.XLSX) {
          showToast('No está disponible la librería Excel.', 'error');
          return;
        }
        var rows = todoListaFiltradaLocal();
        var header = ['Título', 'Descripción', 'Sede', 'Responsable', 'Tipo responsable', 'Vencimiento', 'Prioridad', 'Estado', 'Usuario', 'Recurrencia', 'Completada'];
        var aoa = [header].concat(rows.map(function(r) {
          return [
            r.titulo || '',
            r.descripcion || '',
            r.sede || 'Empresa',
            r.responsable_label || '',
            r.responsable_tipo || '',
            excelSerialTodo(r.vencimiento_at),
            Number(r.prioridad) || null,
            labelEstadoTodo(todoEstadoParaConteo(r)),
            r.estado_modificado_label || '',
            labelRecurrenciaTodo(r.recurrencia),
            excelSerialTodo(r.completada_at)
          ];
        }));
        var ws = window.XLSX.utils.aoa_to_sheet(aoa);
        for (var ri = 1; ri < aoa.length; ri++) {
          [5, 10].forEach(function(ci) {
            var cell = ws[window.XLSX.utils.encode_cell({ r: ri, c: ci })];
            if (cell && typeof cell.v === 'number') cell.z = 'dd/mm/yyyy hh:mm';
          });
        }
        var wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'To-Do');
        var nombre = 'todo_' + fechaHoyYYYYMMDDArgentina() + '.xlsx';
        window.XLSX.writeFile(wb, nombre);
      }

      function syncTodoFormRecurrencia() {
        var rec = (document.getElementById('todo-nueva-recurrencia') || {}).value || 'ninguna';
        var wrapFecha = document.getElementById('todo-nueva-fecha-wrap');
        var wrapFin = document.getElementById('todo-nueva-fecha-fin-wrap');
        var wrapHora = document.getElementById('todo-nueva-hora-wrap');
        var wrapSem = document.getElementById('todo-nueva-dia-semana-wrap');
        var wrapMes = document.getElementById('todo-nueva-dia-mes-wrap');
        var labFecha = document.getElementById('todo-nueva-fecha-label');
        var hintFecha = document.getElementById('todo-nueva-fecha-hint');
        if (wrapFecha) wrapFecha.style.display = '';
        if (labFecha) labFecha.textContent = rec === 'ninguna' ? 'Fecha de vencimiento' : 'Primer vencimiento *';
        if (hintFecha) {
          hintFecha.style.display = 'block';
          hintFecha.textContent = rec === 'ninguna'
            ? 'No se asignan vencimientos en domingo (el comercio está cerrado).'
            : 'La serie arranca en esta fecha. No se generan ocurrencias en domingo. Diario +1 día (lun–sáb), semanal +7, trimestral +3 meses, etc.';
        }
        if (wrapFin) wrapFin.style.display = (rec === 'ninguna') ? 'none' : '';
        if (wrapHora) wrapHora.style.display = '';
        if (wrapSem) wrapSem.style.display = 'none';
        if (wrapMes) wrapMes.style.display = 'none';
        if (rec !== 'ninguna') {
          var fin = document.getElementById('todo-nueva-fecha-fin');
          var ini = document.getElementById('todo-nueva-fecha');
          var hoy = fechaHoyYYYYMMDDArgentina();
          if (ini && !ini.value) ini.value = hoy;
          if (fin && !fin.value && ini && ini.value) {
            fin.value = fechaAddDaysYYYYMMDDArgentina(ini.value, 14);
          }
          if (fin && ini && ini.value && fin.value && fin.value < ini.value) {
            fin.value = fechaAddDaysYYYYMMDDArgentina(ini.value, 14);
          }
        }
      }

      function syncTodoFormSede() {
        var modo = (document.getElementById('todo-nueva-sede-modo') || {}).value || 'todas';
        var wrap = document.getElementById('todo-nueva-sede-wrap');
        var sel = document.getElementById('todo-nueva-sede');
        if (wrap) wrap.style.display = modo === 'una' ? '' : 'none';
        if (sel) sel.required = modo === 'una';
      }

      function syncTodoFormResponsable() {
        var tipo = (document.getElementById('todo-nueva-resp-tipo') || {}).value || 'usuario';
        var wrapUser = document.getElementById('todo-nueva-resp-user-wrap');
        var wrapRol = document.getElementById('todo-nueva-resp-rol-wrap');
        var selUser = document.getElementById('todo-nueva-resp-user');
        var selRol = document.getElementById('todo-nueva-resp-rol');
        if (wrapUser) wrapUser.style.display = tipo === 'usuario' ? '' : 'none';
        if (wrapRol) wrapRol.style.display = tipo === 'rol' ? '' : 'none';
        if (selUser) selUser.required = tipo === 'usuario';
        if (selRol) selRol.required = tipo === 'rol';
      }

      function abrirModalTodoNueva() {
        var backdrop = document.getElementById('modal-todo-nueva-backdrop');
        if (!backdrop) return;
        var err = document.getElementById('todo-nueva-error');
        if (err) { err.style.display = 'none'; err.textContent = ''; }
        var form = document.getElementById('form-todo-nueva');
        if (form) form.reset();
        var fecha = document.getElementById('todo-nueva-fecha');
        if (fecha) fecha.value = fechaHoyYYYYMMDDArgentina();
        var hora = document.getElementById('todo-nueva-hora');
        if (hora && !hora.value) hora.value = '18:00';
        syncTodoFormRecurrencia();
        syncTodoFormResponsable();
        syncTodoFormSede();
        Promise.all([
          client.rpc('todo_list_usuarios'),
          client.rpc('todo_list_roles'),
          client.rpc('get_sucursales_list')
        ]).then(function(results) {
          var users = (!results[0].error && results[0].data) ? results[0].data : [];
          var roles = (!results[1].error && results[1].data) ? results[1].data : [];
          var sedes = (!results[2].error && Array.isArray(results[2].data)) ? results[2].data : [];
          var selUser = document.getElementById('todo-nueva-resp-user');
          var selRol = document.getElementById('todo-nueva-resp-rol');
          var selSede = document.getElementById('todo-nueva-sede');
          if (selUser) {
            selUser.innerHTML = '<option value="">Elegir usuario…</option>' + users.map(function(u) {
              return '<option value="' + esc(u.user_id) + '">' + esc(userProfileComboLabel(u)) + '</option>';
            }).join('');
            if (currentUserId) selUser.value = currentUserId;
          }
          if (selRol) {
            selRol.innerHTML = '<option value="">Elegir perfil…</option>' + roles.map(function(r) {
              return '<option value="' + esc(r.role) + '">' + esc(r.label || r.role) + '</option>';
            }).join('');
          }
          if (selSede) {
            selSede.innerHTML = '<option value="">Elegir sede…</option>' + sedes.map(function(s) {
              return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
            }).join('');
          }
          backdrop.classList.remove('oculto');
          backdrop.setAttribute('aria-hidden', 'false');
        });
      }

      function cerrarModalTodoNueva() {
        var backdrop = document.getElementById('modal-todo-nueva-backdrop');
        if (!backdrop) return;
        backdrop.classList.add('oculto');
        backdrop.setAttribute('aria-hidden', 'true');
      }

      var TODO_EDITAR_ROW = null;

      function cerrarModalTodoEditar() {
        var backdrop = document.getElementById('modal-todo-editar-backdrop');
        if (!backdrop) return;
        backdrop.classList.add('oculto');
        backdrop.setAttribute('aria-hidden', 'true');
        TODO_EDITAR_ROW = null;
      }

      function abrirModalTodoEditar(id) {
        if (userPermissions.indexOf('editar_todo') === -1) return;
        var row = null;
        for (var i = 0; i < TODO_LISTA_ACTUAL.length; i++) {
          if (String(TODO_LISTA_ACTUAL[i].id) === String(id)) { row = TODO_LISTA_ACTUAL[i]; break; }
        }
        if (!row) return;
        TODO_EDITAR_ROW = row;
        var err = document.getElementById('todo-editar-error');
        if (err) { err.style.display = 'none'; err.textContent = ''; }
        document.getElementById('todo-editar-id').value = row.id;
        document.getElementById('todo-editar-titulo').value = row.titulo || '';
        document.getElementById('todo-editar-desc').value = row.descripcion || '';
        document.getElementById('todo-editar-prioridad').value = String(row.prioridad || 2);
        var d = row.vencimiento_at ? new Date(row.vencimiento_at) : null;
        var fechaEl = document.getElementById('todo-editar-fecha');
        var horaEl = document.getElementById('todo-editar-hora');
        if (d && !isNaN(d.getTime())) {
          fechaEl.value = d.toLocaleDateString('en-CA', { timeZone: ZONA_ARGENTINA });
          horaEl.value = d.toLocaleTimeString('en-GB', { timeZone: ZONA_ARGENTINA, hour: '2-digit', minute: '2-digit', hour12: false });
        } else {
          fechaEl.value = fechaHoyYYYYMMDDArgentina();
          horaEl.value = '18:00';
        }
        var wrapPlant = document.getElementById('todo-editar-plantilla-wrap');
        var chkPlant = document.getElementById('todo-editar-plantilla');
        var esRec = row.recurrencia && row.recurrencia !== 'ninguna' && row.tarea_id;
        if (wrapPlant) wrapPlant.style.display = esRec ? '' : 'none';
        if (chkPlant) chkPlant.checked = false;
        client.rpc('get_sucursales_list').then(function(res) {
          var sedes = (!res.error && Array.isArray(res.data)) ? res.data : [];
          var sel = document.getElementById('todo-editar-sede');
          sel.innerHTML = '<option value="">(Sin sede)</option>' + sedes.map(function(s) {
            return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
          }).join('');
          if (row.sede) sel.value = row.sede;
          var backdrop = document.getElementById('modal-todo-editar-backdrop');
          backdrop.classList.remove('oculto');
          backdrop.setAttribute('aria-hidden', 'false');
        });
      }

      function eliminarTodoInstancia(id, recurrencia) {
        if (userPermissions.indexOf('eliminar_todo') === -1) {
          showToast('No tenés permiso para eliminar tareas.', 'error');
          return;
        }
        if (!id) return;
        var esRec = recurrencia && recurrencia !== 'ninguna';

        function ejecutarEliminar(eliminarPlantilla) {
          client.rpc('todo_eliminar_instancia', {
            p_instancia_id: id,
            p_eliminar_plantilla: !!eliminarPlantilla
          }).then(function(r) {
            if (r.error) {
              showToast(r.error.message || 'No se pudo eliminar.', 'error');
              return;
            }
            showToast(eliminarPlantilla ? 'Serie eliminada.' : 'Tarea eliminada.', 'success');
            cargarTodoBandeja();
          }).catch(function(ex) {
            showToast(ex && ex.message ? ex.message : 'No se pudo eliminar.', 'error');
          });
        }

        if (esRec) {
          showConfirm(
            '¿Eliminar esta ocurrencia?\n\nPodés borrar solo esta fila o toda la serie (desactiva la plantilla y quita pendientes/en curso).',
            'Solo esta',
            function() { ejecutarEliminar(false); },
            null,
            'Cancelar',
            'Eliminar tarea',
            {
              extra: {
                texto: 'Toda la serie',
                danger: true,
                onClick: function() { ejecutarEliminar(true); }
              }
            }
          );
        } else {
          showConfirm(
            '¿Eliminar esta tarea? No se volverá a generar.',
            'Eliminar',
            function() { ejecutarEliminar(false); },
            null,
            'Cancelar',
            'Eliminar tarea'
          );
        }
      }

      function setupTodoModule() {
        if (todoModuleReady) return;
        todoModuleReady = true;
        setupTodoPersonaHints();
        syncTodoMatrizTabVisibility();
        document.querySelectorAll('#todo-tabs [data-todo-tab]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            activarTodoTab(btn.getAttribute('data-todo-tab'));
          });
        });
        ['todo-filtro-estado', 'todo-filtro-prioridad', 'todo-filtro-ventana', 'todo-filtro-sede'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener('change', function() {
            if (id === 'todo-filtro-estado' && (el.value === 'hecha' || el.value === 'cancelada')) {
              var vent = document.getElementById('todo-filtro-ventana');
              if (vent && vent.value === 'hoy') vent.value = 'todas';
            }
            cargarTodoBandeja();
          });
        });
        var q = document.getElementById('todo-filtro-q');
        if (q) {
          var t = null;
          q.addEventListener('input', function() {
            syncTodoFiltrosActivos();
            if (t) clearTimeout(t);
            t = setTimeout(function() {
              renderTodoTabla();
              renderTodoResumenDesdeFiltros();
              renderTodoMatriz();
            }, 180);
          });
        }
        syncTodoFiltrosActivos();
        var btnExcel = document.getElementById('btn-todo-excel');
        if (btnExcel) btnExcel.addEventListener('click', exportarTodoExcel);
        var btnNueva = document.getElementById('btn-todo-nueva');
        if (btnNueva) btnNueva.addEventListener('click', function() {
          if (userPermissions.indexOf('crear_todo') === -1) return;
          abrirModalTodoNueva();
        });
        var closeBtn = document.getElementById('modal-todo-nueva-close');
        var cancelBtn = document.getElementById('todo-nueva-cancelar');
        var backdrop = document.getElementById('modal-todo-nueva-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', cerrarModalTodoNueva);
        if (cancelBtn) cancelBtn.addEventListener('click', cerrarModalTodoNueva);
        if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, cerrarModalTodoNueva);
        var closeEdit = document.getElementById('modal-todo-editar-close');
        var cancelEdit = document.getElementById('todo-editar-cancelar');
        var backdropEdit = document.getElementById('modal-todo-editar-backdrop');
        if (closeEdit) closeEdit.addEventListener('click', cerrarModalTodoEditar);
        if (cancelEdit) cancelEdit.addEventListener('click', cerrarModalTodoEditar);
        if (backdropEdit) setupBackdropCloseOnlyOnRealClick(backdropEdit, cerrarModalTodoEditar);
        var closeMatriz = document.getElementById('modal-todo-matriz-close');
        var backdropMatriz = document.getElementById('modal-todo-matriz-backdrop');
        if (closeMatriz) closeMatriz.addEventListener('click', cerrarModalTodoMatrizDetalle);
        if (backdropMatriz) setupBackdropCloseOnlyOnRealClick(backdropMatriz, cerrarModalTodoMatrizDetalle);
        var formEdit = document.getElementById('form-todo-editar');
        if (formEdit) {
          formEdit.addEventListener('submit', function(e) {
            e.preventDefault();
            if (userPermissions.indexOf('editar_todo') === -1) return;
            var err = document.getElementById('todo-editar-error');
            function showErr(msg) {
              if (!err) { showToast(msg, 'error'); return; }
              err.style.display = 'block';
              err.textContent = msg;
            }
            var id = (document.getElementById('todo-editar-id') || {}).value;
            var titulo = ((document.getElementById('todo-editar-titulo') || {}).value || '').trim();
            if (!id || !titulo) { showErr('El título es obligatorio.'); return; }
            var fecha = (document.getElementById('todo-editar-fecha') || {}).value || fechaHoyYYYYMMDDArgentina();
            var hora = (document.getElementById('todo-editar-hora') || {}).value || '23:59';
            if (esDomingoYYYYMMDD(fecha)) { showErr('El domingo el comercio está cerrado. Elegí otro día.'); return; }
            var vencIso = null;
            try {
              // Construir instante Argentina vía RPC helper no disponible en client; usar offset fijo AR (-03)
              vencIso = new Date(fecha + 'T' + (hora.length === 5 ? hora + ':00' : hora) + '-03:00').toISOString();
            } catch (ex) {
              showErr('Fecha/hora inválida.');
              return;
            }
            var sedeVal = (document.getElementById('todo-editar-sede') || {}).value || '';
            var btnG = document.getElementById('todo-editar-guardar');
            if (btnG) btnG.disabled = true;
            client.rpc('todo_editar_instancia', {
              p_instancia_id: id,
              p_titulo: titulo,
              p_descripcion: ((document.getElementById('todo-editar-desc') || {}).value || '').trim(),
              p_prioridad: Number((document.getElementById('todo-editar-prioridad') || {}).value || 2),
              p_vencimiento_at: vencIso,
              p_sede: sedeVal,
              p_actualizar_plantilla: !!(document.getElementById('todo-editar-plantilla') || {}).checked
            }).then(function(r) {
              if (btnG) btnG.disabled = false;
              if (r.error) { showErr(r.error.message || 'No se pudo guardar.'); return; }
              cerrarModalTodoEditar();
              showToast('Tarea actualizada.', 'success');
              cargarTodoBandeja();
            }).catch(function(ex) {
              if (btnG) btnG.disabled = false;
              showErr(ex && ex.message ? ex.message : String(ex));
            });
          });
        }
        var rec = document.getElementById('todo-nueva-recurrencia');
        if (rec) rec.addEventListener('change', syncTodoFormRecurrencia);
        var fechaNueva = document.getElementById('todo-nueva-fecha');
        if (fechaNueva) fechaNueva.addEventListener('change', syncTodoFormRecurrencia);
        var tipo = document.getElementById('todo-nueva-resp-tipo');
        if (tipo) tipo.addEventListener('change', syncTodoFormResponsable);
        var sedeModo = document.getElementById('todo-nueva-sede-modo');
        if (sedeModo) sedeModo.addEventListener('change', syncTodoFormSede);
        var form = document.getElementById('form-todo-nueva');
        if (form) {
          form.addEventListener('submit', function(e) {
            e.preventDefault();
            var err = document.getElementById('todo-nueva-error');
            function showErr(msg) {
              if (!err) { showToast(msg, 'error'); return; }
              err.style.display = 'block';
              err.textContent = msg;
            }
            var titulo = ((document.getElementById('todo-nueva-titulo') || {}).value || '').trim();
            if (!titulo) { showErr('El título es obligatorio.'); return; }
            var respTipo = (document.getElementById('todo-nueva-resp-tipo') || {}).value || 'usuario';
            var userId = (document.getElementById('todo-nueva-resp-user') || {}).value || null;
            var roleId = (document.getElementById('todo-nueva-resp-rol') || {}).value || null;
            if (respTipo === 'usuario' && !userId) { showErr('Elegí el usuario responsable.'); return; }
            if (respTipo === 'rol' && !roleId) { showErr('Elegí el perfil responsable.'); return; }
            var sedeModoVal = (document.getElementById('todo-nueva-sede-modo') || {}).value || 'todas';
            var sedeUna = (document.getElementById('todo-nueva-sede') || {}).value || null;
            if (sedeModoVal === 'una' && !sedeUna) { showErr('Elegí la sede.'); return; }
            var recurrencia = (document.getElementById('todo-nueva-recurrencia') || {}).value || 'ninguna';
            var fecha = (document.getElementById('todo-nueva-fecha') || {}).value || fechaHoyYYYYMMDDArgentina();
            var fechaFin = (document.getElementById('todo-nueva-fecha-fin') || {}).value || null;
            var hora = (document.getElementById('todo-nueva-hora') || {}).value || '23:59';
            if (!fecha) { showErr('Indicá el primer vencimiento.'); return; }
            if (esDomingoYYYYMMDD(fecha)) { showErr('El domingo el comercio está cerrado. Elegí otro día.'); return; }
            if (recurrencia === 'diaria' && !hora) { showErr('Indicá la hora.'); return; }
            if (recurrencia !== 'ninguna' && !fechaFin) { showErr('Indicá hasta qué fecha se replica la tarea.'); return; }
            if (recurrencia !== 'ninguna' && fechaFin && fechaFin < fecha) {
              showErr('«Replicar hasta» no puede ser anterior al primer vencimiento.');
              return;
            }
            var payload = {
              p_titulo: titulo,
              p_descripcion: ((document.getElementById('todo-nueva-desc') || {}).value || '').trim() || null,
              p_prioridad: Number((document.getElementById('todo-nueva-prioridad') || {}).value || 2),
              p_responsable_tipo: respTipo,
              p_responsable_user_id: respTipo === 'usuario' ? userId : null,
              p_responsable_role: respTipo === 'rol' ? roleId : null,
              p_recurrencia: recurrencia,
              p_hora_vencimiento: hora || null,
              p_dia_semana: null,
              p_dia_mes: null,
              p_fecha_inicio: fecha,
              p_fecha_fin: recurrencia === 'ninguna' ? null : fechaFin,
              p_vencimiento_at: null,
              p_aplica_todas_sedes: sedeModoVal === 'todas',
              p_sede: sedeModoVal === 'una' ? sedeUna : null
            };
            var btnGuardar = document.getElementById('todo-nueva-guardar');
            if (btnGuardar) btnGuardar.disabled = true;
            client.rpc('todo_crear_tarea', payload).then(function(r) {
              if (btnGuardar) btnGuardar.disabled = false;
              if (r.error) {
                showErr(r.error.message || 'No se pudo crear la tarea.');
                return;
              }
              cerrarModalTodoNueva();
              showToast('Tarea creada.', 'success');
              cargarTodoBandeja();
            }).catch(function(ex) {
              if (btnGuardar) btnGuardar.disabled = false;
              showErr(ex && ex.message ? ex.message : String(ex));
            });
          });
        }
        var todoResizeTimer = null;
        window.addEventListener('resize', function() {
          if (!todoVistaMenuActiva()) return;
          if (todoResizeTimer) clearTimeout(todoResizeTimer);
          todoResizeTimer = setTimeout(syncTodoTablaAccionSticky, 120);
        });
      }
      var configModuleReady = false;
      var CONFIG_LISTA_ACTUAL = [];
      var CONFIG_TAB = 'usuario';

      function configReasignTipo() {
        return CONFIG_TAB === 'perfil' ? 'rol' : 'usuario';
      }

      function activarConfigTab(nombre) {
        CONFIG_TAB = nombre === 'perfil' ? 'perfil' : 'usuario';
        document.querySelectorAll('#config-tabs [data-config-tab]').forEach(function(btn) {
          var on = btn.getAttribute('data-config-tab') === CONFIG_TAB;
          btn.classList.toggle('activo', on);
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        var fu = document.getElementById('config-filtros-usuario');
        var fp = document.getElementById('config-filtros-perfil');
        if (fu) fu.style.display = CONFIG_TAB === 'usuario' ? '' : 'none';
        if (fp) fp.style.display = CONFIG_TAB === 'perfil' ? '' : 'none';
        CONFIG_LISTA_ACTUAL = [];
        renderConfigReasignTabla();
      }

      function cargarConfigReasignCombos() {
        if (!client || userPermissions.indexOf('ver_configuracion') === -1) return;
        Promise.all([
          client.rpc('todo_list_usuarios'),
          client.rpc('todo_list_roles')
        ]).then(function(results) {
          var users = (!results[0].error && results[0].data) ? results[0].data : [];
          var roles = (!results[1].error && results[1].data) ? results[1].data : [];
          function fillUser(selId) {
            var sel = document.getElementById(selId);
            if (!sel) return;
            var cur = sel.value;
            sel.innerHTML = '<option value="">Elegir…</option>' + users.map(function(u) {
              return '<option value="' + esc(u.user_id) + '">' + esc(userProfileComboLabel(u)) + '</option>';
            }).join('');
            if (cur) sel.value = cur;
          }
          function fillRol(selId) {
            var sel = document.getElementById(selId);
            if (!sel) return;
            var cur = sel.value;
            sel.innerHTML = '<option value="">Elegir…</option>' + roles.map(function(r) {
              return '<option value="' + esc(r.role) + '">' + esc(r.label || r.role) + '</option>';
            }).join('');
            if (cur) sel.value = cur;
          }
          fillUser('config-from-user');
          fillUser('config-to-user');
          fillRol('config-from-rol');
          fillRol('config-to-rol');
        });
      }

      function renderConfigReasignTabla() {
        var tbody = document.getElementById('config-tbody');
        var chkAll = document.getElementById('config-check-all');
        if (!tbody) return;
        var rows = CONFIG_LISTA_ACTUAL || [];
        if (chkAll) chkAll.checked = false;
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="config-empty">Elegí origen y destino y tocá Buscar para ver las tareas abiertas.</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(function(row) {
          var est = row.estado_efectivo || row.estado || 'pendiente';
          var prio = Number(row.prioridad) || 2;
          return '<tr data-id="' + esc(row.id) + '">' +
            '<td class="chk"><input type="checkbox" class="config-row-check" data-id="' + esc(row.id) + '" aria-label="Seleccionar tarea" /></td>' +
            '<td>' + todoHtmlTitulo(row) + '</td>' +
            '<td>' + esc(row.sede || 'Empresa') + '</td>' +
            '<td>' + esc(formatearVencimientoTodo(row.vencimiento_at)) + '</td>' +
            '<td><span class="todo-badge todo-badge-prio-' + prio + '">' + esc(labelPrioridadTodo(prio)) + '</span></td>' +
            '<td><span class="todo-badge todo-badge-' + esc(est) + '">' + esc(labelEstadoTodo(est)) + '</span></td>' +
            '<td>' + esc(labelRecurrenciaTodo(row.recurrencia)) + '</td>' +
          '</tr>';
        }).join('');
      }

      function buscarConfigReasign() {
        if (!client || userPermissions.indexOf('ver_configuracion') === -1) return;
        var tipo = configReasignTipo();
        var estadoEl = document.getElementById('config-estado');
        var payload = { p_tipo: tipo, p_from_user_id: null, p_from_role: null };
        if (tipo === 'usuario') {
          var fromU = (document.getElementById('config-from-user') || {}).value || '';
          if (!fromU) { showToast('Elegí el usuario de origen.', 'info'); return; }
          payload.p_from_user_id = fromU;
        } else {
          var fromR = (document.getElementById('config-from-rol') || {}).value || '';
          if (!fromR) { showToast('Elegí el perfil de origen.', 'info'); return; }
          payload.p_from_role = fromR;
        }
        if (estadoEl) { estadoEl.style.display = 'block'; estadoEl.textContent = 'Buscando tareas…'; }
        client.rpc('todo_list_para_reasignar', payload).then(function(r) {
          if (estadoEl) estadoEl.style.display = 'none';
          if (r.error) {
            showToast(r.error.message || 'No se pudo listar.', 'error');
            CONFIG_LISTA_ACTUAL = [];
            renderConfigReasignTabla();
            return;
          }
          CONFIG_LISTA_ACTUAL = r.data || [];
          renderConfigReasignTabla();
          if (!CONFIG_LISTA_ACTUAL.length) showToast('No hay tareas abiertas para ese origen.', 'info');
        }).catch(function(ex) {
          if (estadoEl) estadoEl.style.display = 'none';
          showToast(ex && ex.message ? ex.message : 'No se pudo listar.', 'error');
        });
      }

      function idsConfigReasignSeleccionadas() {
        var ids = [];
        document.querySelectorAll('#config-tbody .config-row-check:checked').forEach(function(cb) {
          var id = cb.getAttribute('data-id');
          if (id) ids.push(id);
        });
        return ids;
      }

      function ejecutarConfigReasign(todas) {
        if (userPermissions.indexOf('ver_configuracion') === -1) {
          showToast('No tenés permiso para Configuración.', 'error');
          return;
        }
        var tipo = configReasignTipo();
        var payload = {
          p_tipo: tipo,
          p_from_user_id: null,
          p_to_user_id: null,
          p_from_role: null,
          p_to_role: null,
          p_instancia_ids: null,
          p_todas: !!todas
        };
        var origenLabel = '';
        var destLabel = '';
        if (tipo === 'usuario') {
          var fromU = document.getElementById('config-from-user');
          var toU = document.getElementById('config-to-user');
          payload.p_from_user_id = (fromU && fromU.value) || null;
          payload.p_to_user_id = (toU && toU.value) || null;
          if (!payload.p_from_user_id || !payload.p_to_user_id) {
            showToast('Elegí usuario de origen y destino.', 'info');
            return;
          }
          if (payload.p_from_user_id === payload.p_to_user_id) {
            showToast('El destino tiene que ser otro usuario.', 'info');
            return;
          }
          origenLabel = fromU.options[fromU.selectedIndex] ? fromU.options[fromU.selectedIndex].text : '';
          destLabel = toU.options[toU.selectedIndex] ? toU.options[toU.selectedIndex].text : '';
        } else {
          var fromR = document.getElementById('config-from-rol');
          var toR = document.getElementById('config-to-rol');
          payload.p_from_role = (fromR && fromR.value) || null;
          payload.p_to_role = (toR && toR.value) || null;
          if (!payload.p_from_role || !payload.p_to_role) {
            showToast('Elegí perfil de origen y destino.', 'info');
            return;
          }
          if (payload.p_from_role === payload.p_to_role) {
            showToast('El destino tiene que ser otro perfil.', 'info');
            return;
          }
          origenLabel = fromR.options[fromR.selectedIndex] ? fromR.options[fromR.selectedIndex].text : '';
          destLabel = toR.options[toR.selectedIndex] ? toR.options[toR.selectedIndex].text : '';
        }
        if (!todas) {
          var ids = idsConfigReasignSeleccionadas();
          if (!ids.length) {
            showToast('Marcá al menos una tarea, o usá Reasignar todas.', 'info');
            return;
          }
          payload.p_instancia_ids = ids;
        }
        var n = todas ? ((CONFIG_LISTA_ACTUAL && CONFIG_LISTA_ACTUAL.length) ? CONFIG_LISTA_ACTUAL.length : 'todas las') : idsConfigReasignSeleccionadas().length;
        var extra = todas ? ' También se mueven las plantillas recurrentes de ese origen.' : '';
        showConfirm(
          '¿Reasignar ' + n + ' tarea(s) de «' + origenLabel + '» a «' + destLabel + '»?' + extra,
          'Reasignar',
          function() {
            client.rpc('todo_reasignar', payload).then(function(r) {
              if (r.error) {
                showToast(r.error.message || 'No se pudo reasignar.', 'error');
                return;
              }
              var row = Array.isArray(r.data) ? r.data[0] : r.data;
              var ni = row && row.instancias != null ? row.instancias : 0;
              var np = row && row.plantillas != null ? row.plantillas : 0;
              showToast('Reasignadas ' + ni + ' tarea(s)' + (np ? ' y ' + np + ' plantilla(s)' : '') + '.', 'success');
              buscarConfigReasign();
            }).catch(function(ex) {
              showToast(ex && ex.message ? ex.message : 'No se pudo reasignar.', 'error');
            });
          },
          null,
          'Cancelar',
          'Reasignar tareas'
        );
      }

      function setupConfiguracionModule() {
        if (configModuleReady) return;
        configModuleReady = true;
        document.querySelectorAll('#config-tabs [data-config-tab]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            activarConfigTab(btn.getAttribute('data-config-tab'));
          });
        });
        var btnBuscar = document.getElementById('btn-config-buscar');
        if (btnBuscar) btnBuscar.addEventListener('click', buscarConfigReasign);
        var btnSel = document.getElementById('btn-config-seleccionadas');
        if (btnSel) btnSel.addEventListener('click', function() { ejecutarConfigReasign(false); });
        var btnTodas = document.getElementById('btn-config-todas');
        if (btnTodas) btnTodas.addEventListener('click', function() { ejecutarConfigReasign(true); });
        var chkAll = document.getElementById('config-check-all');
        if (chkAll) {
          chkAll.addEventListener('change', function() {
            var on = !!chkAll.checked;
            document.querySelectorAll('#config-tbody .config-row-check').forEach(function(cb) { cb.checked = on; });
          });
        }
      }

  function refrescarTodoVista() {
    syncPerms();
    var btnNueva = document.getElementById('btn-todo-nueva');
    if (btnNueva) btnNueva.style.display = userPermissions.indexOf('crear_todo') !== -1 ? 'inline-flex' : 'none';
    var reas = document.getElementById('todo-reasignar');
    if (reas) reas.style.display = userPermissions.indexOf('ver_configuracion') !== -1 ? '' : 'none';
    if (!client || userPermissions.indexOf('ver_todo') === -1) return;
    client.rpc('get_my_role').then(function (r) {
      currentUserRole = (!r.error && r.data != null) ? String(r.data) : '';
      syncTodoMatrizTabVisibility();
      cargarTodoBandeja();
      if (userPermissions.indexOf('ver_configuracion') !== -1) cargarConfigReasignCombos();
    });
  }

  global.FornitaliaTodo = {
    init: function (opts) {
      opts = opts || {};
      client = opts.client || null;
      hasPermFn = typeof opts.hasPerm === 'function' ? opts.hasPerm : hasPermFn;
      getUserId = typeof opts.getUserId === 'function' ? opts.getUserId : getUserId;
      syncPerms();
      if (!todoBooted) {
        setupTodoPersonaHints();
        setupTodoModule();
        setupConfiguracionModule();
        todoBooted = true;
      }
    },
    show: refrescarTodoVista
  };
})(typeof window !== 'undefined' ? window : globalThis);
