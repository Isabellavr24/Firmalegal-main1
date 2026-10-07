# Petición a VI: que el formulario lea más parámetros de la URL

**2 de octubre de 2026**

## Qué necesitamos

Que `crear-validacion.html` pre-rellene seis campos más desde la URL, igual que
ya hace con `asunto` y `email`.

En `frontend/desktop/js/crear-validacion.js`, dentro de `prefillFromUrl()`
(líneas 63-95), hoy se leen tres parámetros:

```js
const asunto        = params.get('asunto');
const email         = params.get('email');
const redirectToken = params.get('redirect_token');
```

Pedimos añadir estos, con los ids que ya tiene el formulario:

| Parámetro en la URL | Campo del formulario |
|---|---|
| `documento` | `#documento` |
| `nombre` | `#nombreCompleto` |
| `celular` | `#celular` |
| `tipo_documento` | `#tipoDocumento` |
| `tipo_solicitud` | `#tipoSolicitud` |
| `notificacion` | `#notificacion` |

**FirmaLegal ya los está enviando.** Hoy el formulario los ignora, así que el
cambio es solo de vuestro lado.

## Una diferencia importante con `asunto` y `email`

Esos dos se marcan `readonly` cuando viene `redirect_token`, y tiene sentido:
son la identidad del envío y no deben tocarse.

**Estos seis NO deben quedar readonly.** El operador entra precisamente a
corregirlos: el botón que lo trae aquí se llama "Corregir información". Si el
dato del CSV viene mal escrito, tiene que poder arreglarlo.

Pre-rellenar sí; bloquear no.

## Por qué

Hoy, cuando un operador pulsa "Corregir información" en un pagaré, llega a
vuestro formulario con solo el asunto y el correo. Tiene que escribir a mano la
cédula, el nombre, el celular, y elegir tipo de documento, tipo de solicitud y
notificación — datos que FirmaLegal **ya tiene**, porque vienen del CSV del
pagaré.

Son 40 pagarés por tanda. Escribir seis campos a mano en cada uno es donde se
cometen los errores que luego hay que rehacer.

## Los dos valores por defecto

`tipo_solicitud=validacion-completa` y `notificacion=email` son los que se usan
siempre en los pagarés de la universidad. Van en la URL para que no haya que
elegirlos cada vez, pero el operador puede cambiarlos si hace falta.

## Un detalle del celular

Lo mandamos **sin el prefijo**: `3009998877`, no `+573009998877`. El formulario
ya tiene el `+57` fijo en `#phonePrefix`, así que encaja directo.

## Ejemplo de la URL que estamos abriendo

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

## Contexto

Esto es parte de un trabajo para que el envío de validaciones deje de ser una
caja negra: que desde la pantalla del pagaré se vea con qué datos se va a crear
cada validación, en qué estado está y cuántas veces la ha intentado el firmante.

Las otras dos peticiones que os hicimos hoy van en la misma dirección:

1. El código de la validación al crearla (`PETICION-VI-CODIGO-AL-CREAR.md`)
2. El campo `intentos` en `validaciones/consultar`

Esta tercera es la más sencilla de las tres y la que menos riesgo tiene: solo
toca el pre-rellenado de un formulario, nada de datos ni de rutas.
