#!/usr/bin/env node
/**
 * Convierte el informe de análisis (.md con tablas GitHub) a HTML imprimible (A4).
 * Uso: node scripts/md-informe-a-html.js [entrada.md] [salida.html]
 * En el navegador: Archivo → Imprimir → Guardar como PDF (para IA / presentación).
 */
const fs = require('fs');
const path = require('path');

const inPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.md'));
const outPath = path.resolve(process.argv[3] || inPath.replace(/\.md$/i, '.html'));

const md = fs.readFileSync(inPath, 'utf8');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

const lines = md.split(/\r?\n/);
let html = [];
let i = 0;
let inTable = false;
let tableRows = [];

function flushTable() {
  if (!tableRows.length) return;
  html.push('<table><thead><tr>');
  const header = tableRows[0];
  header.forEach((c) => html.push(`<th>${inlineFmt(c)}</th>`));
  html.push('</tr></thead><tbody>');
  for (let r = 1; r < tableRows.length; r++) {
    html.push('<tr>');
    tableRows[r].forEach((c) => html.push(`<td>${inlineFmt(c)}</td>`));
    html.push('</tr>');
  }
  html.push('</tbody></table>');
  tableRows = [];
  inTable = false;
}

while (i < lines.length) {
  const line = lines[i];
  const t = line.trim();

  if (t.startsWith('|') && t.includes('|')) {
    const next = (lines[i + 1] || '').trim();
    if (/^\|[\s\-:|]+\|$/.test(next.replace(/\s/g, '')) || /^\|?[\s\-:|]+\|?$/.test(next)) {
      inTable = true;
      const cells = line.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (!/^[\s\-:|]+$/.test(cells.join(''))) tableRows.push(cells);
      i += 2;
      continue;
    }
  }

  if (inTable) {
    if (t.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (!/^[\s\-:|]+$/.test(cells.join(''))) tableRows.push(cells);
      i++;
      continue;
    }
    flushTable();
  }

  if (!t) {
    html.push('<p class="sp"></p>');
    i++;
    continue;
  }
  if (t === '---') {
    html.push('<hr/>');
    i++;
    continue;
  }
  if (t.startsWith('### ')) {
    html.push(`<h3>${inlineFmt(t.slice(4))}</h3>`);
    i++;
    continue;
  }
  if (t.startsWith('## ')) {
    html.push(`<h2>${inlineFmt(t.slice(3))}</h2>`);
    i++;
    continue;
  }
  if (t.startsWith('# ')) {
    html.push(`<h1>${inlineFmt(t.slice(2))}</h1>`);
    i++;
    continue;
  }
  if (t.startsWith('*') && t.endsWith('*') && t.length > 2 && !t.startsWith('**')) {
    html.push(`<p class="meta">${inlineFmt(t.replace(/^\*|\*$/g, ''))}</p>`);
    i++;
    continue;
  }

  const ol = t.match(/^\d+\.\s+(.+)$/);
  if (ol) {
    html.push('<ol>');
    while (i < lines.length) {
      const L = lines[i].trim();
      const m = L.match(/^\d+\.\s+(.+)$/);
      if (!m) break;
      html.push(`<li>${inlineFmt(m[1])}</li>`);
      i++;
    }
    html.push('</ol>');
    continue;
  }

  html.push(`<p>${inlineFmt(line)}</p>`);
  i++;
}
flushTable();

const doc = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Análisis normalización datos legacy — Fornitalia</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 10pt; line-height: 1.35; color: #1a1a1a; max-width: 210mm; margin: 0 auto; padding: 12px; }
    h1 { font-size: 1.35rem; margin: 0 0 0.75rem 0; }
    h2 { font-size: 1.1rem; margin: 1.25rem 0 0.5rem 0; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
    h3 { font-size: 1rem; margin: 1rem 0 0.35rem 0; }
    p { margin: 0.35rem 0; }
    p.meta { font-size: 0.9rem; color: #444; }
    p.sp { height: 0.25rem; margin: 0; }
    hr { border: none; border-top: 1px solid #ddd; margin: 1rem 0; }
    ol { margin: 0.5rem 0 1rem 1.25rem; padding-left: 1rem; }
    li { margin: 0.3rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem 0; font-size: 8.5pt; }
    th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    @media print {
      body { padding: 0; }
      h2 { break-after: avoid; }
      table { break-inside: auto; }
      tr { break-inside: avoid; break-after: auto; }
    }
  </style>
</head>
<body>
${html.join('\n')}
</body>
</html>`;

fs.writeFileSync(outPath, doc, 'utf8');
console.log('HTML generado:', outPath);
console.log('Para PDF: abrir en Chrome/Safari → Imprimir → Guardar como PDF.');
