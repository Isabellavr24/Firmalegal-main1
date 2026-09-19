/**
 * =============================================
 * PLANTILLAS DE CAMPOS
 * Exportar los campos de un pagare y reutilizarlos en otro
 * =============================================
 *
 * Los once pagares de un colegio comparten la misma estructura —52 campos de
 * texto, 6 de firma, sello y firma definitiva— y hoy el operador los pinta uno
 * por uno en cada grado. Son mas de 600 campos a mano, y cada uno mal puesto
 * acaba en un contrato.
 *
 * LO QUE NUNCA SE COPIA de un documento a otro:
 *   - part_id y role_id: identifican partes de ESE documento. Copiarlos haria
 *     que los campos importados apunten a partes de otro pagare. Se guarda el
 *     ORDEN de la parte y al importar se resuelve o se crea la del destino.
 *   - document_id, y ningun valor escrito por los firmantes.
 *
 * Solo aplica a documentos tipo pagare: en los normales no se mapea texto.
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Helper: promisify db.query
function dbQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

/**
 * Huella de la estructura de una plantilla.
 *
 * Sirve para avisar "esta plantilla ya se exporto antes" sin comparar campo
 * por campo. Las posiciones van redondeadas a proposito: un arrastre de
 * decimas con el raton no debe contar como plantilla distinta.
 */
function calcularHuella(campos) {
    const base = campos
        .map(c => [
            c.field_type,
            c.page_number,
            Math.round(parseFloat(c.x_position) || 0),
            Math.round(parseFloat(c.y_position) || 0),
            Math.round(parseFloat(c.width) || 0),
            Math.round(parseFloat(c.height) || 0),
            (c.field_label || '').trim(),
            c.part_order === null || c.part_order === undefined ? '-' : c.part_order
        ].join(':'))
        .join('|');
    return crypto.createHash('sha256').update(base).digest('hex');
}

/** Nombre legible del tamaño de pagina, para el aviso al importar. */
function nombreTamano(ancho, alto) {
    if (!ancho || !alto) return null;
    const w = Math.round(ancho), h = Math.round(alto);
    const cerca = (a, b) => Math.abs(a - b) <= 6;
    if (cerca(w, 612) && cerca(h, 792)) return 'Carta';
    if (cerca(w, 612) && cerca(h, 1008)) return 'Oficio';
    if (cerca(w, 595) && cerca(h, 842)) return 'A4';
    if (cerca(w, 792) && cerca(h, 612)) return 'Carta horizontal';
    return `${w} x ${h}`;
}

/** Equipo del usuario, o null si no pertenece a ninguno. */
async function equipoDe(db, userId) {
    const filas = await dbQuery(db,
        `SELECT m.team_id FROM team_members m
         JOIN teams t ON t.team_id = m.team_id AND t.is_active = 1
         WHERE m.user_id = ? ORDER BY m.team_id LIMIT 1`,
        [userId]);
    return filas.length ? filas[0].team_id : null;
}

// ---------------------------------------------------------------------------
// GET /api/field-templates
// Plantillas que puede ver el usuario: las suyas, mas las de sus equipos.
// ---------------------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    try {
        // Un usuario puede pertenecer a varios equipos: se usa IN, no =.
        const plantillas = await dbQuery(db,
            `SELECT t.template_id, t.name, t.description,
                    t.owner_user_id, t.team_id,
                    t.source_document_name, t.page_count, t.parts_count,
                    t.page_width, t.page_height, t.page_size_name,
                    t.total_fields, t.text_fields, t.signature_fields,
                    t.seal_fields, t.date_fields, t.final_signature_fields,
                    t.created_at,
                    -- first_name y last_name existen en los dos entornos;
                    -- full_name solo en produccion, y romperia en DEV.
                    TRIM(CONCAT(COALESCE(u.first_name,''), ' ',
                                COALESCE(u.last_name,''))) AS owner_name,
                    eq.team_name,
                    -- El PDF de origen, para la portada en el listado. Si
                    -- renombraron la plantilla, la miniatura es lo unico que
                    -- deja reconocer de que documento salio.
                    d.file_path AS source_file_path
             FROM field_templates t
             LEFT JOIN users u ON u.user_id = t.owner_user_id
             LEFT JOIN teams eq ON eq.team_id = t.team_id
             LEFT JOIN documents d ON d.document_id = t.source_document_id
             WHERE t.is_active = 1
               AND ( t.owner_user_id = ?
                     OR ( t.team_id IS NOT NULL
                          AND t.team_id IN (SELECT team_id FROM team_members
                                            WHERE user_id = ?) ) )
             ORDER BY t.created_at DESC`,
            [req.userId, req.userId]);

        // Igual que en el detalle: solo se ofrece el PDF si sigue existiendo.
        // La plantilla sobrevive al documento, asi que la ruta puede apuntar a
        // un archivo ya borrado.
        let resolveFromRoot = null;
        try { ({ resolveFromRoot } = require('../config/paths')); } catch (e) { /* sin portada */ }

        plantillas.forEach(p => {
            let url = null;
            if (p.source_file_path && resolveFromRoot) {
                try {
                    const abs = resolveFromRoot(String(p.source_file_path).replace(/^\/+/, ''));
                    if (fs.existsSync(abs)) url = p.source_file_path;
                } catch (e) { url = null; }
            }
            p.source_pdf_url = url;
            delete p.source_file_path;
        });

        res.json({ ok: true, success: true, data: plantillas });
    } catch (error) {
        console.error('[PLANTILLAS] Error al listar:', error.message);
        res.status(500).json({ ok: false, error: 'Error al listar las plantillas' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/field-templates/:id
// Detalle con sus campos agrupados por pagina, para la previsualizacion.
// ---------------------------------------------------------------------------
router.get('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const filas = await dbQuery(db,
            `SELECT t.*,
                    -- El PDF de origen, para poder dibujar la previsualizacion
                    -- sobre la pagina real. Puede no existir ya: el documento
                    -- se pudo archivar o borrar, y la plantilla sobrevive.
                    d.file_path AS source_file_path,
                    d.status    AS source_status
             FROM field_templates t
             LEFT JOIN documents d ON d.document_id = t.source_document_id
             WHERE t.template_id = ? AND t.is_active = 1
               AND ( t.owner_user_id = ?
                     OR ( t.team_id IS NOT NULL
                          AND t.team_id IN (SELECT team_id FROM team_members
                                            WHERE user_id = ?) ) )`,
            [req.params.id, req.userId, req.userId]);

        if (!filas.length) {
            return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
        }
        const plantilla = filas[0];

        const campos = await dbQuery(db,
            `SELECT item_id, field_type, page_number, x_position, y_position,
                    width, height, field_label, field_config, required,
                    part_order, order_index
             FROM field_template_items
             WHERE template_id = ?
             ORDER BY order_index, item_id`,
            [req.params.id]);

        // Agrupadas por pagina: es como se muestra al personalizar la
        // importacion, con una miniatura y su resumen por pagina.
        const porPagina = {};
        for (const c of campos) {
            if (!porPagina[c.page_number]) {
                porPagina[c.page_number] = {
                    page_number: c.page_number, total: 0,
                    text: 0, signature: 0, date: 0, seal: 0,
                    stamp: 0, final_signature: 0, campos: []
                };
            }
            const p = porPagina[c.page_number];
            p.total++;
            if (p[c.field_type] !== undefined) p[c.field_type]++;
            p.campos.push(c);
        }

        // Solo se ofrece el PDF de fondo si el archivo sigue estando: la
        // plantilla sobrevive al documento, asi que la ruta guardada puede
        // apuntar a algo que ya no existe. Anunciarla sin comprobar dejaria la
        // previsualizacion en blanco sin explicar por que.
        let pdfDisponible = false;
        if (plantilla.source_file_path) {
            try {
                const { resolveFromRoot } = require('../config/paths');
                const abs = resolveFromRoot(
                    String(plantilla.source_file_path).replace(/^\/+/, ''));
                pdfDisponible = fs.existsSync(abs);
            } catch (e) {
                pdfDisponible = false;
            }
        }

        // Tamaño REAL de cada pagina, leido del PDF de origen.
        //
        // Un PDF puede mezclar tamaños: este pagare tiene las paginas 1 a 9 en
        // Carta (612x792) y la 10 y la 11 en Oficio (612x1008). Por eso los
        // campos de esas dos "se salian" de 792: no estaban mal, es que su
        // hoja es mas alta.
        //
        // Se lee del archivo en vez de deducirlo de los campos: deducirlo son
        // conjeturas que fallan en cuanto una pagina tiene pocos campos o
        // ninguno abajo.
        const anchoPDF = parseFloat(plantilla.page_width) || 612;
        const altoPDF = parseFloat(plantilla.page_height) || 792;
        let tamPorPagina = {};
        if (pdfDisponible) {
            try {
                const { PDFDocument } = require('pdf-lib');
                const { resolveFromRoot: rfr } = require('../config/paths');
                const abs = rfr(String(plantilla.source_file_path).replace(/^\/+/, ''));
                const pdf = await PDFDocument.load(fs.readFileSync(abs), { ignoreEncryption: true });
                pdf.getPages().forEach((pg, i) => {
                    tamPorPagina[i + 1] = { w: pg.getWidth(), h: pg.getHeight() };
                });
            } catch (e) {
                console.warn('[PLANTILLAS] No se pudo leer el tamaño de las paginas:', e.message);
            }
        }

        for (const p of Object.values(porPagina)) {
            const t = tamPorPagina[p.page_number];
            p.coord_width = Math.round((t ? t.w : anchoPDF) * 100) / 100;
            p.coord_height = Math.round((t ? t.h : altoPDF) * 100) / 100;
            // Nombre del tamaño de ESTA pagina, para agruparlas en la vista:
            // un mismo PDF puede mezclar Carta y Oficio.
            p.size_name = nombreTamano(p.coord_width, p.coord_height);
        }

        res.json({
            ok: true, success: true,
            data: {
                ...plantilla,
                source_pdf_url: pdfDisponible ? plantilla.source_file_path : null,
                paginas: Object.values(porPagina).sort((a, b) => a.page_number - b.page_number)
            }
        });
    } catch (error) {
        console.error('[PLANTILLAS] Error al obtener:', error.message);
        res.status(500).json({ ok: false, error: 'Error al obtener la plantilla' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/field-templates/export/:documentId
// Guardar los campos de un documento como plantilla.
// ---------------------------------------------------------------------------
router.post('/export/:documentId', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const documentId = req.params.documentId;

    try {
        // `documents` no guarda ni el numero de paginas ni el tamaño del PDF,
        // asi que el editor los envia en el body: el es quien tiene el PDF
        // abierto y los conoce.
        const docs = await dbQuery(db,
            `SELECT document_id, title, document_type, team_id
             FROM documents WHERE document_id = ?`,
            [documentId]);
        if (!docs.length) {
            return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
        }
        const doc = docs[0];

        // Por ahora solo pagares: en los documentos normales no se mapea texto.
        if (doc.document_type !== 'pagare') {
            return res.status(400).json({
                ok: false,
                error: 'Las plantillas de campos solo aplican a pagarés'
            });
        }

        const pageWidth  = parseFloat(req.body.page_width)  || null;
        const pageHeight = parseFloat(req.body.page_height) || null;
        const totalPages = parseInt(req.body.total_pages, 10) || null;

        // Se guarda el ORDEN de la parte, nunca el part_id: ese numero
        // identifica una parte de ESTE documento y no significa nada en otro.
        //
        // Los campos pueden llegar por dos caminos:
        //
        //  1. En el body, tal como estan pintados en el editor. Es el caso
        //     normal. Asi EXPORTAR no necesita guardar el documento: se guarda
        //     la plantilla y nada mas. Si el operador se arrepiente y sale sin
        //     pulsar GUARDAR, su documento queda como estaba.
        //  2. De `document_fields`, para un documento ya guardado que se
        //     exporta sin abrir el editor.
        let campos;
        const delEditor = Array.isArray(req.body.campos) ? req.body.campos : null;

        if (delEditor && delEditor.length) {
            campos = delEditor.map(c => ({
                field_type: c.field_type || c.type,
                page_number: parseInt(c.page_number || c.page, 10) || 1,
                x_position: parseFloat(c.x_position !== undefined ? c.x_position : c.x) || 0,
                y_position: parseFloat(c.y_position !== undefined ? c.y_position : c.y) || 0,
                width: parseFloat(c.width !== undefined ? c.width : c.w) || 0,
                height: parseFloat(c.height !== undefined ? c.height : c.h) || 0,
                field_label: c.field_label || c.label || null,
                // El formato del texto (fuente, tamaño, color, alineacion) se
                // guarda tal cual: es parte de lo que el operador configuro y
                // rehacerlo a mano en cada grado es justo lo que se evita.
                field_config: typeof c.field_config === 'string'
                    ? c.field_config
                    : (c.field_config || c.format ? JSON.stringify(c.field_config || c.format) : null),
                required: c.required ? 1 : 0,
                part_order: (c.part_order !== undefined && c.part_order !== null)
                    ? parseInt(c.part_order, 10) : null
            })).filter(c => c.field_type);
        } else {
            campos = await dbQuery(db,
                `SELECT f.field_id, f.field_type, f.page_number,
                        f.x_position, f.y_position, f.width, f.height,
                        f.field_label, f.field_config, f.required,
                        p.order_position AS part_order
                 FROM document_fields f
                 LEFT JOIN document_parts p ON p.part_id = f.part_id
                 WHERE f.document_id = ?
                 ORDER BY f.field_id`,
                [documentId]);
        }

        if (!campos.length) {
            return res.status(400).json({
                ok: false,
                error: 'Este documento no tiene campos para exportar'
            });
        }

        // order_index explicito: las etiquetas se repiten ("Nombre:" seis veces
        // en el pagare) y el orden decide a que responsable pertenece cada una.
        campos.forEach((c, i) => { c.order_index = i; });

        const huella = calcularHuella(campos);

        // Aviso de duplicado: se compara por la ESTRUCTURA, no por el nombre.
        const iguales = await dbQuery(db,
            `SELECT template_id, name, created_at FROM field_templates
             WHERE fingerprint = ? AND is_active = 1
               AND ( owner_user_id = ?
                     OR ( team_id IS NOT NULL
                          AND team_id IN (SELECT team_id FROM team_members
                                          WHERE user_id = ?) ) )
             LIMIT 1`,
            [huella, req.userId, req.userId]);

        if (iguales.length && !req.body.forzar) {
            return res.status(409).json({
                ok: false, code: 'YA_EXISTE',
                error: 'Esta plantilla ya se exportó antes',
                data: {
                    template_id: iguales[0].template_id,
                    name: iguales[0].name,
                    created_at: iguales[0].created_at
                }
            });
        }

        const cuenta = t => campos.filter(c => c.field_type === t).length;
        // El nombre se hereda del documento y el operador puede editarlo.
        const nombre = (req.body.name || doc.title || 'Plantilla sin nombre')
            .toString().trim().slice(0, 255);
        const teamId = await equipoDe(db, req.userId);
        const paginas = Math.max(...campos.map(c => c.page_number), totalPages || 1);

        const ins = await dbQuery(db,
            `INSERT INTO field_templates
               (name, description, owner_user_id, team_id,
                source_document_id, source_document_name,
                page_width, page_height, page_size_name,
                page_count, parts_count, fingerprint,
                total_fields, text_fields, signature_fields,
                seal_fields, date_fields, final_signature_fields)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                nombre,
                (req.body.description || null),
                req.userId, teamId,
                doc.document_id, doc.title,
                pageWidth, pageHeight,
                nombreTamano(pageWidth, pageHeight),
                paginas,
                Math.max(...campos.map(c => c.part_order || 0), 1),
                huella,
                campos.length, cuenta('text'), cuenta('signature'),
                cuenta('seal') + cuenta('stamp'), cuenta('date'),
                cuenta('final_signature')
            ]);

        const templateId = ins.insertId;

        for (const c of campos) {
            await dbQuery(db,
                `INSERT INTO field_template_items
                   (template_id, field_type, page_number,
                    x_position, y_position, width, height,
                    field_label, field_config, required, part_order, order_index)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    templateId, c.field_type, c.page_number,
                    c.x_position, c.y_position, c.width, c.height,
                    c.field_label, c.field_config,
                    c.required === null ? 1 : c.required,
                    c.part_order || null, c.order_index
                ]);
        }

        console.log(`[PLANTILLAS] "${nombre}" exportada del documento ${documentId} ` +
                    `(${campos.length} campos, equipo ${teamId || 'ninguno'})`);

        res.json({
            ok: true, success: true,
            data: { template_id: templateId, name: nombre, total_fields: campos.length }
        });
    } catch (error) {
        console.error('[PLANTILLAS] Error al exportar:', error.message);
        res.status(500).json({ ok: false, error: 'Error al exportar la plantilla' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/field-templates/:id/import/:documentId
// Colocar los campos de una plantilla en otro documento.
//
// Body opcional:
//   paginas: { "9": 5, "10": 6 }   pagina de la plantilla -> pagina destino
//                                   (omitir una pagina = no importarla)
// ---------------------------------------------------------------------------
router.post('/:id/import/:documentId', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const { id, documentId } = req.params;

    try {
        const tpl = await dbQuery(db,
            `SELECT t.* FROM field_templates t
             WHERE t.template_id = ? AND t.is_active = 1
               AND ( t.owner_user_id = ?
                     OR ( t.team_id IS NOT NULL
                          AND t.team_id IN (SELECT team_id FROM team_members
                                            WHERE user_id = ?) ) )`,
            [id, req.userId, req.userId]);
        if (!tpl.length) {
            return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
        }
        const plantilla = tpl[0];

        const docs = await dbQuery(db,
            `SELECT document_id, title, document_type
             FROM documents WHERE document_id = ?`,
            [documentId]);
        if (!docs.length) {
            return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
        }
        const doc = docs[0];

        if (doc.document_type !== 'pagare') {
            return res.status(400).json({
                ok: false,
                error: 'Las plantillas de campos solo aplican a pagarés'
            });
        }

        // El editor envia el tamaño y las paginas del PDF destino: es quien lo
        // tiene abierto. `documents` no los guarda.
        const pageWidth  = parseFloat(req.body.page_width)  || null;
        const pageHeight = parseFloat(req.body.page_height) || null;
        const totalPages = parseInt(req.body.total_pages, 10) || null;

        // Los botones de exportar e importar son excluyentes: si el documento
        // ya tiene campos, no se ofrece importar. Se comprueba igual aqui,
        // porque una peticion directa se saltaria la interfaz y duplicaria los
        // campos.
        const yaTiene = await dbQuery(db,
            'SELECT COUNT(*) AS n FROM document_fields WHERE document_id = ?',
            [documentId]);
        if (yaTiene[0].n > 0) {
            return res.status(409).json({
                ok: false, code: 'YA_TIENE_CAMPOS',
                error: 'Este documento ya tiene campos. Bórrelos antes de importar una plantilla.'
            });
        }

        const items = await dbQuery(db,
            `SELECT * FROM field_template_items
             WHERE template_id = ? ORDER BY order_index, item_id`,
            [id]);
        if (!items.length) {
            return res.status(400).json({ ok: false, error: 'La plantilla no tiene campos' });
        }

        // Mapa de paginas. Sin body, cada campo va a su misma pagina.
        const mapaPag = (req.body && req.body.paginas) || null;

        // Partes: se resuelven o se crean por ORDEN, nunca por part_id.
        const partesExistentes = await dbQuery(db,
            'SELECT part_id, order_position FROM document_parts WHERE document_id = ?',
            [documentId]);
        const partePorOrden = {};
        for (const p of partesExistentes) partePorOrden[p.order_position] = p.part_id;

        const COLORES = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        const ordenesNecesarios = [...new Set(
            items.map(i => i.part_order).filter(o => o !== null && o !== undefined)
        )].sort((a, b) => a - b);

        for (const orden of ordenesNecesarios) {
            if (partePorOrden[orden]) continue;
            const r = await dbQuery(db,
                `INSERT INTO document_parts (document_id, role_name, order_position, color)
                 VALUES (?,?,?,?)`,
                [documentId, `Firmante N${orden}`, orden, COLORES[(orden - 1) % COLORES.length]]);
            partePorOrden[orden] = r.insertId;
            console.log(`[PLANTILLAS] Parte creada en doc ${documentId}: Firmante N${orden}`);
        }

        // Si el editor no informo cuantas paginas tiene el PDF, se acepta
        // cualquier pagina: es preferible colocar el campo a descartarlo por
        // una comprobacion que no se puede hacer.
        const totalPaginasDoc = totalPages || Infinity;
        let colocados = 0;
        const omitidos = [];
        // Campos que se devuelven al editor para que los pinte.
        const campos = [];

        for (const it of items) {
            // Pagina destino: la que eligio el operador, o la misma.
            let destino = it.page_number;
            if (mapaPag) {
                const elegida = mapaPag[String(it.page_number)];
                if (elegida === undefined || elegida === null) {
                    omitidos.push({ ...it, motivo: 'pagina no seleccionada' });
                    continue;
                }
                destino = parseInt(elegida, 10);
            }
            if (destino < 1 || destino > totalPaginasDoc) {
                omitidos.push({ ...it, motivo: `el documento no tiene pagina ${destino}` });
                continue;
            }

            // NO se escribe en `document_fields`: los campos se devuelven al
            // editor y se guardan cuando el operador pulse GUARDAR, igual que
            // si los hubiera pintado a mano.
            //
            // Escribirlos aqui hacia que importar equivaliera a guardar: el
            // documento quedaba listo para envio sin que nadie lo aprobara, no
            // se podia volver a editar, y al pulsar GUARDAR despues el borrado
            // previo de campos arrastraba `field_values` en cascada.
            campos.push({
                type: it.field_type,
                page: destino,
                x: it.x_position, y: it.y_position,
                width: it.width, height: it.height,
                required: it.required,
                label: it.field_label,
                partId: it.part_order ? partePorOrden[it.part_order] : null,
                partOrder: it.part_order || null,
                format: it.field_config
            });
            colocados++;
        }

        // Aviso de tamaño distinto: los campos se colocan igual, con sus
        // posiciones originales. NO se escalan — escalar mal desplaza un campo
        // a la columna del otro responsable. El operador lo corrige con la
        // seleccion multiple.
        let avisoTamano = null;
        const wTpl = parseFloat(plantilla.page_width) || 0;
        const hTpl = parseFloat(plantilla.page_height) || 0;
        const wDoc = pageWidth || 0;
        const hDoc = pageHeight || 0;
        if (wTpl && hTpl && wDoc && hDoc &&
            (Math.abs(wTpl - wDoc) > 6 || Math.abs(hTpl - hDoc) > 6)) {
            avisoTamano = {
                origen: plantilla.page_size_name || `${Math.round(wTpl)} x ${Math.round(hTpl)}`,
                destino: nombreTamano(wDoc, hDoc) || `${Math.round(wDoc)} x ${Math.round(hDoc)}`,
                source_document_name: plantilla.source_document_name
            };
        }

        console.log(`[PLANTILLAS] "${plantilla.name}" preparada para doc ${documentId}: ` +
                    `${colocados} campos, ${omitidos.length} omitidos ` +
                    `(sin guardar: los guarda el editor)`);

        res.json({
            ok: true, success: true,
            data: {
                colocados,
                // Los campos van al editor; nada se ha escrito todavia.
                campos,
                omitidos: omitidos.length,
                detalle_omitidos: omitidos.slice(0, 20).map(o => ({
                    pagina: o.page_number, etiqueta: o.field_label, motivo: o.motivo
                })),
                partes_creadas: ordenesNecesarios.length,
                aviso_tamano: avisoTamano
            }
        });
    } catch (error) {
        console.error('[PLANTILLAS] Error al importar:', error.message);
        res.status(500).json({ ok: false, error: 'Error al importar la plantilla' });
    }
});

// ---------------------------------------------------------------------------
// PUT /api/field-templates/:id   — renombrar
// DELETE /api/field-templates/:id — desactivar
//
// Solo el dueño. Los operadores del colegio no pueden tocar las plantillas del
// equipo: las usan, pero no las borran ni las renombran.
// ---------------------------------------------------------------------------
router.put('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const filas = await dbQuery(db,
            'SELECT owner_user_id FROM field_templates WHERE template_id = ? AND is_active = 1',
            [req.params.id]);
        if (!filas.length) {
            return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
        }
        if (filas[0].owner_user_id !== req.userId) {
            return res.status(403).json({
                ok: false, error: 'Solo quien creó la plantilla puede modificarla'
            });
        }

        const nombre = (req.body.name || '').toString().trim().slice(0, 255);
        if (!nombre) {
            return res.status(400).json({ ok: false, error: 'El nombre no puede quedar vacío' });
        }
        await dbQuery(db,
            'UPDATE field_templates SET name = ?, description = ? WHERE template_id = ?',
            [nombre, req.body.description || null, req.params.id]);

        res.json({ ok: true, success: true });
    } catch (error) {
        console.error('[PLANTILLAS] Error al renombrar:', error.message);
        res.status(500).json({ ok: false, error: 'Error al renombrar la plantilla' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const filas = await dbQuery(db,
            'SELECT owner_user_id, name FROM field_templates WHERE template_id = ? AND is_active = 1',
            [req.params.id]);
        if (!filas.length) {
            return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
        }
        if (filas[0].owner_user_id !== req.userId) {
            return res.status(403).json({
                ok: false, error: 'Solo quien creó la plantilla puede eliminarla'
            });
        }

        // Se desactiva, no se borra: asi se puede recuperar si alguien se
        // equivoca, y no desaparece de golpe para todo el equipo.
        await dbQuery(db,
            'UPDATE field_templates SET is_active = 0 WHERE template_id = ?',
            [req.params.id]);

        console.log(`[PLANTILLAS] "${filas[0].name}" desactivada por el usuario ${req.userId}`);
        res.json({ ok: true, success: true });
    } catch (error) {
        console.error('[PLANTILLAS] Error al eliminar:', error.message);
        res.status(500).json({ ok: false, error: 'Error al eliminar la plantilla' });
    }
});

module.exports = router;
