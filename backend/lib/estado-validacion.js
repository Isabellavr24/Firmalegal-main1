// Que se sabe de la validacion de identidad de cada firmante de un pagare.
//
// POR QUE EXISTE ESTE ARCHIVO:
//
// Hoy mandar una validacion es una caja negra. Se envia y despues no hay forma
// de saber, desde la pantalla, si llego, si la abrieron, si lo intentaron ni
// por que fallo. Esa informacion EXISTE -esta en la base de Validacion de
// Identidad- pero solo se llega a ella entrando al servidor a consultarla.
//
// Eso se nota cada vez que un padre escribe diciendo que algo no le funciona.
// En una sola semana hubo tres casos y los tres necesitaron una consulta
// manual: una señora que ya habia validado y lo que fallaba era otra cosa, otra
// con cuatro intentos de los que tres fueron caidas del servicio, y una tercera
// con el enlace mal formado.
//
// Este modulo junta lo que hace falta para que eso se vea en pantalla, al lado
// de la persona.
//
// SOLO SIRVE PARA PAGARES: los datos del firmante (cedula, nombre, celular)
// salen del CSV, y el CSV solo existe en pagares. Para documentos normales la
// parte de intentos y estado SI es trasladable; la del CSV no.

const _datosFirmante = require('./datos-del-firmante');

// Lo que hace falta para que una validacion sirva de algo.
//
// Sin cedula no hay nada contra que comparar. Sin celular no llega el codigo
// OTP. Ya paso: el 1 de octubre se estuvieron creando validaciones sin ninguna
// de las dos y nadie lo vio hasta que un padre no pudo validarse.
function queFalta(datos) {
    const falta = [];
    if (!datos.documento) falta.push('cedula');
    if (!datos.celular) falta.push('celular');
    return falta;
}

/**
 * Completa cada destinatario con lo que se sabe de su validacion.
 *
 * Son tres fuentes distintas:
 *   1. `field_values`      — los datos de su CSV (cedula, nombre, celular)
 *   2. `vi_verified_emails`— el codigo de la validacion que se le creo
 *   3. VI, por su endpoint — el estado, la vigencia y los intentos
 *
 * Las dos primeras son nuestras y siempre estan. La tercera depende de que VI
 * responda: si no lo hace, se devuelve lo que si se sabe y se marca que falta
 * el detalle, en vez de dejar la pantalla sin nada.
 *
 * @param {object} db            pool de mysql2
 * @param {object[]} destinatarios  las filas tal como salen del endpoint
 * @returns {Promise<object[]>}  los mismos, con `validacion` anadido
 */
async function conEstadoDeValidacion(db, destinatarios) {
    if (!Array.isArray(destinatarios) || !destinatarios.length) return destinatarios;

    // --- 1. Los datos del CSV, uno por uno ---
    for (const d of destinatarios) {
        // Solo los pagares tienen CSV. En un documento normal esto no aplica y
        // se deja sin datos en vez de inventarlos.
        if (!d.viewer_group_id) { d.datos_csv = null; continue; }

        try {
            const datos = await _datosFirmante.datosDeFirmanteDesdeBD(db, d.id, d.email);
            d.datos_csv = {
                documento: datos.documento,
                nombre: datos.nombre,
                celular: datos.celular,
                // Lo que impide enviar, si algo impide
                falta: queFalta(datos),
                // Por que no se pudo emparejar, cuando no se pudo. Va a la
                // pantalla tal cual, asi que esta escrito para leerlo.
                motivo: datos.motivo || null
            };
        } catch (e) {
            console.warn(`[VALIDACION] No se pudieron leer los datos de ${d.email}: ${e.message}`);
            d.datos_csv = null;
        }
    }

    // --- 2. El estado de su validacion, preguntandoselo a VI POR CORREO ---
    //
    // Se pregunta por el CORREO y no por el codigo a proposito: el operador
    // puede crear la validacion desde el panel de VI, y en ese caso nosotros
    // no tenemos su codigo guardado. Preguntando por el correo nos enteramos
    // igual, se haya creado por donde se haya creado.
    //
    // El correo es ademas el ancla natural: es lo que identifica al firmante
    // en los dos sistemas.
    const correos = [...new Set(
        destinatarios.map(d => String(d.email || '').toLowerCase()).filter(Boolean))];

    for (const d of destinatarios) d.validacion = null;

    if (correos.length) {
        try {
            const porCorreo = await _pedirAVI(correos);
            const ahora = Date.now();

            for (const d of destinatarios) {
                const v = porCorreo[String(d.email || '').toLowerCase()];
                if (!v) continue;

                const vence = v.expira_at ? new Date(v.expira_at).getTime() : null;
                const dias = vence ? Math.ceil((vence - ahora) / 86400000) : null;

                d.validacion = {
                    codigo: v.codigo,
                    estado: v.estado,
                    nombre: v.nombre_completo || null,
                    documento: v.documento || null,
                    tipo_documento: v.tipo_documento || null,
                    creada_el: v.created_at || null,
                    expira_at: v.expira_at || null,
                    dias_restantes: dias,
                    caducada: dias !== null && dias <= 0,
                    // Los intentos: distinguen a quien no le llego el correo de
                    // quien lo abrio y no consigue completarlo.
                    intentos: v.intentos != null ? Number(v.intentos) : null,
                    // Con que datos se creo de verdad. Si no coinciden con los
                    // del pagare, algo se cruzo al crearla.
                    email_vi: v.email_firmante || null
                };
            }
        } catch (e) {
            console.warn(`[VALIDACION] VI no respondio: ${e.message}`);
            // La pantalla tiene que seguir sirviendo aunque VI este caido: se
            // marca que falta el detalle en vez de dejarla sin nada.
            for (const d of destinatarios) d.validacion = { vi_sin_respuesta: true };
        }
    }
    return destinatarios;
}

/**
 * Pregunta a VI por las validaciones de un lote de CORREOS.
 *
 * Se pide por su endpoint interno, no leyendo su base: es de solo lectura y no
 * devuelve el token ni la url de redireccion, que permitirian completar la
 * validacion de otra persona.
 *
 * @param {string[]} correos  en minusculas, maximo 200 por peticion
 * @returns {Promise<object>} un mapa correo -> validacion
 */
function _pedirAVI(correos) {
    const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
    const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
    const url = new URL(`${VI_URL}/validacion/api/firmalegal/validaciones/consultar`);
    const transporte = url.protocol === 'https:' ? require('https') : require('http');

    // 200 es el limite de VI por peticion.
    const cuerpo = JSON.stringify({ emails: correos.slice(0, 200) });

    return new Promise((resolver, rechazar) => {
        const peticion = transporte.request({
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
            respuesta.on('data', t => { datos += t; });
            respuesta.on('end', () => {
                if (respuesta.statusCode !== 200) {
                    return rechazar(new Error(`VI respondio ${respuesta.statusCode}`));
                }
                // VI ha devuelto 200 con cuerpo vacio en otras rutas, asi que el
                // estado por si solo no basta: hay que mirar el contenido.
                let lista;
                try {
                    const json = JSON.parse(datos || '{}');
                    lista = json.validaciones || json.data || json;
                } catch (e) {
                    return rechazar(new Error('VI devolvio algo que no es JSON'));
                }
                if (!Array.isArray(lista)) {
                    return rechazar(new Error('VI devolvio un formato inesperado'));
                }

                const porCorreo = {};
                for (const v of lista) {
                    if (v && v.email_firmante) {
                        porCorreo[String(v.email_firmante).toLowerCase()] = v;
                    }
                }
                resolver(porCorreo);
            });
        });
        peticion.on('error', rechazar);
        // Si VI no contesta, la pantalla no se queda colgada esperandola.
        peticion.setTimeout(8000, () => peticion.destroy(new Error('VI no respondio en 8 segundos')));
        peticion.write(cuerpo);
        peticion.end();
    });
}

module.exports = { conEstadoDeValidacion, queFalta };
