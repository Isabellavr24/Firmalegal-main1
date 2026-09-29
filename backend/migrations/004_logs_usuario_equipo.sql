-- Registros: poder saber QUIEN hizo cada cosa y de QUE equipo era.
--
-- `signature_events` guarda el documento y el destinatario, pero no el usuario
-- de la plataforma ni su equipo. Con eso no se puede responder a "que hizo este
-- operador" ni "que paso en este equipo", que son dos de las tres vistas del
-- sistema de registros.
--
-- Ademas, el enum de tipos no contempla dos cosas que hacen falta:
--   vi_validated -> cuando alguien completa su validacion de identidad
--   error        -> los fallos, que son la mitad de lo que interesa ver
--
-- Hasta ahora cada incidente (los 8 pagares sin firma, las trazas que faltaban,
-- los SMS no entregados, los callbacks perdidos) hubo que investigarlo leyendo
-- los logs de Docker a mano. Y esos rotan y se pierden.
--
-- NO se borra ni se modifica nada existente:
--   - las dos columnas admiten NULL, asi que las filas actuales quedan igual
--   - los 12 valores del enum se conservan en su orden; solo se anaden 2 al final
--
-- Antes de aplicar en produccion: respaldo verificado con `gzip -t` y contar
-- las filas de signature_events antes y despues.

ALTER TABLE signature_events
  ADD COLUMN user_id INT NULL AFTER recipient_id
    COMMENT 'Usuario de la plataforma que origino el evento, si lo hubo',
  ADD COLUMN team_id INT NULL AFTER user_id
    COMMENT 'Equipo al que pertenece, para filtrar los registros por equipo';

ALTER TABLE signature_events
  ADD INDEX idx_signature_events_user (user_id),
  ADD INDEX idx_signature_events_team (team_id),
  ADD INDEX idx_signature_events_tipo_fecha (event_type, created_at);

-- Los 12 valores actuales se repiten tal cual; solo cambia lo que se anade.
ALTER TABLE signature_events
  MODIFY COLUMN event_type ENUM(
    'document_created',
    'recipient_added',
    'email_sent',
    'document_opened',
    'field_completed',
    'document_signed',
    'document_rejected',
    'reminder_sent',
    'document_completed',
    'document_voided',
    'otp_sent',
    'otp_verified',
    'vi_validated',
    'error'
  ) NOT NULL;

-- Rellenar el equipo de los eventos que ya existen, deduciendolo del dueno del
-- documento. Solo toca filas con team_id NULL, asi que se puede repetir sin
-- riesgo si hiciera falta.
UPDATE signature_events se
JOIN documents d ON d.document_id = se.document_id
JOIN team_members tm ON tm.user_id = d.owner_id
SET se.team_id = tm.team_id
WHERE se.team_id IS NULL;
