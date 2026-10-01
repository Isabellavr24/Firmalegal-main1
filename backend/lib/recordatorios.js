// Recordatorios: reenviar validaciones de identidad y enlaces de firma.
//
// Automatiza lo que se hace a mano cada lunes: mirar quien falta por validar,
// quien valido pero no ha firmado, y reenviarles el correo correspondiente.
//
// DOS REGLAS QUE NO SE ROMPEN:
//
// 1. No se manda el enlace de FIRMA a quien no ha validado su identidad. La
//    validacion va primero, siempre.
//
// 2. El limite de reenvio es POR USUARIO. Un cliente no puede quedar bloqueado
//    porque otro, sin relacion con el, le escribio a esa persona hace dos dias.
//    Si otro usuario escribio hace poco, se AVISA pero se deja enviar.

const DIAS_ENTRE_RECORDATORIOS = 3;

/**
 * El estado de un documento: quien falta por validar, quien por firmar, y a
 * quien se le puede escribir ahora mismo.
 *
 * @param {object} db        pool de mysql2
 * @param {number} documentId
 * @param {number} userId    quien pregunta (el limite se cuenta por el)
 * @returns {Promise<object>} resumen y listas
 */
async function estadoDocumento(db, documentId, userId) {
    const [filas] = await db.promise().query(
        `SELECT dr.recipient_id, dr.email, dr.name, dr.status,
                dr.vi_validated_at, dr.viewer_group_id, dr.is_final_signer,
                dr.completed_at,
                (SELECT MAX(r.created_at) FROM recordatorios_enviados r
                  WHERE r.recipient_id = dr.recipient_id
                    AND r.user_id <=> ?
                    AND r.resultado = 'enviado') AS ultimo_mio,
                (SELECT MAX(r.created_at) FROM recordatorios_enviados r
                  WHERE r.recipient_id = dr.recipient_id
                    AND NOT (r.user_id <=> ?)
                    AND r.resultado = 'enviado') AS ultimo_de_otro
         FROM document_recipients dr
         WHERE dr.document_id = ?
         ORDER BY dr.viewer_group_id, dr.signing_order`,
        [userId, userId, documentId]
    );

    const ahora = Date.now();
    const margen = DIAS_ENTRE_RECORDATORIOS * 24 * 60 * 60 * 1000;

    const sinValidar = [], sinFirmar = [], firmados = [];

    for (const f of filas) {
        const desdeElMio = f.ultimo_mio ? ahora - new Date(f.ultimo_mio).getTime() : null;
        const puede = desdeElMio === null || desdeElMio >= margen;

        // Dias que faltan para poder reenviarle, si esta en espera
        const faltan = puede ? 0
            : Math.ceil((margen - desdeElMio) / (24 * 60 * 60 * 1000));

        // Aviso blando: otro usuario le escribio en las ultimas 24 horas
        const otroReciente = f.ultimo_de_otro &&
            (ahora - new Date(f.ultimo_de_otro).getTime()) < 24 * 60 * 60 * 1000;

        const persona = {
            recipient_id: f.recipient_id,
            email: f.email,
            nombre: f.name || f.email,
            viewer_group_id: f.viewer_group_id,
            es_firmante_definitivo: !!f.is_final_signer,
            ultimo_recordatorio: f.ultimo_mio,
            puede_reenviarse: puede,
            dias_para_poder: faltan,
            aviso_otro_usuario: !!otroReciente
        };

        if (f.status === 'completed') {
            firmados.push({ ...persona, firmado_el: f.completed_at });
        } else if (!f.vi_validated_at) {
            sinValidar.push(persona);
        } else {
            // Valido pero no ha firmado: a estos les toca el enlace de firma
            sinFirmar.push({ ...persona, validado_el: f.vi_validated_at });
        }
    }

    return {
        resumen: {
            total: filas.length,
            sin_validar: sinValidar.length,
            validados_sin_firmar: sinFirmar.length,
            firmados: firmados.length,
            // Cuantos se pueden reenviar AHORA, que es lo que se va a mandar
            validaciones_enviables: sinValidar.filter(p => p.puede_reenviarse).length,
            firmas_enviables: sinFirmar.filter(p => p.puede_reenviarse).length,
            // Los que estan en espera por el limite de dias
            en_espera: [...sinValidar, ...sinFirmar].filter(p => !p.puede_reenviarse).length
        },
        sin_validar: sinValidar,
        sin_firmar: sinFirmar,
        firmados
    };
}

/**
 * Deja constancia de un recordatorio enviado. Nunca lanza: que falle el
 * registro no puede tumbar un envio que ya salio.
 */
async function registrar(db, { recipientId, documentId, userId, tipo, email, resultado = 'enviado', detalle = null }) {
    try {
        await db.promise().query(
            `INSERT INTO recordatorios_enviados
               (recipient_id, document_id, user_id, tipo, email, resultado, detalle)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [recipientId, documentId, userId || null, tipo, email,
             resultado, detalle ? String(detalle).slice(0, 500) : null]
        );
        return true;
    } catch (e) {
        console.warn(`[RECORDATORIOS] No se pudo registrar el envio a ${email}: ${e.message}`);
        return false;
    }
}

/**
 * Comprueba si a esta persona se le puede escribir ahora, por este usuario.
 * Se consulta otra vez en el momento del envio, no solo al pintar la pantalla:
 * entre que el operador abre el panel y pulsa el boton pueden pasar minutos, y
 * en una tanda larga el mismo destinatario podria repetirse.
 */
async function sePuedeEnviar(db, recipientId, userId) {
    try {
        const [filas] = await db.promise().query(
            `SELECT MAX(created_at) AS ultimo
             FROM recordatorios_enviados
             WHERE recipient_id = ? AND user_id <=> ? AND resultado = 'enviado'`,
            [recipientId, userId || null]
        );
        const ultimo = filas[0]?.ultimo;
        if (!ultimo) return true;
        const pasado = Date.now() - new Date(ultimo).getTime();
        return pasado >= DIAS_ENTRE_RECORDATORIOS * 24 * 60 * 60 * 1000;
    } catch (e) {
        // Ante la duda, NO enviar: es peor repetirle a un padre que saltarse uno.
        console.warn(`[RECORDATORIOS] No se pudo comprobar el limite de ${recipientId}: ${e.message}`);
        return false;
    }
}

module.exports = { estadoDocumento, registrar, sePuedeEnviar, DIAS_ENTRE_RECORDATORIOS };
