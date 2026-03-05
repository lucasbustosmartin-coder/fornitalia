/**
 * Consolidar Estado de Resultados 2025
 * Lee todos los Excel de la carpeta 2025 (primera solapa de cada uno),
 * extrae Concepto (col A) e importe (col B) y genera un Excel con
 * items en filas y meses en columnas.
 * Ejecutar: node consolidar-estado-resultados-2025.js
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const CARPETA_2025 = path.join(__dirname, '..', 'Estados_Resultado', '2025');
const SALIDA = path.join(__dirname, '..', 'Estados_Resultado', 'Estado_Resultados_2025_Consolidado.xlsx');

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Extrae número de mes (1-12) del nombre del archivo. */
function mesDesdeNombre(nombre) {
  const sinTemp = nombre.replace(/^\~\$/, '');
  const m = sinTemp.match(/^(\d{1,2})\s/);
  if (m) return parseInt(m[1], 10);
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const lower = sinTemp.toLowerCase();
  const i = nombres.findIndex(n => lower.includes(n));
  return i >= 0 ? i + 1 : null;
}

/** Nombre de columna de mes: ene-25, feb-25, ... */
function columnaMes(mesNum) {
  if (mesNum < 1 || mesNum > 12) return null;
  return MESES_ABREV[mesNum - 1] + '-25';
}

/** Parsea valor de celda a número (ya puede venir como número o string con formato AR). */
function parsearImporte(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val).trim().replace(/\s/g, '');
  if (!s) return null;
  const sinSimbolo = s.replace(/^\$?\s*/, '').replace(/\.[0-9]{3}/g, m => m.replace(/\./g, '')).replace(',', '.');
  const n = parseFloat(sinSimbolo);
  return isNaN(n) ? null : n;
}

/** Encuentra la fila de encabezado (donde está "Concepto" en col A). */
function encontrarFilaConcepto(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const a = (aoa[i] && aoa[i][0] != null) ? String(aoa[i][0]).trim().toLowerCase() : '';
    if (a === 'concepto' || a.startsWith('concepto')) return i;
  }
  return 1;
}

/** Extrae lista de { concepto, importe } de la hoja (primera hoja). */
function extraerDatosHoja(aoa, filaEncabezado) {
  const datos = [];
  for (let i = filaEncabezado + 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    const concepto = (row[0] != null && row[0] !== '') ? String(row[0]).trim() : '';
    if (!concepto) continue;
    const importe = parsearImporte(row[1]);
    datos.push({ concepto, importe: importe != null ? importe : '' });
  }
  return datos;
}

function main() {
  if (!fs.existsSync(CARPETA_2025)) {
    console.error('No existe la carpeta:', CARPETA_2025);
    process.exit(1);
  }

  const archivos = fs.readdirSync(CARPETA_2025)
    .filter(f => /\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    .filter(f => /estado\s*de\s*resultados/i.test(f) || /^\d{1,2}\s/.test(f))
    .sort();

  if (archivos.length === 0) {
    console.error('No se encontraron archivos Excel de Estado de Resultados en', CARPETA_2025);
    process.exit(1);
  }

  const conceptosOrden = []; // orden de primera aparición
  const conceptosSet = new Set();
  const matriz = {}; // concepto -> { 'ene-25': valor, 'feb-25': valor, ... }
  const mesesProcesados = [];

  for (const archivo of archivos) {
    const mesNum = mesDesdeNombre(archivo);
    if (mesNum == null || mesNum < 1 || mesNum > 12) {
      console.warn('Omitido (no se pudo determinar mes):', archivo);
      continue;
    }

    const colMes = columnaMes(mesNum);
    const ruta = path.join(CARPETA_2025, archivo);

    let wb;
    try {
      wb = XLSX.readFile(ruta, { cellDates: true });
    } catch (e) {
      console.warn('Error leyendo', archivo, e.message);
      continue;
    }

    const nombreHoja = wb.SheetNames[0];
    const sheet = wb.Sheets[nombreHoja];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const filaConcepto = encontrarFilaConcepto(aoa);
    const datos = extraerDatosHoja(aoa, filaConcepto);

    mesesProcesados.push(colMes);

    for (const { concepto, importe } of datos) {
      if (!concepto) continue;
      if (!conceptosSet.has(concepto)) {
        conceptosSet.add(concepto);
        conceptosOrden.push(concepto);
      }
      if (!matriz[concepto]) matriz[concepto] = {};
      matriz[concepto][colMes] = importe;
    }

    console.log(archivo, '->', colMes, '-', datos.length, 'filas');
  }

  const columnasMeses = [...new Set(mesesProcesados)].sort((a, b) => {
    const i = MESES_ABREV.indexOf(a.slice(0, 3));
    const j = MESES_ABREV.indexOf(b.slice(0, 3));
    return (i - j) || a.localeCompare(b);
  });

  const filaEncabezado = ['Concepto', ...columnasMeses];
  const filas = [filaEncabezado];

  for (const concepto of conceptosOrden) {
    const fila = [concepto];
    for (const col of columnasMeses) {
      const v = matriz[concepto] && matriz[concepto][col];
      fila.push(v !== undefined && v !== '' && v !== null ? v : '');
    }
    filas.push(fila);
  }

  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, 'Items por mes');

  XLSX.writeFile(wbOut, SALIDA);
  console.log('Generado:', SALIDA);
  console.log('Conceptos:', conceptosOrden.length, '| Meses:', columnasMeses.length);
}

main();
