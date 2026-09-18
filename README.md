# Atlas Portfolio Tracker

Aplicación personal para gestionar una cartera de inversión a 20 años: libro mayor *append-only*, lotes fiscales FIFO, traspasos entre fondos y preparación de los datos de la Renta. **Nunca ejecuta órdenes**: cada operación se hace a mano en la plataforma y se registra aquí.

## Estado

- **Fases 1, 2 y 3 completas.** El libro mayor con lotes FIFO, traspasos y eventos corporativos; la aportación mensual repartida según los pesos objetivo; y el seguimiento del cubo especulativo frente a su índice. Todo se usa desde la CLI `atlas`.
- **La web, completa.** Resumen, Movimientos, Registrar, la cartera principal (Núcleo), Cubo, Ajustes y libro, con gráficas y todos los asistentes. Funciona entera en el dispositivo, sin servidor y sin cuenta.
- **Las previsiones fiscales del esquema, integradas.** El libro ya guarda los datos que necesitará el cálculo de la Renta (ADR-0021).
- **El motor fiscal, en implementación** (Fase 5).
- **Sin infraestructura en la nube todavía.** Ni API ni AWS: los datos viven en un fichero local o en el navegador.

Cada funcionalidad tiene su especificación en [`specs/`](specs/).

## Documentación

- [`docs/specification.md`](docs/specification.md) — especificación funcional y técnica. Es la referencia.
- [`docs/business-rules.md`](docs/business-rules.md) — reglas de dominio y mecánica fiscal española.
- [`docs/data-schema.md`](docs/data-schema.md) — formato del libro (`ledger.jsonl`), eventos, proyecciones y FIFO.
- [`docs/adr/`](docs/adr/) — decisiones de arquitectura. [`docs/dependencies.md`](docs/dependencies.md) — presupuesto cerrado de dependencias.
- [`CLAUDE.md`](CLAUDE.md) — contexto y convenciones para el asistente de código.
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — constitución del proyecto ([GitHub Spec Kit](https://github.com/github/spec-kit)). Los specs por funcionalidad viven en `specs/`.

El plan de inversión personal (`plan-financiero.md`) es privado y no está en el repositorio.

## Arranque en local

Requisitos: Node 22 (vía [nvm](https://github.com/nvm-sh/nvm)) y npm 10.

```bash
nvm install 22 && nvm use            # lee .nvmrc
npm ci                               # instala el toolchain (en runtime, solo Solid y su router en la web)
npm run lint && npm run typecheck    # Biome + tsc
npm test                             # vitest (dominio al 100 % de cobertura con npm run test:coverage)
npm run build                        # tsc -b de todos los paquetes + build de la web
npm run dev                          # servidor de desarrollo de la web en http://localhost:5173
npm run clean                        # borra dist/, dist-test/, coverage/ y la caché de Vite
```

`npm run clean && npm run build` reconstruye desde cero (los `.tsbuildinfo` viven dentro de `dist*/`, así que borrar la salida no deja estado incremental a medias, por ejemplo al cambiar de rama).

Estructura (ADR-0007): `packages/domain` (núcleo puro, sin imports externos; `vendor/big.js` para el decimal exacto), `packages/adapters` (`FileLedgerStore`, `MemoryLedgerStore`, `BlobLedgerStore` con sus dos *handles* de navegador, reloj y aleatoriedad del sistema), `apps/cli` y `apps/web`.

## La aplicación web

Local-first: **funciona entera en el dispositivo**, sin servidor, sin cuenta y sin conexión (ADR-0019). El *stack* es Solid, con Pico CSS y uPlot vendorizadas (ADR-0017).

```bash
npm run dev                          # http://localhost:5173
npm run build                        # produce apps/web/dist y comprueba el bundle
npm run preview                      # sirve el build de producción en :4173
```

### Cómo abrir un libro

Al arrancar por primera vez la aplicación pregunta dónde está el libro. Hay dos vías, y **cuál puedes usar depende del navegador**:

| Vía | Dónde funciona | Qué hace |
|---|---|---|
| **La carpeta de mi ordenador** (recomendada) | Chrome y Edge de escritorio | Eliges la carpeta que contiene tu `ledger.jsonl` y la web escribe en **ese mismo fichero**, el que usa la CLI. Sin copias ni sincronización. Puede crear `archive/` igual que `atlas compact` |
| **El almacenamiento del navegador** | Todos, y es la **única** vía en el móvil, Firefox y Safari | El libro vive dentro del navegador de ese dispositivo. Se importa y se exporta con un botón |

Dos cosas que conviene saber y que la aplicación te recuerda:

- **El permiso del fichero no sobrevive al cierre de todas las pestañas** (así funciona la File System Access API): al volver, la aplicación recuerda *qué carpeta era* y basta un clic en «Reconectar».
- **El almacenamiento del navegador no es un almacén definitivo**: si borras los datos del sitio, el libro se va con ellos. Por eso la aplicación avisa cuando llevas más de una semana sin exportar. En el ordenador, `atlas backup` sigue siendo la copia de referencia.

El modo privacidad está **activado por defecto**: oculta importes y cantidades, y deja a la vista porcentajes, pesos, desviaciones y fechas. Se conmuta desde la cabecera y se recuerda en el dispositivo.

### CSP: desarrollo y producción

`apps/web/index.html` lleva la política de producción (`script-src 'self'`, sin `unsafe-inline`). El servidor de desarrollo de Vite inyecta *scripts* en línea, así que `vite.config.ts` **relaja la misma política en `npm run dev`** (añade `'unsafe-inline'` a scripts y estilos, `'unsafe-eval'`, y `ws:`/`wss:` para el *hot reload*). Lo que se sirve en producción es la estricta, y `npm run build` comprueba sobre el resultado que no hay ni un `node:` ni una URL a un origen ajeno.

## Uso de la CLI

Tras `npm run build`, el ejecutable es `node apps/cli/dist/main.js` (o `npm run atlas --`). Todos los comandos aceptan `--ledger <ruta>` (por defecto `./ledger.jsonl`), `--yes` (omite la confirmación), `--confirm-duplicate` y `--json`. Ejemplo completo con datos inventados:

```bash
alias atlas='node apps/cli/dist/main.js --ledger ./demo.jsonl'

# Catálogo
atlas account add --id acc_fund --name "Fondos" --platform myinvestor --book core --base-currency EUR --country ES --yes
atlas asset add --id ast_world --type fund --book core --asset-class equity --name "World Index" --currency EUR --transferable --isin XX0000000001 --yes

# Operaciones (importes, cantidades y tipos de cambio siempre como texto decimal; el tipo BCE tal cual se publica)
atlas add cash-in --account acc_fund --value-date 2026-08-31 --amount 5000 --currency EUR --fx-rate 1 --fx-rate-date 2026-08-31 --yes
atlas add buy --account acc_fund --asset ast_world --trade-date 2026-09-01 --value-date 2026-09-02 \
  --quantity 10.123456 --amount 1000 --currency EUR --fx-rate 1 --fx-rate-date 2026-09-02 --yes

# Consultas
atlas positions          # posición física por cuenta y activo
atlas lots               # lotes fiscales (FIFO global por activo), con fecha y coste en EUR
atlas cash               # efectivo por cuenta y divisa
atlas gains 2027         # ganancias realizadas del ejercicio (redondeadas una vez por operación)
atlas income 2027        # dividendos e intereses
atlas weights --date 2027-12-31   # pesos, objetivos y desviaciones del núcleo
atlas contribute --amount 1000    # reparto de la aportación del mes (propone; no escribe)
atlas costs                       # comisiones, TER y coste anual, núcleo y cubo por separado
atlas bucket --date 2028-12-31    # el cubo: posiciones, tesis frente al índice, estadísticas y avisos
atlas networth --date 2028-12-31  # patrimonio total, siempre desglosado (núcleo + cubo + efectivo)
atlas thesis show th_delta        # la ficha de una tesis: hipótesis, plazo, operaciones y resultado
atlas check              # integridad del libro (proyección)
atlas check --deep       # además, líneas crudas: ids duplicados, huellas manipuladas, líneas no canónicas o antiguas

# Rectificar (el libro nunca se edita: anulación + evento corregido)
atlas edit <id> --reason "precio mal tecleado" --unit-price 123.45
atlas delete <id> --reason "duplicado"

# Seguimiento de órdenes y traspasos en curso, y exportación
atlas order place --account acc_fund --asset ast_world --side buy --amount 500 --requested-date 2027-07-01 --yes
atlas transfer request --from-account acc_fund --from-asset ast_world --to-account acc_fund --to-asset ast_bonds --quantity-out 4 --requested-date 2027-03-01 --yes
atlas export --format csv --out ledger.csv
```

### El ciclo mensual (Fase 2)

Los precios son manuales hasta la Fase 4: se registran como `valuation` y la aplicación siempre muestra de cuándo es cada uno. Ningún cálculo fiscal los mira.

```bash
# 1. Anota el valor liquidativo del mes de cada activo del núcleo
atlas add valuation --account acc_fund --asset ast_world --date 2027-12-31 \
  --quantity 120.45 --unit-value 105.20 --currency EUR --fx-rate 1 --fx-rate-date 2027-12-31 --yes

# 2. Mira cómo está repartida la cartera y qué se ha desviado del plan
atlas weights --date 2027-12-31

# 3. Calcula el reparto de la aportación del mes: el cubo aparte, el resto a lo más rezagado
atlas contribute --amount 1000 --date 2027-12-31

# 4. Da las órdenes A MANO en la plataforma y regístralas
atlas order place --account acc_fund --asset ast_bonds --side buy --amount 612.19 \
  --requested-date 2028-01-03 --yes
atlas add buy --account acc_fund --asset ast_bonds --order <order_id> \
  --trade-date 2028-01-03 --value-date 2028-01-05 --quantity 6.2 --amount 612.19 \
  --currency EUR --fx-rate 1 --fx-rate-date 2028-01-03 --fee 0 --yes
```

`atlas contribute` **propone y nunca escribe**: la aplicación no ejecuta órdenes ni elige valores del cubo. Si falta el precio de un activo con posición, se niega a repartir y dice cuál falta, en vez de repartir sobre un total incompleto.

Antes de traspasar entre fondos, `atlas transfer simulate --from-asset ast_world --to-asset ast_bonds --quantity 10` enseña los pesos antes y después y recuerda que un traspaso no es hecho imponible.

### El cubo especulativo (Fase 3)

El cubo es el libro donde se aprende: cada tesis se escribe **antes** de comprar (regla 15) y se mide contra la alternativa aburrida, el índice de referencia (regla 16). El índice es un activo más del catálogo, y sus precios salen de las mismas `valuation` que todo lo demás.

```bash
# 0. Una vez: di cuál es el índice de referencia del cubo
atlas settings set --bucket-benchmark-asset ast_world --yes

# 1. La tesis, antes de comprar: qué crees, en cuánto tiempo, qué te haría estar equivocado
atlas thesis open --id th_delta --account acc_bucket --asset ast_delta \
  --hypothesis "El contrato nuevo dobla los ingresos" --horizon-days 120 \
  --invalidation "Cierra por debajo de 15 EUR dos semanas seguidas" --planned-size 900 --yes

# 2. La compra, enlazada a la tesis (sin tesis no se puede comprar en el cubo)
atlas add buy --account acc_bucket --asset ast_delta --thesis th_delta \
  --trade-date 2027-12-20 --value-date 2027-12-22 --quantity 25 --unit-price 18.20 \
  --currency EUR --fx-rate 1 --fx-rate-date 2027-12-20 --fee 1 --yes

# 3. El cubo entero en un comando
atlas bucket --date 2028-12-31
atlas thesis show th_delta --date 2028-12-31
```

`atlas bucket` enseña las posiciones abiertas con su P&L latente, sus días abierta y **la condición de invalidación a la vista**; las tesis con su resultado frente al índice; las estadísticas de la operativa —tasa de acierto, esperanza, máxima caída y, destacadas, las **comisiones sobre el capital operado** (regla 14)—; y los avisos de las reglas de control (17 y 18). Todo avisa y nada bloquea: el libro nunca rechaza un hecho que ya ocurrió.

`atlas networth` es la única vista que suma los dos libros, y lo hace **siempre desglosada**: núcleo, cubo y efectivo por cuenta y divisa, con el tipo de cambio aplicado y de cuándo es. Si falta un precio o un tipo, el total sale marcado como parcial y dice qué falta.

Y al registrar una compra o una venta con pérdida, la aplicación avisa si cae dentro de la **ventana de recompra** (dos meses para cotizados, un año para fondos y cripto, contados de fecha a fecha): es el error fiscal más común en operativa activa. Avisa en las dos direcciones y **antes** de confirmar; el diferimiento lo calculará el motor fiscal de la Fase 5.

### Copia de seguridad provisional (Fases 1-3)

Mientras el libro real viva en un fichero local, haz una copia verificada tras cada sesión de registro y **siempre fuera del repositorio** (el repo es público):

```bash
atlas backup --to ~/atlas-private/backups
```

`.gitignore` ignora `ledger*.jsonl`, `demo*.jsonl` y `backups/` en todo el árbol como red de seguridad, pero la regla es no escribir datos reales dentro del repositorio.

### Eventos corporativos y tesis

Un evento corporativo (`corporate_action`) lleva un `kind` para las personas y una lista de **cinco primitivas de lote** (`scale`, `convert`, `carve_out`, `forced_sale`, `grant`) que es lo único que el dominio ejecuta; una tabla por `kind` decide qué secuencias se admiten (`docs/data-schema.md` §8.5, ADR-0011). Los asistentes `atlas ca <kind>` construyen los efectos a partir de flags sencillos, muestran el evento y una tabla **antes/después** de lotes y posiciones, y escriben solo tras confirmar. `ratio` admite un decimal (`4`, `0.25`) o una fracción `nuevas/antiguas` (`1/4`, `4/3`) para que un contrasplit 1:3 quede exacto.

```bash
# Split 4:1 de una acción: cantidades ×4, coste y fecha de adquisición intactos, sin hecho imponible
atlas asset add --id ast_acme --type stock --book core --asset-class equity --name "ACME" --currency EUR --not-transferable --yes
atlas add buy --account acc_fund --asset ast_acme --trade-date 2027-01-10 --value-date 2027-01-12 --quantity 10 --unit-price 100 --currency EUR --fx-rate 1 --fx-rate-date 2027-01-10 --yes
atlas ca split --asset ast_acme --ratio 4 --effective-date 2027-03-01 --source-document https://acme.example/split.pdf --yes

# Contrasplit 1:4 con liquidación de picos cuenta a cuenta (los picos son un hecho imponible aunque la ganancia sea cero)
atlas ca reverse-split --asset ast_acme --ratio 1/4 --effective-date 2027-06-01 --source-document https://acme.example/reverse.pdf \
  --cash-per-share 400 --currency EUR --fx-rate 1 --fx-rate-date 2027-06-01 --fees acc_fund=1 --yes

# Otros asistentes: merger, spin-off, fund-merger, share-class-change, fund-liquidation, delisting; raw para el resto
atlas ca raw --asset ast_acme --kind issuer_liquidation --effects-json '[{"op":"forced_sale","per_account":[{"account_id":"acc_fund","quantity":"all"}],"unit_price":"0","currency":"EUR","fx_rate":"1","fx_rate_date":"2028-01-15"}]' --effective-date 2028-01-15 --source-document documents/acme/liquidation.pdf --yes
```

El documento fuente (`--source-document`) se guarda como referencia: el PDF se copia a mano a `documents/`. Un `corporate_action` no se edita: `atlas delete <id>` y registrarlo de nuevo.

En el cubo especulativo **no se puede comprar sin tesis** (regla 15 del plan): la tesis se abre antes en el libro y cada compra la referencia con `--thesis`; las ventas también pueden enlazarse para que el resultado de la tesis sea derivable.

```bash
atlas account add --id acc_bucket --name "Cubo" --platform ibkr --book bucket --base-currency EUR --country IE --yes
atlas asset add --id ast_spec --type stock --book bucket --name "Spec Inc" --currency USD --not-transferable --yes
atlas thesis open --id th_spec_1 --account acc_bucket --asset ast_spec --hypothesis "Resultados Q3 por encima del consenso" \
  --horizon-days 90 --invalidation "Guidance recortada" --planned-size 500 --yes
atlas add buy --account acc_bucket --asset ast_spec --trade-date 2027-07-01 --value-date 2027-07-03 --quantity 10 --unit-price 50 --fee 1 --currency USD --fx-rate 1.1 --fx-rate-date 2027-07-01 --thesis th_spec_1 --yes
atlas add sell --account acc_bucket --asset ast_spec --trade-date 2027-09-01 --value-date 2027-09-03 --quantity 10 --unit-price 60 --fee 1 --currency USD --fx-rate 1.1 --fx-rate-date 2027-09-01 --thesis th_spec_1 --yes
atlas thesis close th_spec_1 --notes "Cumplida" --yes
atlas thesis list --closed     # invertido, resultado, comisiones, posición viva y días abierta
atlas valuations --date 2027-12-31   # última foto de valoración por cuenta y activo (Modelo 720)
```

Códigos de salida: `0` OK · `1` error de validación o de proyección · `2` conflicto de escritura (repite) · `3` huella repetida sin `--confirm-duplicate` · `4` falta confirmación sin terminal (añade `--yes`) · `5` libro escrito por una versión más nueva · `64` uso incorrecto.

### Datos sintéticos, compactación y copia de seguridad

Toda feature se prueba contra un **libro sintético** reproducible: `atlas synth` genera un libro de tres ejercicios con todos los tipos de evento y los casos raros (traspasos parciales encadenados, contrasplit con picos en dos cuentas, registro tardío, corrección de un ejercicio anterior, venta el 30/12 con liquidación el 02/01…), idéntico byte a byte para la misma semilla. La salida de la semilla 1 está congelada como *golden file* en `tests/fixtures/ledger/synthetic-v1.jsonl` junto con la instantánea de su proyección.

```bash
atlas synth --out demo.jsonl                 # semilla 1 (por defecto); rechaza si la ruta existe
atlas synth --out otra.jsonl --seed 42       # mismo esqueleto, otros importes, precios y fechas
atlas --ledger demo.jsonl check --deep       # verificación profunda sobre las líneas crudas
atlas --ledger demo.jsonl compact            # reescribe el libro a la versión actual del esquema…
                                             # …tras archivar el original tal cual en archive/ (no-op si no hay líneas antiguas)
atlas --ledger demo.jsonl backup --to /ruta/copias   # copia ledger-<fecha>.jsonl, releída y verificada por etag
```

`compact` es la única operación que reescribe el libro: guarda antes los bytes originales en `archive/ledger-<fecha>-v<n>.jsonl` (nunca sobrescribe un archivo), es no-op si todas las líneas están en la versión actual y aborta sin escribir si la proyección cambiaría o hay eventos inválidos.

## Idioma

Todo lo técnico (código, identificadores, commits, ramas, ficheros, infraestructura) va en **inglés**. Los documentos de `docs/` y los mensajes de la CLI van en **español**, con los identificadores en inglés.

## Flujo de trabajo (git flow)

El repositorio sigue el modelo **git flow** con **git básico, sin la extensión `git-flow`**:

| Rama        | Propósito                                                        |
|-------------|------------------------------------------------------------------|
| `main`      | Código en producción. Cada release se etiqueta (`vX.Y.Z`).       |
| `develop`   | Rama de integración. De aquí parten las *features*.              |
| `feature/*` | Desarrollo de una funcionalidad. Se fusiona en `develop`.        |
| `fix/*`     | Corrección no urgente sobre `develop`. Se fusiona en `develop`.  |
| `release/*` | Preparación de una versión. Se fusiona en `main` y `develop`.    |
| `hotfix/*`  | Arreglos urgentes sobre `main`. Se fusionan en `main` y `develop`.|

Las fusiones a `develop` y `main` se hacen mediante pull request, nunca con push directo.

```bash
# Feature (igual para fix/*)
git checkout -b feature/<name> develop
git checkout develop && git merge --no-ff feature/<name> && git branch -d feature/<name>

# Release
git checkout -b release/<version> develop
git checkout main && git merge --no-ff release/<version> && git tag -a v<version> -m "v<version>"
git checkout develop && git merge --no-ff release/<version> && git branch -d release/<version>

# Hotfix
git checkout -b hotfix/<version> main
git checkout main && git merge --no-ff hotfix/<version> && git tag -a v<version> -m "v<version>"
git checkout develop && git merge --no-ff hotfix/<version> && git branch -d hotfix/<version>
```

Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, …), en inglés y en una sola línea. Hooks: `git config core.hooksPath .githooks`.

## Licencia

[MIT](LICENSE).
