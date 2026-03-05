#!/usr/bin/env python3
"""
Migra tipos_cambio_global_rows.csv a la tabla tipo_de_cambio en Supabase.
Requiere: .env con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_ANON_KEY)
"""
import csv
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

CSV_PATH = Path(__file__).parent / "tipos_cambio_global_rows.csv"


def normalizar(val):
    """Vacío o '-' -> None; números como float."""
    if val is None or (isinstance(val, str) and val.strip() in ("", "-")):
        return None
    if isinstance(val, str):
        val = val.strip()
    try:
        return float(val)
    except (ValueError, TypeError):
        return val if val else None


def main():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        print("Faltan SUPABASE_URL y (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY) en .env")
        return 1

    try:
        from supabase import create_client
    except ImportError:
        print("Instala: pip install supabase python-dotenv")
        return 1

    if not CSV_PATH.exists():
        print(f"No se encontró {CSV_PATH}")
        return 1

    client = create_client(url, key)

    filas = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fecha = (row.get("fecha") or "").strip()
            if not fecha:
                continue
            filas.append({
                "fecha": fecha,
                "usd_mep": normalizar(row.get("usd_mep")),
                "usd_ccl": normalizar(row.get("usd_ccl")),
                "usd_oficial": normalizar(row.get("usd_oficial")),
            })
            # Opcional: usar id del CSV; si quieres uuid nuevo, no incluyas "id"
            # "id": row.get("id") or None,

    if not filas:
        print("No hay filas para insertar.")
        return 0

    # Si volvés a ejecutar, truncá antes en Supabase: TRUNCATE TABLE public.tipo_de_cambio;
    batch = 500
    total = 0
    for i in range(0, len(filas), batch):
        chunk = filas[i : i + batch]
        try:
            client.table("tipo_de_cambio").insert(chunk).execute()
            total += len(chunk)
        except Exception as e:
            print(f"Error lote: {e}")
            for row in chunk:
                try:
                    client.table("tipo_de_cambio").insert(row).execute()
                    total += 1
                except Exception as e2:
                    print(f"  Fila fallida: {e2}")

    print(f"Insertadas: {total} de {len(filas)} filas en tipo_de_cambio.")
    return 0


if __name__ == "__main__":
    exit(main())
