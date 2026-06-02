#!/usr/bin/env node
/**
 * Desde docs/Transacciones_Fornitalia_Matriz_Final.xlsx (hoja Transacciones) genera
 * docs/Matriz_Relaciones_Transacciones_Fornitalia.xlsx con:
 * - Matriz_Cat_Cuenta_Costo: combinaciones únicas (excl. categorías fijas)
 * - Cat_x_Cuenta_Registros: cruce cat×cuenta (solo status Confirmado)
 * - Proveedores_Egreso: egresos con Proveedor normalizado por cat/cuenta matriz
 * - Proveedores_por_Cat_Cuenta: por Proveedor, combinaciones cat/cuenta elegibles
 *
 * Uso: node scripts/generar-matriz-relaciones-transacciones.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  buildMatrizRelacionesExcelData,
  SHEET_MATRIZ_COSTO,
  SHEET_CAT_CUENTA_CRUCE,
  SHEET_PROV_DETALLE,
  SHEET_PROV_AGRUP,
  CATEGORIAS_EXCLUIDAS,
  STATUS_CONFIRMADO,
} = require('./lib/fornitalia-matriz-relaciones-transacciones');

const ROOT = path.join(__dirname, '..');
const INPUT_XLSX = path.join(ROOT, 'docs', 'Transacciones_Fornitalia_Matriz_Final.xlsx');
const OUTPUT_XLSX = path.join(ROOT, 'docs', 'Matriz_Relaciones_Transacciones_Fornitalia.xlsx');
const SHEET_TRANS = 'Transacciones';

function leerTransacciones() {
  if (!fs.existsSync(INPUT_XLSX)) {
    throw new Error(`No existe: ${INPUT_XLSX}`);
  }
  const wb = XLSX.readFile(INPUT_XLSX);
  const sh = wb.Sheets[SHEET_TRANS];
  if (!sh) {
    throw new Error(`Falta hoja "${SHEET_TRANS}" en ${INPUT_XLSX}`);
  }
  return XLSX.utils.sheet_to_json(sh, { defval: '' });
}

function main() {
  const rowsAll = leerTransacciones();
  const { sheets, stats } = buildMatrizRelacionesExcelData(rowsAll, {
    origenLabel: path.basename(INPUT_XLSX) + ' / hoja ' + SHEET_TRANS,
  });

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(sheets[SHEET_MATRIZ_COSTO]), SHEET_MATRIZ_COSTO);
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(sheets[SHEET_CAT_CUENTA_CRUCE]), SHEET_CAT_CUENTA_CRUCE);
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(sheets[SHEET_PROV_DETALLE]), SHEET_PROV_DETALLE);
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(sheets[SHEET_PROV_AGRUP]), SHEET_PROV_AGRUP);
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(sheets.README), 'README');
  XLSX.writeFile(wbOut, OUTPUT_XLSX);

  console.log('Entrada:', INPUT_XLSX);
  console.log('Salida:', OUTPUT_XLSX);
  console.log('Excluidas (matriz/proveedores):', [...CATEGORIAS_EXCLUIDAS].join(', '));
  console.log(`  Matriz/proveedores: ${stats.rowsAll} → ${stats.rowsFiltered} (egreso ${stats.rowsEgreso})`);
  console.log(`  ${STATUS_CONFIRMADO} (solo Cat_x_Cuenta_Registros): ${stats.rowsConfirmados} registros`);
  console.log(`  ${SHEET_MATRIZ_COSTO}: ${stats.matrizCosto} combinaciones`);
  console.log(
    `  ${SHEET_CAT_CUENTA_CRUCE}: ${stats.catCuentaCruceCategorias} categorías × ${stats.catCuentaCruceCuentas} cuentas`
  );
  console.log(`  ${SHEET_PROV_DETALLE}: ${stats.provDetalle} filas`);
  console.log(`  ${SHEET_PROV_AGRUP}: ${stats.provPorProveedor} proveedores`);
}

main();
