@echo off
REM ========================================
REM FIRMALEGAL - INICIO DE SERVICIOS
REM ========================================

echo.
echo ========================================
echo   FIRMALEGAL - INICIANDO SERVICIOS
echo ========================================
echo.

REM Verificar Python
echo [1/3] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Python no esta instalado o no esta en el PATH
    echo.
    echo Instala Python 3.9+ desde: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)
echo      OK - Python instalado
echo.

REM Verificar Node.js
echo [2/3] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Node.js no esta instalado o no esta en el PATH
    echo.
    echo Instala Node.js desde: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo      OK - Node.js instalado
echo.

REM Verificar e instalar dependencias Python (solo primera vez)
echo [3/3] Verificando entorno Python...
if not exist "backend\python_signer\venv" (
    echo      Creando entorno virtual Python...
    cd backend\python_signer
    python -m venv venv
    call venv\Scripts\activate
    echo      Instalando dependencias Python...
    pip install -r requirements.txt --quiet
    cd ..\..
    echo      OK - Entorno Python creado
) else (
    echo      OK - Entorno Python ya existe
)
echo.

echo ========================================
echo   INICIANDO SERVICIOS...
echo ========================================
echo.

REM Iniciar Python Signer en una nueva ventana
echo [*] Iniciando Python Signer Service (Puerto 5001)...
start "Python Signer Service" cmd /k "cd backend\python_signer && venv\Scripts\activate && python main.py"

REM Esperar 5 segundos para que Python inicie
timeout /t 5 /nobreak >nul

REM Iniciar Node.js Backend en una nueva ventana
echo [*] Iniciando Node.js Backend (Puerto 3000)...
start "Node.js Backend" cmd /k "npm run dev"

echo.
echo ========================================
echo   SERVICIOS INICIADOS
echo ========================================
echo.
echo   Python Signer:  http://localhost:5001
echo   Node Backend:   http://localhost:3000
echo.
echo   Para detener los servicios:
echo   - Cierra las ventanas que se abrieron
echo   - O presiona Ctrl+C en cada ventana
echo.
echo ========================================
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause >nul
