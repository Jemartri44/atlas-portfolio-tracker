# ADR-0009 — Ámbito del FIFO y activos compartidos entre libros

**Estado:** Aceptada (2026-08-30). *Verificar con asesor fiscal.* **Enmendada el 2026-09-24** (feature 012): el lote de una corrección conserva el sitio de su raíz; ver al final.

## Contexto

La norma española imputa las transmisiones parciales por **valor homogéneo** (mismo ISIN) en orden FIFO, con independencia de la cuenta o el bróker donde estén los títulos. El usuario tiene cuentas en varias plataformas y dos libros (`core`, `bucket`) que no deben mezclarse.

## Opciones consideradas

1. **FIFO por activo a través de todas las cuentas**, y prohibido tener el mismo activo en `core` y `bucket`.
2. **FIFO por cuenta**: coincide con cada extracto, pero es fiscalmente incorrecto en cuanto un mismo valor está en dos cuentas, con error silencioso.

## Decisión

Opción 1.

- El FIFO se aplica por `asset_id` sobre la unión de los lotes de todas las cuentas. Una venta en la cuenta X consume fiscalmente los lotes más antiguos del activo aunque estén en la cuenta Y.
- Se distinguen dos proyecciones: **posición física** (cantidad por cuenta y activo, lo que muestra cada bróker; es lo que se concilia) y **lotes fiscales** (globales por activo; es lo que alimenta la Renta).
- **Regla de validación:** no se puede dar de alta un activo en el libro `bucket` si existe en `core` (ni al revés). Si el mismo activo está en dos cuentas del mismo libro, se permite con aviso.
- Empates de fecha de adquisición: se ordena por `id` (orden de registro).

## Consecuencias

- La conciliación compara cantidades y efectivo por cuenta, nunca lotes.
- `business-rules.md` §5.3 actualizado con la regla; `data-schema.md` §8 describe el algoritmo.

## Enmienda del 2026-09-24 (feature 012): el lote de una corrección conserva el sitio de su raíz

Decidida por la dirección en la revisión adversarial de la PR #75 (`specs/012-ecb-reference-rates/questions.md` §10.1 y §11.2).

**Primero, una precisión que este texto debía desde la Ronda 4.** «Se ordena por `id` (orden de registro)» ya no describía el código: el desempate es la **posición en el fichero** del evento que abre el lote (`docs/data-schema.md` §2 y §8.1), porque dos dispositivos con relojes distintos generan ULID desordenados (ADR-0026).

**Qué cambia.** El lote de una corrección (`corrects_id`) **hereda la posición en el fichero de la raíz de su cadena**: el evento al que se llega siguiendo `corrects_id` hasta uno que no corrige nada. Esa posición **desempata los lotes de la misma fecha de adquisición** y **ordena las operaciones del mismo día de negocio** en la proyección, y las **tesis del cubo** usan esa misma raíz para situar una compra o una venta corregida respecto de la apertura y el cierre de su tesis. No hay campo nuevo: se deriva de la cadena. La raíz es la misma que usa la regla de una sola corrección viva (ADR-0026, Parte C, enmendada el mismo día): una sola noción de raíz, en `packages/domain/src/projections/correction-root.ts`.

**Motivo de la dirección.** Una corrección representa **el mismo hecho económico**, y corregir un dato de una compra no cambia cuándo ocurrió. Antes, la corrección se añadía al final del fichero y su lote saltaba detrás de los demás lotes del mismo día, así que una venta podía pasar a consumir **otro lote**: la ganancia se movía mucho más que el cambio de tipo, sin aviso. El caso del revisor: dos compras del mismo día de un ETC en dólares y una venta de la mitad; `atlas fx correct` anunciaba solo un cambio de tipo (de 1,1169 a 1,1195) y la ganancia del ejercicio se reducía casi a la mitad, porque la venta pasaba a consumir el otro lote. Venía de la feature 001 (`atlas edit` hacía lo mismo), y la 012 lo automatizaba en lote. Y la segunda pasada encontró lo mismo en el cubo: una compra corregida dos veces tras cerrar su tesis caía en `thesis_not_open`.

**Consecuencias.** Los libros dorados no se movieron (la única corrección de `synthetic-v1.jsonl` es un dividendo, que no abre lote y está solo en su fecha). Los lotes llevan la posición de su raíz (`FiscalLot.position`). Una cadena escrita a mano en bucle no tiene primer evento: cada miembro es su propia raíz, y la proyección la rechaza igualmente como corrección colgante.
