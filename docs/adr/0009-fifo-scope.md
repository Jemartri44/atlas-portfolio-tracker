# ADR-0009 — Ámbito del FIFO y activos compartidos entre libros

**Estado:** Aceptada (2026-08-30). *Verificar con asesor fiscal.*

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
