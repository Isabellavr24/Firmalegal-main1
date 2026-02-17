/**
 * =============================================
 * SCRIPT DE VERIFICACIÓN DE CONFIGURACIÓN
 * Ejecutar: node verify-config.js
 * =============================================
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('\n' + '='.repeat(70));
console.log('🔍 VERIFICACIÓN DE CONFIGURACIÓN - FirmaLegal');
console.log('='.repeat(70) + '\n');

let allOk = true;

// =============================================
// 1. VERIFICAR ARCHIVO .ENV
// =============================================
console.log('📄 1. Verificando archivo .env...');

if (!fs.existsSync(path.join(__dirname, '.env'))) {
    console.log('   ❌ El archivo .env NO existe');
    console.log('   💡 Ejecuta: cp .env.example .env');
    allOk = false;
} else {
    console.log('   ✅ Archivo .env existe');
}

// =============================================
// 2. VERIFICAR CERTIFICADO
// =============================================
console.log('\n🔐 2. Verificando certificado digital...');

const certPathFromEnv = process.env.CERT_PATH || 'certificates/PKISERVICES.p12';
console.log(`   📝 CERT_PATH en .env: ${certPathFromEnv}`);

// Resolver ruta
let certPath;
if (path.isAbsolute(certPathFromEnv)) {
    certPath = certPathFromEnv;
    console.log('   ℹ️  Usando ruta absoluta');
} else {
    certPath = path.join(__dirname, certPathFromEnv);
    console.log('   ℹ️  Usando ruta relativa (✅ Recomendado)');
}

console.log(`   📂 Ruta completa: ${certPath}`);

if (!fs.existsSync(certPath)) {
    console.log('   ❌ El certificado NO existe en esa ubicación');
    console.log(`   💡 Opciones:`);
    console.log(`      1. Cambia CERT_PATH en .env a: certificates/PKISERVICES.p12`);
    console.log(`      2. O copia tu certificado a: backend/certificates/`);
    allOk = false;
} else {
    const stats = fs.statSync(certPath);
    console.log(`   ✅ Certificado encontrado (${(stats.size / 1024).toFixed(2)} KB)`);
}

// Verificar password
const certPassword = process.env.CERT_PASSWORD;
if (!certPassword) {
    console.log('   ⚠️  CERT_PASSWORD no está configurada en .env');
    allOk = false;
} else {
    console.log(`   ✅ CERT_PASSWORD configurada (${certPassword.length} caracteres)`);
}

// =============================================
// 3. VERIFICAR BASE DE DATOS
// =============================================
console.log('\n💾 3. Verificando configuración de base de datos...');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'firmalegalonline'
};

console.log(`   📝 Host: ${dbConfig.host}:${dbConfig.port}`);
console.log(`   📝 Usuario: ${dbConfig.user}`);
console.log(`   📝 Base de datos: ${dbConfig.database}`);
console.log(`   📝 Password: ${dbConfig.password ? '****** (configurada)' : '(vacía)'}`);

// Intentar conectar (opcional, requiere mysql2)
try {
    const mysql = require('mysql2');
    const connection = mysql.createConnection(dbConfig);

    connection.connect((err) => {
        if (err) {
            console.log(`   ❌ No se pudo conectar a MySQL: ${err.message}`);
            console.log(`   💡 Verifica que MySQL esté ejecutándose`);
            allOk = false;
        } else {
            console.log('   ✅ Conexión a MySQL exitosa');
            connection.end();
        }
    });
} catch (error) {
    console.log('   ⚠️  No se pudo verificar conexión (mysql2 no instalado)');
}

// =============================================
// 4. VERIFICAR SENDGRID
// =============================================
console.log('\n📧 4. Verificando configuración de SendGrid...');

const sendGridKey = process.env.SENDGRID_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

if (!sendGridKey || sendGridKey.includes('XXXX')) {
    console.log('   ⚠️  SENDGRID_API_KEY no configurada (los emails NO se enviarán)');
    console.log('   💡 Configúrala si necesitas enviar emails');
} else if (!sendGridKey.startsWith('SG.')) {
    console.log('   ❌ SENDGRID_API_KEY tiene formato inválido (debe empezar con "SG.")');
    allOk = false;
} else {
    console.log(`   ✅ SENDGRID_API_KEY configurada (${sendGridKey.substring(0, 10)}...)`);
}

if (!emailFrom) {
    console.log('   ⚠️  EMAIL_FROM no configurado');
} else {
    console.log(`   ✅ EMAIL_FROM: ${emailFrom}`);
}

// =============================================
// 5. VERIFICAR SERVICIOS PYTHON
// =============================================
console.log('\n🐍 5. Verificando configuración de Python Signer...');

const pythonUrl = process.env.PYTHON_SIGNER_URL || 'http://127.0.0.1:5001';
console.log(`   📝 URL: ${pythonUrl}`);

// Verificar si el servicio Python está ejecutándose (opcional)
const http = require('http');
const url = new URL(pythonUrl);

const req = http.get({
    hostname: url.hostname,
    port: url.port,
    path: '/health',
    timeout: 2000
}, (res) => {
    if (res.statusCode === 200) {
        console.log('   ✅ Servicio Python está ejecutándose');
    } else {
        console.log('   ⚠️  Servicio Python respondió con código:', res.statusCode);
    }
});

req.on('error', (err) => {
    console.log('   ⚠️  Servicio Python NO está ejecutándose');
    console.log('   💡 Inícialo con: cd backend/python_signer && python main.py');
});

req.on('timeout', () => {
    console.log('   ⚠️  Timeout al conectar con Python Signer');
    req.destroy();
});

// =============================================
// 6. VERIFICAR REDIS (para envío masivo)
// =============================================
setTimeout(() => {
    console.log('\n🔴 6. Verificando Redis (para envío masivo)...');

    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT || 6379;

    console.log(`   📝 Host: ${redisHost}:${redisPort}`);

    try {
        const redis = require('redis');
        const client = redis.createClient({
            socket: {
                host: redisHost,
                port: redisPort
            }
        });

        client.on('error', (err) => {
            console.log('   ⚠️  Redis NO está ejecutándose');
            console.log('   💡 Envío masivo NO funcionará sin Redis');
            console.log('   💡 Ver: INSTALACION_ENVIO_MASIVO.md');
        });

        client.connect().then(() => {
            console.log('   ✅ Redis está ejecutándose');
            client.quit();
        }).catch((err) => {
            console.log('   ⚠️  No se pudo conectar a Redis');
        });

    } catch (error) {
        console.log('   ⚠️  Redis no instalado (opcional para envío masivo)');
    }

    // =============================================
    // RESUMEN FINAL
    // =============================================
    setTimeout(() => {
        console.log('\n' + '='.repeat(70));
        if (allOk) {
            console.log('✅ CONFIGURACIÓN CORRECTA - ¡Todo listo para iniciar el servidor!');
            console.log('\nPróximos pasos:');
            console.log('   1. Inicia el servidor: npm start');
            console.log('   2. Inicia Python Signer: cd python_signer && python main.py');
            console.log('   3. Abre http://localhost:3000 en tu navegador');
        } else {
            console.log('⚠️  HAY PROBLEMAS EN LA CONFIGURACIÓN');
            console.log('\nRevisa los mensajes arriba y corrige los errores marcados con ❌');
            console.log('Ver guía completa: CONFIGURACION_CERTIFICADOS.md');
        }
        console.log('='.repeat(70) + '\n');

        process.exit(allOk ? 0 : 1);
    }, 2000);

}, 1000);
