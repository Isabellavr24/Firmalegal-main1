# Deploy de fuentes al servidor

## Fuentes incluidas en el repo (libres)
- `Tinos-Regular.ttf` — equivalente a Georgia/Cambria
- `Tinos-Bold.ttf` — equivalente a Georgia/Cambria Bold

## Fuentes propietarias (copiar manualmente)
Estas fuentes están en `C:\Windows\Fonts` y deben copiarse al servidor:

| Archivo | Fuente |
|---------|--------|
| `arial.ttf` | Arial Regular |
| `arialbd.ttf` | Arial Bold |
| `calibri.ttf` | Calibri Regular |
| `calibrib.ttf` | Calibri Bold |
| `georgia.ttf` | Georgia Regular |
| `georgiab.ttf` | Georgia Bold |
| `verdana.ttf` | Verdana Regular |
| `verdanab.ttf` | Verdana Bold |
| `times.ttf` | Times New Roman Regular |
| `timesbd.ttf` | Times New Roman Bold |

## Pasos de deploy

### 1. Subir fuentes propietarias al servidor
```bash
# Desde el PC de desarrollo (ajustar contraseña)
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\arial.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\arialbd.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\calibri.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\calibrib.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\georgia.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\georgiab.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\verdana.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\verdanab.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\times.ttf root@10.66.66.1:/tmp/
pscp -pw TU_CONTRASEÑA C:\Windows\Fonts\timesbd.ttf root@10.66.66.1:/tmp/
```

### 2. En el servidor (SSH)
```bash
# Mover fuentes al contenedor
docker cp /tmp/arial.ttf firmalegal-app:/app/fonts/
docker cp /tmp/arialbd.ttf firmalegal-app:/app/fonts/
docker cp /tmp/calibri.ttf firmalegal-app:/app/fonts/
docker cp /tmp/calibrib.ttf firmalegal-app:/app/fonts/
docker cp /tmp/georgia.ttf firmalegal-app:/app/fonts/
docker cp /tmp/georgiab.ttf firmalegal-app:/app/fonts/
docker cp /tmp/verdana.ttf firmalegal-app:/app/fonts/
docker cp /tmp/verdanab.ttf firmalegal-app:/app/fonts/
docker cp /tmp/times.ttf firmalegal-app:/app/fonts/
docker cp /tmp/timesbd.ttf firmalegal-app:/app/fonts/

# Pull del código nuevo
cd /app
git pull origin main

# Reiniciar el contenedor
docker restart firmalegal-app
```

### 3. Verificar
```bash
docker exec firmalegal-app ls /app/fonts/
docker logs firmalegal-app --tail 20
```
