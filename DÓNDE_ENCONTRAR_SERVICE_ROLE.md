# Dónde encontrar la Service Role Key en Supabase

La **service_role key** está en el mismo lugar que la Anon Key, pero es la otra clave que aparece en la lista.

## Pasos exactos

1. Entra a [Supabase Dashboard](https://supabase.com/dashboard) e inicia sesión.
2. Abre tu proyecto (**moeqgzezdraknwmheheu**).
3. En el **menú izquierdo**, abajo, haz clic en el **ícono de engranaje** (⚙️) → **Project Settings**.
4. En el menú de la izquierda de *Project Settings*, elige **API**.
5. En la sección **Project API keys** verás algo así:
   - **anon** `public` – esta es la que ya tienes (Anon Key).
   - **service_role** `secret` – esta es la que necesitas para la migración.

6. La **service_role** suele estar oculta. Al lado suele decir **Reveal** o tener un ícono de ojo. Haz clic para mostrarla.
7. Copia esa clave larga (empieza con `eyJ...`) y **no la compartas ni la subas a ningún repositorio**.

## Pegarla en el proyecto

Abre el archivo **`.env`** en la raíz del proyecto y pega la clave en:

```env
SUPABASE_SERVICE_ROLE_KEY=eyJ... (la clave que copiaste)
```

Guarda el archivo. El script de migración usará automáticamente la service_role si está definida.

## Si no ves "service_role"

- Algunas cuentas o planes pueden mostrar solo una clave. Revisa que estés en **Project Settings → API** y no en otra sección.
- Si usas una organización, asegúrate de tener permisos de *Owner* o *Admin* en el proyecto.
- La URL de esa página suele ser:  
  `https://supabase.com/dashboard/project/moeqgzezdraknwmheheu/settings/api`
