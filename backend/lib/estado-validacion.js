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

    // --- 2. El estado de su validacion, preguntandoselo a VI ---
    //
    // SE PIDE POR CODIGO CUANDO LO TENEMOS, Y POR CORREO CUANDO NO.
    //
    // Una persona puede tener VARIAS validaciones en VI. Pasa cada vez que
    // se corrige la informacion: la correccion crea una validacion nueva y
    // la vieja se queda ahi. Preguntando solo por el correo, VI nos da la
    // que ella elija -la mas reciente- que no tiene por que ser la que
    // nosotros le mandamos a esa persona.
    //
    // Eso se vio en DEV: diegoarrietaherrera8 tenia la corregida del 02/10
    // (cedula 1062427399) y otra del 03/10 con los datos del CSV sin
    // corregir (79458213). La pantalla ensenaba la del CSV, asi que la
    // correccion parecia no haberse guardado.
    //
    // El codigo que guardamos es el de la validacion que de verdad se envio,
    // asi que esa es la que manda. El correo se sigue usando para quien no
    // esta en nuestra tabla: las creadas desde el panel de VI.
    const correos = [...new Set(
        destinatarios.map(d => String(d.email || '').toLowerCase()).filter(Boolean))];

    for (const d of destinatarios) d.validacion = null;

    if (correos.length) {
        try {
            const porCorreo = await _pedirAVI(correos);

            // Y encima de eso, la que nosotros registramos para cada uno.
            if (db) {
                try {
                    const m = correos.map(() => '?').join(',');
                    const [nuestras] = await db.promise().query(
                        `SELECT email, validacion_codigo
                         FROM vi_validaciones_pendientes
                         WHERE email COLLATE utf8mb4_unicode_ci IN (${m})`,
                        correos
                    );
                    const codigosNuestros = nuestras
                        .map(n => n.validacion_codigo).filter(Boolean);

                    if (codigosNuestros.length) {
                        const porCodigo = await _pedirAVI(null, codigosNuestros);
                        // Cada correo se queda con SU validacion, no con la
                        // que VI eligiera.
                        for (const n of nuestras) {
                            const correo = String(n.email).toLowerCase();
                            const suya = porCodigo[String(n.validacion_codigo)];
                            if (!suya) continue;

                            // VI puede tener OTRA validacion para el mismo
                            // correo: pasa cuando se corrige la informacion,
                            // porque la correccion crea una nueva en vez de
                            // editar la que habia.
                            const deVI = porCorreo[correo];

                            // SI LA NUESTRA ESTA ANULADA, NO MANDA.
                            //
                            // Una anulada no sirve para nada, asi que preferirla
                            // sobre una viva deja la pantalla diciendo
                            // 'cancelada' cuando esa persona ya tiene otra
                            // validacion en marcha. Paso el 05/10: se anularon
                            // las dos de un correo, se creo una tercera con los
                            // datos corregidos, y la pantalla seguia ensenando
                            // la anulada porque era la que teniamos guardada.
                            if (!estaViva(suya) && estaViva(deVI)) {
                                // Y se apunta la nueva, o en la siguiente
                                // consulta volveriamos a preferir la anulada.
                                // Sin esto el operador ve la pantalla mal cada
                                // vez que corrige algo.
                                // El documento va con el codigo: si no, la
                                // fila se queda apuntando al pagare viejo y
                                // la pantalla dice 'es de otro pagare' sobre
                                // el pagare en el que se esta mirando.
                                db.promise().query(
                                    `INSERT INTO vi_validaciones_pendientes
                                       (email, validacion_codigo, document_id)
                                     VALUES (?, ?, ?)
                                     ON DUPLICATE KEY UPDATE
                                       validacion_codigo = VALUES(validacion_codigo),
                                       document_id = VALUES(document_id),
                                       created_at = CURRENT_TIMESTAMP`,
                                    [correo, deVI.codigo,
                                     (destinatarios.find(x =>
                                        String(x.email || '').toLowerCase() === correo
                                      ) || {}).document_id || null]
                                ).catch(e => console.warn(
                                    `[VALIDACION] No se pudo apuntar la validacion nueva de ${correo}: ${e.message}`));
                                continue;
                            }

                            // Fuera de ese caso manda la nuestra: es la que de
                            // verdad se le envio a esa persona. Pero si la otra
                            // tiene datos distintos hay que decirlo, o el
                            // operador corrige, ve los datos viejos y cree que
                            // no se guardo.
                            if (deVI && deVI.codigo && deVI.codigo !== suya.codigo) {
                                suya.otra_validacion = {
                                    codigo: deVI.codigo,
                                    documento: deVI.documento || null,
                                    nombre: deVI.nombre_completo || null,
                                    creada_el: deVI.created_at || null,
                                    // Si los datos coinciden es un duplicado
                                    // sin consecuencias; si no, una de las dos
                                    // esta mal y hay que mirarla.
                                    datos_distintos:
                                        String(deVI.documento || '') !== String(suya.documento || '')
                                };
                            }
                            porCorreo[correo] = suya;
                        }
                    }
                } catch (e) {
                    // Si esto falla queda lo que VI dijo por correo, que es
                    // como funcionaba hasta ahora.
                    console.warn(`[VALIDACION] No se pudo pedir por codigo: ${e.message}`);
                }
            }

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
                    email_vi: v.email_firmante || null,
                    // Si la validacion viene de otro pagare de esa misma
                    // persona. Se rellena mas abajo.
                    de_otro_documento: false,
                    // Otra validacion suya en VI, cuando la hay. Normalmente
                    // es el rastro de una correccion que creo una nueva en vez
                    // de editar la que habia.
                    otra_validacion: v.otra_validacion || null,
                    // Cuantas validaciones tiene esa persona en VI. Lo anadio
                    // VI el 05-10-2026; antes no habia forma de detectar los
                    // duplicados, porque consultar devuelve una sola.
                    //
                    // Mas de una es rastro de los reenvios que creaban en vez
                    // de reenviar. Ya no deberia crecer, pero las que hay
                    // siguen ahi y conviene que se vean.
                    total_validaciones: v.total_validaciones != null
                        ? Number(v.total_validaciones) : null
                };
            }
        } catch (e) {
            console.warn(`[VALIDACION] VI no respondio: ${e.message}`);
            // La pantalla tiene que seguir sirviendo aunque VI este caido: se
            // marca que falta el detalle en vez de dejarla sin nada.
            for (const d of destinatarios) d.validacion = { vi_sin_respuesta: true };
        }
    }
    // De que documento salio cada validacion. VI no lo dice, pero nosotros
    // guardamos el documento cuando la creamos desde aqui.
    //
    // Importa porque una validacion sirve para TODOS los pagares de esa
    // persona -un padre con dos hijos firma dos, y no tiene sentido pedirle
    // que se valide dos veces-. Si la suya viene de otro pagare, la pantalla
    // lo dice en vez de hacer creer que se creo para este.
    const conValidacion = destinatarios.filter(d => d.validacion && d.validacion.codigo);
    if (conValidacion.length && db) {
        try {
            const codigos = [...new Set(conValidacion.map(d => d.validacion.codigo))];
            const marcas = codigos.map(() => '?').join(',');
            const [filas] = await db.promise().query(
                `SELECT p.validacion_codigo, p.document_id, d.title, d.created_at,
                        p.created_at AS validacion_creada
                 FROM vi_validaciones_pendientes p
                 LEFT JOIN documents d ON d.document_id = p.document_id
                 WHERE p.validacion_codigo IN (${marcas})`,
                codigos
            );
            const docDe = {};
            for (const f of filas) {
                // Varios envios del mismo CSV llevan el MISMO titulo. Sin la
                // fecha, decir de que pagare viene la validacion no distingue
                // nada: en DEV hay cinco 'Paquete matriculas 2026 Jardin (1)'.
                let titulo = f.title || null;
                if (titulo && f.created_at) {
                    const d = new Date(f.created_at);
                    if (!isNaN(d)) {
                        titulo += ' del ' + String(d.getDate()).padStart(2, '0') +
                                  '/' + String(d.getMonth() + 1).padStart(2, '0');
                    }
                }
                docDe[f.validacion_codigo] = {
                    id: f.document_id, titulo,
                    // Desde cuando vale: los pagares anteriores a esta
                    // fecha no se apoyan en esta validacion.
                    creada: f.validacion_creada || null
                };
            }

            // Y los demas pagares de cada uno que siguen sin firmar: el
            // operador necesita saber en que orden va a tener que firmarlos.
            const correosConValidacion = [...new Set(
                conValidacion.map(d => String(d.email || '').toLowerCase()))];
            const pendientesDe = {};
            if (correosConValidacion.length) {
                const m2 = correosConValidacion.map(() => '?').join(',');
                const [otros] = await db.promise().query(
                    `SELECT LOWER(dr.email) AS email, dr.document_id,
                            dr.viewer_group_id, d.title, dr.signing_order,
                            d.created_at AS documento_creado
                     FROM document_recipients dr
                     JOIN documents d ON d.document_id = dr.document_id
                     WHERE LOWER(dr.email) COLLATE utf8mb4_unicode_ci IN (${m2})
                       AND dr.status NOT IN ('completed', 'rejected')
                       AND dr.is_final_signer = 0
                     ORDER BY dr.document_id, dr.viewer_group_id`,
                    correosConValidacion
                );
                // Lo que se cuenta son PAGARES, no documentos ni filas.
                //
                // Un documento contiene varios pagares -uno por
                // viewer_group_id- y la misma persona puede estar en mas de
                // uno. Agrupar por documento contaba de menos; no agrupar
                // contaba de mas. El pagare es la unidad que se firma, asi
                // que la clave es el grupo.
                const vistos = {};
                for (const o of otros) {
                    const clave = o.email + '|' + o.document_id + '|' + (o.viewer_group_id || 0);
                    if (vistos[clave]) continue;
                    vistos[clave] = true;
                    (pendientesDe[o.email] = pendientesDe[o.email] || []).push({
                        id: o.document_id, grupo: o.viewer_group_id, titulo: o.title,
                        creado: o.documento_creado || null
                    });
                }
            }

            for (const d of conValidacion) {
                const suyo = docDe[d.validacion.codigo];
                // Solo se marca cuando SE SABE que es de otro: si no esta en
                // la tabla (se creo desde el panel de VI) no se afirma nada.
                if (suyo && suyo.id && d.document_id && suyo.id !== d.document_id) {
                    d.validacion.de_otro_documento = true;
                    d.validacion.pagare_origen = suyo.titulo || null;
                    // Todos sus pagares pendientes, en orden. Es lo que la
                    // pantalla usa para decir que firmara primero y que
                    // despues cuando complete la validacion.
                    // Solo los pagares POSTERIORES a la validacion.
                    //
                    // Una validacion no alcanza hacia atras: los pagares
                    // que ya existian cuando se creo tuvieron su propio
                    // flujo. Si se cuentan, la leyenda promete enlaces de
                    // firma que no van a llegar, porque la propagacion
                    // aplica este mismo corte.
                    const todos = pendientesDe[String(d.email || '').toLowerCase()] || [];
                    const desde = suyo.creada ? new Date(suyo.creada).getTime() : null;
                    d.validacion.pagares_pendientes = desde
                        ? todos.filter(p => !p.creado || new Date(p.creado).getTime() >= desde)
                        : todos;
                }
            }
        } catch (e) {
            console.warn(`[VALIDACION] No se pudo saber de que documento viene: ${e.message}`);
        }
    }

    return destinatarios;
}

/**
 * Pregunta a VI por un lote de validaciones, por correo o por codigo.
 *
 * Se pide por su endpoint interno, no leyendo su base: es de solo lectura y no
 * devuelve el token ni la url de redireccion, que permitirian completar la
 * validacion de otra persona.
 *
 * @param {string[]|null} correos  en minusculas, maximo 200 por peticion
 * @param {string[]|null} codigos  si se pasan, se pregunta por estos
 * @returns {Promise<object>} un mapa correo -> validacion, o codigo ->
 *                            validacion cuando se pregunto por codigos
 */
function _pedirAVI(correos, codigos) {
    const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
    const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
    const url = new URL(`${VI_URL}/validacion/api/firmalegal/validaciones/consultar`);
    const transporte = url.protocol === 'https:' ? require('https') : require('http');

    // 200 es el limite de VI por peticion.
    const porCodigo = Array.isArray(codigos) && codigos.length > 0;
    const cuerpo = JSON.stringify(porCodigo
        ? { codigos: codigos.slice(0, 200) }
        : { emails: (correos || []).slice(0, 200) });

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

                // Preguntando por codigo la clave es el codigo: hay varias
                // validaciones del mismo correo y se pisarian entre si.
                const mapa = {};
                for (const v of lista) {
                    if (!v) continue;
                    if (porCodigo) {
                        if (v.codigo) mapa[String(v.codigo)] = v;
                    } else if (v.email_firmante) {
                        mapa[String(v.email_firmante).toLowerCase()] = v;
                    }
                }
                resolver(mapa);
            });
        });
        peticion.on('error', rechazar);
        // Si VI no contesta, la pantalla no se queda colgada esperandola.
        peticion.setTimeout(8000, () => peticion.destroy(new Error('VI no respondio en 8 segundos')));
        peticion.write(cuerpo);
        peticion.end();
    });
}

/**
 * Solo el estado de la validacion, sin los datos del CSV.
 *
 * Lo usa el panel de arriba, que necesita saber QUIEN tiene validacion para
 * repartir entre "Enviar" y "Reenviar", pero no necesita la cedula ni el
 * celular de cada uno: eso solo hace falta en el renglon.
 *
 * @param {object[]} destinatarios  objetos con al menos { email }
 */
async function soloValidaciones(destinatarios) {
    if (!Array.isArray(destinatarios) || !destinatarios.length) return destinatarios;

    const correos = [...new Set(
        destinatarios.map(d => String(d.email || '').toLowerCase()).filter(Boolean))];
    for (const d of destinatarios) d.validacion = null;
    if (!correos.length) return destinatarios;

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
            dias_restantes: dias,
            caducada: dias !== null && dias <= 0,
            intentos: v.intentos != null ? Number(v.intentos) : null,
            // Cuando se creo y cuando vence. La fecha de creacion marca
            // desde cuando cuentan sus correos: los de antes eran de otra
            // validacion. Y expira_at deja que estaViva calcule la
            // caducidad tambien por esta via.
            creada_el: v.created_at || null,
            expira_at: v.expira_at || null,
            total_validaciones: v.total_validaciones != null
                ? Number(v.total_validaciones) : null,
            // De otro pagare, cuando lo sabemos. VI no devuelve el asunto,
            // asi que no se puede nombrar cual; se rellena mas abajo
            // comparando con nuestra tabla de pendientes.
            de_otro_documento: false
        };
    }
    return destinatarios;
}

/**
 * Si esa validacion sirve para algo.
 *
 * Tres cosas la dejan sin servir, y las tres se arreglan igual -creando otra-:
 *
 *   anulada    el operador la cancelo en VI
 *   caducada   pasaron sus 30 dias de vigencia
 *   completada no: esa SI vale, y ademas es definitiva
 *
 * La caducada importa en produccion: los enlaces de validacion vencen a los
 * 30 dias y en el envio de la Universidad ya hay varios pasados de fecha. Su
 * enlace no lleva a ninguna parte, asi que reenviarlo seria mandarle a un
 * padre un correo que no le sirve. Lo que toca es crearle una validacion
 * nueva, con enlace y vigencia nuevos.
 *
 * Vive aqui y no en cada sitio que lo pregunta porque ya paso: cuatro
 * lugares contestaban distinto a '¿tiene validacion?' y la pantalla se
 * contradecia con el servidor.
 *
 * @param {object|null} v  la validacion, tal como la devuelve este modulo
 * @returns {boolean}
 */
function estaViva(v) {
    if (!v || !v.codigo) return false;
    if (v.estado === 'cancelada' || v.estado === 'anulada') return false;
    // Una ya completada vale aunque su fecha haya pasado: lo que importa es
    // que esa persona se valido, y eso no caduca para este envio.
    if (v.estado === 'completada') return true;
    return !haCaducado(v);
}

/**
 * Si a esa validacion se le paso la fecha.
 *
 * Se calcula aqui y no se confia en el campo `caducada` porque ese solo lo
 * ponen conEstadoDeValidacion y soloValidaciones. Las otras vias -el reenvio
 * y la correccion, que piden a VI por su cuenta- manejan el objeto CRUDO que
 * VI devuelve, con `expira_at` pero sin `caducada`. Mirando solo el campo,
 * una caducada pasaba por viva justo donde mas importa: al reenviar.
 *
 * @param {object|null} v
 * @returns {boolean}  false si no se sabe: sin fecha no se da por caducada
 */
function haCaducado(v) {
    if (!v) return false;
    if (v.caducada === true) return true;
    if (!v.expira_at) return false;
    const vence = new Date(v.expira_at).getTime();
    if (isNaN(vence)) return false;
    return vence <= Date.now();
}

module.exports = { conEstadoDeValidacion, soloValidaciones, queFalta, estaViva, haCaducado };
