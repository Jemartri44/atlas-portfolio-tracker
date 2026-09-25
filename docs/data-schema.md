# Esquema de datos

Referencia viva del formato del libro mayor y de las proyecciones. Decisiones de fondo en ADR-0002, ADR-0003, ADR-0005 y ADR-0006. Prosa en español; identificadores en inglés tal como aparecen en el fichero y en el código.

> **Estado:** secciones 1-8 cerradas (Rondas 2 y 4, 2026-08-30) y revisadas tras el *challenge* externo del mismo día (ADR-0012, ADR-0013). Sigue siendo `schema_version = 1`; la feature 001 (PR #10, 2026-08-30) lo implementa en `packages/domain`. Cada cambio de formato posterior incrementa la versión (§5). **Ampliada con la capa en la nube** (ADR-0026, ADR-0027, ADR-0028, ADR-0029, ADR-0031, ADR-0032; Ronda 8, 2026-09-24): ninguno de estos ficheros nuevos entra en el libro ni en su `schema_version`.

## 1. Distribución del bucket

| Prefijo | Contenido | Retención |
|---|---|---|
| `ledger/ledger.jsonl` | El libro: un evento por línea, append-only | Para siempre. Versiones no vigentes de S3: 365 días |
| `archive/ledger-<YYYY-MM-DD>-v<n>.jsonl` | Fichero anterior a cada compactación, sin tocar. `<YYYY-MM-DD>` es el día de la compactación en `Europe/Madrid` y `<n>` la **menor** `schema_version` presente en el fichero archivado; ante colisión, sufijo `-2`, `-3`… En local (`FileLedgerStore`), `archive/` es un directorio junto al libro. También archiva los bytes previos a una **restauración** (`archive/pre-restore-<fecha>.jsonl`, nunca sobrescrito, ADR-0032) y los previos a una sincronización que reordena líneas pendientes (ADR-0026) | Para siempre |
| `reference/ecb/` | Histórico oficial del BCE, **byte a byte**; también en local, junto al libro, como `archive/` (ADR-0029). En local lo descarga `atlas fx update` (feature 012): `manifest.json` dice qué fichero está en vigor, su fuente (`zip` o `api`), la dirección, la hora de descarga y su SHA-256; el fichero en vigor es `eurofxref-hist.csv` si vino del ZIP o `api-exr.csv` si vino de la API, **nunca** la API con el nombre del ZIP; `previous/` guarda el anterior y `rejected/` lo que no validó. Un fichero que no cuadra con el SHA-256 de su manifiesto no se usa. La web solo lo **lee**, de la carpeta o de una copia importada a mano (ADR-0029, tercera enmienda) | Se sustituye **solo si el fichero nuevo contiene, con el mismo valor numérico, todos los tipos del anterior**; si no, se conservan los dos y sale un hallazgo (ADR-0029) |
| `prices/<asset_id>.jsonl` | Cierres diarios informativos (Nivel 2). **Solo se añade, salvo `atlas prices purge`**, que quita, con confirmación y bajo el cerrojo, las líneas de una fuente guardadas en una divisa que no es la que declara (ADR-0031, tercera enmienda, §4). Una línea por cierre, con los campos siempre en este orden: `schema_version` (hoy `1`), `date` (`YYYY-MM-DD`), `close` (decimal como cadena, el cierre sin ajustar tal como lo dio la fuente, ADR-0005), `currency` (tres mayúsculas: la que dio la fuente o, si no la da, la declarada para esa fuente en `symbols.json`; puede ser una subunidad como `GBX`), `source` (`eodhd` o `alpha_vantage`) y `fetched_at` (instante UTC). **El cierre en vigor de una fecha es la última línea de esa fecha**: la consola añade una línea si no hay ninguna, si es de la misma fuente con otro valor numérico (una corrección) o si es de una fuente anterior en el orden configurado; nunca se promedia (tercera enmienda). **Nunca el día en curso**: se guarda hasta ayer. **El paso a euros no se guarda**: lo hace la puerta al leer, con el histórico del BCE. Una línea en una divisa que no es la que su fuente declara ahora en `symbols.json`, o en la divisa marcada en `misstored` de su fuente, no cuenta en ninguna cifra en euros hasta que se purga (`mismatchedLines`). Una línea de una versión más nueva deja el fichero **entero** sin leer (`price_file_newer_version`), y una ilegible también (`price_line_invalid`): ese activo se queda sin precio automático y la consola no añade nada. El nombre es `priceFileName(asset_id)`: un id normal es él mismo, y lo que no podría nombrar un fichero se codifica. Lo escribe solo la consola, bajo el cerrojo de la carpeta | Para siempre |
| `prices/symbols.json` | **Fuera del libro** (ADR-0031, enmiendas): qué símbolo tiene cada activo en cada fuente y **la divisa de la cotización de cada fuente, declarada** por el usuario, nunca supuesta. **Formato 2**: `{ symbols_format: 2, assets: { <asset_id>: { eodhd?, alpha_vantage?, currencies, confirmed_at, currency_check?, currency_confirmed_over?, misstored?, refetch_days?, unserved_days? } } }`. `currencies.<fuente>`: la divisa de esa fuente (tres mayúsculas, puede ser una subunidad como `GBX`), **obligatoria para cada fuente con símbolo**; cada cierre se guarda con la de la fuente que lo trajo. `currency_check.<fuente>` = `{ found?, at }`: lo que dijeron los metadatos de esa fuente al contrastar (sin `found`, que no lo dicen), guardado tal como vino, hasta 16 caracteres (`GBp`); sin él, la consola contrasta esa fuente antes de descargar de ella. `currency_confirmed_over.<fuente>`: lo que dijo esa fuente cuando el usuario confirmó expresamente la divisa declarada contra ello. `misstored.<fuente>`: la divisa en que la 013 guardó mal los cierres de esa fuente; sus líneas en esa divisa no cuentan en ninguna cifra en euros, y mientras exista se niegan quitar el activo o declararlo sin esa fuente. Solo lo quita `atlas prices purge`. `refetch_days.<fuente>`: los días que quitó una purga, que la siguiente descarga pide **una vez**. `unserved_days.<fuente>`: los que, pedidos otra vez, ninguna fuente sirvió; quedan como hueco y `prices status` lo dice. **Formato 1** (el de la 013: una sola `currency` por activo, sin `misstored` ni días): se sigue leyendo como la divisa de todas sus fuentes y se escribe como formato 2 al guardar. **No hereda confirmaciones**: se descartan `currency_confirmed_over` y el `currency_check` de cada fuente confirmada, que se vuelve a contrastar; y una fuente confirmada sobre otra divisa que la del activo queda en `misstored`. Una consola de la 013 rechaza el formato 2. Un fichero ilegible o de un formato más nuevo (`symbols_file_newer_version`) deja las vistas sin precios automáticos, dicho, y `update`, `status`, `symbols` y `purge` se niegan. Lo escribe la consola (`atlas prices symbols set|remove`, `atlas prices purge`); es configuración de la descarga, no un hecho de la cartera, y si se pierde, se rehace | Se sobrescribe |
| `prices/_status.json` | Estado de las fuentes: `{ status_format: 1, sources: { <fuente>: { consecutive_failures, last_success?, last_failure?: { kind, at }, calls_at } }, assets: { <asset_id>: { last_failure: { kind, source, at, declared?, found? } } } }`. `calls_at` son los instantes de las llamadas reservadas **bajo el cerrojo antes de llamar**, de las que salen el cupo por día GMT (EODHD) o de las últimas 24 horas (Alpha Vantage); las de más de dos días se descartan. `kind` es uno de los seis fallos del puerto o `currency_mismatch`. **Nunca una dirección ni un mensaje de la fuente.** Un fichero ilegible es un error, nunca un estado vacío, que devolvería las llamadas ya gastadas | Se sobrescribe |
| `prices/config.json` *(local, junto a `prices/`)* | Configuración de la descarga, **fuera del libro y de `atlas.config.json`**: `source_order` (por defecto `["eodhd", "alpha_vantage"]`), `daily_calls` (por defecto `{ "eodhd": 20, "alpha_vantage": 25 }`; `0` apaga una fuente) y `failure_threshold` (por defecto `3`). Todas opcionales; sin fichero, los valores por defecto; una clave desconocida o un valor que no se entiende es un error. La web no lo lee. **La aplicación nunca lo escribe**: lo escribe el usuario | Lo que decida el usuario |
| `documents/<event_id>/<fichero>` | Fuente documental de eventos corporativos (PDF, HTML). Se sube por la API con la regla de añadir y nunca sobrescribir; no se sincroniza entre dispositivos (ADR-0026) | Para siempre |
| `imports/<source>/<YYYY-MM-DD>-<hash>.<ext>` | Extractos importados, tal cual llegaron. Misma regla que `documents/` | Para siempre |
| `backups/<YYYY-MM>/ledger.jsonl`, `reference/ecb/eurofxref-hist.csv`, `prices/`, `positions.json` | Copia mensual del libro, el histórico del BCE, los precios y la proyección de posiciones valorada (ADR-0032, amplía el contenido original) | Para siempre |
| `sync/state.json` *(por dispositivo, fuera del bucket, junto al libro local)* | Cuántas líneas y qué hash tenía el prefijo sincronizado con el remoto. No es una simple caché: si no se puede leer, `compact` se niega; y si existe la carpeta `sync/` y falta el marcador, también se niega, porque la existencia de `sync/` ya significa que el libro se sincroniza. La sincronización solo se desactiva con un comando explícito (ADR-0026, segunda y tercera enmiendas) | Se sobrescribe |
| `sync/held.jsonl`, `sync/discarded.jsonl` *(por dispositivo, local)* | Líneas retenidas por la sincronización, con su motivo, y las descartadas explícitamente por el usuario (ADR-0026) | Para siempre |
| `sync/devices/<dispositivo>.json` *(en el bucket)* | Cuántas líneas pendientes y retenidas tiene cada dispositivo sincronizado, y cuándo sincronizó por última vez; lo consultan `compact` y la restauración antes de actuar (ADR-0026) | Se sobrescribe por dispositivo |
| `drafts/<ULID>.json` *(por dispositivo, local)* | Operaciones en divisa registradas antes de que el BCE publique el tipo de su fecha fiscal: no son un hecho, no cuentan en ninguna cifra y nunca se confirman solas (ADR-0029, opción B). **Formato propio**, no el del libro: `{ draft_format: 1, id, saved_at, event, pending_event_id? }`, donde `event` es la operación **sin** los tipos que el BCE aún no ha publicado. En la consola, un fichero por borrador junto al libro, escrito bajo el cerrojo de la carpeta; en la web, el almacén `drafts` de IndexedDB (`DB_VERSION` 2). Reglas de `pending_event_id` en §6.3 | Hasta que se confirman o se descartan |
| `ledger.lock` *(local, junto al libro)* | El cerrojo consultivo de la carpeta (§5): JSON con `holder`, `token`, `since`, `pid` y `host`. Solo lo toma la consola | Existe mientras dura una escritura; un cerrojo abandonado se rompe a mano (`atlas lock break`) |
| `atlas.config.json` *(local, junto al libro)* | Configuración local de la carpeta, **fuera del libro** porque no mueve ninguna cifra: `ecb_stale_currency_days` (30 por defecto: cuándo una divisa se da por dejada de publicar) y `lock_stale_minutes` (10 por defecto: cuándo el mensaje del cerrojo dice que probablemente está abandonado, solo informativo). Todas las claves son opcionales; sin fichero, los valores por defecto; un fichero ilegible o con una clave desconocida es un error, nunca un valor por defecto en silencio. **La aplicación nunca lo escribe**: lo escribe el usuario | Lo que decida el usuario |
| `~/.config/atlas/secrets.json` *(fuera de la carpeta del libro y del bucket)* | Las claves de las fuentes de precios (ADR-0031): `{ "eodhd": "…", "alpha_vantage": "…" }`, o en `$XDG_CONFIG_HOME/atlas/`. Con permisos `600`: si otros pueden leerlo, la consola no usa las claves (`secrets_too_open`). La consola se niega si esta carpeta y la del libro están una dentro de la otra. **Ni la web ni ninguna copia, exportación o sincronización lo leen**, y `prices/` no guarda ninguna clave ni dirección. En la nube, SSM `SecureString`. **La aplicación nunca lo escribe** | Lo que decida el usuario |
| `~/.config/atlas/credentials.json` *(fuera de la carpeta del libro y del bucket)* | El token de dispositivo de la consola frente a la API (ADR-0033), uno por origen (`dev` y `prod` tienen registros distintos), con el dispositivo al que pertenece; o en `$XDG_CONFIG_HOME/atlas/`. Hermano de `secrets.json` y con **sus mismas reglas**: permisos `600` o no se usa, la consola se niega si esta carpeta y la del libro están una dentro de la otra, y **ni la web ni ninguna copia, exportación o sincronización lo leen**. La diferencia: **lo escribe la consola**, solo al iniciar y al cerrar sesión (`atlas remote login`, `atlas remote logout`), de forma atómica y creado ya con `600`. El token nunca va en un argumento, una variable de entorno, una URL ni la salida de la consola. Formato del token, en `docs/api.md`. **El registro del servidor no vive en el bucket**: es un `SecureString` de SSM por token, con solo el hash (`/atlas/<entorno>/device-tokens/<id>`), para que ninguna copia ni restauración del bucket lo toque | Hasta que caduca o se revoca; lo sustituye el siguiente inicio de sesión |

Cada entorno (`dev`, `prod`) vive en su propia cuenta AWS miembro (ADR-0028), y cada cuenta tiene **varios buckets privados**, todos con Block Public Access y cifrados con SSE-S3: el de la SPA, el de datos, el del estado de Terraform y el de CloudTrail. Lo que importa aquí es la frontera entre los dos primeros:

- **El de la SPA**, con los ficheros estáticos de la web. Es el origen S3 de CloudFront, que lo lee con Origin Access Control.
- **El de datos**, el de la tabla de arriba (`ledger/`, `archive/`, `reference/`, `prices/`, `documents/`, `imports/`, `backups/`, `sync/`), con versionado activado. **Nunca es origen de CloudFront**: solo lo alcanzan los roles de las Lambdas, con los permisos de ADR-0028 (el de la API, sin ningún permiso de borrado; las tareas programadas escriben `backups/`), y la administración, **siempre con credenciales de vida corta**, para las operaciones de administración que definen ADR-0026, ADR-0027 y ADR-0032. Si fuera origen de CloudFront, el libro quedaría al alcance de Internet sin pasar por la Lambda, que es la que impone la regla de solo añadir (ADR-0026, Parte A).

## 2. Envoltorio de cada línea

```json
{"schema_version": 1, "id": "01J6...", "recorded_at": "2026-09-01T18:22:05Z", "type": "buy", ...}
```

| Campo | Tipo | Regla |
|---|---|---|
| `schema_version` | entero | Versión del esquema con la que se escribió la línea. Ver §5 |
| `id` | ULID | Único. Es identidad, **no** orden: el orden canónico es la posición de la línea en el fichero |
| `recorded_at` | ISO 8601 UTC | Momento en que se registró (no la fecha de la operación) |
| `type` | cadena | Tipo de evento. Ver §3 |
| resto | según `type` | Campos del evento |

Reglas transversales:

- Una línea = un objeto JSON en una sola línea, UTF-8, terminada en `\n`. Sin líneas vacías.
- **Numéricos como cadenas decimales** (`"123.4567"`): punto decimal, sin exponente, sin separadores, signo opcional. Un `number` en un campo monetario o de cantidad es error de validación (ADR-0005).
- Fechas de negocio (`trade_date`, `value_date`, `acquisition_date`) como `YYYY-MM-DD` sin zona horaria.
- Nombres de campo en `snake_case`.
- Las líneas nunca se modifican ni se borran. Una rectificación son líneas nuevas (`reversal` + evento correcto).
- **El orden canónico de almacenamiento es la posición en el fichero.** Dos dispositivos con relojes distintos pueden generar ULIDs desordenados; el fichero manda como desempate.
- **La proyección aplica las operaciones en orden cronológico**, no en orden de registro: un evento registrado tarde (una compra anotada después de una venta posterior en fecha) se coloca donde le corresponde por `fiscal_date`. Ver §7.1.

## 3. Tipos de evento

| Familia | `type` | Descripción breve |
|---|---|---|
| Catálogo | `account_created`, `account_updated` | Alta y cambios de una cuenta |
| Catálogo | `asset_created`, `asset_updated` | Alta y cambios de un activo (ISIN, ticker, TER, ETF de referencia…) |
| Configuración | `settings_changed` | **Foto completa de la configuración en vigor tras el cambio, no un parche** (ADR-0022): un cálculo fiscal tiene que poder reproducirse desde el libro y solo desde el libro, sin depender de qué decía un documento aquel año |
| Operación | `buy`, `sell` | Compra y venta |
| Operación | `transfer` | Traspaso entre fondos (origen y destino en un solo evento) o **traspaso de custodia** del mismo activo entre cuentas (ADR-0012) |
| Operación | `dividend` | Dividendo: bruto, retención en origen, retención en España |
| Operación | `corporate_action` | Evento corporativo con subtipo `kind` (ver `business-rules.md` §6) |
| Operación | `cash_deposit`, `cash_withdrawal` | Movimientos de efectivo de una cuenta |
| Operación | `fx_exchange` | Cambio de divisa dentro de una cuenta (vende una, compra otra) (ADR-0012) |
| Operación | `interest` | Interés de cuenta remunerada, bruto y retención (ADR-0012) |
| Operación | `standalone_fee` | Comisión no ligada a una operación (custodia, conectividad…) |
| Operación | `valuation` | Foto manual de valoración (p. ej. 31/12 para el Modelo 720) |
| Seguimiento | `order_placed`, `order_updated` | Orden de suscripción/compra o reembolso/venta dada y aún no ejecutada (ADR-0012). Sin efecto sobre lotes ni efectivo |
| Seguimiento | `transfer_requested`, `transfer_request_updated` | Traspaso en curso (ADR-0010). Sin efecto sobre lotes ni efectivo |
| Rectificación | `reversal` | Anula un evento anterior (`reverses_id`); opcionalmente el evento correcto lo referencia con `corrects_id` |
| Cubo | `thesis_opened`, `thesis_closed` | Tesis del cubo especulativo |
| Operación | `swap` | **Permuta de un activo por otro** (cripto por cripto es el caso que lo motiva; `fx_exchange` es solo para divisas). Es una **transmisión más una adquisición**, no un traspaso: valorada por **el mayor entre el valor de mercado de lo entregado y el de lo recibido** (art. 37.1.h LIRPF), el lote recibido nace con la fecha del swap y **sin heredar antigüedad ni coste**. Aviso `swap_fiscal_dates_differ` si las dos patas tienen reglas de fecha fiscal distintas. ADR-0021 |
| Fiscal *(ADR-0020; implementado en la feature 010)* | `tax_return_filed` | Deja constancia de qué se ha declarado, de qué modelo (`renta` / `720` / `721`) y con qué cifras, más la huella del libro ese día y la referencia del justificante. Sin él, un `settings_changed` puede reescribir en silencio una Renta ya presentada, la regla de los 20.000 € del Modelo 720 no es calculable y el arrastre de pérdidas a cuatro ejercicios no tiene ancla. Es un **documento administrativo**: se filtra por su fecha de presentación, no por el corte de `asOf` (ADR-0016). Una complementaria es un evento nuevo con `supersedes`, **nunca un `reversal`**. *Challenge* 3, hallazgo 2. Su forma entera, en §6.6 |

| Fiscal *(ADR-0025; implementado en la feature 011)* | `filing_fingerprint_waived` | Deja constancia de que el usuario aceptó, **a propósito y por su nombre**, que la huella de **una** presentación no se pudo verificar, para poder compactar el libro. Se escribe **solo dentro de `compact`** y en la misma reescritura: sin compactación no hay renuncia. No toca la presentación (ADR-0020), no se puede anular y `check` la dice para siempre. Es un **documento administrativo**, sin fecha de negocio (ADR-0016). Su forma, en §6.7 |

Son **26 tipos**. La forma exacta de cada evento (campos obligatorios, validaciones, ejemplo) se define en §6.

## 4. Campos comunes de las operaciones

| Campo | Tipo | Notas |
|---|---|---|
| `account_id` | id | Cuenta donde ocurre |
| `asset_id` | id | Activo (no en movimientos de efectivo) |
| `trade_date` | fecha | Fecha de contratación |
| `value_date` | fecha | Fecha valor / liquidación |
| *(derivada)* `fiscal_date` | fecha | La que manda para ejercicio, antigüedad, tipo de cambio y ventana de recompra. Se deriva por `asset_type` según `Settings.fiscal_date_rule` (ADR-0013); no se almacena |
| `quantity` | decimal | Cantidad (participaciones, acciones, unidades) |
| `unit_price?` | decimal | Precio unitario en `currency`. **Obligatorio si no hay `amount`**; si lo hay, es informativo y puede omitirse (nunca se rellena con `"0"` ni con un valor derivado: el libro no guarda datos inventados) |
| `amount?` | decimal | Importe bruto liquidado en `currency` (sin comisión). Si está presente, **es la base de coste o de transmisión** (ADR-0012) |
| `currency` | ISO 4217 | Divisa del precio y la comisión |
| `fx_rate` | decimal | Tipo del BCE **tal cual lo publica**: unidades de `currency` por EUR, todos sus decimales; `"1"` si EUR. `eur = amount / fx_rate` (ADR-0013). Validación: si `currency` es `EUR`, `fx_rate` debe ser exactamente `"1"` (rechazo; *challenge* 2026-08-31, hallazgo 5) |
| `fx_rate_date` | fecha | Fecha del tipo aplicado. Si `fiscal_date` no tiene publicación (fin de semana, festivo TARGET), el último anterior. Nunca un sábado ni un domingo (el BCE no publica: rechazo). **El cargador sigue sin validar festivos TARGET al cargar** (sería un endurecimiento retroactivo, ADR-0018); la comprobación contra el calendario y contra el histórico oficial (`reference/ecb/`) es de `check --deep` y de la propuesta al registrar, ambas fuera del cargador (ADR-0029, que resuelve lo que la Ronda 6 tenía pendiente) |
| `fee` | decimal | Comisión en `currency` |
| `broker_ref?` | cadena | Identificador del bróker (`tradeID` de IBKR, referencia de MyInvestor) |
| `fingerprint` | cadena | Huella de idempotencia: hash de (`source`, `broker_ref` si existe, `account_id`, `asset_id`, `type`, `value_date`, `quantity`, `amount` o `unit_price`, `currency`). En manual **no** entra el `id` propio: así dos entradas idénticas avisan, y una repetición legítima se confirma con `--confirm-duplicate`. **Huella repetida = aviso con confirmación**, no rechazo (ADR-0012). Una presentación (§6.6) tiene su propia tupla: `type`, `model`, `tax_year` y `receipt_reference`, **sin `filed_at`** |
| `source` | cadena | `manual`, `ibkr_flex`, `myinvestor_xlsx`… |
| `notes` | cadena | Libre |

## 5. Versionado y migraciones

- `schema_version` empieza en `1`. Cada cambio incompatible del formato de cualquier evento incrementa la versión global.
- **Qué es incompatible (ADR-0018).** Compatible, sin versión nueva: añadir un campo opcional, añadir un valor a un enumerado, relajar una validación, aceptar una forma antigua además de la nueva. Rompedor, con versión nueva y su migración: endurecer o eliminar una regla de forma existente, quitar un valor de un enumerado, cambiar el significado de un campo. El cargador valida cada línea con las reglas de hoy, así que endurecer sin migrar deja **ilegible el libro entero**, no degradado. Mientras el libro real esté vacío se admite endurecer dentro de la v1 regenerando el *golden*; **desde el primer evento real, no**.
- **Enmienda del 2026-09-24 (ADR-0018, Ronda 8): un campo opcional nuevo no siempre es compatible.** La regla de arriba vale para una operación (`buy`, `sell`…), donde un cliente antiguo nunca reescribe la línea. Pero en un evento que guarda el **estado completo** — `settings_changed` y los `*_updated` del catálogo (§6.1, ADR-0022) —, un campo opcional nuevo es compatible **para leer** (un cliente antiguo carga la línea) pero **no para escribir**: al registrar la foto siguiente, un cliente antiguo la escribe **sin** ese campo, que desaparece del estado sin que nada lo avise. Por eso un campo nuevo que tenga que vivir en una de esas fotos **o va fuera del libro** —como la correspondencia de símbolos de precios (`prices/symbols.json`, ADR-0031) y el interruptor de importes del correo (SSM, ADR-0028) en esta misma ronda— **o sube `schema_version`**, para que un cliente antiguo se niegue a escribir sobre ese libro. `broker_settled_eur` (ADR-0030, §6.2) no está sujeto a esta enmienda: vive en operaciones, no en una foto completa.
- Al cargar, cada línea pasa por la cadena `migrate(v) → v+1` hasta la versión actual, en memoria. Las funciones de migración son puras, viven en `packages/domain/schema/migrations/` y tienen como fixtures líneas reales de la versión antigua.
- El fichero **nunca** se reescribe por una migración.
- `compact` (comando de CLI, acción deliberada): reescribe el libro entero a la versión actual y archiva el original en `archive/`. Se ejecuta cuando la cadena de migraciones pendientes molesta, no de forma automática. Contrato (feature 003): (1) el almacén guarda los bytes originales, tal cual, en `archive/` **antes** de reemplazar el libro y nunca sobrescribe un archivo (`LedgerStore.replace`; desde ADR-0026 no es la única operación que reescribe: también lo hace la de reemplazar por líneas crudas, que usan la sincronización y la restauración, más abajo); (2) es no-op si ninguna línea está por debajo de la versión actual (canonicalizar líneas escritas por otro cliente no es motivo); (3) aborta sin escribir si hay eventos inválidos o si la proyección del libro reescrito difiere de la original (`snapshotOf`); (4) **verifica todas las huellas de las presentaciones** (§6.6) **antes** de reescribir y se niega con `CompactRejectedError` si alguna falla, y después del reescrito las **vuelve a sellar** sobre el prefijo nuevo. La huella se toma sobre las líneas migradas a su versión y escritas en forma canónica, no sobre los bytes, precisamente para que compactar no la rompa; sellar una que no cuadra convertiría un registro roto en uno de fiar, así que no se hace. El rechazo nombra su motivo: `filing_fingerprint_unreadable` si **todas** las huellas rechazadas son ilegibles, y `filing_fingerprint_mismatch` en cualquier otro caso. (5) **La salida existe, se pide por su nombre y queda registrada** (ADR-0025, feature 011): `atlas compact --accept-unverified <filing_id>`, repetible, acepta que la huella de **esa** presentación no se pueda verificar —por cualquiera de los tres motivos, `lines`, `digest` o `unreadable`— y deja las demás protegidas; una huella rota que no se nombra sigue deteniendo la compactación. Por cada presentación aceptada se escribe un `filing_fingerprint_waived` (§6.7) **dentro de la misma lista** que se entrega a `replace`, así que la renuncia y la reescritura son todo o nada: si la compactación no termina, el libro queda como estaba y sin renuncia. La consola nombra antes de la pregunta a qué se renuncia, y solo **después** de compactar dice lo que ha quedado registrado. Para que un caso `lines` también tenga salida, la lectura anterior a la reescritura se toma con el recuento de líneas de la huella ya en su sitio, **solo para las presentaciones con renuncia y solo en ese campo**; la comparación de la proyección sigue siendo exacta en todo lo demás. (6) **En una carpeta sincronizada, `atlas compact` local se niega** y remite a la operación de administración sobre el remoto (ADR-0026, Parte A): la carpeta es una réplica, y compactarla dejaría sin sentido el marcador de `sync/state.json` y subiría como pendientes las renuncias que escribe. *(Previsto para la feature de sincronización; el código actual todavía no lo comprueba.)*

**Contrato del cargador y del `append` (hallazgo 10 del *challenge*):**
- El cargador **rechaza** el fichero si alguna línea tiene `schema_version` mayor que la que conoce el código. Un cliente antiguo (CLI vieja, PWA cacheada) nunca escribe sobre un libro más nuevo.
- `append` conserva **los bytes originales** del fichero y solo añade líneas al final; nunca re-serializa lo cargado. Solo reescriben `compact` y, desde ADR-0026, las operaciones de líneas crudas de la sincronización y la restauración (más abajo).
- `load` devuelve, además de los eventos migrados en memoria, las **líneas crudas** en orden de fichero (`lines`): son la entrada de las comprobaciones profundas de §7 (`integrity`).
- `settingsAt(date)` y cualquier comparación entre una fecha de negocio y `recorded_at` convierte `recorded_at` a fecha en `Europe/Madrid` y usa "hasta el fin de ese día".

**Operaciones sobre líneas crudas del puerto `LedgerStore` (ADR-0026, Ronda 8).** `append` y `replace` reciben `LedgerEvent[]` ya migrados en memoria y los vuelven a serializar (`encodeLine`); eso hace imposible que la réplica de un dispositivo sincronizado sea idéntica byte a byte al remoto. El puerto gana **dos operaciones que escriben los bytes tal cual, sin volver a serializarlos**: añadir líneas crudas al final, y reemplazar el contenido por líneas crudas archivando antes el original — con los mismos etag, archivo y rechazos que `append` y `replace`. Las cumplen los cuatro adaptadores (memoria, fichero, navegador, S3) y pasan los mismos tests de contrato. **La sincronización y la restauración usan solo esas** (ADR-0026, Parte A; ADR-0032): `replace` seguiría siendo un `compact` sin resellar las presentaciones si se usara para restaurar con una `schema_version` más nueva.

**Cerrojo consultivo de la carpeta del libro, solo en la consola (ADR-0026, Parte B, enmendada al cerrar la feature 012).** El almacén de fichero tiene una ventana entre comprobar el etag y escribir (ADR-0025) que ninguna escritura condicional cierra por sí sola en el sistema de ficheros local. **Solo la consola escribe en la carpeta**: la web de escritorio guarda su libro en IndexedDB y de la carpeta solo lee (ADR-0019, enmendada), porque la File System Access API **no permite crear un fichero en exclusiva** (verificado en la especificación y en Chromium, `specs/012-ecb-reference-rates/questions.md` §1). Así que el cerrojo existe **solo entre escritores de consola**. Su forma (`packages/adapters/src/ledger-store/folder-lock.ts`):

- **Se adquiere creando `ledger.lock` de forma exclusiva** (`open(…, "wx")`, `O_CREAT | O_EXCL`), que es atómico donde corre la consola. El fichero dice quién lo tiene (`holder`, hoy siempre `cli`), su testigo, desde cuándo, y el proceso y la máquina. Uno que existe y todavía está vacío es una escritura que empieza: el remedio es esperar, no romperlo.
- **Lo cubre todo lo que se escribe en la carpeta**: el libro, `archive/`, `drafts/`, `reference/ecb/` y, cuando exista, `sync/`. Se toma antes de comparar el etag y se suelta después de renombrar. Al empezar cada orden, los temporales huérfanos del libro se barren **solo** tomando el cerrojo.
- **Antes de renombrar se comprueba que sigue siendo propio**, como reducción de riesgo y no como garantía.
- **Nunca se rompe solo**, por viejo que sea: su edad es informativa (`lock_stale_minutes`, §1). `atlas lock show` dice quién lo tiene y desde cuándo; `atlas lock break` lo rompe a petición del usuario.
- **Consultivo**: un editor de texto no lo ve, y eso está aceptado.

**IndexedDB: comparar y escribir en una sola transacción.** El almacén de la web no vive en una carpeta: su primitiva es `LedgerBlob.update` (`packages/adapters/src/ledger-store/blob.ts`), que lee, compara el etag y escribe en **una sola** transacción de lectura y escritura. Toda lectura seguida de escritura del libro pasa por ella: `append`, `replace`, la exportación (que lee el texto y anota la fecha en la misma transacción) y la importación (que compara con el libro que había al preguntar y **se niega si cambió**). La fecha de la última exportación vive aparte del texto (`current:meta`), y una importación no hereda la del libro que sustituye. La base está en `DB_VERSION` 2, con el almacén `drafts`; si otra pestaña con una versión anterior bloquea la subida, se dice así, no «el navegador no permite guardar datos».

## 6. Semántica de cada evento

Todos llevan el envoltorio de §2. Los ejemplos omiten `schema_version`, `id` y `recorded_at`. Campos marcados `?` son opcionales. Numéricos siempre como cadenas.

### 6.1 Catálogo

Los eventos `*_updated` llevan el **estado completo resultante** (no un diff), igual que `settings_changed`: más bytes, mucha más legibilidad. **Por eso un campo nuevo en estos eventos exige la enmienda de ADR-0018 de §5** (Ronda 8): un cliente antiguo que escriba la foto siguiente la escribe sin el campo que no conoce, y el campo desaparece del estado sin avisar. Ni `price_symbols` (correspondencia de símbolos de precios) ni el interruptor de importes del correo viven aquí por ese motivo: el primero va en `prices/symbols.json` (§1, ADR-0031) y el segundo en SSM (ADR-0028).

**`account_created` / `account_updated`**
`account_id`, `name`, `platform`, `book` (`core` | `bucket`), `base_currency`, `country` (ISO 3166-1, para el Modelo 720), `active`

**`asset_created` / `asset_updated`**
`asset_id`, `asset_type` (`fund` | `etf` | `etc` | `etp` | `stock` | `crypto` | `money_market`; se llama `asset_type` en la línea porque `type` es el tipo de evento del envoltorio), `book`, `asset_class?` (solo `core`: `equity` | `fixed_income` | `gold` | `crypto`), `isin?`, `ticker?`, `name`, `currency`, `ter?`, `transferable`, `reference_etf_id?`, `market?` (código MIC o nombre del mercado donde cotiza), `issuer_country?` (ISO 3166-1 alfa-2 del emisor), `active`

`market` e `issuer_country` los añadió ADR-0021 para que preguntas fiscales abiertas se puedan responder sin migrar: la ventana del art. 33.5.f) habla de mercados regulados **de la UE**, y varios ETC de oro y ETP de cripto están domiciliados en Jersey o las Islas Caimán. El motor fiscal enseña el `market` de cada valor cotizado con pérdida al declarar el criterio #2 en disputa, pero **no clasifica**: el sistema no tiene la lista de mercados regulados de la UE.

Validación (ADR-0009): un `asset_id` no puede existir en los dos libros. Un cambio puro de identificador (mismo producto) es `asset_updated`; cualquier otro cambio es activo nuevo + `corporate_action` (ver §6.5). En particular, `asset_updated` **rechaza** un cambio de `asset_type` o de `currency`: alteraría en silencio la `fiscal_date` (ADR-0013) o la base de coste de todas las operaciones pasadas del activo.

**Un ISIN, un activo** (feature 009). Se rechaza al registrar un `asset_created`, o un `asset_updated` que **cambie** el ISIN, cuyo ISIN ya sea de otro activo del catálogo, en cualquiera de los dos libros: para la Agencia Tributaria son un mismo valor y para el FIFO y la regla de recompra serían dos, que es exactamente el silencio que ADR-0009 evita. El error (`duplicate_isin`) nombra el activo que hay que usar. Se compara en mayúsculas y sin espacios, y **contra el catálogo proyectado del libro candidato**, no contra las líneas crudas: así, rehacer un alta anulada no choca consigo misma y anular un cambio de ISIN sí se ve. **No es una validación de carga**: un libro ya escrito con el ISIN repetido se sigue cargando y lo dicen `integrity` (`duplicate_isin`, error) y el informe fiscal (`tax_duplicate_isin`).

**`settings_changed`**
`settings`: objeto completo con todos los parámetros de `business-rules.md` §7. La proyección `settingsAt(date)` devuelve el último `settings_changed` con `recorded_at ≤ date`.

**Al leer**, los mapas por tipo de activo son tolerantes: un tipo ausente toma su valor por defecto documentado (ADR-0018). **Al escribir**, se materializan (ADR-0022): la línea que se escribe fija los tres mapas completos (`fiscal_date_rule`, `wash_sale_window`, `income_category`) y los escalares con valor por defecto documentado: `wash_sale_transfer_counts`, `savings_offset_limit_pct`, `loss_carryforward_years`, los seis del 720 y del 721 (`model_720_threshold_eur`, `model_720_increase_eur`, `model_720_alert_threshold_eur` y sus tres equivalentes del 721) y las dos fechas de la campaña de la Renta (`renta_season_start`, `renta_season_end`). Así un ejercicio calculado hoy se reproduce años después aunque el valor por defecto del código cambie. `treaty_withholding_pct` no se materializa: no tiene valor por defecto, y no tenerlo es la decisión.

Un valor desconocido en cualquiera de los tres mapas tiene **código de error propio** —`invalid_fiscal_date_rule`, `invalid_wash_sale_window`, `invalid_income_category`, todos con el tipo de activo y el valor recibido—, porque cada uno mueve una cosa distinta y el mensaje tiene que poder decirla: el ejercicio de cada operación, la ventana de la regla de recompra o la casilla de la declaración en la que acaba una transmisión. Que el mapa **falte**, o que no sea un objeto, sigue siendo `invalid_settings`, como cualquier otro parámetro mal escrito.

Un `settings_changed` que reinterpreta el pasado (p. ej. un cambio de `fiscal_date_rule`) puede dejar eventos históricos inválidos bajo la regla nueva. Es el **único** evento que se admite registrar aun así, con confirmación explícita que lista los eventos afectados (los hechos no cambian; cambia su interpretación, y no hay nada que rectificar antes). Las consultas de solo lectura proyectan entonces en modo degradado (`collectErrors`) con un aviso en cabecera; las mutaciones siguen exigiendo un libro válido (*challenge* 2026-08-31, hallazgo 2; feature 004).

### 6.2 Operaciones

**`broker_settled_eur?` (ADR-0030, Ronda 8, bloque 0 de la feature `012`).** Campo opcional en `buy`, `sell`, `dividend`, `interest` y `standalone_fee`: el movimiento total de euros que el extracto del bróker atribuye a la operación, tal cual figura; si el extracto carga la comisión en euros por separado, se incluye. **El signo lo da el tipo de evento** (ADR-0030, enmienda): un negativo se rechaza siempre (`broker_settled_eur_negative`); **en `dividend` e `interest` se admite el cero**, que es el neto que entró en la cuenta (un dividendo retenido entero en origen es un cero conocido); **en `buy`, `sell` y `standalone_fee` tiene que ser estrictamente positivo** (`broker_settled_eur_zero`). Omitido significa desconocido, nunca cero. Solo tiene sentido si `currency` no es `EUR` (en euros se rechaza, `broker_settled_eur_in_eur`, sería redundante) y **nunca se rellena con un valor calculado**: si el extracto no lo trae, el campo no está. **Puramente informativo**: ninguna proyección, cálculo fiscal ni saldo lo lee — solo una lista cerrada de módulos puede leerlo, vigilada por un test de arquitectura — y **no entra en la huella de idempotencia** (§4), para que la misma operación registrada a mano y luego importada se siga detectando como duplicado. Es un cambio **compatible** según ADR-0018 (campo opcional de una operación, no de una foto completa): no sube `schema_version`.

**`buy`**
Comunes (§4) + `order_id?` (cierra un `order_placed`) + `thesis_id?` (obligatorio si la cuenta es del libro `bucket`; debe existir un `thesis_opened` previo con ese id) + `broker_settled_eur?` (ADR-0030).

```json
{"type":"buy","account_id":"acc_ibkr","asset_id":"ast_xau","trade_date":"2026-09-01","value_date":"2026-09-03","quantity":"12","unit_price":"215.30","currency":"USD","fx_rate":"1.0857","fx_rate_date":"2026-09-01","fee":"1.50","source":"manual","fingerprint":"sha256:…"}
```

Efecto: crea un lote con `acquisition_date = fiscal_date`, `cost_eur = ((amount ?? quantity × unit_price) + fee) / fx_rate`.

**`sell`**
Comunes + `withholding?` (retención a cuenta practicada, en `currency`) + `thesis_id?` (en cuentas `bucket`, enlaza la venta con su tesis abierta, igual que en `buy`; sin él se acepta con aviso) + `broker_settled_eur?` (ADR-0030).

Admite `order_id?`. Efecto: consume lotes FIFO del `asset_id` en todas las cuentas (§8.1); valor de transmisión `((amount ?? quantity × unit_price) − fee) / fx_rate`; genera ganancia o pérdida por lote consumido; comprueba la regla de recompra (§8.4). Rechaza si la cantidad supera la posición física de la cuenta.

**`transfer`** (ADR-0010)
`request_id?`, `from_account_id`, `from_asset_id`, `quantity_out`, `nav_out`, `value_date_out`, `to_account_id`, `to_asset_id`, `quantity_in`, `nav_in`, `value_date_in`, `fingerprint`

Un `transfer` **no lleva comisión**: la comisión real de un traspaso de custodia (el cargo del depositario) se registra como `standalone_fee` (mueve efectivo, no toca la base fiscal; su deducibilidad está en la pregunta fiscal #3). El `fee?` que este evento tuvo hasta la feature 004 se aceptaba y se ignoraba (*challenge* 2026-08-31, hallazgo 6).

**Dos modos:** (a) *traspaso fiscal* entre fondos distintos: ambos activos deben ser `transferable`; (b) *traspaso de custodia* (`from_asset_id == to_asset_id`, cuentas distintas): admitido para cualquier activo, sin `nav_*`, solo mueve `physicalPositions`; los lotes fiscales no cambian (ADR-0012). En el modo (a), efecto: consume `quantity_out` de lotes origen en FIFO; por cada lote consumido crea un lote destino con la **misma `acquisition_date`** y el **mismo coste total** (repartiendo `quantity_in` en proporción a la cantidad consumida de cada lote); `unit_cost_eur` destino = coste heredado / cantidad recibida. No genera ganancia ni pérdida.

**`swap`** (ADR-0021)
`account_id`, `trade_date`, `value_date`, `from_asset_id`, `quantity_out`, `market_value_out`, `to_asset_id`, `quantity_in`, `market_value_in`, `currency`, `fx_rate`, `fx_rate_date`, `fee`, `thesis_id?` (obligatorio en cuentas `bucket`, para el activo **recibido**), `broker_ref?`, `source`, `notes?`, `fingerprint`

Permuta de un activo por otro (cripto por cripto es el caso que la motiva; `fx_exchange` es solo para divisas). Es una **transmisión más una adquisición**, no un traspaso: se valora por el art. 37.1.h LIRPF, **el mayor** entre el valor de mercado de lo entregado y el de lo recibido, y por eso se guardan los dos y ninguno se deriva del otro. La comisión resta de lo transmitido (criterio #17). El lote recibido nace con la fecha del swap y **sin heredar antigüedad ni coste**. Aviso `swap_fiscal_dates_differ` si las dos patas tienen reglas de fecha fiscal distintas. El vocabulario es a propósito el de `transfer` (`from_*`, `quantity_out`, `to_*`, `quantity_in`); lo que los distingue es el tipo, los dos `market_value_*` que un traspaso no tiene y la ausencia de `nav_*`.

**`transfer_requested`** (sin efecto sobre lotes)
`from_account_id`, `from_asset_id`, `to_account_id`, `to_asset_id`, `quantity_out?` o `amount_eur?`, `requested_date`, `notes?`

**`transfer_request_updated`** (sin efecto sobre lotes)
`request_id` (= `id` del `transfer_requested`), `stage` (`redeemed` | `subscribed` | `cancelled`), `date`, `nav_out?`, `quantity_out?`, `notes?`

**`order_placed`** (sin efecto sobre lotes ni efectivo, ADR-0012)
`account_id`, `asset_id`, `side` (`buy` | `sell`), `amount?` o `quantity?`, `requested_date`, `notes?`

**`order_updated`** (sin efecto)
`order_id` (= `id` del `order_placed`), `stage` (`cancelled` | `note`), `date`, `notes?`

Un `buy`/`sell` con `order_id` cierra la orden. Un `order_placed` sin cierre es una orden **pendiente** (`pendingOrders`).

**`fx_exchange`** (ADR-0012)
`account_id`, `value_date`, `sold_amount`, `sold_currency`, `bought_amount`, `bought_currency`, `fee`, `fee_currency`, `fx_rate_sold`, `fx_rate_bought`, `fx_rate_date`, `broker_ref?`, `fingerprint`

Efecto: resta `sold_amount` y suma `bought_amount` en `cashBalances` de la cuenta. Los tipos BCE de ambas divisas se guardan para la futura proyección de diferencias de cambio (Fase 5).

**`interest`** (ADR-0012)
`account_id`, `value_date`, `gross`, `withholding_spain`, `currency`, `fx_rate`, `fx_rate_date`, `broker_ref?`, `fingerprint`, `broker_settled_eur?` (ADR-0030)

Efecto: suma el neto al efectivo; alimenta `investmentIncome` (rendimiento del capital mobiliario con retención).

**`dividend`**
`account_id`, `asset_id`, `value_date`, `gross`, `withholding_origin`, `withholding_spain`, `currency`, `fx_rate`, `fx_rate_date`, `source_country?` (ISO 3166-1 del **pagador**, no del depositario; del convenio con ese país dependen el tipo deducible y el límite de la deducción por doble imposición, pregunta fiscal #16), `per_unit?`, `broker_ref?`, `fingerprint`, `broker_settled_eur?` (ADR-0030)

Efecto: no toca lotes; suma al efectivo de la cuenta el neto; alimenta rendimientos del capital mobiliario y deducción por doble imposición.

**`cash_deposit` / `cash_withdrawal`**
`account_id`, `value_date`, `amount`, `currency`, `fx_rate`, `fx_rate_date`, `notes?`, `fingerprint`

**`standalone_fee`**
`account_id`, `value_date`, `amount`, `currency`, `fx_rate`, `fx_rate_date`, `description`, `fee_kind?` (`custody` | `administration` | `connectivity` | `discretionary_management` | `other`; ausente equivale a `other`), `fingerprint`, `broker_settled_eur?` (ADR-0030). No afecta a la base fiscal de ningún lote. `fee_kind` existe porque el art. 26.1.a) permite deducir del rendimiento del capital mobiliario los gastos de **administración y depósito** de valores negociables y no los demás: el motor fiscal deduce las marcadas `custody` o `administration` (criterio #23) y deja fuera al resto, así que **sin marcar nada no cambia nada** (ADR-0021).

**`valuation`**
`account_id`, `asset_id`, `date`, `quantity`, `unit_value`, `currency`, `fx_rate`, `fx_rate_date`, `source`. Foto manual de Nivel 1 (p. ej. 31/12 para el Modelo 720). No toca lotes.

`fx_rate_date` se añadió como **opcional** en la feature 005 (*challenge* 3, hallazgo 6): estos cuatro eventos guardaban el tipo del BCE **sin la fecha del tipo**, y el 31/12 cae en fin de semana dos de cada siete años, así que el tipo aplicado a una valoración de fin de año no era reproducible desde la tabla oficial. Desde la feature 008 es **obligatorio** en los cuatro (ADR-0021). Hacerlo obligatorio es un endurecimiento, y ADR-0018 solo lo permite dentro de la versión 1 mientras el libro real esté vacío: por eso se hizo entonces y por eso ya no se puede volver a hacer sin `schema_version = 2`.

**`corporate_action`** (ADR-0011)
`kind`, `asset_id` (activo afectado), `effective_date`, `source_document` (clave en `documents/` o URL del emisor), `effects[]` (primitivas, ver §6.5), `neutrality_regime?` (booleano: si la operación se acoge al régimen de neutralidad), `notes?`, `fingerprint`

`neutrality_regime` lo añadió ADR-0021 y **no decide nada**: en qué primitivas se compone un canje sigue siendo elección del usuario. Existe porque el diferimiento es condicional (la AEAT exige que la entidad adquirente sea española o esté en la Directiva 2009/133/CE), y sin el régimen un canje es una permuta plenamente sujeta por el art. 37.1.h. El motor fiscal lo lee para decir cuánto hay en juego: un `convert` sin régimen escrito sale en los criterios dudosos (#7 y #13, motivo `regime_not_recorded`), y un régimen declarado que contradice lo registrado sale como nota.

Afecta a los lotes del `asset_id` en **todas** las cuentas (los lotes fiscales son globales, ADR-0009); `forced_sale` vende y cobra **cuenta a cuenta** según `per_account[]` (§6.5), sin reparto automático.

### 6.3 Rectificación (ADR-0003)

**`reversal`**
`reverses_id`, `reason`. Anula el evento referenciado a todos los efectos; la proyección ignora ambos. Un `reversal` de un `reversal` está prohibido (se registra de nuevo el evento original). Tampoco se anula un `filing_fingerprint_waived` (`waiver_not_reversible`, §6.7): registra una compactación que ya ocurrió.

**Eventos ya consumidos (hallazgo 3 del *challenge*):** `reverseEvent` y `correctEvent` re-proyectan el libro completo sin la pareja y **rechazan** la operación si algún evento posterior deja de ser válido (una venta que consumía el lote anulado y se queda sin lotes, un `transfer` cuyos lotes destino ya se vendieron, un `account_updated` que cambia `book` con posiciones vivas, un `asset_created` con eventos que lo referencian…), listando los eventos afectados. Para anular algo consumido hay que rectificar primero lo que dependía de ello. La proyección ante un estado inválido **falla ruidosamente**; nunca produce cantidades negativas en silencio.

**La raíz de una corrección (feature 012).** La **raíz** de un evento es el primero de su cadena de correcciones: se sigue `corrects_id` hasta un evento que no corrige nada (una corrección de algo que no está en el fichero empieza su propia cadena; un bucle escrito a mano deja a cada miembro como su propia raíz; ver ADR-0009, enmienda, para lo que la proyección hace con él). Una corrección es **el mismo hecho económico** que su raíz, y dos reglas la leen de un único sitio (`packages/domain/src/projections/correction-root.ts`): la de abajo, y **el sitio del hecho en el fichero**. Esta segunda **solo vale para las operaciones** (la pasada de §7.1 que ordena por fecha de negocio): una compra o una venta corregida toma la posición de su raíz para el orden de las operaciones del mismo día, para el desempate FIFO (§7.1, §8.1) y para situarse respecto de la apertura y el cierre de su tesis del cubo (ADR-0009, enmienda). **Una corrección de un `thesis_opened`, de un evento de catálogo o de una presentación conserva su propia posición.**

**Una operación anulada tiene como mucho una corrección viva (ADR-0026, Parte C, Ronda 8).** Una segunda corrección no anulada **de la misma raíz** es **inválida** (`second_live_correction`, con `root_id` en los detalles). `dangling_correction` ya exige que el original esté anulado; esta regla añade que solo puede haber una corrección sin anular por raíz. Se juzga **por raíz**, no por `corrects_id` directo (juzgada así, `O, R(O), C1→O, R(C1), C2→C1, C3→O` dejaba vivas C2 y C3), y **en orden de fichero**: una corrección es válida si, en su propia posición, todas las anteriores de la misma raíz ya están anuladas. Es un **endurecimiento de la proyección**, y ADR-0018 lo admite porque **no puede invalidar ningún libro escrito por la aplicación**: corregir el original una segunda vez exige anularlo de nuevo, y eso ya falla hoy con `already_reversed`. Solo un libro editado a mano, o la fusión de dos colas de dispositivos sin conexión (ADR-0026), podría producir dos correcciones vivas; la regla protege también a quien usa **dos consolas** a la vez sobre la misma carpeta, sin nube (desde la 012 la web no escribe en la carpeta, así que son las únicas que pueden escribir ahí dos correcciones).

**Confirmar un borrador (ADR-0029, tercera enmienda).** Un borrador (`drafts/`, §1) guarda en `pending_event_id` el identificador que tendrá su evento **antes** de que se escriba nada en el libro; el evento se escribe con ese identificador y después se quita el borrador. Reglas:

- **Solo un evento con exactamente ese identificador** cuenta como «el borrador ya registrado» (un corte entre escribir el libro y quitar el borrador); entonces confirmar solo quita el borrador. Una operación idéntica con otro identificador es otra operación, y pasa por la pregunta de duplicado (ADR-0012).
- **Guardar el identificador es condicional**: solo se escribe si el borrador **sigue existiendo** y no tiene identificador o tiene **exactamente el que se leyó**; se comprueba y se escribe bajo el cerrojo en la consola y en una sola transacción en IndexedDB. Si no, `draft_changed`, y no se escribe nada.
- **Un borrador que ya no existe nunca se registra como nuevo.**
- Si el borrador ya trae identificador, se reutiliza, sellado otra vez con la misma condición. El libro rechaza siempre un segundo evento con el mismo `id` (`duplicate_id`), también con la confirmación de duplicado.

Cualquier evento puede llevar `corrects_id` apuntando al evento que sustituye. La CLI y la web implementan *Editar* como `reversal` + evento nuevo con `corrects_id`, y *Eliminar* como `reversal` solo. Si lo que se registra, corrige o anula alcanza un ejercicio con una **presentación vigente**, la app avisa antes de confirmar: bien porque cae por fecha fiscal dentro de él, bien porque mueve una cifra declarada aunque su fecha sea de otro año (§7). Un ejercicio pasado con cifras y **sin** presentación registrada no da aviso: da una nota tranquila.

### 6.4 Cubo

**`thesis_opened`**
`thesis_id`, `account_id`, `asset_id`, `hypothesis`, `expected_horizon_days` (entero), `invalidation`, `planned_size_eur`

**`thesis_closed`**
`thesis_id`, `closing_notes`. El resultado (`result_eur`, `result_vs_index`) es derivado: `result_eur` suma las ganancias de los `sell` enlazados por `thesis_id`.

Las tesis **no tienen fecha de negocio**: se proyectan en la primera pasada de §7.1, en orden de fichero, como el catálogo. "Crear la tesis antes de abrir la posición" (regla 15) significa *antes en el fichero*; su fecha administrativa es la de `recorded_at` en `Europe/Madrid`. Validación: cuenta y activo del libro `bucket`; como máximo una tesis abierta por (`account_id`, `asset_id`); un `buy` en `bucket` exige `thesis_id` de una tesis abierta, anterior en el fichero y de la misma cuenta y activo.

### 6.5 Eventos corporativos: primitivas

Cada efecto admite `asset_id?`: el activo sobre el que actúa, por defecto el `asset_id` del evento. Hace falta para liquidar los picos del activo nuevo tras un `convert` o `carve_out`, y para vender los derechos de un `stock_dividend`. Los efectos se aplican en el orden del array.

| Primitiva | Parámetros | Efecto |
|---|---|---|
| `scale` | `ratio` | `quantity × ratio` en cada lote; coste total y `acquisition_date` intactos |
| `convert` | `to_asset_id`, `ratio` | Cada lote pasa a `to_asset_id` con `quantity × ratio`; coste total y fecha intactos; `source_lot_id` enlaza |
| `carve_out` | `to_asset_id`, `ratio`, `cost_share` | Por cada lote crea otro en `to_asset_id` con `quantity × ratio`, coste `cost × cost_share` y la misma fecha; el lote origen queda con `cost × (1 − cost_share)` |
| `forced_sale` | `per_account[]` de `{account_id, quantity, fee?, withholding?}` (`quantity` puede ser `"all"`), `unit_price`, `currency`, `fx_rate`, `fx_rate_date` | Como un `sell` FIFO por cada cuenta, con la comisión de cada bróker anotada por cuenta: hecho imponible. Los picos (contrasplit, liberadas, escisión) se liquidan **cuenta a cuenta**, como hace cada bróker (hallazgo 8) |
| `grant` | `per_account[]` de `{account_id, quantity}`, `asset_id`, `unit_cost`, `currency`, `fx_rate`, `fx_rate_date`, `acquisition_date`, `income_eur?`, `income_base?` | Lotes nuevos por cuenta con `cost_eur = quantity × unit_cost / fx_rate`. No toca el efectivo: un desembolso del titular es un `buy` |

**`ratio`** es una cadena decimal (`"4"`, `"0.25"`) **o una fracción `"nuevas/antiguas"` de enteros positivos** (`"4/3"`, `"1/3"`): un contrasplit 1:3 o "una nueva por cada tres" no tienen decimal exacto y guardarlos redondeados dejaría el libro a 1e-10 del bróker para siempre. Cantidad nueva = `quantity × nuevas / antiguas`; la división va a 10 decimales (ADR-0005) solo cuando no es exacta y, en ese caso, el total del activo se calcula una vez y el último lote y la última cuenta reciben el resto exacto, de modo que Σ lotes = Σ posiciones se mantiene.

Ejemplo (fusión 2 antiguas → 1 nueva, con 10 y 7 títulos en dos cuentas; los picos de la nueva se liquidan a 40 € cuenta a cuenta):

```json
{"type":"corporate_action","kind":"merger","asset_id":"ast_old","effective_date":"2031-03-12","source_document":"documents/01J…/prospectus.pdf",
 "effects":[
   {"op":"convert","to_asset_id":"ast_new","ratio":"1/2"},
   {"op":"forced_sale","asset_id":"ast_new","per_account":[{"account_id":"acc_b","quantity":"0.5"}],"unit_price":"40","currency":"EUR","fx_rate":"1","fx_rate_date":"2031-03-12"}
 ],"notes":"Absorción de OLD por NEW. El canje conserva antigüedad; el pico de acc_b (3,5 → 3) tributa."}
```

**`withholding?` de `forced_sale`** (ADR-0021) es la retención a cuenta que practica **cada bróker**, en la divisa del efecto, con el mismo tratamiento que la de un `sell`: sale del efectivo que entra y no toca ni el valor de transmisión ni el coste de los lotes. Vive **por cuenta** y no en el efecto, porque una venta forzosa se liquida cuenta a cuenta y repartir un importe único entre cuentas sería una cifra inventada, igual que ya pasó con la comisión.

**`income_eur?` e `income_base?` de `grant`** (ADR-0021) dicen que lo recibido **es renta en el momento de recibirlo** —un *fork*, un *airdrop*, las acciones de una escisión fuera del régimen de neutralidad, un dividendo en especie— y a qué base iría (`general` | `savings`). Los dos viajan juntos: uno sin el otro se rechaza. Se guardan y se enseñan, y **no entran en ninguna cifra de la declaración**: el criterio vigente (#8) es coste cero y nada que declarar en la recepción. Está en disputa, así que el motor fiscal lo saca en los criterios dudosos, con `income_eur` como exposición y la base que diga el evento.

**Compensación en efectivo de una fusión** ("más 3 € por acción antigua"): `forced_sale` es siempre una venta, así que se registra como venta **parcial** de las antiguas antes del `convert`, con la cantidad y el precio que fijen el usuario y el asesor (`docs/fiscal-questions.md` #13). Si el asesor concluye que el efectivo reduce el coste de las nuevas en vez de tributar como transmisión, hará falta una primitiva nueva (ADR); hasta entonces el asistente `merger` de la CLI solo liquida picos y el componente en efectivo se registra con `raw`.

### 6.6 Presentaciones (ADR-0020)

**`tax_return_filed`** deja constancia de lo que de verdad se presentó. Es **un hecho, no un cálculo**: lo que declara es lo que se presentó, aunque la aplicación calcule hoy otra cosa. Comparar las dos es justamente el objetivo.

`model` (`renta` | `720` | `721`), `tax_year`, `filed_at`, `receipt_reference`, `supersedes?`, `declared`, `computed`, `ledger_fingerprint`, `notes?`, `fingerprint`

- **`declared`** es lo presentado. De una `renta`: `savings_base_eur`, `pending_losses[]` (`origin_year`, `category`, `amount_eur` con su signo) y `deferred_losses_eur`, lo que la regla de recompra tenía diferido a 31/12, solo para comparar. De un `720` o un `721`: el total por categoría —`accounts` con `balance_eur` y `q4_average_eur`, `securities` y `crypto` con `value_eur`— más `items[]`, la **lista de bienes declarados**, cuenta a cuenta y valor a valor. Sin esa lista no hay forma de saber cuándo se deja de ser titular de algo declarado, que es el segundo disparador de la obligación. Una categoría ausente es una categoría **no declarada**.
- **`computed`** es lo mismo, en la misma forma, con lo que la aplicación calculaba **aquel día**, más lo que hace falta para reproducirlo: `as_of` (el día del cálculo), `settings_origin` (el `id` del `settings_changed` vigente, o `"default"`) y `settings`, la **configuración resuelta entera**. El `settings_changed` vigente por sí solo no reproduce una lectura que cayera en un valor por defecto del código.
- **`ledger_fingerprint`** es el libro tal como estaba **antes** de la presentación: `schema_version`, `lines` —cuántas líneas cubre, que son todas las anteriores a esta— y `sha256`. No son los bytes: el resumen se toma sobre esas líneas migradas a `schema_version` y escritas en forma canónica, porque los bytes cambian con el primer `compact` y una falsa alarma ahí sería peor que no comprobar nada.

**Validación.** `tax_year` no puede ser anterior al primer ejercicio de **su modelo**: `renta` 2018 (el régimen de compensación que implementa el motor), **`720` 2012** (Ley 7/2012 y RD 1558/2012, el año en que nació) y `721` 2023 (Orden HFP/886/2023). `filed_at` tiene que ser **posterior** al 31/12 del ejercicio que declara, y nunca futuro respecto del día en que se registra. `computed.as_of` tiene que **cubrir el ejercicio entero** que declara: no puede ser anterior al 31/12 de ese ejercicio (`as_of_before_year_end`; el propio 31/12 es válido, porque el corte de `asOf` incluye su fecha), ni posterior al día en que se registra la línea, `recorded_at` en `Europe/Madrid` (`as_of_in_future`). **No se compara con `filed_at`**: `as_of` es el día en que la aplicación calculó al registrar, y registrar después de presentar —el flujo normal— lo deja siempre posterior a `filed_at` (feature 011).

**La huella de idempotencia** (`fingerprint`, §4) de una presentación es `type`, `model`, `tax_year` y `receipt_reference`: el mismo justificante del mismo modelo y ejercicio registrado dos veces es la misma presentación, aunque se tecleen fechas distintas, y pide confirmación como cualquier huella repetida. Una complementaria tiene su propio justificante y no choca. Hasta la feature 011 la tupla incluía `filed_at`; se quitó dentro de `schema_version = 1` porque el tipo existía solo desde la feature 010, fusionada el mismo día, y no podía haber ninguna línea escrita cuya huella cambiase.

**La cadena de complementarias.** Una complementaria es un evento nuevo con `supersedes`, **nunca un `reversal`**: la primera presentación ocurrió. Una segunda presentación del mismo modelo y ejercicio **sin** `supersedes` se rechaza, porque nada diría en cuál de las dos tiene que anclar el arrastre; y un `supersedes` que apunte a otro modelo, a otro ejercicio, a algo que no es una presentación, a una ya sustituida o a una presentada **después** se rechaza por lo mismo. La presentación **vigente a una fecha** es la última de la cadena cuyo `filed_at` sea anterior o igual a ella: el 1 de junio de 2027 la vigente es la original, aunque en septiembre la sustituya una complementaria.

Un `reversal` de una presentación es para una que **nunca llegó a presentarse**. Anular una que otra sustituye se rechaza, como cualquier cosa ya consumida (ADR-0003): al proyectar el libro candidato, el `supersedes` de la complementaria se quedaría apuntando a nada.

Las presentaciones de un `720` o un `721` nombran cuentas y activos del catálogo, y se rechaza la que nombre uno que nadie registró: una presentación que no se puede comparar con nada no sirve para lo único para lo que existe.

### 6.7 Renuncia a verificar una huella (ADR-0025)

**`filing_fingerprint_waived`** deja constancia de que el usuario aceptó que la huella de **una** presentación no se podía verificar, para poder compactar (§5). Después de compactar, `compact` vuelve a sellar todas las huellas sobre el prefijo reescrito, y esta línea es la **única** traza que queda de que aquella nunca se comprobó.

`filing_id`, `reason` (`lines` | `digest` | `unreadable`), `declared_schema_version`, `declared_lines`, `notes?`

- **`reason`** es el motivo real de la comprobación, tal cual, nunca plegado en otro: `lines`, la huella cubre otro número de líneas de las que preceden a la presentación; `digest`, el prefijo releído no da el resumen que se selló; `unreadable`, el prefijo no se puede leer en la versión que la huella declara.
- **`declared_schema_version`** y **`declared_lines`** son lo que la huella declaraba en ese momento; después de compactar, el libro no los guarda en ninguna otra parte.
- **Cuándo lo dio por bueno** el usuario es el `recorded_at` del sobre.

**Lo escribe solo `compact`**, dentro de la misma reescritura: no hay comando que lo registre por separado. No lleva `fingerprint` ni fecha de negocio: es un **documento administrativo**, como una presentación, y el corte de `asOf` no lo alcanza (ADR-0016). **No toca la presentación** (ADR-0020): dice algo sobre ella. Lo que sí cambia es cómo se lee: la comparación con lo declarado deja de repartir la diferencia en sus cuatro causas para esa presentación y el informe lo dice con la nota `tax_filing_prefix_unverified` (motivo `waived`; el mismo código con `line_count` cuando el recuento de la huella no cuadra), porque una de esas causas solo se sostiene sobre un prefijo verificado (ADR-0024).

**Validación.** La presentación que nombra tiene que estar **en el fichero** (`waiver_filing_unknown`), no necesariamente en vigor: una presentación anulada sigue en el fichero, `compact` sigue comprobando su huella y la renuncia es su única salida. Una renuncia **no se puede anular** (`waiver_not_reversible`): la proyección rechaza el `reversal`, así que lo rechazan la consola y la web, y uno escrito a mano queda como evento inválido mientras la renuncia se sigue diciendo. `schema_version` sigue en 1: añadir un tipo de evento es un cambio compatible (ADR-0018).

## 7. Proyecciones

Todas son funciones puras `project(events) → estado`, ignoran parejas anuladas por `reversal`, y se recalculan en cada carga.

### 7.1 Orden de aplicación

La proyección se hace en tres pasadas:

1. **Catálogo, configuración, tesis y rectificaciones**, en orden de fichero: `account_*`, `asset_*`, `settings_changed`, `thesis_*`, `reversal`. Construyen el catálogo completo y el conjunto de parejas anuladas. Las referencias de cualquier operación se resuelven contra el catálogo completo (un `asset_created` registrado después de la primera compra de ese activo es válido).
2. **Presentaciones** (`tax_return_filed`), en orden de fichero y después del catálogo, porque los bienes de un 720 nombran cuentas y activos. No tienen fecha de negocio: cada consulta las filtra por su propio **`filed_at`**, nunca por el corte de `asOf`, porque una presentación es un documento administrativo (ADR-0016).
3. **Operaciones y seguimiento**, ordenadas por `(fecha de negocio, posición en el fichero)`: la fecha de negocio es `fiscal_date` para las operaciones con efecto en lotes o efectivo, `requested_date`/`date` para los eventos de seguimiento y `date` para `valuation`. Dentro de una misma fecha manda la posición en el fichero (también para el desempate FIFO de lotes con la misma `acquisition_date`). **La posición de una corrección es la de su raíz** (§6.3, ADR-0009 enmendada): corregir un dato de una operación no cambia cuándo ocurrió ni su sitio entre las de su mismo día.

**Consulta a una fecha (`asOf`, ADR-0016).** La última pasada admite un corte: con `asOf`, los eventos cuya fecha de negocio sea posterior se ignoran por completo (no entran en lotes, posiciones, efectivo, ganancias, rendimientos, valoraciones ni pendientes). Las dos primeras no cambian, así que el catálogo sigue completo, la configuración se sigue eligiendo con `settingsAt` y las presentaciones siguen filtrándose por `filed_at`.

**Las tesis se filtran por su fecha administrativa.** Como se proyectan en la primera pasada y **no tienen fecha de negocio** (§6.4), el corte de `asOf` no las alcanza por sí solo. Toda vista a una fecha `d` las filtra así: una tesis **existe** si `opened_at ≤ d`, y está **cerrada** solo si tiene cierre y `closed_at ≤ d` (si el cierre es posterior, a esa fecha estaba abierta). `days_open` nunca es negativo. Sin esta regla, una consulta a una fecha pasada lista tesis que aún no existían y promedia estadísticas sobre tesis que no habían operado (revisión de la feature 005). Toda vista que acepte una fecha proyecta con `asOf`: mezclar cantidades del final del libro con precios de una fecha pasada da números incoherentes en silencio.

Consecuencias: registrar tarde es normal (importar un extracto semanas después, corregir con la fecha real) y no altera el resultado; una venta se valida contra la posición física **en su fecha**, no en el momento de registrarla; `recordEvent` proyecta el libro con el evento nuevo colocado cronológicamente y rechaza si cualquier invariante se rompe. `settingsAt(date)` sigue usando `recorded_at` (es historial administrativo, no de negocio).


| Proyección | Devuelve | Notas |
|---|---|---|
| `accounts` | Cuentas con su estado actual | Último `account_*` por `account_id` |
| `assets` | Activos con su estado actual e historial de identificadores | Último `asset_*` por `asset_id`; los anteriores forman `identifier_history` |
| `settingsAt(date)` | Configuración vigente | Último `settings_changed` anterior o igual a `date` |
| `physicalPositions` | Cantidad por (`account_id`, `asset_id`) | Suma de compras, ventas, traspasos y efectos corporativos **por cuenta**. Es lo que se concilia. A una fecha pasada, se proyecta con `asOf` (ADR-0016) |
| `fiscalLots` | Lotes abiertos y cerrados por `asset_id` (globales) | Resultado del FIFO de §8 |
| `cashBalances` | Efectivo por cuenta y divisa | ADR-0004 |
| `pendingTransfers` | Solicitudes de traspaso sin `transfer` final | ADR-0010 |
| `pendingOrders` | Órdenes (`order_placed`) sin `buy`/`sell` que las cierre ni cancelación | ADR-0012 |
| `theses` | Tesis abiertas y cerradas: estado, `buy`/`sell` enlazados, invertido, `result_eur`, comisiones acumuladas, `days_open` y, desde la feature 005, `benchmark_equivalent_eur` y `result_vs_index_eur` (o *sin dato* si falta un precio del índice) | Regla 16; los precios son informativos y nunca tocan la fiscalidad |
| `realizedGains(year)` | Ganancias y pérdidas por operación y lote, **sin diferimientos**: el resultado propio de cada transmisión, redondeado una vez por operación (ADR-0005) | La regla de recompra no se aplica aquí: la aplica `taxYear` (§8.4) |
| `lotJournal` | Lo que el motor FIFO hizo a cada lote, en orden: `open`, `consume` (con su propósito: transmisión, traspaso o canje), `carve`, `scale` y `units` (con la razón exacta del evento) y `gain` | Estado de la proyección, **nunca en la instantánea**. No decide nada: deja por escrito lo que el único motor de lotes decidió, para que el motor fiscal arrastre por encima una magnitud más —la pérdida diferida— sin un segundo FIFO que pudiera discrepar del primero (feature 009) |
| `investmentIncome(year)` | Dividendos y retenciones | §6.2 |
| `valuations(date)` | Valoraciones registradas | Modelo 720 |
| `manualPrices(date)` | Último precio manual por activo (la `valuation` más reciente con `date ≤` la pedida, de cualquier cuenta), en su divisa y en EUR, con antigüedad y marca `stale` (`stale_price_days`) | Informativo: ningún cálculo fiscal lo usa (constitución II); nunca se interpola (feature 004) |
| `coreWeights(date)` | Solo libro `core`: valor, peso real, peso objetivo (`target_weights` por `asset_id`, suman 100), desviación en pp, subtotales por clase. Sin precio de un activo, la fila queda "sin precio" y los pesos no se calculan sobre totales parciales | Avisos `deviation_above_threshold`, `satellite_below_minimum`, `unknown_target_weight`, `asset_without_target` (feature 004) |
| `contributionPlan(amount, date)` | Propuesta de reparto de la aportación: presupuesto del cubo aparte, resto proporcional al déficit frente al objetivo, sobrante por pesos, céntimos half-up una vez por activo. Rechaza si falta algún precio. **No escribe**: el registro sigue siendo manual | Regla 2; nunca propone ventas (feature 004) |
| `costSummary` | Comisiones acumuladas por activo (EUR y % de lo invertido), TER y coste anual estimado; TER medio ponderado del núcleo. Libros siempre por separado | Reglas 6 y 14 (feature 004) |
| `netWorth(date)` | Patrimonio total **siempre desglosado**: núcleo valorado, cubo valorado y efectivo por cuenta y divisa, con marca de parcialidad si falta un precio o un tipo de cambio. En la salida de texto, el total y los subtotales son la **suma de las cifras mostradas** (las partes tienen que cuadrar con el total a la vista); el valor exacto sin redondear va en `--json` | Excepción 2 de la constitución III; denominador de la regla 18 (feature 005) |
| `bucketPositions(date)` | Posiciones abiertas del cubo: cantidad, coste medio, precio manual con antigüedad, valor, P&L latente, tesis asociada, días abierta, plazo superado y condición de invalidación | Especificación §6.2 (feature 005) |
| `bucketStats(date)` | Estadísticas de operativa del cubo sobre tesis cerradas: tasa de acierto, ganancia y pérdida medias, esperanza, número de operaciones con aviso de significancia, comisiones sobre capital operado, máxima caída del resultado realizado y resultado frente al índice | Reglas 14 y 16 (feature 005) |
| `filings` | Presentaciones registradas (§6.6): identidad, cadena (`supersedes` / `superseded_by`), lo declarado, lo calculado aquel día y su huella. `filingInForce(modelo, año, fecha)` devuelve la vigente a una fecha y `closedYears(fecha)` los ejercicios con presentación vigente | ADR-0020; se filtran por `filed_at`, no por `asOf` |
| `integrity` | Comprobaciones: posiciones físicas ≥ 0, lotes fiscales = suma física por activo, huellas únicas, referencias colgantes (`corrects_id` a un evento inexistente o no anulado), un mismo ISIN en dos activos (`duplicate_isin`), que la huella de cada presentación cubra exactamente las líneas que la preceden (`filing_fingerprint_lines`), y cada renuncia registrada (`filing_fingerprint_waived`, aviso **permanente**: la huella de esa presentación nunca se verificó, con su motivo y el día en que el usuario lo aceptó; no caduca y no desaparece, ADR-0025). Los eventos que la proyección no admite salen con su propio código, entre ellos `waiver_filing_unknown` y `waiver_not_reversible` (§6.7) | Verificación trimestral |
| `deepCheck` | Sobre las líneas crudas (`atlas check --deep`): ids duplicados, huella que no coincide con los campos del evento (la huella cubre el tuple de negocio de §4, no `fee`: una comisión editada a mano no se detecta por huella), líneas no canónicas, campos que el tipo no define (`unknown_field`, solo en líneas de la versión actual), líneas de versiones antiguas (sugiere `compact`), proyección no reproducible, y la huella de una presentación que no se sostiene al releer el prefijo, con **dos códigos** porque llevan a acciones distintas: `filing_fingerprint_mismatch` cuando el prefijo no da el resumen sellado (editado a mano: se recupera la copia anterior a la edición) y `filing_fingerprint_unreadable` cuando no se puede leer en la versión de esquema que la huella declara, que se nombra en el mensaje (no es una edición y no hay copia que restaurar; la salida es `compact --accept-unverified`, §5). El caso `lines` lo dice `integrity` | Verificación trimestral |
| `snapshotOf` | Instantánea canónica de todas las proyecciones (claves ordenadas, decimales como texto). De cada presentación lleva su identidad, su cadena, lo declarado y lo calculado, y de la huella **solo `lines`, nunca el resumen**: `compact` vuelve a sellar las huellas sobre el prefijo reescrito, y una instantánea que llevara el resumen haría abortar a `compact` por un cambio del propio `compact` | *Golden files*, `compact`, `check --deep` |

**El motor fiscal no es una proyección** (feature 009). `taxYear(events, año, { today })` recorre el estado ya proyectado y su diario de lotes y devuelve el informe del ejercicio: transmisiones por categoría de renta, rendimientos del capital mobiliario, la regla de recompra calculada (§8.4), la integración y compensación del art. 49, los saldos negativos pendientes por ejercicio de origen y categoría con su caducidad, la base del ahorro, las retenciones, la deducción por doble imposición, los criterios **dudosos** y los **firmes** con el dinero que movería su lectura contraria, la comparación con lo presentado y sus cuatro causas, la diferencia con lo que dio por pendiente **cada** Renta en la que la cadena se ancló —`anchors`, una entrada por ejercicio sustituido, de la más antigua a la más reciente, y lista vacía si no hubo ninguna (feature 011; antes solo quedaba la última)— y lo que el motor declara no calcular. Dos negativas explícitas:

- **Un libro con eventos inválidos no da cifras.** Las consultas de solo lectura siguen proyectando en modo degradado (ADR-0015), pero una base calculada saltándose un evento sería aproximada, así que la respuesta es el error `tax_ledger_invalid` con la lista de lo que hay que reparar, no un número.
- **Un ejercicio anterior a 2018 tampoco.** El régimen de compensación vigente (el 25 %, art. 49) empieza ahí; antes hubo un transitorio del 10-15-20 %. Es `tax_year_unsupported`, y lo lanza también cuando el ejercicio pedido es válido pero el libro tiene cifras anteriores a 2018.

Esa negativa es de la **lectura principal**. Las **lecturas alternativas** del informe —la configuración de otro criterio, la configuración anterior y la de lo presentado— usan otra configuración, y un `fiscal_date_rule` distinto puede llevar una operación a un ejercicio anterior a 2018. Hasta la feature 011 eso lanzaba y se llevaba el informe entero de un ejercicio soportado y calculable; ahora cada una **degrada y lo dice**: el criterio sale como `not_quantifiable` con el motivo `unsupported_under_alternative`, la diferencia con la configuración anterior lleva `unsupported_before` y ninguna cifra previa, y la comparación con lo presentado no reparte la diferencia en sus causas. `movedTaxYears` ya tenía esa guardia.

La salida fiscal se compone sobre ese informe, y ninguna de sus piezas vuelve a calcular una cifra (feature 010): `taxBoxes` la ordena por casillas del Modelo 100 del ejercicio (§5.11 de `business-rules.md`), `informativeReturn` —con `model720` y `model721`— resuelve los modelos informativos, `filingProposal` propone lo que se va a presentar para que nadie teclee doce cifras, `filingComparison` enfrenta lo presentado con lo calculado y reparte la diferencia en sus cuatro causas, y `fiscalAttention` dice si hay algo que hacer y si es temporada. Todo ello cuelga de un punto de entrada propio del dominio, `@atlas/domain/fiscal`, para que no entre en el arranque de la web.

`movedTaxYears(events, actual, siguiente, año)` compara cada ejercicio pasado con la configuración en vigor y con la propuesta, y no solo la base del ahorro: las **tres** cifras que fija una Renta —base, pendientes y diferido al cierre—, porque un ejercicio puede conservar la base y aun así mover los siguientes. Es lo que permite que `atlas settings set` avise de que un cambio de configuración mueve un ejercicio pasado aunque no mueva ninguna ganancia realizada.

**Un ejercicio con presentación vigente está cerrado** para ese modelo (ADR-0020). Escribir en él —registrar, corregir o anular— **no se rechaza**: hacerlo tarde puede ser legítimo y a veces obligatorio. Lo que no se admite es hacerlo en silencio, así que `closedYearImpact(antes, después, hoy)` avisa en los dos casos: cuando lo que se registra cae **por fecha** dentro de un ejercicio cerrado, y cuando **mueve una cifra declarada** aunque su fecha sea de otro año —una recompra de enero difiere una pérdida de diciembre y cambia la base de un ejercicio ya presentado; la regla por fecha sola no diría nada—. Compara las cifras que fija una Renta: la base del ahorro, cada saldo pendiente por ejercicio de origen y categoría, y el diferido al cierre. `previewEvent` y `previewCorrection` lo devuelven junto con los ejercicios pasados que tienen cifras y ninguna presentación registrada, y las dos interfaces lo enseñan antes de confirmar.

El resultado de cada ejercicio cerrado tiene **tres desenlaces**, en una unión cerrada (`comparison`, feature 011): `compared` con lo que se mueve —lista vacía si nada se mueve—, o `not_compared` con su motivo, porque llevan a acciones distintas: `invalid_reading`, alguna de las dos lecturas tiene eventos inválidos y no se compara, porque una comparación aproximada sobre un libro roto sería peor que ninguna (ADR-0015), y se repara el libro; `chain_unsupported`, una de las dos lecturas tendría que empezar antes de 2018, y no tiene reparación; y `by_design`, un 720 o un 721, cuyas cifras son valores de mercado que la cadena de la Renta no compara. **No haber podido comparar es motivo de aviso**: antes de la feature 011, una lectura inválida con un cambio fechado fuera del ejercicio presentado no avisaba de nada, y las interfaces leían la lista vacía como «no mueve ninguna cifra declarada».

**Un 720 o un 721 solo se avisa cuando la escritura puede alcanzarlo**: cuando lo que se registra —o lo que anula una anulación— tiene una fecha de negocio **anterior o igual al 31/12** de ese ejercicio, o cuando un cambio de configuración cambia `fiscal_date_rule`, que es lo único sin fecha de negocio que puede mover operaciones de un lado a otro del 31/12. El seguimiento (órdenes y traspasos solicitados) no alcanza ninguna fecha. La configuración que se compara es la **en vigor** de cada lado —la última que nada anuló—, así que anular un cambio de la regla también avisa.

## 8. FIFO y reglas fiscales aplicadas

### 8.1 Algoritmo FIFO (ADR-0009)

Para cada `asset_id`, los lotes abiertos se ordenan por (`acquisition_date`, posición en el fichero del evento origen). Si el evento origen es una corrección, la posición es la de **la raíz de su cadena** (§6.3): el lote corregido no salta detrás de los demás lotes de su fecha, y una venta consume el mismo lote que antes de la corrección. Una transmisión de cantidad `q` consume lotes en ese orden, partiendo el último si hace falta. La cuenta donde ocurre la transmisión no influye en qué lotes se consumen; sí influye en `physicalPositions`. Las transmisiones se aplican en orden cronológico (§7.1), de modo que una compra registrada tarde con fecha anterior sí es consumida por una venta posterior en fecha aunque anterior en registro.

Coste de adquisición de un lote: `((amount ?? quantity × unit_price) + fee) / fx_rate`, en EUR, exacto. Valor de transmisión: `((amount ?? quantity × unit_price) − fee) / fx_rate`. Fechas: `acquisition_date` y la fecha de transmisión son la `fiscal_date` de cada evento (ADR-0013). Ganancia por lote consumido = valor de transmisión proporcional − coste del lote proporcional. Se suma por operación y se redondea a céntimos una vez (ADR-0005).

### 8.2 Lotes procedentes de traspaso

Conservan `acquisition_date` y coste total heredados. Un traspaso parcial consume lotes origen en FIFO. `source_lot_id` enlaza cada lote destino con su origen para trazabilidad.

### 8.3 Valores homogéneos tras un canje

Tras un `convert` (fusión, cambio de clase…), los lotes pasan al activo nuevo con su fecha y coste, y el FIFO continúa dentro del activo nuevo.

### 8.4 Regla de recompra con pérdidas ("dos meses" / "un año")

Para cada transmisión con pérdida de un activo —**tanto una venta ordinaria como una venta forzosa** de acción corporativa (liquidación de un fondo, pico en efectivo de un contrasplit, pata en dinero de una fusión): se dice con nombre propio porque el código lo hacía mal precisamente por no estar dicho— se buscan adquisiciones del mismo `asset_id` en `[fiscal_date − W, fiscal_date + W]`, **ambos extremos incluidos y también el propio día de la venta** (el día cero pertenece a los dos lados de la ventana; para no avisar dos veces, manda la posición en el fichero: una compra anterior es `wash_sale_window_prior_buy` y una posterior, `wash_sale_window_repurchase`), con la ventana `W = Settings.wash_sale_window[asset.type]`, expresada como `"2m"`, `"1y"` o `"<n>d"` y contada **de fecha a fecha** en meses o años naturales, no en días (por defecto `"2m"` para `stock`, `etf`, `etc`, `etp` y **`fund` y `money_market`** —los dos últimos corregidos el 2026-09-22, criterio #2—; `"1y"` solo para `crypto`; ADR-0013 y pregunta fiscal #14, *verificar*). La forma antigua `wash_sale_window_days` (entero de días) se sigue aceptando al cargar y equivale a `"<n>d"`. Cuentan como adquisición `buy`, `grant` con coste y —salvo que `Settings.wash_sale_transfer_counts` diga lo contrario— un `transfer` **entrante**, que es una adquisición de valores homogéneos aunque no tribute en origen (`docs/fiscal-questions.md` #2b). **No** cuentan `scale` (acciones liberadas) ni `grant` con coste cero: no hay desembolso. La pérdida se difiere en la proporción `min(cantidad recomprada, cantidad vendida) / cantidad vendida`, se asocia a los lotes recomprados (los más cercanos en fecha primero; a igual distancia, el orden de la segunda pasada de §7.1) y se libera, como pérdida computable, en el ejercicio en que esos lotes se transmitan. El diferimiento **viaja con el lote**: si un lote recomprado se consume por `transfer`, `convert` o `carve_out` (reparto por `cost_share`) antes de liberarse, pasa a sus lotes descendientes (`source_lot_id`) y se libera cuando **estos** se transmiten (pregunta fiscal #15, *verificar*).

**Quién avisa y quién calcula** (feature 009). La proyección solo **avisa**, en las dos direcciones de la ventana; quien cuantifica la pérdida diferida, la reparte entre los lotes recomprados, la hace viajar y la libera es el motor fiscal (`taxYear`, §7), que recorre el diario de lotes después de la proyección. **No hay un segundo FIFO**: qué lotes consumió cada venta no se vuelve a decidir, se lee.

#### Las cuatro reglas finas: criterios #18 a #21

Lo anterior deja abiertas cuatro cosas que el motor no puede dejar de decidir. Las fijó la dirección el 2026-09-18 y están numeradas en `docs/fiscal-questions.md`:

- **#18 — solo cuenta lo que sigue en el patrimonio.** Una adquisición de la ventana difiere únicamente por las unidades que **siguen en cartera** tras la transmisión con pérdida: ni las que esa misma venta consumió por FIFO ni las ya transmitidas. Sin lote portador, el diferimiento no tendría dónde viajar ni cuándo liberarse (art. 33.5 *in fine*, «que permanezcan en el patrimonio»). Con aportación mensual y un reembolso total, esto es lo que evita diferir una pérdida que no tiene a qué agarrarse.
- **#19 — cada unidad recomprada difiere una sola vez.** Cada unidad adquirida difiere como mucho una unidad transmitida, y las transmisiones con pérdida se atienden en orden cronológico. Una recompra que llega cuando la pérdida ya está cubierta por adquisiciones anteriores **no difiere nada**, aunque su aviso haya salido.
- **#20 — la unidad es la operación, no el lote.** La regla mira el **resultado neto de la transmisión**: una venta que consume un lote con ganancia y otro con pérdida se juzga por su saldo, igual que el redondeo del #6.
- **#21 — lo liberado vuelve a pasar por la regla.** Lo que una transmisión libera se suma a su propio resultado y la regla se aplica al total: si con la pérdida liberada la transmisión pierde y hay una adquisición en su ventana, se vuelve a diferir.

#### Un split entre la pérdida y la recompra no excluye la recompra

El diario de lotes (§7) guarda en cada `scale` la **razón exacta** del evento (`"2"`, `"1/4"`), y deja una entrada `units` cuando se registra un split de un activo que nadie tenía —admitido solo si el evento no tiene más efectos que `scale`—. Con la razón siempre escrita, el motor convierte lo comprado después a las unidades de la venta: 20 títulos tras un 2:1 son 10 de los de antes. Una división que no sale exacta se redondea a diez decimales, como cualquier reparto (ADR-0005). Lo asignado y lo usado por el #19 se guardan en las unidades de la propia compra; en el informe, lo diferido va en unidades de la venta y cada adquisición en las suyas.

#### Provisionalidad

Si el último día de la ventana **posterior** es igual o mayor que la fecha de la consulta, la transmisión sale marcada como **provisional** hasta esa fecha: una compra registrada ese mismo día todavía difiere, y decirlo computable sería adelantarse.

#### Los dos avisos y sus detalles

Los dos salen en `atlas check` y en la previsualización de `atlas add buy|sell`, y los dos dicen que la pérdida **puede** no ser computable y remiten a `atlas tax <año>` para la cifra: cuánto difiere cada adquisición solo lo sabe el motor (#19).

| Aviso | Cuándo | Detalles |
|---|---|---|
| `wash_sale_window_repurchase` | Al registrar una adquisición dentro de la ventana de una transmisión con pérdida anterior | `asset_id`, `buy_date`, `buy_quantity` (**lo comprado**), `sale_event_id`, `sale_date`, `loss_eur`, `tax_year` (el de la venta), `window_end`, `window` |
| `wash_sale_window_prior_buy` | Al registrar una transmisión con pérdida que tiene adquisiciones en la ventana anterior | `asset_id`, `sale_date`, `buy_event_id`, `buy_date`, `held_quantity` (**lo que de esa compra sigue en cartera**, en las unidades de hoy), `loss_eur`, `tax_year`, `window_start`, `window` |

El aviso de compra previa nombra **solo** las compras que la venta deja en cartera (#18) y dice cuánto de ellas queda, sumando sus lotes abiertos: lo comprado no es lo que queda tras un contrasplit ni tras una venta que consumió parte. Una compra anotada una vez por cuenta (un `grant` con coste en dos cuentas) se nombra una sola vez. Que una misma clave signifique «lo comprado» en un aviso y «lo que queda» en el otro sería una trampa, y por eso se llaman distinto.

### 8.5 Transformaciones por evento corporativo

Tabla de composición admitida por `kind` (el evento se rechaza si sus `effects` no encajan) y ejemplo numérico sobre un lote de **10 títulos, coste total 1.000 €, adquirido el 2027-01-10**. *Criterios fiscales: verificar con asesor.*

| `kind` | `effects` admitidos | Ejemplo | Resultado |
|---|---|---|---|
| `split` | `scale` | 4:1 → `scale(4)` | 40 títulos, coste 1.000 €, fecha 2027-01-10. Sin hecho imponible |
| `reverse_split` | `scale` + `forced_sale?` | 1:4 con 10 títulos → `scale(0.25)` deja 2,5; `forced_sale(0.5 @ 400 €)` | 2 títulos, coste 800 €; la fracción vendida: transmisión 200 € − coste 200 € = 0 € (hecho imponible aunque sea cero) |
| `stock_dividend` | `scale` **o** `grant` + `forced_sale?` | 1 nueva por cada 10 → `scale(1.1)` | 11 títulos, coste 1.000 € repartido (90,91 €/título), fecha original. Sin hecho imponible (acciones liberadas). Si en vez de acciones se venden los derechos: `grant(rights, coste 0)` + `forced_sale`: ganancia = importe cobrado |
| `merger` | `convert` + `forced_sale?` (antes del `convert`, sobre el activo antiguo: componente en efectivo; o después, sobre el nuevo: picos) | 1 nueva por 2 antiguas → `convert(NEW, 0.5)` | 5 títulos de NEW, coste 1.000 €, fecha 2027-01-10. El componente en efectivo, si lo hay, tributa vía `forced_sale` |
| `spin_off` | `carve_out` + `forced_sale?` (sobre la escindida, para los picos) | 1 nueva por 4 antiguas, 20% del coste → `carve_out(SPIN, 0.25, 0.20)` | 10 títulos OLD coste 800 € + 2,5 títulos SPIN coste 200 €, ambos fecha 2027-01-10. `cost_share` sale de la proporción publicada por el emisor o de los valores de mercado del primer día (*verificar*) |
| `fund_merger` | `convert` | ratio = NAV_old / NAV_new = 1,7 → `convert(FUND_B, 1.7)` | 17 participaciones de B, coste 1.000 €, fecha original. Sin hecho imponible |
| `share_class_change` | `convert` | igual que `fund_merger` | Activo nuevo (otra clase, otro TER); lotes heredados |
| `fund_liquidation` | `forced_sale(all)` | NAV de liquidación 120 € → `forced_sale(all @ 120)` | Transmisión 1.200 € − coste 1.000 € = ganancia 200 €. Hecho imponible |
| `issuer_liquidation` | `forced_sale(all)` | Disolución con 0 € → `forced_sale(all @ 0)` | Pérdida 1.000 €, computable cuando la sociedad se disuelve (*verificar*; una mera exclusión de cotización no basta) |
| `delisting` | ninguno | — | Solo marca: `asset_updated` con `active=false`; la posición sigue sin precio (fallo seguro) |
| `crypto_fork` | `grant` | 10 unidades nuevas → `grant(FORK, 10, coste 0, fecha del fork)` | Lote de 10 con coste 0 €; al vender tributa todo (ADR: criterio conservador) |
| `token_migration` | `convert` | 1:100 → `convert(NEWTOKEN, 100)` | 1.000 unidades, coste 1.000 €, fecha original |
| `issuer_restructuring` | `convert` y/o `forced_sale` | según el folleto | Se compone como fusión o liquidación |

`identifier_change` y `cash_dividend` no son `corporate_action` (ver ADR-0011).


> **Picos y posición previa (verificado en la revisión de la 007, 2026-09-18).** Cuando un contrasplit, una fusión o una
> escisión dejan una posición fraccionada, el `forced_sale` de picos barre **la fracción de la posición resultante**, que
> incluye la fracción que la cuenta **ya tenía** del activo destino antes del evento. Es el comportamiento correcto —el
> intermediario liquida la fracción de lo que queda, no solo la que creó el evento— pero no estaba escrito en ninguna
> parte, y decide cuánta ganancia se realiza. Queda dicho aquí para que nadie lo "arregle" dentro de cinco años.

### 8.6 Previsiones de la Fase 5 (ADR-0021)

Nueve campos decididos el 2026-09-18. **Ocho están implementados** (feature 008, PR #51); el noveno —el evento `swap`— también, de modo que la tabla queda como registro de por qué existe cada uno. La previsión 9 se amplió a `valuation` (Q3 de la 008): el Modelo 720 convierte la cotización de 31/12 al tipo del BCE de ese día, así que una valoración en divisa sin la fecha de su tipo es el dato que ADR-0013 prohíbe perder.

> **La puerta de ADR-0018 quedó cerrada con esta feature.** Desde la PR #51, cualquier endurecimiento del esquema exige `schema_version = 2` y migración: el libro real puede tener datos dentro a partir de ahora.

Contexto original: Existen porque la revisión adversarial de `docs/fiscal-questions.md` dejó seis criterios **en disputa** y el libro no guarda lo necesario para aplicar ninguna de las dos lecturas. **Ninguno decide una pregunta fiscal**: cada uno permite responderla en cualquier sentido, y los valores por defecto dejan el comportamiento actual intacto.

| Campo | Dónde | Forma | Por defecto |
|---|---|---|---|
| `income_category` | `Settings` | `Record<AssetType, "capital_gain" \| "movable_capital">` | `movable_capital` en `etc` y `etp`, `capital_gain` en el resto (criterio **#24**, feature 010; antes `capital_gain` en todos) |
| `market` | `asset_created` | Código MIC o nombre del mercado, opcional | ausente |
| `issuer_country` | `asset_created` | ISO 3166-1 alfa-2, opcional | ausente |
| `fee_kind` | `standalone_fee` | `custody \| administration \| connectivity \| discretionary_management \| other`, opcional | `other` |
| `withholding` | `forced_sale` | `DecimalString`, opcional; misma forma que en `sell` | ausente |
| `income_eur`, `income_base` | `grant` | Importe y `general \| savings`, opcionales | ausentes |
| *(tipo nuevo)* `swap` | — | Permuta de un activo por otro, con la valoración del art. 37.1.h: **el mayor** entre el valor de mercado de lo entregado y de lo recibido | — |
| `neutrality_regime` | `corporate_action` | `boolean`, opcional | ausente |
| `fx_rate_date` | `cash_deposit`, `cash_withdrawal`, `standalone_fee` | **Pasa de opcional a obligatorio** | — |

**El calendario lo manda la última.** Hacer obligatorio `fx_rate_date` es un **endurecimiento**, y ADR-0018 solo lo permite dentro de la v1 **mientras el libro real esté vacío**: el cargador juzga las líneas viejas con las reglas de hoy, así que endurecer con datos dentro deja el libro entero ilegible. Por tanto las nueve se implementan **antes de que se registre la primera operación real**. Pasado ese punto exigen `schema_version = 2` y migración.

Las ocho primeras son **compatibles** en el sentido de ADR-0018 (campos opcionales y un tipo de evento nuevo) y no urgen por sí solas; van juntas porque se consumen a la vez.

**Quién los consume, desde la feature 009.** Dejaron de ser previsiones: el motor fiscal los lee, y ninguno cambió de forma ni de valor por defecto al hacerlo.

| Campo | Qué hace con él el motor fiscal |
|---|---|
| `income_category` | Decide si una transmisión entra en las ganancias y pérdidas patrimoniales (art. 33) o en los rendimientos del capital mobiliario (art. 25.2), que compensan distinto |
| `market` | Se enseña, sin clasificar, en cada pérdida de un valor cotizado que declara el criterio #2 en disputa: el sistema no sabe qué mercados son de la UE |
| `issuer_country` | Todavía no lo lee nadie |
| `fee_kind` | Las comisiones sueltas marcadas `custody` o `administration` se deducen del rendimiento íntegro del capital mobiliario (art. 26.1.a, criterio #23); el resto, no |
| `withholding` de `forced_sale` | Suma a las retenciones a cuenta del ejercicio, como la de un `sell` |
| `income_eur`, `income_base` | No se integran (criterio #8 vigente): salen en los criterios dudosos, con `income_eur` como exposición y la base que dice el evento |
| `swap` | Transmisión más adquisición, valorada por el art. 37.1.h; la comisión resta de lo transmitido (criterio #17) |
| `neutrality_regime` | No decide nada; un `convert` sin régimen escrito sale en los dudosos (#7 y #13) y un régimen que contradice lo registrado sale como nota |
| `fx_rate_date` | Convierte cada operación a su fecha fiscal, sin la cual nada de lo anterior es reproducible |
