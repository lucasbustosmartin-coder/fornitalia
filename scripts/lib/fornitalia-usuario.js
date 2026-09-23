/**
 * Catálogo de usuarios para mostrar en tablas (nombre corto + tooltip email).
 * window.FornitaliaUsuario.cargar(client) → RPC get_usuarios_mostrar.
 */
(function (global) {
  'use strict';

  var map = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inicialesDesdeEmail(email) {
    var local = String(email || '').split('@')[0];
    var parts = local.split(/[.\-_]+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function nombreDe(u) {
    if (!u) return '';
    var n = String(u.nombre_usuario || '').trim();
    if (n) return n;
    var ini = inicialesDesdeEmail(u.email);
    return ini || String(u.email || '').trim();
  }

  function setUsuarios(list) {
    map = {};
    (list || []).forEach(function (u) {
      if (u && u.id) map[String(u.id)] = u;
    });
  }

  function perfil(id) {
    if (id == null || id === '') return null;
    return map[String(id)] || null;
  }

  function texto(id) {
    return nombreDe(perfil(id));
  }

  function email(id) {
    var u = perfil(id);
    return u ? String(u.email || '').trim() : '';
  }

  function primerId() {
    var i;
    for (i = 0; i < arguments.length; i++) {
      if (arguments[i]) return arguments[i];
    }
    return null;
  }

  function celda(id) {
    var nom = texto(id);
    if (!nom) return '<span class="lyp-user">—</span>';
    var em = email(id);
    if (em) {
      return '<span class="lyp-user" title="' + esc(em) + '">' + esc(nom) + '</span>';
    }
    return '<span class="lyp-user">' + esc(nom) + '</span>';
  }

  function celdaDe() {
    return celda(primerId.apply(null, arguments));
  }

  function textoDe() {
    return texto(primerId.apply(null, arguments));
  }

  async function cargar(client) {
    if (!client || typeof client.rpc !== 'function') return;
    var res = await client.rpc('get_usuarios_mostrar');
    if (res.error) throw res.error;
    var data = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { data = []; }
    }
    if (data && !Array.isArray(data) && Array.isArray(data.usuarios)) data = data.usuarios;
    setUsuarios(Array.isArray(data) ? data : []);
  }

  global.FornitaliaUsuario = {
    setUsuarios: setUsuarios,
    cargar: cargar,
    celda: celda,
    celdaDe: celdaDe,
    texto: texto,
    textoDe: textoDe,
    email: email,
    perfil: perfil
  };
})(typeof window !== 'undefined' ? window : this);
