/**
 * Ruta canónica del libro de movimientos para scripts e informes.
 * Prioriza docs/Fornitalia_Movimientos.xlsx; si no existe, docs/Extracto-Fornitalia.xlsx (legado).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const MOVIMIENTOS_APP = path.join(ROOT, "docs", "Fornitalia_Movimientos.xlsx");
const MOVIMIENTOS_LEGACY = path.join(ROOT, "docs", "Extracto-Fornitalia.xlsx");

function resolveMovimientosXlsxPath() {
  const env = process.env.FORNITALIA_MOVIMIENTOS_XLSX;
  if (env && fs.existsSync(env)) return env;
  if (fs.existsSync(MOVIMIENTOS_APP)) return MOVIMIENTOS_APP;
  if (fs.existsSync(MOVIMIENTOS_LEGACY)) return MOVIMIENTOS_LEGACY;
  return MOVIMIENTOS_APP;
}

module.exports = {
  ROOT,
  MOVIMIENTOS_APP,
  MOVIMIENTOS_LEGACY,
  resolveMovimientosXlsxPath,
};
