# Especificación — 025 La API en la nube (ADR-0035, E4)

**Origen:** ADR-0035 (Aceptada), entrega E4; `docs/api.md` §2.3, §3, §4.5, §5.3, §5.4, §5.7, §7 y §8; `specs/022-web-cloud-boot/questions.md` §2 y §4; `specs/024-console-cloud/questions.md` §3. **Alcance:** que la API deje de ofrecer lo que solo servía a la cola por dispositivo, sin tocar el formato del libro ni el de los objetos de dispositivo. El borrado del motor del cliente (E5) y los borradores en la nube (E6) quedan fuera.

## Historia

Como persona que usa Atlas en la nube, quiero que la API no publique ni exija nada de una cola que ya no existe, para que `compact` y la restauración no se nieguen por pendientes que nunca habrá y para tener menos contrato que mantener veinte años.

## Requisitos

- **FR-001 `PUT /api/sync/devices/self` se retira.** La ruta sale de la tabla de rutas: responde `404 not_found`, con cualquiera de las dos credenciales, y no escribe nada. Salen del dominio y de la API `publishedDevice` y su cuerpo de respuesta; el cuerpo del cliente (`parsePublishBody`) se queda hasta E5, porque el motor del cliente aún lo importa.
- **FR-002 `x-atlas-expected-device` se retira.** La API ni la pide ni la compara: con o sin ella, con cookie o con token, la petición se juzga igual. Salen `expected_device_required` y `sync_device_changed` de los códigos de la API y de `REMOTE_FAILURE_CODES`, y `DEVICE_BOUND_PATHS` y `expectedDeviceRefusal`. El cliente HTTP deja de enviarla (la web la enviaba aún).
- **FR-003 Los objetos de dispositivo se conservan** como identidad, con su formato (`device_format: 1`) sin cambios. Se siguen creando al iniciar sesión (web) y en el primer canje (consola), se olvidan y se leen igual. `GET /api/sync/devices` sigue como está.
- **FR-004 `compact` y la restauración no se niegan por pendientes.** `atlas admin compact` y `atlas admin restore` dejan de leer la cola de la carpeta y la de los dispositivos. Salen `remoteRewritePermission`, `rewritePermission` y los cinco códigos `rewrite_refused_*`.
- **FR-005 La redirección tras iniciar sesión en la web es `/`**, no `/ajustes#sincronizacion`. No hay `return_to`.
- **FR-006 `GET /api/devices/tokens` ya no trae `last_sync_at`.** Nadie lo publica; la API deja de leer los objetos de dispositivo para esa lista y la tarjeta de dispositivos de la web deja de decir «Última sincronización».

## Fuera de alcance

El motor del cliente y `packages/adapters/src/sync/` (E5), los borradores (E6), el despliegue. No hay cambio de `infra/`: la política de origen es la gestionada `AllViewerExceptHostHeader`, que reenvía toda cabecera menos `Host`, así que la cabecera no estaba listada en ningún sitio.

## Criterios de aceptación

Tests de `apps/api` (ruta retirada, cabecera ignorada, redirección), de `packages/domain` (al 100 %), de `packages/adapters` (el cliente no envía la cabecera) y de `apps/cli` (compact y restore sin negativa por pendientes); `npm run test:others` y `npm run test:coverage:domain` en verde.
