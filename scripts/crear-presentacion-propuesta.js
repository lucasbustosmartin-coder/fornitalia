#!/usr/bin/env node
/**
 * Genera una presentación PowerPoint comercial con la propuesta de trabajo
 * (como si nada estuviera realizado). Favicon/logo como encabezado y pie «© 2026 Developed by L&P Financial Consulting».
 * Lee el presupuesto desde Bitacora_tareas.xlsx (hoja Presupuesto: Grupo, Descripción, Horas hombre, Importe).
 * Requiere: pptxgenjs, xlsx. Se ejecuta automáticamente al final de crear-bitacora-excel.js.
 * Uso: node crear-presentacion-propuesta.js
 */
const PptxGenJS = require('pptxgenjs');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const FOOTER_TEXT = '© 2026 Developed by L&P Financial Consulting';
const LOGO_PATH = path.join(__dirname, '..', 'favicon.svg');
const BRAND_BLUE = '0d2137'; // azul para letras en versión invertida (PPT)
// SVG para PPT: invertido (fondo blanco, letra azul) y en base64
let LOGO_DATA = null;
try {
  let svg = fs.readFileSync(LOGO_PATH, 'utf8');
  svg = svg.replace(/fill="#0d2137"/gi, 'fill="#FFFFFF"');
  svg = svg.replace(/fill="white"/gi, 'fill="#0d2137"');
  svg = svg.replace(/stroke="#0d2137"/gi, 'stroke="#FFFFFF"');
  LOGO_DATA = 'image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
} catch (_) { /* fallback a texto L&P */ }
const FONT_FACE = 'Calibri';
const BRAND_BG = '0d2137'; // mismo color que el logo (encabezado y pie)
const COL_W = 1.05;        // ancho columna slide 1
const HEADER_H = 0.7;     // alto del encabezado (slides 2+)
const FOOTER_H = HEADER_H; // mismo alto que el encabezado para el pie

// Leer presupuesto desde la bitácora (mismo origen de verdad: Horas hombre e Importe tal cual en el Excel)
function leerPresupuestoDesdeBitacora() {
  const excelPath = path.join(__dirname, '..', 'Bitacora_tareas.xlsx');
  try {
    const wb = XLSX.readFile(excelPath);
    const ws = wb.Sheets['Presupuesto'];
    if (!ws) return [];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const filas = [];
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      const grupo = row[0] != null ? String(row[0]).trim() : '';
      const desc = row[1] != null ? String(row[1]).trim() : '';
      const hh = row[2] != null && row[2] !== '' ? Number(row[2]) : NaN;
      const importe = row[3] != null && row[3] !== '' ? Number(row[3]) : NaN;
      if (!grupo) continue;
      filas.push({
        grupo,
        descripcion: desc,
        horasHombre: Number.isFinite(hh) ? hh : 0,
        importeUSD: Number.isFinite(importe) ? importe : 0,
      });
    }
    return filas;
  } catch (e) {
    return [];
  }
}

const PRESUPUESTO = leerPresupuestoDesdeBitacora();

// Icono suave para listas (en lugar del bullet •)
const BULLET_ICON = '▸';

// Encabezado y pie con fondo del color del logo (a partir del slide 2). Sin líneas separadoras.
function addHeaderFooter(slide, pptx) {
  const footerY = 7.5 - FOOTER_H;
  // Fondo encabezado
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: HEADER_H, fill: { color: BRAND_BG }, line: { width: 0 } });
  // Círculo del logo: fondo blanco y borde azul (versión invertida para PPT)
  const headerLogoCenterX = 0.485 + 0.24;
  const headerLogoCenterY = 0.135 + 0.24;
  slide.addShape('ellipse', { x: 0.485, y: 0.135, w: 0.48, h: 0.48, fill: { color: 'FFFFFF' }, line: { width: 1.5, color: BRAND_BG } });
  // Logo centrado en el círculo (SVG invertido: fondo blanco, letra azul)
  if (LOGO_DATA) {
    try {
      slide.addImage({ data: LOGO_DATA, x: headerLogoCenterX - 0.225, y: headerLogoCenterY - 0.225, w: 0.45, h: 0.45 });
    } catch (_) {
      slide.addText('L&P', { x: headerLogoCenterX - 0.15, y: headerLogoCenterY - 0.2, w: 0.3, h: 0.4, fontSize: 18, bold: true, color: BRAND_BLUE, fontFace: FONT_FACE, align: 'center', valign: 'middle' });
    }
  } else {
    slide.addText('L&P', { x: headerLogoCenterX - 0.15, y: headerLogoCenterY - 0.2, w: 0.3, h: 0.4, fontSize: 18, bold: true, color: BRAND_BLUE, fontFace: FONT_FACE, align: 'center', valign: 'middle' });
  }
  // Pie: ancho todo el slide, altura equilibrada con la columna (COL_W)
  slide.addShape('rect', { x: 0, y: footerY, w: 10, h: FOOTER_H, fill: { color: BRAND_BG }, line: { width: 0 } });
  slide.addText(FOOTER_TEXT, { x: 0.5, y: footerY + (FOOTER_H - 0.35) / 2, w: 9, h: 0.35, fontSize: 8, color: 'FFFFFF', italic: true, fontFace: FONT_FACE, align: 'center', valign: 'middle' });
}

// Título de la diapositiva centrado verticalmente respecto al logo circular (logo centro y=0.375)
function addSlideTitle(slide, title, titleOpts = {}) {
  const logoCenterY = 0.15 + 0.45 / 2;
  const titleH = 0.5;
  const titleY = logoCenterY - titleH / 2;
  const opts = { x: 1.05, y: titleY, w: 8, h: titleH, fontSize: 24, bold: true, color: 'FFFFFF', fontFace: FONT_FACE, valign: 'middle', ...titleOpts };
  slide.addText(title, opts);
}

const pptx = new PptxGenJS();
pptx.author = 'L&P Financial Consulting';
pptx.title = 'Propuesta de trabajo — Dashboard Flujo de Caja';
pptx.defineLayout({ name: 'LAYOUT', width: 10, height: 7.5 });
pptx.layout = 'LAYOUT';

// --- Portada: forma "L" — columna de piso a techo + pie ancho completo, mismo color, sin línea visible
const s0 = pptx.addSlide();
const contentX = COL_W;
const contentW = 10 - COL_W;
const footerY0 = 7.5 - FOOTER_H;
// Pie primero (ancho todo el slide), luego columna (piso a techo) para que se vea una sola "L" azul
s0.addShape('rect', { x: 0, y: footerY0, w: 10, h: FOOTER_H, fill: { color: BRAND_BG }, line: { width: 0 } });
s0.addShape('rect', { x: 0, y: 0, w: COL_W, h: 7.5, fill: { color: BRAND_BG }, line: { width: 0 } });
// Logo centrado en la columna: círculo blanco con borde azul (versión invertida para PPT)
const logoW = 0.5;
const logoH = 0.5;
const logoX = (COL_W - logoW) / 2;
const logoY = 0.22;
const logoCenterX = logoX - 0.02 + (logoW + 0.04) / 2;
const logoCenterY = logoY - 0.02 + (logoH + 0.04) / 2;
s0.addShape('ellipse', { x: logoX - 0.02, y: logoY - 0.02, w: logoW + 0.04, h: logoH + 0.04, fill: { color: 'FFFFFF' }, line: { width: 1.5, color: BRAND_BG } });
if (LOGO_DATA) {
  try {
    s0.addImage({ data: LOGO_DATA, x: logoCenterX - logoW / 2, y: logoCenterY - logoH / 2, w: logoW, h: logoH });
  } catch (_) {
    s0.addText('L&P', { x: logoCenterX - 0.15, y: logoCenterY - 0.2, w: 0.3, h: 0.4, fontSize: 20, bold: true, color: BRAND_BLUE, fontFace: FONT_FACE, align: 'center', valign: 'middle' });
  }
} else {
  s0.addText('L&P', { x: logoCenterX - 0.15, y: logoCenterY - 0.2, w: 0.3, h: 0.4, fontSize: 20, bold: true, color: BRAND_BLUE, fontFace: FONT_FACE, align: 'center', valign: 'middle' });
}
// Contenido centrado en el espacio a la derecha (entre 0.5 y borde del pie)
const blockCenterY = (0.5 + footerY0) / 2;
s0.addText('Propuesta de trabajo', { x: contentX, y: blockCenterY - 1.0, w: contentW, h: 0.8, fontSize: 32, bold: true, color: '1a1a1a', align: 'center', fontFace: FONT_FACE, valign: 'middle' });
s0.addText('Dashboard de Flujo de Caja', { x: contentX, y: blockCenterY - 0.2, w: contentW, h: 0.6, fontSize: 24, color: '333333', align: 'center', fontFace: FONT_FACE, valign: 'middle' });
s0.addText('Visualización, proyección y control de caja en una sola aplicación', { x: contentX, y: blockCenterY + 0.5, w: contentW, h: 0.4, fontSize: 14, color: '555555', align: 'center', fontFace: FONT_FACE, valign: 'middle' });
s0.addText(FOOTER_TEXT, { x: 0.5, y: footerY0 + (FOOTER_H - 0.35) / 2, w: 9, h: 0.35, fontSize: 8, color: 'FFFFFF', italic: true, align: 'center', fontFace: FONT_FACE, valign: 'middle' });

// --- Objetivo (slide 2)
const s1 = pptx.addSlide();
addHeaderFooter(s1, pptx);
addSlideTitle(s1, 'Objetivo de la propuesta');
s1.addText('Desarrollar un tablero de flujo de caja que permita:', { x: 0.5, y: 1.35, w: 9, h: 0.35, fontSize: 14, color: '333333', fontFace: FONT_FACE });
const bullets = [
  'Visualizar ingresos, egresos y resultado (G/P) por mes en ARS o USD',
  'Analizar por categoría y por cuenta contable con detalle de transacciones',
  'Detectar inconsistencias y potenciales duplicados para corregir datos',
  'Proyectar los próximos meses y el interés por caución sobre el sobrante',
  'Exportar datos a Excel y operar con un único punto de verdad en la nube',
];
bullets.forEach((t, i) => {
  s1.addText(BULLET_ICON + ' ' + t, { x: 0.7, y: 1.85 + i * 0.75, w: 8.6, h: 0.7, fontSize: 12, color: '444444', valign: 'top', fontFace: FONT_FACE });
});

// --- Alcance / Entregables (slide 3): título en línea con logo; icono en cada fila; descripción con más ancho para que no se corte
const s2 = pptx.addSlide();
addHeaderFooter(s2, pptx);
addSlideTitle(s2, 'Alcance — Entregables');
s2.addText('Incluye los siguientes módulos y resultados:', { x: 0.5, y: 1.2, w: 9, h: 0.3, fontSize: 12, color: '555555', fontFace: FONT_FACE });
const descMaxLen = 110;
PRESUPUESTO.forEach((row, i) => {
  const y = 1.6 + i * 0.52;
  if (y > 6.2) return;
  const desc = (row.descripcion || '');
  s2.addText(BULLET_ICON + ' ' + row.grupo, { x: 0.5, y, w: 3.4, h: 0.48, fontSize: 11, bold: true, color: '333333', valign: 'top', fontFace: FONT_FACE });
  s2.addText(desc.length > descMaxLen ? desc.substring(0, descMaxLen) + '…' : desc, { x: 4.0, y, w: 5.75, h: 0.48, fontSize: 9, color: '555555', valign: 'top', shrinkText: true, fontFace: FONT_FACE });
});

// --- Funcionalidades destacadas (slide 4)
const s3 = pptx.addSlide();
addHeaderFooter(s3, pptx);
addSlideTitle(s3, 'Funcionalidades destacadas');
const features = [
  'Flujo por mes con ingresos, egresos, G/P, ratios y columna de interés por caución',
  'Alertas configurables: mes sin egresos, sin Sueldos/Comisiones/Alquileres/Impuestos, desvío % por categoría',
  'Modal de detalle por mes: por Categoría y por Cuenta contable; gráfico de serie mensual',
  'Solapa Errores: detección de inconsistencias y duplicados; edición desde el mismo tablero',
  'Solapa Evolución: tabla dinámica por categoría o cuenta y período diario o mensual',
  'Proyección de los próximos meses con método configurable (mediana/promedio, ventana rodante)',
  'Exportación a Excel de transacciones, errores y evolución',
  'Configuración por usuario (proyección, caución, alertas) guardada en la nube',
];
features.forEach((t, i) => {
  s3.addText(BULLET_ICON + ' ' + t, { x: 0.7, y: 1.35 + i * 0.58, w: 8.6, h: 0.55, fontSize: 11, color: '444444', valign: 'top', fontFace: FONT_FACE });
});

// --- Presupuesto (tabla)
const s4 = pptx.addSlide();
addHeaderFooter(s4, pptx);
addSlideTitle(s4, 'Presupuesto estimado');
s4.addText('Horas hombre e importes en USD según bitácora.', { x: 0.5, y: 1.15, w: 9, h: 0.3, fontSize: 10, color: '666666', fontFace: FONT_FACE });
const totalHH = PRESUPUESTO.reduce((s, r) => s + r.horasHombre, 0);
const totalUSD = PRESUPUESTO.reduce((s, r) => s + r.importeUSD, 0);
const headerOpt = { fill: '0d2137', color: 'ffffff', align: 'left' };
const rows = [
  [{ text: 'Entregable', options: headerOpt }, { text: 'Horas hombre', options: headerOpt }, { text: 'Importe (USD)', options: headerOpt }],
];
const entregableMaxLen = 58;
PRESUPUESTO.forEach(r => rows.push([r.grupo.length > entregableMaxLen ? r.grupo.substring(0, entregableMaxLen - 2) + '…' : r.grupo, String(r.horasHombre), String(r.importeUSD)]));
rows.push(['Total', String(totalHH), String(totalUSD)]);
s4.addTable(rows, {
  x: 0.5, y: 1.55, w: 9, colW: [6.8, 1.2, 1],
  fontSize: 10, align: 'left', valign: 'middle', fontFace: FONT_FACE,
  border: { pt: 0.5, color: 'cccccc' },
  margin: 4,
});
s4.addText('Total: ' + totalHH + ' horas hombre · ' + totalUSD.toLocaleString('en-US') + ' USD', { x: 0.5, y: 5.4, w: 9, h: 0.4, fontSize: 12, bold: true, color: '0d2137', fontFace: FONT_FACE });

// --- Cierre
const s5 = pptx.addSlide();
addHeaderFooter(s5, pptx);
addSlideTitle(s5, 'Próximos pasos');
s5.addText(BULLET_ICON + ' Definición de alcance y prioridades según su necesidad.', { x: 0.7, y: 1.5, w: 8.6, h: 0.45, fontSize: 14, color: '333333', fontFace: FONT_FACE });
s5.addText(BULLET_ICON + ' Ajuste de presupuesto y plazos en función del alcance acordado.', { x: 0.7, y: 2.1, w: 8.6, h: 0.45, fontSize: 14, color: '333333', fontFace: FONT_FACE });
s5.addText(BULLET_ICON + ' Desarrollo por fases con entregas parciales y revisión continua.', { x: 0.7, y: 2.7, w: 8.6, h: 0.45, fontSize: 14, color: '333333', fontFace: FONT_FACE });
s5.addText('Gracias por su confianza.', { x: 0.5, y: 3.8, w: 9, h: 0.5, fontSize: 18, bold: true, color: '0d2137', align: 'center', fontFace: FONT_FACE });
s5.addText('L&P Financial Consulting', { x: 0.5, y: 4.4, w: 9, h: 0.35, fontSize: 12, color: '555555', align: 'center', fontFace: FONT_FACE });

const outPath = path.join(__dirname, '..', 'Propuesta_Dashboard_Flujo_Caja.pptx');
pptx.writeFile({ fileName: outPath }).then(() => {
  console.log('Creado:', outPath);
}).catch(err => {
  console.error(err);
});
