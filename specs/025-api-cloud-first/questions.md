# Preguntas — 025

## 1. Un dispositivo nuevo por cada inicio de sesión de la web (de `specs/022-web-cloud-boot/questions.md` §4)

La web ya no guarda su `device_id` (ADR-0035), así que `GET /api/auth/login` llega sin él y la API asigna uno nuevo en cada inicio, y crea su objeto `sync/devices/<id>.json`. Con sesiones de 24 h son unos 365 objetos pequeños al año, que nada borra (la API no tiene permiso de borrado) y que `GET /api/sync/devices` y la administración tendrían que listar.

**No lo he cambiado** porque toca la identidad del dispositivo (ADR-0027, ADR-0033) y no es una decisión de la entrega. Opciones:

- **(a) Un dispositivo web por cuenta**, con identificador derivado de forma estable de la cuenta (p. ej. HMAC de `sub` con la clave de sesión) y creado con `If-None-Match: *`; si ya existe, se reutiliza. Un dispositivo olvidado dejaría de poder entrar con esa cuenta salvo que olvidar rote la derivación: hay que resolverlo antes.
- **(b) Dejar todo como está** y asumir el ruido: unos cientos de objetos al año, sin efecto en coste ni en seguridad.
- **(c) Que la web deje de tener dispositivo propio** y que su sesión no ligue ninguno (la identidad del dispositivo sería solo de la consola). Cambia `GET /api/session` y la cookie.

Recomendación: **(b)** hasta que haya un motivo, y valorar (c) si E5 retira la última lectura del `device_id` de la web.

## 2. `GET /api/devices/tokens` sin `last_sync_at`

Lo he retirado (FR-006) porque nadie lo escribe ya y la web decía «Última sincronización: nunca» en todos los tokens. Si se quiere un «último uso» del token, habría que guardarlo en otro sitio (el registro del token, que solo se sobrescribe al revocar). No se ha pedido.
