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

// El limite del reenvio MASIVO: cuantos correos puede recibir UNA persona al
// dia. Ahi salen decenas de golpe desde el mismo remitente -40 pagares son 80
// correos- y eso es lo que dispara los filtros de spam.
//
// Se cuenta POR PERSONA, no por documento: lo que molesta a un padre es
// recibir cuatro correos suyos, no que el operador haga varias tandas. Asi el
// operador puede lanzar una segunda tanda el mismo dia para alcanzar a quien
// quedo fuera, sin repetirsela a quien ya la recibio dos veces.
const ENVIOS_POR_DIA = 2;

// Y se mira en una ventana MOVIL de 24 horas, no en el dia de calendario. Con
// el dia natural se podrian mandar 2 a las 23:00 y otros 2 a las 00:30: cuatro
// correos en hora y media, que es justo lo que se quiere evitar.
const VENTANA_HORAS = 24;

// El reenvio INDIVIDUAL no tiene limite de dias: si un padre llama diciendo
// que no le llego, hay que poder mandarselo ahora. Lo que tiene es una espera
// que va creciendo, como el codigo OTP, para que nadie pueda forzarlo a
// base de clics repetidos.
//
// Minutos antes del reenvio numero n: el primero es inmediato, el segundo al
// minuto, luego 10, 30 y 60. A partir del quinto se queda en una hora.
const ESPERA_INDIVIDUAL_MIN = [0, 1, 10, 30, 60];

// El tope del reenvio individual en 24 horas.
//
// La escalera sola no bastaba: pasados 60 minutos se podia reenviar otra vez,
// y otra, sin fin. Una persona llego a tener seis correos de validacion.
//
// Seis deja sitio de sobra para atender a un padre que llama varias veces en
// un dia, y corta el goteo. Es mas que los 2 del masivo a proposito: el
// individual es una respuesta a alguien que pide ayuda, no una campana.
const MAX_INDIVIDUAL_DIA = 6;

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
                -- El codigo esta en dos sitios: las pendientes (creadas y sin
                -- completar) y las ya completadas. Manda la pendiente, que es
                -- la ultima que se le creo.
                COALESCE(vp.validacion_codigo, v.validacion_codigo) AS validacion_codigo,
                -- EL LIMITE ES POR PERSONA, NO POR FILA.
                --
                -- Un padre con dos hijos aparece dos veces -una por pagare-,
                -- con recipient_id distinto. Contando por fila recibia el
                -- doble de correos que los demas, y en el panel uno podia
                -- reenviarse mientras los otros esperaban. El correo es lo
                -- que ve quien lo recibe, asi que es lo que se cuenta.
                (SELECT MAX(r.created_at) FROM recordatorios_enviados r
                  JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
                  WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci =
                        LOWER(dr.email) COLLATE utf8mb4_unicode_ci
                    AND r.user_id <=> ?
                    AND r.resultado = 'enviado') AS ultimo_mio,
                -- Cuantos lleva en las ultimas 24 horas, que es el limite.
                --
                -- Solo los de VALIDACION -crear o reenviar-: el enlace de
                -- firma lleva su propia cuenta, y gastar el cupo de uno con
                -- el otro no tiene sentido.
                (SELECT COUNT(*) FROM recordatorios_enviados r
                  JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
                  WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci =
                        LOWER(dr.email) COLLATE utf8mb4_unicode_ci
                    AND r.user_id <=> ?
                    AND r.resultado = 'enviado'
                    AND r.tipo IN ('validacion', 'validacion_reenvio')
                    AND r.created_at >= NOW() - INTERVAL ? HOUR) AS envios_hoy,
                -- Separados, porque enviar y reenviar no comparten limite.
                (SELECT COUNT(*) FROM recordatorios_enviados r
                  JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
                  WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci =
                        LOWER(dr.email) COLLATE utf8mb4_unicode_ci
                    AND r.user_id <=> ? AND r.resultado = 'enviado'
                    AND r.tipo = 'validacion'
                    AND r.created_at >= NOW() - INTERVAL ? HOUR) AS envios_crear,
                (SELECT COUNT(*) FROM recordatorios_enviados r
                  JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
                  WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci =
                        LOWER(dr.email) COLLATE utf8mb4_unicode_ci
                    AND r.user_id <=> ? AND r.resultado = 'enviado'
                    AND r.tipo = 'validacion_reenvio'
                    AND r.created_at >= NOW() - INTERVAL ? HOUR) AS envios_reenvio,
                -- Los de FIRMA, con su propia cuenta.
                --
                -- Validacion y firma son independientes: gastar el cupo de
                -- validacion no puede impedir mandar el enlace de firma a
                -- quien acaba de validarse. Pasaba: los dos botones se
                -- bloqueaban juntos porque compartian este contador.
                (SELECT COUNT(*) FROM recordatorios_enviados r
                  JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
                  WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci =
                        LOWER(dr.email) COLLATE utf8mb4_unicode_ci
                    AND r.user_id <=> ? AND r.resultado = 'enviado'
                    AND r.tipo = 'firma'
                    AND r.created_at >= NOW() - INTERVAL ? HOUR) AS envios_firma,
                -- CUANDO VUELVE A TENER HUECO.
                --
                -- No es cuando sale el mas viejo: es cuando salen los
                -- suficientes para bajar del limite. Con 4 correos y un
                -- limite de 2, hacen falta que salgan TRES. Decir el del mas
                -- viejo prometia un hueco que al llegar no existia.
                --
                -- Se toma el enesimo mas antiguo, con N = sobrantes + 1.
                (SELECT r.created_at FROM recordatorios_enviados r
                  JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
                  WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci =
                        LOWER(dr.email) COLLATE utf8mb4_unicode_ci
                    AND r.user_id <=> ?
                    AND r.resultado = 'enviado'
                    AND r.tipo IN ('validacion', 'validacion_reenvio')
                    AND r.created_at >= NOW() - INTERVAL ? HOUR
                  ORDER BY r.created_at
                  LIMIT 1 OFFSET ${Math.max(0, ENVIOS_POR_DIA - 1)}) AS mas_viejo_mio,
                (SELECT MAX(r.created_at) FROM recordatorios_enviados r
                  JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
                  WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci =
                        LOWER(dr.email) COLLATE utf8mb4_unicode_ci
                    AND NOT (r.user_id <=> ?)
                    AND r.resultado = 'enviado') AS ultimo_de_otro
         FROM document_recipients dr
         LEFT JOIN vi_verified_emails v
           ON LOWER(v.email) COLLATE utf8mb4_unicode_ci = LOWER(dr.email) COLLATE utf8mb4_unicode_ci
         LEFT JOIN vi_validaciones_pendientes vp
           ON LOWER(vp.email) COLLATE utf8mb4_unicode_ci = LOWER(dr.email) COLLATE utf8mb4_unicode_ci
         WHERE dr.document_id = ?
         ORDER BY dr.viewer_group_id, dr.signing_order`,
        [userId, userId, VENTANA_HORAS,
         userId, VENTANA_HORAS, userId, VENTANA_HORAS,
         userId, VENTANA_HORAS,
         userId, VENTANA_HORAS, userId, documentId]
    );

    const ahora = Date.now();
    const ventana = VENTANA_HORAS * 60 * 60 * 1000;

    const sinValidar = [], sinFirmar = [], firmados = [];

    for (const f of filas) {
        // Puede recibir otro si lleva menos de ENVIOS_POR_DIA en la ventana.
        //
        // Se mira el contador de LA ACCION QUE LE TOCA. A quien no tiene
        // validacion viva le toca CREAR, asi que sus reenvios de ayer no le
        // frenan; a quien si la tiene le toca REENVIAR y cuentan los suyos.
        // Antes compartian limite y dos reenvios impedian crear.
        const llevaCrear = Number(f.envios_crear) || 0;
        const llevaReenvio = Number(f.envios_reenvio) || 0;
        const llevaHoy = Number(f.envios_hoy) || 0;
        // Se rellena mas abajo, cuando se sepa si su validacion sigue viva.
        let puede = llevaHoy < ENVIOS_POR_DIA;

        // Cuando vuelve a tener hueco: al caducar el mas viejo de los que
        // ocupan la ventana. Como es movil, no hay que esperar a medianoche.
        let faltanSegundos = 0;
        if (!puede && f.mas_viejo_mio) {
            const caduca = new Date(f.mas_viejo_mio).getTime() + ventana;
            faltanSegundos = Math.max(0, Math.ceil((caduca - ahora) / 1000));
        }

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
            envios_hoy: llevaHoy,
            // Por accion, para decidir mas abajo cual es el que frena.
            envios_crear: llevaCrear,
            envios_reenvio: llevaReenvio,
            envios_firma: Number(f.envios_firma) || 0,
            // Lo que falta para volver a tener hueco, en segundos. La
            // pantalla lo convierte a horas o minutos segun cuanto sea.
            faltan_segundos: faltanSegundos,
            aviso_otro_usuario: !!otroReciente,
            // Los datos con los que se creo su validacion, para poder
            // revisarlos antes de reenviar: cedula, nombre y vigencia.
            validacion: f.validacion_codigo ? { codigo: f.validacion_codigo } : null
        };

        if (f.status === 'completed') {
            firmados.push({ ...persona, firmado_el: f.completed_at });
        } else if (!f.vi_validated_at) {
            // Quien no ha validado se divide en dos, porque son dos acciones
            // distintas: a quien no tiene validacion hay que CREARSELA; a quien
            // ya tiene una, solo REENVIARLE el correo. Una validacion nueva
            // llega con otro codigo y otra fecha de vencimiento, asi que
            // crearle una segunda a quien ya tiene seria un error.
            // Lo que diga nuestra tabla es solo un punto de partida: no sabe
            // si esa validacion sigue viva. Lo decide VI, mas abajo.
            persona.tiene_validacion = !!f.validacion_codigo;
            sinValidar.push(persona);
        } else {
            // Valido pero no ha firmado: a estos les toca el enlace de firma,
            // asi que su limite es el de FIRMA, no el de validacion.
            const deFirma = Number(f.envios_firma) || 0;
            sinFirmar.push({
                ...persona,
                validado_el: f.vi_validated_at,
                puede_reenviarse: deFirma < ENVIOS_POR_DIA,
                envios_hoy: deFirma,
                faltan_segundos: deFirma < ENVIOS_POR_DIA ? 0 : persona.faltan_segundos
            });
        }
    }

    // Quien tiene validacion no se puede saber solo con nuestras tablas: el
    // operador puede crearla desde el panel de VI y ahi no nos enteramos.
    // Se le pregunta a VI por correo, que es lo unico fiable.
    //
    // Si VI no responde, se usa lo que haya en nuestras tablas: el panel
    // sigue funcionando, aunque el reparto entre enviar y reenviar quede
    // menos fino.
    try {
        const pendientes = [...sinValidar];
        if (pendientes.length) {
            const _estado = require('./estado-validacion');
            const comoDestinatarios = pendientes.map(p => ({ email: p.email }));
            await _estado.soloValidaciones(comoDestinatarios);
            pendientes.forEach((p, i) => {
                // LO QUE DIGA VI MANDA, EN LOS DOS SENTIDOS.
                //
                // Antes esto solo ponia `true`, nunca `false`: si nuestra
                // tabla tenia un codigo y VI decia que esa validacion estaba
                // anulada, el `true` de arriba se quedaba y el panel ofrecia
                // REENVIAR algo que ya no existe.
                //
                // Paso el 06-10-2026: se anularon las quince validaciones de
                // DEV y el panel seguia diciendo 'Reenviar validaciones (1)'.
                p.tiene_validacion = _estado.estaViva(comoDestinatarios[i].validacion);

                // Y AHORA EL LIMITE.
                //
                // SI SU VALIDACION YA NO SIRVE, LA CUENTA EMPIEZA DE CERO.
                //
                // A quien se le anulo o se le vencio la validacion le toca
                // CREAR otra, y los correos que se le mandaron antes no deben
                // frenarlo: todos llevaban al enlace que acaba de morir.
                // Frenar por ellos no protege a nadie, solo impide mandarle el
                // unico que ya le serviria.
                //
                // CON VALIDACION VIVA SE CUENTAN TODOS SUS CORREOS DE
                // VALIDACION, no solo los marcados como reenvio. Lo que
                // importa es cuantos ha recibido esa persona, no con que
                // etiqueta se grabaron. Contando solo los reenvios se podia
                // reenviar sin fin, porque los primeros envios estaban como
                // 'validacion' y no frenaban nada.
                if (!p.tiene_validacion) {
                    p.puede_reenviarse = true;
                    p.envios_hoy = 0;
                    p.faltan_segundos = 0;
                } else {
                    const suyos = p.envios_crear + p.envios_reenvio;
                    p.puede_reenviarse = suyos < ENVIOS_POR_DIA;
                    p.envios_hoy = suyos;
                    if (p.puede_reenviarse) p.faltan_segundos = 0;
                }
            });
        }
    } catch (e) {
        console.warn(`[RECORDATORIOS] No se pudo consultar VI: ${e.message}`);
    }

    return {
        resumen: {
            total: filas.length,
            sin_validar: sinValidar.length,
            validados_sin_firmar: sinFirmar.length,
            firmados: firmados.length,
            // Cuantos se pueden reenviar AHORA, que es lo que se va a mandar
            validaciones_enviables: sinValidar.filter(p => p.puede_reenviarse).length,
            // Y separados, para los dos botones: crear las que no existen no
            // es lo mismo que reenviar las que si.
            validaciones_por_crear: sinValidar.filter(p => p.puede_reenviarse && !p.tiene_validacion).length,
            validaciones_por_reenviar: sinValidar.filter(p => p.puede_reenviarse && p.tiene_validacion).length,
            // El total de cada grupo, se puedan enviar hoy o no
            sin_validacion_creada: sinValidar.filter(p => !p.tiene_validacion).length,
            con_validacion_creada: sinValidar.filter(p => p.tiene_validacion).length,
            firmas_enviables: sinFirmar.filter(p => p.puede_reenviarse).length,
            // Los que estan en espera por el limite de dias
            en_espera: [...sinValidar, ...sinFirmar].filter(p => !p.puede_reenviarse).length,
            // CUANDO fue el ultimo envio y CUANTO falta, para poder decirlo en
            // vez de 'recordatorios de hoy': la ventana es de 24 horas
            // rodantes, asi que un envio de ayer por la tarde sigue contando y
            // decir 'hoy' hacia pensar que el dato estaba mal.
            ultimo_envio: [...sinValidar, ...sinFirmar]
                .filter(p => !p.puede_reenviarse && p.ultimo_recordatorio)
                .map(p => p.ultimo_recordatorio)
                .sort().pop() || null,
            // Lo que falta al que antes vuelve a tener hueco.
            espera_min_segundos: (() => {
                const esperas = [...sinValidar, ...sinFirmar]
                    .filter(p => !p.puede_reenviarse && p.faltan_segundos > 0)
                    .map(p => p.faltan_segundos);
                return esperas.length ? Math.min(...esperas) : 0;
            })()
        },
        sin_validar: sinValidar,
        sin_firmar: sinFirmar,
        firmados
    };
}

/**
 * Completa cada persona con los datos de SU validacion: con que nombre y
 * cedula se creo, en que estado esta, cuando vence y cuantos intentos lleva.
 *
 * Se delega en `estado-validacion`, que pregunta a VI POR CORREO.
 *
 * Antes se preguntaba por codigo, y eso dejaba fuera a quien tenia la
 * validacion creada desde el panel de VI: nosotros no teniamos su codigo, asi
 * que el informe decia "se crea nueva" cuando en realidad habia que reenviar.
 *
 * Si VI no responde, las personas se devuelven igual pero marcadas con
 * `vi_sin_respuesta`. El panel tiene que seguir sirviendo: saber a quien le
 * falta validar no depende de VI, eso esta en nuestra base.
 */
async function conDatosDeValidacion(personas) {
    if (!Array.isArray(personas) || !personas.length) return personas;

    try {
        const _estado = require('./estado-validacion');
        const consulta = personas.map(p => ({ email: p.email }));
        await _estado.soloValidaciones(consulta);

        personas.forEach((p, i) => {
            // La anulada SI se conserva: la pantalla tiene que poder decir
            // que fue cancelada en vez de callarse. Lo que no hace es
            // contar como validacion viva.
            const v = consulta[i].validacion;
            p.validacion = (v && v.codigo) ? v : null;
        });
    } catch (e) {
        console.warn(`[RECORDATORIOS] No se pudieron leer las validaciones de VI: ${e.message}`);
        personas.vi_error = e.message;
        for (const p of personas) {
            p.validacion = p.validacion || { vi_sin_respuesta: true };
        }
    }
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
 * Si se le puede mandar un correo de VALIDACION ahora mismo.
 *
 * Es `sePuedeEnviar` pero sabiendo en que estado esta su validacion, porque
 * eso cambia el limite:
 *
 *   sin validacion viva  la cuenta empieza de cero. Le toca que le creen
 *                        otra, y los correos de antes llevaban al enlace
 *                        que acaba de morir: frenar por ellos no protege a
 *                        nadie, solo impide mandarle el que si sirve.
 *   con validacion viva  cuentan sus reenvios, hasta ENVIOS_POR_DIA.
 *
 * @param {object} db
 * @param {number} recipientId
 * @param {number} userId
 * @param {string} email  para preguntarle a VI
 * @returns {Promise<boolean>}
 */
async function sePuedeEnviarValidacion(db, recipientId, userId, email) {
    let viva = false;
    try {
        const _estado = require('./estado-validacion');
        const consulta = [{ email }];
        await _estado.soloValidaciones(consulta);
        viva = _estado.estaViva(consulta[0].validacion);
    } catch (e) {
        // Si VI no contesta se aplica el limite de siempre, que es lo
        // prudente: es peor repetirle a un padre que saltarse uno.
        console.warn(`[RECORDATORIOS] No se pudo consultar VI: ${e.message}`);
        return sePuedeEnviar(db, recipientId, userId);
    }
    if (!viva) return true;

    // SE CUENTAN TODOS LOS CORREOS DE VALIDACION DE LAS ULTIMAS 24 HORAS.
    //
    // Da igual con que etiqueta se grabaron: lo que protege al firmante es
    // cuantos correos le han llegado, no como los llamamos nosotros.
    // Contando solo `validacion_reenvio` se podia reenviar sin fin, porque
    // los primeros envios estaban como `validacion` y no frenaban nada.
    //
    // Tampoco se corta por la fecha de la validacion: al crearle una nueva,
    // esa fecha es POSTERIOR a los correos que ya recibio, asi que el corte
    // los descartaba todos y el limite no llegaba a aplicarse nunca. La
    // ventana de 24 horas ya hace ese trabajo.
    return sePuedeEnviar(db, recipientId, userId,
        ['validacion', 'validacion_reenvio']);
}

/**
 * Comprueba si a esta persona se le puede escribir ahora, por este usuario.
 * Se consulta otra vez en el momento del envio, no solo al pintar la pantalla:
 * entre que el operador abre el panel y pulsa el boton pueden pasar minutos, y
 * en una tanda larga el mismo destinatario podria repetirse.
 */
async function sePuedeEnviar(db, recipientId, userId, tipos = null, desde = null) {
    // Una lista separada por comas para FIND_IN_SET, o null para todos.
    const lista = tipos
        ? (Array.isArray(tipos) ? tipos.join(',') : String(tipos))
        : null;
    try {
        // Se cuenta POR CORREO, no por fila: una persona con dos pagares
        // tiene dos recipient_id y recibiria el doble de correos.
        //
        // Y POR ACCION: crear una validacion, reenviarla y mandar el enlace
        // de firma son tres cosas distintas, con su propia cuenta de dos al
        // dia. Antes compartian limite, asi que dos reenvios consumian el
        // cupo de poder crear.
        //
        // `desde` descarta lo anterior a una fecha. Se usa cuando la
        // validacion de esa persona se anulo: los correos que se le mandaron
        // antes llevaban a un enlace que ya no existe, asi que frenar por
        // ellos no protege a nadie; solo impide mandarle el que si sirve.
        const [filas] = await db.promise().query(
            `SELECT COUNT(*) AS llevan
             FROM recordatorios_enviados r
             JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
             WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci = (
                     SELECT LOWER(email) COLLATE utf8mb4_unicode_ci
                     FROM document_recipients WHERE recipient_id = ?)
               AND r.user_id <=> ? AND r.resultado = 'enviado'
               AND r.created_at >= NOW() - INTERVAL ? HOUR
               AND (? IS NULL OR FIND_IN_SET(r.tipo, ?))
               AND (? IS NULL OR r.created_at > ?)`,
            [recipientId, userId || null, VENTANA_HORAS,
             lista, lista, desde, desde]
        );
        return (Number(filas[0]?.llevan) || 0) < ENVIOS_POR_DIA;
    } catch (e) {
        // Ante la duda, NO enviar: es peor repetirle a un padre que saltarse uno.
        console.warn(`[RECORDATORIOS] No se pudo comprobar el limite de ${recipientId}: ${e.message}`);
        return false;
    }
}

/**
 * El reenvio INDIVIDUAL: una espera que crece, y un tope al dia.
 *
 * Es mas permisivo que el masivo a proposito. Si un padre llama diciendo que
 * no le llego el correo, el operador tiene que poder reenviarselo en ese
 * momento, aunque se lo haya mandado ayer.
 *
 * Pero no infinito. La escalera sola -1 min, 10, 30, 60- solo frena el
 * multiclick: pasada la ultima espera se podia reenviar indefinidamente, y una
 * persona acabo con seis correos de validacion. Ahora hay un tope de
 * MAX_INDIVIDUAL_DIA en 24 horas.
 *
 * Se cuentan los reenvios de las ultimas 24 horas de ESE usuario a ESA persona.
 *
 * @returns {Promise<{puede:boolean, faltan_segundos:number, intentos:number,
 *                    tope_alcanzado?:boolean}>}
 */
async function esperaIndividual(db, recipientId, userId) {
    try {
        // Por correo, como el resto: lo que cuenta es cuantos correos le
        // han llegado a esa persona, no a cual de sus filas.
        const [filas] = await db.promise().query(
            `SELECT COUNT(*) AS intentos, MAX(r.created_at) AS ultimo
             FROM recordatorios_enviados r
             JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
             WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci = (
                     SELECT LOWER(email) COLLATE utf8mb4_unicode_ci
                     FROM document_recipients WHERE recipient_id = ?)
               AND r.user_id <=> ?
               AND r.resultado = 'enviado'
               AND r.created_at >= NOW() - INTERVAL 24 HOUR`,
            [recipientId, userId || null]
        );

        const intentos = filas[0]?.intentos || 0;
        const ultimo = filas[0]?.ultimo;
        if (!intentos || !ultimo) return { puede: true, faltan_segundos: 0, intentos: 0 };

        // El tope del dia. Lo que falta ya no es un minuto: es hasta que el
        // primero de los envios salga de la ventana de 24 horas.
        if (intentos >= MAX_INDIVIDUAL_DIA) {
            const [primero] = await db.promise().query(
                `SELECT MIN(r.created_at) AS primero
                 FROM recordatorios_enviados r
                 JOIN document_recipients d2 ON d2.recipient_id = r.recipient_id
                 WHERE LOWER(d2.email) COLLATE utf8mb4_unicode_ci = (
                         SELECT LOWER(email) COLLATE utf8mb4_unicode_ci
                         FROM document_recipients WHERE recipient_id = ?)
                   AND r.user_id <=> ?
                   AND r.resultado = 'enviado'
                   AND r.created_at >= NOW() - INTERVAL 24 HOUR`,
                [recipientId, userId || null]
            );
            const desde = primero[0]?.primero ? new Date(primero[0].primero).getTime() : Date.now();
            const faltan = Math.max(60, Math.ceil((desde + 24 * 3600e3 - Date.now()) / 1000));
            return { puede: false, faltan_segundos: faltan, intentos, tope_alcanzado: true };
        }

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
    estadoDocumento, registrar, sePuedeEnviar, sePuedeEnviarValidacion,
    esperaIndividual,
    conDatosDeValidacion,
    ENVIOS_POR_DIA, VENTANA_HORAS, ESPERA_INDIVIDUAL_MIN, MAX_INDIVIDUAL_DIA
};
