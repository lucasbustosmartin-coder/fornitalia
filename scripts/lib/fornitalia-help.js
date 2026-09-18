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

  global.FornitaliaHelp = {
    SVG: SVG,
    btn: btn,
    tpl: tpl,
    inline: inline,
    row: row,
    header: header
  };
})(window);
