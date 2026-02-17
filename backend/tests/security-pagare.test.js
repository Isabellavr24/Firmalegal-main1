/**
 * PRUEBAS DE SEGURIDAD: CONTROL DE ACCESO EN PAGARÉS
 *
 * Verifica que el fix de seguridad funcione correctamente:
 * - Firmante definitivo NO puede acceder antes de que todos completen
 * - Viewer groups solo ven sus propios campos
 * - Filtrado correcto de información sensible
 */

const request = require('supertest');
const mysql = require('mysql2/promise');

// Configurar la URL del servidor
const BASE_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';

// Configuración de base de datos
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'firmalegalonline'
};

let db;

beforeAll(async () => {
    // Conectar a la base de datos
    db = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Conectado a la base de datos para pruebas');
});

afterAll(async () => {
    // Cerrar conexión
    if (db) await db.end();
    console.log('✅ Conexión cerrada');
});

describe('🔒 SEGURIDAD: Control de Acceso en Pagarés', () => {

    let testDocumentId;
    let finalSignerToken;
    let viewerGroup1Token;
    let viewerGroup2Token;

    beforeAll(async () => {
        // Crear documento de prueba
        const [result] = await db.execute(
            `INSERT INTO documents (title, file_path, document_type, owner_id, created_at)
             VALUES ('Pagaré de Prueba Seguridad', '/test/pagare.pdf', 'pagare', 1, NOW())`
        );
        testDocumentId = result.insertId;

        // Crear metadata del pagaré
        await db.execute(
            `INSERT INTO pagare_metadata (document_id, total_viewers, final_signer_email, final_signer_name, final_signer_token, final_signer_status)
             VALUES (?, 2, 'final@test.com', 'Firmante Final Test', ?, 'waiting')`,
            [testDocumentId, 'final_token_test_' + Date.now()]
        );

        // Obtener el token del firmante definitivo
        const [metadata] = await db.execute(
            `SELECT final_signer_token FROM pagare_metadata WHERE document_id = ?`,
            [testDocumentId]
        );
        finalSignerToken = metadata[0].final_signer_token;

        // Crear viewer groups
        await db.execute(
            `INSERT INTO pagare_viewer_groups (document_id, viewer_id, status, created_at)
             VALUES (?, 1, 'pending', NOW()), (?, 2, 'pending', NOW())`,
            [testDocumentId, testDocumentId]
        );

        // Obtener IDs de viewer groups
        const [viewerGroups] = await db.execute(
            `SELECT viewer_group_id FROM pagare_viewer_groups WHERE document_id = ? ORDER BY viewer_id`,
            [testDocumentId]
        );

        // Crear recipients para viewer groups
        viewerGroup1Token = 'vg1_token_' + Date.now();
        viewerGroup2Token = 'vg2_token_' + Date.now();

        await db.execute(
            `INSERT INTO document_recipients (document_id, email, name, token, status, viewer_group_id, is_final_signer, created_at)
             VALUES
             (?, 'deudor1@test.com', 'Deudor 1', ?, 'sent', ?, 0, NOW()),
             (?, 'deudor2@test.com', 'Deudor 2', ?, 'sent', ?, 0, NOW())`,
            [testDocumentId, viewerGroup1Token, viewerGroups[0].viewer_group_id,
             testDocumentId, viewerGroup2Token, viewerGroups[1].viewer_group_id]
        );

        // Crear recipient para firmante definitivo
        await db.execute(
            `INSERT INTO document_recipients (document_id, email, name, token, status, viewer_group_id, is_final_signer, created_at)
             VALUES (?, 'final@test.com', 'Firmante Final Test', ?, 'sent', NULL, 1, NOW())`,
            [testDocumentId, finalSignerToken]
        );

        console.log(`✅ Documento de prueba creado: ID ${testDocumentId}`);
        console.log(`   - Final Signer Token: ${finalSignerToken}`);
        console.log(`   - VG1 Token: ${viewerGroup1Token}`);
        console.log(`   - VG2 Token: ${viewerGroup2Token}`);
    });

    afterAll(async () => {
        // Limpiar datos de prueba
        if (testDocumentId) {
            await db.execute(`DELETE FROM document_recipients WHERE document_id = ?`, [testDocumentId]);
            await db.execute(`DELETE FROM pagare_viewer_groups WHERE document_id = ?`, [testDocumentId]);
            await db.execute(`DELETE FROM pagare_metadata WHERE document_id = ?`, [testDocumentId]);
            await db.execute(`DELETE FROM documents WHERE document_id = ?`, [testDocumentId]);
            console.log(`✅ Datos de prueba eliminados`);
        }
    });

    // =============================================
    // TEST 1: Firmante Definitivo - Acceso Prematuro (DEBE FALLAR)
    // =============================================
    test('🔴 TEST 1: Firmante definitivo NO debe acceder cuando viewer_groups están pendientes', async () => {
        const response = await request(BASE_URL)
            .get(`/api/public/document/${finalSignerToken}`)
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('WAITING_FOR_VIEWERS');
        expect(response.body.message).toContain('no está disponible para firma definitiva');

        console.log('✅ TEST 1 PASSED: Acceso bloqueado correctamente (403 Forbidden)');
    });

    // =============================================
    // TEST 2: Viewer Group 1 Completa
    // =============================================
    test('🟢 TEST 2: Viewer Group 1 puede acceder a su documento', async () => {
        const response = await request(BASE_URL)
            .get(`/api/public/document/${viewerGroup1Token}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.document).toBeDefined();
        expect(response.body.document.id).toBe(testDocumentId);
        expect(response.body.document.recipientEmail).toBe('deudor1@test.com');

        console.log('✅ TEST 2 PASSED: Viewer Group 1 accede correctamente');
    });

    // =============================================
    // TEST 3: Actualizar VG1 a Completado
    // =============================================
    test('🟢 TEST 3: Completar firma de Viewer Group 1', async () => {
        // Actualizar status del recipient
        await db.execute(
            `UPDATE document_recipients SET status = 'completed', completed_at = NOW() WHERE token = ?`,
            [viewerGroup1Token]
        );

        // Actualizar status del viewer_group
        const [vg1] = await db.execute(
            `SELECT viewer_group_id FROM document_recipients WHERE token = ?`,
            [viewerGroup1Token]
        );

        await db.execute(
            `UPDATE pagare_viewer_groups SET status = 'completed', completed_at = NOW() WHERE viewer_group_id = ?`,
            [vg1[0].viewer_group_id]
        );

        console.log('✅ TEST 3 PASSED: Viewer Group 1 marcado como completado');
    });

    // =============================================
    // TEST 4: Firmante Definitivo - TODAVÍA NO PUEDE ACCEDER (VG2 pendiente)
    // =============================================
    test('🔴 TEST 4: Firmante definitivo TODAVÍA NO puede acceder (VG2 pendiente)', async () => {
        const response = await request(BASE_URL)
            .get(`/api/public/document/${finalSignerToken}`)
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('WAITING_FOR_VIEWERS');

        console.log('✅ TEST 4 PASSED: Acceso bloqueado - VG2 aún no completa');
    });

    // =============================================
    // TEST 5: Completar VG2
    // =============================================
    test('🟢 TEST 5: Completar firma de Viewer Group 2', async () => {
        // Actualizar status del recipient
        await db.execute(
            `UPDATE document_recipients SET status = 'completed', completed_at = NOW() WHERE token = ?`,
            [viewerGroup2Token]
        );

        // Actualizar status del viewer_group
        const [vg2] = await db.execute(
            `SELECT viewer_group_id FROM document_recipients WHERE token = ?`,
            [viewerGroup2Token]
        );

        await db.execute(
            `UPDATE pagare_viewer_groups SET status = 'completed', completed_at = NOW() WHERE viewer_group_id = ?`,
            [vg2[0].viewer_group_id]
        );

        console.log('✅ TEST 5 PASSED: Viewer Group 2 marcado como completado');
    });

    // =============================================
    // TEST 6: Firmante Definitivo - AHORA SÍ PUEDE ACCEDER
    // =============================================
    test('🟢 TEST 6: Firmante definitivo AHORA puede acceder (todos los VG completados)', async () => {
        const response = await request(BASE_URL)
            .get(`/api/public/document/${finalSignerToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.document).toBeDefined();
        expect(response.body.document.isFinalSigner).toBe(true);
        expect(response.body.document.recipientEmail).toBe('final@test.com');

        console.log('✅ TEST 6 PASSED: Firmante definitivo accede correctamente');
    });

    // =============================================
    // TEST 7: Filtrado de Campos Sensibles
    // =============================================
    test('🔒 TEST 7: Firmante definitivo NO recibe campos de texto de viewers', async () => {
        // Crear campos de prueba
        await db.execute(
            `INSERT INTO document_fields (document_id, field_type, field_label, page_number, x_position, y_position, width, height)
             VALUES
             (?, 'text', 'Campo de Deudor 1', 1, 100, 100, 200, 30),
             (?, 'final_signature', 'Firma Definitiva', 1, 100, 200, 200, 80),
             (?, 'seal', 'Sello PKI', 1, 100, 300, 200, 80)`,
            [testDocumentId, testDocumentId, testDocumentId]
        );

        const response = await request(BASE_URL)
            .get(`/api/public/document/${finalSignerToken}`)
            .expect(200);

        const fields = response.body.document.fields;

        // Verificar que SOLO recibe campos final_signature y seal
        const hasTextField = fields.some(f => f.type === 'text');
        const hasFinalSignature = fields.some(f => f.type === 'final_signature');
        const hasSeal = fields.some(f => f.type === 'seal');

        expect(hasTextField).toBe(false); // ❌ NO debe tener campos de texto
        expect(hasFinalSignature).toBe(true); // ✅ Debe tener final_signature
        expect(hasSeal).toBe(true); // ✅ Debe tener seal

        console.log('✅ TEST 7 PASSED: Campos filtrados correctamente');
        console.log(`   - Campos recibidos: ${fields.length}`);
        console.log(`   - Tipos: ${fields.map(f => f.type).join(', ')}`);
    });

    // =============================================
    // TEST 8: Token Inválido
    // =============================================
    test('🔴 TEST 8: Token inválido debe retornar 404', async () => {
        const response = await request(BASE_URL)
            .get('/api/public/document/token_invalido_xyz_123')
            .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Token inválido');

        console.log('✅ TEST 8 PASSED: Token inválido rechazado');
    });

    // =============================================
    // TEST 9: Viewer Group NO ve campos de otros Viewers
    // =============================================
    test('🔒 TEST 9: Viewer Group solo ve sus propios campos', async () => {
        // Crear campos específicos para cada viewer group
        // (Nota: En producción esto se hace con part_id)
        await db.execute(
            `INSERT INTO document_fields (document_id, field_type, field_label, page_number, x_position, y_position, width, height, part_id)
             VALUES
             (?, 'text', 'Monto VG1', 1, 100, 400, 200, 30, 1),
             (?, 'text', 'Monto VG2', 1, 100, 450, 200, 30, 2)`,
            [testDocumentId, testDocumentId]
        );

        const response = await request(BASE_URL)
            .get(`/api/public/document/${viewerGroup1Token}`)
            .expect(200);

        const fields = response.body.document.fields;

        // Verificar que solo recibe campos con part_id = 1 (su propio part_id)
        const hasOtherPartFields = fields.some(f => f.part_id === 2);
        const hasOwnPartFields = fields.some(f => f.part_id === 1);

        expect(hasOtherPartFields).toBe(false); // ❌ NO debe ver campos de VG2
        expect(hasOwnPartFields).toBe(true); // ✅ Debe ver sus propios campos

        console.log('✅ TEST 9 PASSED: Viewer Group 1 solo ve sus campos');
        console.log(`   - Campos recibidos: ${fields.length}`);
    });
});

// =============================================
// RESUMEN DE PRUEBAS
// =============================================
afterAll(() => {
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESUMEN DE PRUEBAS DE SEGURIDAD');
    console.log('='.repeat(70));
    console.log('Total de pruebas: 9');
    console.log('✅ Acceso bloqueado prematuramente');
    console.log('✅ Acceso permitido después de completar todos los viewers');
    console.log('✅ Filtrado de campos sensibles');
    console.log('✅ Tokens inválidos rechazados');
    console.log('✅ Viewers solo ven sus propios campos');
    console.log('='.repeat(70));
});
