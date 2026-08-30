# Investigación — feature 003-synthetic-data

## 1. Cómo verifica Beancount la coherencia de un libro (`beancount/ops/validation.py`)

Fuente leída (2026-08-30, rama `master` de `beancount/beancount`). No se copia código.

Beancount separa **validaciones básicas** (siempre) de **validaciones duras** (`HARDCORE_VALIDATIONS`, lentas, opcionales). Todas producen *errores* (no hay nivel de aviso en este módulo; los avisos viven en plugins). Lista y correspondencia con nuestro esquema:

| Beancount | Qué comprueba | Nuestro equivalente | Estado |
|---|---|---|---|
| `validate_open_close` | `open`/`close` únicos por cuenta; `close` después de `open` | `account_created` único (`duplicate_account`); no hay fechas de apertura/cierre, solo `active` | Cubierto lo aplicable |
| `validate_active_accounts` | Toda referencia a una cuenta cae entre su `open` y su `close` | Nada comprueba operaciones sobre una cuenta o activo con `active = false` | **No cubierto; candidato** (`inactive_reference`, aviso) para una ronda posterior: exige decidir si `active` es administrativo o bloqueante |
| `validate_currency_constraints` | Los apuntes respetan las divisas declaradas en `open` | Aviso `currency_mismatch` (evento frente a activo); la divisa del efectivo frente a `base_currency` no se comprueba (cuentas multidivisa vía `fx_exchange`) | Cubierto lo aplicable |
| `validate_duplicate_balances` | Un solo `balance` por cuenta y día con importes distintos | `valuation` no es una aserción; dos fotos el mismo día: manda la posición en el fichero (002) | **No cubierto; candidato** (`duplicate_valuation`, aviso). Además, comparar `valuation.quantity` con la posición física en su fecha sería nuestra "aserción de saldo" (`valuation_quantity_mismatch`, aviso, sin precios) |
| `validate_duplicate_commodities` | Una sola directiva por `commodity` | `duplicate_asset` (proyección) | Cubierto |
| `validate_documents_paths` | Rutas de documentos absolutas | `source_document` cadena no vacía (forma); `DocumentStore` fuera de alcance | Cubierto lo aplicable |
| `validate_check_transaction_balances` | Cada transacción suma cero dentro de la tolerancia (re-comprobado tras plugins que transforman) | Nuestra "suma cero": Σ lotes abiertos = Σ posiciones físicas por activo (`lots_mismatch`) y posiciones ≥ 0 (`negative_position`); y en esta feature, `projection_not_reproducible` (la proyección del texto releído coincide con la cargada) | Cubierto |
| `validate_data_types` (dura) | Tipos de cada atributo de cada directiva | `validateShape` al cargar (numéricos como cadenas, fechas, enumeraciones); `deepCheck` añade `non_canonical_line` y `fingerprint_mismatch` sobre el texto | Cubierto |

**Ideas que adoptamos.** (1) Distinguir comprobaciones baratas de proyección (`atlas check`) de las duras sobre el texto (`atlas check --deep`), igual que `BASIC_VALIDATIONS` frente a `HARDCORE_VALIDATIONS`. (2) "Re-comprobar tras transformar": es exactamente `compact` comparando `snapshotOf` antes y después de reescribir, y `projection_not_reproducible`. (3) `example.py` **valida su propia salida con las validaciones duras antes de escribirla**: `atlas synth` hace lo mismo (`integrity` + `deepCheck` como guardarraíl).

**Comprobaciones que aplican y no están en §3.5** (anotadas, no implementadas: exigen decisiones que no son de esta feature): operación sobre cuenta o activo inactivo; `valuation.quantity` distinta de la posición física en su fecha; dos `valuation` del mismo par el mismo día. Van a `decision-roadmap` cuando el usuario lo decida.

## 2. Cómo genera Beancount datos de ejemplo (`beancount/scripts/example.py`)

- **Determinismo**: `random.seed(seed)` al arrancar; fechas de inicio y fin como entradas fijas; todo lo generado se **ordena** (`data.sorted`) antes de escribir, de modo que el orden de generación no importa. Nosotros: un único PRNG propio (`mulberry32`) con la semilla, del que salen tanto los bytes de los ULID como los valores del escenario; un reloj sintético del que salen todos los `recorded_at`; y el orden de fichero lo fija el esqueleto, no una ordenación posterior (nuestro orden de fichero es semántico: desempate FIFO, "antes en el fichero" de las tesis, registro tardío).
- **Esqueleto fijo con detalles aleatorios**: empleador, importes de gastos, fechas de viajes y movimientos de precios son aleatorios; la estructura (secciones: commodities, cuentas, banca, tarjetas, inversiones, jubilación, ingresos, impuestos, gastos, precios) es fija. Nosotros igual: bloques fijos en meses fijos; la semilla varía importes, NAVs, precios, tipos de cambio y el día del mes (1-5).
- **Eventos raros incluidos deliberadamente**: nóminas con varias retenciones, límite anual de aportación a jubilación, dividendos reinvertidos, pagos trimestrales de impuestos con devolución/deuda aleatoria, ciclo de tarjeta con compensación diferida, **aserciones de saldo periódicas**, precios semanales. Nosotros: la lista del prompt §3.2 (traspaso parcial encadenado, custodia, contrasplit con picos en dos cuentas, fusión de fondos con lotes traspasados, registro tardío, corrección de ejercicio anterior, venta 30/12 → 02/01, pérdida seguida de aportación). Las "aserciones de saldo" son nuestras `valuation` a 31/12 con la cantidad leída de la proyección.
- **Validación final**: el script pasa la salida por las validaciones duras. Nosotros: `atlas synth` verifica antes de escribir y los tests exigen prefijos válidos, `integrity` limpio y `snapshotOf` estable.

**Idea que rechazamos.** Ordenar por fecha después de generar: destruiría el registro tardío y el orden "tesis antes que compra".

## 3. Decisiones de detalle

| Decisión | Elección | Razón | Alternativas |
|---|---|---|---|
| PRNG | `mulberry32` (estado de 32 bits, una docena de líneas) | Determinista, rápido, distribución suficiente para "detalles plausibles"; sin dependencias | `xorshift32` (equivalente); `crypto` (no determinista) |
| Bytes del ULID | El mismo PRNG llena los 10 bytes aleatorios | Un solo estado que consumir en orden fijo → un solo punto de determinismo | Un PRNG aparte por uso (más estado que sincronizar) |
| Reloj sintético | `at(date)` = máx(`<date>T18:00:00Z`, anterior + 1 s) | `recorded_at` monótono en orden de fichero y coherente con la fecha de negocio; los ULID ordenan por tiempo | Reloj fijo + contador (los ULID no reflejarían fechas) |
| Instantánea | Objeto plano con claves ordenadas recursivamente; decimales como texto; sin posiciones de fichero ni `at` | Igualdad textual estable; independiente de compactar (que conserva el orden) | Comparar `LedgerState` con `toEqual` (no serializable, incluye `Map` y `Big`) |
| Esquema inyectable | `LedgerSchema { version, migrations }` sustituye a `MigrationChain { target, steps }` | Un solo objeto con el nombre fijado por el prompt (e) | Mantener ambos (dos formas para lo mismo) |
| Quién resuelve la colisión de archivo | El puerto falla (`archive_exists`); el caso de uso reintenta `-2`… `-99` | Ni el adaptador de fichero ni el futuro de S3 tienen que listar directorios; el puerto queda en una operación | `replace` devuelve el nombre real (el adaptador decide el nombre: mezcla responsabilidades) |
| Canonicidad de línea | `canonicalLine(JSON.parse(line)) === line`, sin migrar | Una línea antigua bien escrita no es "no canónica"; el formato es lo único que se mide | `encodeLine(decodeLine(line))` (marca todas las líneas antiguas) |
| `duplicate_id` en `check --deep` | La CLI captura el `ProjectionError` y lo presenta como hallazgo; `deepCheck` también lo detecta en líneas | La 001 decidió que ids duplicados abortan siempre; no se cambia | Hacer que `collectErrors` los tolere (cambio de semántica de la 001) |
| Tipos de Node en tests del dominio | `types: ["node"]` solo en `packages/domain/tsconfig.test.json` | Los tests de golden file y fixture legacy leen del disco; `src` sigue puro y vigilado | Tests con ficheros en `tests/` (duplicaría `TEST_SCHEMA_V2` y los helpers) |
| Verificación de `backup` | `etag` (SHA-256 de bytes) + número de líneas releyendo con `FileLedgerStore` | Misma noción de identidad que `append`/`replace`; comprueba además que la copia se carga | Comparar bytes en memoria (no prueba la carga) |
| Corrección de ejercicio anterior en el escenario | Sobre un `dividend` | Sin dependientes: ADR-0003 admite anularlo; realista (retención mal tecleada) | Sobre un `buy` (podría tener lotes consumidos: rechazo) |
| Registro tardío en el escenario | Compra de fondo con `value_date` anterior a una venta ya registrada | Ejercita FIFO cronológico (Q1 de la 001); el prefijo sin la compra sigue válido porque hay lotes anteriores | En el cubo (exige tesis y complica) |
