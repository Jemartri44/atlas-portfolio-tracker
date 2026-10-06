# Plan — 026

Por bloques, un commit por bloque, cada uno compila:

1. **Consola** (`apps/cli`): se quita el uso de `folderSyncPresence`, `compactPermission`, `HELD_FILE` y la copia de lo retenido; el test de rechazos pasa a `legacy-marker.test.ts` (nada se rechaza por el marcador); se borra `fiscal.test.ts` (probaba el motor).
2. **Adaptadores**: se borran `sync/client`, `folder-store`, `held-actions`, `archive-names`, `browser/sync-store`, `browser/web-device` y sus tests; `publish` fuera de `httpRemote`; `transfer.ts` sin lo retenido ni el rechazo por sincronización; exports, alias y `tsconfig.test-sync.json` fuera. `http-remote.test.ts` pasa a `test/`.
3. **Dominio**: se borran `client-plan`, `held`, `marker`, `resolve`, `redo-record`, `rewrite`, `web-device`, `access/folder-start` y el puerto `sync-state-store`; `join` se queda en `init-refusal` (solo `initRefusal`); `permission` en `Refusal` y `RefusedError`; `archive` solo para `restore`; fuera `parsePublishBody` y `parsePublishAnswer`.
4. **Web**: 49 entradas muertas del catálogo de errores y los guardias de `check-bundle.mjs` de ficheros borrados.
5. **Techo del bundle**: `npm run build -w @atlas/web` mide 294.424; techo 294.800.
6. **Documentos**: `api.md`, `data-schema.md`, `specification.md`, ADR-0035.

Verificación: `npx tsc -b`, `npm run test:coverage:domain`, `npm run test:others`, `npm run build`, `vitest --project repo`.
