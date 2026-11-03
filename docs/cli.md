# Uso de la CLI

Guía de la consola `atlas`: la herramienta de mantenimiento (alta y corrección de datos, `check`, copias, exportación y administración de la nube). La aplicación principal es la web, y la consola **no tiene acceso propio a la API** (ADR-0037): trabaja sobre una carpeta local y llega a la nube solo con el rol de administración; las vistas de cartera, cubo y patrimonio ya no están en la consola. Para arrancar el proyecto en local, véase el [`README`](../README.md); el contrato de la API de la web está en [`api.md`](api.md).

Tras `npm run build`, el ejecutable es `node apps/cli/dist/main.js` (o `npm run atlas --`). Todos los comandos aceptan `--ledger <ruta>` (por defecto `./ledger.jsonl`), `--yes` (omite la confirmación), `--confirm-duplicate` y `--json`. En `add`, `edit`, `delete`, `ca`, `settings set` y `fx correct` (y los comandos que registran con la misma confirmación), `--json` deja en stdout un único objeto (`{"status": "recorded"|"cancelled"|"nothing_to_correct", …}`) y lo que se lee antes del sí, preguntas incluidas, va a stderr; un error (código de salida distinto de 0, como un tipo del BCE aún sin publicar) deja como único objeto `{"status": "error", "code": …, "exit_code": …, "message": …}` y la frase, como sin `--json`, también en stderr; una orden que ya imprimió su propio resultado (p. ej. `prices update` con una fuente caída) conserva ese objeto y no añade otro. `lock break` y `export --out` responden también con un solo objeto. Las consultas sobre el libro (`positions`, `lots`, `settings show`, `thesis show`, `order list`, `transfer pending`) dejan `{"invalid_count": n, "data": …}`, donde `invalid_count` son las líneas que no se han podido leer (modo degradado); `tax`, `m720`, `m721`, `check` y los estados de `fx`, `prices` y `lock` dejan directamente su propio objeto. Importes, cantidades y tipos salen siempre como cadenas. Ejemplo completo con datos inventados:

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
atlas positions          # posición física por cuenta y activo, a hoy (--date AAAA-MM-DD para otra fecha)
atlas lots               # lotes fiscales (FIFO global por activo), con fecha y coste en EUR
atlas tax 2028           # la base imponible del ahorro del ejercicio (JSON)
atlas thesis show th_delta        # la ficha de una tesis: hipótesis, plazo, operaciones y resultado
atlas check              # integridad del libro (proyección)
atlas check --deep       # además, líneas crudas: ids duplicados, huellas manipuladas o ilegibles, líneas no canónicas o antiguas

# Rectificar (el libro nunca se edita: anulación + evento corregido)
atlas edit <id> --reason "precio mal tecleado" --unit-price 123.45
atlas delete <id> --reason "duplicado"

# Seguimiento de órdenes y traspasos en curso, y exportación
atlas order place --account acc_fund --asset ast_world --side buy --amount 500 --requested-date 2027-07-01 --yes
atlas transfer request --from-account acc_fund --from-asset ast_world --to-account acc_fund --to-asset ast_bonds --quantity-out 4 --requested-date 2027-03-01 --yes
atlas export --format csv --out ledger.csv
```

## El ciclo mensual (Fase 2)

Los precios se registran a mano como `valuation`, y desde la feature 013 la consola puede además descargar cierres diarios de EODHD (más abajo, «Precios de cierre diarios»). Para enseñar un valor gana el dato más reciente que tenga valor en euros, y la aplicación siempre muestra de cuándo es y de dónde viene. Ninguna cifra de la Renta los mira; la única ruta fiscal que lee un precio es la valoración a 31/12 de los Modelos 720 y 721, y solo la registrada a mano. El ciclo sigue sobre el libro del ejemplo anterior.

```bash
# 0. Una vez: el resto del núcleo, los pesos objetivo por activo (suman 100) y qué parte de la aportación va al cubo
atlas asset add --id ast_bonds --type fund --book core --asset-class fixed_income --name "Euro Bonds" --currency EUR --transferable --isin XX0000000002 --yes
atlas settings set --target-weights ast_world=60,ast_bonds=40 --bucket-pct-of-contribution 10 --yes

# 1. Anota el valor liquidativo del mes de cada activo del núcleo con posición
atlas add valuation --account acc_fund --asset ast_world --date 2027-12-31 \
  --quantity 10.123456 --unit-value 105.20 --currency EUR --fx-rate 1 --fx-rate-date 2027-12-31 --yes

# 2. En la web (Cartera) mira los pesos y calcula el reparto de la aportación del mes
#    (aquí, 100 EUR al cubo, 786 a ast_bonds y 114 a ast_world)

# 3. Da las órdenes A MANO en la plataforma y regístralas
atlas order place --account acc_fund --asset ast_bonds --side buy --amount 786 \
  --requested-date 2028-01-03 --yes
atlas add buy --account acc_fund --asset ast_bonds --order <order_id> \
  --trade-date 2028-01-03 --value-date 2028-01-05 --quantity 7.86 --amount 786 \
  --currency EUR --fx-rate 1 --fx-rate-date 2028-01-03 --fee 0 --yes
```

El reparto de la aportación, el rebalanceo y el simulador de traspasos viven en la web (Cartera): proponen y nunca escriben, porque la aplicación no ejecuta órdenes ni elige valores del cubo.

## Precios de cierre diarios (feature 013)

La consola descarga los cierres diarios de los activos **de su libro** desde EODHD, una API gratuita con clave, y los guarda junto al libro en `prices/`, nunca en el libro. Son **informativos**: ninguna cifra de la Renta ni del Modelo 720 los lee. Sin claves, todo funciona igual con las valoraciones manuales. La web no descarga nada: en el escritorio lee `prices/` de la carpeta enlazada, y en el móvil, hasta que exista la nube, solo hay la importación a mano desde Ajustes. Al importar a mano, conviene incluir `prices/symbols.json` junto a los ficheros de precios: sin él, la web no puede comprobar la divisa de los cierres, y lo avisa.

```bash
# Las claves van fuera de la carpeta del libro, solo legibles por ti; la aplicación nunca las escribe
mkdir -p ~/.config/atlas && printf '{"eodhd":"…"}\n' > ~/.config/atlas/secrets.json && chmod 600 ~/.config/atlas/secrets.json

atlas prices symbols set ast_world --currency EUR --eodhd XX0000000001.EUFUND   # el símbolo y la divisa de la cotización, contrastada con la fuente
atlas prices symbols set ast_tsco --eodhd TSCO.LSE --currency GBX   # Londres cotiza en peniques (GBX), no en libras: la divisa se declara
atlas prices update      # los cierres de días anteriores a hoy, por prioridad (cubo, referencias, núcleo) y dentro del cupo
atlas prices status      # cada fuente con su cupo de hoy y sus fallos, y la antigüedad del último cierre de cada activo
atlas prices purge ast_tsco   # borra los cierres guardados en una divisa que no es la que ahora declara; la próxima descarga vuelve a pedir esos días una vez, y los que la fuente no sirva quedan como hueco (lo dice «prices status»)
```

En la nube, los cierres los descarga cada día la tarea de precios con la correspondencia de `prices/symbols.json` **del bucket**, que solo sube `atlas admin prices push --env <entorno>` (con el rol de administración; procedimiento en [`docs/runbooks/cloud-symbols-and-budgets.md`](runbooks/cloud-symbols-and-budgets.md)).

Para enseñar un valor gana el precio más reciente **que tenga valor en euros**, y con la misma fecha el manual. Si hay una cotización más nueva sin valor en euros, se enseña a su lado.

## El cubo especulativo (Fase 3)

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

# 3. La ficha de la tesis (el cubo entero está en la web)
atlas thesis show th_delta --date 2028-12-31
```

El cubo entero (posiciones con su condición de invalidación a la vista, tesis frente al índice, estadísticas, comisiones sobre el capital operado y avisos de las reglas 17 y 18) y el patrimonio total, siempre desglosado, se ven en la web (Cubo y Resumen). Todo avisa y nada bloquea: el libro nunca rechaza un hecho que ya ocurrió.

Y al registrar una compra o una venta con pérdida, la aplicación avisa si cae dentro de la **ventana de recompra** (por defecto dos meses para cotizados; para fondos y monetarios, dos meses si están admitidos —españoles o con su clase en un mercado regulado— y un año si no; un año para cripto, contados de fecha a fecha y configurables por tipo de activo): es el error fiscal más común en operativa activa. Avisa en las dos direcciones y **antes** de confirmar, y el motor fiscal **calcula el diferimiento**: la pérdida queda asociada a los lotes recomprados, viaja con ellos si se traspasan o se canjean, y se libera cuando se transmiten.

## La Renta (Fase 5)

La lectura de la Renta (la base del ahorro, las casillas del Modelo 100, el 720 y el 721) es de la web (`/fiscal`). La consola conserva los informes en JSON (`tax`, `m720`, `m721`), para revisar una cifra sin la web, y el registro de lo presentado.

```bash
atlas tax 2028            # el informe entero en JSON, con los importes como cadenas y, en cada operación, los lotes que consumió y su linaje
atlas tax 2025 --boxes    # la misma base ordenada por casillas del Modelo 100, en JSON
atlas m720 2027           # obligación, saldos a 31/12 y media del 4T de bienes en el extranjero (JSON)
atlas m721 2027           # lo mismo para las criptomonedas en tenencia directa (JSON)
atlas filed renta 2027 --receipt 100-2027-… --set base=1950.00   # registra lo presentado
```

**`atlas filed <renta|720|721> <año>`** registra lo que de verdad se presentó. Propone lo que la aplicación calcula —nadie quiere teclear doce cifras— y `--set <clave>=<importe>`, repetible, sustituye cualquiera de ellas por lo declarado. **Lo presentado es un hecho, no un cálculo** (ADR-0020): el libro guarda lo declarado aunque hoy se calcule otra cosa, y guarda al lado lo que la aplicación calculaba ese día y la configuración con que lo hizo, para poder distinguir después un cambio del motor de un cambio del libro. Una complementaria es otra presentación que **sustituye** a la anterior, nunca una anulación: si ya consta una del mismo modelo y ejercicio, se toma esa, y `--supersedes <id>` sirve para nombrar otra a mano.

`atlas tax <año>` calcula la **base, no la cuota**: no aplica tramos, no resta el mínimo personal y no dice lo que se paga. Es un **total fiscal** —núcleo y cubo agregados por contribuyente, la excepción de la constitución III—.

Ninguna cifra fiscal mira un precio: la declaración sale del libro y solo del libro. Cada línea dice de qué **criterios fiscales** depende (los de `docs/fiscal-questions.md`), y los dudosos van marcados con un asterisco y explicados en la leyenda del final.

Dos cosas que el comando se niega a hacer:

- **Dar cifras sobre un libro con eventos inválidos.** Una base calculada saltándose un evento sería aproximada, así que la respuesta es la lista de lo que hay que reparar y una remisión a `atlas check`.
- **Calcular un ejercicio anterior a 2018**, cuando empieza el régimen de compensación vigente. Tampoco calcula ninguno si el libro tiene cifras anteriores a esa fecha.

**En la web, todo esto vive en `/fiscal`**, a la que se llega desde una tarjeta del Resumen y desde Ajustes —no hay un sexto destino en la barra—: el selector de ejercicio, la base del ahorro como cifra protagonista con su desglose operación a operación, los criterios dudosos y los firmes con su dirección en palabras, las pérdidas pendientes, las casillas, el estado del 720 y del 721, y lo presentado frente a lo calculado. Registrar una presentación se hace desde ahí (`/fiscal/presentar/<modelo>/<año>`), con el formulario precargado con lo calculado y enmascarado hasta que un campo recibe el foco. **En campaña de la Renta, o cuando haya algo del 720 que hacer, la tarjeta del Resumen sube arriba del todo**; el resto del año va discreta, al final.

Y un aviso que llega antes: `atlas settings set` compara la base del ahorro de los ejercicios ya cerrados con la configuración en vigor y con la propuesta, y dice cuáles se mueven. Cambiar la ventana de recompra o la categoría de renta mueve una declaración pasada sin mover ni una ganancia realizada.

## Tipos del BCE, cerrojo y administración de la nube

Cuatro grupos de comandos que el ciclo normal no necesita a diario. La lista completa y vigente es `atlas --help` (`apps/cli/src/usage.ts`); aquí, una línea por comando.

- `atlas fx update|status`: descarga el histórico oficial del BCE junto al libro y dice cuál está en vigor. `atlas fx correct [--reason …]` corrige los tipos que no son los de su fecha fiscal, tras cambiar `fiscal_date_rule`.
- Una operación cuyo tipo del BCE aún no se ha publicado no se registra en la consola (`ecb_rate_pending`): se repite cuando se publique, hacia las 16:00 CET, o se teclea el tipo con `--fx-rate` y `--fx-rate-date`. Los borradores solo existen en la web ([ADR-0029](adr/0029-ecb-reference-rates.md), nota del 2026-11-03).
- `atlas rehearse --dump <fichero>`: ensayo de restauración en local. Decodifica el volcado (una copia de `atlas backup` o descargada), lo proyecta y lo compara con el libro cortado en los mismos eventos, con la misma función que la prueba trimestral (`restoreRehearsal`, ADR-0032). Solo lee y nunca toca la nube: compara con un libro local (`--ledger`), el de la carpeta o una copia bajada con `atlas backup`; sobre un libro sintético es un simulacro. Un volcado vacío o ilegible se rechaza. Sale con 1 y dice por código y recuento qué difiere.
- `atlas lock show|break`: quién tiene el cerrojo de la carpeta del libro, y romperlo a petición.
- `atlas admin pull|compact|restore|prices push|secrets --env <entorno>`: la administración de la nube, **nunca por la API**, con credenciales cortas del rol de administración y MFA ([`runbooks/restore-the-ledger.md`](runbooks/restore-the-ledger.md), «Lo que necesitas»). Las que reescriben la nube se confirman escribiendo el nombre del entorno, nunca con `--yes`.
  - `pull --to <dir>` baja el libro de la nube a `<dir>/ledger.jsonl` (`0600`; nunca encima de un fichero: `path_exists`), para consultarlo y pasar `atlas --ledger <dir>/ledger.jsonl check --deep`. Las correcciones se hacen en la web, o con `restore`.
  - `restore --from <copia>` vuelve a una copia buena; **con la nube vacía es la subida inicial**, que escribe el libro tal cual.
  - `compact` compacta el libro de la nube; `prices push` sube `prices/symbols.json` ([`runbooks/cloud-symbols-and-budgets.md`](runbooks/cloud-symbols-and-budgets.md)); `secrets` crea y rota los secretos ([`runbooks/atlas-admin-secrets.md`](runbooks/atlas-admin-secrets.md)).

## Copia de seguridad provisional (Fases 1-3)

Mientras el libro real viva en un fichero local, haz una copia verificada tras cada sesión de registro y **siempre fuera del repositorio** (el repo es público):

```bash
atlas backup --to ~/personal/atlas/privado/backups
atlas backup --to ~/personal/atlas/privado/backups --from-bucket --env prod   # el libro de la nube, documents/ e imports/, con el rol de administración
```

Cada copia se escribe fechada, nunca encima de otra, `0400`, y se relee para verificarla (el libro, por SHA-256). Sin `--from-bucket`, copia el libro local de `--ledger` y su `documents/`.

`.gitignore` ignora `ledger*.jsonl`, `demo*.jsonl` y `backups/` en todo el árbol como red de seguridad, pero la regla es no escribir datos reales dentro del repositorio.

## Eventos corporativos y tesis

Un evento corporativo (`corporate_action`) lleva un `kind` para las personas y una lista de **cinco primitivas de lote** (`scale`, `convert`, `carve_out`, `forced_sale`, `grant`) que es lo único que el dominio ejecuta; una tabla por `kind` decide qué secuencias se admiten (`docs/data-schema.md` §8.5, ADR-0011). Los asistentes `atlas ca <kind>` construyen los efectos a partir de flags sencillos, muestran el evento y una tabla **antes/después** de lotes y posiciones, y escriben solo tras confirmar. `ratio` admite un decimal (`4`, `0.25`) o una fracción `nuevas/antiguas` (`1/4`, `4/3`) para que un contrasplit 1:3 quede exacto.

```bash
# Split 4:1 de una acción: cantidades ×4, coste y fecha de adquisición intactos, sin hecho imponible
atlas asset add --id ast_acme --type stock --book core --asset-class equity --name "ACME" --currency EUR --not-transferable --yes
atlas add buy --account acc_fund --asset ast_acme --trade-date 2027-01-10 --value-date 2027-01-12 --quantity 10 --unit-price 100 --currency EUR --fx-rate 1 --fx-rate-date 2027-01-10 --yes
atlas ca split --asset ast_acme --ratio 4 --effective-date 2027-03-01 --source-document https://acme.example/split.pdf --yes

# Contrasplit 1:4 con liquidación de picos cuenta a cuenta (los picos son un hecho imponible aunque la ganancia sea cero)
atlas ca reverse-split --asset ast_acme --ratio 1/4 --effective-date 2027-06-01 --source-document https://acme.example/reverse.pdf \
  --cash-per-share 400 --currency EUR --fx-rate 1 --fx-rate-date 2027-06-01 --fees acc_fund=1 --yes

# Otros asistentes: merger, spin-off, fund-merger, share-class-change, fund-liquidation, capital-return (devolución de prima o de aportaciones), delisting; raw para el resto
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
```

Códigos de salida: `0` OK · `1` error de validación o de proyección · `2` conflicto de escritura (repite) · `3` huella repetida sin `--confirm-duplicate` · `4` falta confirmación sin terminal (añade `--yes`) · `5` libro escrito por una versión más nueva · `64` uso incorrecto (una línea de error y la pista de `atlas --help`, no el uso entero).

## Datos sintéticos, compactación y copia de seguridad

Toda feature se prueba contra un **libro sintético** reproducible: `atlas synth` genera un libro de tres ejercicios con todos los tipos de evento y los casos raros (traspasos parciales encadenados, contrasplit con picos en dos cuentas, registro tardío, corrección de un ejercicio anterior, venta el 30/12 con liquidación el 02/01…), idéntico byte a byte para la misma semilla. La salida de la semilla 1 está congelada como *golden file* en `tests/fixtures/ledger/synthetic-v1.jsonl` junto con la instantánea de su proyección.

```bash
atlas synth --out demo.jsonl                 # semilla 1 (por defecto); rechaza si la ruta existe
atlas synth --out otra.jsonl --seed 42       # mismo esqueleto, otros importes, precios y fechas
atlas --ledger demo.jsonl check --deep       # verificación profunda sobre las líneas crudas
atlas --ledger demo.jsonl compact            # reescribe el libro a la versión actual del esquema…
                                             # …tras archivar el original tal cual en archive/ (no-op si no hay líneas antiguas)
atlas --ledger demo.jsonl backup --to /ruta/copias   # copia ledger-<fecha>.jsonl, releída y verificada por etag
```

`compact` es la única operación que reescribe el libro: guarda antes los bytes originales en `archive/ledger-<fecha>-v<n>.jsonl` (nunca sobrescribe un archivo), es no-op si todas las líneas están en la versión actual y aborta sin escribir si la proyección cambiaría, si hay eventos inválidos o si la huella de alguna declaración presentada no se puede verificar.

Como compactar es la única forma de migrar el libro a una versión de esquema nueva, una huella que no se puede verificar tiene una salida, que hay que pedir por su nombre, declaración a declaración: `atlas compact --accept-unverified <id>` (repetible). Antes de la pregunta se nombra a qué se renuncia; la renuncia se escribe en el libro **dentro de la misma compactación** (`filing_fingerprint_waived`, ADR-0025), no se puede anular, y `atlas check` la sigue diciendo siempre.
