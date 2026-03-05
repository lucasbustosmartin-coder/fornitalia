# Fornitalia — Dashboard Flujo de Caja

Proyecto de dashboard de flujo de caja y transacciones, con datos en Supabase.

## Estructura del repositorio

| Carpeta / archivo | Contenido |
|-------------------|-----------|
| **`sql/`** | Scripts SQL para Supabase (tablas, RLS, migraciones, respaldos). Ejecutarlos en el SQL Editor de Supabase. |
| **`scripts/`** | Scripts de utilidad: Python (migración, Excel, rubro contable) y Node.js (consolidar estados de resultado, bitácora, presentación, serie cauciones). |
| **`docs/`** | Documentación: requisitos Supabase, advertencias RLS, cómo poblar transacciones, novedades del negocio, etc. |
| **`Estados_Resultado/`** | Excel de Estado de Resultados por año (2024, 2025, …). Los scripts de consolidación leen desde aquí. |
| **`dashboard-flujo-caja.html`** | Aplicación principal del dashboard (abrir en el navegador o con `npm run dev`). |
| **`favicon.svg`** | Logo del proyecto. |
| **`package.json`** | Dependencias y scripts npm (`dev`, `consolidar-estados`, `presentacion`, etc.). |
| **`.env`** / **`.env.example`** | Variables de entorno (Supabase). No commitear `.env`. |

## Comandos útiles

- **Dashboard local:** `npm run dev` (abre el dashboard en el navegador).
- **Consolidar Estado de Resultados:** `npm run consolidar-estados` o `npm run consolidar-2025`.
- **Generar bitácora y presentación:** ejecutar `node scripts/crear-bitacora-excel.js` (genera `Bitacora_tareas.xlsx` y luego la presentación PowerPoint).
- **Serie de cauciones:** poner `Serie_Cauciones.xlsx` en la raíz y ejecutar `node scripts/convertir-serie-cauciones.js`; se genera `serie_cauciones.json` en la raíz.
- **Solapa Rubro contable en un Excel:** `python scripts/agregar_solapa_rubro_contable.py "ruta/al/archivo.xlsx"`.

## Documentación

- **Supabase:** ver `docs/SUPABASE_REQUISITOS.md` y `docs/SUPABASE_WARNINGS.md`.
- **Poblar transacciones desde Excel:** `docs/POBLAR_TRANSACCIONES_DESDE_EXCEL.md`.
- **Estado de Resultados:** `Estados_Resultado/COMO_EJECUTAR.txt`.
