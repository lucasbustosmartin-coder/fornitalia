# Análisis de inconsistencias y sugerencias de normalización — Datos legacy (Fornitalia)

**Propósito:** Este documento resume hallazgos sobre la calidad y coherencia de los datos de caja (origen: extracto / sistema legacy del cliente) y las **acciones recomendables en la base de datos de origen** antes o durante la migración definitiva.

**Alcance del análisis:** Universo de **movimientos de caja** equivalente al histórico analizado: **3.008** filas en hoja **Movimientos**.

- **Fuente canónica actual (repo LyP):** **`docs/Fornitalia_Movimientos.xlsx`** — export del sistema con columnas técnicas (`TipoMovimiento`, `MedioPago`, `CuentaContable`, `MontoCambio`, `MesAnio`, `UsuarioApp`, `Status`, e identificadores `IDCierreCaja`, `IDOperacion`, `IDComprobantePago`, `IDImpuesto`, `CatDesc`, etc.).
- **Extracto legado (convivencia):** **`docs/Extracto-Fornitalia.xlsx`** — mismos hechos con nombres “legibles” (`Tipo`, `Medio de Pago`, `Cuenta Contable`, `Monto en $`, `Mes/Año`, `Usuario`, `Estado`, `N° Operación`, …). Si falta el archivo nuevo, los scripts usan el legado.

Los **conteos y tablas** de las secciones 1–6 se elaboraron sobre ese universo de 3.008 filas (extracto legado en su momento); al **migrar al export `Fornitalia_Movimientos`** los totales por categoría/cuenta/medio deben **mantenerse** salvo correcciones en origen. La capa **`scripts/lib/fornitalia-movimiento-row-canon.js`** unifica ambos formatos a la forma “extracto” para informes y scripts.

**Pipeline hacia el dashboard:** `npm run normalizar-extracto` genera **`docs/Extracto-Fornitalia-Normalizado.xlsx`** (hoja **Normalizado**) con `fecha_iso`, montos numéricos, moneda inferida, más **`id_cierre_caja`**, **`id_comprobante_pago`**, **`id_impuesto`**, **`cat_desc`** cuando vienen del export. Ese archivo es el que se **importa** en la app para reemplazar `transacciones` en Supabase.

**Mensaje para el cliente:** Lo que sigue son **deudas de datos** que conviene resolver **en su sistema o planilla maestra**, no solo al importar: así se evitan errores de clasificación, reportes engañosos y trabajo manual repetido.

**Nota:** La columna **Cant.** indica cantidad de **filas** que caen en esa condición en el universo analizado (salvo donde se indica otro criterio).

---

## 0. Validaciones a futuro (IDs, CatDesc y calidad)

Con el export **`Fornitalia_Movimientos`**, el sistema puede **reforzar gobierno de datos** más allá de categoría/cuenta:

| Ámbito | Qué validar o explotar | Comentario |
|--------|-------------------------|------------|
| **`IDComprobantePago`** | Unicidad por comprobante; cruce con compras, facturas o Power Apps | Detecta duplicados de carga y habilita conciliación automática cuando exista la contrapartida. |
| **`IDImpuesto`** | Agrupar líneas del mismo obligación / liquidación | Mejora trazabilidad impositiva sin depender solo de texto en descripción. |
| **`IDCierreCaja`** | Cuadratura por cierre; auditoría de lotes | Todo movimiento operativo debería asociarse a un cierre cuando el proceso lo exige. |
| **`IDOperacion`** | Trazabilidad vs. duplicados aparentes | Sustituye al uso ambiguo de `N° Operación` = "-" en parte del histórico; conviene exigir ID en origen para movimientos nuevos. |
| **`CatDesc`** | Subetiqueta bajo **Categoría** | Evita mezclar en “Otros Servicios” realidades distintas; reglas tipo “si CatDesc = X entonces categoría debe ser Y”. |
| **`Status`** (`Confirmado` / `Pendiente` / `Anulado`) | Coherencia con categoría “Anulación” y con reportes | Una sola fuente de verdad: estado operativo vs. categoría duplicada (§1). |
| **Regeneración del plan GS** | Tras cada `normalizar-extracto`, ejecutar `npm run plan-normalizacion-excel` | Mantiene **`Extracto-Fornitalia-Plan-Normalizacion-GS.xlsx`** alineado al normalizado y a este documento. |

**Índices SQL opcionales** en Supabase para consultas por ID: `sql/supabase_indices_transacciones_id_lookup.sql`.

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
| **Anulación** (categoría) | 2 | Puede duplicar lógica de anulación por **estado** (`Estado` en extracto legado, `Status` en `Fornitalia_Movimientos`). | Una sola forma de anular (categoría vs estado **Anulado**); ver §0. |
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
| Campo **`CatDesc`** (export `Fornitalia_Movimientos`) | ~25 % de filas con valor en muestra de 3.008 (orden de magnitud) | Subetiqueta de negocio bajo **Categoría**; mejora reporting sin depender solo de descripción libre. | Reglas en origen: obligatoriedad por categoría, catálogo de valores permitidos; ver §0. |

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

El Excel **`Extracto-Fornitalia-Plan-Normalizacion-GS.xlsx`** (recomendaciones por fila para Gerencia de Sistemas) se genera con **`npm run plan-normalizacion-excel`**, leyendo la hoja **Normalizado** del archivo generado por **`npm run normalizar-extracto`** (misma fuente que el upload a Supabase). Conviene regenerarlo tras cambios en el libro de movimientos o en las reglas del script `generar-excel-plan-normalizacion-desde-normalizado.js`.

Documentación cruzada del cambio de fuente: **`docs/DIAGNOSTICO_FORNITALIA_MOVIMIENTOS_VS_EXTRACTO.md`**.

---

## 8. Propuesta de recategorización: relación categoría ↔ cuenta contable

Hoy la relación entre **categoría de gestión** y **cuenta contable** es en buena parte **implícita** (lo que el usuario elige al cargar) y **heterogénea** en el histórico (§1–§3). La propuesta es **formalizar** esa relación en el sistema o planilla maestra del cliente, no solo corregir tipeos.

### 8.1. Modelo sugerido

1. **Catálogo cerrado de categorías**  
   Valores únicos, sin duplicados semánticos (ej. una sola familia “Alquileres y servicios”, “Logística y fletes”). Cada categoría tiene **definición corta** de qué movimientos debe agrupar.

2. **Plan de cuentas único**  
   Cuentas con nombre/código oficial; sin variantes por mayúsculas ni typos (“Comisiones”, “SIRCREB”, etc.). Prohibido usar **“-”** como cuenta definitiva: reservado solo a borradores o reemplazado por cuenta real o código de excepción documentado.

3. **Matriz categoría → cuentas permitidas**  
   Para cada categoría, lista de **cuentas válidas** (o una **cuenta por defecto** más cuentas alternativas justificadas). Ejemplos de reglas: *Sueldos* no puede cerrarse contra *Comisiones Ventas* salvo política explícita; *Impuestos* puede mapear a varias cuentas pero agrupadas en reporting.

4. **Validación al cargar**  
   El sistema de origen rechaza o alerta si el par categoría–cuenta **no está** en la matriz (con flujo de excepción para casos puntuales y trazabilidad).

5. **Histórico**  
   Tabla o hoja de **equivalencias** (valor viejo → valor nuevo) para migraciones y para no perder trazabilidad en años anteriores.

### 8.2. Mejoras y beneficios (resumen)

| Ámbito | Beneficio breve |
|--------|-----------------|
| **Calidad de datos** | Menos pares incoherentes (ej. categoría vs cuenta contable); caída de correcciones manuales y de reglas “parche” en reportes. |
| **Reporting** | P&L, flujo de caja e impuestos alineados: la categoría explica la gestión y la cuenta el asiento; los agrupadores (ej. impuestos) son predecibles. |
| **Automatización** | Validaciones y exportaciones (extracto, ERP, dashboard) con **reglas claras**; más fácil detectar outliers en lugar de interpretar cada fila. |
| **Operación y auditoría** | Criterio documentado para quien carga; revisiones y auditorías con **matriz verificable** en lugar de convenciones orales. |
| **Evolución** | Altas de categorías o cuentas pasan por el maestro y la matriz; se evita la proliferación de “Otros” sin control. |

Esta recategorización es **complementaria** al resumen ejecutivo (§6): convierte las recomendaciones puntuales en un **diseño de gobierno de datos** sobre el par categoría–cuenta.

### 8.3. Matriz concreta (borrador para maestro del cliente)

Tabla tipo **hoja de trabajo** para cargar en Excel o en el sistema: cada fila es un cambio o una regla nueva sobre el par **categoría ↔ cuenta contable**. La columna **Acción** indica el tratamiento: **Editar** (reemplazar el par actual por el propuesto en histórico y reglas), **Nueva** (alta explícita en la matriz de pares permitidos; el “actual” puede repetir el propuesto si solo se formaliza), **Eliminar** (el par actual **no** debe seguir existiendo en la matriz ni como opción válida al cargar; migrar a la fila propuesta o a otra fila **Editar**).

| Ord. *n* | Categoría (actual) | Cuenta contable (actual) | Categoría (propuesta) | Cuenta contable (propuesta) | Acción | Ejemplo / criterio |
|---------:|-------------------|--------------------------|------------------------|-----------------------------|--------|-------------------|
| 1 | Alquiler | *(distintas en extracto)* | Alquileres y Servicios | Alquiler (u otra cuenta acordada del rubro) | Editar | Unificar categoría; 3 filas hoy en “Alquiler”. |
| 2 | Sueldos | Comisones Ventas | Comisiones | Comisiones Ventas | Editar | Corregir imputación y typo en cuenta (§3). |
| 3 | Logistica | *(según caso)* | Logística y fletes | *(misma cuenta operativa)* | Editar | Unificar grafía y criterio con “Flete” (§1). |
| 4 | Manteniemiento | *(según caso)* | Mantenimiento | *(sin cambio de cuenta salvo typo)* | Editar | Solo categoría: typo “Manteniemiento” (§2). |
| 5 | Transferencia | Transferencia entre Cuentas | Traspasos / internos | Transferencia entre Cuentas | Editar | Dejar claro que no es gasto operativo (§1). |
| 6 | Deposito | Deposito entre Cuentas | Traspasos / internos | Depósito entre cuentas | Editar | Alineación ortográfica y criterio con traspasos (§1). |
| 7 | *(cualquiera)* | Comisones Ventas | *(misma categoría si aplica)* | Comisiones Ventas | Editar | Typo en plan de cuentas (§2). |
| 8 | *(cualquiera)* | Comsiones Distribuidores | *(idem)* | Comisiones Distribuidores | Editar | Typo en plan de cuentas (§2). |
| 9 | *(cualquiera)* | Sircreb | *(idem)* | SIRCREB | Editar | Criterio único de capitalización (§2). |
| 10 | *(cualquiera)* | Telefonia | *(idem)* | Telefonía | Editar | Una forma oficial en plan de cuentas (§2). |
| 11 | *(cualquiera)* | - | *(según hecho económico)* | *(cuenta real)* | Editar | Sustituir guion por cuenta explícita (§2). |
| 12 | Comisiones Bancarias | Gastos Bancarios | Comisiones Bancarias | Gastos Bancarios | Nueva | Documentar en matriz como par **válido** (ya usado en dashboard). |
| 13 | Alquileres y Servicios | Alquiler | Alquileres y Servicios | Alquiler | Nueva | Referencia de buen uso; registro explícito en matriz (§3). |
| 14 | Otros Servicios | *(cuenta heterogénea)* | *(categoría específica)* | *(cuenta alineada al rubro)* | Eliminar | Redistribuir: el par genérico no queda como permitido por defecto (§1). |

**Uso:** el cliente puede duplicar la tabla, completar celdas “*(según caso)*” con valores reales del maestro y añadir filas. **Ord. *n*** sirve para priorizar implementación (1 = primero) o para ordenar en reuniones.

### 8.4. Borrador categoría · cuenta contable · rubro contable (Argentina)

Primer trabajo sugerido para revisión con **contador** y cliente. Cruza **categoría de gestión** y **cuenta del plan** con un **rubro de presentación** alineado a estados tipo **IGJ** y práctica **FACPCE** (RT 8, 9, 17 y modelos vigentes al cierre). **No** sustituye asesoramiento legal ni contable definitivo. *(Copia editable también en `docs/MATRIZ_CATEGORIA_CUENTA_RUBRO_BORRADOR.md`.)*

**Leyenda rápida**

| Prefijo | Significado |
|--------|-------------|
| **BC** | Balance general (estructura patrimonial) |
| **ER** | Estado de resultados (ingresos, costos y gastos del ejercicio) |
| **TES** | Movimiento de tesorería / sin impacto directo en resultado en este pasaje |
| **—** | Sin clasificar hasta definir política |

Donde la celda diga **a definir**, debe resolverse con el plan de cuentas oficial y el tipo societario.

**Excluidas por definición de este borrador:** las categorías **Apertura de Caja** y **Cierre de Caja** (movimientos de caja no operativos; no forman parte de la matriz categoría–cuenta–rubro para gestión ni reporting de estados — coherente con la exclusión en carga/upload del sistema).

| Categoría (sugerida / actual) | Cuenta contable (ejemplo o propuesta) | Rubro contable (presentación sugerida) | Dudas / pendiente |
|------------------------------|----------------------------------------|----------------------------------------|-------------------|
| Activos | Hornos | BC — Activo — **a definir** (No corriente: bienes de uso *vs* Corriente: bienes de cambio) | **a definir** si son mercadería, muebles y útiles o inmovilizado |
| Activos | *(otras cuentas del extracto)* | BC — Activo — **a definir** | **a definir** por hecho económico real |
| Alquiler | Alquiler *(u otra)* | ER — Gastos — Locaciones, alquileres y expensas | Confirmar si 100 % deducible / prorrateos |
| Alquileres y Servicios | Alquiler | ER — Gastos — Locaciones, alquileres y expensas | OK referencia; validar subcuentas |
| Alquileres y Servicios | *(cuenta distinta de Alquiler)* | ER — Gastos — **a definir** (servicios de terceros / otros) | **a definir** según naturaleza del gasto |
| Anulación | *(no aplica cuenta única)* | — | **a definir**; tratar por estado del asiento, no por categoría |
| Comisiones | Comisiones Ventas | ER — Gastos — Comisiones sobre ventas *(o ER — Costo de ventas — **a definir**)* | **a definir** política: gasto vs costo de venta |
| Comisiones | Comisiones Distribuidores | Idem | Idem |
| Comisiones Bancarias | Gastos Bancarios | ER — Resultados — Gastos financieros y bancarios | Documentar par como válido |
| Deposito / Depósito | Deposito entre Cuentas | TES — Movimientos entre cuentas propias | No es rubro de resultado |
| Impuestos | SIRCREB | ER — Gastos — Impuestos, tasas y contribuciones *(salvo tratamiento especial)* | **a definir** si parte va a crédito / pasivo |
| Impuestos | Sircreb | Idem (unificar nombre) | Idem |
| Impuestos | IVA Crédito Fiscal *(si en plan)* | BC — Activo corriente — Créditos fiscales / IVA | **a definir** según saldo y ejercicio |
| Impuestos | IVA a pagar / Impuestos a pagar *(si en plan)* | BC — Pasivo corriente — Impuestos a pagar | **a definir** |
| Impuestos | Percepciones / Retenciones *(según cuenta)* | BC — Activo / Pasivo — **a definir** | **a definir** por tipo de obligación |
| Impuestos | *(resto de cuentas impositivas del extracto)* | ER o BC — **a definir** | Mapeo **cuenta por cuenta** en plan maestro |
| Logística y fletes | Flete | ER — Gastos — Fletes, fletes internos y logística | Unificar con “Logistica” |
| Logistica | *(cuenta operativa)* | ER — Gastos — Fletes y logística | Corregir ortografía categoría |
| Mantenimiento | Mantenimiento / reparaciones | ER — Gastos — Mantenimiento y reparaciones | — |
| Manteniemiento | *(misma lógica)* | Idem | Unificar categoría a **Mantenimiento** |
| Otros Servicios | *(heterogéneo)* | ER — Gastos — Otros gastos / Servicios de terceros | **a definir** redistribución por fila |
| Sueldos | Sueldos y cargas sociales *(nombre plan)* | ER — Gastos — Remuneraciones y cargas sociales | Validar cargas en cuenta separada o agrupada |
| Sueldos | Comisones Ventas *(error histórico)* | → migrar a **Comisiones** + **Comisiones Ventas** | **a definir** ER gasto vs costo |
| Telefonía | Telefonía | ER — Gastos — Comunicaciones y conectividad | Unificar grafía |
| Telefonia | Telefonia | Idem | Unificar a **Telefonía** |
| Transferencia | Transferencia entre Cuentas | TES — Traspasos internos | Excluir de ER operativo |
| Ventas | Ventas | ER — Ingresos — Ventas de bienes / servicios | **a definir** desglose IVA en presentación |
| Ventas | IVA Débito Fiscal *(si figura en plan)* | BC — Pasivo — IVA débito / ER según criterio | **a definir** con contador |
| *(categoría vacía)* | *(cuenta informada)* | **a definir** | Completar categoría |
| *(categoría informada)* | - *(guión)* | **a definir** | Sustituir cuenta guion |
| Compras / Mercaderías *(si se agrega categoría)* | Mercaderías / Mercaderías en tránsito | BC — Activo corriente — **Bienes de cambio** | Ver `RUBROS_CONTABILIDAD_ARGENTINA_REFERENCIA.md` |
| Compras / Mercaderías | Proveedores exterior | BC — Pasivo corriente — Proveedores | Importaciones |
| Costo de ventas *(si se registra en caja)* | CMV | ER — Costo de ventas — Costo de mercaderías vendidas | **a definir** si el extracto lleva CMV o solo caja |

**Notas para la reunión:** (1) El **rubro** mezcla cuentas de balance (BC) y naturaleza en ER: en el maestro pueden ser **dos columnas** (“Rubro balance” y “Rubro resultado”) donde aplique. (2) **Impuestos** (~49 % del extracto): no reemplaza un mapeo **cuenta por cuenta**; mantener **a definir** hasta el plan detallado. (3) **Hornos / Activos:** decisión crítica entre bienes de cambio, inmovilizado u otro; documentar. (4) **Traspasos:** suelen ser **TES** para no distorsionar gastos. (5) **Apertura / Cierre de Caja** no se listan en la tabla: quedan **excluidas por definición** (ver párrafo previo). (6) Actualizar tras normas vigentes (p. ej. **RG IGJ** y **RT** del ejercicio).

### 8.5. Rubro contable (Argentina) y proyección del balance desde el sistema

**Idea de diseño:** además del par categoría ↔ cuenta contable, conviene que el maestro incorpore un **rubro / clasificación patrimonial** alineado con la práctica y presentación de estados en Argentina (p. ej. criterios tipo **IGJ**, referencias **FACPCE** como RT 8, 9, 17, según use el contador). Así cada cuenta (o cada par permitido) puede **mapearse** a Activo / Pasivo / Patrimonio / Resultado y, dentro del activo, a **Bienes de cambio**, etc., lo que **facilita proyectar** un balance o borradores de estados **desde** los datos del sistema y exportaciones, sin reemplazar el asiento formal ni el cierre.

**¿Es buena idea?** En general **sí**: da un **lenguaje común** con el contador y reduce trabajo manual al armar reportes patrimoniales; el matiz es que el **flujo de caja** y el extracto **no bastan solos** para un balance completo (stock, devengados, depreciaciones, ajuste por inflación al cierre, etc.). La proyección será tan buena como los **datos y reglas** que se carguen fuera del puro movimiento de caja.

**Documento detallado para revisión:** en `docs/RUBROS_CONTABILIDAD_ARGENTINA_REFERENCIA.md` está incorporado un desarrollo concreto (ejemplo **importación de bienes de cambio** — hornos —: mercaderías en tránsito, gastos activables, IVA y percepciones como crédito fiscal, **venta + CMV**, y nota sobre **ajuste por inflación** al cierre). Sirve para revisión con el contador y para decidir columnas extra en la matriz (**Rubro IGJ / patrimonial**, naturaleza del saldo, observaciones).

**Archivo espejo** (misma tabla para editar aparte): `docs/MATRIZ_CATEGORIA_CUENTA_RUBRO_BORRADOR.md` — conviene mantenerlo alineado con §8.4.

---

*Documento para etapa de análisis y reunión con el cliente. Conteos referidos al universo de **3.008** movimientos (análisis original sobre extracto legado; equivalente a `docs/Fornitalia_Movimientos.xlsx` / `docs/Extracto-Fornitalia.xlsx`, hoja **Movimientos**). Tras editar el `.md`, regenerar HTML/PDF (comandos abajo). Si el maestro de datos o los volcados cambian materialmente, conviene **recalcular conteos** con scripts de auditoría o pivot sobre el normalizado.*

**Formatos entregables:** el mismo contenido está en `ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.md` (fuente), `.html` y `.pdf` en la misma carpeta `docs/`.

**Regenerar tras editar el `.md`:** en la raíz del repo Fornitalia:
- `npm run informe-normalizacion-html` → solo HTML.
- `npm run informe-normalizacion-pdf` → HTML + PDF (usa **Playwright** + Chromium, igual que el stack del proyecto **Pandi**). La primera vez en una máquina: `npm install` y `npx playwright install chromium`.

**Alternativa sin Playwright:** abrir el `.html` en Chrome/Safari → Imprimir → Guardar como PDF.
