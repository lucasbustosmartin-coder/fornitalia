const XLSX = require('xlsx');
const path = require('path');

// Al generar el Excel, __HOY__ y __AHORA__ se reemplazan por fecha y hora en Argentina (America/Argentina/Buenos_Aires)
const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';
function ahoraFecha() {
  return new Date().toLocaleDateString('es-AR', { timeZone: ZONA_ARGENTINA, day: '2-digit', month: '2-digit', year: 'numeric' });
}
function ahoraHora() {
  return new Date().toLocaleTimeString('es-AR', { timeZone: ZONA_ARGENTINA, hour: '2-digit', minute: '2-digit', hour12: false });
}
function aplicarHoyAhora(rows) {
  return rows.map(row => Array.isArray(row)
    ? row.map(cell => {
        if (cell === '__HOY__') return ahoraFecha();
        if (cell === '__AHORA__') return ahoraHora();
        return cell;
      })
    : row);
}

// --- Hoja Log (bitácora de tareas)
// En nuevas filas se puede usar __HOY__ y __AHORA__; al ejecutar el script se reemplazan por la fecha y hora reales.
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
  ['27/02/2025', '20:10', 'Comisiones, Total flujo, Errores', 'Comisiones solo categoría Comisiones (no Sueldos). Fila Total en flujo por mes con sumas y ratios. Tabla Errores: quitar columna Editado, scroll horizontal, Descripción alineada a la izquierda.', 'Diagnostico'],
  ['27/02/2025', '20:20', 'Base histórica Excel y versión en sidebar', 'Export Base histórica: columnas id_origen e id_operacion. Versión de la app visible abajo en el sidebar (APP_VERSION). Regla de bitácora: al indicar desplegar, incrementar versión, actualizar bitácora y desplegar.', 'Diagnostico'],
  ['28/02/2025', '09:15', 'Comisiones/Ventas % y modal By Categoría', 'Ratio Comisiones/Ventas % incluye categoría Comisiones y Sueldos con descripción Comisiones Ventas (comision/comisones). Modal By Categoría ya usaba getCategoriaDisplay con la misma regla.', 'Diagnostico'],
  ['28/02/2025', '09:30', 'Favicon L&P en pestaña del navegador', 'Favicon favicon.svg: círculo azul oscuro (#0d2137), texto L&P en blanco, más grande. Enlace en dashboard para que se vea en la solapa del explorador.', 'Diagnostico'],
  ['27/02/2025', '21:00', 'Int. por caución y marcha de cálculo', 'Columna Int. por caución en flujo por mes: interés por reinvertir sobrante a un día con tasa de Serie_Cauciones. Carga Excel Serie_Cauciones.xlsx al refrescar (o fallback serie_cauciones.json). Modal al clic en valor mensual con marcha: G/P acum, Int T-1, Base, Tasa, Int T. Cálculo sobre G/P acumulado a la fecha + interés acumulado (reinversión día a día). Fechas ISO (2025-08-25T00:00:00) y columna tasa_diaria.', 'Implementacion'],
  ['28/02/2025', '12:00', 'Solapa Todas las transacciones y edición completa', 'Nueva solapa Todas las transacciones: listado con todas las columnas, filtros por mes y categoría, botón Editar por registro. Modal de edición ampliado: todos los campos editables; combos para valores normalizados (categoría, cuenta contable, tipo movimiento, status, medio pago, moneda, origen archivo). editado y editado_detalle al guardar.', 'Implementacion'],
  ['28/02/2025', '12:15', 'Filtro Tipo en Todas las transacciones', 'Agregar filtro por campo Tipo (Ingreso/Egreso) en la solapa Todas las transacciones. Combina con filtros Mes y Categoría.', 'Implementacion'],
  ['27/02/2026', '14:00', 'Proyección 3 meses e Int. por caución proyectado', 'Configuración (Configuración en menú): método Mediana/Promedio y meses de historia (3, 6, 12, 24). Próximos 3 meses proyectados con ventana rodante. Int. por caución: punto de partida = último mes real (G/P + interés), luego última tasa conocida aplicada en cadena para cada mes proyectado.', 'Implementacion'],
  ['27/02/2026', '14:15', 'Disclaimer bajo proyección', 'Texto en letra chica y gris oscuro bajo la proyección indicando metodología: Mediana/Promedio de N meses, ventana rodante, y cómo se calcula Int. por caución proyectado.', 'Implementacion'],
  ['01/03/2026', '09:30', 'Proyección Int. caución: base Total real y marcha', 'Punto de partida = G/P Total real (totalIngresos - totalEgresos) + interés acumulado; tasa = promedio del último mes real; días naturales (31 ene, 28 feb, etc.); Int T-1 día 1 = interés acumulado real; modal marcha proyectado: desglose G/P acum Total real + Int. acum = Base partida; columna G/P acum solo G/P (Día 1 = Total real).', 'Implementacion'],
  ['01/03/2026', '10:00', 'Ventana rodante e Int T-1 y G/P acum inicio día', 'Ventana rodante: numReal hace que mes 2 y 3 proyectados usen menos reales + proyectados (ingresos/egresos distintos). Int T-1 día 1 = (Int T-1 + Int T) del último día del mes anterior (desde detalle real o prevRes). G/P acum en marcha (real y proyectado) = valor al inicio del día, no incluye ese día.', 'Implementacion'],
  ['27/02/2026', '12:00', 'Unificación botones e iconos', 'Mismo estilo en todos los botones: icono SVG + texto. Sidebar (chevron, home, engranaje), tabs con iconos, exportar con icono descarga, modales (Guardar/Cerrar/Excluir/Eliminar con iconos). Iconos solos (cerrar, editar, alerta) en SVG. Escala combo % G/P en caución de 5 en 5.', 'Implementacion'],
  ['27/02/2026', '12:30', 'Etiqueta Caución (x% cash)', 'Simplificar texto Int. por caución a Caución (x% cash) en cabecera de flujo por mes; x = valor del parámetro % G/P en caución. Quitar icono % a la izquierda. Modales de marcha y disclaimer con Caución.', 'Implementacion'],
  ['27/02/2026', '13:00', 'Meses a proyectar en Configuración', 'Nuevo parámetro en Configuración: Meses a proyectar (1, 2, 3, 4, 5, 6, 12). Flujo por mes y Evolución muestran esa cantidad de meses proyectados. proyeccionDesdeSerie generalizada a N meses.', 'Implementacion'],
  ['27/02/2026', '13:15', 'Config dashboard por usuario en Supabase', 'Tabla config_dashboard en Supabase (user_id, proyeccion_metodo, proyeccion_meses, proyeccion_cantidad, pct_caucion). RLS por usuario. Al cargar: sync desde Supabase (Auth anónimo); al guardar: upsert en Supabase. Fallback a localStorage si no hay usuario.', 'Implementacion'],
  ['27/02/2026', '14:00', 'Recorte % (cada lado) en Configuración', 'Parámetro Recorte % (cada lado) en Configuración (0, 5, 10, 15, 20, 25) para el método Promedio recortado. Persistido en localStorage y columna proyeccion_recorte en config_dashboard (Supabase).', 'Implementacion'],
  ['27/02/2026', '14:10', 'Recorte % solo si Promedio recortado', 'El campo Recorte % (cada lado) se muestra en Configuración solo cuando el método elegido es Promedio recortado; al cambiar de método se oculta o muestra al instante.', 'Implementacion'],
  ['27/02/2026', '15:00', 'Parámetros por defecto sin datos de usuario', 'Si no hay config del usuario: Meses a proyectar 3, Método Promedio recortado, Recorte 20%, Meses de historia 6, % G/P acum. en caución 95%. Aplicado en getProyeccionConfig, getPctCaucion, sync y combos del modal.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Ayuda al clic en columnas flujo y regla bitácora', 'Columnas Comisiones/Ventas y Egresos/Ingresos: icono de ayuda que al clic muestra popover con texto (Comisiones: "Corresponde solo a las comisiones por venta."; Egresos: "Egresos - Comisiones por Venta / Ingresos"). Regla bitácora: sección tecnología e infraestructura y refuerzo para actualizar todas las solapas que correspondan.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Alerta desvío: categoría en negrita sin comillas', 'En el mensaje de alerta de desvío de categoría, reemplazar la categoría entre comillas por la categoría en negrita (sin comillas).', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Novedades del Negocio y despliegue v1.27', 'Sección Novedades del Negocio en sidebar: Edge Function get-novedades-negocio (Gemini + google_search) para importadores y comercios de hornos en Argentina. Config GEMINI_API_KEY en Supabase. Despliegue a producción.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Favicon L&P centrado', 'Ajuste del favicon: letras L y P (P reflejada) centradas en el círculo azul; posición y separación para que ambas se vean bien en pestaña y logo.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Despliegue v1.29', 'Errores: id_origen/id_operacion en export y listado; modal duplicado con icono en campos distintos. Exclusiones duplicados (anulados, id_origen e id_operacion ambos distintos, montos 0). Sin disclaimer ficticios; repoblar desde Excel.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Despliegue v1.30', 'Errores: orden tipo y monto; filtros categoría orig. y mostrada. Flujo filtro Anulado. Export Base con Tipo_Cambio, Monto_ARS, Monto_USD.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Despliegue v1.31', 'Estructura ordenada: sql/, scripts/, docs/. Regla estructura-proyecto. Bitácora y docs con rutas actualizadas.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Despliegue v1.32', 'Modales: no cerrar al elegir opción de select (mousedown+click en backdrop). Helper setupBackdropCloseOnlyOnRealClick en todos los modales.', 'Despliegue'],
  ['__HOY__', '__AHORA__', 'Normalización de Extracto Fornitalia', 'Nuevo script scripts/normalizar-extracto-fornitalia.js que toma docs/Extracto-Fornitalia.xlsx y genera docs/Extracto-Fornitalia-Normalizado.xlsx con hoja Normalizado: parseo numérico de montos, fecha ISO, inferencia de moneda (USD/ARS) y monto_ars derivado para facilitar reemplazo de tablas y análisis.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Upload controlado de extracto normalizado en app', 'En dashboard-flujo-caja.html se agrega modal de carga controlada del Excel normalizado: validación de hoja/campos/tipos, confirmación explícita REEMPLAZAR, generación de id_origen técnico por fila (timestamp+índice con hash de trazabilidad), borrado por lotes e inserción por lotes sobre transacciones. Se agrega SQL de soporte sql/supabase_upload_normalizado_controlado.sql.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Upload normalizado sin confirmación manual y log de excluidos', 'Ajuste del modal de carga: se elimina requisito de escribir REEMPLAZAR, los errores quedan informativos y se cargan solo filas válidas. Nueva solapa Excluidos upload y tabla Supabase transacciones_upload_excluidos para auditar filas excluidas (validación y Apertura/Cierre de Caja).', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Ajuste final upload: no loguear Apertura/Cierre y réplica en Everfit', 'Se ajusta Fornitalia para excluir Apertura/Cierre de Caja sin registrarlos en log de excluidos. En Everfit se replica el flujo optimizado de carga (progreso visual y vaciado rápido de tabla) para comportamiento equivalente y mayor velocidad percibida.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Limpieza de log excluidos y normalización de mes/año en carga', 'Antes de guardar excluidos de un nuevo upload se limpia transacciones_upload_excluidos para evitar arrastre histórico. En cargarDatos se normalizan mes/anio (con fallback desde fecha) para asegurar que Flujo por mes refleje todos los meses del archivo cargado.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Excluidos upload: mostrar solo última corrida y habilitar DELETE', 'La solapa Excluidos upload ahora filtra por run_ref más reciente para no mezclar corridas históricas. SQL de soporte actualizado con política DELETE en transacciones_upload_excluidos para permitir limpieza previa por corrida desde la app.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Carga paginada desde Supabase (transacciones y tipo de cambio)', 'PostgREST limita por defecto ~1000 filas por consulta; cargarDatos ahora pide transacciones (no anuladas) y tipo_de_cambio en páginas de 1000 con .range hasta agotar, para que Flujo por mes y totales reflejen toda la base.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Reglas moneda: Mercado Pago y Transferencia Morba siempre ARS', 'En extracto el medio es Transferencia Morba (con b); todo eso y Mercado Pago va como ARS en normalizar-extracto, upload y esTransaccionUSD. Se mantiene detección de morva por posible typo.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Documento análisis normalización datos legacy', 'Nuevo docs/ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.md: inconsistencias (categorías ambiguas, cuenta contable, pares categoría-cuenta, medios de pago, campos vacíos/guion) y recomendaciones para el cliente sobre qué corregir en su base de origen.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Informe normalización: cantidades por fila y PDF/HTML', 'Tablas del análisis con columna Cant. (extracto Movimientos, N=3008). Salidas docs/ANALISIS_*.html y .pdf; scripts md-informe-a-html.js e informe-html-a-pdf.js; npm run informe-normalizacion-pdf con Playwright (devDependency como en Pandi).', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Playwright en todos los repos LyP', 'Everfit, Fornitalia, MiGusto, Pandi y Sistema-Contable: devDependency playwright ^1.49.0 y script npm run playwright:install (chromium). Raíz LyP: README-Playwright.md.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Despliegue v1.33 producción', 'Push a main y vercel --prod: paginación Supabase, reglas moneda MP/Morba, informe normalización y herramientas PDF; package.json playwright.', 'Despliegue'],
  ['__HOY__', '__AHORA__', 'Análisis normalización: propuesta recategorización categoría–cuenta', 'Sección 8 en ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.md: modelo (catálogo, plan de cuentas, matriz permitida, validación al cargar, histórico) y tabla de beneficios (calidad, reporting, automatización, auditoría, evolución). Regenerar HTML/PDF con npm run informe-normalizacion-pdf si se entregan esos formatos.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Análisis normalización: matriz concreta Ord. n y acción Editar/Nueva/Eliminar', 'Sección 8.3: tabla valor actual vs propuesto (categoría y cuenta contable), columna Acción (Editar, Nueva, Eliminar) y Ord. n para priorizar; filas ejemplo alineadas a §1–§3.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Rubros IGJ/FACPCE y balance: doc de referencia', 'Nuevo docs/RUBROS_CONTABILIDAD_ARGENTINA_REFERENCIA.md: marco local (RT/IGJ), ejemplo importación mercaderías/hornos, asientos tránsito/CMV/IVA/ajuste inflación; §8.4 en ANALISIS enlaza rubro patrimonial con matriz y proyección de balance.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Matriz borrador categoría–cuenta–rubro (Argentina)', 'docs/MATRIZ_CATEGORIA_CUENTA_RUBRO_BORRADOR.md: tabla sugerida BC/ER/TES con rubros tipo presentación IGJ; celdas a definir donde falta criterio contable; enlaces desde ANALISIS §8.4 y RUBROS_CONTABILIDAD.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Análisis: §8.4 borrador rubro dentro del MD principal', 'Tabla categoría/cuenta/rubro incorporada en ANALISIS_NORMALIZACION tras §8.3; ex §8.4 pasa a §8.5; MATRIZ_CATEGORIA_CUENTA_RUBRO_BORRADOR.md como espejo alineado.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Borrador rubro: excluir Apertura/Cierre de caja', '§8.4 y MATRIZ: filas Apertura/Cierre eliminadas; párrafo y notas indican exclusión por definición (alineado a upload).', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Análisis financiero extracto → HTML/PDF', 'scripts/generar-analisis-financiero-pdf.js: métricas desde Extracto-Fornitalia.xlsx (resumen, mensual, estacionalidad/IQR, medios, calidad datos, cash management). Salida docs/ANALISIS_FINANCIERO_EXTRACTO_FORNITALIA.*; npm run analisis-financiero-pdf; fallback Chrome headless si Playwright sin Chromium.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Dashboard v1.34: excluir traspasos internos del flujo', 'excluirCategoria amplía a Transferencia y Deposito/Depósito (misma regla que informe financiero); nota en panel Flujo por mes; APP_VERSION 1.34. Base histórica export sigue completa.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Informe financiero PDF: MEP desde docs y textos', 'generar-analisis-financiero-pdf.js: carga usd_mep desde docs/tipos_cambio_global_rows.sql (o CSV docs/raíz); conversión USD alineada al dashboard; filas sin ARS excluidas de totales con conteo en meta y advertencias en HTML. README ANALISIS_FINANCIERO_EXTRACTO_README.md actualizado.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Dashboard v1.35: flujo alineado al informe PDF + solapa traspasos', 'Tarjetas y tabla Flujo por mes: totales extracto (con traspasos) vs G/P operativo; columnas Neto bruto y G/P operativo. excluirFilaFlujoOperativo (Anulado, apertura/cierre heurística, Transferencia/Depósito). Evolución y duplicados con la misma base. Solapa Traspasos internos con listado. APP_VERSION 1.35.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Dashboard v1.36: ARS con monto_cambio y tipo_cambio (concilia PDF)', 'fetch transacciones incluye tipo_cambio y monto_cambio. montoConvertido en ARS prioriza monto_cambio (Monto en $), luego TC fila, luego tabla (como generar-analisis-financiero-pdf.js). Flujo por mes usa montoConvertido unificado. Nota en panel Flujo. APP_VERSION 1.36.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Despliegue v1.37 producción', 'Push a main y Vercel --prod: versiones 1.34–1.37 en bitácora; APP_VERSION 1.37; flujo bruto/operativo, Traspasos internos, conciliación monto_cambio con informe PDF; script informe financiero MEP en docs.', 'Despliegue'],
  ['__HOY__', '__AHORA__', 'Informe financiero: sección Análisis de ventas', 'generar-analisis-financiero-pdf.js: sección 3 con performance (total, ticket, % s/ ingresos, CV mensual), día de semana y franja horaria, ranking Usuario y Cliente, serie mensual de ventas, referencia piso vs promedio/mediana egresos operativos y último mes con ventas vs egreso operativo. Renumeración secciones 4–9.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Informe financiero: compras mercadería Hornos (proxy)', 'generar-analisis-financiero-pdf.js: sección 4 con restricciones explícitas; egreso + cuenta Hornos; tablas categoría/día/franja/usuario/cliente/mes; cruce mensual con ventas; ingresos cuenta Hornos excluidos informativos. README extracto actualizado. Secciones 5–10.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Informe financiero: considerandos y cierre por sesión', 'Tablas finales en ventas, compras (proxy Hornos) y análisis financiero general: columna Considerando y Qué necesitamos para cerrar el análisis; ítems dinámicos (USD sin ARS, sin MEP, meses egreso cero). Helper htmlConsiderandosCierre. README extracto.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Informe financiero: ventas por semana dentro del mes', 'generar-analisis-financiero-pdf.js: franjas 1–7, 8–14, 15–21, 22–fin por día calendario; totales período y desglose por mes con % semana 4 s/ mes; pico y % última franja global. Considerando en cierre ventas. README.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'PDF captura app dashboard para instructivo', 'scripts/dashboard-html-a-pdf.js: PDF desde dashboard-flujo-caja.html (Playwright, ancho 1440px, alto según documento, fondos). Salida docs/Dashboard_Flujo_Caja_App.pdf; npm run dashboard-app-pdf; fallback Chrome; DASHBOARD_PDF_WAIT_MS opcional.', 'Diagnostico'],
  ['__HOY__', '__AHORA__', 'Módulo Seguridad (roles y permisos)', 'SQL supabase_seguridad_forfitalia.sql y supabase_admin_inicial_forfitalia.sql (admin lucas.bustos.martin@gmail.com). Login/registro/invitado anónimo; get_my_permissions; visor = solo Flujo por mes + Exportar Base Histórica; encargado/admin panel operador; admin asigna roles y toggles en app_role_permission. Vista Seguridad en sidebar. APP_VERSION 1.38.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Registro: mensaje contraseña débil Supabase', 'mensajeErrorAuthSupabase para texto weak password; hint bajo campo contraseña; minlength 8; catch en signUp/signInWithPassword. APP_VERSION 1.39.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Seguridad: listar solo usuarios con email', 'get_users_for_admin filtra email vacío (invitados anónimos en user_profiles). migracion_seguridad_listar_solo_usuarios_con_email.sql + filtro en cliente. APP_VERSION 1.40.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Tablas: encabezados sticky LyP', 'flujo-table-wrap y errores-table-wrap con scroll acotado; thead sticky en flujo, errores, todas, traspasos, excluidos, referencia flujo, evolución (z-index esquina), modales y detalle anidado. overscroll-behavior / -webkit-overflow-scrolling. APP_VERSION 1.41.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Flujo: scroll hasta el final de la tabla', 'flujo-table-wrap sin max-height ni scroll vertical interno (solo overflow-x); overscroll-y ya no contain en errores; evolución overscroll-y auto. El párrafo informativo no estaba dentro del wrap: el problema era doble scroll + contain. APP_VERSION 1.42.', 'Implementacion'],
  ['__HOY__', '__AHORA__', 'Despliegue v1.43 producción', 'Git push main y vercel --prod: seguridad, UX registro, lista usuarios con email, tablas sticky, scroll flujo; APP_VERSION 1.43.', 'Despliegue'],
];

const datosLogParaExcel = aplicarHoyAhora(datosLog);
const wsLog = XLSX.utils.aoa_to_sheet(datosLogParaExcel);
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
  ['Flujo de caja por mes', 'Tabla alineada al informe financiero PDF: columnas Ingresos y Egresos = totales del extracto (incluyen traspasos entre cuentas); Neto bruto; G/P operativo sin Transferencia/Depósito ni Apertura/Cierre; ratios y Caución sobre operativo. Proyección solo sobre operativo.'],
  ['Resumen global', 'Cuatro tarjetas: Ingresos totales y Egresos totales del extracto (con traspasos), Neto caja (bruto) y G/P operativo (sin traspasos internos), en ARS o USD según selector.'],
  ['Moneda', 'Selector ARS / USD. En ARS: prioridad monto_cambio (Monto en $ del extracto en BD), tipo_cambio por fila y tabla tipo_de_cambio (MEP/CCL/Oficial); con MEP y datos cargados coincide con el informe PDF.'],
  ['Tipo de cambio USD', 'Opciones MEP, CCL u Oficial para convertir a dólares.'],
  ['Comisiones/Ventas %', 'Columna: porcentaje comisiones (egresos comisión desde Sueldos) sobre ventas del mes. Icono de ayuda al clic: "Corresponde solo a las comisiones por venta."'],
  ['Egresos / Ingresos', 'Columna Egresos (icono ayuda) / Ingresos: porcentaje (egresos sin comisiones) sobre ingresos. Ayuda al clic: "Egresos - Comisiones por Venta / Ingresos".'],
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
  ['Exclusiones (flujo operativo)', 'No se incluyen en G/P operativo, Evolución ni Caución: anulados; apertura/cierre (categoría o heurística en fila); Transferencia ni Deposito/Depósito. Los traspasos se listan en la solapa Traspasos internos. Base histórica y Todas las transacciones siguen completas.'],
  ['Traspasos internos (solapa)', 'Listado de movimientos categoría Transferencia o Deposito/Depósito (no anulados), con monto de registro y equivalente en moneda de vista.'],
  ['Datos', 'Transacciones y tipo de cambio desde Supabase (carga paginada de a 1000 filas por request para no truncar resultados). Cotización faltante: se usa la fecha anterior disponible.'],
  ['Tablas y scroll', 'Encabezados de columna anclados (sticky) al desplazarse. Flujo por mes: scroll vertical de la página (sin caja con max-height) para llegar bien al pie de la tabla; scroll horizontal en el wrap si hace falta. Otras solapas listas anchas con scroll horizontal.'],
  ['Menú lateral', 'Sidebar izquierdo colapsable/expandible; botón toggle (▶/◀); Home, Novedades, Configuración, Seguridad (solo admin con permiso), Cerrar sesión; estado expandido en localStorage.'],
  ['Seguridad y roles', 'Login con email/contraseña, registro o invitado anónimo (visor). Permisos desde Supabase: exportar_base_historica, dashboard_operador, assign_roles. Visor: solo solapa Flujo por mes y botón Exportar Base Histórica (sin edición ni solapa Errores en modal mes). Encargado/Admin: resto del dashboard. Admin: vista Seguridad (usuarios/roles y permisos por rol). La tabla de usuarios solo muestra cuentas con email (no sesiones anónimas). Sin SQL de seguridad desplegado, la app mantiene modo compatibilidad con acceso completo.'],
  ['Registro y contraseña', 'Si Supabase rechaza la contraseña (débil o en listas de filtrados), el mensaje se muestra en español en pantalla; ayuda bajo el campo y mínimo 8 caracteres en el formulario.'],
  ['Repositorio Git (GitHub)', 'Repo: https://github.com/lucasbustosmartin-coder/fornitalia. Rama main. .gitignore excluye node_modules, .venv, .env. Para actualizar: git add . ; git commit -m "mensaje" ; git push origin main.'],
  ['App en producción (Vercel)', 'URL pública: https://fornitalia.vercel.app/ (vercel.json reescribe / al dashboard). Cada push a main en GitHub dispara redeploy automático en Vercel. Proyecto: fornitalia, equipo Lucas Bustos, plan Hobby.'],
  ['Exportar a Excel', 'Botón en la barra de la tabla (solo icono). Exporta la tabla de transacciones tal como está en Supabase: una hoja "Transacciones" con columnas fecha, mes, anio, tipo_movimiento, monto (valor numérico para fórmulas), status, medio_pago, moneda, descripcion, cliente, categoria, cat_desc, origen_archivo, cuenta_contable, editado, editado_detalle. Export Errores: monto también como número. Permite analizar y usar fórmulas en Excel.'],
  ['Flujo de despliegue', 'Al terminar cada tarea: el usuario prueba en local y confirma; recién entonces el asistente hace git add, commit y push (Vercel redepliega automático). No se despliega hasta confirmación.'],
  ['Versiones en bitácora', 'Hoja "Versiones" en Bitacora_tareas.xlsx: registro incremental (1.0, 1.1, …) con fecha y descripción de cada despliegue a Git/Vercel.'],
  ['Campo moneda (BD)', 'Columna moneda en tabla transacciones (ARS/USD). Si está informada, el dashboard la usa salvo reglas de negocio: Mercado Pago y Transferencia Morba siempre ARS para conversión (también morva por typo). Si moneda vacía, infiere desde textos/medio (dólar → USD). Export a Excel incluye moneda.'],
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
  ['Int. por caución', 'Columna en flujo por mes: interés mensual por colocar el sobrante de caja a la tasa diaria de la serie de cauciones. Carga Serie_Cauciones.xlsx al refrescar (o serie_cauciones.json si no hay Excel). Cálculo: base = G/P acumulado a la fecha + interés acumulado; Int T = base × tasa. Clic en el valor abre modal con marcha (G/P acum, Int T-1, Base, Tasa, Int T).'],
  ['Todas las transacciones', 'Solapa que lista todas las transacciones con todas las columnas. Filtros por mes y categoría. Botón Editar por registro abre modal de edición completa.'],
  ['Edición completa de registros', 'Modal de edición con todos los campos: fecha, mes, año, tipo movimiento, monto, moneda, status, medio pago, categoría, cuenta contable, origen archivo, descripción, cliente, cat_desc, id_origen, id_operación. Combos para campos normalizados (valores existentes en BD). editado y editado_detalle al guardar.'],
  ['Proyección próximos 3 meses', 'Debajo del total real en Flujo por mes: "Próximos 3 meses proyectados" con ventana rodante. Configuración (sidebar): método (Mediana/Promedio) y meses de historia (3, 6, 12, 24). Ingresos, egresos, G/P y ratios proyectados por mes.'],
  ['Int. por caución proyectado', 'Punto de partida = G/P Total real + interés acumulado; tasa = promedio último mes real; días naturales; Int T-1 día 1 = (Int T-1 + Int T) último día del mes anterior. G/P acum en marcha = al inicio de cada día (real y proyectado). Ventana rodante: ingresos/egresos distintos por mes.'],
  ['Disclaimer proyección', 'Debajo de las filas proyectadas, texto en letra chica y gris oscuro que explica la metodología: Mediana/Promedio de N meses, ventana rodante, y cálculo de Int. por caución proyectado.'],
  ['Botones e iconos unificados', 'Todos los botones con mismo estilo: icono SVG + texto. Sidebar (chevron, home, engranaje), tabs con iconos, exportar con icono descarga, modales con iconos (Guardar, Cerrar, Excluir, Eliminar). Iconos solos (cerrar, editar, alerta) en SVG.'],
  ['Configuración % G/P en caución', 'Combo "% G/P acum. en caución" en Configuración con escala de 5 en 5 (100, 95, 90… hasta 0). Por defecto 100 %; menor % = más liquidez (menos interés por caución).'],
  ['Etiqueta Caución (x% cash)', 'Columna en flujo por mes: cabecera "Caución (x% cash)" donde x es el valor del parámetro % G/P; sin icono % a la izquierda. Modales de marcha y disclaimer usan "Caución".'],
  ['Meses a proyectar', 'En Configuración: combo Meses a proyectar (1, 2, 3, 4, 5, 6, 12). Flujo por mes y Evolución muestran esa cantidad de columnas/filas proyectadas.'],
  ['Config por usuario en Supabase', 'Tabla config_dashboard (user_id, proyección y caución). Con Auth anónimo se sincroniza al cargar y al guardar; la config persiste por usuario en la base. Migración: supabase_config_dashboard.sql.'],
  ['Recorte % (cada lado)', 'En Configuración, combo Recorte % (cada lado) (0, 5, 10, 15, 20, 25) visible solo cuando el método es Promedio recortado. Más % = más suavizado. Persistido en config_dashboard (proyeccion_recorte).'],
  ['Novedades del Negocio', 'Ítem en sidebar que abre una vista con importadores de hornos y comercios de venta de hornos en Argentina (Buenos Aires). Datos recuperados por IA (Edge Function con Gemini + google_search). Nombre, dirección, teléfono y web por contacto.'],
  ['Normalización de extracto bancario', 'Script utilitario que normaliza el extracto Excel en una hoja estructurada (Normalizado) con campos listos para tablas: fecha_iso, tipo, medio, categoría, cuenta, moneda inferida (USD/ARS; Mercado Pago y Transferencia Morba forzados a ARS), monto_original numérico, tipo_cambio y monto_ars.'],
  ['Informe inconsistencias datos legacy (cliente)', 'Documento docs/ANALISIS_NORMALIZACION_DATOS_LEGACY_FORNITALIA.md con tablas Cant./recomendaciones; .html y .pdf en docs/. Regenerar: npm run informe-normalizacion-html o npm run informe-normalizacion-pdf (Playwright+Chromium, alineado a stack Pandi); primera vez: npx playwright install chromium.'],
  ['Upload de extracto normalizado', 'Botón en la app para reemplazar transacciones desde un Excel normalizado (hoja Normalizado), con validación previa, confirmación de seguridad, generación de id_origen técnico y carga en lotes.'],
  ['Log de excluidos en upload', 'Nueva solapa Excluidos upload con registros no insertados por error o por regla de negocio (Apertura/Cierre de Caja), persistidos en Supabase para auditoría.'],
  ['Análisis financiero extracto (PDF)', 'npm run analisis-financiero-pdf: métricas desde docs/Extracto-Fornitalia.xlsx; ARS vía Monto en $, TC por fila o MEP (docs/tipos_cambio_global_rows.sql o CSV); exclusiones y conteo de USD sin conversión en el informe. Ver docs/ANALISIS_FINANCIERO_EXTRACTO_README.md.'],
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
  ['1.9', '27/02/2025', 'Comisiones solo categoría Comisiones; fila Total en flujo por mes; Errores: sin columna Editado, scroll horizontal, Descripción a la izquierda'],
  ['1.10', '27/02/2025', 'Base histórica Excel: id_origen e id_operacion; versión en sidebar; regla de versionado al desplegar'],
  ['1.11', '28/02/2025', 'Comisiones/Ventas %: categoría Comisiones + Sueldos (Comisiones Ventas); misma regla en modal By Categoría'],
  ['1.12', '28/02/2025', 'Favicon L&P: ícono en pestaña del navegador (fondo azul oscuro, texto blanco)'],
  ['1.13', '27/02/2025', 'Int. por caución: columna en flujo, carga Excel al refrescar, modal marcha de cálculo (G/P acum, Base, Tasa, Int T), cálculo sobre G/P acum + interés acum'],
  ['1.14', '28/02/2025', 'Solapa Todas las transacciones (filtros mes y categoría); modal edición completa con todos los campos y combos para normalizados'],
  ['1.15', '28/02/2025', 'Filtro Tipo (Ingreso/Egreso) en solapa Todas las transacciones'],
  ['1.16', '27/02/2026', 'Proyección 3 meses: config (mediana/promedio, meses historia), ventana rodante; Int. por caución proyectado con punto de partida = último real (G/P+interés) y última tasa en cadena; disclaimer bajo proyección. Despliegue a producción.'],
  ['1.17', '01/03/2026', 'Proyección: punto de partida = G/P Total real (no último mes); tasa = promedio último mes real; días naturales por mes; Int T-1 día 1 = interés acumulado real; modal marcha proyectado con desglose (G/P acum Total real + Int. acum) y columna G/P acum solo G/P (Día 1 = Total real). Despliegue a producción.'],
  ['1.18', '01/03/2026', 'Ventana rodante: ingresos/egresos/G/P distintos por mes (drop real cuando pocos meses). Int T-1 día 1 = (Int T-1 + Int T) último día del mes anterior (real o proyectado). G/P acum en marcha = inicio del día (real y proyectado), no incluye ese día. Despliegue a producción.'],
  ['1.19', '27/02/2026', 'Unificación de botones e iconos: mismo estilo (icono SVG + texto) en sidebar, tabs, exportar, modales; iconos solos (cerrar, editar, alerta) en SVG. Escala combo % G/P en caución de 5 en 5 (100, 95, 90…). Despliegue a producción.'],
  ['1.20', '27/02/2026', 'Simplificar etiqueta: Int. por caución pasa a Caución (x% cash) en cabecera de flujo (x = parámetro % G/P); quitar icono % a la izquierda; modales y disclaimer con texto Caución. Despliegue a producción.'],
  ['1.21', '27/02/2026', 'Config por usuario en Supabase: parámetro Meses a proyectar (1-12) en Configuración; tabla config_dashboard (user_id, proyección y caución); sync al cargar y al guardar con Auth anónimo. Despliegue a producción.'],
  ['1.22', '27/02/2026', 'Parámetro Recorte % (cada lado) en Configuración (0-25); visible solo si método es Promedio recortado. Columna proyeccion_recorte en config_dashboard. Despliegue a producción.'],
  ['1.23', '27/02/2026', 'Valores por defecto sin datos de usuario: Meses a proyectar 3, Método Promedio recortado, Recorte 20%, Meses de historia 6, % G/P en caución 95%. Despliegue a producción.'],
  ['1.24', '27/02/2026', 'Demo potencial cliente: leyenda roja "Los datos presentados son ficticios..." al costado de Evolución; script SQL transacciones_fornitalia (respaldo) y carga con monto×0,70. Despliegue a producción.'],
  ['1.25', '__HOY__', 'Ayuda al clic en columnas Comisiones/Ventas y Egresos/Ingresos (popover con texto explicativo). Regla bitácora: tecnología e infraestructura y actualizar todas las solapas. Despliegue a producción.'],
  ['1.26', '__HOY__', 'Mensaje de alerta de desvío: categoría en negrita sin comillas. Despliegue a producción.'],
  ['1.27', '__HOY__', 'Novedades del Negocio: sección en sidebar con importadores y comercios de hornos en Argentina (Edge Function Gemini + google_search). Despliegue a producción.'],
  ['1.28', '__HOY__', 'Favicon L&P: L y P dada vuelta centradas en el círculo azul; ajuste de posición y centrado. Despliegue a producción.'],
  ['1.29', '__HOY__', 'Errores: export y listado con id_origen e id_operacion; modal duplicado con id_operacion e icono en campos que no coinciden. Exclusiones duplicados: anulados, id_origen e id_operacion ambos distintos, ambos montos 0. Quitar disclaimer datos ficticios; scripts e instrucciones para repoblar transacciones desde Excel. Despliegue a producción.'],
  ['1.30', '__HOY__', 'Errores: orden por tipo y monto descendente; filtros por categoría original y categoría mostrada. Flujo: filtro explícito status Anulado. Export Base Histórica: columnas Tipo_Cambio, Monto_ARS, Monto_USD con conversiones. Despliegue a producción.'],
  ['1.31', '__HOY__', 'Estructura ordenada del repo: sql/, scripts/, docs/. Regla estructura-proyecto (mantener carpetas y rutas). Referencias en bitácora y docs actualizadas. Despliegue a producción.'],
  ['1.32', '__HOY__', 'Modales: no cerrar al elegir opción de select (mousedown+click en backdrop). Helper setupBackdropCloseOnlyOnRealClick en todos los modales.'],
  ['1.33', '__HOY__', 'Carga paginada transacciones y tipo_de_cambio (límite PostgREST). Reglas ARS Mercado Pago y Transferencia Morba en normalizador, upload y esTransaccionUSD. Upload excluidos: filtro última corrida; SQL DELETE en transacciones_upload_excluidos. Informe análisis normalización (docs MD/HTML/PDF) y scripts Playwright. DevDependency playwright y npm run playwright:install.'],
  ['1.34', '__HOY__', 'Flujo operativo sin traspasos internos (Transferencia y Depósito); misma regla que informe PDF; nota en panel.'],
  ['1.35', '__HOY__', 'Flujo por mes alineado al PDF: ingresos/egresos brutos extracto, Neto bruto, G/P operativo; solapa Traspasos internos; excluirFilaFlujoOperativo y Evolución con misma base.'],
  ['1.36', '__HOY__', 'Select tipo_cambio y monto_cambio en transacciones; montoConvertido en ARS prioriza monto_cambio y TC de fila (concilia con informe PDF al centavo).'],
  ['1.37', '__HOY__', 'Despliegue a producción Vercel: informe financiero PDF con MEP desde docs; dashboard v1.37 con conciliación extracto.'],
  ['1.43', '__HOY__', 'Módulo Seguridad (login/registro/invitado, roles, permisos, vista Seguridad); get_users_for_admin solo email; mensajes registro Supabase; thead sticky en tablas; scroll vertical flujo por página (v1.42); APP_VERSION 1.43. Push main y Vercel producción.'],
];
const versionesParaExcel = aplicarHoyAhora(versiones);
const wsVersiones = XLSX.utils.aoa_to_sheet(versionesParaExcel);
wsVersiones['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 75 }];

// --- Hoja Presupuesto (HH = estimado tiempo humano; Importe (USD) lo actualiza el usuario a mano)
const outPath = path.join(__dirname, '..', 'Bitacora_tareas.xlsx');
let existingHHByGrupo = {};
let existingImporteByGrupo = {};
try {
  const wbExisting = XLSX.readFile(outPath);
  const wsP = wbExisting.Sheets['Presupuesto'];
  if (wsP) {
    const aoa = XLSX.utils.sheet_to_json(wsP, { header: 1 });
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (row && row[0] != null && String(row[0]).trim() !== '') {
        const grupo = String(row[0]).trim();
        const valHH = row[2];
        if (valHH !== undefined && valHH !== '' && valHH !== null && !Number.isNaN(Number(valHH))) {
          existingHHByGrupo[grupo] = Number(valHH);
        }
        if (row[3] !== undefined && row[3] !== '' && row[3] !== null) {
          existingImporteByGrupo[grupo] = row[3];
        }
      }
    }
  }
} catch (_) { /* no existe aún o no se pudo leer */ }

const presupuestoRaw = [
  ['Grupo', 'Descripción comercial', 'Horas hombre', 'Importe (USD)'],
  ['Normalización de datos', 'Relevamiento, limpieza y normalización de datos históricos de caja (campos de moneda, categorías, cuentas contables, flags de edición). Incluye lógica de excepciones, detección de inconsistencias y carga controlada desde extracto normalizado.', 50],
  ['Dashboard flujo de caja', 'Diseño y desarrollo del dashboard mensual (Flujo por mes, Resumen, alertas, modal By Categoría / By Cuenta, gráficos de serie mensual). Incluye formatos de moneda y visualizaciones.', 100],
  ['Detección de duplicados y gestión de errores', 'Detección de potencial duplicado (fecha, monto, tipo, cliente, descripción similar), tipo de error (inconsistencia / duplicado), filtro por tipo, modal de comparación con id_origen y Cliente, acciones anular o eliminar registro.', 25],
  ['Evolución (tabla dinámica)', 'Solapa Evolución: tabla dinámica con filas por Categoría o Cuenta contable y columnas por Período (Diario o Mensual). Neto por celda en moneda seleccionada.', 20],
  ['Interés por caución', 'Columna Int. por caución en flujo por mes: cálculo de interés mensual por reinversión del sobrante a un día con tasa de serie de cauciones. Carga de Excel al refrescar, modal de marcha de cálculo (G/P acum, Base, Tasa, Int T). Incluye soporte para múltiples formatos de fecha y columna tasa_diaria.', 18],
  ['Proyección de flujo (próximos 3 meses)', 'Proyección de ingresos, egresos, G/P y ratios para los próximos 3 meses con configuración (mediana/promedio, meses de historia 3/6/12/24), ventana rodante; Int. por caución proyectado en cadena desde último real (G/P+interés); disclaimer de metodología bajo la proyección.', 30],
  ['Listado y edición completa de transacciones', 'Solapa Todas las transacciones con listado completo, filtros por mes y categoría, y modal de edición con todos los campos y combos para valores normalizados (categoría, cuenta contable, tipo movimiento, status, medio pago, moneda, origen archivo).', 22],
  ['Bitácora y documentación', 'Implementación de la bitácora en Excel (Log, Resumen, Versiones, Ref Git y Vercel, Presupuesto) y documentación funcional básica para el uso de la app.', 35],
  ['Integración y despliegue', 'Configuración de repositorio Git/GitHub, flujo de despliegue a Vercel y ajustes de configuración (vercel.json, conexión con Supabase).', 30],
  ['Seguridad y roles (dashboard)', 'Autenticación email/anónimo, roles Admin/Encargado/Visor, permisos en Supabase (RPC y RLS), pantalla Seguridad para asignar roles y toggles por rol; visor restringido a Flujo por mes y exportar base histórica.', 18],
  ['Mantenimiento y soporte inicial', 'Soporte post–implementación, pequeños ajustes funcionales y acompañamiento durante el primer período de uso.', 28],
];
// HH: se conserva el del Excel si existe; si no, el del script. Importe (USD): se conserva el del Excel; si no hay, queda vacío para que lo complete el usuario.
const presupuestoRows = presupuestoRaw.slice(1).map(row => {
  const grupo = row[0];
  const hhExistente = existingHHByGrupo[grupo];
  const horasHombre = hhExistente !== undefined ? hhExistente : row[2];
  const importe = existingImporteByGrupo[grupo] !== undefined ? existingImporteByGrupo[grupo] : '';
  return [row[0], row[1], horasHombre, importe];
});
const presupuesto = [presupuestoRaw[0]].concat(presupuestoRows);
const wsPresupuesto = XLSX.utils.aoa_to_sheet(presupuesto);
wsPresupuesto['!cols'] = [{ wch: 32 }, { wch: 90 }, { wch: 14 }, { wch: 22 }];

// --- Hoja Tecnología e infraestructura
const tecnologia = [
  ['Componente', 'Detalle'],
  ['Frontend', 'Una sola página dashboard-flujo-caja.html (HTML, CSS, JavaScript en el mismo archivo). Sin framework; llamadas a Supabase desde el cliente.'],
  ['Datos', 'Supabase (PostgreSQL). Tablas: transacciones, tipo_de_cambio, config_dashboard. Scripts SQL en carpeta sql/ se ejecutan en Supabase SQL Editor.'],
  ['Hosting', 'Vercel. App en producción: fornitalia.vercel.app. Despliegue con vercel --prod tras push a main.'],
  ['Repositorio', 'Git/GitHub, rama main.'],
  ['Bitácora', 'Node.js + SheetJS (xlsx). Script scripts/crear-bitacora-excel.js genera Bitacora_tareas.xlsx con las solapas Log, Resumen, Ref Git y Vercel, Versiones, Presupuesto, Tecnología.'],
];
const wsTecnologia = XLSX.utils.aoa_to_sheet(tecnologia);
wsTecnologia['!cols'] = [{ wch: 18 }, { wch: 95 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsLog, 'Log');
XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
XLSX.utils.book_append_sheet(wb, wsRef, 'Ref Git y Vercel');
XLSX.utils.book_append_sheet(wb, wsVersiones, 'Versiones');
XLSX.utils.book_append_sheet(wb, wsPresupuesto, 'Presupuesto');
XLSX.utils.book_append_sheet(wb, wsTecnologia, 'Tecnología');

XLSX.writeFile(wb, outPath);
console.log('Creado:', outPath);

const { execSync } = require('child_process');
try {
  execSync('node crear-presentacion-propuesta.js', { cwd: __dirname, stdio: 'inherit' });
} catch (_) {
  console.warn('No se pudo regenerar la presentación PowerPoint.');
}
