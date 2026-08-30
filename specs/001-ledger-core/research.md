# Investigación (Fase 0) — `001-ledger-core`

Decisiones de detalle que el prompt deja al implementador, con alternativas descartadas, y la lectura comparada de Beancount y Ghostfolio que pide `docs/prompts/001-ledger-core.md` §2.3. Nada de lo que sigue cambia un ADR ni el esquema.

## 1. Comparación con Beancount (`beancount/core/inventory.py`, `position.py`)

**Cómo modela Beancount.** Un `Inventory` es un diccionario `(currency, Cost) → Position`. `Position = (units: Amount, cost: Cost | None)` y `Cost = (number por unidad, currency, date, label)`, ambos inmutables. El emparejamiento es **estricto**: dos posiciones solo se funden si coinciden divisa y la tupla de coste completa (importe, divisa, fecha, etiqueta). `add_amount` devuelve `(posición previa, CREATED | AUGMENTED | REDUCED | IGNORED)`; una posición que llega a cero se elimina. `CostSpec` permite al usuario dar el coste a medias (por unidad o total, con o sin fecha/etiqueta) y que el *booking* (módulo aparte, `booking_full.py`) resuelva contra qué lotes se reduce según el método de la cuenta: `STRICT`, `FIFO`, `LIFO`, `AVERAGE`, `NONE`. El inventario admite posiciones negativas (cortos) y detecta mezclas de signo (`is_mixed`); tiene tolerancias (`is_small`) para restos de redondeo; `average()` funde lotes ponderando el coste y quedándose con la fecha mínima.

**Lo que nuestro esquema ya cubre igual o mejor.** Lotes inmutables con fecha y coste total; el coste es un derivado del evento (no un dato editable); FIFO por posición en el fichero como desempate (Beancount desempata por fecha y luego por orden de aparición, lo mismo); el traspaso conserva la tupla de coste (en Beancount se expresa como reducción y aumento con la **misma** `Cost`, incluida la fecha, que es exactamente nuestro `transfer`).

**Lo que Beancount cubre y nuestro esquema no (anotado, no implementado).**

| Caso Beancount | Nuestro esquema | Qué se hace en la 001 |
|---|---|---|
| Posiciones negativas (venta en corto) | Rechazadas: `sell` mayor que la posición física falla | Nada. El plan no contempla cortos; anotar en `decision-roadmap` si algún día importa |
| Booking `AVERAGE`, `LIFO`, `STRICT` (elección explícita de lote) | Solo FIFO (es el método legal en España) | Nada. La lista de lotes abiertos se mantiene ordenada; añadir otro método sería una función más de `lots.ts` |
| `CostSpec` parcial resuelto después (el usuario da el total y el sistema reparte) | `amount` como base (ADR-0012) equivale a "coste total"; `unit_price` a "coste por unidad" | Cubierto |
| Coste en divisa distinta de la del precio (compra en USD contabilizada en EUR) | Cubierto por `currency` + `fx_rate`; el coste EUR es derivado | Cubierto |
| Tolerancias de redondeo por divisa (`is_small`) | Sin tolerancias: todo exacto; los restos no existen porque nunca se redondea dentro | `integrity` compara con igualdad exacta; si una fixture real trae restos, es un caso para la 003 |
| Orden de aplicación por fecha (Beancount **ordena las entradas por fecha** antes de aplicar el booking) | **Adoptado** (Q1-b): las operaciones se proyectan por `(fecha de negocio, posición)`; el fichero conserva el orden de registro y desempata | Era la diferencia más relevante encontrada; el usuario la resolvió a favor del criterio de Beancount |
| Etiqueta de lote (`label`) para elegir lote a mano | Sin equivalente | No hace falta con FIFO obligatorio |
| Inventario mezclado (lotes positivos y negativos a la vez) | Imposible por construcción | — |

**Idea que sí adoptamos:** la separación inventario / booking. `lots.ts` mantiene el inventario (lista ordenada de lotes abiertos por activo) y una única función `consume()` implementa el booking FIFO; `sell`, `transfer` fiscal y en la 002 `forced_sale`/`convert`/`carve_out` llaman a la misma función. También el retorno `{lotId, quantity, costEur}` por lote consumido, que es lo que necesita `realizedGains`.

## 2. Comparación con Ghostfolio (`prisma/schema.prisma`)

**Cómo modela Ghostfolio.** Una actividad (`Order`) tiene `date`, `type` (`BUY | SELL | DIVIDEND | FEE | INTEREST | LIABILITY`), `quantity`, `unitPrice`, `fee`, `currency?`, `accountId?`, `symbolProfileId`, `comment`, `tags`. Las cuentas tienen `AccountBalance[]` (fotos de saldo) y `platform`. Los activos (`SymbolProfile`) llevan `assetClass`, `assetSubClass`, `dataSource`, `isActive` y `assetProfileSplits` (los splits son metadatos del activo, no eventos). **Todos los importes son `Float`.** No hay lotes, ni base de coste por lote, ni traspasos, ni eventos corporativos más allá del split como metadato.

**Lo que aporta a nuestro diseño.** Confirma tres elecciones: (1) `interest` y `standalone_fee` como eventos de cuenta sin activo (Ghostfolio `INTEREST`, `FEE`); (2) `platform` en la cuenta separado del `book`; (3) un único `date` es insuficiente: Ghostfolio no distingue contratación de liquidación y nosotros necesitamos ambas (ADR-0013). Y confirma dos anti-patrones que evitamos: importes en coma flotante y `AccountBalance` como dato almacenado (nuestro `cashBalances` es proyección).

**Lo que Ghostfolio cubre y nosotros no.** `LIABILITY` (pasivos) y `tags` libres por actividad. Ninguno está en el plan; `notes` cubre el segundo de forma pobre.

## 3. Decisiones de detalle

| # | Decisión | Razón | Alternativas descartadas |
|---|---|---|---|
| R1 | `big.js` **7.0.1** vendorizada (MIT, sin dependencias; `https://registry.npmjs.org/big.js/-/big.js-7.0.1.tgz`, tarball `sha512-iFgV784tD8kq4ccF1xtNMZnXeZzVuXWWM+ERFzKQjv+A5G9HC8CY3DuV45vgzFFcW+u2tIvmF95+AzWgs6BjCg==`). Se copia `big.js` (ESM del tarball) y se calcula el SHA-256 del fichero copiado para `VENDOR.md` | Última estable a 2026-08-30 | Ninguna: fijado por ADR-0005 |
| R2 | `Big.DP = 10`, `Big.RM = 1` (half-up) para divisiones | ADR-0005: "derivados con 10 decimales"; sumas, restas y productos son exactos en `big.js` | `DP = 20` (más precisión sin respaldo documental) |
| R3 | SHA-256 **implementado en `domain`** (~70 líneas, síncrono, sobre UTF-8) | La huella es un dato del evento; `crypto.subtle` es asíncrono y `node:crypto` rompe el aislamiento del dominio; `docs/dependencies.md` pide escribir a mano lo pequeño | Puerto `Hasher` (no está en la lista de puertos de ADR-0007); huella sin hash (el esquema dice `sha256:`) |
| R4 | ULID propio: 48 bits de tiempo (`clock.now()`) + 80 bits aleatorios (`globalThis.crypto.getRandomValues`, estándar en Node 22 y navegador), monótono en proceso incrementando la parte aleatoria si el milisegundo se repite | Prompt §3.3; `crypto.getRandomValues` es un global de la plataforma, no un import | Puerto `IdGenerator` (innecesario: la inyección del `Clock` ya hace los tests deterministas y la parte aleatoria se inyecta como función opcional) |
| R5 | Fecha `Europe/Madrid` con `Intl.DateTimeFormat('en-CA', {timeZone})` (`formatToParts`) | Biblioteca estándar; sin `dayjs`/`luxon` | Tabla de cambios de hora a mano (frágil) |
| R6 | Proyección cronológica: catálogo y configuración en orden del fichero; operaciones y seguimiento ordenadas de forma estable por `(fecha de negocio, posición)`; registrar tarde es normal y no genera aviso | Q1 resuelta por el usuario (opción b, criterio de Beancount); `data-schema.md` §2/§8.1 lo recogen desde `develop` (PR #8) | Orden del fichero literal con aviso `out_of_order` (supuesto inicial); rechazo en registro |
| R7 | `etag` del fichero = SHA-256 de los bytes (Node `crypto` en `adapters`) | Detecta cualquier escritura ajena; no depende de `mtime` (resolución variable en WSL/NTFS) | `size + mtimeMs` |
| R8 | Escritura atómica: temporal en el mismo directorio + `fsync` + `rename`; conflicto comprobado releyendo justo antes de escribir | Prompt §3.3; a esta escala la ventana entre comprobación y `rename` es aceptable y está documentada | Bloqueo con fichero `.lock` (más estados que limpiar) |
| R9 | Vitest en la raíz con `test.projects` por paquete, `resolve.alias` `@atlas/domain` → `packages/domain/src/index.ts` (y `adapters`), cobertura `include: packages/domain/src/**` con umbral 100 en las cuatro métricas | Tests sin build previo; umbral solo en `domain` (constitución VII) | `vite-tsconfig-paths` (dependencia extra); cobertura por paquete (tres configs) |
| R10 | Build con `tsc -b` (project references) a `dist/`; `exports` de cada paquete apunta a `dist`; la CLI se ejecuta con `node apps/cli/dist/main.js` o `npm run atlas --` | Sin `esbuild` hasta que haya Lambda | `esbuild` ahora (no lo pide el prompt) |
| R11 | Parser de argumentos propio: `atlas <cmd> [sub] [pos…] [--k v | --flag]`; `--k=v` también; `--` termina flags | Prompt §3.5: sin dependencias | `node:util.parseArgs` (válido, pero no soporta bien subcomandos anidados; se evalúa en implementación como base del parser si simplifica) |
| R12 | Confirmación interactiva con `node:readline/promises`; si `stdin` no es TTY y falta `--yes`, la CLI falla con código 4 en vez de bloquear | Scripts y CI no se cuelgan | Asumir sí (peligroso) |
| R13 | `.github/workflows/ci.yml` se **crea**; el resto de `.github/` no se toca | Prompt §3.1 lo pide explícitamente; §2 bis prohíbe "tocar `.github/`", que se interpreta como "no modificar lo existente" (ver `questions.md`) | No crear CI (incumple §3.1 y §5) |
| R14 | Tipos de evento de la 002 (`corporate_action`, `thesis_*`) figuran en `KNOWN_TYPES` como *reservados*: `validateShape` los acepta a nivel de envoltorio, `projectLedger` lanza `UnsupportedEventError` | "Discriminador abierto" del prompt: la 002 añade su rama sin tocar envoltorio ni cargador | Rechazar en el cargador (obligaría a cambiar el cargador en la 002) |
| R15 | `Settings` tipado con todos los parámetros de `business-rules.md` §7 como opcionales salvo `fiscal_date_rule` y `wash_sale_window_days`; `DEFAULT_SETTINGS` solo rellena esos dos; `atlas settings set` funde sobre la vigente y escribe el objeto completo | `settings_changed` lleva el objeto completo; nada hard-coded salvo los defaults documentados y marcados "verificar" | Tipar solo lo que usa la 001 (obligaría a migrar el tipo después) |
| R16 | Versiones de desarrollo: las últimas estables al hacer `npm install` (`typescript` 5.x, `@biomejs/biome` 2.x, `vitest` + `@vitest/coverage-v8` misma major, `fast-check` 4.x, `@types/node` 22.x), fijadas por `package-lock.json` | Presupuesto cerrado pero sin versión fijada en `docs/dependencies.md` | — |

## 4. Resolución de las clarificaciones del spec

Las tres clarificaciones (A1-A3) las resolvió el usuario el 2026-08-30: Q1-b (proyección cronológica), Q2-a (rechazar compras en `bucket` hasta la 002), Q3-a implementada como c (configuración vigente al final del libro, pasada como parámetro). Además corrigió ADR-0012: la huella manual **no** incluye el `id` propio (`broker_ref ?? ""`), porque si entrara dos registros idénticos nunca avisarían. Cada decisión vive en una función (`orderForProjection`, validación de `buy`, `resolveFiscalSettings`, `fingerprintOf`).
