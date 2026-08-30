# ADR-0011 — Eventos corporativos como composición de primitivas de lote

**Estado:** Aceptada (2026-08-30). *Consecuencias fiscales: verificar con asesor.* La forma vigente de los parámetros de `forced_sale` y `grant` (`per_account[]` con comisión por cuenta, `fx_rate_date`, `asset_id?` en todo efecto, `ratio` decimal o fracción) es la de `docs/data-schema.md` §6.5, revisada en el *challenge* y en las features 001-002; la tabla siguiente conserva la redacción original.

## Contexto

`business-rules.md` §6 lista catorce tipos de evento corporativo. Implementar un manejador por tipo produce catorce funciones con lógica repetida de consumo y creación de lotes, y los casos mixtos (fusión con pago en efectivo) acaban siendo un manejador más. Además, hay que decidir cuándo un cambio de identificador es catálogo y cuándo un activo nuevo.

## Opciones consideradas

1. **Composición de cinco primitivas de lote**, con una tabla que valida qué combinación admite cada `kind`.
2. Un manejador por `kind`.

Identificadores: **según la naturaleza del cambio** (puro → `asset_updated`; cualquier otro → activo nuevo + `convert`) frente a siempre activo nuevo.

## Decisión

1. Un `corporate_action` lleva `kind` (para las personas y la fuente documental) y `effects[]`, una lista ordenada de primitivas. El dominio solo sabe ejecutar cinco:

| Primitiva | Parámetros | Invariante |
|---|---|---|
| `scale` | `ratio` | Cantidad × ratio; coste total y fecha intactos |
| `convert` | `to_asset_id`, `ratio` | Los lotes pasan al activo destino con cantidad × ratio; coste total y fecha intactos |
| `carve_out` | `to_asset_id`, `ratio`, `cost_share` | Crea lotes en el destino con `cost_share` del coste de cada lote origen y su fecha; el origen conserva `1 − cost_share` |
| `forced_sale` | `quantity` o `all`, `unit_price`, `currency`, `fx_rate`, `fee?` | Idéntica a un `sell` en FIFO: hecho imponible; el efectivo entra en cada cuenta en proporción a su posición física |
| `grant` | `account_id`, `asset_id`, `quantity`, `unit_cost`, `currency`, `fx_rate`, `acquisition_date` | Crea un lote nuevo con ese coste y fecha |

   Una tabla de dominio (`data-schema.md` §8.5) fija qué secuencia admite cada `kind`; el evento se rechaza si no encaja.

2. Cambio de identificadores: si solo cambia ISIN o ticker (mismo producto, clase, TER y divisa), es un `asset_updated`; los lotes no se tocan y el historial de precios sigue. Si cambia cualquier otra cosa (clase, fusión, migración), es `asset_created` + `corporate_action` con `convert`.

3. Los dividendos en efectivo no son eventos corporativos: son `dividend`.

## Consecuencias

- Cinco funciones puras con tests de propiedades: `scale` y `convert` conservan el coste total; `carve_out` reparte exactamente el 100%; `forced_sale` produce el mismo resultado que un `sell`; `scale(r)` seguido de `scale(1/r)` deja los lotes idénticos.
- Un tipo de evento nuevo en el futuro es una fila en la tabla, no código.
- La CLI y la web ofrecen asistentes por `kind` que generan los `effects` a partir de preguntas sencillas (ratio, activo destino, precio de liquidación).
