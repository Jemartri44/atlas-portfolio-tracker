# Plan — 024 La consola en la nube

## Diseño

- **`apps/cli/src/folder-mode.ts`** — `resolveFolderMode(folder)`: mira `ledger.jsonl` y `sync/remote.json` (`readRemoteJson`) y devuelve `local` o `cloud`; con las dos cosas lanza `DomainError("folder_mode_ambiguous")`. `CloudLedgerStore implements LedgerStore`: abre al primer uso el `httpRemote` con la entrada de `credentials.json` y delega en un `ApiLedgerStore`; expone `remote()` (para `backup`, `export` y `upload`) y cuenta las escrituras hechas.
- **`main.ts`** — tras parsear, para las órdenes que tocan el libro, resuelve el modo, lo guarda en `Context.mode` y, en nube, cambia `deps.store` por el almacén de nube (reloj y azar siguen siendo los de `compose`, que los tests sustituyen). El modo se resuelve **antes** de ejecutar la orden.
- **Errores de la nube** en `report`: `CloudSessionError` y `RemoteError` de sesión → `EXIT.session`; `RemoteError` de red → `EXIT.offline`; `WriteOutcomeUnknownError` → intenta `findOutcome` una vez, si no `EXIT.outcomeUnknown`. Frases en `output/cloud.ts`.
- **`backup`, `export`, `compact`** — ramas de nube. `shared.ts` pasa `syncConfigured: true` en nube, así el dominio rechaza `--accept-invalid` (no se toca el dominio) y el mensaje ya no habla de sincronización.
- **`prices`** — el origen de los cierres es la nube si la carpeta es de nube; el resto, las fuentes con el cupo entero. Desaparece el estado «compartido» de la cola.
- **`remote login`** vincula la carpeta (escribe `sync/remote.json` con `wx`); **`remote upload`** es la subida inicial.
- **`atlas sync`** pasa a ser un aviso de retirada. Se borran `commands/sync.ts`, `output/sync.ts` y los tests de la consola que ejercitaban el motor; el motor (`packages/adapters/src/sync/`, dominio) se queda hasta E5.

## Decisiones

- Códigos de salida nuevos: 8 `offline`, 9 `outcomeUnknown`, 10 `session` (8, 9 y 10 estaban libres; 7 es `sourcesFailing`, 64 uso).
- La carpeta con `sync/state.json` y sin `remote.json` (una carpeta de la cola antigua) es local: su marcador sigue frenando `compact` como hoy hasta E5.
- Ninguna migración: no hay libro real todavía (ADR-0035, pregunta 2).

## Pruebas

`apps/cli/test/cloud/*.test.ts` sobre `setupConsole` (el manejador real con dobles de S3, SSM y Google); los tests que ejercitaban `atlas sync` se reescriben sobre `remote login` y `remote upload`, o se retiran con el comando.
