'use strict';

/**
 * Conserva Fecha/Hora (Log) y Fecha (Versiones) ya escritas en Bitacora_tareas.xlsx
 * al regenerar desde los arrays del script. Copia local del helper LyP compartido
 * (../../scripts/lib/lyp-bitacora-fechas) para entornos sin monorepo.
 */
const fs = require('fs');
const path = require('path');

function loadXlsx() {
  try {
    return require('xlsx');
  } catch (e) {
    return require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
  }
}

function sheetToAoa(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) return null;
  return loadXlsx().utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

function keyLog(row) {
  return [String(row[2] || ''), String(row[3] || ''), String(row[4] || '')].join('\u0001');
}

function keyVer(row) {
  return String(row[0] || '');
}

function preservarFechasHistoricasLog(projectRoot, outPath, datosLog) {
  if (!fs.existsSync(outPath)) return datosLog;
  let wb;
  try {
    wb = loadXlsx().readFile(outPath);
  } catch (e) {
    return datosLog;
  }
  const prev = sheetToAoa(wb, 'Log');
  if (!prev || prev.length < 2) return datosLog;
  const map = new Map();
  for (let i = 1; i < prev.length; i++) {
    const row = prev[i] || [];
    const k = keyLog(row);
    if (!k || k === '\u0001\u0001') continue;
    if (!map.has(k)) map.set(k, { fecha: row[0], hora: row[1] });
  }
  return datosLog.map(function (row, idx) {
    if (idx === 0) return row;
    const old = map.get(keyLog(row));
    if (!old) return row;
    const out = row.slice();
    if (old.fecha != null && old.fecha !== '') out[0] = old.fecha;
    if (old.hora != null && old.hora !== '') out[1] = old.hora;
    return out;
  });
}

function preservarFechasHistoricasVersiones(projectRoot, outPath, versiones) {
  if (!fs.existsSync(outPath)) return versiones;
  let wb;
  try {
    wb = loadXlsx().readFile(outPath);
  } catch (e) {
    return versiones;
  }
  const prev = sheetToAoa(wb, 'Versiones');
  if (!prev || prev.length < 2) return versiones;
  const map = new Map();
  for (let i = 1; i < prev.length; i++) {
    const row = prev[i] || [];
    const k = keyVer(row);
    if (k) map.set(k, row[1]);
  }
  return versiones.map(function (row, idx) {
    if (idx === 0) return row;
    const oldFecha = map.get(keyVer(row));
    if (oldFecha == null || oldFecha === '') return row;
    const out = row.slice();
    out[1] = oldFecha;
    return out;
  });
}

module.exports = {
  preservarFechasHistoricasLog,
  preservarFechasHistoricasVersiones,
};
