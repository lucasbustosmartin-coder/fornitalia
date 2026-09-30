/**
 * Mensajes de la app (confirmación y aviso). No usar confirm() ni alert() del navegador.
 * API: FornitaliaMensajes.confirmar(mensaje, opciones) → Promise<boolean>
 *      FornitaliaMensajes.avisar(mensaje, opciones) → Promise<void>
 */
(function (global) {
  var cola = [];
  var activo = false;
  var nodo = null;

  var SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var SVG_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  function asegurar() {
    if (nodo) return nodo;
    var style = document.createElement('style');
    style.textContent = [
      '#fn-msg-backdrop{position:fixed;inset:0;z-index:31000;display:none;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,.45);}',
      '#fn-msg-backdrop.activo{display:flex;}',
      '#fn-msg-backdrop .fn-msg{background:#fff;border-radius:12px;width:max-content;max-width:min(95vw,32rem);min-width:min(92vw,17rem);max-height:min(85vh,36rem);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.2);}',
      '#fn-msg-backdrop .fn-msg-header{padding:1rem 1.25rem;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:.75rem;}',
      '#fn-msg-backdrop .fn-msg-header h2{margin:0;font-size:1.15rem;font-weight:650;color:#1a1a1a;}',
      '#fn-msg-backdrop .fn-msg-body{padding:1rem 1.25rem 1.15rem;overflow:auto;-webkit-overflow-scrolling:touch;}',
      '#fn-msg-backdrop .fn-msg-texto{margin:0;color:#333;line-height:1.5;white-space:pre-line;}',
      '#fn-msg-backdrop .fn-msg-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem;margin-top:1rem;}',
      '#fn-msg-backdrop .fn-msg-actions .btn{min-height:2.75rem;border-radius:8px;box-sizing:border-box;}',
      '@media (max-width:480px){#fn-msg-backdrop .fn-msg{width:100%;max-width:100%;}#fn-msg-backdrop .fn-msg-actions{flex-direction:column;}#fn-msg-backdrop .fn-msg-actions .btn{width:100%;font-size:16px;}}'
    ].join('');
    document.head.appendChild(style);
    var backdrop = document.createElement('div');
    backdrop.id = 'fn-msg-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML =
      '<div class="fn-msg" role="dialog" aria-modal="true" aria-labelledby="fn-msg-titulo">' +
        '<div class="fn-msg-header">' +
          '<h2 id="fn-msg-titulo">Confirmar</h2>' +
          '<button type="button" class="modal-close" id="fn-msg-cerrar" aria-label="Cerrar"><span class="icon-close">' + SVG_X + '</span></button>' +
        '</div>' +
        '<div class="fn-msg-body">' +
          '<p id="fn-msg-texto" class="fn-msg-texto"></p>' +
          '<div class="fn-msg-actions">' +
            '<button type="button" class="btn" id="fn-msg-cancelar"><span class="btn-icon">' + SVG_X + '</span><span class="fn-msg-label">Cancelar</span></button>' +
            '<button type="button" class="btn btn-primary" id="fn-msg-aceptar"><span class="btn-icon">' + SVG_CHECK + '</span><span class="fn-msg-label">Aceptar</span></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);
    nodo = {
      backdrop: backdrop,
      titulo: backdrop.querySelector('#fn-msg-titulo'),
      texto: backdrop.querySelector('#fn-msg-texto'),
      aceptar: backdrop.querySelector('#fn-msg-aceptar'),
      cancelar: backdrop.querySelector('#fn-msg-cancelar'),
      cerrar: backdrop.querySelector('#fn-msg-cerrar'),
      labelAceptar: backdrop.querySelector('#fn-msg-aceptar .fn-msg-label'),
      labelCancelar: backdrop.querySelector('#fn-msg-cancelar .fn-msg-label')
    };
    return nodo;
  }

  function drenar() {
    if (activo || !cola.length) return;
    var item = cola.shift();
    activo = true;
    var ui = asegurar();
    var opts = item.opts || {};
    var esAviso = opts.modo === 'alert';
    ui.titulo.textContent = opts.titulo || (esAviso ? 'Aviso' : 'Confirmar');
    ui.texto.textContent = String(opts.mensaje == null ? '' : opts.mensaje);
    ui.labelAceptar.textContent = opts.aceptar || (esAviso ? 'Entendido' : 'Aceptar');
    ui.labelCancelar.textContent = opts.cancelar || 'Cancelar';
    ui.cancelar.hidden = !!esAviso;
    ui.aceptar.className = 'btn ' + (opts.peligro ? 'btn-danger' : 'btn-primary');
    ui.backdrop.classList.add('activo');
    ui.backdrop.setAttribute('aria-hidden', 'false');

    function terminar(valor) {
      ui.backdrop.classList.remove('activo');
      ui.backdrop.setAttribute('aria-hidden', 'true');
      ui.aceptar.onclick = null;
      ui.cancelar.onclick = null;
      ui.cerrar.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      ui.backdrop.removeEventListener('mousedown', onDown, true);
      ui.backdrop.removeEventListener('click', onClick, true);
      activo = false;
      item.resolve(valor);
      drenar();
    }
    function onKey(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        terminar(esAviso ? undefined : false);
      }
    }
    var mouseEnFondo = false;
    function onDown(ev) { mouseEnFondo = ev.target === ui.backdrop; }
    function onClick(ev) {
      if (ev.target === ui.backdrop && mouseEnFondo) terminar(esAviso ? undefined : false);
      mouseEnFondo = false;
    }
    ui.aceptar.onclick = function () { terminar(esAviso ? undefined : true); };
    ui.cancelar.onclick = function () { terminar(false); };
    ui.cerrar.onclick = function () { terminar(esAviso ? undefined : false); };
    document.addEventListener('keydown', onKey, true);
    ui.backdrop.addEventListener('mousedown', onDown, true);
    ui.backdrop.addEventListener('click', onClick, true);
    ui.aceptar.focus();
  }

  function encolar(opts) {
    return new Promise(function (resolve) {
      cola.push({ opts: opts, resolve: resolve });
      drenar();
    });
  }

  function esPeligro(mensaje, opciones) {
    if (opciones && opciones.peligro != null) return !!opciones.peligro;
    return /^¿Eliminar/.test(String(mensaje || '').trim());
  }

  function confirmar(mensaje, opciones) {
    opciones = opciones || {};
    return encolar({
      modo: 'confirm',
      mensaje: mensaje,
      titulo: opciones.titulo || 'Confirmar',
      aceptar: opciones.aceptar || 'Aceptar',
      cancelar: opciones.cancelar || 'Cancelar',
      peligro: esPeligro(mensaje, opciones)
    });
  }

  function avisar(mensaje, opciones) {
    opciones = opciones || {};
    return encolar({
      modo: 'alert',
      mensaje: mensaje,
      titulo: opciones.titulo || 'Aviso',
      aceptar: opciones.aceptar || 'Entendido'
    });
  }

  global.FornitaliaMensajes = { confirmar: confirmar, avisar: avisar };
})(typeof window !== 'undefined' ? window : globalThis);
