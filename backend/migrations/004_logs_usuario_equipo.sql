-- Registros: poder consultar QUIEN hizo cada cosa, de QUE equipo y sobre QUE
-- documento, sin duplicar datos ni tocar lo que ya funciona.
--
-- EL SISTEMA YA TIENE DOS TABLAS DE REGISTRO, y modelan cosas distintas:
--
--   activity_log       lo que hace un USUARIO   (login, ver, descargar, subir)
--                      200 filas, 18 sitios del codigo la usan, tiene user_id
--
--   signature_events   lo que le pasa a un DOCUMENTO  (firmar, validar, sellar)
--                      la usan 3 sitios, no tiene user_id ni team_id
--
-- Esa separacion es correcta y NO se toca: fusionarlas obligaria a migrar 200
-- filas y reescribir 18 puntos que hoy funcionan, a cambio de nada. Se unifican
-- al CONSULTAR, con la vista `v_registros` del final.
--
-- Lo que falta de verdad:
--   1. signature_events no sabe que usuario ni que equipo origino el evento
--   2. El enum no admite 'vi_validated' ni 'error'
--   3. No hay por donde filtrar por equipo en activity_log
--   4. Faltan indices compuestos para las consultas de la pantalla
--
-- LO QUE ESTA MIGRACION NO HACE:
--   - No crea tablas nuevas (las dos ya existen)
--   - No borra filas ni elimina columnas
--   - No toca users, documents, document_recipients ni teams
--   - No hay DROP, ni CASCADE, ni TRUNCATE
--
-- Antes de aplicar en produccion: respaldo verificado con `gzip -t` y contar
-- las filas antes y despues. Procedimiento en
-- 06-01-2026/MIGRACION-004-COMO-APLICARLA.md


-- ---------------------------------------------------------------------------
-- 1. signature_events: quien y de que equipo
-- ---------------------------------------------------------------------------
-- Ambas admiten NULL, asi que las filas existentes quedan intactas.

ALTER TABLE signature_events
  ADD COLUMN user_id INT NULL AFTER recipient_id
    COMMENT 'Usuario de la plataforma que origino el evento, si lo hubo',
  ADD COLUMN team_id INT NULL AFTER user_id
    COMMENT 'Equipo del documento, desnormalizado para poder filtrar sin JOIN';

-- Los 12 valores actuales se repiten EN SU ORDEN. MySQL guarda los enum por
-- posicion: si se reordenan o se quita uno, las filas existentes cambian de
-- valor en silencio. Los nuevos van al final.
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


-- ---------------------------------------------------------------------------
-- 2. activity_log: de que equipo
-- ---------------------------------------------------------------------------
-- Ya tiene user_id, pero no equipo. Se anade para poder filtrar por equipo sin
-- resolver la pertenencia en cada consulta.

ALTER TABLE activity_log
  ADD COLUMN team_id INT NULL AFTER user_id
    COMMENT 'Equipo del usuario en el momento del registro';


-- ---------------------------------------------------------------------------
-- 3. Indices para las consultas de la pantalla
-- ---------------------------------------------------------------------------
-- Las dos tablas ya tienen indices sueltos por usuario, tipo y fecha. Faltan
-- los COMPUESTOS, que son los que de verdad usan las consultas de la pantalla:
-- siempre se filtra por algo Y se ordena por fecha descendente.
--
-- Con (columna, created_at) MySQL resuelve filtro y orden con un solo indice,
-- sin ordenar en memoria. Es la diferencia entre una pantalla instantanea y
-- una que tarda cuando la tabla crezca.

ALTER TABLE signature_events
  ADD INDEX idx_se_team_fecha (team_id, created_at),
  ADD INDEX idx_se_user_fecha (user_id, created_at),
  ADD INDEX idx_se_doc_fecha (document_id, created_at),
  ADD INDEX idx_se_tipo_fecha (event_type, created_at);

ALTER TABLE activity_log
  ADD INDEX idx_al_team_fecha (team_id, created_at),
  ADD INDEX idx_al_user_fecha (user_id, created_at),
  ADD INDEX idx_al_entidad (entity_type, entity_id);


-- ---------------------------------------------------------------------------
-- 4. Rellenar el equipo de lo que ya existe
-- ---------------------------------------------------------------------------
-- Solo tocan filas con team_id NULL, asi que se pueden repetir sin riesgo.

UPDATE signature_events se
JOIN documents d ON d.document_id = se.document_id
SET se.team_id = d.team_id
WHERE se.team_id IS NULL AND d.team_id IS NOT NULL;

-- Para los que no lo tengan en el documento, por el dueno.
UPDATE signature_events se
JOIN documents d ON d.document_id = se.document_id
JOIN team_members tm ON tm.user_id = d.owner_id
SET se.team_id = tm.team_id
WHERE se.team_id IS NULL;

UPDATE activity_log al
JOIN team_members tm ON tm.user_id = al.user_id
SET al.team_id = tm.team_id
WHERE al.team_id IS NULL;


-- ---------------------------------------------------------------------------
-- 5. La vista que unifica las dos, solo para consultar
-- ---------------------------------------------------------------------------
-- Una vista no guarda datos: es una consulta con nombre. No ocupa espacio, no
-- se desincroniza y no hay nada que mantener al dia.
--
-- Da una sola linea de tiempo con las dos fuentes, que es lo que necesita la
-- pantalla. El filtro por equipo, usuario, documento o fecha lo resuelven los
-- indices compuestos de arriba en cada tabla por separado, antes de unir.
--
-- `origen` permite saber de cual viene cada fila, y `es_error` separa los
-- fallos de los movimientos normales, que es uno de los filtros pedidos.

CREATE OR REPLACE VIEW v_registros AS
SELECT
    'documento'                          AS origen,
    se.event_id                          AS id,
    se.created_at                        AS fecha,
    se.event_type                        AS accion,
    se.user_id                           AS user_id,
    se.team_id                           AS team_id,
    se.document_id                       AS document_id,
    se.recipient_id                      AS recipient_id,
    se.event_data                        AS datos,
    se.ip_address                        AS ip,
    (se.event_type = 'error')            AS es_error
FROM signature_events se
UNION ALL
SELECT
    'usuario'                            AS origen,
    al.log_id                            AS id,
    al.created_at                        AS fecha,
    al.action                            AS accion,
    al.user_id                           AS user_id,
    al.team_id                           AS team_id,
    CASE WHEN al.entity_type = 'document' THEN al.entity_id ELSE NULL END AS document_id,
    NULL                                 AS recipient_id,
    al.details                           AS datos,
    al.ip_address                        AS ip,
    (al.action LIKE '%error%' OR al.action LIKE '%fail%') AS es_error
FROM activity_log al;
