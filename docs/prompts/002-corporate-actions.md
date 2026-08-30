# Prompt 002 — Feature `002-corporate-actions`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/002-corporate-actions.md` en el repositorio. **No empieces hasta que la PR de `fix/001-review-fixes` esté fusionada en `develop`** (prompt `001-review-fixes`): esta feature parte de ese código.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a construir la segunda feature de código: los **eventos corporativos** como composición de cinco primitivas de lote, las **tesis del cubo especulativo** y la proyección `valuations(date)`. Con ella el libro mayor queda completo para la Fase 1. Las decisiones están tomadas y documentadas; tu trabajo es implementarlas con exactitud, no rediseñarlas.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero, en especial *Working on a feature*, *Code architecture*, *Domain traps* y *Language*.
2. `.specify/memory/constitution.md`.
3. `docs/adr/README.md` y los ADRs 0003, 0005, 0009, 0011 (el central de esta feature), 0012 y 0013.
4. `docs/data-schema.md` completo, con lupa en §6.2 (`corporate_action`), §6.4 (cubo), §6.5 (primitivas), §7 (proyecciones, en particular §7.1) y §8.5 (tabla de composición por `kind`, con ejemplos numéricos que son tus vectores de prueba).
5. `docs/business-rules.md` §4 (reglas 13-19 del cubo), §5.3, §6 (eventos corporativos); `docs/specification.md` §4.3 y §6.2; `docs/fiscal-questions.md` (preguntas 7, 8 y 9: criterios provisionales que **no** debes cerrar tú).
6. `specs/001-ledger-core/` entero (spec, plan, data-model, contracts, questions): es el código sobre el que construyes. En el código: `packages/domain/src/projections/lots.ts` (`openLot`, `consume`), `operations.ts` (`applyBuy`, `applySell`, `applyTransfer` son tus modelos), `project-ledger.ts` (las tres pasadas), `schema/validate.ts`, `schema/envelope.ts` (`RESERVED_EVENT_TYPES`).
7. `docs/dependencies.md`.

Si encuentras una contradicción o una ambigüedad que te impida seguir, **no la resuelvas tú**: anótala en `specs/002-corporate-actions/questions.md` y avisa al usuario. Nada fiscal ni estructural se decide en esta feature.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado** (después de fusionar `fix/001-review-fixes`):
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-002 -b feature/002-corporate-actions origin/develop
   cd ../atlas-portfolio-tracker-002 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit: `/speckit-specify` con el alcance de la sección 3 → `/speckit-clarify` si hace falta → `/speckit-plan` → `/speckit-tasks`. Artefactos en `specs/002-corporate-actions/`, en español con identificadores en inglés. **Enseña `spec.md` y `plan.md` al usuario y espera su visto bueno antes de escribir código.**
3. Al planificar, lee cómo Portfolio Performance modela los eventos corporativos (paquete `name.abuchen.portfolio.model`, clases `Transaction`, `PortfolioTransaction` y el tratamiento de *splits* en `SecurityEvent`) y anota en `plan.md` los casos que ellos cubren y nuestra tabla §8.5 no. No copies código.
4. `/speckit-implement` por tareas, commits atómicos, Conventional Commits en inglés (el hook los valida).
5. PR a `develop` con la plantilla, checklist rellena con honestidad. No fusiones.

## 2 bis. Reglas de operación

Las de `CLAUDE.md` § *Working on a feature* y las de `docs/prompts/001-ledger-core.md` §2 bis, que siguen vigentes íntegras. Resumen de lo que más importa aquí:

- Solo trabajas en `feature/002-corporate-actions`. Nunca push a `develop`/`main`, nunca `--force`, nunca reescribas historial.
- No puedes tocar `docs/`, los ADRs, la constitución, `.githooks/`, `.claude/`, ni lo que ya existe en `.github/`. Si crees que un documento debe cambiar, es una pregunta en `questions.md`.
- No añadas dependencias: `docs/dependencies.md` es la lista cerrada. `domain` sigue sin importar nada fuera de `src/` y `vendor/`.
- Cobertura 100 % de líneas y ramas en `packages/domain`, bloqueante. Biome limpio antes de cada commit.
- Código, identificadores, commits, ficheros: inglés. Specs y mensajes de la CLI: español con identificadores en inglés.

## 3. Alcance

### 3.1 Eventos nuevos (data-schema §6.2, §6.4)

- `corporate_action`, `thesis_opened` y `thesis_closed` salen de `RESERVED_EVENT_TYPES` y pasan a soportados: tipos TypeScript, reglas de forma en `validate.ts`, ramas en `project-ledger.ts`. `RESERVED_EVENT_TYPES` queda vacío (mantén el mecanismo: la 003 puede necesitarlo).
- **`corporate_action`**: `kind`, `asset_id`, `effective_date`, `source_document`, `effects[]`, `notes?`, `fingerprint`. Fecha de negocio para la proyección cronológica (§7.1): `effective_date`. Huella: `sha256` de `["", "", "", asset_id, "corporate_action", effective_date, kind, "", ""]` (patrón de `fingerprint.ts`).
- `source_document` es una cadena obligatoria y no vacía: clave en `documents/<event_id>/…` o URL del emisor. En esta feature **no** hay `DocumentStore`: la CLI guarda la cadena tal cual y recuerda al usuario que copie el PDF a mano (mensaje, no validación).
- **Primitivas** (`effects[].op`): `scale`, `convert`, `carve_out`, `forced_sale`, `grant`, con los parámetros de §6.5. Todo numérico como cadena decimal. Cada efecto admite `asset_id?` que por defecto es el `asset_id` del evento (ver §6 de este prompt, decisión a).

### 3.2 Semántica de las primitivas (ADR-0011, data-schema §6.5, §8.5)

Se aplican **en el orden del array**, sobre el estado ya proyectado hasta `effective_date` (pasada B). Cada una valida primero y muta después, como los `apply*` de `operations.ts`. Los lotes fiscales son globales por activo (ADR-0009); las posiciones físicas, por cuenta.

| Primitiva | Lotes fiscales | Posiciones físicas | Efectivo | Hecho imponible |
|---|---|---|---|---|
| `scale(ratio)` | Cada lote abierto del activo: `quantity × ratio` (exacto, `mul`); `cost_eur`, `acquisition_date`, `id` intactos | Cada cuenta: `position × ratio` | No | No |
| `convert(to_asset_id, ratio)` | Cada lote abierto pasa a `to_asset_id` con `quantity × ratio`, mismo coste total y fecha; lote nuevo con `source_lot_id` al origen; el origen queda cerrado con una consumición que referencia el evento | Cada cuenta: `−position` del origen, `+position × ratio` del destino | No | No |
| `carve_out(to_asset_id, ratio, cost_share)` | Por cada lote abierto crea uno en `to_asset_id` con `quantity × ratio`, `cost_eur × cost_share`, misma fecha, `source_lot_id`; el origen queda con `cost_eur × (1 − cost_share)` (usa la resta para que la suma sea exacta) | Cada cuenta: `+position × ratio` del destino; el origen no cambia | No | No |
| `forced_sale(per_account[], unit_price, currency, fx_rate, fx_rate_date)` | Por cada `{account_id, quantity, fee?}`: exactamente un `sell` en esa cuenta del activo del efecto (`consume()` FIFO global, `recordGain` con `fiscal_date = effective_date`). `quantity: "all"` = la posición física de la cuenta | `−quantity` en la cuenta | `+ quantity × unit_price − fee` en `currency` en esa cuenta (valor de transmisión en EUR: `(quantity × unit_price − fee) / fx_rate`); sin `withholding` | **Sí**, aunque la ganancia sea cero |
| `grant(per_account[], asset_id, unit_cost, currency, fx_rate, fx_rate_date, acquisition_date)` | Un lote nuevo por cuenta con `cost_eur = quantity × unit_cost / fx_rate` y la `acquisition_date` dada (puede ser la del evento o la de los lotes origen, según el folleto) | `+quantity` en la cuenta | **No**: si el usuario pagó algo (ampliación con desembolso), eso es un `buy`, no un `grant` | No |

Reglas transversales:
- El activo destino de `convert`, `carve_out` y `grant` debe existir en el catálogo (`asset_created` previo, mismo `book` que el origen). Un `corporate_action` nunca crea activos; la CLI propone el `asset add` antes.
- Tras un `convert` de todos los lotes, el activo origen queda con posición cero en todas las cuentas; marcarlo `active = false` es un `asset_updated` aparte (la CLI lo propone; no lo escribe sola).
- `forced_sale` y `grant` rechazan cuentas que no existan o que sean de otro libro; `forced_sale` rechaza `quantity` mayor que la posición física de la cuenta (mismo error `insufficient_position` que `sell`).
- Las divisiones (`ratio` no exacto, `cost_share`) siguen ADR-0005: 10 decimales half-up; el **último** lote o cuenta recibe el resto exacto para que las sumas cuadren, como ya hace `applyTransfer`.
- Los lotes creados por un efecto llevan como `position` (desempate FIFO) la del evento origen del lote del que proceden (`convert`, `carve_out`), o la del `corporate_action` (`grant`). Esto sigue el criterio fijado en `001-review-fixes` punto 4.
- Reutiliza `consume()` y `openLot()` de `lots.ts` y `recordGain()` de `gains.ts`. No dupliques el FIFO.

### 3.3 Tabla de composición por `kind` (data-schema §8.5)

`validateShape` comprueba la forma de cada efecto; la **proyección** comprueba que la secuencia `effects[]` encaja en la fila de `kind` y rechaza con `ProjectionError` (`effects_not_allowed_for_kind`) si no. Implementa la tabla como datos (un objeto `KIND_RULES: Record<Kind, EffectPattern>`), no como catorce `if`. Filas, con la ampliación de la decisión (b) de §6:

| `kind` | `effects` admitidos |
|---|---|
| `split` | `scale` |
| `reverse_split` | `scale` (+ `forced_sale?` sobre el mismo activo, para los picos) |
| `stock_dividend` | `scale` **o** `grant` + `forced_sale?` (derechos vendidos: `grant` con `unit_cost` 0 sobre el activo "derechos" + `forced_sale` de ese activo) |
| `merger` | `convert` (+ `forced_sale?` antes, sobre el activo antiguo —componente en efectivo—, o después, sobre el nuevo —picos—) |
| `spin_off` | `carve_out` (+ `forced_sale?` sobre el activo escindido, para los picos) |
| `fund_merger` | `convert` |
| `share_class_change` | `convert` |
| `fund_liquidation` | `forced_sale` con `"all"` en todas las cuentas con posición |
| `issuer_liquidation` | `forced_sale` con `"all"` (puede ser a precio 0) |
| `delisting` | ninguno (`effects: []`); solo deja constancia y fuente documental; el `asset_updated` con `active = false` es aparte |
| `crypto_fork` | `grant` |
| `token_migration` | `convert` |
| `issuer_restructuring` | cualquier secuencia de `convert` y `forced_sale` |

Cada fila tiene su test con el ejemplo numérico de §8.5 (10 títulos, 1.000 €, 2027-01-10) y el resultado que allí se indica, a céntimo.

### 3.4 Tesis del cubo (data-schema §6.4, business-rules reglas 13-19, constitución III)

- `thesis_opened`: `thesis_id`, `account_id`, `asset_id`, `hypothesis`, `expected_horizon_days` (entero JSON; no es importe), `invalidation`, `planned_size_eur` (cadena decimal). `thesis_closed`: `thesis_id`, `closing_notes`.
- Son eventos **sin fecha de negocio**: se proyectan en la **pasada A**, en orden de fichero, como el catálogo. "Antes de abrir la posición" (regla 15) significa "antes en el fichero". Sus fechas administrativas son la de `recorded_at` en `Europe/Madrid` (`madridDateOf`).
- Validación: `account_id` debe ser una cuenta `bucket` y `asset_id` un activo `bucket` (ADR-0009: un activo no puede estar en los dos libros); `thesis_id` único; como máximo **una tesis abierta** por (`account_id`, `asset_id`); `thesis_closed` exige una tesis abierta con ese id.
- **`buy` en cuenta `bucket`** (sustituye al rechazo provisional de la 001, Q2): exige `thesis_id`, que debe referenciar una tesis abierta **anterior en el fichero** y de la misma cuenta y activo. `sell` en `bucket` admite `thesis_id?` con la misma validación (decisión c de §6); sin él, se acepta con aviso `sell_without_thesis`.
- Proyección `theses(state)`: por tesis, estado (`open` | `closed`), fechas administrativas de apertura y cierre, eventos `buy`/`sell` enlazados, cantidad invertida en EUR (suma del coste de los `buy`), `result_eur` = suma de `gain_eur` de los `sell` enlazados (exacto, y redondeado una vez), comisiones acumuladas en EUR de esos eventos (regla 14), posición física viva de (`account_id`, `asset_id`) y `days_open` a una fecha dada. **`result_vs_index` y todo lo que necesite precios queda para la Fase 3.**
- Avisos, no errores: cerrar una tesis con posición física viva (`thesis_closed_with_position`); `buy` en el cubo que supera `planned_size_eur` acumulado (`thesis_size_exceeded`). Las reglas 17 y 18 (parada y recogida) dependen de precios y de `Settings` pendientes: fuera de alcance.

### 3.5 Proyección `valuations(date)` (data-schema §7)

Sobre `state.valuations` (ya se guardan desde la 001): para una fecha dada, la última `valuation` por (`account_id`, `asset_id`) con `date ≤` la pedida, con `quantity`, `unit_value`, `currency`, `fx_rate` y el valor en EUR (`quantity × unit_value / fx_rate`, 10 decimales). Solo informativa (Modelo 720); ningún cálculo fiscal la usa.

### 3.6 CLI (`apps/cli`)

- `atlas ca <kind> …` con un **asistente por `kind`** para los casos habituales, que construye `effects[]` a partir de flags sencillas y **muestra el evento completo y el efecto sobre lotes y posiciones** (tabla antes/después) antes de pedir confirmación:
  - `split --asset --ratio --effective-date --source-document`
  - `reverse-split --asset --ratio --effective-date --source-document [--cash-per-share <precio> --currency --fx-rate --fx-rate-date]`: calcula las fracciones por cuenta a partir de `physicalPositions` y genera el `forced_sale` con `per_account[]`.
  - `merger --asset --to-asset --ratio [--cash-per-share …]`, `spin-off --asset --to-asset --ratio --cost-share [--cash-per-share …]`, `fund-merger --asset --to-asset --ratio`, `share-class-change --asset --to-asset --ratio`, `fund-liquidation --asset --unit-price --currency --fx-rate --fx-rate-date`, `delisting --asset`.
  - `raw --asset --kind --effects-json <fichero o cadena>` para el resto (`stock_dividend`, `issuer_liquidation`, `crypto_fork`, `token_migration`, `issuer_restructuring`): el usuario escribe los `effects[]` y la CLI los valida contra la tabla.
  - Todas: `--effective-date`, `--source-document`, `--notes`, `--yes`, `--confirm-duplicate`.
- `atlas thesis open|close|list [--closed]` y `atlas add buy|sell --thesis <id>`.
- `atlas valuations [--date YYYY-MM-DD]`.
- `atlas lots`, `atlas gains` y `atlas positions` deben mostrar correctamente los lotes y ganancias que vienen de un `corporate_action` (columna `origen` con el `kind`).
- `atlas edit` no edita `corporate_action` ni tesis (usa `delete` + registrar de nuevo); `atlas delete` sí, con la lista de dependientes que ya existe.

### 3.7 Tests (constitución VII, ADR-0011)

- **Propiedades** (`fast-check`): `scale` y `convert` conservan el coste total por activo; `carve_out` reparte exactamente el 100 % (`coste_origen_después + coste_destino = coste_origen_antes`); `forced_sale` sobre una cuenta produce el **mismo** estado que un `sell` equivalente en esa cuenta; `scale(r)` seguido de `scale(1/r)` deja cantidades y costes idénticos (usa ratios con inverso exacto: 2, 4, 5, 8, 10 y sus inversos); tras cualquier `corporate_action` válido, `Σ lotes abiertos = Σ posiciones físicas` por activo e `integrity` está limpio; proyectar dos veces da lo mismo.
- **Casos límite obligatorios**: contrasplit con liquidación en efectivo **en dos cuentas** (10 y 7 títulos, 1:4 → A queda con 2 y vende 0,5; B con 1 y vende 0,75; cada efectivo en su cuenta); fusión con pago en efectivo (ejemplo de §6.5); escisión con picos; fusión de fondos con ratio no entero (1,7); `fund_liquidation` con lotes en dos cuentas; `issuer_liquidation` a cero (pérdida total); `crypto_fork` con coste cero y venta posterior (tributa todo); `convert` sobre un activo con lotes heredados de un traspaso (conserva la fecha original dos veces); `corporate_action` registrado tarde con `effective_date` anterior a ventas ya registradas (proyección cronológica: las ventas posteriores consumen los lotes ya transformados); `reversal` de un `corporate_action` cuyos lotes resultantes ya se vendieron (rechazo con lista); secuencia de efectos que no encaja con el `kind` (rechazo); `effects: []` en un `kind` que exige efectos (rechazo); `buy` en el cubo sin tesis, con tesis cerrada, con tesis de otro activo (rechazos); segunda tesis abierta sobre el mismo activo (rechazo); `thesis_closed` con posición viva (aviso).
- Cada fila de la tabla §8.5 con su ejemplo numérico a céntimo.
- CLI: un test por asistente con el evento generado y la tabla antes/después; `raw` con `effects` inválidos → código 1.

## 4. Fuera de alcance (no lo hagas aunque parezca fácil)

Métricas del cubo que necesitan precios (`result_vs_index`, P&L latente, curvas, reglas 17 y 18); regla de recompra (Fase 5); `DocumentStore` y subida de documentos; generador de datos sintéticos, `compact`, migraciones reales (003); importadores; API; web; Terraform; cambios de esquema no listados en §6 de este prompt.

## 5. Criterios de terminado

- `lint`, `typecheck`, `test:coverage` (100 % en `packages/domain`), `build` y CI en verde.
- `RESERVED_EVENT_TYPES` vacío; `integrity` de un libro con eventos corporativos y tesis, limpio.
- `docs/data-schema.md` sin cambios (si algo no encaja, es una pregunta).
- README: sección breve de eventos corporativos y tesis con un ejemplo inventado (un split y una tesis).
- `specs/002-corporate-actions/questions.md` con lo que hayas tenido que preguntar (o vacío, dicho explícitamente).
- PR a `develop` con la checklist de la constitución.

## 6. Decisiones fijadas por este prompt

Ajustes de detalle que la dirección ha cerrado al escribir este prompt y que están reflejados en `docs/data-schema.md` en `develop`. Si el código que encuentras no coincide con ellos, manda el esquema.

- **(a) `effects[].asset_id?`**: cada efecto puede indicar sobre qué activo actúa; por defecto, el `asset_id` del evento. Necesario para los picos tras un `convert`/`carve_out` (el `forced_sale` actúa sobre el activo nuevo) y para los derechos vendidos en un `stock_dividend`.
- **(b) `spin_off` admite `forced_sale?`** (picos de la escindida) y `merger` admite el `forced_sale?` antes o después del `convert`. Tabla §8.5 ampliada.
- **(c) `sell.thesis_id?`**: la venta del cubo puede enlazarse a su tesis, igual que la compra; sin él, aviso. Es lo que hace derivable `result_eur` sin heurísticas.
- **(d) `forced_sale.per_account[].fee?`**: la comisión de liquidación de picos se anota **por cuenta**, porque cada bróker la cobra por separado; el `fee?` de nivel de efecto desaparece.
- **(e) Tesis en la pasada A**: `thesis_opened`/`thesis_closed` se proyectan en orden de fichero, sin fecha de negocio; "antes" es "antes en el fichero".
