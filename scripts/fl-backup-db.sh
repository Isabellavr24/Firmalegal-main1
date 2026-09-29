#!/bin/bash
# Respaldo diario de las bases de datos en producción.
#
# Se instala en el servidor como /usr/local/bin/fl-backup-db.sh (root, 700) y
# corre por cron. Cada volcado se comprueba antes de darlo por bueno: el script
# anterior escribía archivos de 0 bytes durante días sin que nadie lo notara,
# porque mandaba los errores a /dev/null.

set -uo pipefail

DESTINO="/root/backups/db"
RETENCION_DIAS=14
FECHA=$(date +%Y%m%d-%H%M)
LOG="/var/log/fl-backup-db.log"

# Cada base tiene su propio tamaño esperado: lo que delata un fallo no es un
# número absoluto sino un volcado muy por debajo de lo normal para esa base.

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

mkdir -p "$DESTINO"

respaldar() {
  local nombre="$1" contenedor="$2" comando="$3" minimo="$4"
  local archivo="$DESTINO/${nombre}-${FECHA}.sql.gz"

  if ! docker ps --format '{{.Names}}' | grep -qx "$contenedor"; then
    log "ERROR $nombre: el contenedor $contenedor no está corriendo"
    return 1
  fi

  # El comando se pasa por stdin para que las variables las expanda el shell del
  # contenedor y no se pierdan en el escapado de docker exec.
  printf '%s\n' "$comando" | docker exec -i "$contenedor" sh 2>>"$LOG" | gzip > "$archivo"

  local tam
  tam=$(stat -c %s "$archivo" 2>/dev/null || echo 0)
  if [ "$tam" -lt "$minimo" ]; then
    log "ERROR $nombre: volcado de solo $tam bytes — se descarta"
    rm -f "$archivo"
    return 1
  fi

  # Un .gz truncado supera el mínimo pero no descomprime: se verifica.
  if ! gzip -t "$archivo" 2>>"$LOG"; then
    log "ERROR $nombre: el archivo está corrupto — se descarta"
    rm -f "$archivo"
    return 1
  fi

  log "OK $nombre: $(numfmt --to=iec "$tam")"
  return 0
}

fallos=0

# Referencia al 2026-09-16: ~43 MB comprimido.
respaldar "firmalegal" "firmalegal-mysql" \
  'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers firmalegalonline' \
  30000000 \
  || fallos=$((fallos + 1))

# root no tiene acceso desde dentro del contenedor; se usa el usuario de la
# aplicación, que es el que el script anterior ya empleaba.
# Referencia al 2026-09-16: ~840 KB comprimido.
respaldar "validacion-identidad" "validacion-mariadb" \
  'mariadb-dump -u "$MARIADB_USER" -p"$MARIADB_PASSWORD" --single-transaction "$MARIADB_DATABASE"' \
  500000 \
  || fallos=$((fallos + 1))

# Solo se borran los antiguos si el respaldo de hoy quedó bien: ante un fallo es
# preferible conservar copias viejas a quedarse sin ninguna.
if [ "$fallos" -eq 0 ]; then
  find "$DESTINO" -name '*.sql.gz' -mtime +$RETENCION_DIAS -delete
  log "Purga de respaldos anteriores a $RETENCION_DIAS días"
else
  log "AVISO: $fallos respaldo(s) fallaron — no se purga nada"
fi

exit "$fallos"
