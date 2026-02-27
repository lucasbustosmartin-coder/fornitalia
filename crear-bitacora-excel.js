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
  ['Alertas por mes', 'Avisos: mes sin egresos; sin registros de Sueldos, Comisiones, Alquileres o Impuestos; desvío % de categoría vs mes anterior.'],
  ['Sin cotización', 'Pestaña con transacciones que no tienen tipo de cambio (excluidas del resumen).'],
  ['Exclusiones', 'No se incluyen transacciones anuladas ni categorías Apertura y Cierre.'],
  ['Datos', 'Transacciones y tipo de cambio desde Supabase. Cotización faltante: se usa la fecha anterior disponible.'],
  ['Menú lateral', 'Sidebar izquierdo colapsable/expandible; botón toggle (▶/◀); ítem Home por ahora; estado persistido en localStorage. Listo para ampliar con más ítems.'],
  ['Repositorio Git (GitHub)', 'Repo: https://github.com/lucasbustosmartin-coder/fornitalia. Rama main. .gitignore excluye node_modules, .venv, .env. Para actualizar: git add . ; git commit -m "mensaje" ; git push origin main.'],
  ['App en producción (Vercel)', 'URL pública: https://fornitalia.vercel.app/ (vercel.json reescribe / al dashboard). Cada push a main en GitHub dispara redeploy automático en Vercel. Proyecto: fornitalia, equipo Lucas Bustos, plan Hobby.'],
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

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsLog, 'Log');
XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
XLSX.utils.book_append_sheet(wb, wsRef, 'Ref Git y Vercel');

const outPath = path.join(__dirname, 'Bitacora_tareas.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Creado:', outPath);
