#!/usr/bin/env node
/**
 * Genera PDF desde el HTML del informe de normalización (mismo flujo que en proyecto Pandi: Playwright + Chromium).
 * Requisito: npm install y `npx playwright install chromium` (una vez por máquina).
 *
 * Uso: node scripts/informe-html-a-pdf.js
 *      npm run informe-normalizacion-pdf   (regenera HTML + PDF)
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'docs', 'ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.html');
const pdfPath = path.join(root, 'docs', 'ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.pdf');

(async () => {
  if (!fs.existsSync(htmlPath)) {
    console.error('No existe:', htmlPath);
    console.error('Ejecutá primero: node scripts/md-informe-a-html.js');
    process.exit(1);
  }

  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('Falta playwright. En la raíz del proyecto: npm install');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    });
    console.log('PDF generado:', pdfPath);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err.message || err);
  if (String(err.message || '').includes('Executable doesn\'t exist') || String(err).includes('browserType.launch')) {
    console.error('\nInstalá Chromium para Playwright: npx playwright install chromium\n');
  }
  process.exit(1);
});
