-- Guarda la trazabilidad junto al correo verificado.
--
-- La validacion de identidad se reutiliza hasta un año: quien ya valido no
-- vuelve a hacerlo. Pero vi_verified_emails solo guardaba el correo y la fecha,
-- asi que al firmar otro documento no habia de donde sacar el PDF de
-- trazabilidad y el documento salia firmado sin su soporte de identidad.
--
-- vi_traza_path     -> el archivo, para adjuntarlo directo
-- validacion_codigo -> el codigo en VI, para volver a pedirlo si el archivo
--                      falta o quedo en otro envio

ALTER TABLE vi_verified_emails
  ADD COLUMN vi_traza_path VARCHAR(500) NULL
    COMMENT 'Traza de la validacion, para reutilizarla en otros documentos',
  ADD COLUMN validacion_codigo VARCHAR(64) NULL
    COMMENT 'Codigo en VI: permite volver a pedir la traza si falta el archivo';

-- Rellenar con las trazas que ya existen en algun envio.
UPDATE vi_verified_emails v
JOIN (
  SELECT LOWER(dr.email) COLLATE utf8mb4_unicode_ci AS em,
         MAX(dr.vi_traza_path) AS tz
  FROM document_recipients dr
  WHERE dr.vi_traza_path IS NOT NULL
  GROUP BY LOWER(dr.email) COLLATE utf8mb4_unicode_ci
) t ON t.em = LOWER(v.email) COLLATE utf8mb4_unicode_ci
SET v.vi_traza_path = t.tz
WHERE v.vi_traza_path IS NULL;
