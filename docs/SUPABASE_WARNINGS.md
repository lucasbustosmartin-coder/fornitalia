# Advertencias de Supabase y cómo resolverlas

## Los 8 avisos que quedan (esperados sin Auth)

Si después de aplicar todo lo anterior te siguen saliendo **8 avisos**, son estos y es **normal** con la configuración actual:

| Tipo | Cantidad | Tablas / detalle |
|------|----------|-------------------|
| **RLS Policy Always True** | 3 | Solo `public.transacciones`: políticas "Permitir inserción", "Permitir actualización", "Permitir eliminación". |
| **Anonymous Access Policies** | 5 | `config_dashboard`, `tipo_de_cambio`, `transacciones`, `transacciones_fornitalia`, `transacciones_respaldo`. |

**Por qué siguen apareciendo**

- El dashboard usa la clave **anon** (público) y **no hay login**: cualquier visitante puede leer y, en `transacciones`, también insertar/actualizar/borrar según las políticas actuales.
- Para que el sitio funcione así (sin login), esas políticas tienen que seguir permitiendo acceso anónimo y con `USING (true)` / `WITH CHECK (true)` en `transacciones`.

**Qué implican en la práctica**

- RLS está **activado** en todas las tablas (ya no tenés el error de “tabla pública sin RLS”).
- Los avisos indican que el acceso es **muy abierto** (anon y políticas siempre verdaderas en INSERT/UPDATE/DELETE de `transacciones`). Eso es coherente con un uso interno o de confianza sin Auth.

**Cómo hacer que desaparezcan los 8**

Habría que **usar Supabase Auth** (login) y ajustar políticas:

1. Que los usuarios **inicien sesión** en el dashboard (email/contraseña o magic link).
2. En las políticas RLS, en lugar de `USING (true)` / `WITH CHECK (true)`, usar por ejemplo:
   - `auth.uid() IS NOT NULL` (solo usuarios autenticados), o
   - `auth.uid() = user_id` si guardás `user_id` en cada fila.
3. Así el linter ya no vería “políticas siempre verdaderas” ni “acceso anónimo” en esas tablas.

Mientras no implementes login, **podés ignorar estos 8 avisos** si el uso del proyecto es interno o controlado; no son errores, son advertencias de que el acceso es amplio.

---

## 1. RLS Policy Always True (políticas demasiado permisivas)

**Qué hace el SQL:** Ejecutá `sql/supabase_rls_quitar_politicas_permisivas.sql` en el SQL Editor. Ese script **elimina** las políticas INSERT, UPDATE y DELETE de:

- `public.tipo_de_cambio` (el dashboard solo lee; la carga se hace por SQL o script)
- `public.transacciones_respaldo` (solo respaldo/restore desde SQL Editor)
- `public.transacciones_fornitalia` (solo scripts de demo/restaurar)

En esas tablas queda solo la política de **SELECT**. Así se quitan 9 avisos de “RLS Policy Always True”.

**transacciones:** En `public.transacciones` se mantienen INSERT, UPDATE y DELETE porque el dashboard necesita editar registros y la migración insertar. Esos 3 avisos seguirán saliendo hasta que uses **Supabase Auth** y restrinjas las políticas por usuario (por ejemplo `auth.uid() = user_id`).

---

## 2. Anonymous Access Policies (acceso anónimo)

Supabase avisa que las tablas tienen políticas que permiten acceso **anon** (sin usuario logueado). Para que desaparezcan los avisos hay que:

- Activar **Supabase Auth** y que los usuarios inicien sesión.
- Ajustar las políticas RLS para que exijan `auth.uid() IS NOT NULL` o filtren por `auth.uid() = user_id`.

Si hoy el dashboard usa la clave **anon** y no hay login, al restringir por auth el sitio dejaría de funcionar hasta implementar el login. Podés dejarlo así de momento y, cuando agregues Auth, actualizar las políticas.

---

## 3. Auth OTP long expiry (OTP de correo con vencimiento largo)

- Ir a **Authentication → Providers → Email** (o **Settings** de Auth).
- Buscar **“OTP expiry”** o tiempo de vencimiento del código por correo.
- Dejarlo en **menos de 1 hora** (por ejemplo 15 o 30 minutos).

---

## 4. Leaked Password Protection Disabled

- Ir a **Authentication → Settings** (o **Security**).
- Activar la opción de **“Leaked password protection”** o **“Check passwords against HaveIBeenPwned”**.

---

## 5. Vulnerable Postgres version

- Ir a **Project Settings → Infrastructure** (o **Database**).
- Revisar si hay **upgrade** disponible para la versión de Postgres.
- Aplicar la actualización en la ventana de mantenimiento que indique Supabase.

---

Resumen: ejecutá el SQL de políticas permisivas para limpiar los avisos de RLS en tablas de solo lectura; el resto se resuelve desde el Dashboard (Auth, Postgres) o cuando implementes login y políticas por usuario.
