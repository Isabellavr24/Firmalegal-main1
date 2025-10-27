const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: '1234', 
    database: 'firmalegalonline'
});

db.connect(err => {
    if (err) {
        console.error('🔴 Error al conectar a MySQL:', err);
        process.exit(1);
    }
    console.log("🟢 Conectado a MariaDB\n");

    db.query('SELECT role_id, role_name, role_description FROM roles ORDER BY role_id ASC', (err, results) => {
        if (err) {
            console.error('❌ Error:', err);
            db.end();
            process.exit(1);
        }

        console.log(`📋 ROLES EN LA BASE DE DATOS (${results.length} total):\n`);
        console.log('='.repeat(80));
        
        results.forEach(role => {
            console.log(`\nID: ${role.role_id}`);
            console.log(`Nombre: ${role.role_name}`);
            console.log(`Descripción: ${role.role_description}`);
            console.log('-'.repeat(80));
        });

        db.end();
    });
});
