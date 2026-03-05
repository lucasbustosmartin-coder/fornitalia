/**
 * Consolidar Estado de Resultados (varios años)
 * Lee los Excel de Estados_Resultado/2024, 2025, 2026 (primera solapa de cada uno),
 * extrae Concepto (col A) e importe (col B) y genera un Excel con
 * items en filas y meses en columnas (ene-24, feb-24, ... dic-26).
 * Ejecutar: node consolidar-estado-resultados.js
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const CARPETA_BASE = path.join(__dirname, '..', 'Estados_Resultado');
const SALIDA = path.join(CARPETA_BASE, 'Estado_Resultados_Consolidado.xlsx');

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Abreviaturas de mes en nombres de archivo (Abr, May, Ene, etc.). */
const MES_ABR_ARCHIVO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Extrae número de mes (1-12) del nombre del archivo. Año se usa solo para columna. */
function mesDesdeNombre(nombre) {
  const sinTemp = nombre.replace(/^\~\$/, '').toLowerCase();
  // "01 ESTADO...", "1 ESTADO...", "02 FEBRERO"
  const m1 = nombre.replace(/^\~\$/, '').match(/^(\d{1,2})\s/);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (n >= 1 && n <= 12) return n;
  }
  // "Estado de Resultados 2024 04 Abr.xlsx" -> 04
  const m2 = sinTemp.match(/\s(\d{1,2})\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (n >= 1 && n <= 12) return n;
  }
  const m2b = nombre.replace(/^\~\$/, '').match(/\s(\d{1,2})\s+(?:Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic|Ene|Feb|Mar)/i);
  if (m2b) {
    const n = parseInt(m2b[1], 10);
    if (n >= 1 && n <= 12) return n;
  }
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const i = nombres.findIndex(n => sinTemp.includes(n));
  return i >= 0 ? i + 1 : null;
}

/** Nombre de columna de mes: ene-24, feb-25, ... */
function columnaMes(mesNum, anio) {
  if (mesNum < 1 || mesNum > 12) return null;
  const sufijo = String(anio).slice(-2);
  return MESES_ABREV[mesNum - 1] + '-' + sufijo;
}

/** Parsea valor de celda a número. */
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

/** Extrae lista de { concepto, importe } de la hoja. */
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

/** Ordenar columnas: ene-24, feb-24, ... dic-24, ene-25, ... */
function ordenarColumnasMeses(columnas) {
  return columnas.sort((a, b) => {
    const [mesA, anioA] = a.split('-');
    const [mesB, anioB] = b.split('-');
    const n = parseInt(anioA, 10) - parseInt(anioB, 10);
    if (n !== 0) return n;
    return MESES_ABREV.indexOf(mesA) - MESES_ABREV.indexOf(mesB);
  });
}

function main() {
  if (!fs.existsSync(CARPETA_BASE)) {
    console.error('No existe la carpeta:', CARPETA_BASE);
    process.exit(1);
  }

  const subcarpetas = fs.readdirSync(CARPETA_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map(d => d.name)
    .sort();

  if (subcarpetas.length === 0) {
    console.error('No se encontraron subcarpetas de año (2024, 2025, 2026) en', CARPETA_BASE);
    process.exit(1);
  }

  const conceptosOrden = [];
  const conceptosSet = new Set();
  const matriz = {};
  const columnasSet = new Set();

  for (const anio of subcarpetas) {
    const dirAnio = path.join(CARPETA_BASE, anio);
    let archivos;
    try {
      archivos = fs.readdirSync(dirAnio);
    } catch (e) {
      console.warn('No se pudo leer', dirAnio, e.message);
      continue;
    }

    const listado = archivos
      .filter(f => /\.xlsx?$/i.test(f) && !f.startsWith('~$'))
      .filter(f => /estado\s*de\s*resultados/i.test(f) || /^\d{1,2}\s/i.test(f) || /\d{2}\s+(?:Abr|May|Ene|Feb|Mar|Jun|Jul|Ago|Sep|Oct|Nov|Dic)/i.test(f))
      .sort();

    for (const archivo of listado) {
      const mesNum = mesDesdeNombre(archivo);
      if (mesNum == null || mesNum < 1 || mesNum > 12) {
        console.warn('Omitido (mes no determinado):', anio + '/' + archivo);
        continue;
      }

      const colMes = columnaMes(mesNum, anio);
      const ruta = path.join(dirAnio, archivo);

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

      columnasSet.add(colMes);

      for (const { concepto, importe } of datos) {
        if (!concepto) continue;
        if (!conceptosSet.has(concepto)) {
          conceptosSet.add(concepto);
          conceptosOrden.push(concepto);
        }
        if (!matriz[concepto]) matriz[concepto] = {};
        matriz[concepto][colMes] = importe;
      }

      console.log(anio + '/' + archivo, '->', colMes, '-', datos.length, 'filas');
    }
  }

  const columnasMeses = ordenarColumnasMeses([...columnasSet]);
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
  console.log('Conceptos:', conceptosOrden.length, '| Columnas (meses):', columnasMeses.length);
}

main();
