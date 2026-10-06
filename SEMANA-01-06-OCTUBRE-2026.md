# Lo que se hizo del 1 al 6 de octubre de 2026

**65 commits en `develop`. Producción sigue en `d553023`, del 30 de septiembre.**

Esta semana se construyó el sistema de validación de un clic y se corrigieron
los fallos que fueron apareciendo al probarlo. Casi todo gira alrededor de una
idea: **una validación de identidad es de la PERSONA, no del documento**.

---

## Por qué se empezó

El motivo lo dio el usuario el 1 de octubre:

> "Cuando se envía la validación no hay confirmación si la validación se
> envió. Aquí estamos supliendo todo eso. ¿Cuántos intentos se hizo?"

El sistema era una caja negra. Se mandaba una validación y después no había
forma de saber, desde la pantalla, si llegó, si la abrieron, si lo intentaron
ni por qué falló. Esa información existía —en la base de Validación de
Identidad— pero solo se llegaba a ella entrando al servidor a consultarla.

En una sola semana hubo tres casos que necesitaron consulta manual: una señora
que ya había validado y lo que fallaba era otra cosa, otra con cuatro intentos
de los que tres fueron caídas del servicio, y una tercera con el enlace mal
formado.

---

## Lo que quedó funcionando

### El renglón de cada firmante

Al lado de cada persona, en el pagaré, ahora se ve:

- **Los datos con los que se va a validar** — cédula, nombre y celular,
  sacados de los campos del CSV emparejando por su correo. Si VI tiene otros
  —porque alguien los corrigió— se muestran esos, con el del CSV tachado.
- **El estado de su validación** — si no la ha intentado, cuántos intentos
  lleva, si está en proceso, si caducó, si la anularon.
- **Un botón que dice lo que va a pasar al pulsarlo**: INICIAR VALIDACION,
  REENVIAR VALIDACION, CREAR VALIDACION NUEVA o ENVIAR ENLACE DE FIRMA.
- **Corregir información**, que edita la validación existente sin crear otra.

### El panel de arriba

Dos botones separados —Enviar y Reenviar— con sus conteos, porque crear una
validación y reenviar una que ya existe no son lo mismo: una validación nueva
llega con otro código y otra fecha de vencimiento.

Antes de que salga un solo correo se abre un **informe desglosado**: quién,
con qué validación, con qué datos, cuándo vence y qué va a pasar con cada
uno. Sustituye al `confirm()` del navegador que solo decía un número.

### Los límites

- **2 correos de validación y 2 de firma** por persona cada 24 horas, en
  ventana rodante. Validación y firma llevan cuentas separadas.
- Si la validación de alguien **se anula o se vence**, sus correos anteriores
  dejan de contar: le toca que le creen otra y frenar por correos que llevan a
  un enlace muerto no protege a nadie.
- El **reenvío individual** de cada persona tiene una espera que crece —1, 10,
  30 y 60 minutos— y un tope de 6 al día. Es la salida cuando el masivo está
  bloqueado y un padre llama.

### Una persona, una validación

Es la regla que costó más trabajo y la que más veces se rompió:

- **Enviar** la crea, una sola vez.
- **Corregir** edita sus datos. No crea otra.
- **Reenviar** vuelve a mandar su correo. No crea otra.

Para lograrlo hizo falta que VI añadiera dos rutas, el 5 de octubre:

```
PATCH /validacion/api/firmalegal/validaciones/:codigo            editar
POST  /validacion/api/firmalegal/validaciones/:codigo/reenviar   reenviar
```

Antes las tres acciones llamaban a `iniciar-validacion`, que CREA. Un mismo
correo llegó a tener **siete validaciones**, y nadie sabía cuál valía.

### Al completar una validación

Cuando alguien termina su validación de identidad:

1. Se marca en **todos sus pagarés**, no solo en el que validó. Un padre con
   dos hijos firma dos pagarés con una sola cédula.
2. **Su traza entra en el PDF** de cada uno de esos pagarés.
3. **Le llega el enlace de firma al correo**, de cada pagaré donde ya le toque
   firmar. Antes solo existía la redirección de VI, que se pierde al cerrar la
   pestaña.

El PDF **nunca se reconstruye si alguien del grupo ya firmó**: el 22 de
septiembre eso destruyó firmas en 8 pagarés.

---

## Los fallos que se corrigieron

Por orden de gravedad.

### 1. Corregir podía editar la validación de OTRA persona

El peor. Al corregir sobre un firmante, el PATCH podía ir a la validación de
otro, que acababa con cédula y nombre ajenos. Esa persona no solo veía datos
que no eran suyos: **se iba a validar biométricamente contra ellos**.

La causa: se buscaba "la validación con documento" dentro de lo que VI
devuelve, sin comprobar de quién era. Ahora solo se acepta una cuyo correo
coincida, y el endpoint lo vuelve a comprobar antes de tocar nada.

### 2. Validaciones sin cédula ni celular

`crearValidacionVI` nunca las mandaba. A VI le llegaba el documento vacío: el
padre recibía el enlace, lo abría, y no había nada contra qué comparar su
cédula. Sin celular tampoco le llegaba el código OTP.

Estaba en **las dos vías** que crean validaciones. La de la plataforma tenía
el mismo fallo y está en producción.

### 3. El enlace de firma se armaba con la cabecera `Host`

Salía roto. Se cambió a `APP_URL` en los dos sitios que lo construían.

### 4. Reenviar creaba validaciones en vez de reenviarlas

Cada pulsación dejaba a la persona con un enlace más. El 5 de octubre un
correo acabó con cinco validaciones vivas a la vez.

### 5. La comparación CSV/VI borraba la letra "s"

El regex era `/[.s+-]/` en vez de la clase de espacios. "JOSE SUSANA SOSA" y
"Jose Susana Sosa" salían como datos distintos, y la pantalla los pintaba como
si VI hubiera corregido algo. Con los nombres de la Universidad eso pasaba en
casi todas las filas.

### 6. Una validación anulada tapaba la nueva

Al pedir a VI por el código que teníamos guardado, ese ganaba siempre. Si era
de una anulada, la pantalla decía "cancelada" aunque esa persona ya tuviera
otra validación en marcha.

### 7. El límite no frenaba

Se reenvió tres veces seguidas a las mismas cuatro personas sin que el sistema
dijera nada: se contaban solo los correos marcados como reenvío, y los
anteriores estaban con otra etiqueta.

### 8. La URL de retorno de VI era interna de Docker

`http://firmalegal-app:3000`. El padre completaba la biometría, pulsaba para
ir a firmar, y el navegador le daba `DNS_PROBE_FINISHED_NXDOMAIN`. **Era de
VI**; lo corrigieron el 6 de octubre.

---

## PENDIENTES

### Lo que bloquea el despliegue a producción

**1. Validación de Identidad no tiene GitHub Actions.**

Su desarrollo está desactualizado respecto a producción: PROD tiene mejoras de
velocidad y validación directa desde el enlace que DEV no tiene; DEV tiene
WhatsApp que PROD no tiene. Hay código nuevo y viejo mezclado en los dos
lados.

No se puede desplegar FirmaLegal sin que VI esté al día, porque todo lo de
esta semana depende de sus rutas nuevas.

Ver **GUIA-DESPLIEGUE-PARA-VI.md**.

**2. Las migraciones 006 y 007 solo están en DEV.**

```
backend/migrations/006_*.sql
backend/migrations/007_validaciones_pendientes.sql
```

La 007 crea `vi_validaciones_pendientes`. Sin ella, el código de esta semana
falla al buscar esa tabla. **Hay que aplicarlas en PROD antes de desplegar.**

**3. `FIRMALEGAL_PUBLIC_URL` en el entorno de VI en producción.**

Su `docker-compose.yml` tiene:

```
FIRMALEGAL_PUBLIC_URL=${FIRMALEGAL_PUBLIC_URL:-}
```

El valor por defecto es vacío. Si falta en el `.env` de PROD, su arreglo cae
otra vez al nombre del contenedor y vuelve el fallo del redirect.

Nosotros ya avisamos si pasa: al crear cada validación se comprueba que la URL
que devuelve VI tenga un host público, y si no queda registrado con gravedad
alta. Pero no se puede impedir.

### Lo que falta en el sistema

**4. Las validaciones no se ven todas hasta que firma el definitivo.**

Cuando los dos firmantes de un pagaré han firmado pero el firmante definitivo
todavía no, el documento muestra las dos firmas pero **solo una validación**.
Al firmar el definitivo aparecen las dos.

Visto el 6 de octubre. No se ha investigado.

**5. VI no devuelve el celular en `validaciones/consultar`.**

Lo mandamos en el PATCH y se guarda bien, pero en pantalla ese campo sigue
mostrando el del CSV. Para verlo reflejado habría que pedirle a VI que lo
incluya en la respuesta.

**6. `validaciones/consultar` devuelve una sola validación por correo.**

Mientras existan duplicados de los días anteriores, no se pueden detectar
todos. VI añadió `total_validaciones`, pero cuenta también las canceladas, así
que no sirve para avisar.

**7. El sistema de un clic solo está en pagarés.**

Para documentos normales está pendiente, por decisión del usuario:

> "Obviamente, esto nada más está para pagaré. En documentos normal, aún no lo
> haremos. Pero lo dejaremos pendiente."

**8. Diseño en pantallas estrechas.**

Nada de lo de esta semana se ha probado en móvil.

### De días anteriores, sin cerrar

**9. Once personas firmaron sin validación registrada.** Detectado el 30 de
septiembre, sin investigar.

**10. El CSV de 51 enlaces de firma pendientes** nunca se regeneró.

---

## Lo que hay que verificar DESPUÉS de desplegar

Mañana hay un envío grande: se reenvían los pagarés a todos los padres. Esto
es lo que conviene mirar en las primeras horas:

1. **Que las validaciones se creen con cédula y celular.** Es el fallo que más
   daño hizo y el que más gente afecta.
2. **Que el enlace de retorno de VI sea público.** Buscar en los registros
   `vi_url_interna`: si aparece, `FIRMALEGAL_PUBLIC_URL` falta en PROD.
3. **Que los enlaces de firma lleguen** a quien completa su validación.
4. **Que nadie reciba más de 2 correos** del mismo tipo en 24 horas.
5. **Que las trazas entren en los PDF.** Descargar un pagaré completo y
   comprobar que lleva las dos trazas, deudor y codeudor.

No desplegar mientras haya gente firmando: el reinicio los corta.
