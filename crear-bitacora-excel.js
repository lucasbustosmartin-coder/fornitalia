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
  ['Exportar a Excel', 'Botón en la barra de la tabla (solo icono). Exporta la tabla de transacciones tal como está en Supabase: una hoja "Transacciones" con columnas fecha, mes, anio, tipo_movimiento, monto, status, medio_pago, descripcion, cliente, categoria, cat_desc, origen_archivo, cuenta_contable. Permite analizar y manipular los datos desde Excel.'],
  ['Flujo de despliegue', 'Al terminar cada tarea: el usuario prueba en local y confirma; recién entonces el asistente hace git add, commit y push (Vercel redepliega automático). No se despliega hasta confirmación.'],
  ['Versiones en bitácora', 'Hoja "Versiones" en Bitacora_tareas.xlsx: registro incremental (1.0, 1.1, …) con fecha y descripción de cada despliegue a Git/Vercel.'],
  ['Campo moneda (BD)', 'Columna moneda en tabla transacciones (ARS/USD). Si está informada, el dashboard la usa; si no, infiere desde medio_pago (ej. "dolar" → USD). Export a Excel incluye moneda.'],
  ['Edición desde modal Errores', 'En el detalle de errores, icono de edición por registro. Abre modal para corregir: Categoría y Cuenta contable solo desde valores existentes en BD; Descripción libre. Al guardar se actualiza la fila y se marcan editado y editado_detalle (qué campos se editaron).'],
  ['Campos editado y editado_detalle', 'En transacciones: editado (boolean) y editado_detalle (texto, ej. "Categoria, Descripcion, Cuenta Contable"). Migración supabase_transacciones_editado.sql. Export Excel los incluye.'],
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
];
const wsVersiones = XLSX.utils.aoa_to_sheet(versiones);
wsVersiones['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 75 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsLog, 'Log');
XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
XLSX.utils.book_append_sheet(wb, wsRef, 'Ref Git y Vercel');
XLSX.utils.book_append_sheet(wb, wsVersiones, 'Versiones');

const outPath = path.join(__dirname, 'Bitacora_tareas.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Creado:', outPath);
