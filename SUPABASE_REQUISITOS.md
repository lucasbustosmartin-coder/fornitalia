# Migración Caja → Supabase – Requisitos y estructura

## Resumen de los Excel analizados

Se revisaron **6 archivos** en la carpeta `Caja/`:

| Archivo | Contenido (medio de pago) |
|---------|---------------------------|
| REPORTE CAJAS EFECTIVO DOLAR 2025.xlsx | Efectivo Dolar |
| REPORTE CAJAS EFECTIVO PESOS 2025.xlsx | Efectivo Pesos |
| REPORTE CAJAS MERCADO PAGO 2025.xlsx | MercadoPago |
| REPORTE CAJAS MORVA 2025.xlsx | Transferencia Morba |
| REPORTE CAJAS TRANSFERENCIA GALICIA DOLAR 2025.xlsx | Transferencia Galicia Dolar |
| REPORTE CAJAS TRANSFERENCIA GALICIA PESOS 2025.xlsx | Transferencia Galicia (pesos) |

Todos comparten **la misma estructura**: 25 columnas por hoja, con hojas por mes (Mayo, Junio, Julio, … Diciembre). Cada fila es una **transacción** de caja (ingreso, egreso, apertura/cierre, etc.).

---

## Estructura de columnas (mapeo a tabla `transacciones`)

| Columna Excel | Tipo en DB | Descripción |
|---------------|------------|-------------|
| Título | text | Ej: "biba" |
| ID | bigint | ID del movimiento en el sistema origen (puede repetirse entre archivos) |
| IDCierreCaja_MC | text | Identificador del cierre de caja |
| IDOperacion_MC | text | ID operación (numérico o código como TRF-...) |
| IDComprobantePago_MC | numeric | ID comprobante de pago |
| IDImpuesto_MC | numeric | ID impuesto |
| Cliente_MC | text | Nombre del cliente |
| TipoMovimiento_MC | text | Ingreso, Egreso, Apertura de Caja, Cierre de Caja |
| MedioPago_MC | text | Efectivo Dolar, Efectivo Pesos, MercadoPago, etc. |
| Descripcion_MC | text | Descripción del movimiento |
| CatDesc_MC | text | Categoría descripción |
| Observaciones_MC | text | Observaciones |
| Categoria_MC | text | Ventas, Transferencia, Impuestos, Apertura, Cierre, etc. |
| CuentaContable_MC | text | Cuenta contable |
| Monto_MC | numeric | Monto (puede ser entero o decimal) |
| TipoCambio_MC | numeric | Tipo de cambio si aplica |
| MontoCambio_MC | numeric | Monto en moneda de cambio |
| Fecha_MC | date | Fecha del movimiento |
| Mes_MC | smallint | Mes (1-12) |
| MesAnio_MC | date | Primer día del mes (para agrupaciones) |
| Anio_MC | smallint | Año |
| Hora_MC | time | Hora del movimiento |
| UsuarioApp_MC | text | Usuario que registró |
| Status_MC | text | Confirmado, Anulado, etc. |
| CreacionManual_MC | text | "SI" o null si no es manual |

Además, en la migración se agrega:
- **origen_archivo** (text): nombre del Excel de origen (para trazabilidad).
- **id** (uuid, PK): generado por Supabase; no usamos el ID del Excel como PK porque se repite entre archivos.

---

## Qué necesitas de Supabase para la conexión

Para que el script de migración pueda **crear la tabla** (si no existe) y **insertar los datos**, necesitas:

### 1. URL del proyecto

- En el dashboard de Supabase: **Project Settings → API**.
- Copia la **Project URL** (ej: `https://xxxxx.supabase.co`).

### 2. Clave de API (recomendado: service_role para migración)

- En la misma página: **Project API Keys**.
- Para el script de migración (una sola vez, desde tu máquina) usa la **service_role key** (secret). Así el script puede crear la tabla e insertar sin RLS.
- No compartas esta clave ni la subas a repositorios. Se usa solo en `.env` local.

### 3. Variables de entorno

Crea un archivo `.env` en la raíz del proyecto (el mismo directorio donde está el script de migración), con:

```env
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- `SUPABASE_URL`: Project URL de arriba.
- `SUPABASE_SERVICE_ROLE_KEY`: la **service_role** key de arriba.

El script leerá estas variables para conectarse.

### 4. Crear la tabla en Supabase

Tienes dos opciones:

**Opción A – Desde el dashboard (recomendado la primera vez)**  
1. En Supabase: **SQL Editor**.  
2. Pega y ejecuta el contenido del archivo `supabase_transacciones.sql` que está en este proyecto.  
3. Eso crea la tabla `transacciones` con todas las columnas y tipos correctos.

**Opción B – Dejar que el script cree la tabla**  
El script de migración puede ejecutar el mismo SQL si le indicas que cree la tabla (ver instrucciones en el README o en el propio script).

---

## Resumen de pasos

1. Crear proyecto en [Supabase](https://supabase.com) si aún no lo tienes.
2. Copiar **Project URL** y **service_role key**.
3. Crear `.env` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
4. Ejecutar `supabase_transacciones.sql` en el SQL Editor de Supabase (o usar la opción del script que crea la tabla).
5. Instalar dependencias: `pip install openpyxl pandas python-dotenv supabase`.
6. Ejecutar el script de migración desde la raíz del proyecto (por ejemplo: `python migrate_caja_to_supabase.py`).

Cuando tengas la URL y la clave en el `.env`, podrás ejecutar la migración y cargar todas las filas de los 6 Excel en la tabla **transacciones**.
