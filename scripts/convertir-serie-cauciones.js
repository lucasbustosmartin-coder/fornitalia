/**
 * Lee Serie_Cauciones.xlsx (hoja Hoja1: Fecha, Tasa_Diaria) y genera serie_cauciones.json
 * para que el dashboard cargue las tasas diarias de caución.
 * Ejecutar: node convertir-serie-cauciones.js
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = path.join(__dirname, '..', 'Serie_Cauciones.xlsx');
const outPath = path.join(__dirname, '..', 'serie_cauciones.json');

function excelSerialToDateStr(serial) {
  if (serial == null || typeof serial !== 'number') return null;
  const date = XLSX.SSF.parse_date_code(serial);
  if (!date) return null;
  const y = date.y;
  const m = String(date.m).padStart(2, '0');
  const d = String(date.d).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Alineado al parseo del dashboard: Date, ISO, serial Excel o dd/mm/yyyy. */
function fechaCaucionRowToIso(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && !Number.isNaN(val)) {
    const iso = excelSerialToDateStr(val);
    if (iso) return iso;
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ddmmyyyy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (ddmmyyyy) {
    const d0 = parseInt(ddmmyyyy[1], 10);
    const m0 = parseInt(ddmmyyyy[2], 10);
    let y0 = parseInt(ddmmyyyy[3], 10);
    if (y0 < 100) y0 += y0 < 50 ? 2000 : 1900;
    if (d0 >= 1 && d0 <= 31 && m0 >= 1 && m0 <= 12 && y0 >= 1900) {
      return `${y0}-${String(m0).padStart(2, '0')}-${String(d0).padStart(2, '0')}`;
    }
  }
  return null;
}

const wb = XLSX.readFile(excelPath);
const sheetName = wb.SheetNames[0];
const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

const tasas = {};
data.forEach(row => {
  const fechaStr = fechaCaucionRowToIso(row.Fecha);
  const tasa = row.Tasa_Diaria != null && row.Tasa_Diaria !== '' && row.Tasa_Diaria !== '-'
    ? Number(row.Tasa_Diaria)
    : null;
  if (fechaStr && typeof tasa === 'number' && tasa >= 0) {
    tasas[fechaStr] = tasa;
  }
});

const output = {
  comment:
    "Tasa diaria de caución como fracción de capital (ej. 0,00074 = ~0,074 %/día). Mismo número que SheetJS raw en Serie_Cauciones.xlsx (columna Tasa_Diaria). Ejecutar: node scripts/convertir-serie-cauciones.js",
  tasas
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log('Generado:', outPath, '—', Object.keys(tasas).length, 'fechas.');
