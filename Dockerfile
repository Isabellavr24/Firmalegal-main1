# ==========================================
# DOCKERFILE PARA FIRMALEGAL ONLINE
# Optimizado para producción en IONOS
# ==========================================

# Etapa 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# ==========================================
# Etapa 2: Producción
FROM node:18-alpine

# Instalar Python 3 y dependencias del sistema
RUN apk add --no-cache \
    python3 \
    py3-pip \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev \
    openssl-dev \
    g++ \
    make

WORKDIR /app

# Copiar node_modules desde builder
COPY --from=builder /app/node_modules ./node_modules

# Copiar requirements de Python primero
COPY backend/python_signer/requirements.txt ./backend/python_signer/

# Instalar dependencias de Python directamente en Alpine Python 3.12
RUN pip3 install --no-cache-dir --break-system-packages -r backend/python_signer/requirements.txt

# Copiar código de la aplicación
COPY backend ./backend
COPY frontend ./frontend
COPY package*.json ./

# Copiar script de inicio
COPY start-services.sh ./start-services.sh

# Copiar archivos de configuración
COPY .env.production .env

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Crear directorios necesarios con permisos de escritura y dar ownership
RUN mkdir -p uploads/documents uploads/signed uploads/temp uploads/pagares uploads/templates && \
    mkdir -p backend/certificates && \
    chown -R nodejs:nodejs /app && \
    chmod -R 775 uploads backend/certificates && \
    chmod +x start-services.sh

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicio - Ejecuta el script que lanza los 3 servicios
CMD ["sh", "start-services.sh"]
