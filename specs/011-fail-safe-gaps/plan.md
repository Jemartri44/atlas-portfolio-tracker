# Plan de implementación: Los huecos del fallo seguro (`011-fail-safe-gaps`)

**Rama**: `feature/011-fail-safe-gaps` | **Fecha**: 2026-09-23 (Europe/Madrid) | **Spec**: [`spec.md`](spec.md)

**Entrada**: `docs/prompts/011-fail-safe-gaps.md` y la especificación de esta carpeta.

**Estado**: **aprobado por la dirección el 2026-09-23**, con las dos comprobaciones previas hechas y reportadas en [`questions.md`](questions.md). **El bloque 1 está parado** por dos hallazgos posteriores, P6 y P7, que contradicen al encargo y no los resuelvo yo; los demás siguen. P1 resuelta con una regla que no era ninguna de las dos que propuse (§1); P4 aprobada con cuatro exigencias sobre el evento nuevo (§8); P2, P3 y P5 conformes. **Dos correcciones de la dirección a este plan**: la forma del ancla pasa a lista siempre presente (§6) y el ternario del bloque 0 queda prohibido (§0).

---

## Resumen

Ocho bloques en el orden que fija la dirección. El criterio técnico que los une es uno: **lo que el motor sabe, el motor lo emite como dato con código, y en una unión cerrada cuando hay más de un desenlace**; las interfaces solo traducen. Nada de lo que entra es funcionalidad nueva, y la mayor parte del trabajo está en **tipos que cruzan las dos interfaces** —`FingerprintCheck`, `ClosedYearImpact`, `CriterionStake.reason`, `SettingsDiff`, `TaxYearReport.anchor`— más una tupla persistida y un documento de la dirección.

## Contexto técnico

**Lenguaje**: TypeScript 7 (`strict`), ESM, Node 22 (`.nvmrc`). **Dependencias nuevas**: ninguna.

**Almacén**: el `ledger.jsonl` de siempre. `schema_version` **sigue en 1** en los ocho bloques (justificación en §8).

**Tests**: vitest, cinco proyectos (`domain`, `adapters`, `cli`, `web`, `repo`). Cobertura bloqueante al 100 % en `packages/domain`.

**Plataforma**: CLI Node y SPA Solid; techos del paquete web 73,5 KB gzip de arranque y 236,0 de total.

**Escala**: cambio acotado. Estimación de superficie: ~14 ficheros de `packages/domain/src`, ~10 de `apps/cli/src`, ~8 de `apps/web/src`, 1 de `docs/`, 2 de `tests/`.

**Cómo se ejecuta la suite**: con `--maxWorkers` acotado mientras haya otros agentes vivos. **Nunca se concluye una regresión de una suite ejecutada bajo carga** (instrucción de la dirección).

**Línea de partida medida en `develop` (`c141cb0`), el 2026-09-23**: `lint` verde; `test:coverage` verde con **1.782 tests** en 186 ficheros y **100 %** de líneas, ramas, funciones y sentencias; `build` con **arranque 72,9 KB** y **total 235,0 KB** gzip. *(La suite de `web` agota su tiempo de espera cuando la máquina está cargada: con carga 80 en 28 núcleos fallaron 16 de 1.782 por `Test timed out in 5000ms`, y con `--maxWorkers=2` pasaron las 449. No es un fallo del árbol; queda anotado para no confundirlo con una regresión.)*

## Comprobación contra la constitución

| Principio | Cómo lo respeta esta feature |
|---|---|
| **I — El libro es la fuente de verdad** | Nada se deriva de fuera del libro. El bloque 8 añade un hecho **al libro**, no a la memoria de nadie. |
| **II — Lotes y fiscalidad solo del libro** | Ningún cálculo cambia. El bloque 3 toca la huella de idempotencia, que no entra en ninguna cifra; el bloque 6 corrige una pérdida de información del ancla, sin cambiar la regla de ADR-0020. *Append-only*: el registro del bloque 8 es una **línea nueva**, jamás un campo añadido a una presentación ya escrita. |
| **III — Compartimentación** | Intacta: la salida fiscal ya es la excepción escrita, y nada nuevo mezcla libros. |
| **IV — Nada codificado que deba ser configurable** | No se añade ningún umbral. El primer año soportado sigue donde estaba; lo que cambia es que dejar de alcanzarlo **se cuenta** en vez de reventar. |
| **V — Fallo seguro, nunca silencio** | Es la feature entera: bloques 0, 4, 5, 6 y 8. Y su cara menos evidente, decisión (g): **no afirmar lo que no se ha comprobado**. |
| **VI — Supervivencia a 20 años** | El bloque 8 es literalmente esto: un libro que no se puede compactar es un libro que no se puede migrar. |
| **VII — Tests donde un error cuesta dinero** | 100 % de dominio, once mutantes enumerados, y los casos de los bloques 5 y 6 escritos **antes** del arreglo y vistos en rojo. |

**Ninguna desviación que justificar.** Los dos endurecimientos de validación (bloques 1 y 3) se aplican dentro de la v1 por el mismo argumento de ADR-0018 y se justifican en §8.

## Estructura

```text
specs/011-fail-safe-gaps/
├── spec.md
├── plan.md            ← este fichero
├── questions.md       ← preguntas, comprobaciones previas, cómo vi cada test en rojo
└── tasks.md           ← lo escribe /speckit-tasks después del visto bueno
```

Ficheros que se tocan, por bloque, en §1–§8.

---

## §0. Bloque 0 — Los dos mensajes que mienten *(pendientes 4 y 6)*

**Dominio.**

- `packages/domain/src/filings/fingerprint.ts`: `FingerprintCheck` gana `declared_schema_version: number`, rellenado en el `check` base a partir de `declared.schema_version`. El campo va **siempre**, no solo en el caso que falla: es un dato del *check*, no de su motivo.
- `packages/domain/src/projections/deep-check.ts`: el bucle de huellas parte en **dos emisiones con el código escrito como literal**. `digest` mantiene `filing_fingerprint_mismatch` con su texto de hoy; `unreadable` estrena **`filing_fingerprint_unreadable`** y su mensaje usa `check.declared_schema_version` donde hoy usa `declared_lines`.
  - **Prohibido el ternario** (decisión de la dirección tras la observación E2): `error(cond ? "a" : "b", …)` deja al escáner de `tests/messages.test.ts` sin ver **ninguno** de los dos códigos, y la entrada que ya existe pasa a ser «entrada muerta». Medido; está en `questions.md`.

**Interfaces.** Texto del caso `unreadable`, en las dos, con la forma que el bloque 8 todavía no permite:

- `apps/cli/src/output/messages.ts`: `case "filing_fingerprint_unreadable"`.
- `apps/web/src/format/messages/findings.ts`: el par `what`/`todo`. El `todo` es lo que importa: **no** «recupera la copia anterior». Dice que el libro está escrito en una versión que este cliente no sabe releer en el punto en que la huella la declara, que **no es una edición**, y que de momento no hay más que hacer que conservar el fichero tal cual.
- `apps/web/src/format/messages/errors.ts`: **en el bloque 8**, no aquí. Motivo en la observación **E2** de `questions.md`: `tests/messages.test.ts` sólo exige `findings.ts` para un hallazgo, y una entrada en `errors.ts` de un código que el dominio no levanta como error se caza como *entrada muerta*. En el bloque 8 el mismo código pasa a ser motivo de rechazo de `compact`, y entonces la entrada de `errors.ts` deja de estar muerta y se añade, junto con el ajuste del texto de la CLI para nombrar la salida (FR-004).

**Tests.** `packages/domain/test/projections/deep-check.test.ts`: un libro con una línea anterior a la presentación que su versión de huella no sabe leer; se comprueba el **código** y que el mensaje lleva la **versión**, no el recuento. Mutantes 1 y 2 de §5 del encargo.

**Commits.** `fix(check): tell an unreadable filing prefix from an edited one`, `fix(check): name the schema version a filing fingerprint declares`.

---

## §1. Bloque 1 — `computed.as_of` sin validar *(pendiente 5)*

**Dónde.** `packages/domain/src/schema/validate.ts`, dentro del `CONSISTENCY.tax_return_filed` que ya existe, **después** de las dos comprobaciones de `filed_at`, que se ejecutan antes.

**La regla, derivada de cómo corta el libro y no al revés** (respuesta de la dirección a P1). La regla no es una fecha elegida: es que **`as_of` cubra el ejercicio entero que declara**. Un cálculo hecho con un corte que deja fuera media declaración produce cifras incompletas, y el reparto de la diferencia en sus cuatro causas sale falso — que es justo lo que esta validación existe para impedir.

**Qué comprobé, y cómo.** Dos cosas, ejecutando, no leyendo *(el guion vive en mi scratchpad como `011-asof-probe`)*:

1. **El corte de `asOf` (ADR-0016) incluye la fecha del corte.** En `projections/project-ledger.ts:413` la condición es `entry.date > options.asOf → continue`, así que un evento fechado exactamente en `asOf` **sí** entra. Medido sobre un libro con una venta de fecha fiscal 2027-12-31:

   ```
   ganancias con asOf = 2027-12-31 (la propia fecha fiscal): 1
   ganancias con asOf = 2027-12-30 (el día anterior):        0
   ganancias sin asOf:                                       1
   ```

2. **`taxChain` no aplica ese corte**: proyecta el prefijo entero y usa `computed.as_of` como **`options.today`**, que no filtra eventos. Medido sobre el mismo libro:

   ```
   base de 2027 con today = 2027-07-01: 50
   base de 2027 con today = 2029-01-01: 50
   ```

   Lo que `today` sí gobierna son dos cosas: qué presentaciones están **en vigor** (`filed_at <= today`, `filedAnchors`) y qué queda **provisional** en la regla de recompra (`end >= today`, `wash-sale.ts:451`). El corte real del prefijo es **por recuento de líneas**, y `as_of` es la fecha que lo data: un `as_of` dentro del ejercicio dice que la foto se tomó con el ejercicio todavía corriendo, así que lo que faltaba por pasar no podía estar en el prefijo.

**La comparación que sale de ahí.** Como el corte **incluye** su fecha, un cálculo hecho el **31/12 del ejercicio** cubre el ejercicio entero y **es válido**: es el corte más natural que existe y describe algo que pudo pasar de verdad. Rechazarlo sería negarle al usuario apuntar la realidad, que es peor que aceptar una línea rara. Luego:

| # | Comparación | ¿Se escribe? | Por qué |
|---|---|---|---|
| 1 | **`as_of ≥ ${tax_year}-12-31`** | **Sí** | Nada la deduce. Un `as_of` anterior al último día del ejercicio declara cifras de un ejercicio a medias. El 31/12 **es válido**, por el corte inclusivo. |
| 2 | `as_of ≤ filed_at` | **Sí** | Nada la deduce, y es la que la muestra incumple hoy. |
| 3 | `as_of` no futura (`as_of ≤ recorded_at`) | **No** | Se deduce: la 2 da `as_of ≤ filed_at` y la que ya existe da `filed_at ≤ recorded_at`. Una rama que ningún test puede cubrir **no se escribe**, y menos se escribe para justificarla después. |

**Códigos.** Uno por comparación, con sus **dos** traducciones: `as_of_before_year_end` y `as_of_after_filing`. Van a `apps/cli/src/output/messages.ts` y a `apps/web/src/format/messages/errors.ts` (son códigos de error del dominio, no hallazgos: ahí sí los exige `tests/messages.test.ts` en las dos).

**La muestra.** `packages/domain/test/samples.ts`: `computed.as_of` del `tax_return_filed` pasa de `2026-06-20` a `2026-06-18`, el mismo día de `filed_at`. Se ejecuta la suite entera antes y después: si algún test esperaba la incoherencia, se dice en `questions.md` (era un test que fijaba un defecto).

**Endurecimiento.** Rechazar formas que hoy se aceptan es un cambio **rompedor** en el sentido de ADR-0018, y se aplica dentro de la v1 por la misma razón que el bloque 3: el evento existe desde la 010, fusionada el **2026-09-23**, el libro real está vacío y **ningún fichero del repositorio contiene una línea `tax_return_filed`** (comprobación previa 1).

**Tests.** `packages/domain/test/schema/validate-*.test.ts`, llamando a `validateShape` directamente —`LedgerBuilder` no valida nada (010 §7.4)—: una muestra por comparación, y el mutante 3 de §5 quitándolas de una en una.

**Commit.** `fix(schema): validate the date a filing says it was computed on`.

---

## §2. Bloque 2 — Las dos de un párrafo *(pendiente 10 y la asimetría)*

**La nota N17.** `specs/010-tax-output/questions.md`, una frase. La cadena buena se **copia** de la cabecera de `packages/domain/test/tax/income-category-default.test.ts`, que la tiene entera: ganancias 462,50; rendimientos 64,00 − 90,00 = −26,00; fase 1 compensa los 26,00 contra el 25 % de 462,50 = 115,63; **fase 2** toma los −260,80 arrastrados de 2027; base 175,70. No se rederiva nada.

**La asimetría.** Primer caso de ADR-0024 de la ronda, y el commit lo dice con esas palabras.

- `apps/web/src/routes/fiscal/CriteriaCards.tsx`: `SettledCard` pierde el `Show` que la envuelve y gana un `EmptyState` con la forma del de `DoubtfulCard` — `what`: «Ningún criterio firme de este ejercicio movería nada leído al revés»; `why`: que se ha mirado y no hay diferencia, que es información y no ausencia de ella.
- `apps/cli/src/commands/tax.ts`: el apartado 10 con `report.settled` vacío imprime hoy **cabeceras huérfanas** (`table()` siempre escribe cabecera y separador, comprobado). Pasa a imprimir una frase equivalente a la de la web.

**Tests.** `apps/web/test/` para la tarjeta vacía y `apps/cli/test/commands/tax.test.ts` para la frase; mutante 9 (volver a esconder la tarjeta).

**Commits.** `docs(010): complete the compensation chain of note N17` *(fichero de `specs/`, no de `docs/`: no toca la excepción del bloque 7)*, `fix(fiscal): say in both interfaces that no settled criterion moves anything`.

---

## §3. Bloque 3 — La huella de duplicados de una presentación *(pendiente 9)*

**Las dos premisas están verificadas y reportadas** en `questions.md`, comprobación previa 1. Resumen: `tupleOf` reparte por tipo y la rama `tax_return_filed` es la única que se toca; **cero** líneas `tax_return_filed` en los ocho `.jsonl` del repositorio y en cualquier fichero seguido que no sea `.ts`/`.tsx`/`.md`; ninguna prueba fija hoy una huella de presentación como literal.

**El cambio.** `packages/domain/src/schema/fingerprint.ts`: se borra la línea `event.filed_at,` de la rama `tax_return_filed`. La tupla queda `["", "", "", "", type, model, tax_year, receipt_reference]`. No hay riesgo de colisión con otro tipo: `event.type` va dentro de la tupla y es único.

**Lo que hay que dejar probado** (`packages/domain/test/schema/fingerprint.test.ts`): el mismo justificante con dos `filed_at` **colisiona**; una complementaria con justificante propio **no**. Mutante 4: devolver `filed_at` a la tupla, y quitar de ella `receipt_reference`.

**Ficheros dorados**: la expectativa es que **no se mueva ninguno**. Si alguno se moviera, se para y se pregunta.

**Commit.** `fix(ledger): identify a filing by model, year and receipt, not by its date` — con el argumento de ADR-0018 en el cuerpo, que es la única excepción al asunto de una línea que este encargo pide por escrito.

---

## §4. Bloque 4 — El ejercicio que se vuelve inobtenible *(pendiente 7)*

**El mapa de guardias está verificado y reportado** en `questions.md`, comprobación previa 2, con trazas de pila y con la salida de `atlas settings set`. Lo que encontró, en el orden en que se ejecuta:

| # | Lectura | Fichero | Guardia hoy | Reproducida |
|---|---|---|---|---|
| 1 | `readingOf` → `filingComparison` | `filings/comparison.ts` | **ninguna** | sí, traza de pila |
| 2 | `criterionStakes` → `computeCore` | `tax/year.ts` | **ninguna** | sí, traza de pila |
| 3 | `settingsDiff` → `computeCore` | `tax/year.ts` | **ninguna** | sí, traza de pila (enmascarada por la 2 hasta que se guarda) |
| 4 | `figuresOf` → `closedYearImpact` | `filings/closed-years.ts` | **ninguna** en el dominio; 3 de 4 caminos tapados por la interfaz, el de `atlas settings set` **desnudo** | sí, traza de pila y comando muerto |
| — | `movedTaxYears` | `tax/year.ts` | la única del dominio; es la que se extrae | — |

**El ayudante.** En `packages/domain/src/tax/chain.ts`, junto a `Invalid`/`isInvalid`, que es donde vive ya el vocabulario de «esta lectura no da cifras»:

```ts
/** A reading whose chain would have to start before the first supported year. */
export interface Unsupported {
  unsupported: { year: number; first_supported: number };
}
export const isUnsupported = <T extends object>(r: T | Unsupported): r is Unsupported => …

/**
 * Runs an **alternative** reading, turning `tax_year_unsupported` into a value
 * and **re-raising anything else**: swallowing every error would hide real
 * defects for years. The case is told apart by the **code** of the
 * `DomainError`, never by its text.
 */
export const tryReading = <T>(read: () => T): T | Unsupported => …
```

La lectura **principal** sigue lanzando: `taxYearWithChain` no usa el ayudante para su propio `computeCore`, y `atlas tax 2017` sigue dando el error que tiene que dar.

**Los cuatro sitios.**

1. `readingOf` deja de hacer `taxChain(...) as ChainCore` y pasa por el ayudante. Su comentario —el que explica por qué no existe el caso «no se puede calcular»— se corrige para decir **qué descarta y qué no**: es cierto para los eventos inválidos y no dice nada del año no soportado (lección de §2 ter del encargo). Cuando una de las dos relecturas no se puede hacer, `FilingComparison` **no reparte causas**, igual que hoy con `fingerprint_ok`, y —bloque 8— **lo advierte**.
2. `criterionStakes`: `computeCore` pasa por el ayudante; con `Unsupported` emite `measure: "not_quantifiable"` con `reason: "unsupported_under_alternative"`, hermano del `invalid_under_alternative` que ya existe.
3. `settingsDiff`: lo mismo, con el hermano de `invalid_before`: **`unsupported_before: true`** en `SettingsDiff`. Es el equivalente exacto del campo que ya existe, y las dos interfaces ya tienen sitio donde decirlo (apartado 12 de la consola; la web lo enseña donde enseña `invalid_before`).
4. `figuresOf` devuelve `undefined` también ante `Unsupported` — pero **quién** no se pudo leer y **por qué** hace falta para el bloque 5, así que su firma pasa a devolver `Map | { reason: "invalid" | "unsupported" }`, que es lo que el bloque 5 consume. Se hace **aquí** porque el bloque 4 va antes y el 5 se apoya en que `figuresOf` ya no lance.

**El cierre del mapa de la web.** `apps/web/src/format/criteria.ts`: `MEASURE_REASONS` pasa de `Record<string, string>` a `Record<NonNullable<CriterionStake["reason"]>, string>`, como la 010 hizo con `PARTIAL_TEXTS` y `MODEL_NAMES`. Se comprueba que el cierre **no es vacío** quitando una entrada y viendo romper el `typecheck`.

**Las guardias de la interfaz.** Los tres `catch (error) { if (error instanceof DomainError) return []; }` de `closedYearNotes`, `closedNotes` e `impactOf` dejan de ser lo que sujeta esto. **No se borran** —siguen cubriendo el caso «el candidato no se puede construir», que es su motivo escrito— pero dejan de ser el único sitio donde este caso se para, porque el dominio ya no lanza: ahora esos caminos **dicen** lo que pasa (bloque 5).

**Tests.** El libro del probe: fecha de contratación en el ejercicio anterior al primero soportado y fecha valor en el primero, con la configuración que hace que solo la lectura alternativa alcance más atrás. Un test por sitio, más el de `atlas settings set` de punta a punta. Mutantes 5 (quitar la guardia en cada sitio por separado, **incluido** el del informe de comparación) y 6 (que el ayudante se trague cualquier error).

**Commits.** `feat(tax): degrade an alternative reading that predates the supported regime`, `fix(cli): keep settings set alive when an alternative reading is unsupported`, `fix(web): close the map of measure reasons against the domain union`.

---

## §5. Bloque 5 — El aviso que se calla *(pendiente 8)* — segundo caso de ADR-0024

**El tipo.** `packages/domain/src/filings/closed-years.ts`:

```ts
/** What the warning could find out about the declared figures. */
export type ClosedYearComparison =
  | { status: "compared"; moves: MovedFigure[] }
  | { status: "not_compared"; reason: ClosedYearNotCompared };

/** Why it could not be compared, distinguishing the causes the engine knows. */
export type ClosedYearNotCompared =
  /** The ledger has invalid events under one of the two readings: repair them. */
  | "invalid_reading"
  /** One of the two readings reaches below the first supported year (block 4). */
  | "chain_unsupported"
  /** A 720 or a 721: its figures are market values the chain does not compare. */
  | "by_design";

export interface ClosedYearImpact {
  model: FilingModel;
  year: number;
  filing_id: Ulid;
  filed_at: CivilDate;
  by_date: boolean;
  comparison: ClosedYearComparison;   // ← sustituye a `moves: MovedFigure[]`
}
```

**Por qué una unión y no un campo más**: es el mecanismo que la 010 demostró que funciona (el veredicto `nothing_recorded` rompió la compilación en los tres sitios que había que tocar). Un campo opcional lo puede desestructurar y tirar una interfaz sin que nada falle, que es el hueco que describe ADR-0024.

**La condición de emisión.** Hoy se empuja un impacto si `by_date` o si `moves.length > 0`; pasa a empujarse también cuando `comparison.status === "not_compared"`, con las **dos preguntas separadas** que la 010 dejó escritas —sin un solo cortocircuito, por la cobertura intermitente de §10.4—. En la práctica: **con una presentación en vigor tocada, siempre sale algo**, que es lo que la cabecera del módulo promete.

**Las consumidoras.** El **texto** se escribe dos veces (`apps/cli/src/output/closed-years.ts` y `apps/web/src/components/ClosedYearNotice.tsx`); el **tipo** llega a ocho puntos de uso, que el compilador enumera. Las palabras:

| `status` / `reason` | Consola y web dicen… |
|---|---|
| `compared`, con movimientos | lo de hoy: qué cifra pasa de cuánto a cuánto |
| `compared`, sin movimientos | lo de hoy: cae por fecha y **no mueve ninguna cifra declarada** — y ahora es verdad, porque se comparó |
| `not_compared: invalid_reading` | **no se ha podido comparar** porque el libro tiene movimientos inválidos; repáralos y vuelve a mirar |
| `not_compared: chain_unsupported` | **no se ha podido comparar** porque una de las dos lecturas alcanza por debajo del primer ejercicio que el motor sabe calcular |
| `not_compared: by_design` | las cifras de un 720/721 son valores a mercado y **no se comparan**, que no es lo mismo que «no se mueven» |

**El coste.** El **hecho** sigue en `filings/touched.ts` (0,4 KB del arranque) y el desenlace se emite **donde hoy se emite la cifra**, en `closed-years.ts`, que no está en el arranque. Se mide con `npm run build` antes y después; si no cabe en 73,5/236,0, **se para y se avisa**.

**Tests.** Primero el caso que hoy calla —libro con eventos inválidos en la lectura anterior, cambio fechado **fuera** del ejercicio presentado que aun así mueve una cifra declarada—, **visto en rojo antes del arreglo**; después uno por desenlace y por causa. Mutante 7 (no emitirlo nunca, y emitirlo siempre).

**Commits.** `feat(filings): let the closed-year warning say it could not compare` *(cuerpo: la salvedad la emite el motor, ADR-0024)*, `feat(cli): say the third outcome of the closed-year warning`, `feat(web): say the third outcome of the closed-year warning`.

---

## §6. Bloque 6 — El ancla de lo declarado — tercer caso de ADR-0024

**El dominio.** `packages/domain/src/tax/chain.ts`: `let anchor: AnchorDifference | undefined` pasa a `const anchors: AnchorDifference[] = []` y cada ejercicio de la cadena con presentación **empuja** la suya. `ChainCore.anchor?` pasa a `ChainCore.anchors: AnchorDifference[]`.

**La forma en el informe.** `TaxYearReport.anchor?: AnchorDifference` pasa a **`anchors: AnchorDifference[]`**, **siempre presente**, vacía cuando no hubo sustitución. La dirección corrigió aquí mi primera propuesta —que la dejaba opcional para no mover un fichero dorado— con el argumento correcto: el dorado registra lo que el diseño decide, no al revés.

**La convención que sigue el resto del informe, comprobada:** las **listas** de `TaxYearReport` se serializan **aunque estén vacías** (`in_kind`, `doubtful`, `settled`, `notes` no son opcionales); lo que se omite son los campos que **no son listas** y pueden no existir (`filing`, `settings_diff`). Medido sobre el propio dorado:

```
2026 {'in_kind': 0, 'doubtful': 0, 'settled': 0, 'notes': 5}
2027 {'in_kind': 0, 'doubtful': 10, 'settled': 1, 'notes': 5}
2028 {'in_kind': 0, 'doubtful': 4, 'settled': 0, 'notes': 3}
2029 {'in_kind': 0, 'doubtful': 1, 'settled': 0, 'notes': 2}
```

`in_kind` sale como `[]` en los cuatro ejercicios y `settled` en tres. Luego `anchors` va como lista siempre presente, por **coherencia interna**.

**Movimiento previsto del dorado.** `tests/fixtures/ledger/synthetic-v1.tax.json` gana **una clave `"anchors": []` en cada uno de sus cuatro ejercicios, y nada más**: el libro sintético no tiene ninguna presentación, así que ninguna sustitución ocurre. La predicción se escribe en `specs/011-fail-safe-gaps/anchors-expectation.md` y **se comitea antes** de regenerar; después se compara clave por clave. Cualquier otra diferencia es un **hallazgo**: se para y se pregunta.

**La consola.** `apps/cli/src/commands/tax.ts`: el apartado 5 pasa de una línea a una por ancla, en orden de ejercicio, con el texto de hoy (incluida la variante `before_ledger`).

**La web.** `apps/web/src/view-models/fiscal/year.ts` gana la vista del ancla y `apps/web/src/routes/fiscal/LossesCard.tsx` la pinta **encima de la tabla de pendientes**, que es la cifra afectada, con la forma de `Notice` que la tarjeta ya usa para la caducidad. Con la privacidad activa se ve **que hubo sustitución** y el ejercicio; los importes van por `Amount`, como todos.

**Tests.** El que lo ata: un libro con **dos** Rentas presentadas en ejercicios distintos, ambas con pendientes que difieren de lo calculado, y la comprobación de que el informe del ejercicio posterior conserva **las dos**. Se escribe primero y se ve en rojo por la sobrescritura. Mutante 8 (conservar una sola, y no pintarla en la web).

**Commits.** `fix(tax): keep every anchor the chain applied, not the last one`, `feat(web): say when pending losses come from what was filed`.

---

## §7. Bloque 7 — El test antideriva que no empareja *(pendiente 12)*

**El formato del documento**, con permiso expreso de la dirección (decisión (k)), y **solo** `docs/fiscal-questions.md`:

1. La tabla grande de criterios **se conserva entera** —número, pregunta, criterio aplicado, fundamento—, que es la prosa que se cita como «criterio #2». Pierde sus dos últimas columnas, `Certeza` y `Riesgo`.
2. Inmediatamente después entra una tabla nueva, **una fila por identificador del catálogo**, que es la que el test lee:

   `| # | Identificador | Lectura que aplica | Certeza | Riesgo | Matiz |`

   - **34 filas**, una por entrada de `FISCAL_CRITERIA`, con las siete de la #2 y las cuatro de la #24 juntas bajo su número.
   - `Certeza` y `Riesgo` toman **un solo valor** del vocabulario de siempre: Alta / Media / Baja / En disputa, y Conservador / Agresivo / Ambas / Neutro. **Una celda vacía no es expresable.**
   - `Matiz` recoge, sin perder una palabra, la prosa que hoy viaja dentro de esas dos celdas y que no es un valor: «pero incompleto» del #3, «pero no calculable entero» del #16, «conservador en el año, incorrecto en la base» del #13, el porqué del #20, el del #23 y la explicación larga del #24.
3. Las notas al pie y los apartados de disputas **no se tocan**.

**El test.** `tests/fiscal-criteria.test.ts` se reescribe sobre esa tabla: emparejamiento **exacto** identificador → (certeza, riesgo), más «todo identificador del catálogo tiene fila» y «toda fila tiene identificador». Desaparecen `DOCUMENT_SILENT` y la regla de «la certeza más dudosa la lleva alguien», que era el sustituto de no poder emparejar. La cabecera se reescribe para decir lo que garantiza ahora y qué límite queda (ninguno de los descritos), y lleva además **la frase que la dirección dejó dicha** sobre qué es y qué no es este test, para que nadie le pida dentro de dos años lo que no da:

> Es un **trinquete contra la deriva futura, no una prueba de que los valores de hoy sean correctos**. Lo de hoy es correcto porque está razonado en el documento de criterios y en los comentarios por variante del catálogo, no porque dos ficheros digan lo mismo.

**Las celdas que hoy el documento calla**, con el valor que ya existe y que el catálogo declara: `2:listed_1y` **conservador**, `2:fund_1y` **conservador**, `2:crypto` **conservador**, `2:other` **ambas**. Verificado uno a uno contra `FISCAL_CRITERIA`: **coinciden los cuatro**.

**Lo que el formato obliga a escribir y el documento nunca dijo por variante** está enumerado en la pregunta **P2** de `questions.md`: son tres celdas de certeza (`2:other` → Baja, `24:etc_gain` → Baja, `24:etp_gain` → Media) que hoy sólo están **dentro del conjunto** de su fila. Las tres se rellenan con lo que el catálogo declara, que es lo que manda la decisión (k); P2 las enumera para que la dirección pueda vetar cualquiera antes de que se escriban.

**Documento y catálogo, en el mismo commit**, y se comprueba que el test **no es vacío** intercambiando la certeza de `2:fund_2m` y `2:fund_1y` y viendo el rojo nombrar las dos (mutante 10).

**Commit.** `test(fiscal): tie each criterion variant to its own certainty and risk`.

---

## §8. Bloque 8 — La salida registrada de `compact` *(pendiente 3)* — cuarto caso de ADR-0024

**Lo que se comprueba primero y se reporta antes de fijar la forma** (§5 del encargo, decisión (a)): **no hace falta subir `schema_version`.** Registrar el hecho exige **un tipo de evento nuevo**, y ADR-0018 clasifica eso como cambio **compatible** —«añadir un tipo de evento», con `swap` y `tax_return_filed` como precedentes, los dos dejaron la versión en 1—. Un cliente antiguo que se encuentre la línea la rechazará por tipo desconocido, que es lo mismo que le pasa hoy con `swap`; la versión no sube.

**Pero sigue siendo un cambio de esquema**, y el encargo es explícito: se propone como **ADR en estado `Propuesta`**, con `/adr`, y **la acepta la dirección**. Esa ADR es la pregunta **P4**, que bloquea el bloque. Lo que propondrá, para que la dirección lo vea antes de que exista:

**Evento nuevo `filing_fingerprint_waived`.** La dirección **aprueba la forma** y exige cuatro cosas, porque después de resellar **es la única traza que quedará en el fichero**:

1. **Qué presentación** (`filing_id`) y **qué motivo** (`reason`: `"digest" | "unreadable"`). No valen juntos en un «no verificable» genérico: uno significa que las cifras no cuadran y el otro que no se pueden leer.
2. **La versión de esquema y el recuento de líneas que la huella declaraba** en ese momento (`declared_schema_version`, `declared_lines`). Después de compactar, el libro ya no los tiene en ninguna parte.
3. **Cuándo lo dio por bueno el usuario**: su `recorded_at`. Es la mitad de la frase que `check` tiene que seguir diciendo para siempre.
4. **No toca la presentación**: dice algo **sobre** ella. Lo declarado es un hecho con consecuencias legales y no se reescribe (ADR-0020).

Más `notes?`. Fechado por su `recorded_at`, lo que lo hace un **documento administrativo** como una presentación: **no** tiene fecha de negocio y no lo corta `asOf` (ADR-0016, `data-schema.md` §7.1). Y es una **línea nueva**, porque el libro es *append-only* (ADR-0003): no se puede añadir un campo a una presentación ya escrita.

**Se escribe antes de reescribir**, dentro del mismo `compact`: la línea entra en el libro reescrito y `resealFilings` la sella con las demás. Es la única traza que queda, porque después de resellar el fichero no lo diría de ninguna otra forma.

**El dominio.**

- `CompactPlan` gana `unverified: { filing_id, reason }[]` — lo que `planCompact` encontró roto — y `compactLedger` acepta un segundo dato: **qué presentaciones ha autorizado el usuario**, por id. Una huella rota **no autorizada** sigue lanzando `CompactRejectedError`, que es el comportamiento por defecto (FR-034); una autorizada deja pasar **esa** y solo esa.
- `packages/domain/src/projections/filings.ts` (o el módulo de proyección que corresponda) proyecta las renuncias, para que `integrity`/`deepCheck` puedan decirlo siempre.
- `deepCheck` y/o `integrity` emiten un hallazgo permanente —**`filing_fingerprint_waived`**— por cada presentación con renuncia registrada: «no verificable, y lo diste por bueno tú el tal día», sin caducar, ni acusación ni certificado (FR-038, decisión (d)).
- `filingComparison` gana una **nota con código** cuando el prefijo no está verificado —bien porque el recuento no cuadra (lo que hoy sólo hace omitir las causas), bien porque hay renuncia registrada—: la causa «el motor calcula distinto que entonces» **no se reparte con seguridad** y se dice por qué (FR-039, decisión (e)). Es un dato del informe, no una frase de interfaz.

**La CLI.** `atlas compact [--yes] [--accept-unverified <filing_id>]…`

- El nombre en inglés, como el resto. **Repetible**, una vez por presentación, entrando en `REPEATABLE_FLAGS` de `apps/cli/src/args.ts`.
- **No entra en `BOOLEAN_FLAGS`, y `ARITY.compact` no cambia**: es una opción **con valor**, y `ARITY` cuenta palabras posicionales, no opciones. El encargo dice lo contrario; es la observación **E3** de `questions.md`. Lo que sí cambia es `assertKnownFlags` de `apps/cli/src/commands/compact.ts`, que hoy sólo admite las globales.
- Confirmación propia: antes de escribir, la consola **nombra** cada presentación cuya huella se deja sin verificar y su motivo, y pregunta.
- **La web no compacta**, así que la salida vive donde vive `compact`. Lo que sí llega a las dos interfaces son los **mensajes**: el hallazgo `filing_fingerprint_waived` y la nota de la comparación.

**Y el cierre del bloque 0**: con el código `filing_fingerprint_unreadable` convertido también en motivo de rechazo de `compact`, se añade su entrada en `apps/web/src/format/messages/errors.ts` y el texto de la CLI pasa a **nombrar la salida** (FR-004).

**Tests.** Un libro con líneas de una versión anterior y una huella no verificable: rechazo por defecto; con la autorización, compactado **con** la línea de renuncia; `check` diciéndolo después; y la comparación advirtiendo. Mutante 11, en sus tres mitades.

**Commits.** `docs(adr): propose a recorded waiver for an unverifiable filing fingerprint` *(estado `Propuesta`)*, `feat(compact): allow a recorded, per-filing waiver of an unverifiable fingerprint`, `feat(check): keep saying a filing fingerprint was never verified`, `feat(filings): warn when the comparison runs on an unverified prefix`.

---

## Disciplina de trabajo

- **Cada test, visto en rojo.** Se escribe antes, o se revierte el arreglo y se mira fallar. Se anota arreglo por arreglo en `questions.md` (FR-045).
- **Ficheros dorados**: expectativa de **cero movimientos**. Si alguno se mueve, se para y se pregunta. Cualquier regeneración llevaría su predicción escrita y comiteada antes.
- **Mutación**: todo guion de sustitución afirma que la sustitución ocurre (`assert s.count(old) == 1`) y comprueba el fichero después; un lote que aborta a mitad se vuelve a ejecutar **entero**.
- **`npm run lint` redirigido a un fichero y leyendo `$?`**, nunca a través de una tubería, antes de cada commit y como último paso.
- **Ficheros temporales** en el scratchpad, todos con `011` en el nombre.
- **Capturas** medidas a 400×890 DPR 3, 2045×1141 y 360 de ancho, con `scrollWidth === clientWidth` comprobado en el navegador, libro vacío y con datos, privacidad puesta y quitada, claro y oscuro: `/fiscal` con la tarjeta de criterios firmes vacía y con entradas, el ancla junto a las pérdidas pendientes con **dos** Rentas y con privacidad, el aviso de ejercicio cerrado en su desenlace nuevo en las cuatro escrituras, y Ajustes → Verificación con el hallazgo nuevo. A `~/atlas-private/capturas/2026-09-2X-fail-safe/`, **nunca** al repositorio.
- **Entrega**: PR a `develop` con la plantilla y su lista rellenada con honestidad. **No la fusiono.**

## Orden de ejecución y dependencias

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
              │    └── 5 depende de 4 (figuresOf deja de lanzar)
              │
              └── 3 es independiente, y entra ahora por ADR-0018
8 cierra el bloque 0 (el mensaje nombra la salida) y depende de una ADR que acepta la dirección
```

**Bloqueos**: el **bloque 1**, por P6 y P7 (ver `questions.md`); el resto de 0–7 sigue. El bloque 8 espera a que la dirección **acepte** la ADR que voy a proponer; su forma está aprobada de antemano (§8), así que el único paso pendiente es el cambio de estado. Si tardara, los bloques 0–7 se entregan igual y el 8 espera él solo, que es lo que pide la decisión (l).
