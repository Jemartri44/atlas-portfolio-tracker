# Especificación — 027 Borradores en la nube (ADR-0035, E6)

Estado: en curso. Entrega E6 de `docs/adr/0035-cloud-ledger-single-source.md` (pregunta 1) sobre ADR-0029 (opción B).

## Qué

Una operación en divisa registrada antes de que el BCE publique el tipo de su fecha fiscal se guarda como **borrador en la nube**, por la API, y se confirma o se descarta contra la nube. Hoy, en una carpeta de nube, la consola dice `drafts_not_in_cloud` y la web no ofrece «Guardar como borrador».

## Requisitos

- **FR-001 Contrato.** `docs/api.md` §6.1 (cuatro rutas), §7 (`draft_exists`, `draft_changed`) y `docs/data-schema.md` §1 y §6.3: objetos `drafts/<id>.json`, `.stamp.json` y `.end.json`, cada uno creado con `If-None-Match: *`, **nunca sobrescrito y nunca borrado**.
- **FR-002 API.** `GET /api/drafts`, `POST /api/drafts`, `POST /api/drafts/{id}/stamp` y `POST /api/drafts/{id}/end`, con la cookie o el token, `Origin` propio con la cookie, cuerpo exacto y tope de 64 KiB. La API valida la forma, no la operación.
- **FR-003 Dominio y adaptadores.** El puerto `PendingDraftStore` se reutiliza: `remove(id, end?)` lleva el motivo del cierre; `recordPendingDraft` cierra como `confirmed`. `ApiDraftStore` lo implementa sobre la API (`@atlas/adapters/drafts-http`). Los almacenes local y de IndexedDB no cambian de comportamiento.
- **FR-004 Web.** «Guardar como borrador», el contador del marco, la lista y confirmar o descartar, contra la nube. **Nada de borradores en el dispositivo** (el test de lo que queda en el dispositivo sigue en verde).
- **FR-005 Consola.** `atlas draft …` y `atlas add --draft` en una carpeta de nube usan la API con el token. En una carpeta local, como estaba.
- **FR-006 Infra.** El rol de la API gana `drafts/` con `GetObject`, `PutObject` y `ListBucket`, **sin borrado**; la política del bucket rechaza un `PutObject` de `drafts/` sin `If-None-Match`. Solo `infra/modules/atlas` y su contrato de pruebas. **No se aplica**: hace falta `terraform plan` en dev antes de desplegar.
- **FR-007 Reglas que no cambian.** El libro nunca guarda un dato provisional; el borrador no cuenta en ninguna cifra; nunca se confirma solo; ningún registro de la Lambda lleva un id, una operación o un importe.

## Fuera de alcance

Borrar el almacén `drafts` de IndexedDB y `BrowserDraftStore` (sin uso desde E6; ver `questions.md`). Listar los borradores cerrados.
