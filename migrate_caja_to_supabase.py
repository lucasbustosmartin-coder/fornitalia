#!/usr/bin/env python3
"""
Migra todos los Excel de la carpeta Caja a la tabla transacciones en Supabase.
Requiere: .env con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
"""
import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

CAJA = Path(__file__).parent / "Caja"

# Mapeo columnas Excel → columnas tabla Supabase (snake_case)
COLUMNAS_EXCEL_A_DB = {
    "Título": "titulo",
    "ID": "id_origen",
    "IDCierreCaja_MC": "id_cierre_caja",
    "IDOperacion_MC": "id_operacion",
    "IDComprobantePago_MC": "id_comprobante_pago",
    "IDImpuesto_MC": "id_impuesto",
    "Cliente_MC": "cliente",
    "TipoMovimiento_MC": "tipo_movimiento",
    "MedioPago_MC": "medio_pago",
    "Descripcion_MC": "descripcion",
    "CatDesc_MC": "cat_desc",
    "Observaciones_MC": "observaciones",
    "Categoria_MC": "categoria",
    "CuentaContable_MC": "cuenta_contable",
    "Monto_MC": "monto",
    "TipoCambio_MC": "tipo_cambio",
    "MontoCambio_MC": "monto_cambio",
    "Fecha_MC": "fecha",
    "Mes_MC": "mes",
    "MesAnio_MC": "mes_anio",
    "Anio_MC": "anio",
    "Hora_MC": "hora",
    "UsuarioApp_MC": "usuario_app",
    "Status_MC": "status",
    "CreacionManual_MC": "creacion_manual",
}


def normalizar_valor(val):
    """Convierte NaN, NaT, "-", etc. a None para JSON/Supabase. Fechas/horas a string ISO."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    # Excel suele usar "-" en celdas vacías; las columnas numeric en DB no lo aceptan
    if isinstance(val, str):
        s = val.strip()
        if s == "" or s == "-":
            return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(val, "isoformat") and not isinstance(val, type(pd.NaT)):
        try:
            return val.isoformat()
        except (ValueError, AttributeError):
            return str(val)
    return val


def excel_a_filas(archivo: Path) -> list[dict]:
    """Lee un archivo Excel (todas las hojas) y devuelve lista de filas para insertar."""
    filas = []
    nombre_archivo = archivo.name
    try:
        xl = pd.ExcelFile(archivo)
        for sheet_name in xl.sheet_names:
            df = pd.read_excel(archivo, sheet_name=sheet_name)
            if df.empty or len(df.columns) < 5:
                continue
            # Normalizar nombres de columnas por si acaso
            df = df.rename(columns=lambda c: c.strip() if isinstance(c, str) else c)
            for _, row in df.iterrows():
                rec = {"origen_archivo": nombre_archivo}
                for col_excel, col_db in COLUMNAS_EXCEL_A_DB.items():
                    if col_excel not in df.columns:
                        rec[col_db] = None
                        continue
                    val = row.get(col_excel)
                    rec[col_db] = normalizar_valor(val)
                filas.append(rec)
    except Exception as e:
        print(f"  Error leyendo {nombre_archivo}: {e}")
    return filas


def main():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        print("Faltan SUPABASE_URL y (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY) en .env")
        return 1
    if not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        print("⚠️  Usando ANON KEY. Si la migración falla por permisos, configura SUPABASE_SERVICE_ROLE_KEY en .env")
        print("   Ver: DÓNDE_ENCONTRAR_SERVICE_ROLE.md\n")

    try:
        from supabase import create_client
    except ImportError:
        print("Instala: pip install supabase python-dotenv")
        return 1

    client = create_client(url, key)

    archivos = sorted(CAJA.glob("*.xlsx"))
    if not archivos:
        print("No se encontraron archivos .xlsx en", CAJA)
        return 1

    total_insertadas = 0
    for archivo in archivos:
        print(f"Procesando: {archivo.name}")
        filas = excel_a_filas(archivo)
        if not filas:
            print("  Sin filas.")
            continue
        # Supabase insert acepta hasta 1000 por lote
        batch = 500
        for i in range(0, len(filas), batch):
            chunk = filas[i : i + batch]
            try:
                client.table("transacciones").insert(chunk).execute()
                total_insertadas += len(chunk)
            except Exception as e:
                print(f"  Error insertando lote: {e}")
                for j, row in enumerate(chunk):
                    try:
                        client.table("transacciones").insert(row).execute()
                        total_insertadas += 1
                    except Exception as e2:
                        print(f"    Fila fallida: {e2}")
        print(f"  Insertadas: {len(filas)}")
    print(f"\nTotal insertadas en esta ejecución: {total_insertadas}")
    return 0


if __name__ == "__main__":
    exit(main())
