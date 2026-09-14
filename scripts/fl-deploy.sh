#!/bin/bash
# Despliegue con rollback automático.
# Se instala en el servidor como /usr/local/bin/fl-deploy.sh (root, chmod 700).
# Uso: fl-deploy.sh <commit-sha>

set -euo pipefail

COMMIT="${1:?Falta el commit SHA}"
APP_DIR="/root/firmalegal"
HEALTH_URL="http://localhost:3000/health"
REINTENTOS=12
ESPERA=5

# La configuración de nginx difiere entre ambientes (DEV enruta proyectos que
# PROD no tiene). El deploy la preserva en lugar de sobrescribirla.
PRESERVAR="nginx/nginx.conf"

cd "$APP_DIR"

ANTERIOR=$(git rev-parse HEAD)
echo "Versión actual: $ANTERIOR"
echo "Desplegando:    $COMMIT"

RESPALDO=$(mktemp -d)
for archivo in $PRESERVAR; do
  [ -f "$archivo" ] && cp --parents "$archivo" "$RESPALDO/"
done

restaurar_preservados() {
  for archivo in $PRESERVAR; do
    [ -f "$RESPALDO/$archivo" ] && cp "$RESPALDO/$archivo" "$archivo"
  done
}
trap 'rm -rf "$RESPALDO"' EXIT

comprobar_salud() {
  for i in $(seq 1 $REINTENTOS); do
    if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null 2>&1; then
      echo "Healthcheck OK (intento $i)"
      return 0
    fi
    sleep $ESPERA
  done
  return 1
}

revertir() {
  echo "FALLO: revirtiendo a $ANTERIOR"
  git reset --hard "$ANTERIOR"
  restaurar_preservados
  docker compose up -d --build app
  if comprobar_salud; then
    echo "Rollback completado. La versión anterior está activa."
  else
    echo "CRÍTICO: el rollback tampoco responde. Requiere intervención manual."
  fi
  exit 1
}

git fetch origin
git reset --hard "$COMMIT"
restaurar_preservados

# Solo se reconstruye la app: mysql y redis no cambian entre despliegues.
docker compose up -d --build app || revertir

comprobar_salud || revertir

echo "Despliegue exitoso: $COMMIT"
docker image prune -f > /dev/null 2>&1 || true
