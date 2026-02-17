╔══════════════════════════════════════════════════════════════════╗
║                  FIRMALEGAL ONLINE - DOCKER                      ║
║              Proyecto Dockerizado para IONOS                     ║
╚══════════════════════════════════════════════════════════════════╝

📦 ARCHIVOS DOCKER CREADOS
══════════════════════════════════════════════════════════════════

1. Dockerfile                     - Imagen de la aplicación
2. docker-compose.yml             - Configuración completa (con Nginx)
3. docker-compose.simple.yml      - Configuración simple (sin Nginx)
4. .dockerignore                  - Archivos excluidos del build
5. .env.docker                    - Template de variables de entorno
6. .env.production                - Variables para producción
7. nginx/nginx.conf               - Configuración de Nginx
8. deploy.sh                      - Script automático de despliegue
9. DEPLOY-DOCKER.md               - Guía completa de despliegue


🚀 INICIO RÁPIDO
══════════════════════════════════════════════════════════════════

OPCIÓN 1: Usando el script automático (Recomendado)
──────────────────────────────────────────────────────
chmod +x deploy.sh
./deploy.sh


OPCIÓN 2: Manual
──────────────────────────────────────────────────────
1. Configurar variables de entorno:
   cp .env.docker .env
   nano .env  # Editar contraseñas y API keys

2. Colocar dump de base de datos:
   cp /ruta/tu-dump.sql database-dump.sql

3. Levantar servicios:
   docker-compose up -d

4. Ver logs:
   docker-compose logs -f app


📋 REQUISITOS PREVIOS
══════════════════════════════════════════════════════════════════

✓ Docker instalado
✓ Docker Compose instalado
✓ Dump de base de datos (database-dump.sql)
✓ Certificado digital en backend/certificates/
✓ Variables de entorno configuradas en .env


🔧 CONFIGURACIÓN NECESARIA EN .ENV
══════════════════════════════════════════════════════════════════

Variables CRÍTICAS que debes configurar:

1. MYSQL_ROOT_PASSWORD       → Contraseña segura para MySQL root
2. DB_PASSWORD                → Contraseña para usuario de BD
3. SENDGRID_API_KEY           → Tu API key de SendGrid
4. JWT_SECRET                 → Generar con: openssl rand -base64 32
5. APP_URL                    → https://tu-dominio-ionos.com


📦 SERVICIOS INCLUIDOS
══════════════════════════════════════════════════════════════════

🐬 MySQL 8.0
   - Puerto: 3306
   - Base de datos: firmalegalonline
   - Volumen persistente para datos

📮 Redis 7
   - Puerto: 6379
   - Para colas de emails
   - Persistencia con AOF

🌐 Node.js App
   - Puerto: 3000
   - Health check en /health
   - Volúmenes para uploads y certificados

🔒 Nginx (Opcional)
   - Puertos: 80, 443
   - Reverse proxy
   - SSL/TLS ready


🌐 PUERTOS EXPUESTOS
══════════════════════════════════════════════════════════════════

3000  → Aplicación Node.js
3306  → MySQL
6379  → Redis
80    → Nginx HTTP (si se usa)
443   → Nginx HTTPS (si se usa)


📁 ESTRUCTURA DE VOLÚMENES
══════════════════════════════════════════════════════════════════

./uploads                  → PDFs subidos y firmados
./backend/certificates     → Certificado digital (readonly)
mysql_data (volumen)       → Datos de MySQL
redis_data (volumen)       → Datos de Redis
app_logs (volumen)         → Logs de la aplicación


🔐 SEGURIDAD
══════════════════════════════════════════════════════════════════

✓ Contenedor corre con usuario no-root (nodejs:1001)
✓ Variables sensibles en .env (no en código)
✓ Certificados con permisos readonly
✓ Health checks configurados
✓ Nginx con headers de seguridad
✓ Rate limiting en endpoints


📊 COMANDOS ÚTILES
══════════════════════════════════════════════════════════════════

Ver estado:
  docker-compose ps

Ver logs en tiempo real:
  docker-compose logs -f
  docker-compose logs -f app
  docker-compose logs -f mysql

Reiniciar servicios:
  docker-compose restart
  docker-compose restart app

Detener todo:
  docker-compose down

Detener y eliminar volúmenes (CUIDADO):
  docker-compose down -v

Reconstruir aplicación:
  docker-compose build app
  docker-compose up -d app

Backup de MySQL:
  docker exec firmalegal-mysql mysqldump -u root -p \
    firmalegalonline > backup-$(date +%Y%m%d).sql

Entrar al contenedor:
  docker exec -it firmalegal-app sh
  docker exec -it firmalegal-mysql bash

Ver recursos:
  docker stats


🐛 TROUBLESHOOTING
══════════════════════════════════════════════════════════════════

❌ Error: "database-dump.sql not found"
   → Coloca tu dump SQL en la raíz con ese nombre exacto

❌ Error: "certificate not found"
   → Verifica que el .pfx esté en backend/certificates/

❌ MySQL no inicia
   → Ver logs: docker-compose logs mysql
   → Verificar contraseña en .env

❌ App no conecta a MySQL
   → Esperar a que MySQL termine de inicializar
   → Ver: docker-compose logs -f

❌ Health check failing
   → curl http://localhost:3000/health
   → Ver logs de la app

❌ Permisos en uploads/
   → sudo chown -R 1001:1001 uploads/


📖 DOCUMENTACIÓN COMPLETA
══════════════════════════════════════════════════════════════════

Para una guía paso a paso detallada, consulta:
→ DEPLOY-DOCKER.md


🎯 VERIFICACIÓN POST-DESPLIEGUE
══════════════════════════════════════════════════════════════════

1. ✓ Todos los servicios corriendo:
   docker-compose ps

2. ✓ Health check OK:
   curl http://localhost:3000/health

3. ✓ Base de datos inicializada:
   docker exec -it firmalegal-mysql mysql -u root -p -e "SHOW DATABASES;"

4. ✓ Redis funcionando:
   docker exec -it firmalegal-redis redis-cli ping

5. ✓ Aplicación accesible:
   Abrir navegador en http://localhost:3000


✨ PRODUCCIÓN EN IONOS
══════════════════════════════════════════════════════════════════

Para producción, asegúrate de:

1. Configurar dominio apuntando al servidor
2. Instalar certificado SSL en nginx/ssl/
3. Editar nginx.conf con tu dominio
4. Descomentar redirección HTTPS
5. Configurar firewall (ufw allow 80, 443)
6. Configurar backups automáticos de MySQL
7. Monitorear logs regularmente


💡 TIPS
══════════════════════════════════════════════════════════════════

→ Usa docker-compose.simple.yml para pruebas sin Nginx
→ Genera passwords seguros: openssl rand -base64 32
→ Haz backups antes de actualizar
→ Mantén .env fuera del control de versiones
→ Usa docker system prune para limpiar espacio


📞 SOPORTE
══════════════════════════════════════════════════════════════════

Si tienes problemas:
1. Revisar logs: docker-compose logs -f
2. Verificar .env
3. Comprobar health checks
4. Consultar DEPLOY-DOCKER.md


════════════════════════════════════════════════════════════════
¡Listo para desplegar en IONOS! 🚀
════════════════════════════════════════════════════════════════
