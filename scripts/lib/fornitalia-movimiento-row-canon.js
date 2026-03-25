/**
 * Unifica lectura: export app (Fornitalia_Movimientos) vs extracto legado (Extracto-Fornitalia).
 * Toda la lógica que esperaba columnas con espacios/tildes puede seguir usando el objeto "legado".
 */

function isFornitaliaMovimientosExport(row) {
  if (!row || typeof row !== "object") return false;
  return (
    Object.prototype.hasOwnProperty.call(row, "TipoMovimiento") &&
    Object.prototype.hasOwnProperty.call(row, "MedioPago")
  );
}

/**
 * @returns {object} mismas claves que el extracto Excel legado (para inferCurrency, PDF, etc.)
 */
function rowToLegacyExtractoShape(row) {
  if (!isFornitaliaMovimientosExport(row)) return row;
  return {
    Fecha: row.Fecha,
    Hora: row.Hora,
    "N° Operación": row.IDOperacion,
    Tipo: row.TipoMovimiento,
    "Medio de Pago": row.MedioPago,
    Cliente: row.Cliente,
    Descripción: row.Descripcion,
    Observaciones: row.Observaciones,
    Categoría: row.Categoria,
    "Cuenta Contable": row.CuentaContable,
    Monto: row.Monto,
    Moneda: row.Moneda,
    "Tipo de Cambio": row.TipoCambio,
    "Monto en $": row.MontoCambio,
    "Mes/Año": row.MesAnio,
    Usuario: row.UsuarioApp,
    Estado: row.Status,
    cat_desc: row.CatDesc,
  };
}

function toStrId(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  return s;
}

function toNumId(v) {
  const s = toStrId(v);
  if (!s) return null;
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * IDs y cat_desc para hoja Normalizado / insert a transacciones.
 */
function extraCamposDesdeMovimientosExport(row) {
  if (!isFornitaliaMovimientosExport(row)) {
    return {
      id_cierre_caja: null,
      id_comprobante_pago: null,
      id_impuesto: null,
      cat_desc: null,
    };
  }
  return {
    id_cierre_caja: toStrId(row.IDCierreCaja),
    id_comprobante_pago: toNumId(row.IDComprobantePago),
    id_impuesto: toNumId(row.IDImpuesto),
    cat_desc: toStrId(row.CatDesc),
  };
}

/**
 * @param {object[]} rawRows - sheet_to_json Movimientos
 */
function mapSheetRowsToLegacy(rawRows) {
  return rawRows.map(rowToLegacyExtractoShape);
}

module.exports = {
  isFornitaliaMovimientosExport,
  rowToLegacyExtractoShape,
  extraCamposDesdeMovimientosExport,
  mapSheetRowsToLegacy,
};
