/**
 * Cotizaciones al día: tipos_cambio_global de Sistema Contable.
 * La tabla es de lectura pública (anon), el mismo acceso que usa Everfit.
 */
(function (root) {
  'use strict';
  var URL = 'https://zcvkqujfneyphoiaqvuj.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjdmtxdWpmbmV5cGhvaWFxdnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5NTM4MjIsImV4cCI6MjA3MTUyOTgyMn0.DQYhdzdnVxRonkcaNQzzPivwTiZvhF3gc8Fz2aYw6i4';
  var PAGE = 1000;
  var client = null;

  function getClient() {
    if (client) return client;
    if (!root.supabase || typeof root.supabase.createClient !== 'function') return null;
    client = root.supabase.createClient(URL, KEY);
    return client;
  }

  async function listar() {
    var c = getClient();
    if (!c) throw new Error('No se pudo leer la cotización global.');
    var all = [];
    var offset = 0;
    for (;;) {
      var res = await c.from('tipos_cambio_global')
        .select('fecha, usd_mep, usd_ccl, usd_oficial')
        .order('fecha', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (res.error) throw res.error;
      var chunk = res.data || [];
      all = all.concat(chunk);
      if (chunk.length < PAGE) break;
      offset += PAGE;
    }
    return all;
  }

  root.FornitaliaTipoCambioGlobal = { listar: listar };
})(typeof window !== 'undefined' ? window : this);
