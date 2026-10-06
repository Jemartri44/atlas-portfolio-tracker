# Preguntas — 027

Ninguna bloquea la entrega. Para la dirección:

## 1. `BrowserDraftStore` y el almacén `drafts` de IndexedDB

Sin uso desde E6 (la web ya no guarda borradores en el dispositivo). No los he borrado: el almacén forma parte de `DB_VERSION` 2 y quitarlo es una migración del esquema del navegador, y `BrowserDraftStore` tiene sus tests. Propuesta: borrar la clase y sus tests y dejar el almacén vacío, en una entrega de limpieza.

## 2. La política `DraftsOnlyIfAbsent` del bucket

Copia exacta de `BackupsOnlyIfAbsent` (misma condición, verificada en `iam-permissions.md` §4) sobre `drafts/*`. Hace que la garantía «nunca se sobrescribe» no dependa solo del código de la API. **No va más allá de lo pedido en permisos del rol** (solo `Get`, `Put` y `List`), pero es una sentencia nueva de la política del bucket: si la dirección prefiere no añadirla, se quita sin tocar nada más (el código solo usa `If-None-Match`).

## 3. Crecimiento de `drafts/`

Los cerrados no se borran nunca y siguen en el listado de primer nivel. Con un uso real de unas decenas al año es irrelevante; no se pagina hacia el cliente (la API lista todas las páginas de S3).

## 4. La web no está hecha

La entrega agotó su presupuesto de turnos antes de la parte de la web (T4). El `ApiDraftStore` ya sirve para la cookie (`origin` propio y sin `token`). Falta restaurar de `19538c52^` la interfaz de borradores (`ledger/drafts.ts`, `draft-store.ts`, `routes/registrar/borradores.tsx`, `draft-rows.ts`, `shell/draft-counter.ts`, el botón de `EventForm`) sobre ese almacén, y quitar la guarda de `saveDraft` y de `EventForm`. Además, el commit del adaptador incluyó por error los cambios de `infra/` (se verá en el diff).
