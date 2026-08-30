# Preguntas abiertas — feature 001-ledger-core

Dudas encontradas al leer la documentación que el prompt me prohíbe resolver por mi cuenta (nada fiscal ni estructural se decide en esta feature). Cada una lleva el supuesto provisional con el que sigo trabajando; si el usuario elige otra opción, se ajusta antes de implementar la parte afectada.

## Q1 — Orden de proceso de los eventos frente a orden fiscal (estructural)

**Contexto.** `docs/data-schema.md` §2: "El orden canónico es la posición en el fichero … también para el desempate FIFO de lotes con la misma fecha". §8.1 ordena los lotes abiertos por `(acquisition_date, id)`. Nada dice qué pasa cuando un evento se registra **tarde**: una compra con `fiscal_date` 2027-01-10 registrada después de una venta con `fiscal_date` 2027-02-01 que ya consumió otros lotes.

- Si la proyección procesa en orden del fichero, la venta consume los lotes que existían al registrarla; la compra tardía queda como lote abierto aunque sea más antigua. Fiscalmente el FIFO debería haberla consumido primero.
- Si la proyección ordena por `(fiscal_date, posición)` antes de procesar, el resultado es fiscalmente correcto, pero contradice la letra de §2 y hace que `physicalPositions` pueda ser negativa transitoriamente en un orden que no es el de registro (venta antes de la compra tardía en fecha de registro, pero después en fecha fiscal). Beancount hace esto: ordena las entradas por fecha antes de aplicarlas.

**Opciones.**
- **(a) Orden del fichero, literal.** `integrity` y `atlas check` avisan cuando un evento tiene `fiscal_date` anterior al último evento procesado de su activo ("registro fuera de orden"); el usuario decide si rectifica (anular la venta y volver a registrarla tras la compra). Simple, sin sorpresas, respeta §2.
- **(b) Orden por `(fiscal_date, posición)`** para lotes y ganancias, orden del fichero para todo lo demás. Correcto fiscalmente sin intervención, pero dos órdenes distintos en la misma proyección y un cambio de doc (`data-schema.md` §2/§8.1).
- **(c) Rechazar al registrar** un evento cuya `fiscal_date` sea anterior a un evento ya registrado del mismo activo que afecte a lotes. Muy estricto; obliga a rectificar antes de registrar tarde.

**Supuesto provisional: (a).** Sin cambio de documentos; el aviso hace visible el problema.

**Respuesta del usuario (2026-08-30): (b), proyección cronológica.** `data-schema.md` §2/§8.1 se actualizan desde `develop` (PR #8). Implementación: catálogo y configuración en orden del fichero; operaciones y seguimiento por `(fecha de negocio, posición)`; registrar tarde no genera aviso.

## Q2 — Compras en el libro `bucket` antes de que existan las tesis (alcance)

**Contexto.** `data-schema.md` §6.2: `buy.thesis_id` es "obligatorio si la cuenta es del libro `bucket`; debe existir un `thesis_opened` previo". Constitución III: "No se puede registrar una compra en el cubo sin una tesis creada antes". `thesis_opened`/`thesis_closed` quedan para la feature 002.

**Opciones.**
- **(a) Rechazar** todo `buy` en cuenta `bucket` en esta feature con mensaje "las tesis llegan en la feature 002". Cumple la constitución; el cubo no es usable hasta la 002.
- **(b) Exigir `thesis_id`** en el `buy` pero no validar que exista el `thesis_opened`. Permite usar el cubo ya, pero deja pasar compras sin tesis real (viola III temporalmente) y obliga a la 002 a validar retroactivamente.
- **(c) Implementar `thesis_opened`/`thesis_closed` mínimos** (solo el evento y la validación de existencia, sin métricas) dentro de la 001. Pequeño, pero amplía el alcance escrito del prompt.

**Supuesto provisional: (a).**

**Respuesta del usuario (2026-08-30): (a), rechazar compras en `bucket` hasta la 002.** Mantiene el alcance y la constitución III.

## Q3 — Qué `Settings` se usa para derivar `fiscal_date` (fiscal/estructural)

**Contexto.** ADR-0013: `fiscal_date` se deriva por `asset.type` según `Settings.fiscal_date_rule`; "si el asesor corrige un valor por defecto, es un `settings_changed`, no un despliegue"; "cambiar la regla no exige migración". `settingsAt(date)` existe para saber qué configuración regía en cada momento (pesos objetivo históricos).

Para un `sell` de 2027 proyectado en 2029, tras un `settings_changed` de 2028 que cambió `fiscal_date_rule`: ¿se aplica la regla de 2027 (`settingsAt(fecha del evento)`) o la de 2029 (vigente al proyectar)?

**Opciones.**
- **(a) Vigente al final del libro** (`settingsAt(now)` o último `settings_changed`). La regla es una interpretación fiscal, no un hecho histórico: corregirla debe recalcular el pasado. Coherente con "no exige migración".
- **(b) `settingsAt(recorded_at del evento)`.** Cada evento se interpreta con la regla que regía cuando se registró. Estable, pero una corrección del asesor no arreglaría los ejercicios ya proyectados.
- **(c) Parámetro explícito** de `realizedGains(year, settings)`: la CLI pasa la vigente; el motor fiscal futuro decide.

**Supuesto provisional: (a)**, implementado como (c) por dentro (las proyecciones reciben `settings` resuelto por el caso de uso), de modo que cambiar de criterio no toca el dominio.

**Respuesta del usuario (2026-08-30): (a), implementada como (c).** Configuración vigente al final del libro, pasada como parámetro.

## Corrección del usuario al esquema (2026-08-30)

- **Huella manual sin `id` propio.** ADR-0012 / `data-schema.md` §4 decían "`broker_ref` si existe; si no, `id` propio en manual". Si el `id` entrara, dos registros manuales idénticos nunca avisarían. Corrección: `broker_ref ?? ""`. Recogido en `data-model.md` §2.6; los documentos de `docs/` se corrigen desde `develop` (PR #8).

## Incoherencias menores detectadas (no bloquean; se resuelven a favor del documento más reciente, confirmado por el usuario)

- ADR-0003 nombra los enlaces `reverses_transaction_id` / `corrects_transaction_id`; `data-schema.md` §6.3 usa `reverses_id` / `corrects_id`. Se usa el esquema.
- `docs/specification.md` §4.1 da a `Lot` un `account_id` y un `fee_eur`; ADR-0009 hace los lotes globales por activo y `data-schema.md` §8.1 mete la comisión en el coste. Se usa el esquema.
- ADR-0007 fija Node 24 "si está disponible"; el prompt fija 22. Se usa 22.
- `transfer` lleva `fee?` pero no `currency`: la comisión se guarda como dato informativo y no toca ni coste ni efectivo (supuesto A5 del spec).
- El prompt §3.1 pide crear `.github/workflows/ci.yml` y §2 bis prohíbe "tocar `.github/`". Se interpreta: crear `ci.yml` y no modificar nada existente en `.github/` (la plantilla de PR).

## Q4 — Colisión del campo `type` en `asset_created` / `asset_updated` (esquema, detectada al implementar)

**Contexto.** `data-schema.md` §2 reserva `type` en el envoltorio para el tipo de evento, y §6.1 da al activo un campo `type` (`fund | etc | etp | stock | crypto | money_market`). Una línea `{"type":"asset_created", …, "type":"fund"}` no puede existir.

**Opciones.** (a) Renombrar el campo del activo a `asset_type` en la línea (el tipo `Asset` proyectado puede seguir llamándolo `type`); (b) anidar los datos del activo en `asset: {…}`; (c) renombrar el discriminador del envoltorio (rompería §2 y todos los ejemplos).

**Decisión provisional: (a) `asset_type`** en las líneas `asset_created`/`asset_updated` (y en el flag `--type` de la CLI se mantiene el nombre corto).

**Resuelta (revisión de la PR #10):** `data-schema.md` §6.1 ya dice `asset_type` y añade que `asset_updated` rechaza cambiar `asset_type` o `currency` (aplicado en `fix/001-review-fixes`).

## Notas de implementación (2026-08-30, tras `/speckit-implement`)

Decisiones de detalle que no cambian documentos pero conviene que el usuario conozca:

- **Puerto `RandomSource`** (ya listado en ADR-0007 tras la revisión). el ULID necesita 80 bits aleatorios y el dominio no puede usar `globalThis.crypto` (no existe en `lib: ES2022` sin DOM y declararlo chocaría con `@types/node`). Es un tipo de una línea (`(bytes: Uint8Array) => void`) implementado en `adapters` con Web Crypto. Si se prefiere, puede añadirse a la tabla de puertos de ADR-0007.
- **Q4 aplicada: `asset_type`** en las líneas `asset_created`/`asset_updated`; la CLI mantiene `--type`. `docs/data-schema.md` §6.1 ya lo recoge.
- **Divisiones a 10 decimales half-up** (`Big.DP = 10`, ADR-0005 "derivados con 10 decimales"): afecta a `eur = amount / fx_rate`, al reparto proporcional de coste al partir un lote y al reparto de cantidad en un traspaso con `quantity_in ≠ quantity_out` (el último lote recibe el resto exacto para que las sumas cuadren).
- **Orden de proyección** exactamente como `data-schema.md` §7.1: catálogo, configuración y anulaciones en orden de fichero; el resto por `(fecha de negocio, posición)`. Fecha de negocio del `transfer`: `value_date_out`. Un `order_updated` o `transfer` fechado antes que su `order_placed`/`transfer_requested` se rechaza (`unknown_order`/`unknown_request`).
- **`account_updated` que cambia `book`** se rechaza si alguna operación referencia la cuenta (no se puede evaluar "posición viva en ese instante" porque el catálogo se proyecta antes que las operaciones).
- **`buy`/`sell` con `--amount` y sin `--unit-price`**: la línea se escribe **sin** `unit_price` (`data-schema.md` §4 tras la revisión de la PR #10: nunca se rellena con un cero inventado); sin `amount`, `unit_price` es obligatorio.
- **`atlas check`** proyecta en modo `collectErrors` y devuelve 1 si hay errores (p. ej. un evento de un tipo reservado); el resto de comandos rechazan el libro entero en ese caso.
- **Propiedad de invariancia al orden de registro** (Q1): se verifica sin traspasos fiscales, porque dos lotes con la misma fecha (heredada) se consumen por posición en el fichero, que es justo lo que la propiedad baraja.
- **Toolchain**: TypeScript 7.0.2, Biome 2.5.11, Vitest 4.1.11 (arrastra `vite` como *peer* al lockfile), fast-check 4.9.0, Node 22.23.2.
- **Ejecución manual del `quickstart.md`** (T057): correcta con el binario compilado; única desviación, la ruta es `apps/cli/dist/main.js` (corregida en el documento).
