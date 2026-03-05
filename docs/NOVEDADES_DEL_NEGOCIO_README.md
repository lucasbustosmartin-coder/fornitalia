# Novedades del Negocio — Resumen de lo implementado y pasos a seguir

## Lo que ya está hecho

### 1. Edge Function en Supabase (`supabase/functions/get-novedades-negocio/index.ts`)
- Función que usa **Gemini 2.0 Flash** con **google_search** para buscar:
  - **Importadores de hornos** en Argentina (prioridad Buenos Aires).
  - **Comercios de venta de hornos** en Argentina.
- Devuelve JSON con: `nombre`, `direccion`, `telefono`, `web` (vacío si no hay dato).
- Requiere la variable de entorno **GEMINI_API_KEY** en Supabase.

### 2. Cambios en el dashboard (`dashboard-flujo-caja.html`)
- **Sidebar:** nuevo ítem **"Novedades del Negocio"** con icono simple (capas/hojas), mismo estilo que Home y Configuración.
- **Vista "Novedades":** al hacer clic en ese ítem se muestra una pantalla con:
  - Título "Novedades del Negocio" y breve descripción.
  - Botón **"Cargar novedades"** que llama a la Edge Function.
  - Dos bloques: **Importadores de hornos** y **Comercios de venta de hornos**, cada uno con lista de tarjetas (nombre, dirección, teléfono, web si existe).
- **Navegación:** Home vuelve al flujo de caja; Novedades del Negocio muestra solo esa vista.

---

## Lo que tenés que hacer vos

### 1. Obtener una API key de Gemini
- Entrá a [Google AI Studio](https://aistudio.google.com/) (o al panel de Gemini / Vertex).
- Creá o usá un proyecto y generá una **API key** para Gemini (modelos como `gemini-2.0-flash`).

### 2. Configurar la variable en Supabase
- En el **Dashboard de Supabase** → tu proyecto → **Project Settings** → **Edge Functions** (o **Settings** → **Edge Functions**).
- Añadí un **Secret** (variable de entorno):
  - Nombre: `GEMINI_API_KEY`
  - Valor: la API key de Gemini que generaste.

### 3. Desplegar la Edge Function
Desde la raíz del proyecto (donde está la carpeta `supabase/`):

```bash
# Si tenés Supabase CLI instalado y vinculado al proyecto:
supabase functions deploy get-novedades-negocio
```

Si no usás Supabase CLI, podés:
- Subir el código de `supabase/functions/get-novedades-negocio/` desde el dashboard de Supabase (Edge Functions → New function → pegar o importar el código), **y**
- Configurar ahí el secret `GEMINI_API_KEY` para esa función.

### 4. Probar en la app
- Abrí el dashboard (por ejemplo `dashboard-flujo-caja.html` en local o la URL de Vercel).
- En el menú lateral, hacé clic en **"Novedades del Negocio"**.
- Clic en **"Cargar novedades"**.
- Deberían aparecer las listas de importadores y comercios (nombre, dirección, teléfono, web).

Si la función no está desplegada o falta `GEMINI_API_KEY`, el botón mostrará un error; revisá la consola del navegador (F12) y los logs de la función en Supabase.

---

## Resumen de archivos tocados

| Archivo | Qué se hizo |
|--------|--------------|
| `supabase/functions/get-novedades-negocio/index.ts` | **Nuevo.** Edge Function que llama a Gemini con búsqueda y devuelve importadores y comercios. |
| `dashboard-flujo-caja.html` | Ítem "Novedades del Negocio" en el sidebar, vista con botón "Cargar novedades" y listas (importadores / comercios), estilos `.novedades-*`, y lógica que invoca `client.functions.invoke('get-novedades-negocio')`. |

Si algo no funciona, revisá: 1) que la función esté desplegada, 2) que `GEMINI_API_KEY` esté definida en Supabase para esa función, y 3) que la app use la misma URL y anon key de Supabase que el proyecto donde desplegaste la función.
