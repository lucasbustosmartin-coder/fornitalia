#!/usr/bin/env node
/**
 * Genera PDF desde el HTML del informe de normalización.
 * 1) Playwright + Chromium si está instalado.
 * 2) Si falla, Chrome/Chromium del sistema (macOS/Linux), mismo criterio que generar-analisis-financiero-pdf.js.
 *
 * Uso: node scripts/informe-html-a-pdf.js
 *      npm run informe-normalizacion-pdf   (regenera HTML + PDF)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "docs", "ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.html");
const pdfPath = path.join(root, "docs", "ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.pdf");

function tryChromeHeadlessPdf(html, pdf) {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  const fileUrl = pathToFileURL(path.resolve(html)).href;
  for (const bin of candidates) {
    if (!bin || !fs.existsSync(bin)) continue;
    try {
      if (fs.existsSync(pdf)) fs.unlinkSync(pdf);
      execFileSync(
        bin,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-pdf-header-footer",
          `--print-to-pdf=${path.resolve(pdf)}`,
          fileUrl,
        ],
        { stdio: "pipe", timeout: 120000 }
      );
      if (fs.existsSync(pdf) && fs.statSync(pdf).size > 100) {
        return true;
      }
    } catch {
      /* siguiente binario */
    }
  }
  return false;
}

(async () => {
  if (!fs.existsSync(htmlPath)) {
    console.error("No existe:", htmlPath);
    console.error("Ejecutá primero: node scripts/md-informe-a-html.js");
    process.exit(1);
  }

  let pdfOk = false;
  try {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
        margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
      });
      pdfOk = true;
      console.log("PDF (Playwright):", pdfPath);
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.warn("Playwright PDF no disponible:", (e && e.message) || e);
  }

  if (!pdfOk && tryChromeHeadlessPdf(htmlPath, pdfPath)) {
    console.log("PDF (Chrome headless):", pdfPath);
    pdfOk = true;
  }

  if (!pdfOk) {
    console.warn(
      "\nNo se generó PDF. Instalá Chromium: npx playwright install chromium\n" +
        "O abrí el HTML en Chrome → Imprimir → Guardar como PDF.\n"
    );
    process.exitCode = 2;
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
