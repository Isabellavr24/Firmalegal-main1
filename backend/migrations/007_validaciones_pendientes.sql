-- =====================================================================
-- 007 — Las validaciones que se han creado pero todavia no se completan
-- =====================================================================
--
-- POR QUE HACE FALTA:
--
-- El codigo de una validacion solo se guardaba cuando la persona la COMPLETA,
-- en el callback, dentro de `vi_verified_emails`. Pero esa tabla tiene
-- `vi_validated_at NOT NULL`: no admite una fila para alguien que todavia no
-- ha validado. Guardar ahi el codigo al crear la validacion obligaria a poner
-- una fecha de validacion falsa, y la pantalla diria que esa persona ya valido
-- cuando no lo ha hecho.
--
-- Es decir: justo en el periodo que importa -entre que se envia la validacion
-- y que el firmante la completa- no habia donde guardar el codigo, y sin
-- codigo no se le puede preguntar a VI por el estado ni por los intentos.
--
-- Ese es el periodo en el que un padre escribe diciendo que algo no le
-- funciona. Esta semana paso tres veces y las tres hubo que entrar al servidor
-- a consultar la base de VI a mano.
--
-- QUE NO HACE:
--
-- No toca `vi_verified_emails` ni ninguna otra tabla. Cuando la persona
-- completa su validacion, el callback sigue guardando en `vi_verified_emails`
-- igual que siempre; esta tabla solo cubre el antes.

CREATE TABLE IF NOT EXISTS vi_validaciones_pendientes (
    id              INT AUTO_INCREMENT PRIMARY KEY,

    email           VARCHAR(255) NOT NULL
                    COMMENT 'En minusculas. Es como se busca desde la pantalla',
    validacion_codigo VARCHAR(64) NOT NULL
                    COMMENT 'El codigo que devuelve VI al crear la validacion',

    recipient_id    INT NULL
                    COMMENT 'A quien se le creo. Sin clave foranea: los destinatarios se recrean al reenviar un CSV y el historial debe sobrevivir',
    document_id     INT NULL,
    owner_user_id   INT NULL
                    COMMENT 'Quien la creo',

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Una sola validacion viva por correo: si se le crea otra, sustituye a la
    -- anterior, que es lo que de verdad pasa en VI.
    UNIQUE KEY uniq_email (email),
    INDEX idx_codigo (validacion_codigo),
    INDEX idx_recipient (recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sin clave foranea a `document_recipients` A PROPOSITO, por lo mismo que en
-- la migracion 006: esa tabla se borra y se recrea cada vez que se reenvia un
-- CSV, y con CASCADE perderiamos el rastro justo cuando mas falta hace.
