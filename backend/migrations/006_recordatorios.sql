-- =====================================================================
-- 006 — Registro de los recordatorios que se envian
-- =====================================================================
--
-- Cada lunes se reenvian a mano las validaciones de identidad y los enlaces
-- de firma a los padres que faltan. Esta tabla deja constancia de cada envio
-- para poder responder a tres preguntas:
--
--   1. A quien se le reenvio y cuando (para no repetir a los dos dias)
--   2. Que usuario lo mando (el limite es POR USUARIO, ver abajo)
--   3. Cuantos salieron en cada tanda, para el informe
--
-- POR QUE EL LIMITE ES POR USUARIO:
-- No solo la universidad reenvia; cualquier cliente puede. Si el limite fuera
-- global, un usuario quedaria bloqueado porque otro, sin ninguna relacion con
-- el, le escribio a esa persona hace dos dias. El bloqueo duro es por
-- (usuario + destinatario); si OTRO usuario escribio hace poco solo se avisa
-- en el resumen, pero se deja enviar.
--
-- No toca ninguna tabla existente: solo crea esta.

CREATE TABLE IF NOT EXISTS recordatorios_enviados (
    id              INT AUTO_INCREMENT PRIMARY KEY,

    recipient_id    INT NOT NULL
                    COMMENT 'El destinatario concreto, no el correo: la misma persona puede estar en documentos de clientes distintos',
    document_id     INT NOT NULL,
    user_id         INT NULL
                    COMMENT 'Quien lo envio. El limite de dias se cuenta por este usuario',

    tipo            ENUM('validacion','firma') NOT NULL
                    COMMENT 'validacion = solicitud de validar identidad; firma = enlace para firmar',
    email           VARCHAR(255) NOT NULL
                    COMMENT 'Se guarda aparte porque el correo del destinatario puede corregirse despues',

    resultado       ENUM('enviado','fallido') NOT NULL DEFAULT 'enviado',
    detalle         VARCHAR(500) NULL
                    COMMENT 'El motivo, cuando falla',

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Para la comprobacion de "cuando fue el ultimo a esta persona por este
    -- usuario", que es la consulta que corre antes de cada envio.
    INDEX idx_rec_usuario_dest (user_id, recipient_id, created_at),
    -- Para el aviso blando: "alguien mas le escribio hace poco"
    INDEX idx_rec_dest_fecha (recipient_id, created_at),
    -- Para el informe por documento
    INDEX idx_rec_doc_fecha (document_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sin clave foranea a `document_recipients` A PROPOSITO.
--
-- Esa tabla se borra y se recrea cada vez que se reenvia un CSV a un pagare, y
-- `field_values` ya se lleva por delante los datos de los padres cuando pasa.
-- Si esta tabla tuviera CASCADE, perderiamos el historial de a quien se le ha
-- escrito justo cuando mas falta hace. El `recipient_id` se guarda como dato,
-- no como referencia.
