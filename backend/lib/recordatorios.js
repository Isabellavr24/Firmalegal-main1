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

// El limite de dias es SOLO para el reenvio MASIVO. Ahi salen decenas de
// correos de golpe desde el mismo remitente —40 pagares son 80 correos— y eso
// es lo que dispara los filtros de spam.
const DIAS_ENTRE_RECORDATORIOS = 3;

// El reenvio INDIVIDUAL no tiene limite de dias: si un padre llama diciendo
// que no le llego, hay que poder mandarselo ahora. Lo que tiene es una espera
// que va creciendo, como el codigo OTP, para que nadie pueda forzarlo a
// base de clics repetidos.
//
// Minutos antes del reenvio numero n: el primero es inmediato, el segundo al
// minuto, luego 10, 30 y 60. A partir del quinto se queda en una hora.
const ESPERA_INDIVIDUAL_MIN = [0, 1, 10, 30, 60];

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
                -- El codigo con el que se creo su validacion. Vive solo en
                -- vi_verified_emails, y sirve para ir a buscar a VI con que
                -- datos se hizo y cuando vence.
                v.validacion_codigo AS validacion_codigo,
                (SELECT MAX(r.created_at) FROM recordatorios_enviados r
                  WHERE r.recipient_id = dr.recipient_id
                    AND r.user_id <=> ?
                    AND r.resultado = 'enviado') AS ultimo_mio,
                (SELECT MAX(r.created_at) FROM recordatorios_enviados r
                  WHERE r.recipient_id = dr.recipient_id
                    AND NOT (r.user_id <=> ?)
                    AND r.resultado = 'enviado') AS ultimo_de_otro
         FROM document_recipients dr
         LEFT JOIN vi_verified_emails v
           ON LOWER(v.email) COLLATE utf8mb4_unicode_ci = LOWER(dr.email) COLLATE utf8mb4_unicode_ci
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
            aviso_otro_usuario: !!otroReciente,
            // Los datos con los que se creo su validacion, para poder
            // revisarlos antes de reenviar: cedula, nombre y vigencia.
            validacion: f.validacion_codigo ? { codigo: f.validacion_codigo } : null
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
 * Pregunta a VI por un lote de codigos de validacion.
 *
 * VI vive en otro contenedor con su propia base. No se consulta esa base
 * directamente: se le pide por su endpoint interno, que es de solo lectura y
 * no devuelve ni el token ni la url de redireccion (con esos dos datos
 * cualquiera podria completar la validacion de otra persona).
 *
 * @param {string[]} codigos  maximo 200 por peticion, es el limite de VI
 * @returns {Promise<object[]>}  las validaciones que VI reconocio
 */
function pedirValidacionesAVI(codigos) {
    const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
    const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
    const url = new URL(`${VI_URL}/validacion/api/firmalegal/validaciones/consultar`);
    const transport = url.protocol === 'https:' ? require('https') : require('http');
    const cuerpo = JSON.stringify({ codigos });

    return new Promise((resolver, rechazar) => {
        const peticion = transport.request({
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Api-Key': VI_API_KEY,
                'Content-Length': Buffer.byteLength(cuerpo)
            }
        }, (respuesta) => {
            let datos = '';
            respuesta.on('data', (trozo) => { datos += trozo; });
            respuesta.on('end', () => {
                if (respuesta.statusCode !== 200) {
                    return rechazar(new Error(`VI respondio ${respuesta.statusCode}`));
                }
                // VI ha devuelto 200 con cuerpo vacio en otras rutas, asi que
                // el estado por si solo no basta: hay que mirar el contenido.
                try {
                    const json = JSON.parse(datos || '{}');
                    const lista = json.validaciones || json.data || json;
                    resolver(Array.isArray(lista) ? lista : []);
                } catch (e) {
                    rechazar(new Error(`VI devolvio algo que no es JSON: ${String(datos).slice(0, 120)}`));
                }
            });
        });
        peticion.on('error', rechazar);
        // Si VI no contesta, el panel no se queda colgado esperandola.
        peticion.setTimeout(8000, () => { peticion.destroy(new Error('VI no respondio en 8 segundos')); });
        peticion.write(cuerpo);
        peticion.end();
    });
}

/**
 * Completa cada persona con los datos de SU validacion: con que nombre y
 * cedula se creo, en que estado esta y cuando vence.
 *
 * Si VI no responde, las personas se devuelven igual pero sin ese detalle, y
 * marcadas con `vi_sin_respuesta`. El panel tiene que seguir sirviendo: saber
 * a quien le falta validar no depende de VI, eso esta en nuestra base.
 */
async function conDatosDeValidacion(personas) {
    const codigos = [...new Set(personas.map(p => p.validacion?.codigo).filter(Boolean))];
    if (!codigos.length) return personas;

    const porCodigo = {};
    let fallo = null;

    // VI acepta 200 codigos por peticion. En la universidad un envio puede
    // tener mas, asi que va por tandas.
    for (let i = 0; i < codigos.length; i += 200) {
        const tanda = codigos.slice(i, i + 200);
        try {
            for (const v of await pedirValidacionesAVI(tanda)) {
                if (v && v.codigo) porCodigo[v.codigo] = v;
            }
        } catch (e) {
            fallo = e.message;
            console.warn(`[RECORDATORIOS] No se pudieron leer las validaciones de VI: ${e.message}`);
            break;
        }
    }

    const ahora = Date.now();
    for (const p of personas) {
        if (!p.validacion) continue;
        const v = porCodigo[p.validacion.codigo];

        if (!v) {
            // O VI no contesto, o ese codigo ya no existe alli. Son dos cosas
            // distintas y la pantalla las dice de forma distinta.
            p.validacion.vi_sin_respuesta = !!fallo;
            p.validacion.no_encontrada = !fallo;
            continue;
        }

        const vence = v.expira_at ? new Date(v.expira_at).getTime() : null;
        const diasRestantes = vence
            ? Math.ceil((vence - ahora) / (24 * 60 * 60 * 1000)) : null;

        p.validacion = {
            codigo: v.codigo,
            nombre: v.nombre_completo || null,
            documento: v.documento || null,
            tipo_documento: v.tipo_documento || null,
            estado: v.estado,
            creada_el: v.created_at || null,
            expira_at: v.expira_at || null,
            dias_restantes: diasRestantes,
            // Una validacion caducada NO se reenvia: hay que crearla de
            // nuevo. Se marca para que la pantalla lo diga claro.
            caducada: diasRestantes !== null && diasRestantes <= 0,
            // Sin cedula la validacion no sirve: el firmante no puede
            // compararse con su documento. Ya paso una vez.
            sin_cedula: !v.documento,
            // El correo con el que VI la creo. Si no coincide con el nuestro,
            // el padre nunca va a recibirla.
            email_vi: v.email_firmante || null
        };
    }

    if (fallo) personas.vi_error = fallo;
    return personas;
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

/**
 * El reenvio INDIVIDUAL: siempre se puede, pero con una espera que crece.
 *
 * No lleva limite de dias a proposito. Si un padre llama diciendo que no le
 * llego el correo, el operador tiene que poder reenviarselo en ese momento,
 * aunque se lo haya mandado ayer. Lo que se evita es el multiclick: que a
 * fuerza de pulsar el boton salgan cinco correos seguidos a la misma persona.
 *
 * La escalera es la misma idea que el codigo OTP: inmediato, 1 min, 10, 30, 60.
 * Se cuentan los reenvios de las ultimas 24 horas de ESE usuario a ESA persona.
 *
 * @returns {Promise<{puede:boolean, faltan_segundos:number, intentos:number}>}
 */
async function esperaIndividual(db, recipientId, userId) {
    try {
        const [filas] = await db.promise().query(
            `SELECT COUNT(*) AS intentos, MAX(created_at) AS ultimo
             FROM recordatorios_enviados
             WHERE recipient_id = ? AND user_id <=> ?
               AND resultado = 'enviado'
               AND created_at >= NOW() - INTERVAL 24 HOUR`,
            [recipientId, userId || null]
        );

        const intentos = filas[0]?.intentos || 0;
        const ultimo = filas[0]?.ultimo;
        if (!intentos || !ultimo) return { puede: true, faltan_segundos: 0, intentos: 0 };

        // El minuto de espera que toca segun cuantos van
        const minutos = ESPERA_INDIVIDUAL_MIN[
            Math.min(intentos, ESPERA_INDIVIDUAL_MIN.length - 1)
        ];
        const transcurrido = Math.floor((Date.now() - new Date(ultimo).getTime()) / 1000);
        const espera = minutos * 60;

        if (transcurrido >= espera) return { puede: true, faltan_segundos: 0, intentos };
        return { puede: false, faltan_segundos: espera - transcurrido, intentos };

    } catch (e) {
        // Ante la duda no se envia: es peor repetirle a un padre que saltarse uno.
        console.warn(`[RECORDATORIOS] No se pudo calcular la espera de ${recipientId}: ${e.message}`);
        return { puede: false, faltan_segundos: 60, intentos: 0 };
    }
}

module.exports = {
    estadoDocumento, registrar, sePuedeEnviar, esperaIndividual,
    conDatosDeValidacion,
    DIAS_ENTRE_RECORDATORIOS, ESPERA_INDIVIDUAL_MIN
};
