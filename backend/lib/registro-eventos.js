// Registro de eventos de los documentos.
//
// Deja constancia en `signature_events` de lo que va pasando: quien firmo,
// quien valido su identidad, que correo salio, que fallo. Es lo que alimenta
// la pantalla de registros.
//
// Hasta septiembre de 2026 esto no existia como tal: de los 12 tipos de evento
// que la tabla admite, el codigo solo escribia 3, y cada incidente (los 8
// pagares sin firma, las trazas que faltaban, los SMS no entregados, los
// callbacks perdidos) hubo que investigarlo leyendo los logs de Docker a mano.
// Y esos rotan y se pierden.
//
// REGLA QUE NO SE ROMPE: registrar NUNCA lanza excepcion. Un fallo al dejar
// constancia no puede tumbar una firma ni un envio. Se queja en el log y
// devuelve false, pero la operacion sigue su curso.
//
// Vive aqui y no en server.js porque los controladores tambien necesitan
// registrar: la creacion de documentos, el rechazo y los envios masivos estan
// en `controllers/`, no en el servidor.

// `user_id` y `team_id` son columnas de la migracion 004. Mientras no este
// aplicada se guardan los eventos sin ellas, para que el codigo funcione igual
// antes y despues de migrar y el despliegue no dependa del orden.
let _columnasComprobadas = false;
let _hayUsuarioEquipo = false;

/**
 * Deja constancia de algo que ha pasado en un documento.
 *
 * @param {object} db      pool de mysql2 (el que usa el resto del sistema)
 * @param {object} evento
 * @param {string} evento.tipo          uno de los valores de `event_type`
 * @param {number} evento.documentId    obligatorio
 * @param {number} [evento.recipientId] el destinatario, si aplica
 * @param {number} [evento.userId]      el usuario de la plataforma, si lo hubo
 * @param {number} [evento.teamId]      se deduce del dueno si no se pasa
 * @param {object} [evento.datos]       lo que se quiera guardar, como JSON
 * @param {object} [evento.req]         para la IP y el navegador
 * @returns {Promise<boolean>} true si se guardo; false si no, sin lanzar
 */
async function registrarEvento(db, { tipo, documentId, recipientId = null, userId = null,
                                     teamId = null, datos = null, req = null }) {
    try {
        if (!db || !tipo || !documentId) return false;

        if (!_columnasComprobadas) {
            try {
                const [cols] = await db.promise().query(
                    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'signature_events'
                       AND COLUMN_NAME IN ('user_id','team_id')`
                );
                _hayUsuarioEquipo = cols.length === 2;
                if (!_hayUsuarioEquipo) {
                    console.warn('[EVENTOS] La migracion 004 no esta aplicada: no se guardara usuario ni equipo');
                }
            } catch (_) {
                _hayUsuarioEquipo = false;
            }
            _columnasComprobadas = true;
        }

        // El equipo se deduce del dueno del documento si no viene dado.
        let equipo = teamId;
        if (_hayUsuarioEquipo && !equipo) {
            try {
                const [filas] = await db.promise().query(
                    `SELECT tm.team_id FROM documents d
                     JOIN team_members tm ON tm.user_id = d.owner_id
                     WHERE d.document_id = ? LIMIT 1`,
                    [documentId]
                );
                equipo = filas[0]?.team_id || null;
            } catch (_) { equipo = null; }
        }

        const ip = req ? (req.ip || req.connection?.remoteAddress || null) : null;
        const navegador = req && typeof req.get === 'function' ? (req.get('user-agent') || null) : null;
        const cuerpo = datos ? JSON.stringify(datos) : null;

        if (_hayUsuarioEquipo) {
            await db.promise().query(
                `INSERT INTO signature_events
                   (document_id, recipient_id, user_id, team_id, event_type, event_data, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [documentId, recipientId, userId, equipo, tipo, cuerpo, ip, navegador]
            );
        } else {
            await db.promise().query(
                `INSERT INTO signature_events
                   (document_id, recipient_id, event_type, event_data, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [documentId, recipientId, tipo, cuerpo, ip, navegador]
            );
        }
        return true;
    } catch (e) {
        console.warn(`[EVENTOS] No se pudo registrar "${tipo}" del documento ${documentId}: ${e.message}`);
        return false;
    }
}

/**
 * Atajo para los fallos. Guarda el mensaje y de donde viene, para poder
 * filtrar por errores en la pantalla de registros.
 */
async function registrarError(db, { documentId, recipientId = null, userId = null,
                                    donde, mensaje, datos = null, req = null }) {
    return registrarEvento(db, {
        tipo: 'error',
        documentId, recipientId, userId, req,
        datos: { donde, mensaje: String(mensaje || '').slice(0, 500), ...(datos || {}) }
    });
}

/**
 * Para lo que falla SIN documento al que colgarlo.
 *
 * El caso que lo pide: un callback de Validacion de Identidad llega con un
 * token que ya no existe. Eso pasa cuando se recrean los destinatarios — VI
 * guardo el token viejo — y la validacion de esa persona se pierde sin que
 * nadie se entere. Como no hay destinatario, tampoco hay `document_id`, y
 * `signature_events` lo exige.
 *
 * Va entonces a `activity_log`, que admite filas sin usuario y sin entidad, y
 * la vista `v_registros` lo recoge igual. Se marca como error por el nombre de
 * la accion: la vista clasifica con `action LIKE '%error%'`.
 *
 * @param {object} db      pool de mysql2
 * @param {object} evento
 * @param {string} evento.donde     en que parte del sistema
 * @param {string} evento.mensaje   que ha pasado
 * @param {object} [evento.datos]   lo que se sepa
 * @param {object} [evento.req]     para la IP
 * @returns {Promise<boolean>} nunca lanza
 */
async function registrarIncidencia(db, { donde, mensaje, datos = null, req = null }) {
    try {
        if (!db || !mensaje) return false;

        const ip = req ? (req.ip || req.connection?.remoteAddress || null) : null;
        const navegador = req && typeof req.get === 'function' ? (req.get('user-agent') || null) : null;

        // `details` tiene un CHECK de json_valid, asi que siempre va un JSON
        // valido, nunca una cadena suelta ni NULL a medias.
        const cuerpo = JSON.stringify({
            donde: donde || null,
            mensaje: String(mensaje).slice(0, 500),
            ...(datos || {})
        });

        await db.promise().query(
            `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
             VALUES (NULL, 'system_error', NULL, NULL, ?, ?, ?)`,
            [cuerpo, ip, navegador]
        );
        return true;
    } catch (e) {
        console.warn(`[EVENTOS] No se pudo registrar la incidencia "${donde}": ${e.message}`);
        return false;
    }
}

module.exports = { registrarEvento, registrarError, registrarIncidencia };
