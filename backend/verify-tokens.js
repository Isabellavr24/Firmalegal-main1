const mysql = require('mysql2/promise');

async function verifyTokens() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '', // Cambia esto si tienes contraseña
        database: 'firmalegalonline'
    });

    try {
        console.log('\n🔍 VERIFICACIÓN DE TOKENS - DOCUMENTO 248\n');
        console.log('='.repeat(80));

        // Obtener todos los destinatarios del documento 248
        const [recipients] = await connection.execute(
            `SELECT recipient_id, email, name, token, status, part_id, sent_at
             FROM document_recipients 
             WHERE document_id = 248
             ORDER BY recipient_id`
        );

        if (recipients.length === 0) {
            console.log('❌ No se encontraron destinatarios para el documento 248');
            return;
        }

        console.log(`\n📊 Total de destinatarios: ${recipients.length}\n`);

        // Mostrar cada destinatario con su token
        recipients.forEach((r, index) => {
            console.log(`\n${index + 1}. ${r.name} (${r.email})`);
            console.log(`   ├─ recipient_id: ${r.recipient_id}`);
            console.log(`   ├─ part_id: ${r.part_id || 'NULL'}`);
            console.log(`   ├─ status: ${r.status}`);
            console.log(`   ├─ sent_at: ${r.sent_at}`);
            console.log(`   └─ token: ${r.token}`);
            console.log(`   🔗 Link: http://localhost:3000/public-sign.html?token=${r.token}`);
        });

        console.log('\n' + '='.repeat(80));
        console.log('\n✅ Verificación completada\n');
        console.log('📋 INSTRUCCIONES:');
        console.log('   1. Abre los correos recibidos');
        console.log('   2. Copia el link de cada correo');
        console.log('   3. Compara el token del link con el token mostrado arriba');
        console.log('   4. Si coinciden, el sistema funciona correctamente ✓');
        console.log('   5. Si NO coinciden, hay un problema en el envío ✗\n');

        // Verificar que todos tengan part_id asignado
        const withoutPartId = recipients.filter(r => r.part_id === null);
        if (withoutPartId.length > 0) {
            console.log('\n⚠️  ADVERTENCIA: Algunos destinatarios no tienen part_id asignado:');
            withoutPartId.forEach(r => {
                console.log(`   - ${r.name} (${r.email})`);
            });
        } else {
            console.log('\n✅ Todos los destinatarios tienen part_id asignado correctamente');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await connection.end();
    }
}

verifyTokens();
