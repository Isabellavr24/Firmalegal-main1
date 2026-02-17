/**
 * Script de verificación de certificado
 * Ejecutar: node test-cert.js
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

console.log('\n🔐 VERIFICACIÓN DE CERTIFICADO DIGITAL\n');
console.log('='.repeat(50));

// 1. Verificar variables de entorno
console.log('\n📋 Variables de entorno:');
const certPath = process.env.CERT_PATH;
const certPassword = process.env.CERT_PASSWORD;

console.log(`   CERT_PATH: ${certPath || '❌ NO CONFIGURADA'}`);
console.log(`   CERT_PASSWORD: ${certPassword ? '✅ Configurada (****)' : '❌ NO CONFIGURADA'}`);

if (!certPath) {
  console.log('\n❌ ERROR: Variable CERT_PATH no está configurada');
  console.log('   Edita backend/.env y agrega:');
  console.log('   CERT_PATH=certificates/PKISERVICES.p12');
  process.exit(1);
}

if (!certPassword) {
  console.log('\n⚠️  WARNING: Variable CERT_PASSWORD no está configurada');
  console.log('   Edita backend/.env y agrega:');
  console.log('   CERT_PASSWORD=tu_password');
}

// 2. Construir ruta absoluta
console.log('\n📁 Rutas:');
const fullPath = path.join(__dirname, certPath);
console.log(`   Relativa: ${certPath}`);
console.log(`   Absoluta: ${fullPath}`);

// 3. Verificar existencia
console.log('\n🔍 Verificando archivo:');
const exists = fs.existsSync(fullPath);

if (exists) {
  const stats = fs.statSync(fullPath);
  console.log(`   ✅ Archivo encontrado`);
  console.log(`   📦 Tamaño: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`   📅 Modificado: ${stats.mtime.toLocaleString()}`);

  // 4. Verificar permisos (solo Unix)
  if (process.platform !== 'win32') {
    const mode = stats.mode.toString(8).slice(-3);
    console.log(`   🔒 Permisos: ${mode}`);
    if (mode !== '600') {
      console.log(`   ⚠️  Recomendado: chmod 600 ${fullPath}`);
    }
  }

  console.log('\n✅ CERTIFICADO CONFIGURADO CORRECTAMENTE\n');
  console.log('Puedes iniciar el servidor con: npm start');

} else {
  console.log(`   ❌ Archivo NO encontrado`);
  console.log('\n❌ ERROR: Certificado no existe en la ubicación especificada\n');
  console.log('📝 Pasos para solucionar:');
  console.log('   1. Copia tu certificado .p12 a:');
  console.log(`      ${fullPath}`);
  console.log('   2. Verifica que el nombre sea exacto: PKISERVICES.p12');
  console.log('   3. Ejecuta este script de nuevo');

  // Verificar si la carpeta certificates existe
  const certsDir = path.join(__dirname, 'certificates');
  if (!fs.existsSync(certsDir)) {
    console.log('\n💡 Nota: La carpeta certificates/ no existe');
    console.log('   Créala con: mkdir certificates');
  }

  process.exit(1);
}

console.log('='.repeat(50) + '\n');
