# Volver a poblar transacciones desde los Excel (como al inicio)

Si la base quedó con datos incorrectos o querés repoblar desde los archivos Excel originales:

## Requisitos

- Archivos Excel de caja en la carpeta **`Caja/`** (mismo formato que al inicio: columnas como Título, ID, Fecha_MC, Monto_MC, etc.).
- Archivo **`.env`** en la raíz del proyecto con:
  - `SUPABASE_URL` = URL del proyecto Supabase
  - `SUPABASE_SERVICE_ROLE_KEY` = clave service_role (recomendado para poder insertar)

## Pasos

### 1. Vaciar la tabla en Supabase

En el **SQL Editor** de Supabase, ejecutá el contenido de:

**`supabase_vaciar_transacciones.sql`**

(Trunca la tabla `transacciones`. Si falla por restricciones, usá `DELETE FROM public.transacciones;` en su lugar.)

### 2. Cargar desde cada Excel

Abrí la terminal y **entrá a la carpeta del proyecto Fornitalia** (donde están `migrate_caja_to_supabase.py`, la carpeta `Caja/` y `requirements-migracion.txt`). Luego ejecutá:

```bash
cd "/Users/lucasb/Escritorio - MacBook Air de Lucas/Fornitalia"
pip install -r requirements-migracion.txt
python migrate_caja_to_supabase.py
```

(Si ya estás en la carpeta Fornitalia, solo hace falta el `pip install` y el `python migrate_caja_to_supabase.py`.)

El script lee todos los `.xlsx` de `Caja/`, mapea las columnas al esquema de `transacciones` e inserta en Supabase por lotes.

---

**Resumen:** 1) Ejecutar `supabase_vaciar_transacciones.sql` en Supabase. 2) Ejecutar `python migrate_caja_to_supabase.py` con los Excel en `Caja/`.
