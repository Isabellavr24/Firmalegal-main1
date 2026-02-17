#!/bin/sh
# ==========================================
# Script de inicio para FirmaLegal Online
# Inicia: Node Server + Email Worker + Python Signer
# ==========================================

echo "🚀 Iniciando servicios de FirmaLegal Online..."

# Función para manejar señales de cierre
cleanup() {
    echo "🛑 Deteniendo servicios..."
    kill $EMAIL_WORKER_PID $PYTHON_SIGNER_PID $SERVER_PID 2>/dev/null
    wait
    exit 0
}

trap cleanup SIGTERM SIGINT

# 1. Iniciar Python Signer (FastAPI en puerto 8000)
echo "🐍 Iniciando Python Signer..."
cd /app/backend/python_signer
python3 main.py &
PYTHON_SIGNER_PID=$!
echo "   ✅ Python Signer iniciado (PID: $PYTHON_SIGNER_PID)"
cd /app

# Esperar 2 segundos para que Python inicie
sleep 2

# 2. Iniciar Email Worker
echo "📧 Iniciando Email Worker..."
node /app/backend/workers/email-worker.js &
EMAIL_WORKER_PID=$!
echo "   ✅ Email Worker iniciado (PID: $EMAIL_WORKER_PID)"

# 3. Iniciar Node Server (en primer plano)
echo "🌐 Iniciando Node.js Server..."
node /app/backend/server.js &
SERVER_PID=$!
echo "   ✅ Node Server iniciado (PID: $SERVER_PID)"

echo ""
echo "✅ Todos los servicios iniciados correctamente:"
echo "   - Python Signer: http://localhost:8000"
echo "   - Email Worker: Procesando en background"
echo "   - Node Server: http://localhost:3000"
echo ""

# Esperar a que todos los procesos terminen
wait $SERVER_PID $EMAIL_WORKER_PID $PYTHON_SIGNER_PID
