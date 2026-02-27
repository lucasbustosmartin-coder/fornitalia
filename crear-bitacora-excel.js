const XLSX = require('xlsx');
const path = require('path');

// --- Hoja Log (bitácora de tareas)
const datosLog = [
  ['Fecha', 'Hora', 'titulo_tarea', 'desc_tarea', 'etapa'],
  ['27/02/2025', '10:00', 'Separar categorías Sueldos y Comisiones', 'Partir la categoría Sueldos en dos: Sueldos (solo sueldos) y Comisiones (registros con descripción/cat_desc que indiquen comisión). Evitar doble imputación con otras categorías.', 'Diagnostico'],
  ['27/02/2025', '10:15', 'Columnas Comisiones/Ventas % y Egr s/com. / Ingresos', 'Agregar en la tabla flujo por mes: columna Comisiones/Ventas % (comisiones sobre ventas del mes) y columna Egr s/com. / Ingresos (egresos sin comisiones sobre ingresos).', 'Diagnostico'],
  ['27/02/2025', '10:30', 'Detección de comisiones con typo Comisones', 'Incluir en la lógica la variante Comisones (sin i) para que los registros bajo Sueldos con descripción tipo Comisones Ventas se clasifiquen como Comisiones y aparezca la fila en el modal.', 'Diagnostico'],
  ['27/02/2025', '10:45', 'Origen en modal de detalle', 'Mostrar origen_archivo en el modal de detalle de transacciones por categoría (cada línea del listado muestra Origen cuando existe).', 'Diagnostico'],
  ['27/02/2025', '11:00', 'Crear bitácora de tareas', 'Crear archivo Excel/CSV bitácora con columnas Fecha, Hora, titulo_tarea, desc_tarea, etapa. Registrar tareas principales realizadas con etapa Diagnostico.', 'Diagnostico'],
  ['27/02/2025', '11:15', 'Solapa Log y Resumen en bitácora', 'Bitácora en solapa "Log"; nueva solapa "Resumen" con listado de funcionalidades de la app (Flujo de caja, moneda, comisiones, detalle por mes, alertas, etc.).', 'Diagnostico'],
  ['27/02/2025', '11:30', 'Modal del mes con dos solapas', 'En el modal de detalle del mes: solapa "By Categoria" (vista actual por categoría) y solapa "By Cuenta Contable" (agrupado por cuenta_contable). Misma estructura de tabla y Ver para expandir transacciones.', 'Diagnostico'],
  ['27/02/2025', '11:45', 'Menú lateral colapsable', 'Menú a la izquierda que se colapsa y expande; por ahora ítem Home (icono). Layout flex: sidebar + main-content. Estado expandido guardado en localStorage. Preparado para ir ampliando según pedidos del cliente.', 'Diagnostico'],
  ['27/02/2025', '12:00', 'Símbolo de moneda a la izquierda', 'Mostrar $ (pesos) y US$ (dólares) a la izquierda del monto en lugar de USD/ARS a la derecha.', 'Diagnostico'],
  ['27/02/2025', '12:15', 'Modal gráfico serie mensual por categoría/cuenta', 'Al hacer clic en "Gráfico" junto a una categoría o cuenta contable en el modal del mes, abrir modal con gráfico de barras de la serie mensual (neto por mes), respetando la moneda seleccionada (Chart.js).', 'Diagnostico'],
  ['27/02/2025', '14:00', 'Repositorio Git en GitHub', 'Crear repo fornitalia en GitHub (lucasbustosmartin-coder). git init, .gitignore (node_modules, .venv, .env), primer commit con dashboard, bitácora, scripts, SQL. Remote origin: https://github.com/lucasbustosmartin-coder/fornitalia.git. Push a rama main.', 'Diagnostico'],
  ['27/02/2025', '14:15', 'Despliegue en Vercel', 'Conectar cuenta GitHub a Vercel. Importar repo lucasbustosmartin-coder/fornitalia. Deploy con preset Other, sin build. App publicada en https://fornitalia.vercel.app/', 'Diagnostico'],
  ['27/02/2025', '14:20', 'Raíz Vercel con vercel.json', 'Crear vercel.json con rewrite: source / → destination /dashboard-flujo-caja.html. Así https://fornitalia.vercel.app/ abre directo el dashboard. Commit y push; Vercel redepliega automático.', 'Diagnostico'],
  ['27/02/2025', '15:00', 'Exportar a Excel', 'Botón "Exportar a Excel" con icono (mismo estilo que los del modal: gris, sencillo). Exporta la tabla de transacciones tal como está en Supabase: todas las columnas (fecha, mes, anio, tipo_movimiento, monto, status, medio_pago, descripcion, cliente, categoria, cat_desc, origen_archivo, cuenta_contable) en una hoja Excel para poder analizar los datos desde Excel. Librería SheetJS (xlsx) en el navegador.', 'Diagnostico'],
  ['27/02/2025', '15:10', 'Exportar transacciones crudas', 'Ajuste: el botón Exportar a Excel pasa a exportar directamente la tabla de transacciones (datos crudos de Supabase), no el resumen flujo por mes, para permitir manipular y analizar los datos desde Excel.', 'Diagnostico'],
  ['27/02/2025', '15:30', 'Regla flujo despliegue y versiones', 'Nueva regla: al final de cada tarea el usuario prueba en local y confirma; recién entonces el asistente despliega (git push). Se agrega hoja Versiones en la bitácora para registrar versión incremental en cada despliegue (1.0, 1.1, …).', 'Diagnostico'],
  ['27/02/2025', '16:00', 'Campo moneda en tabla transacciones', 'Agregar columna moneda (ARS/USD) a la tabla transacciones en Supabase para normalizar la moneda de registración. Migración en supabase_transacciones_moneda.sql. Dashboard prioriza moneda; si viene vacío, infiere desde medio_pago. Export a Excel incluye columna moneda.', 'Diagnostico'],
  ['27/02/2025', '16:20', 'Modal detalle: ancho y moneda registración', 'Ensanchado del modal mensual de detalle. En el listado de transacciones se muestra el monto con su moneda de registración (US$ / $) antes del monto; si difiere de la moneda seleccionada, se muestra la conversión a la moneda de vista (→) o (sin cot.) si falta tipo de cambio.', 'Diagnostico'],
  ['27/02/2025', '16:30', 'Modal detalle: transacciones en tabla', 'En el modal mensual (By Categoría / By Cuenta), el detalle expandido de transacciones ahora se renderiza como una tabla con encabezados (Fecha, Tipo, Medio, Mon., Monto, moneda vista, Descripción, Origen) para una lectura y análisis más clara.', 'Diagnostico'],
  ['27/02/2025', '16:40', 'Modal detalle: columna TC', 'En la tabla de detalle expandida del modal mensual se agrega columna TC (MEP/CCL/OFICIAL según selector). Se muestra el tipo de cambio aplicado por fecha cuando hay conversión entre moneda de registración y moneda de vista; si no aplica muestra — y si falta cotización muestra sin cot.', 'Diagnostico'],
  ['27/02/2025', '16:50', 'Recategorización Alquiler → Alquileres y Servicios', 'Si la categoría original es exactamente Alquiler, el dashboard la muestra como Alquileres y Servicios (solo cambio de etiqueta visual, los números y agrupaciones siguen conciliando).', 'Diagnostico'],
  ['27/02/2025', '17:00', 'Detección de errores de clasificación (Egresos)', 'Para egresos: si la descripción (más cat_desc/cliente) no contiene palabras relevantes de la categoría mostrada o de la cuenta contable, se recategoriza visualmente como Sin categoría y se registra como error de tipo "Inconsistencia entre Categoria , Cuenta Contable y Descripcion". En el modal mensual se agrega solapa Errores con el conteo y un acceso a un modal de detalle con todos los registros en error.', 'Diagnostico'],
  ['27/02/2025', '17:30', 'Modal errores: ampliar, editar registro y campos editado/editado_detalle', 'Ampliar modal de detalle de errores. Agregar icono de edición por registro que abre modal para actualizar en BD: Categoría y Cuenta contable solo desde valores existentes (dropdown), Descripción libre. Tabla transacciones: nuevos campos editado (flag) y editado_detalle (ej. Categoria, Descripcion, Cuenta Contable). Migración supabase_transacciones_editado.sql. Export Excel incluye editado y editado_detalle.', 'Diagnostico'],
  ['27/02/2025', '17:40', 'Excepción errores: Comisiones Bancarias / Gastos Bancarios', 'Si la categoría es Comisiones Bancarias y la cuenta contable es Gastos Bancarios, se considera consistente y no entra en el log de errores de clasificación (aunque la descripción no contenga esas palabras).', 'Diagnostico'],
  ['27/02/2025', '17:50', 'Excepción errores: Impuestos / MercadoPago y Impuestos / Transferencia Morba', 'Si la categoría es Impuestos y la cuenta contable es MercadoPago o Transferencia Morba, se considera consistente y no entra en el log de errores de clasificación, aunque la descripción no contenga esas palabras.', 'Diagnostico'],
  ['27/02/2025', '18:00', 'Excepción errores: Alquileres y Servicios / Alquiler', 'Si la categoría es Alquiler (mostrada como Alquileres y Servicios) y la cuenta contable es Alquiler, se considera consistente y no entra en el log de errores de clasificación.', 'Diagnostico'],
  ['27/02/2025', '18:10', 'Solapa Errores global y exportación a Excel', 'Nueva pestaña Errores en el dashboard (a la derecha de Sin cotización) que lista todos los egresos con error de clasificación, permite editar cada registro con el mismo modal de edición y se puede exportar a Excel con todos los campos relevantes (incluyendo editado y editado_detalle).', 'Diagnostico'],
  ['27/02/2025', '18:20', 'Monto numérico en exportación Excel', 'En ambas exportaciones (Transacciones y Errores), la columna monto se escribe como valor numérico (Number) en lugar de texto, para que Excel reconozca números y permita usar fórmulas (SUM, SUMIF, etc.).', 'Diagnostico'],
  ['27/02/2025', '18:30', 'Tipo de error y detección de potencial duplicado', 'En la solapa Errores: columna Tipo de error (Inconsistencia entre Categoria/Cuenta/Descripcion o Potencial registro duplicado). Detección de duplicados por misma fecha, monto, tipo_movimiento y descripción similar. Para duplicados: icono Ver que abre modal comparando ambos registros; opciones Excluir de cálculos (anular) o Eliminar registro. Export Excel incluye tipo_error.', 'Diagnostico'],
  ['27/02/2025', '18:40', 'Filtro por tipo de error en solapa Errores', 'Selector "Tipo de error" en la barra de la solapa Errores: Todos, Inconsistencia (categoría/cuenta/descripción), Potencial registro duplicado. La tabla y la exportación a Excel respetan el filtro seleccionado.', 'Diagnostico'],
  ['27/02/2025', '18:50', 'Duplicados: cliente igual e id_origen en comparación', 'Solo se marca potencial duplicado si además de fecha, monto, tipo y descripción similar el campo cliente es igual; si cliente es distinto no se marca. En el modal de comparación (Este registro / Posible duplicado) se incluye id_origen y Cliente.', 'Diagnostico'],
  ['27/02/2025', '19:00', 'Regla bitácora: actualizar todas las solapas necesarias', 'La regla pasa a exigir actualizar todas las solapas que correspondan: Log, Resumen (si aplica), Presupuesto (cuando la tarea agrega o cambia un entregable comercial), Versiones (en despliegue). Presupuesto se actualiza con el rubro "Detección de duplicados y gestión de errores".', 'Diagnostico'],
  ['27/02/2025', '19:10', 'Solapa Evolución (tabla dinámica)', 'Nueva pestaña Evolución: tabla dinámica con Agrupar por (Categoría o Cuenta contable) como fila y Período (Diario o Mensual) como columna. Diario muestra fecha (día), Mensual muestra MM-YYYY. Celdas = neto (ingresos - egresos) en la moneda seleccionada. Columna Total por fila.', 'Diagnostico'],
  ['27/02/2025', '19:20', 'Evolución: clic en valor y exportar a Excel', 'Al hacer clic en un valor de la tabla Evolución se abre un modal con detalle mínimo: Fecha, Categoría, Descripción, Monto (registros que componen esa celda). Botón Exportar Evolución a Excel exporta la tabla resultante según los filtros Agrupar por y Período.', 'Diagnostico'],
  ['27/02/2025', '19:30', 'Exportaciones: título moneda, icono Excel, Exportar Base Histórica', 'En todas las exportaciones a Excel se agrega una fila título que indica la moneda (o que ver columna moneda). Icono tipo Excel (tabla/grid) en botones de exportar. Exportar base de transacciones movido a la línea del selector de moneda con título "Exportar Base Histórica" e icono Excel; mismo icono en Exportar Evolución a Excel.', 'Diagnostico'],
  ['27/02/2025', '19:40', 'Evolución: ingreso primero, luego egreso', 'En la tabla Evolución las filas (categorías o cuentas) se ordenan primero las de ingreso (total >= 0) y luego las de egreso (total < 0); dentro de cada grupo orden alfabético.', 'Diagnostico'],
  ['27/02/2025', '19:50', 'Solapa Errores: columna Mes-Año por Id_Origen', 'En la tabla de la solapa Errores se reemplaza la columna Mes-Año por Id_Origen (identificador de origen del registro).', 'Diagnostico'],
  ['27/02/2025', '20:00', 'Balance por G/P e Id_Origen en modal Evolución', "En todo el dashboard se reemplaza la etiqueta Balance por G/P (Ganancia/Pérdida). En el modal de detalle al hacer clic en un valor de Evolución se agrega la columna Id_Origen.", 'Diagnostico'],
];

const wsLog = XLSX.utils.aoa_to_sheet(datosLog);
wsLog['!cols'] = [
  { wch: 12 },
  { wch: 6 },
  { wch: 45 },
  { wch: 95 },
  { wch: 14 },
];

// --- Hoja Resumen (funcionalidades de la app)
const funcionalidades = [
  ['Funcionalidad', 'Descripción'],
  ['Flujo de caja por mes', 'Tabla con ingresos, egresos y balance por mes/año.'],
  ['Resumen global', 'Totales: Total ingresos, Total egresos, Balance (en ARS o USD).'],
  ['Moneda', 'Selector ARS / USD; conversión con tipos de cambio desde Supabase. Montos mostrados con $ (pesos) o US$ (dólares) a la izquierda.'],
  ['Tipo de cambio USD', 'Opciones MEP, CCL u Oficial para convertir a dólares.'],
  ['Comisiones/Ventas %', 'Columna: porcentaje comisiones (egresos comisión desde Sueldos) sobre ventas del mes.'],
  ['Egr s/com. / Ingresos', 'Columna: porcentaje (egresos sin comisiones) sobre ingresos del mes.'],
  ['Categorías Sueldos y Comisiones', 'Categoría Sueldos partida en dos: Sueldos (solo sueldos) y Comisiones (según descripción/cat_desc). Sin doble imputación.'],
  ['Detección comisiones', 'Incluye variante "Comisones" en descripción para clasificar como Comisiones.'],
  ['Detalle por mes', 'Clic en una fila de mes abre modal con dos solapas: By Categoria y By Cuenta Contable.'],
  ['By Categoria', 'Solapa del modal: detalle agrupado por categoría (Sueldos, Comisiones, etc.) con botón Ver para listado de transacciones.'],
  ['By Cuenta Contable', 'Solapa del modal: detalle agrupado por cuenta_contable; misma tabla con Monto y Ver para ver transacciones.'],
  ['Gráfico serie mensual', 'Botón "Gráfico" en cada fila de categoría/cuenta: abre modal con gráfico de barras de la serie mensual (neto por mes) para esa categoría o cuenta, en la moneda seleccionada.'],
  ['Detalle transacciones', 'En cada agrupación, listado con monto, descripción y origen (origen_archivo).'],
  ['Detalle transacciones (moneda registración)', 'En el modal mensual, cada línea muestra el monto en su moneda de registración (US$ / $). Si la moneda seleccionada difiere, se muestra la conversión a la moneda de vista (→) o indica (sin cot.) si falta tipo de cambio.'],
  ['Detalle transacciones (tabla)', 'En el modal mensual, al expandir una categoría/cuenta se muestra una tabla con títulos y filas de transacciones (Fecha, Tipo, Medio, Moneda, Monto, moneda vista, Descripción, Origen).'],
  ['Detalle transacciones (tipo de cambio)', 'En el detalle expandido del modal mensual, se muestra la columna TC (según MEP/CCL/Oficial) cuando hay conversión entre moneda registración y moneda vista; si no aplica muestra — y si falta cotización muestra sin cot.'],
  ['Alertas por mes', 'Avisos: mes sin egresos; sin registros de Sueldos, Comisiones, Alquileres o Impuestos; desvío % de categoría vs mes anterior.'],
  ['Sin cotización', 'Pestaña con transacciones que no tienen tipo de cambio (excluidas del resumen).'],
  ['Exclusiones', 'No se incluyen transacciones anuladas ni categorías Apertura y Cierre.'],
  ['Datos', 'Transacciones y tipo de cambio desde Supabase. Cotización faltante: se usa la fecha anterior disponible.'],
  ['Menú lateral', 'Sidebar izquierdo colapsable/expandible; botón toggle (▶/◀); ítem Home por ahora; estado persistido en localStorage. Listo para ampliar con más ítems.'],
  ['Repositorio Git (GitHub)', 'Repo: https://github.com/lucasbustosmartin-coder/fornitalia. Rama main. .gitignore excluye node_modules, .venv, .env. Para actualizar: git add . ; git commit -m "mensaje" ; git push origin main.'],
  ['App en producción (Vercel)', 'URL pública: https://fornitalia.vercel.app/ (vercel.json reescribe / al dashboard). Cada push a main en GitHub dispara redeploy automático en Vercel. Proyecto: fornitalia, equipo Lucas Bustos, plan Hobby.'],
  ['Exportar a Excel', 'Botón en la barra de la tabla (solo icono). Exporta la tabla de transacciones tal como está en Supabase: una hoja "Transacciones" con columnas fecha, mes, anio, tipo_movimiento, monto (valor numérico para fórmulas), status, medio_pago, moneda, descripcion, cliente, categoria, cat_desc, origen_archivo, cuenta_contable, editado, editado_detalle. Export Errores: monto también como número. Permite analizar y usar fórmulas en Excel.'],
  ['Flujo de despliegue', 'Al terminar cada tarea: el usuario prueba en local y confirma; recién entonces el asistente hace git add, commit y push (Vercel redepliega automático). No se despliega hasta confirmación.'],
  ['Versiones en bitácora', 'Hoja "Versiones" en Bitacora_tareas.xlsx: registro incremental (1.0, 1.1, …) con fecha y descripción de cada despliegue a Git/Vercel.'],
  ['Campo moneda (BD)', 'Columna moneda en tabla transacciones (ARS/USD). Si está informada, el dashboard la usa; si no, infiere desde medio_pago (ej. "dolar" → USD). Export a Excel incluye moneda.'],
  ['Edición desde modal Errores', 'En el detalle de errores, icono de edición por registro. Abre modal para corregir: Categoría y Cuenta contable solo desde valores existentes en BD; Descripción libre. Al guardar se actualiza la fila y se marcan editado y editado_detalle (qué campos se editaron).'],
  ['Campos editado y editado_detalle', 'En transacciones: editado (boolean) y editado_detalle (texto, ej. "Categoria, Descripcion, Cuenta Contable"). Migración supabase_transacciones_editado.sql. Export Excel los incluye.'],
  ['Tipo de error en Errores', 'Tabla de errores muestra columna Tipo de error: Inconsistencia entre Categoria, Cuenta Contable y Descripcion; o Potencial registro duplicado. Export a Excel incluye tipo_error.'],
  ['Detección de potencial duplicado', 'Registros con misma fecha, monto, tipo_movimiento y descripción similar se marcan como potencial duplicado. Icono Ver abre modal con comparación Este registro / Posible duplicado; acciones: Excluir de cálculos (anular) o Eliminar registro.'],
  ['Filtro por tipo de error', 'En la solapa Errores, selector para filtrar por tipo: Todos, Inconsistencia (categoría/cuenta/descripción), Potencial registro duplicado. La exportación a Excel exporta solo los registros visibles según el filtro.'],
  ['Duplicados: condición cliente', 'Dos registros son potencial duplicado solo si coinciden en fecha, monto, tipo_movimiento, descripción similar y además cliente es igual; si cliente es distinto no se marcan como duplicado. Modal de comparación muestra id_origen y Cliente.'],
  ['Regla bitácora', 'Actualizar todas las solapas necesarias: Log (siempre que haya tarea), Resumen (si cambia funcionalidad), Presupuesto (si agrega o cambia entregable comercial), Versiones (en despliegue). Regenerar Excel tras editar crear-bitacora-excel.js.'],
  ['Evolución (tabla dinámica)', 'Solapa Evolución: Agrupar por = Categoría o Cuenta contable (fila); Período = Diario (fecha por día) o Mensual (MM-YYYY). Columnas = períodos, celdas = neto en moneda seleccionada, columna Total.'],
  ['Evolución: detalle al clic y exportar', 'Clic en un valor de la tabla Evolución abre modal con detalle: Fecha, Categoría, Descripción, Monto. Exportar Evolución a Excel exporta la tabla según filtros Agrupar por y Período.'],
  ['Exportaciones Excel', 'Todas las exportaciones incluyen una fila título con la moneda. Exportar Base Histórica (icono Excel) en la línea del selector de moneda; Exportar Evolución a Excel con el mismo icono.'],
  ['Evolución: orden ingreso/egreso', 'En la tabla Evolución las filas se muestran primero las de ingreso (total >= 0) y luego las de egreso (total < 0); dentro de cada grupo orden alfabético. Aplica tanto al agrupar por Categoría como por Cuenta contable.'],
];

const wsResumen = XLSX.utils.aoa_to_sheet(funcionalidades);
wsResumen['!cols'] = [{ wch: 32 }, { wch: 85 }];

// --- Hoja Referencia Git y Vercel
const refGitVercel = [
  ['Concepto', 'Valor'],
  ['Repositorio GitHub', 'https://github.com/lucasbustosmartin-coder/fornitalia'],
  ['URL app en vivo (Vercel)', 'https://fornitalia.vercel.app/'],
  ['Rama principal', 'main'],
  ['Actualizar y subir cambios', 'git add .  →  git commit -m "descripción"  →  git push origin main'],
  ['Vercel redeploy', 'Automático al hacer push a main'],
  ['Archivo configuración raíz', 'vercel.json (rewrite / a dashboard-flujo-caja.html)'],
  ['Cuenta GitHub', 'lucasbustosmartin-coder'],
  ['Proyecto Vercel', 'fornitalia (equipo Lucas Bustos, plan Hobby)'],
];

const wsRef = XLSX.utils.aoa_to_sheet(refGitVercel);
wsRef['!cols'] = [{ wch: 28 }, { wch: 70 }];

// --- Hoja Versiones (versión incremental por despliegue)
const versiones = [
  ['Versión', 'Fecha', 'Descripción'],
  ['1.0', '27/02/2025', 'Estado inicial: dashboard flujo de caja, exportar transacciones a Excel, despliegue en Vercel'],
  ['1.1', '27/02/2025', 'Regla flujo despliegue (probar en local → confirmar → desplegar); hoja Versiones en bitácora'],
  ['1.2', '27/02/2025', 'Modal mensual: detalle en tabla + moneda registración + TC; normalización moneda en BD y export Excel con moneda'],
  ['1.3', '27/02/2025', 'Errores de clasificación (solapa Errores), edición desde modal, editado/editado_detalle; excepciones: Comisiones Bancarias/Gastos Bancarios, Impuestos/MercadoPago y Transferencia Morba, Alquiler/Alquiler'],
  ['1.4', '27/02/2025', 'Exportación Excel: monto como valor numérico (fórmulas en Excel); regla bitácora por defecto reforzada'],
  ['1.5', '27/02/2025', 'Errores: tipo de error, detección duplicados (cliente igual), filtro por tipo, modal comparación con id_origen; timeout carga y fechaStr para fechas'],
  ['1.6', '27/02/2025', 'Export Excel: botones verde y blanco; Evolución: orden ingreso luego egreso; modal detalle Evolución con columna Origen y modal más ancho'],
  ['1.7', '27/02/2025', 'Solapa Errores: columna Mes-Año reemplazada por Id_Origen en la tabla'],
  ['1.8', '27/02/2025', "Balance reemplazado por G/P (Ganancia/Pérdida); modal detalle Evolución con columna Id_Origen"],
];
const wsVersiones = XLSX.utils.aoa_to_sheet(versiones);
wsVersiones['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 75 }];

// --- Hoja Presupuesto (rubros comerciales sugeridos)
const presupuesto = [
  ['Grupo', 'Descripción comercial', 'Importe sugerido (ARS)'],
  ['Normalización de datos', 'Relevamiento, limpieza y normalización de datos históricos de caja (campos de moneda, categorías, cuentas contables, flags de edición). Incluye lógica de excepciones y detección de inconsistencias.', 250000],
  ['Dashboard flujo de caja', 'Diseño y desarrollo del dashboard mensual (Flujo por mes, Resumen, alertas, modal By Categoría / By Cuenta, gráficos de serie mensual). Incluye formatos de moneda y visualizaciones.', 320000],
  ['Detección de duplicados y gestión de errores', 'Detección de potencial duplicado (fecha, monto, tipo, cliente, descripción similar), tipo de error (inconsistencia / duplicado), filtro por tipo, modal de comparación con id_origen y Cliente, acciones anular o eliminar registro.', 85000],
  ['Evolución (tabla dinámica)', 'Solapa Evolución: tabla dinámica con filas por Categoría o Cuenta contable y columnas por Período (Diario o Mensual). Neto por celda en moneda seleccionada.', 55000],
  ['Bitácora y documentación', 'Implementación de la bitácora en Excel (Log, Resumen, Versiones, Ref Git y Vercel, Presupuesto) y documentación funcional básica para el uso de la app.', 120000],
  ['Integración y despliegue', 'Configuración de repositorio Git/GitHub, flujo de despliegue a Vercel y ajustes de configuración (vercel.json, conexión con Supabase).', 90000],
  ['Mantenimiento y soporte inicial', 'Soporte post–implementación, pequeños ajustes funcionales y acompañamiento durante el primer período de uso.', 80000],
];
const wsPresupuesto = XLSX.utils.aoa_to_sheet(presupuesto);
wsPresupuesto['!cols'] = [{ wch: 32 }, { wch: 90 }, { wch: 24 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsLog, 'Log');
XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
XLSX.utils.book_append_sheet(wb, wsRef, 'Ref Git y Vercel');
XLSX.utils.book_append_sheet(wb, wsVersiones, 'Versiones');
XLSX.utils.book_append_sheet(wb, wsPresupuesto, 'Presupuesto');

const outPath = path.join(__dirname, 'Bitacora_tareas.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Creado:', outPath);
