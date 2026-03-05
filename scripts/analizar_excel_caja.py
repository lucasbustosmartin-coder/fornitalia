#!/usr/bin/env python3
"""Analiza la estructura de los Excel en la carpeta Caja."""
import os
from pathlib import Path

import pandas as pd

CAJA = Path(__file__).parent / "Caja"

def analizar_archivo(ruta: Path) -> dict:
    info = {"archivo": ruta.name, "hojas": []}
    try:
        xl = pd.ExcelFile(ruta)
        for sheet in xl.sheet_names:
            df = pd.read_excel(ruta, sheet_name=sheet, header=None)
            # Detectar fila de encabezados (primera fila no vacía o con números)
            headers = []
            fila_inicio = 0
            for i in range(min(10, len(df))):
                row = df.iloc[i]
                if row.notna().any() and not all(
                    isinstance(v, (int, float)) and pd.notna(v) for v in row
                ):
                    headers = [str(c).strip() for c in row.tolist()]
                    fila_inicio = i
                    break
            df_data = pd.read_excel(ruta, sheet_name=sheet, header=fila_inicio)
            info["hojas"].append({
                "nombre": sheet,
                "columnas": list(df_data.columns),
                "filas": len(df_data),
                "muestra": df_data.head(3).to_dict(orient="records"),
                "dtypes": {c: str(d) for c, d in df_data.dtypes.items()},
            })
    except Exception as e:
        info["error"] = str(e)
    return info

def main():
    archivos = sorted(CAJA.glob("*.xlsx"))
    print(f"Archivos encontrados: {len(archivos)}\n")
    for ruta in archivos:
        print("=" * 80)
        print(f"ARCHIVO: {ruta.name}")
        print("=" * 80)
        info = analizar_archivo(ruta)
        if "error" in info:
            print(f"  Error: {info['error']}\n")
            continue
        for hoja in info["hojas"]:
            print(f"\n  Hoja: {hoja['nombre']}")
            print(f"  Filas: {hoja['filas']}")
            print(f"  Columnas: {hoja['columnas']}")
            print("  Tipos:", hoja["dtypes"])
            print("  Muestra (primeras 3 filas):")
            for i, row in enumerate(hoja["muestra"]):
                print(f"    [{i}] {row}")
        print("\n")
    return info

if __name__ == "__main__":
    main()
