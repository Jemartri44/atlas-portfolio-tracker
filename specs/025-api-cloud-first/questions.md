# Preguntas — 025

## 1. Un dispositivo nuevo por cada inicio de sesión de la web

La web ya no guarda su `device_id` (ADR-0035), así que `GET /api/auth/login` llega sin él y la API asigna uno nuevo en cada inicio, y crea su objeto `sync/devices/<id>.json`. Con sesiones de 24 h son unos 365 objetos pequeños al año, que nada borra (la API no tiene permiso de borrado) y que `GET /api/sync/devices` y la administración tendrían que listar.

**No lo he cambiado** porque toca la identidad del dispositivo (ADR-0027, ADR-0033) y no es una decisión de la entrega. Opciones:

- **(a) Un dispositivo web por cuenta**, con identificador derivado de forma estable de la cuenta (p. ej. HMAC de `sub` con la clave de sesión) y creado con `If-None-Match: *`; si ya existe, se reutiliza. Un dispositivo olvidado dejaría de poder entrar con esa cuenta salvo que olvidar rote la derivación: hay que resolverlo antes.
- **(b) Dejar todo como está** y asumir el ruido: unos cientos de objetos al año, sin efecto en coste ni en seguridad.
- **(c) Que la web deje de tener dispositivo propio** y que su sesión no ligue ninguno (la identidad del dispositivo sería solo de la consola). Cambia `GET /api/session` y la cookie.

Recomendación: **(b)** hasta que haya un motivo, y valorar (c) si E5 retira la última lectura del `device_id` de la web.

## 2. Pendientes de decisión que dejaron las otras entregas de ADR-0035

- **`syncConfigured`** (`record-event.ts`, dominio): la opción se llama así y significa «libro compartido de nube». Renombrarla toca el dominio y sus tests.
- **`DraftsOnlyIfAbsent`** (política del bucket de datos, feature 027): sentencia nueva que repite `BackupsOnlyIfAbsent` sobre `drafts/*`. Si no se quiere, se quita sin tocar nada más (el código solo usa `If-None-Match`).
- **Crecimiento de `drafts/`** (feature 027): los borradores cerrados no se borran nunca y siguen en el listado de primer nivel, que la API pagina entero desde S3 sin paginar hacia el cliente. Con decenas al año es irrelevante; decidir si hace falta paginar o archivar si el uso crece.
