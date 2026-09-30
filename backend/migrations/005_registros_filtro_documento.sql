-- =====================================================================
-- 005 — Que el filtro por documento alcance el indice en activity_log
-- =====================================================================
--
-- Migracion 004 creo la vista `v_registros` y el indice
-- `idx_al_entidad (entity_type, entity_id)`. El indice esta bien, pero el
-- filtro nunca lo alcanzaba:
--
--   activity_log guarda el documento como `entity_id` con `entity_type`
--   = 'document'. La vista lo expone envuelto en un CASE, y MySQL no puede
--   empujar `document_id = 1247` dentro de una expresion: recorria las
--   203 filas enteras (EXPLAIN: type = ALL) en cada carga de la pantalla.
--
-- Se anaden `entity_type` y `entity_id` como columnas de la vista para que
-- el servidor pueda filtrar por ellas directamente, que si entra por el
-- indice. `document_id` se queda igual, porque es el que se muestra.
--
-- No toca datos: es solo la definicion de la vista. CREATE OR REPLACE la
-- sustituye sin borrar nada, y las dos tablas de origen no se modifican.
--
-- Comprobacion posterior:
--   EXPLAIN SELECT id FROM v_registros
--    WHERE document_id = 1247 OR (entity_type='document' AND entity_id=1247);
--   La rama de activity_log debe pasar de type=ALL a type=ref.

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
    (se.event_type = 'error')            AS es_error,
    -- En esta tabla el documento ya es una columna propia. Se repite con los
    -- nombres de la otra rama para que la vista tenga las mismas columnas.
    'document'                           AS entity_type,
    se.document_id                       AS entity_id
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
    (al.action LIKE '%error%' OR al.action LIKE '%fail%') AS es_error,
    al.entity_type                       AS entity_type,
    al.entity_id                         AS entity_id
FROM activity_log al;
