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

const wb = XLSX.readFile(excelPath);
const sheetName = wb.SheetNames[0];
const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

const tasas = {};
data.forEach(row => {
  const fechaStr = excelSerialToDateStr(row.Fecha);
  const tasa = row.Tasa_Diaria != null && row.Tasa_Diaria !== '' && row.Tasa_Diaria !== '-'
    ? Number(row.Tasa_Diaria)
    : null;
  if (fechaStr && typeof tasa === 'number' && tasa >= 0) {
    tasas[fechaStr] = tasa;
  }
});

const output = {
  comment: "Tasa diaria de caución (decimal) por fecha. Generado desde Serie_Cauciones.xlsx. Ejecutar: node convertir-serie-cauciones.js",
  tasas
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log('Generado:', outPath, '—', Object.keys(tasas).length, 'fechas.');
