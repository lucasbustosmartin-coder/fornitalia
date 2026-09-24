/**
 * Ayuda al clic (mismo método que Flujo de caja).
 * Botón .th-help + <template> → popover #th-help-popover (handler en dashboard-flujo-caja.html).
 * window.FornitaliaHelp
 */
(function (global) {
  'use strict';

  var SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function btn(tplId, aria) {
    return '<button type="button" class="th-help th-help--inline" data-help-template="' + escAttr(tplId) +
      '" aria-label="' + escAttr(aria || 'Ayuda') + '" title="Ayuda">' + SVG + '</button>';
  }

  function tpl(tplId, innerHtml) {
    return '<template id="' + escAttr(tplId) + '"><div class="th-help-rich-content">' + (innerHtml || '') + '</div></template>';
  }

  function inline(tplId, aria, innerHtml) {
    return btn(tplId, aria) + tpl(tplId, innerHtml);
  }

  function row(tplId, aria, innerHtml) {
    return '<div class="flujo-panel-help-row">' + inline(tplId, aria, innerHtml) + '</div>';
  }

  function header(iconHtml, title, tplId, aria, innerHtml) {
    return '<div class="dashboard-header-row">' +
      '<h1 class="vista-titulo"><span class="vista-titulo-icon" aria-hidden="true">' + (iconHtml || '') + '</span>' + title + '</h1>' +
      btn(tplId, aria) +
      '</div>' + tpl(tplId, innerHtml);
  }

  function tabMark(act) {
    return act ? '<span class="lyp-tab-activo-mark">Activo</span>' : '';
  }

  function tabButton(className, act, extraAttrs, innerHtml) {
    var cls = String(className || '').replace(/\s+/g, ' ').trim();
    if (act) cls = (cls ? cls + ' ' : '') + 'activo';
    return '<button type="button" role="tab" class="' + escAttr(cls) + '"' +
      (extraAttrs ? ' ' + extraAttrs : '') +
      (act ? ' aria-selected="true" aria-current="true" title="Vista activa"' : ' aria-selected="false"') + '>' +
      (innerHtml || '') + tabMark(act) + '</button>';
  }

  function setTabActivo(btn, on) {
    if (!btn) return;
    if (on) {
      btn.classList.add('activo');
      btn.setAttribute('aria-selected', 'true');
      btn.setAttribute('aria-current', 'true');
      btn.setAttribute('title', 'Vista activa');
      if (!btn.querySelector('.lyp-tab-activo-mark')) {
        var mark = document.createElement('span');
        mark.className = 'lyp-tab-activo-mark';
        mark.textContent = 'Activo';
        btn.appendChild(mark);
      }
      return;
    }
    btn.classList.remove('activo');
    btn.setAttribute('aria-selected', 'false');
    btn.removeAttribute('aria-current');
    if (btn.getAttribute('title') === 'Vista activa') btn.removeAttribute('title');
    var old = btn.querySelector('.lyp-tab-activo-mark');
    if (old) old.parentNode.removeChild(old);
  }

  function syncTabsActivo(buttons, activeEl) {
    Array.prototype.forEach.call(buttons || [], function (b) {
      setTabActivo(b, b === activeEl);
    });
  }

  global.FornitaliaHelp = {
    SVG: SVG,
    btn: btn,
    tpl: tpl,
    inline: inline,
    row: row,
    header: header,
    tabMark: tabMark,
    tabButton: tabButton,
    setTabActivo: setTabActivo,
    syncTabsActivo: syncTabsActivo
  };
})(window);
