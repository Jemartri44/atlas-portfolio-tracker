# Plan — 021 `ApiLedgerStore`

## Diseño

- **`packages/adapters/src/sync/api-ledger-store.ts`** — `ApiLedgerStore implements LedgerStore`. Recibe un `RemoteLedger` (el puerto del dominio): en producción, `httpRemote` con la cookie (web) o el token (consola). No duplica el cliente HTTP; hereda su `x-amz-content-sha256`, `redirect: "error"` y la traducción de errores.
- **Declaraciones:** reutiliza `unitsOf` y `entriesOf` del dominio. Las huellas vivas salen de `projectLedger(base, { collectErrors: true }).fingerprints` (los eventos no anulados); el lote se recorre en orden, quitando la huella de lo que anula y sumando la de cada línea.
- **Errores nuevos del dominio** (`errors.ts`): `RemoteRejectedError` (`remote_rejected`) y `WriteOutcomeUnknownError` (`write_outcome_unknown`). El resto, los existentes (`ConflictError`, `SchemaTooNewError`, `RemoteError`).
- **`httpRemote`:** añade `cache: "no-store"` a cada petición.
- **Va en `src/sync/`**, la única carpeta que la prueba de arquitectura de 015 deja tomar `@atlas/domain/sync`. Las dos etiquetas nuevas llevan su traducción en la CLI y la web (prueba de mensajes).
- **Subruta** `@atlas/adapters/api-store` para que la web lo empaquete sin el resto del barril (E2).

## Decisiones

- El almacén recuerda en memoria la última carga (solo eventos y etag) para juzgar la escritura sin volver a descargar, y la olvida al escribir. Un etag que no es el de esa carga provoca una recarga; si no coincide, `ConflictError` sin enviar.
- Una aceptación parcial es `RemoteRejectedError` con `accepted > 0`, no un error aparte.

## Pruebas

`apps/api/test/api-ledger-store.test.ts` (contrato contra el manejador real, con un `fetch` que lo llama) y un caso en `packages/domain/test/errors.test.ts`. Las operaciones de líneas crudas del contrato de `LedgerStore` quedan fuera: el almacén las niega.
