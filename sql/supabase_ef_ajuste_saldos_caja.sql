-- AJUSTE DE SALDOS (CAJA) debajo de FLUJO OPERATIVO GENERADO
-- y suma algebraica en (=) FLUJO DE CAJA NETO DEL PERÍODO (D).
-- Ingreso suma, Egreso resta. No entra en A, B ni C.

-- 1) Apartar los renglones ya creados (estaban al final, orden 40/41).
UPDATE public.ef_estructura
SET orden = 900
WHERE codigo = '1.2' AND nivel = 0;

UPDATE public.ef_estructura
SET orden = 901
WHERE codigo = '1.2.1' AND nivel = 1;

-- 2) Correr el resto para abrir lugar después de 1 / 1.1 (orden 1 y 2).
UPDATE public.ef_estructura
SET orden = orden + 1000
WHERE orden >= 4 AND orden < 900;

UPDATE public.ef_estructura
SET orden = orden - 1000 + 2
WHERE orden >= 1004 AND orden < 1900;

-- 3) Ubicar el ítem y el subítem.
UPDATE public.ef_estructura
SET
  orden = 3,
  naturaleza = 'Ajuste ± de caja. No entra en A–C; suma o resta en el Flujo de caja neto del período (D).'
WHERE codigo = '1.2' AND nivel = 0;

UPDATE public.ef_estructura
SET
  orden = 4,
  signo = '+',
  naturaleza = 'Ingreso suma y Egreso resta. Entra en (=) FLUJO DE CAJA NETO DEL PERÍODO.'
WHERE codigo = '1.2.1' AND nivel = 1;

-- 4) Fórmula D (el texto de A–D no se edita en la app).
UPDATE public.ef_estructura
SET naturaleza = 'Flujo Neto C + 6.1 - 6.2 - 6.3 + Total 1.2'
WHERE codigo = 'D' AND nivel = 2;
