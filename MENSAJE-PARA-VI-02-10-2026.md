# Para el equipo de VI — tres peticiones y una nota sobre git

**2 de octubre de 2026 · del equipo de FirmaLegal**

---

## Antes de nada: subid los cambios a git

Nos comentasteis que lo del endpoint `validaciones/consultar` está **solo en DEV,
sin commit**. Eso nos preocupa: queda código corriendo en el servidor que no
está en el repositorio, y si alguien redespliega o hay que reconstruir el
contenedor, se pierde.

Nuestra regla es que **todo pasa por GitHub**: push a `develop` despliega DEV,
push a `main` despliega PROD. Nada se sube a mano al servidor.

Con las tres peticiones de abajo el riesgo se multiplica, así que antes de
seguir, por favor: commit y push de lo que ya está en DEV.

---

## Las tres peticiones, por orden de importancia

### 1. El código de la validación al crearla

`POST /validacion/api/firmalegal/iniciar-validacion` devuelve hoy solo
`validacion_url`. Necesitamos que devuelva también el **código**:

```json
{
  "validacion_url": "https://.../validacion/cellphone/?token=9fd5a8e9...",
  "codigo": "VAL-MU1E4GVX-826349"
}
```

**Por qué bloquea todo lo demás:** hoy solo guardamos el código cuando la
persona *completa* su validación, en el callback. Es decir, justo en el periodo
en que hace falta saber qué está pasando —entre que se envía y que la
completa— no tenemos con qué preguntaros nada.

Y ese es el periodo que importa: cuando un padre escribe diciendo que algo no le
funciona, está siempre ahí.

No podemos resolverlo nosotros: `validacion_url` lleva el **token**, no el
código; no hay ruta para consultar por token; y los dos valores no guardan
relación. Además `vi_validated_at` es `NOT NULL`, así que ni siquiera podríamos
guardar la fila.

*(Nos dijisteis que ya lo teníais implementado en local. Con que lo subáis a git
y lo despleguéis, listo.)*

### 2. El campo `intentos` en la consulta

Que `validaciones/consultar` devuelva, por cada validación, cuántos intentos
lleva esa persona.

**Es el dato que da sentido a todo el desarrollo.** Distingue a quien no le llegó
el correo (0 intentos) de quien lo abrió y no consigue completarlo. Son dos
problemas distintos y se arreglan de forma distinta.

Un detalle del conteo: nos interesan **todos** los intentos registrados,
incluidos los que fallaron por caída del servicio. El caso que motivó esto tenía
4: tres fueron errores vuestros (`ECONNABORTED`, "servicio saturado") y uno un
fallo real de lectura del documento. Si `COUNT(*)` sobre `validacion_intentos`
los incluye a todos, es justo lo que necesitamos.

### 3. Que el formulario lea más parámetros de la URL

En `frontend/desktop/js/crear-validacion.js`, dentro de `prefillFromUrl()`
(líneas 63-95), hoy se leen tres parámetros: `asunto`, `email` y
`redirect_token`.

Pedimos añadir seis más, con los ids que ya tiene el formulario:

| Parámetro en la URL | Campo |
|---|---|
| `documento` | `#documento` |
| `nombre` | `#nombreCompleto` |
| `celular` | `#celular` |
| `tipo_documento` | `#tipoDocumento` |
| `tipo_solicitud` | `#tipoSolicitud` |
| `notificacion` | `#notificacion` |

**FirmaLegal ya los está enviando** (desplegado y verificado en DEV). Hoy el
formulario los ignora, así que el cambio es solo de vuestro lado.

**Importante: estos seis NO deben quedar `readonly`** como hacéis con `asunto` y
`email`. El botón que trae al operador hasta aquí se llama "Corregir
información": entra precisamente a cambiarlos si el dato viene mal.

Ejemplo de la URL que estamos abriendo:

```
/validacion/desktop/crear-validacion.html
  ?asunto=Paquete+matriculas+2026+Jardin+%281%29
  &email=diegoarrietaherrera8%40gmail.com
  &redirect_token=abc123
  &documento=79458213
  &nombre=DIEGO+ARRIETA+HERRERA
  &celular=3009998877
  &tipo_documento=CC
  &tipo_solicitud=validacion-completa
  &notificacion=email
```

Los tres primeros ya funcionan. Los seis siguientes son los que pedimos.

*(El celular va sin el `+57` porque vuestro formulario ya tiene el prefijo fijo
en `#phonePrefix`.)*

---

## Para qué es todo esto

Estamos haciendo que el envío de validaciones deje de ser una caja negra. Hoy se
manda y después no hay forma de saber, desde la pantalla, si llegó, si la
abrieron, si lo intentaron ni por qué falló.

Esta semana hubo tres casos de padres que escribieron diciendo que algo no les
funcionaba, y los tres necesitaron que alguien entrara al servidor a consultar
vuestra base a mano:

| Caso | Lo que se encontró |
|---|---|
| Una firmante | Ya había validado; lo que fallaba era otra cosa |
| Otra | 4 intentos: 3 caídas del servicio, 1 fallo de lectura del documento |
| Una tercera | El enlace apuntaba al nombre interno del contenedor |

Con estos tres cambios, los tres casos se resuelven en segundos desde la
pantalla, sin tocar el servidor.

---

## Resumen

1. **El código al crear** — sin esto no podemos consultar nada de las
   validaciones pendientes. Es lo que bloquea.
2. **El campo `intentos`** — el dato clave.
3. **El prefill del formulario** — el más sencillo, no toca datos ni rutas.

Y antes de los tres: **commit y push de lo que ya está en DEV.**

Cuando despleguéis, avisadnos y lo probamos de punta a punta con un envío real.
