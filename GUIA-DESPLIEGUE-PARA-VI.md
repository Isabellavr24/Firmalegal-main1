# Guía de despliegue para Validación de Identidad

**6 de octubre de 2026** — escrito para el equipo de VI

Esto es el mismo sistema que usa FirmaLegal, descrito paso a paso para que lo
montéis igual. Todo lo que hay aquí está funcionando en producción desde
mediados de septiembre.

---

## Por qué hace falta

Hoy VI se despliega copiando archivos por SSH. Eso trae tres problemas que ya
nos están costando:

**1. DEV y PROD han divergido.** Producción tiene mejoras de velocidad y
validación directa desde el enlace que desarrollo no tiene. Desarrollo tiene
el envío por WhatsApp que producción no tiene. Hay código nuevo y viejo
mezclado en los dos lados, y nadie sabe con certeza qué hay en cada uno.

**2. No se puede volver atrás.** Si un despliegue rompe algo, no hay una
versión anterior a la que regresar: hay que recordar qué archivos se tocaron.

**3. Lo que se copia a mano se pierde.** Si alguien edita un archivo
directamente en el servidor y después se despliega encima, ese cambio
desaparece sin rastro.

FirmaLegal tuvo exactamente estos tres problemas. El sistema que describe esta
guía los resolvió.

---

## Los tres objetivos, en orden

El usuario los planteó así, y el orden importa:

### Objetivo 1 — Traer producción a desarrollo sin romper lo que ya hay

Producción tiene código que desarrollo no tiene. Antes de nada hay que
recuperarlo, porque si se despliega desarrollo encima de producción se pierde.

### Objetivo 2 — Dejar GitHub al día con lo que corre en los servidores

Que la rama `main` del repositorio sea exactamente lo que está en el servidor
de producción, y `develop` lo que está en desarrollo. Desde ese momento el
repositorio es la verdad y los servidores son copias.

### Objetivo 3 — Hacer el merge a producción a la vez que FirmaLegal

Los dos sistemas dependen el uno del otro. Las rutas nuevas de VI son las que
usa el código de FirmaLegal de esta semana, así que tienen que llegar juntos.

Y al hacerlo, **no perder nada de la base de datos**. Ya pasó una vez.

---

# PARTE 1 — Recuperar lo que hay en producción

Antes de tocar nada, hay que saber qué hay en cada sitio.

## 1.1 Mirar sin cambiar nada

En el servidor de **producción**:

```bash
cd /root/validacion-identidad
git status
git log --oneline -5
git diff --stat
```

Lo que interesa:

- **`git status`** dice si hay archivos modificados que no están en ningún
  commit. Esos son los que se perderían.
- **`git diff --stat`** los lista con cuántas líneas cambiaron.

Lo mismo en **desarrollo**. Después, comparad.

## 1.2 Guardar lo de producción antes de nada

Si producción tiene cambios sin commitear, **guardadlos antes de seguir**:

```bash
cd /root/validacion-identidad
git stash list                    # por si ya hay algo guardado
git add -A
git commit -m "chore: lo que estaba en el servidor de produccion sin commitear"
```

Ese commit no se sube todavía. Es un seguro: si algo sale mal, ahí está.

## 1.3 Hacer copia de la base de datos

**Esto no es opcional.** Antes de cualquier despliegue:

```bash
docker exec validacion-mariadb mariadb-dump \
  -u root -p'LA_CLAVE' --single-transaction --routines --triggers \
  validacion_identidad > /root/respaldo-vi-$(date +%Y%m%d-%H%M).sql

ls -lh /root/respaldo-vi-*.sql
```

Comprobad que el archivo pesa algo. Un volcado de 0 bytes no es un respaldo.

Y **contad las filas antes y después** de cualquier migración:

```sql
SELECT COUNT(*) FROM validaciones;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM vinculaciones;
```

Si después de desplegar alguno de esos números bajó, algo salió mal y hay que
restaurar.

---

# PARTE 2 — Las ramas

## 2.1 Cuáles son y qué significa cada una

```
main      → lo que corre en PRODUCCIÓN. Lo que llega aquí se despliega solo.
develop   → lo que corre en DESARROLLO. Lo que llega aquí se despliega solo.
```

No hay más ramas permanentes. El flujo normal es:

```
trabajas → push a develop → se despliega a DEV → se prueba
                                                    ↓
                                        merge develop → main
                                                    ↓
                                        se despliega a PROD
```

## 2.2 Partir de lo que ya hay

Si el repositorio de VI todavía no tiene esta estructura:

```bash
# En vuestra copia local, con el repositorio ya clonado
git checkout main
git pull origin main

# develop sale de main, no al revés
git checkout -b develop
git push -u origin develop
```

## 2.3 Reconciliar DEV y PROD

Este es el paso delicado y conviene hacerlo con calma.

**Primero**, llevad a `main` lo que de verdad está en producción:

```bash
# En el servidor de produccion
cd /root/validacion-identidad
git log --oneline -1          # anotad este SHA
```

Si ese commit no está en `main`, hay trabajo que recuperar. Las opciones, de
menos a más invasiva:

1. **Si producción solo tiene commits que faltan en `main`**: subirlos.
   ```bash
   git push origin HEAD:main
   ```

2. **Si producción tiene cambios sueltos** (el commit que hicisteis en 1.2):
   igual, subirlo a `main`.

3. **Si las dos ramas divergieron de verdad** —hay commits distintos en cada
   lado— hay que mirarlos uno a uno. **No hagáis un merge a ciegas.**

**Después**, traed esos cambios a `develop`:

```bash
git checkout develop
git merge main
# resolver conflictos si los hay, mirando cada uno
git push origin develop
```

En este punto `develop` tiene todo lo de producción **más** lo que ya tenía
desarrollo. Nada se ha perdido.

## 2.4 Comprobar que no falta nada

Antes de dar el paso por terminado:

```bash
# Que no quede nada de produccion fuera de main
git log --oneline main..<SHA-de-produccion>     # debe salir vacío

# Que develop tenga todo lo de main
git log --oneline main..develop                  # lo que falta por desplegar
git log --oneline develop..main                  # DEBE SALIR VACÍO
```

Si la última devuelve algo, `develop` se quedó atrás y al desplegar
perderíais eso.

---

# PARTE 3 — Los workflows de GitHub Actions

Dos archivos en `.github/workflows/`. Os los damos tal cual los usamos,
cambiando solo los nombres.

## 3.1 `deploy-dev.yml`

```yaml
name: Deploy a Desarrollo

on:
  push:
    branches: [develop]
  workflow_dispatch:

concurrency:
  group: deploy-dev
  cancel-in-progress: true

jobs:
  verificar:
    name: Verificaciones previas
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Validar sintaxis de backend
        run: |
          fallos=0
          while IFS= read -r archivo; do
            if ! node --check "$archivo" 2>/tmp/err; then
              echo "::error file=$archivo::$(head -3 /tmp/err | tr '\n' ' ')"
              fallos=$((fallos + 1))
            fi
          done < <(find backend -name '*.js' -not -path '*/node_modules/*')
          echo "Archivos con error de sintaxis: $fallos"
          test "$fallos" -eq 0

  desplegar:
    name: Desplegar
    needs: verificar
    runs-on: ubuntu-latest
    steps:
      - name: Levantar VPN
        run: |
          sudo apt-get update -qq && sudo apt-get install -y -qq wireguard-tools
          # El secret puede venir en varias líneas, en una sola, o con '|' como
          # separador. Se normaliza a una línea por campo en los tres casos.
          crudo=$(printf '%s' "${{ secrets.DEV_WG_CONFIG }}" \
            | tr '|' '\n' \
            | sed -E 's/(PrivateKey|Address|PublicKey|PresharedKey|AllowedIPs|Endpoint|PersistentKeepalive|\[Interface\]|\[Peer\])/\n\1/g' \
            | sed -E 's/[[:space:]]*=[[:space:]]*/=/' \
            | sed -E 's/[[:space:]]+$//')
          campo() { printf '%s\n' "$crudo" | sed -n "s/^$1=//p" | head -1; }
          {
            echo "[Interface]"
            echo "PrivateKey = $(campo PrivateKey)"
            echo "Address = $(campo Address)"
            echo ""
            echo "[Peer]"
            echo "PublicKey = $(campo PublicKey)"
            echo "PresharedKey = $(campo PresharedKey)"
            echo "AllowedIPs = $(campo AllowedIPs)"
            echo "Endpoint = $(campo Endpoint)"
            echo "PersistentKeepalive = 25"
          } | sudo tee /etc/wireguard/wg0.conf > /dev/null
          sudo chmod 600 /etc/wireguard/wg0.conf
          # Diagnóstico sin exponer claves: confirma que cada campo tiene valor.
          sudo sed -E 's/= .+/= <presente>/' /etc/wireguard/wg0.conf
          sudo wg-quick up wg0
          # wg-quick retorna antes de que el túnel esté operativo. Se comprueba
          # contra el puerto SSH y no con ping: el firewall solo admite los
          # puertos declarados desde la VPN, así que ICMP no responde aunque
          # el túnel esté levantado.
          host=$(printf '%s' "${{ secrets.DEV_HOST }}" | tr -d '[:space:]')
          puerto=$(printf '%s' "${{ secrets.DEV_SSH_PORT }}" | tr -cd '0-9')
          for i in $(seq 1 15); do
            nc -z -w3 "$host" "$puerto" >/dev/null 2>&1 && exit 0
            sleep 2
          done
          echo "::error::La VPN no estableció conexión con el servidor"
          exit 1

      - name: Configurar clave SSH
        run: |
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.DEV_SSH_KEY }}" | tr '|' '\n' | sed '/^$/d' > ~/.ssh/id_ed25519
          printf '\n' >> ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          # Una clave pegada sin saltos de línea es inservible: se detecta acá
          # en vez de fallar más adelante con un error opaco de permisos.
          if ! ssh-keygen -y -f ~/.ssh/id_ed25519 > /dev/null 2>&1; then
            echo "::error::DEV_SSH_KEY no es una clave válida (¿se perdieron los saltos de línea al copiarla?)"
            exit 1
          fi
          host=$(printf '%s' "${{ secrets.DEV_HOST }}" | tr -d '[:space:]')
          puerto=$(printf '%s' "${{ secrets.DEV_SSH_PORT }}" | tr -cd '0-9')
          ssh-keyscan -p "$puerto" "$host" 2>/dev/null >> ~/.ssh/known_hosts || true
          if [ ! -s ~/.ssh/known_hosts ]; then
            echo "::error::ssh-keyscan no obtuvo la clave del servidor"
            exit 1
          fi
          echo "Clave SSH y known_hosts listos."

      - name: Desplegar con rollback automático
        env:
          SSH_PORT: ${{ secrets.DEV_SSH_PORT }}
          SSH_HOST: ${{ secrets.DEV_HOST }}
          COMMIT: ${{ github.sha }}
        run: |
          host=$(printf '%s' "$SSH_HOST" | tr -d '[:space:]')
          puerto=$(printf '%s' "$SSH_PORT" | tr -cd '0-9')
          ssh -i ~/.ssh/id_ed25519 -p "$puerto" -o BatchMode=yes "firmalegal@$host" "sudo /usr/local/bin/vi-deploy.sh $COMMIT"

      - name: Cerrar VPN
        if: always()
        run: sudo wg-quick down wg0 || true
```

## 3.2 `deploy-prod.yml`

El mismo, con tres diferencias que importan:

```yaml
name: Deploy a Producción

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      confirmar:
        description: 'Escribir DESPLEGAR para confirmar'
        required: true
        default: ''

concurrency:
  group: deploy-prod
  cancel-in-progress: false      # NO se cancela un despliegue a producción

jobs:
  verificar:
    name: Verificaciones previas
    runs-on: ubuntu-latest
    steps:
      # Solo aplica al disparo manual: un push a main despliega sin confirmar.
      - name: Confirmar intención de desplegar
        if: github.event_name == 'workflow_dispatch'
        env:
          CONFIRMACION: ${{ inputs.confirmar }}
        run: |
          if [ "$CONFIRMACION" != "DESPLEGAR" ]; then
            echo "::error::Para desplegar a producción hay que escribir DESPLEGAR"
            exit 1
          fi

      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Validar sintaxis de backend
        run: |
          fallos=0
          while IFS= read -r archivo; do
            if ! node --check "$archivo" 2>/tmp/err; then
              echo "::error file=$archivo::$(head -3 /tmp/err | tr '\n' ' ')"
              fallos=$((fallos + 1))
            fi
          done < <(find backend -name '*.js' -not -path '*/node_modules/*')
          test "$fallos" -eq 0

      - name: Detectar marcadores de trabajo sin terminar
        run: |
          if grep -rn 'NO-SUBIR-A-PROD' --include='*.js' --include='*.html' backend frontend; then
            echo "::error::Hay código marcado como no apto para producción"
            exit 1
          fi

  desplegar:
    name: Desplegar
    needs: verificar
    runs-on: ubuntu-latest
    environment: production        # permite exigir aprobación manual
    steps:
      # ... idéntico al de DEV, cambiando DEV_ por PROD_ en los secrets
      # y llamando a vi-deploy.sh igual
```

**Las tres diferencias:**

1. `cancel-in-progress: false` — nunca se corta un despliegue a producción a
   medias.
2. El campo de confirmación en el disparo manual.
3. `environment: production` — en *Settings → Environments* podéis añadir
   "Required reviewers" para que cada despliegue espere aprobación.

## 3.3 Los secrets

En *Settings → Secrets and variables → Actions*:

| Secret | Qué es |
|---|---|
| `DEV_HOST` | la IP del servidor de desarrollo dentro de la VPN |
| `DEV_SSH_PORT` | el puerto SSH de desarrollo |
| `DEV_SSH_KEY` | la clave privada Ed25519, completa |
| `DEV_WG_CONFIG` | el archivo `.conf` de WireGuard, completo |
| `PROD_HOST` | la IP del servidor de producción dentro de la VPN |
| `PROD_SSH_KEY` | la clave privada de producción |
| `PROD_WG_CONFIG` | el `.conf` de WireGuard de producción |

**Sobre pegar las claves:** GitHub a veces come los saltos de línea. Los
workflows aceptan `|` como separador para poder pegarlas en un solo renglón:

```
-----BEGIN OPENSSH PRIVATE KEY-----|b3BlbnNzaC1rZXk...|...|-----END OPENSSH PRIVATE KEY-----
```

Y comprueban que la clave sea válida antes de usarla, para que el fallo sea
claro y no un error de permisos.

---

# PARTE 4 — El script del servidor

En los dos servidores, como `/usr/local/bin/vi-deploy.sh`, propiedad de root
y con permisos `700`.

```bash
#!/bin/bash
# Despliegue con rollback automático.
# Uso: vi-deploy.sh <commit-sha>

set -euo pipefail

COMMIT="${1:?Falta el commit SHA}"
APP_DIR="/root/validacion-identidad"
HEALTH_URL="http://localhost:3000/validacion/api/health"   # ajustad a vuestra ruta
REINTENTOS=12
ESPERA=5

# Archivos cuya versión del servidor NO se sobrescribe. La configuración de
# nginx difiere entre ambientes, así que el deploy la preserva.
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

# No se admite desplegar código anterior al que ya está corriendo. Un
# despliegue así revierte en silencio arreglos que ya estaban en producción.
# Para volver atrás deliberadamente: FORZAR_RETROCESO=1 vi-deploy.sh <sha>
if git merge-base --is-ancestor "$COMMIT" "$ANTERIOR" 2>/dev/null && \
   [ "$(git rev-parse "$COMMIT")" != "$(git rev-parse "$ANTERIOR")" ]; then
  if [ "${FORZAR_RETROCESO:-0}" != "1" ]; then
    echo "RECHAZADO: $COMMIT es anterior a lo que está corriendo ($ANTERIOR)."
    echo "Si el retroceso es intencional: FORZAR_RETROCESO=1 $0 $COMMIT"
    exit 1
  fi
  echo "AVISO: retroceso forzado a un commit anterior."
fi

git reset --hard "$COMMIT"
restaurar_preservados

# Solo se reconstruye la app: la base de datos no cambia entre despliegues.
docker compose up -d --build app || revertir

comprobar_salud || revertir

echo "Despliegue exitoso: $COMMIT"
docker image prune -f > /dev/null 2>&1 || true
```

Instalación:

```bash
sudo cp vi-deploy.sh /usr/local/bin/vi-deploy.sh
sudo chown root:root /usr/local/bin/vi-deploy.sh
sudo chmod 700 /usr/local/bin/vi-deploy.sh
```

Y permitir que el usuario de despliegue lo ejecute sin contraseña:

```bash
sudo visudo -f /etc/sudoers.d/vi-deploy
```

```
firmalegal ALL=(root) NOPASSWD: /usr/local/bin/vi-deploy.sh
```

## 4.1 Lo que hace cada parte, y por qué

**`set -euo pipefail`** — el script se detiene al primer error en vez de
seguir con un estado a medias.

**El respaldo de `PRESERVAR`** — `git reset --hard` borra los cambios locales.
Si `nginx.conf` difiere entre ambientes, se perdería. Se guarda antes y se
restaura después.

> Cuidado con los bind mounts de Docker: si `nginx.conf` está montado dentro
> de un contenedor, `cp` cambia el inodo y el contenedor sigue viendo el
> archivo viejo. Usad `cp` sobre el archivo existente, no `mv`.

**El rechazo de retrocesos** — así se perdieron correcciones en FirmaLegal:
alguien desplegó un commit viejo y revirtió en silencio arreglos que ya
estaban en producción. El script lo detecta y lo rechaza salvo que se fuerce.

**El healthcheck y el rollback** — si la app no responde tras desplegar, el
script vuelve solo a la versión anterior. Doce intentos cada cinco segundos:
un minuto de margen para que arranque.

---

# PARTE 5 — La VPN

Los dos servidores solo son accesibles por WireGuard. GitHub Actions necesita
su propio peer.

## 5.1 Crear el peer para Actions

En el servidor (el que hace de servidor WireGuard):

```bash
# Generar el par de claves para el nuevo peer
wg genkey | tee /tmp/actions.key | wg pubkey > /tmp/actions.pub
wg genpsk > /tmp/actions.psk

cat /tmp/actions.key    # PrivateKey  → va en el secret
cat /tmp/actions.pub    # PublicKey   → va en la config del servidor
cat /tmp/actions.psk    # PresharedKey → va en los dos
```

Añadir el peer en `/etc/wireguard/wg0.conf` del servidor:

```ini
[Peer]
# GitHub Actions
PublicKey = <el contenido de actions.pub>
PresharedKey = <el contenido de actions.psk>
AllowedIPs = 10.77.77.4/32      # una IP libre de vuestro rango
```

Recargar **sin cortar las conexiones existentes**:

```bash
wg syncconf wg0 <(wg-quick strip wg0)
```

> **No uséis `wg-quick down && up`** si estáis conectados por la VPN: os
> quedáis fuera. `syncconf` aplica los cambios sin tirar el túnel.

## 5.2 El secret `DEV_WG_CONFIG` / `PROD_WG_CONFIG`

El contenido que va en el secret:

```ini
[Interface]
PrivateKey = <actions.key>
Address = 10.77.77.4/32

[Peer]
PublicKey = <la clave pública del SERVIDOR>
PresharedKey = <actions.psk>
AllowedIPs = 10.77.77.0/24
Endpoint = <IP pública del servidor>:51820
PersistentKeepalive = 25
```

## 5.3 El firewall

El puerto SSH debe aceptar conexiones desde la IP del peer de Actions:

```bash
ufw allow from 10.77.77.0/24 to any port 22 proto tcp
ufw status numbered
```

**Un aviso importante**, que nos costó un susto: los puertos publicados por
Docker **atraviesan UFW**. Si publicáis un puerto en `0.0.0.0`, queda abierto
a internet aunque UFW lo bloquee. Atadlos a `127.0.0.1`:

```yaml
ports:
  - "127.0.0.1:3000:3000"      # no "3000:3000"
```

---

# PARTE 6 — Las migraciones de base de datos

Esto es lo que más daño puede hacer, y el usuario fue explícito:

> "Que no se elimine en base de datos como pasó. Que no se elimine nada de lo
> que tenemos y todo quede completamente intacto como lo teníamos antes."

## 6.1 Las reglas

**1. Contad las filas antes y después.** Siempre.

```sql
SELECT 'validaciones' AS tabla, COUNT(*) FROM validaciones
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'vinculaciones', COUNT(*) FROM vinculaciones;
```

Si algún número baja después de una migración, restaurad el respaldo.

**2. Nunca `DROP TABLE` ni `DROP COLUMN` en una migración automática.** Si
hay que quitar algo, renombradlo y borradlo semanas después, cuando conste que
nada lo usa.

**3. Cuidado con `ON DELETE CASCADE` hacia tablas que ya tienen datos.**
Borrar una fila puede llevarse en cadena cosas que no esperabais. En
FirmaLegal, borrar un destinatario se llevaba por delante los valores de sus
campos, y hubo que reenviar firmas y validaciones.

**4. Las migraciones se aplican a mano, no desde el workflow.** Una migración
que falla a medias con el despliegue en curso es muy difícil de deshacer.

## 6.2 El orden al desplegar con migración

```
1. Respaldo de la base de datos
2. Contar filas
3. Aplicar la migración a mano
4. Contar filas otra vez y comparar
5. Desplegar el código (push a la rama)
6. Comprobar que la aplicación responde
```

Nunca al revés: si el código llega antes que la tabla que necesita, falla.

---

# PARTE 7 — El día del despliegue conjunto

FirmaLegal y VI tienen que llegar a producción juntos, porque el código de
FirmaLegal de esta semana usa las dos rutas que VI añadió el 5 de octubre:

```
PATCH /validacion/api/firmalegal/validaciones/:codigo
POST  /validacion/api/firmalegal/validaciones/:codigo/reenviar
```

Si FirmaLegal llega antes, corregir y reenviar fallarán. Si VI llega antes, no
pasa nada: sus rutas nuevas simplemente no se usan todavía.

**Por eso VI va primero.**

## 7.1 El orden

```
1.  Respaldo de las dos bases de datos
2.  Contar filas en las dos
3.  VI: aplicar sus migraciones si las hay
4.  VI: merge develop → main  (se despliega solo)
5.  VI: comprobar que responde y que las dos rutas nuevas existen
6.  FirmaLegal: aplicar migraciones 006 y 007
7.  FirmaLegal: merge develop → main  (se despliega solo)
8.  FirmaLegal: comprobar
9.  Prueba de punta a punta: crear una validación, completarla, firmar
10. Vigilar los registros la primera hora
```

## 7.2 La hora

**No desplegar mientras haya gente firmando.** El reinicio del contenedor
corta a quien esté a mitad de una firma.

En FirmaLegal desplegamos a primera hora de la mañana o al final del día.
Mañana hay un envío grande de pagarés, así que conviene desplegar **antes** de
que salga.

## 7.3 Comprobaciones después

**En VI:**

```bash
# Que las dos rutas nuevas estén
curl -X PATCH http://localhost:3000/validacion/api/firmalegal/validaciones/VAL-NO-EXISTE \
  -H "X-Internal-Api-Key: $FIRMALEGAL_API_KEY" \
  -H "Content-Type: application/json" -d '{"documento":"1"}'
# debe devolver 404, no 401 ni 404 de ruta inexistente
```

Una ruta que no existe en VI devuelve **401**, no 404, porque cae al
middleware de JWT. Si os sale 401, la ruta no está desplegada.

**Y lo más importante para nosotros:**

```bash
docker exec validacion-identidad-app-1 sh -c 'echo $FIRMALEGAL_PUBLIC_URL'
```

Si sale vacío, el enlace de retorno que recibe el firmante volverá a ser el
nombre interno del contenedor y nadie podrá firmar después de validarse. Ya
pasó el 6 de octubre.

---

# PARTE 8 — El día a día, una vez montado

## 8.1 Trabajar

```bash
git checkout develop
git pull origin develop          # SIEMPRE antes de empezar
# ... trabajar ...
git add <archivos>
git commit -m "fix: lo que se arreglo"
git push origin develop          # se despliega a DEV solo
```

## 8.2 Llevar a producción

```bash
git checkout main
git pull origin main
git merge develop
git push origin main             # se despliega a PROD solo
```

## 8.3 Reglas que nos hemos dado

- **Al servidor solo se entra a LEER.** Nada de editar archivos allí: el
  siguiente despliegue lo borra sin rastro.
- **`git pull` antes de tocar nada**, cada sesión.
- **Nunca `git push --force` a `main`.**
- Si hay que volver atrás: `FORZAR_RETROCESO=1 vi-deploy.sh <sha>`, a
  conciencia.

---

# Resumen de los pasos

- [ ] Mirar `git status` y `git log` en los dos servidores
- [ ] Commitear lo que haya suelto en producción
- [ ] Respaldo de las dos bases de datos
- [ ] Contar filas
- [ ] Llevar lo de producción a `main`
- [ ] Mergear `main` en `develop`
- [ ] Comprobar que `develop..main` sale vacío
- [ ] Crear el peer de WireGuard para Actions
- [ ] Cargar los siete secrets en GitHub
- [ ] Instalar `vi-deploy.sh` en los dos servidores
- [ ] Configurar sudoers
- [ ] Añadir los dos workflows
- [ ] Probar con un cambio pequeño en `develop`
- [ ] Verificar que el rollback funciona (desplegad algo roto a propósito en DEV)
- [ ] Coordinar el despliegue conjunto con FirmaLegal

---

Cualquier cosa que no encaje con vuestra configuración, decidnos y lo
ajustamos. Lo que está aquí lleva tres semanas funcionando en FirmaLegal sin
un solo despliegue perdido.
