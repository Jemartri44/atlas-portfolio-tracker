# Plan — 027 Borradores en la nube

## Diseño

- **Objetos (decisión del contrato).** Un borrador son hasta tres objetos inmutables, uno por estado, **todos con `If-None-Match: *`**: `drafts/<id>.json`, `drafts/<id>.stamp.json` (sello de la confirmación, `pending_event_id`) y `drafts/<id>.end.json` (`confirmed` o `discarded`). Se elige frente a «un objeto y una marca» porque el sello también tiene que ser inmutable y atómico: «solo si sigue como se leyó» (`docs/data-schema.md` §6.3) pasa a ser que la creación del sello no encuentre otro distinto. El primero que crea el cierre gana.
- **Dominio** — `ecb/cloud-drafts.ts`: nombres de objeto, lectura estricta de los tres cuerpos y de los objetos, y `foldDraftObjects` (lista de objetos → borradores pendientes y nombres ilegibles). `PendingDraftStore.remove(id, end?)`; `recordPendingDraft` cierra como `confirmed`. `REMOTE_FAILURE_CODES` y `API_ERRORS` ganan `draft_exists` y `draft_changed`; `ROUTES` gana las cuatro rutas con la política `sync`.
- **Adaptadores** — `aws/draft-objects.ts` (la API solo ve `drafts/`, `get`, `putIfNoneMatch` y `list`: nada que sobrescriba o borre); `drafts/api-drafts.ts` (`ApiDraftStore`, cliente de las cuatro rutas con la credencial inyectada, como `httpRemote`).
- **API** — `apps/api/src/drafts.ts` con las cuatro rutas; el manejador las enruta junto a `sync`.
- **Web** — se restaura de `19538c52^` lo que E2b retiró (contador, lista, guardar, confirmar) sobre `ApiDraftStore`; el contador se refresca tras cada cambio; nada se guarda en el dispositivo.
- **Consola** — `atlas draft` y `add --draft` abren `ApiDraftStore` con el token de la carpeta de nube; el cerrojo de carpeta solo en local.
- **Infra** — `api.tf`: `GetObject` y `PutObject` sobre `drafts/*` y el prefijo en `List`; `data.tf`: `DraftsOnlyIfAbsent`. `infra/test/contract/permissions.json` y `stack.test.ts` al día.

## Decisiones

- Un borrador es de la cuenta, no del dispositivo: la web y la consola ven los mismos.
- La API no juzga la operación (le falta el tipo): la vista previa es del cliente.
- Cerrar (`end`) nunca se reintenta con otro resultado: el primero gana, y el cliente lo dice como `draft_changed`.

## Pruebas

API con dobles de S3 (`apps/api/test/drafts.test.ts`), incluida la carrera sellar/cerrar y la lista sin permisos de borrado; dominio al 100 %; adaptador contra el manejador; web (`ecb-drafts`, `cloud-device`); consola (`cloud-folder`, `draft`); infra de plantilla.
