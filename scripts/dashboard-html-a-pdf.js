#!/usr/bin/env node
/**
 * Genera un PDF de la app `dashboard-flujo-caja.html` tal como se renderiza en el navegador
 * (layout, colores, sidebar colapsado por defecto). Útil para pasar a una IA de presentaciones
 * y armar un instructivo breve.
 *
 * Requiere red la primera vez (CDN: Supabase, Chart.js, SheetJS). Espera unos segundos a que
 * termine de cargar datos o mensajes de error en pantalla.
 *
 * Uso: node scripts/dashboard-html-a-pdf.js
 *      npm run dashboard-app-pdf
 *
 * Salida: docs/Dashboard_Flujo_Caja_App.pdf
 *
 * Variable opcional: DASHBOARD_PDF_WAIT_MS (default 6000) — ms de espera tras load antes de medir y exportar.
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "dashboard-flujo-caja.html");
const pdfPath = path.join(root, "docs", "Dashboard_Flujo_Caja_App.pdf");

const VIEWPORT_W = 1440;
const WAIT_MS = Math.max(
  2000,
  parseInt(process.env.DASHBOARD_PDF_WAIT_MS || "6000", 10) || 6000
);

function tryChromeHeadlessPdf(fileUrl, outPath) {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const bin of candidates) {
    if (!bin || !fs.existsSync(bin)) continue;
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      execFileSync(
        bin,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-pdf-header-footer",
          `--print-to-pdf=${path.resolve(outPath)}`,
          fileUrl,
        ],
        { stdio: "pipe", timeout: 120000 }
      );
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100) {
        return true;
      }
    } catch {
      /* siguiente candidato */
    }
  }
  return false;
}

(async () => {
  if (!fs.existsSync(htmlPath)) {
    console.error("No existe:", htmlPath);
    process.exit(1);
  }

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error("Falta playwright. En la raíz: npm install");
    process.exit(1);
  }

  const fileUrl = pathToFileURL(path.resolve(htmlPath)).href;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    const msg = String(e.message || e);
    console.warn("Playwright PDF no disponible:", msg.split("\n")[0]);
    if (
      tryChromeHeadlessPdf(fileUrl, pdfPath)
    ) {
      console.log(
        "PDF (Chrome headless, una vista — puede recortar altura):",
        pdfPath
      );
      return;
    }
    console.error("\nInstalá Chromium: npx playwright install chromium\n");
    process.exit(1);
  }

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: VIEWPORT_W, height: 900 });
    await page.goto(fileUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(WAIT_MS);

    const h = await page.evaluate(() => {
      const b = document.body;
      const e = document.documentElement;
      return Math.max(
        b.scrollHeight,
        b.offsetHeight,
        e.clientHeight,
        e.scrollHeight,
        e.offsetHeight
      );
    });
    const pdfH = Math.min(Math.ceil(h) + 48, 24000);

    await page.pdf({
      path: pdfPath,
      width: `${VIEWPORT_W}px`,
      height: `${pdfH}px`,
      printBackground: true,
      margin: { top: "10px", right: "10px", bottom: "10px", left: "10px" },
    });
    console.log("PDF:", pdfPath);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
