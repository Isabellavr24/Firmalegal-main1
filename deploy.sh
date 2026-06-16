#!/bin/bash

# ==========================================
# Script de Despliegue FirmaLegal Online
# Para IONOS con Docker
# ==========================================

set -e

echo "🚀 Iniciando despliegue de FirmaLegal Online..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funciones auxiliares
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    print_error "Error: No se encuentra package.json. Ejecuta este script desde la raíz del proyecto."
    exit 1
fi

print_success "Verificación de directorio OK"

# Verificar que existe .env
if [ ! -f ".env" ]; then
    print_warning "No se encontró archivo .env"
    if [ -f ".env.docker" ]; then
        echo "¿Deseas copiar .env.docker a .env? (s/n)"
        read -r response
        if [ "$response" = "s" ]; then
            cp .env.docker .env
            print_success ".env creado desde .env.docker"
            print_warning "IMPORTANTE: Edita .env y configura las contraseñas y API keys"
            exit 0
        fi
    fi
    print_error "Crea un archivo .env antes de continuar"
    exit 1
fi

print_success "Archivo .env encontrado"

# Verificar dump de base de datos
if [ ! -f "database-dump.sql" ]; then
    print_error "No se encontró database-dump.sql"
    print_warning "Coloca tu dump de base de datos en la raíz del proyecto con el nombre 'database-dump.sql'"
    exit 1
fi

print_success "Dump de base de datos encontrado"

# Verificar certificado
if [ ! -f "backend/certificates/CERT PERSONA JURIDICA PKI SERVICES 2 AÑOS.pfx" ]; then
    print_error "No se encontró el certificado digital"
    print_warning "Coloca el certificado en: backend/certificates/"
    exit 1
fi

print_success "Certificado digital encontrado"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker no está instalado"
    echo "Instala Docker con: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

print_success "Docker instalado"

# Verificar Docker Compose
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose no está instalado"
    exit 1
fi

print_success "Docker Compose instalado"

# Preguntar modo de despliegue
echo ""
echo "Selecciona el modo de despliegue:"
echo "1) Primera vez (build completo)"
echo "2) Actualización (rebuild app)"
echo "3) Reinicio rápido"
read -p "Opción (1-3): " deploy_mode

case $deploy_mode in
    1)
        print_warning "Despliegue completo - Esto tomará varios minutos..."

        # Detener contenedores existentes
        docker-compose down 2>/dev/null || true

        # Construir imágenes
        echo "📦 Construyendo imágenes Docker..."
        docker-compose build --no-cache

        # Levantar servicios
        echo "🚀 Levantando servicios..."
        docker-compose up -d

        print_success "Despliegue completo finalizado"
        ;;
    2)
        print_warning "Actualizando aplicación..."

        # Detener solo app
        docker-compose stop app

        # Reconstruir app
        echo "📦 Reconstruyendo aplicación..."
        docker-compose build app

        # Levantar app
        echo "🚀 Iniciando aplicación..."
        docker-compose up -d app

        print_success "Actualización finalizada"
        ;;
    3)
        print_warning "Reiniciando servicios..."
        docker-compose restart
        print_success "Reinicio completado"
        ;;
    *)
        print_error "Opción inválida"
        exit 1
        ;;
esac

# Esperar a que los servicios estén listos
echo ""
echo "⏳ Esperando a que los servicios estén listos..."
sleep 10

# Verificar estado
echo ""
echo "📊 Estado de los servicios:"
docker-compose ps

# Verificar health check
echo ""
echo "🏥 Verificando health check..."
if curl -s http://localhost:3000/health > /dev/null; then
    print_success "Health check OK"
else
    print_error "Health check falló"
    echo "Ver logs con: docker-compose logs -f app"
fi

# Mostrar logs recientes
echo ""
echo "📝 Últimos logs de la aplicación:"
docker-compose logs --tail=20 apphttps://meet.google.com/maf-ehfo-xrn
echo ""
print_success "¡Despliegue completado!"
echo ""
echo "📋 Comandos útiles:"
echo "  - Ver logs:        docker-compose logs -f app"
echo "  - Ver estado:      docker-compose ps"
echo "  - Detener todo:    docker-compose down"
echo "  - Reiniciar:       docker-compose restart"
echo ""
echo "🌐 La aplicación debería estar disponible en:"
echo "   http://localhost:3000"
echo ""
