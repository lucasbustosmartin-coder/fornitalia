#!/usr/bin/env python3
"""Cuenta filas en todos los Excel de Caja (mismo criterio que la migración)."""
from pathlib import Path

import pandas as pd

CAJA = Path(__file__).parent / "Caja"

total = 0
for archivo in sorted(CAJA.glob("*.xlsx")):
    try:
        xl = pd.ExcelFile(archivo)
        por_archivo = 0
        for sheet_name in xl.sheet_names:
            df = pd.read_excel(archivo, sheet_name=sheet_name)
            if df.empty or len(df.columns) < 5:
                continue
            n = len(df)
            por_archivo += n
            print(f"  {archivo.name} / {sheet_name}: {n} filas")
        print(f"  → {archivo.name} TOTAL: {por_archivo}")
        total += por_archivo
    except Exception as e:
        print(f"  Error {archivo.name}: {e}")
print(f"\nTOTAL esperado en todos los Excel: {total}")
