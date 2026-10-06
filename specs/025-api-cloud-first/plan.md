# Plan — 025 La API en la nube

## Diseño

- **Dominio** — `access/routes.ts` pierde la fila de `PUT /api/sync/devices/self`; `access/sync-routes.ts` pierde `publishedDevice`, `DEVICE_BOUND_PATHS` y `expectedDeviceRefusal`; `access/codes.ts` y `ports/remote-ledger.ts` pierden los dos códigos y `EXPECTED_DEVICE_HEADER`; `access/admin.ts` pierde `remoteRewritePermission` y `sync/permission.ts` `rewritePermission`. `web-device.ts` (su `sync_device_changed` es del cliente) y `parsePublishBody` se quedan hasta E5.
- **API** — `handler.ts` ya no compone `expectedDeviceRefusal` ni sirve la ruta; `sync.ts` pierde `publish`. La redirección del callback es `${origin}/`.
- **Clientes** — `http-remote.ts` pierde la opción `expectedDevice`; `apps/web/src/ledger/cloud.ts` ya no la pasa. `DevicesCard` quita «Última sincronización».
- **Consola** — `atlas admin compact` y `restore` llaman al plan sin `rewriteRefusal`.

## Decisiones

- El formato del objeto de dispositivo no cambia (`pending`, `held`, `last_sync_at` y `published_at` siguen siendo campos válidos): un cambio de formato sería de datos y la ADR no lo pide. Los dispositivos nuevos llevan `pending: 0`, `held: 0` y ningún instante.
- `forgetRefusal` (olvidar un dispositivo con cola, `--force`) **se queda**: la ADR retira la negativa de `compact` y de la restauración, no la de olvidar; con `pending` siempre cero no se dispara. Lo revisa E5 con el resto de la cola.
- `GET /api/sync/devices` se queda como está y deja de tener lectores.
- Un dispositivo nuevo por inicio de sesión: ver `questions.md`.

## Pruebas

Las de `apps/api/test/sync.test.ts` sobre la cabecera y la ruta pasan a comprobar que se ignora y que la ruta no existe; `sentinels.test.ts` deja de ejercitarla; `routes-cookies-body.test.ts` comprueba que no está en la tabla.
