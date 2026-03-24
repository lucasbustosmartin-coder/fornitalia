-- Asignar rol Admin al usuario indicado (Fornitalia)
-- Ejecutar en Supabase SQL Editor después de:
--   - sql/supabase_seguridad_forfitalia.sql
--   - que el usuario exista en Authentication (registro desde la app o alta manual).

INSERT INTO public.app_user_profile (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE lower(trim(email)) = lower(trim('lucas.bustos.martin@gmail.com'))
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- Verificar (debe devolver 1 fila con role = admin):
-- SELECT p.email, u.role
-- FROM public.user_profiles p
-- LEFT JOIN public.app_user_profile u ON u.user_id = p.id
-- WHERE lower(trim(p.email)) = lower(trim('lucas.bustos.martin@gmail.com'));
