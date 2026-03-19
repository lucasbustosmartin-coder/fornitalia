# Análisis de inconsistencias y sugerencias de normalización — Datos legacy (Fornitalia)

**Propósito:** Este documento resume hallazgos sobre la calidad y coherencia de los datos de caja (origen: extracto / sistema legacy del cliente) y las **acciones recomendables en la base de datos de origen** antes o durante la migración definitiva.

**Alcance del análisis:** Archivo **`docs/Extracto-Fornitalia.xlsx`**, hoja **Movimientos**. **Total de registros analizados: 3.008.** Los mismos criterios aplican a la base operativa del cliente si conserva los mismos campos (`Categoría`, `Cuenta Contable`, `Medio de Pago`, descripciones, etc.).

**Mensaje para el cliente:** Lo que sigue son **deudas de datos** que conviene resolver **en su sistema o planilla maestra**, no solo al importar: así se evitan errores de clasificación, reportes engañosos y trabajo manual repetido.

**Nota:** La columna **Cant.** indica cantidad de **filas del extracto** que caen en esa condición (salvo donde se indica otro criterio).

---

## 1. Categorías ambiguas o duplicadas en el significado

| Inconsistencia | Cant. | Evidencia / riesgo | Recomendación |
|----------------|------:|-------------------|---------------|
| **Alquiler** vs **Alquileres y Servicios** | 3 vs 98 | Coexisten; el volumen mayor está en “Alquileres y Servicios”. Riesgo de partir el mismo concepto. | Definir **una categoría canónica**; migrar la minoría al criterio acordado o unificar en un solo valor. |
| **Logistica** vs **Flete** | 37 vs 1 | “Logistica” concentra casi todo; “Flete” casi no se usa. | Unificar criterio o una sola categoría (**Logística y fletes**). Corregir ortografía: **Logística**. |
| **Transferencia** (categoría) | 38 | Coincide con 38 movimientos con cuenta “Transferencia entre Cuentas”: **movimiento interno**, no gasto/ingreso operativo típico. | Categoría propia (“Traspasos / internos”) o **exclusión del análisis de resultado**; no mezclar con gastos reales. |
| **Otros Servicios** | 81 | Categoría residual con cuentas muy heterogéneas. | **Redistribuir** a categorías específicas o crear **subrubros** en origen. |
| **Deposito** (categoría) | 40 | Los 40 con cuenta “Deposito entre Cuentas”; sin tilde en “Depósito”. | Alinear ortografía y criterio con **Transferencia entre cuentas** si es el mismo hecho. |
| **Activos** | 27 | Inversión en bienes mezclada con lógica de gastos del mes; 16 de ellos con cuenta **Hornos**. | Acordar reporting: **CAPEX vs resultado** / flujo operativo. |
| **Anulación** (categoría) | 2 | Puede duplicar lógica de anulación por **estado** del movimiento. | Una sola forma de anular (categoría vs flag `Estado`/`Anulado`). |
| **Apertura** / **Cierre** (categoría) | 50 / 47 | Movimientos de caja no operativos; suelen ir con cuenta **“-”**. | Política explícita en origen (código de cuenta o exclusión de reportes de gestión). |

---

## 2. Cuentas contables: errores de carga, tipeo y duplicados “fantasma”

| Inconsistencia | Cant. | Evidencia / riesgo | Recomendación |
|----------------|------:|-------------------|---------------|
| Cuenta **Comisones Ventas** | 31 | Typo (“Comisones”). | Corregir a **Comisiones Ventas** en maestro e histórico. |
| Cuenta **Comsiones Distribuidores** | 1 | Typo (“Comsiones”). | Corregir a **Comisiones Distribuidores**. |
| Categoría **Manteniemiento** vs **Mantenimiento** | 9 vs 38 | Dos grafías para el mismo concepto. | Unificar a **Mantenimiento**. |
| Cuenta **Telefonía** vs **Telefonia** | 4 vs 1 | Variante sin tilde. | Una forma oficial en plan de cuentas. |
| Cuenta **SIRCREB** vs **Sircreb** | 299 vs 4 | Misma obligación, distinta capitalización. | Criterio único (p. ej. todo mayúsculas). |
| Cuenta contable **"-"** (guión) | 233 | Alto volumen; asociado a aperturas, cierres e impuestos sin cuenta detallada. | Sustituir por valor **explícito** contable; el guion bloquea validaciones automáticas. |
| **Categoría vacía** | 24 | Sin categoría informada. | Obligatoriedad o flujo de excepción aprobado. |
| **Cuenta contable vacía** | 26 | Sin cuenta informada. | Igual que arriba. |
| **Categoría y cuenta vacías** (ambas) | 24 | Sin clasificación contable completa. | No permitir guardar sin completar o regla de negocio documentada. |

---

## 3. Relación categoría ↔ cuenta contable poco clara o inconsistente

| Inconsistencia | Cant. | Evidencia / riesgo | Recomendación |
|----------------|------:|-------------------|---------------|
| **Sueldos** + cuenta **Comisones Ventas** | 31 | Comisiones imputadas como sueldos en categoría. | Definir si deben ir bajo **Comisiones**; matriz categoría ↔ cuenta. |
| **Impuestos** (total categoría) | 1.477 | ~49% del extracto; muchas cuentas distintas (esperable). | **Agrupadores** de tipo impositivo para reporting. |
| **Comisiones Bancarias** + **Gastos Bancarios** | 157 | Par frecuente y coherente. | Documentar como **modelo** de par válido. |
| **Impuestos** + medio **MercadoPago** | 98 | Medio no “dice” impuesto en el nombre. | Refuerzo en descripción/observaciones o código de imputación en origen. |
| **Impuestos** + medio **Transferencia Morba** | 56 | Idem. | Idem. |
| **Alquileres y Servicios** + cuenta **Alquiler** | 29 | Par coherente (referencia de buen uso). | Usar como **modelo** para otros pares categoría–cuenta. |
| **Alquiler** (categoría) + cuenta **Alquiler** | 0 | Las 3 filas “Alquiler” no usan cuenta “Alquiler” en este extracto. | Revisar criterio de imputación en origen. |

---

## 4. Medios de pago: variedad y normalización

| Medio de pago (valor en extracto) | Cant. | Observación | Recomendación |
|----------------------------------|------:|-------------|---------------|
| Transferencia Galicia | 2.004 | Dominante. | Catálogo cerrado; formato uniforme `Transferencia - Galicia`. |
| MercadoPago | 304 | — | Etiqueta única oficial en base del cliente. |
| Efectivo Pesos | 299 | — | Mantener coherencia con moneda ARS. |
| Transferencia Galicia Dolar | 201 | — | Distinguir bien de pesos en reporting y reglas de moneda. |
| Transferencia Morba | 119 | — | Ya acordado negocio: tratamiento ARS. |
| Efectivo Dolar | 63 | — | Coherente con USD. |
| Transferencia Credicoop | 6 | — | Misma familia que otras transferencias. |
| Medio **"-"** (guión) | 12 | Dato faltante. | Completar o valor “No informado” trazable. |

**Recomendación general:** catálogo maestro de medios y reglas de moneda por medio.

---

## 5. Campos de texto (descripción, observaciones, cliente)

| Inconsistencia | Cant. | Evidencia / riesgo | Recomendación |
|----------------|------:|-------------------|---------------|
| Descripción con typo **“comisones”** (o similar) | 27 | Alineado con errores en cuentas. | Corrección en origen / reemplazo controlado en históricos. |
| Información solo en **observaciones** vs **descripción** | — | Cualitativo: afecta validaciones automáticas aunque el asiento sea correcto. | Criterio de uso de campos o **texto consolidado** en export. |

---

## 6. Resumen ejecutivo — Qué debe resolver el cliente en su base

1. **Plan de cuentas y categorías:** unificar duplicados semánticos (Alquiler / Alquileres y Servicios, Logística/Flete, Mantenimiento, comisiones mal escritas, SIRCREB, telefonía).  
2. **233 movimientos** con cuenta **"-"** y **12** con medio **"-"**: reemplazar por valores explícitos.  
3. **81** registros en **Otros Servicios**: redistribuir o subrubrificar.  
4. **Política** para **38** transferencias internas (categoría Transferencia) y **27** en **Activos** (CAPEX vs operativo).  
5. **Matriz oficial categoría ↔ cuentas permitidas** (o típicas).  
6. **Catálogo cerrado** de medios de pago (7 valores principales + guiones ya cuantificados).  
7. **24–26** filas sin categoría o sin cuenta: reglas de obligatoriedad al cargar.

---

## 7. Nota técnica (referencia interna)

El dashboard Fornitalia aplica reglas propias (visualización de categorías, validación egreso categoría/cuenta/descripción, excepciones en código). **Eso no sustituye** la corrección en la base del cliente.

---

*Documento para etapa de análisis y reunión con el cliente. Conteos referidos al extracto `docs/Extracto-Fornitalia.xlsx`, hoja Movimientos (3.008 filas). Actualizar si el maestro de datos o el archivo cambian.*

**Formatos entregables:** el mismo contenido está en `ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.md` (fuente), `.html` y `.pdf` en la misma carpeta `docs/`.

**Regenerar tras editar el `.md`:** en la raíz del repo Fornitalia:
- `npm run informe-normalizacion-html` → solo HTML.
- `npm run informe-normalizacion-pdf` → HTML + PDF (usa **Playwright** + Chromium, igual que el stack del proyecto **Pandi**). La primera vez en una máquina: `npm install` y `npx playwright install chromium`.

**Alternativa sin Playwright:** abrir el `.html` en Chrome/Safari → Imprimir → Guardar como PDF.
