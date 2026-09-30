// Donde vive la trazabilidad de una persona, en un solo sitio.
//
// La traza de identidad puede estar en DOS tablas y hay que mirar las dos:
//
//   1. `document_recipients.vi_traza_path` — la fila del envio donde valido
//   2. `vi_verified_emails.vi_traza_path`  — el registro por PERSONA, que
//      sobrevive a que se recreen los destinatarios
//
// Quien valido en un envio anterior tiene NULL en su fila y la traza en la
// segunda tabla. Mirar solo la primera es el fallo que aparecio una y otra vez
// a lo largo de septiembre de 2026: en el sellado sin firmante definitivo, en
// el pre-traza, en la vista del visor, en el pagare completo y en la ruta de
// descarga. Cada vez se arreglaba esa consulta y reaparecia en la siguiente.
//
// Por eso existe este archivo: para que la pregunta "cual es la traza de esta
// persona" tenga UNA sola respuesta en todo el sistema, y no haya una consulta
// numero 27 donde el fallo vuelva.
//
// REGLA: ninguna parte del codigo deberia leer `vi_traza_path` de
// `document_recipients` por su cuenta. Se usa `trazasDeGrupo()` o
// `trazaDeCorreo()`.

// El COLLATE no es opcional: las dos tablas lo tienen distinto y sin el, el
// JOIN falla en silencio y devuelve NULL para todos.
const JOIN_TRAZA = `
    LEFT JOIN vi_verified_emails v
      ON LOWER(v.email) COLLATE utf8mb4_unicode_ci = LOWER(dr.email) COLLATE utf8mb4_unicode_ci`;

const CAMPO_TRAZA = `COALESCE(dr.vi_traza_path, v.vi_traza_path)`;

/**
 * Los firmantes de UN pagare (un viewer_group) con su traza resuelta.
 *
 * Filtra por grupo a proposito: en un pagare, un mismo `document_id` agrupa
 * varios pagares independientes, cada uno con su deudor y su codeudor. Traer
 * los del documento entero metia en un pagare las validaciones de otro, que es
 * una fuga de datos entre deudores.
 *
 * @param {object} db             pool de mysql2
 * @param {number} viewerGroupId  el grupo del pagare
 * @param {object} [opciones]
 * @param {boolean} [opciones.incluirDefinitivo=false]  incluir al firmante definitivo
 * @param {number}  [opciones.documentId]  obligatorio si se incluye el definitivo
 * @returns {Promise<Array>} filas con recipient_id, email, name, status,
 *                           personal_pdf_path, custom_pdf_path, vi_traza_path
 */
async function trazasDeGrupo(db, viewerGroupId, opciones = {}) {
    const { incluirDefinitivo = false, documentId = null } = opciones;

    const [firmantes] = await db.promise().query(
        `SELECT dr.recipient_id, dr.email, dr.name, dr.status,
                dr.personal_pdf_path, dr.custom_pdf_path, dr.completed_at,
                ${CAMPO_TRAZA} AS vi_traza_path
         FROM document_recipients dr
         ${JOIN_TRAZA}
         WHERE dr.viewer_group_id = ? AND dr.is_final_signer = 0
         ORDER BY dr.completed_at ASC`,
        [viewerGroupId]
    );

    if (!incluirDefinitivo || !documentId) return firmantes;

    // El firmante definitivo es del DOCUMENTO, no del grupo: sella todos los
    // pagares del envio, asi que su traza va en cada uno.
    const [definitivo] = await db.promise().query(
        `SELECT dr.recipient_id, dr.email, dr.name, dr.status, dr.completed_at,
                ${CAMPO_TRAZA} AS vi_traza_path
         FROM document_recipients dr
         ${JOIN_TRAZA}
         WHERE dr.document_id = ? AND dr.is_final_signer = 1 AND dr.status = 'completed'
         LIMIT 1`,
        [documentId]
    );

    return definitivo.length ? [...firmantes, definitivo[0]] : firmantes;
}

/**
 * La traza de una persona por su correo, mirando las dos tablas.
 *
 * @returns {Promise<string|null>} la ruta, o null si no tiene
 */
async function trazaDeCorreo(db, email) {
    if (!email) return null;
    try {
        const [filas] = await db.promise().query(
            `SELECT ${CAMPO_TRAZA} AS vi_traza_path
             FROM document_recipients dr
             ${JOIN_TRAZA}
             WHERE LOWER(dr.email) = LOWER(?)
               AND ${CAMPO_TRAZA} IS NOT NULL
             ORDER BY dr.recipient_id DESC
             LIMIT 1`,
            [email]
        );
        return filas[0]?.vi_traza_path || null;
    } catch (e) {
        console.warn(`[TRAZAS] No se pudo resolver la traza de ${email}: ${e.message}`);
        return null;
    }
}

/**
 * Cuantas trazabilidades le TOCAN a un pagare, para poder comprobar despues
 * que el PDF las lleva. Es el numero de firmantes con traza, ni uno mas.
 */
async function cuantasTocan(db, viewerGroupId, opciones = {}) {
    const firmantes = await trazasDeGrupo(db, viewerGroupId, opciones);
    return firmantes.filter(f => f.vi_traza_path).length;
}

module.exports = { trazasDeGrupo, trazaDeCorreo, cuantasTocan, JOIN_TRAZA, CAMPO_TRAZA };
