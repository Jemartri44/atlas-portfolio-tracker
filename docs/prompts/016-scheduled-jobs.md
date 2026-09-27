# Prompt 016 — Feature `016-scheduled-jobs`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/016-scheduled-jobs.md`.
>
> **Requisito previo.** La feature 015 (API y acceso) **entera en `develop`**: E1 a E4 están fusionadas (PR #90, #95, #96 y #97); **E5 está en la PR #98**, abierta al escribir este prompt, con una revisión que no converge. **No empieces hasta que la PR #98 esté fusionada** y `git log origin/develop..origin/feature/015-api-access` salga vacío. E5 cambia cosas que esta feature usa: la puerta `@atlas/domain/tools` (que saca `deepCheck` del barril), las dos pasadas de la cobertura (`test:coverage:domain` y `test:others`), las órdenes `atlas admin` y el techo del arranque. Si al empezar no está fusionada, **para y dilo**. Decidido por la dirección ([§8.1 P1](#p1-resp)): la 016 empieza desde `develop` **después** de fusionar la PR #98.
>
> **Esta feature es la tercera y última de la etapa 2 de la Ronda 8: la nube escrita y probada, sin desplegar nada.** Ni cuenta de AWS, ni Terraform, ni una llamada a AWS real, a SES, al BCE o a una fuente de precios real desde un test, ni un céntimo. Construyes **las tareas programadas** que EventBridge Scheduler lanzará (`docs/specification.md` §9.5), **el correo** por SES (el puerto `Notifier` y su adaptador), **la descarga diaria del BCE y de los cierres de precios en la nube**, **el volcado mensual**, **la integridad y el ensayo de restauración trimestrales**, y lo que hace que **los dispositivos beban de la nube**: la consola deja de pedir los precios que ya bajó la nube y la web del móvil descarga de la API el histórico del BCE. Todo se prueba con **dobles** de S3, SSM, SES, del BCE y de las fuentes de precios. **Si este prompt y la hoja de ruta o una ADR discrepan, mandan la hoja de ruta y la ADR**, y la discrepancia va a `questions.md`.
>
> **Este prompt propone partirla en cuatro entregas**, una rama y una PR por entrega, como la 015 (§3, «La partición»). La dirección lo confirmó el 2026-09-27 ([§8.1 P2](#p2-resp)).
>
> **Las diecinueve preguntas de la primera redacción (§9, de la P1 a la P18, más la P6 bis) están contestadas** por la dirección el 2026-09-27: todas aceptadas tal como las recomendaba quien redacta, con cuatro precisiones (P1, P3, P6 y P8) y una decisión que llegó de la PR #98 sobre `--yes` (§5, familia 10). Las respuestas están en **§8.1**, cada una con su motivo, y el texto de §0 a §7 ya las aplica y las cita como «§8.1 Pn». **El alto del plan ya no espera a ninguna pregunta de §9.** **La ronda 1 de revisión de la PR #99** encontró dos bloqueantes y diez puntos más; las decisiones de la dirección están en **§8.2** (B1, B2, M1-M7, m1-m3), algunas **enmiendan** respuestas de §8.1 (P6 bis, P11, P14 y P18), y el texto ya las aplica. §8.3 es donde se responderán tus preguntas y se anotarán los errores de este prompt.
>
> **Novedad de método:** §5, **«Autocomprobación antes de abrir cada PR»**. Son las diez familias de defectos que las revisiones de la 015 encontraron una y otra vez. La pasas tú, entera, antes de pedir revisión, y dejas el resultado escrito.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/personal/atlas/atlas-portfolio-tracker`). **Eres un implementador nuevo**: no llevas contexto de la 015 y no se te pasa ninguno más que este documento y el repositorio (§2 quater). Vas a construir **lo que la nube hace sola**: las tareas que se despiertan cada día, cada semana, cada mes, cada trimestre y cada enero, hacen su trabajo sobre el bucket y, cuando hay algo que hacer, escriben un correo. **Nada de esto puede mandar un importe por correo sin que el usuario lo haya activado, gastar dos veces el cupo de una fuente, pisar un volcado que es para siempre, mover una cifra fiscal ni dejar un dato personal en un registro**, y lo primero que construyes, en cada entrega, son los tests que lo demuestran.

## 0. Siete cosas que tienes que entender antes de leer nada más

**Lo que sale por correo sale del perímetro.** Hasta hoy, una cifra de Atlas vive en el libro, en los dispositivos y en el bucket. Un correo la deja en el proveedor de correo del usuario para siempre. Por eso **los correos no llevan importes por defecto** (ADR-0028, fila 18): el interruptor que los activa vive en SSM, junto al destinatario, nunca en `Settings`. Es la misma regla que el modo privacidad de la web, que viene activado por defecto. **El test que lo demuestra renderiza el correo** con un libro sembrado de importes reconocibles y busca que no aparezca ninguno. Buscar una importación no basta (`docs/prompts/000-director-handoff.md` §7: una puerta sobre el grafo es necesaria y no suficiente).

**Una tarea programada se ejecuta más de una vez.** EventBridge Scheduler reintenta una invocación que falla, y Lambda reintenta la invocación asíncrona. Lo verificas con fuente en el bloque 0 de E1. Si una tarea no es idempotente, un reintento **manda el correo dos veces**, **gasta dos veces el cupo** de EODHD o **escribe dos volcados**. Cada tarea deja un registro de su ejecución por periodo, escrito de forma condicional, y **cada escritura en dos pasos tiene su test de corte entre los dos** (§5, familia 8).

**El bucket no tiene cerrojo.** En local, `reference/ecb/` y `prices/` se escriben bajo el cerrojo de la carpeta (ADR-0026, Parte B), y `PriceStore.transact` lee y escribe dentro de él. En S3 no hay cerrojo ni `rename`: solo escrituras condicionales **objeto a objeto** (`If-Match`, `If-None-Match: *`), verificadas en la 015 (`specs/015-api-access/questions.md` §23.1). Todo lo que en local era una transacción sobre varios ficheros es, en la nube, **una secuencia de escrituras condicionales**. Cada estado intermedio tiene que ser de fallo seguro y estar reconocido, como `sync/remote.json` y el marcador en la 015 (§7.1 bis, N4 de aquel prompt). **Un solo escritor por objeto** ([§8.1 P11](#p11-resp) y [P18](#p18-resp)).

**Una sola clave, un solo cupo** (ADR-0031, «Consecuencias»). Las claves de EODHD y de Alpha Vantage son las mismas en la consola y en la nube, y el cupo diario es uno: 20 y 25 llamadas. **Cuando la nube descarga, la consola deja de pedir lo que ya pidió la nube y lo baja de la API.** Si no, las dos se comen el mismo cupo y ninguna llega. **Nunca el día en curso**, un solo cierre en vigor por fecha, la cascada, la divisa declarada y contrastada: **las reglas de la 013 no cambian**, y la tarea de la nube **reutiliza el caso de uso** (`updatePrices`, `packages/domain/src/quotes/cascade.ts`). No lo reescribe.

**Ningún precio llega a la fiscalidad, tampoco por correo.** El aviso de los umbrales del 720 y el 721 sale de las valoraciones manuales, como el propio modelo: los guardianes de la 013 lo impiden por estructura, y siguen en verde. Un correo que dijera «tu 720 se acerca al umbral» calculado con cierres automáticos sería una cifra fiscal hecha con precios.

**Las tareas tocan todas las superficies a la vez**: el reloj, el calendario fiscal, SSM, S3, SES, las fuentes externas, la consola y la web. Por eso la feature se parte (§3), y por eso las revisiones se hacen **por zonas y con alcance acotado** (§2 quater).

**El paquete web tiene margen, pero es de todos.** La puerta `@atlas/domain/tools` de E5 de la 015 dejó unos 2 KB libres bajo la autorización del arranque (`specs/015-api-access/questions.md` §33.2), y la dirección los reservó también para las mejoras visuales aprobadas, que llegan después. **Lo que esta feature añade a la web va en carga diferida, y el arranque no sube** (§6, «El paquete web»; [§8.1 P13](#p13-resp)).

## 1. Lee antes de hacer nada, en este orden

1. **`CLAUDE.md` entero.** Te afectan de lleno: las *domain traps* **5** (ningún cálculo fiscal depende de precios) y **7** (el libro propio es la fuente de verdad); las tablas *Stack* (*Scheduling*, *Email*, *Secrets*) y *Security*; *Logging*, que dice qué no se registra nunca; *Environments*, con `dev` en reposo; y *Working on a feature*.
2. **`.specify/memory/constitution.md` 1.6.2**: **IV** (lo que es dato personal o secreto, y la configuración operativa que ninguna cifra lee, viven fuera del libro), **V** («los avisos se envían solo cuando hay algo que hacer; el recordatorio mensual siempre»), **VI** (pocas dependencias, coste mínimo, prueba de restauración anual) y «Restricciones técnicas».
3. **Las ADRs, enteras y con sus enmiendas y notas**:
   - **ADR-0028** con sus dos notas: sobre todo las filas **16** (registros), **17** (el destinatario), **18** (sin importes por defecto) y la **revisión del plazo de las versiones al pasar de 1 MB**.
   - **ADR-0034 entera**, con atención a las filas **2** (`dev` en reposo: tareas desactivadas, sin las claves de precios del usuario, **una programación activada una vez en la 018 con una fuente de precios simulada**), **9** (qué no ve el filtro de Budgets: Scheduler y SES), **12** (la identidad de SES y **la condición de IAM sobre el remitente y el destinatario, cuya verificación contra la API v2 es de esta feature**), **13** (cupos compartidos) y **21** (los valores de los secretos no pasan por Terraform).
   - **ADR-0029** entera, con sus tres enmiendas: la descarga, «una actualización nunca pisa el pasado en silencio», la procedencia (`manifest.json`, `previous/`, `rejected/`) y **el punto 3, «en el móvil, cuando exista la nube»**.
   - **ADR-0031** entera, con sus tres enmiendas: la cascada, el cupo, los fallos seguidos («**el correo es de la feature 016**»), el almacén, `symbols.json` y `config.json`, y «Una sola clave, un solo presupuesto diario».
   - **ADR-0032** entera, con sus notas: las cuatro capas, **el volcado mensual** («el libro, el histórico del BCE, los precios y `positions.json`») y **la prueba automática de cada trimestre**.
   - **ADR-0033**: su «Consecuencias», sobre lo que el correo mensual cuenta de los tokens de la consola. Y **ADR-0027**, «Riesgo»: el cliente OAuth sin uso y el correo que lo avisa.
   - **ADR-0026** (Parte A: la API solo añade; Parte B: el cerrojo, que en S3 no existe), **ADR-0018** con su enmienda (un campo nuevo en una foto completa) y **ADR-0022** (`settings_changed` registra la configuración entera).
4. **`docs/specification.md`**: §5 (y su párrafo sobre `alert_channels`, que esta feature corrige: §3, E3), §7, **§9.5 entero** (la tabla de tareas, `job_frequencies` y el principio de notificación), §9.6 (el modo privacidad), §11.7 (registros) y §11.8 (secretos: ninguno en variables de entorno).
5. **`docs/business-rules.md` §7**: la fila tachada de `notification_email` y la de `job_frequencies{}`.
6. **`docs/data-schema.md` §1 entero**: las filas de `reference/ecb/`, `prices/*`, `backups/`, `archive/`, `sync/devices/` y el párrafo de los dos buckets («las tareas programadas escriben `backups/`»).
7. **`docs/api.md`**: §1 (registros), §2 (credenciales), **§6** (las rutas de referencia, que la consola y la web usarán para beber de la nube), §7 y §9 (parámetros de SSM y configuración de la Lambda: el modelo para los tuyos).
8. **`docs/decision-roadmap.md`**: la Ronda 8 entera, la entrada de la **016** en «Plan por etapas» y la sección **«Etapas pendientes»** (lo que la 016 hereda), y la regla de lo **SIN VERIFICAR**: *cada feature que dependa de uno de esos puntos lo verifica, con fuente, antes de escribir código*.
9. **`docs/prompts/015-api-access.md`**: §2, §2 bis y §2 ter (las reglas de operación, que siguen valiendo) y §5 (los criterios de terminado, que este prompt adapta). Y **`specs/015-api-access/questions.md` de §20 a §34**, junto con las dos revisiones de la PR #98: es el diario de lo que costó la 015. §5 de este prompt lo resume en diez familias, pero léelo.
10. **Los procedimientos**: `docs/runbooks/README.md` y los que enlaza. Si esta feature escribe alguno, sigue su forma, **y no sus fallos** (§5, familia 9).
11. **El código. Todo lo que este prompt afirma de él está comprobado sobre `develop` (`640fa98`) y sobre la rama de la 015 el 2026-09-27; compruébalo tú otra vez antes de tocarlo.**
    - **No existe ninguna tarea programada, ni el puerto `Notifier`, ni ningún adaptador de SES.** Los puertos son `clock`, `draft-store`, `fx-rate-source`, `ledger-store`, `price-source`, `price-store`, `random`, `remote-ledger` y `sync-state-store` (`packages/domain/src/ports/`).
    - **El BCE**: `updateEcbHistory` (`packages/domain/src/ecb/update-history.ts`), sobre los puertos `FxRateSource` y `EcbHistoryStore` (`ports/fx-rate-source.ts`). La descarga es `packages/adapters/src/ecb/source.ts` y el almacén de carpeta, `ecb/history-store.ts`. **No hay almacén de S3 para `reference/ecb/`.**
    - **Los precios**: `updatePrices` (`packages/domain/src/quotes/cascade.ts`), sobre `PriceSource` y `PriceStore` (`ports/price-store.ts`, con su `transact`). Los adaptadores de EODHD y Alpha Vantage y el almacén de carpeta están en `packages/adapters/src/prices/`; las claves se leen de `~/.config/atlas/secrets.json` (`prices/secrets.ts`). **No hay almacén de S3 para `prices/` ni lector de claves en SSM.**
    - **Lo que ya hay de AWS** (015): `packages/adapters/src/aws/` (`object-store.ts`, `sdk-s3.ts`, `sdk-ssm.ts`, `parameter-store.ts`, `reference-reader.ts`, `s3-ledger.ts`, `token-registry.ts`, `device-store.ts`), detrás de las puertas `@atlas/adapters/aws` y `@atlas/adapters/aws-sdk`. El paquete de la Lambda de la API lo construye `apps/api/scripts/build-lambda.mjs` con `esbuild` (un ZIP determinista, `index.handler`).
    - **Las rutas de referencia** existen (`GET /api/reference/index`, `…/ecb/<name>`, `…/prices/<name>`) y **el nombre tiene que cumplir** `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` (`REFERENCE_NAME`, `packages/domain/src/access/sync-routes.ts:60`). **Dos cosas que no cuadran con lo que la tarea escribirá** (compruébalas): `prices/_status.json` empieza por `_`, y `priceFileName` (`packages/domain/src/quotes/line.ts:33`) codifica con `encodeURIComponent`, así que un `asset_id` con caracteres especiales da un nombre con `%` que la ruta rechaza. **El diagnóstico es más amplio** (revisión de la PR #99, M1): `encodeURIComponent` no codifica `! ' ( ) * ~`, `priceFileName` solo escapa el punto inicial (como `%2E`) y deja un `_` o un `-` al principio, y la regla corta en 128 caracteres; así fallan también `ast(b).jsonl`, `_x.jsonl`, `-x.jsonl` y `%2Ex.jsonl`. **Decidido** ([§8.2 M1](#r1-m1), que enmienda [§8.1 P6 bis](#p6bis-resp)): `REFERENCE_NAME` valida **por ida y vuelta con el `priceFileName` del dominio** —un nombre vale si decodificarlo y volver a codificarlo da el mismo nombre—, con **255 caracteres como máximo**, y `_status.json` no se sirve.
    - **La web**: el histórico del BCE sale de la carpeta enlazada o de una copia importada a mano (`apps/web/src/ecb/history.ts`, con `importedHistory` y `saveImportedHistory` de `@atlas/adapters/reference`). **`notification_email`** se ofrece en Ajustes (`apps/web/src/view-models/settings.ts:177`, `apps/web/src/format/labels.ts:269`) y tiene tests propios (`apps/web/test/settings-text.test.tsx`, `view-models.test.ts:634`).
    - **`Settings`**: `notification_email?` y `job_frequencies?: Record<string, string>` (`packages/domain/src/settings/settings.ts:144-145`), y **la lista de claves de `Settings` está congelada** por un test (`tests/architecture.test.ts:596`). El generador sintético escribe `notification_email` y `job_frequencies` (`packages/domain/src/synth/scenario.ts:397-398`), así que **están en el *golden***.
    - **La consola**: `atlas fx update|status|correct` y `atlas prices update|status|symbols|purge` (`apps/cli/src/main.ts`, `ARITY`); `confirm` (`apps/cli/src/commands/shared.ts:95-99`) **devuelve `true` con `--yes`** sin preguntar (§5, familia 10).
    - **El paquete web**: `apps/web/scripts/check-bundle.mjs`. En `develop`, arranque con techo **76.069** y total con techo **293 KB + 404**. En la rama de la 015, tras E5, **74.134** y **294 KB + 440**. Mide la partida tú.

Si algo es ambiguo, contradictorio o te bloquea, **no lo resuelvas**: escríbelo en `specs/016-scheduled-jobs/questions.md` y avisa. Nada fiscal ni estructural se decide aquí, y nada de seguridad ni de privacidad tampoco.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado** y con la 015 entera dentro:
   ```bash
   cd ~/personal/atlas/atlas-portfolio-tracker && git fetch origin && git worktree add .claude/worktrees/016-scheduled-jobs -b feature/016-scheduled-jobs origin/develop
   cd .claude/worktrees/016-scheduled-jobs && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit en `specs/016-scheduled-jobs/` (español, identificadores en inglés): **un solo `spec.md` y un solo `plan.md`** para las entregas, con cada entrega como historia o fase, y `tasks.md` agrupado por entrega. **Para después de `spec.md` y `plan.md`**, con tus preguntas en `questions.md`, y espera el visto bueno antes de escribir código: **quien contesta es la dirección**. Tienen que llegar con ese alto:
   - **las verificaciones del bloque 0 de E1** (§3), cada una con su fuente, su fecha y lo que dice; y **la lista de las de E2 a E4**, con cuándo las harás;
   - **la tabla de reglas**, una fila por regla de este prompt y de las ADRs que cita (privacidad del correo, idempotencia, cupo, escritura única, registros), con **el test que la ata y el mutante que la rompe** (§6);
   - **los formatos, escritos como contrato**: el evento que cada tarea acepta de Scheduler; el registro de ejecución de cada tarea y dónde vive; los **nombres y formatos de los parámetros de SSM** que leen las tareas: **las claves de las fuentes**, `SecureString` que el guion de secretos de la 017 creará tal cual (ADR-0034, fila 21), y **el destinatario y el interruptor de importes**, dos `String` que **escribe Terraform desde `terraform.tfvars`** —el interruptor, por defecto «sin importes»— y que el guion de secretos **no crea** (ADR-0034, filas 12 y 21; [§8.2 M3](#r1-m3)); las variables `ATLAS_*` de cada Lambda; y la forma de `positions.json`;
   - **la lista exacta de acciones de S3, SSM y SES de cada Lambda**, con su recurso. **Es lo que la 017 convertirá en política**, y escrita en el alto le permite empezar sin esperar al código. **El rol de precios no tiene ninguna acción `ses:*`, y el de correo no alcanza la clave de EODHD ni la de Alpha Vantage** ([§8.2 B2](#r1-b2));
   - **lo que propones para cada punto de §7.2**, marcado como propuesta, y cómo aplicas cada respuesta de §8.1;
   - **la línea de partida del paquete web** medida sobre tu `develop`, y **tu estimación trozo a trozo** de lo que añade E3;
   - **la partición en entregas** tal como la vas a seguir (§3), o lo que cambiarías y por qué;
   - **la predicción fiscal** (§6): que no se mueve nada.
3. Implementación **por entregas, en el orden de §3**, y dentro de cada una por bloques. Commits atómicos, Conventional Commits en inglés.
4. **Cada entrega termina así**, y la siguiente no empieza sin la palabra de la dirección:
   - la tubería entera en verde y la rama empujada;
   - **la autocomprobación de §5 pasada y escrita** en `questions.md`, familia a familia, con la evidencia;
   - **congelas un commit** y lo dices (su SHA) en `questions.md` y en tu informe. Sobre ese commit la dirección lanza los revisores por zonas (§2 quater), **cada uno en un worktree desacoplado y congelado** (`git worktree add --detach .claude/worktrees/016-rev-E<n>-<zona> <sha>`), nunca en el tuyo;
   - **mientras dura la revisión no empujas nada a la rama**: puedes preparar en `questions.md` el plan de la entrega siguiente, no código;
   - con los hallazgos que elija la dirección, los arreglas con los tests en rojo primero, **vuelves a mirar alrededor** (§2 ter) y repites los lotes de mutación afectados;
   - **abres tú la PR a `develop`** con la plantilla (`.github/pull_request_template.md`) y su lista **rellenada con honestidad**. **Antes de pedir revisión, la descripción dice la verdad** del commit congelado, de lo aplicado y de dónde está cada cosa (§5, familia 4). **No la fusionas nunca.** Antes de dar por integrada una entrega, `git log origin/develop..feature/016-scheduled-jobs` tiene que salir **vacío**, y la entrega siguiente empieza con `git merge origin/develop` en tu rama.

## 2 bis. Reglas de operación

Siguen valiendo **enteras** las de `docs/prompts/015-api-access.md` §2 bis: el dominio al 100 % y ninguna regla fuera de él; ninguna llamada real desde un test y cada doble citando su fuente; nada del SDK de AWS alcanzable desde la web ni desde el dominio; nunca se registra un secreto, un correo, un `sub`, una línea del libro, un importe, una posición ni una cuenta; toda escritura en la carpeta del libro bajo el cerrojo, y nada de la red con el cerrojo tomado; toda lectura seguida de escritura en IndexedDB, en una transacción; no tocar `docs/`, `.githooks/`, `.claude/`, `.specify/` ni `CLAUDE.md` (salvo proponer una ADR con `/adr`); no tocar el esquema del libro; cada código con su literal; fechas de los documentos en `Europe/Madrid`; y los ficheros temporales con el prefijo de la rama. Además:

- **Dependencias externas: solo una, y decidida.** **`@aws-sdk/client-sesv2@3.1141.0`**, versión exacta, en `packages/adapters`, **solo** en su adaptador fino de `packages/adapters/src/aws/` y con la lista cerrada de órdenes (`SendEmail`). **Sustituye a `@aws-sdk/client-ses`**, que estaba presupuestado y no se instala; `docs/dependencies.md` ya lo dice ([§8.1 P8](#p8-resp)). **Se instala en E1, después del bloque 0**, con la autorización que el usuario dio en su día para instalar lo que haga falta (`specs/015-api-access/questions.md` §24.2); la dirección se lo comunica. El adaptador se escribe **contra una interfaz estrecha propia**, probada con dobles, y el SDK se enchufa en la composición, como hizo la 015 con S3 y SSM. **Crear el *workspace* `apps/jobs`** ([§8.1 P3](#p3-resp)) y el cambio que eso produce en el *lockfile* están permitidos: no instalan nada de fuera. Cualquier otro paquete, aunque sea de desarrollo, es una pregunta en `questions.md`.
- **Ninguna tarea decide nada.** Qué toca hoy, qué periodo es, qué dice un correo, si lleva importes, qué es «algo que hacer», cuándo un tamaño pasa del umbral y qué se compara en el ensayo de restauración **lo decide `packages/domain`**, en funciones puras sobre datos ya leídos. El manejador de cada tarea **compone** y no decide, como el de la API.
- **El reloj siempre inyectado.** Ninguna tarea, ningún adaptador y ningún test llama a `new Date()` ni a `Date.now()` fuera del adaptador del reloj (`packages/adapters/src/clock/system.ts`). Un test de estructura lo comprueba en los ficheros nuevos (§5, familia 3).
- **Los periodos, en `Europe/Madrid`.** El mes del recordatorio, el trimestre de la integridad, el enero de la Renta y el año del 720 son los del contribuyente. El día GMT del cupo de EODHD y la ventana de 24 horas de Alpha Vantage **no cambian** (ADR-0031, tercera enmienda, §5). Las dos cosas conviven, y cada una tiene su test en el borde: el cambio de hora, fin de mes y Nochevieja ([§8.1 P15](#p15-resp)).
- **Nunca se registra, además de lo de siempre**, la dirección del destinatario, el remitente, el cuerpo o el asunto de un correo, un `asset_id`, un símbolo, un ISIN ni una clave de fuente (la URL con la clave se censura, ADR-0031, segunda enmienda). **El registro de una tarea dice su nombre, su periodo, su resultado con código y recuentos**, y nada más.
- **Ningún `--yes` en una operación destructiva.** Es la regla que la dirección fijó para `atlas admin` en la PR #98 (N1; `questions.md` §35, decisiones sobre las revisiones de la PR #98): `restore`, `compact` y `forget-device` **rechazan `--yes`**, y la confirmación **exige escribir el nombre del entorno**. Toda orden nueva de esta feature que escriba en el bucket, sobrescriba algo o no se pueda deshacer —**`atlas admin prices push` incluida**— sigue la misma regla: rechaza `--yes`, enseña la lista o la diferencia, pide que se teclee el entorno, y sin terminal sale con 4 sin tocar nada (§5, familia 10).
- **Los procedimientos (runbooks) los escribes en `specs/016-scheduled-jobs/runbooks/`**, y la dirección los traslada a `docs/runbooks/` al cerrar. Cada paso tiene que poder ejecutarse **en el estado en que está el sistema en ese paso**, y ninguno deja un dato personal o un secreto en el historial del *shell* (§5, familia 9).

## 2 ter. Lo que las rondas anteriores aprendieron a golpes

Siguen valiendo enteras las lecciones de §2 ter de los prompts 012 a 015: un test que no has visto fallar no es un test; un mutante que sobrevive puede ser un mutante que nunca se aplicó (el guion **afirma** cada sustitución, restaura, **compara byte a byte** y se niega a correr con un gemelo `.js`); un resultado leído a través de una tubería se come el error (redirige a un fichero y lee `$?`); mirar la pantalla encuentra lo que ningún test encuentra; **un arreglo que reconoce algo por parecido abre el defecto siguiente**; un orden fijo donde hacía falta uno que dependiera de la dirección del movimiento; y **sube la rama a menudo**, siempre en verde.

Y cuatro de la 015 que aquí son de aplicación directa:

- **Un test que no existe no falla.** El commit `969786e` de E4 borró por error cuatro bloques de guardianes, y nadie lo echó de menos hasta E5 (`specs/015-api-access/questions.md` §33.4). **Antes de cada PR, cuenta los tests de los ficheros de guardianes** (`tests/architecture.test.ts`, `tests/api-access.test.ts` y los tuyos) y compáralo con la cuenta de `develop`: si baja, explícalo.
- **«La propiedad no lo mata» no es «equivalente».** En E3, un mutante se dio por equivalente porque la propiedad no lo mataba, y lo mataban otros dos tests (§26.2, «Observación sobre E1»). Un mutante solo es equivalente con un argumento escrito, nunca por falta de un test que lo mate.
- **Un paso de un procedimiento que «se puede probar con los dobles» se prueba.** El paso 5 del procedimiento de la cuenta robada no se podía ejecutar en el estado que dejaban los pasos 1 y 3, y nadie lo recorrió (revisión de seguridad de la PR #98, B1).
- **El techo se sube antes, y cada empuje pasa al menos `typecheck`.** La 015 dejó tres tramos de la historia en rojo (§20.2, §26.5, §28.5), y la regla quedó escrita en §21. **Antes de cada empuje: `lint`, `typecheck` y, si tocaste la web, `build`.**

## 2 quater. Método de esta feature

**Un implementador nuevo por feature.** No se reutiliza el de la 015, y tú no reutilizarás tu contexto para la 017. Todo lo que sabes sale de este documento y del repositorio; lo que aprendas y no esté escrito en `questions.md` se pierde. **Escríbelo según lo aprendes, no al final.**

**Revisiones por zonas y con alcance acotado.** En la 015, los revisores se quedaron sin turnos más de una vez (`docs/prompts/000-director-handoff.md` §5.6), y en la PR #98 cada revisión dijo lo que no había mirado. A partir de esta feature, la dirección encarga **una revisión por zona**, y cada revisor recibe:

- **su zona, con la lista de ficheros**: no más de dos zonas por revisor;
- **la profundidad**, alta o media, y el porqué;
- **la orden de publicar lo que tenga** al llegar a unas tres cuartas partes de sus turnos, bloqueantes primero, con «lo que no he mirado» escrito;
- **su lote de mutantes**, como mucho ocho, sobre su zona.

Tu plan propone las zonas de cada entrega, con sus ficheros. Las de este prompt son una propuesta (§3). **Tu autocomprobación de §5 va delante**: una revisión que encuentra una familia de §5 que tú dabas por pasada es un hallazgo sobre la autocomprobación, además de sobre el código.

**Reglas de memoria de la máquina.** La máquina es compartida con otros proyectos (dos Gradle y un emulador de Android en la 015), y la memoria disponible oscilaba entre 500 y 3.500 MB (§24.11). Al escribir este prompt, `free -m` daba unos 2.600 MB disponibles de 11.676, con *swap* en uso. Por eso:

- **toda ejecución de `vitest` con `--pool=forks --maxWorkers=1`**, también las de un solo fichero, y las propiedades con `NODE_OPTIONS=--max-old-space-size=1536`;
- **`free -m` antes de cada paso pesado** (cobertura, `build`, lote de mutantes, capturas), y si hay menos de **1.500 MB disponibles**, se espera. Una puerta que espera, como la de la 015, no un aviso;
- **los mutantes, en lotes pequeños** (de cuatro a ocho) y **de uno en uno** dentro del lote, guardando cada veredicto en cuanto se conoce y reanudando solo lo que falta;
- **nada en paralelo con la tubería**: ni coberturas sueltas, ni mutantes, ni capturas (§28.7: una cobertura suelta borró el `coverage/.tmp` de la tubería);
- **la cobertura en sus dos pasadas** (`test:coverage:domain` con el umbral del 100 % y `test:others`), como la dejó E5 de la 015 (§34.2).

## 3. Alcance, por entregas y en este orden

### La partición: cuatro entregas, una rama, cuatro PRs (confirmada, [§8.1 P2](#p2-resp))

| Entrega | Qué | Depende de | Zonas de revisión propuestas |
|---|---|---|---|
| **E1** | El esqueleto de las tareas (el paquete, el evento de Scheduler, el registro de ejecución, los periodos), **el puerto `Notifier` con su adaptador de SES**, el destinatario y el interruptor de importes, **la redacción de los correos sin importes** y **el recordatorio mensual** de principio a fin | La 015 entera | Z1 privacidad del correo y registros; Z2 idempotencia, periodos y reloj |
| **E2** | **Los datos del día en la nube**: el BCE diario y los cierres diarios, los almacenes de S3 de `reference/ecb/` y `prices/`, las claves de las fuentes en SSM, el cupo compartido, la fuente simulada de `dev`, **`atlas admin prices push`** y los hallazgos que dejan para el correo (fallos seguidos de una fuente, tesis con el horizonte vencido, hallazgo del BCE) | E1 | Z3 fuentes, claves, cupo y `atlas admin prices push`; Z4 escrituras en S3 y sus cortes |
| **E3** | **Los dispositivos beben de la nube**: la consola baja de la API los precios que bajó la nube y deja de pedirlos a las fuentes, la web del móvil descarga el histórico del BCE (y los precios, [§8.1 P7](#p7-resp)), `notification_email` sale de la web, y `alert_channels` en la especificación | E2 | Z5 la consola y su carpeta; Z6 la web y su paquete |
| **E4** | **Copias, integridad y avisos periódicos**: el volcado mensual con `positions.json`, la integridad y el ensayo de restauración trimestrales con **el aviso de tamaño del libro por encima de 1 MB**, las desviaciones y las reglas del cubo semanales, la Renta en enero y los umbrales del 720 y el 721; y los procedimientos | E1 y E2 | Z7 copias y restauración; Z8 avisos y la ruta fiscal |

**Por qué partirla.** La 015 se partió en cinco y aun así cada entrega necesitó dos o tres rondas. Esta feature tiene **cuatro superficies de naturaleza distinta**:

- **lo que sale del perímetro** (el correo): lo más caro de equivocarse y lo menos voluminoso, así que va primero y sola, con el esqueleto que usa todo lo demás;
- **las fuentes externas con clave y cupo**, y las escrituras en S3 sin cerrojo;
- **los dos clientes**: la carpeta de la consola, con su cerrojo, y el paquete web sin margen que regalar;
- **lo que se escribe para siempre** (`backups/`) y los avisos que tocan la ruta fiscal.

Así, **cada revisión mira una sola superficie**, y **el orden sigue las dependencias**: los hallazgos de E2 los envía la función de correo de E1, que los lee de los registros de ejecución ([§8.2 B2](#r1-b2)); la consola de E3 necesita saber qué escribe la nube (E2); el volcado de E4 copia lo que escribió E2. **La 017 no espera al código**: la lista de permisos de cada Lambda se escribe en el plan, en el alto (§2), y se pone al día al cerrar cada entrega.

**Una rama y cuatro PRs**, con el precedente de la 010 y la 015. Tras cada fusión, la rama sigue desde `develop` actualizado (§2, punto 4).

### E1 — El esqueleto de las tareas, el correo y el recordatorio mensual

#### Bloque 0 — Verificar antes de escribir código

Con fuente, fecha y lo que dice, en `questions.md`. Son los SIN VERIFICAR que la hoja de ruta asigna a la 016 («Ronda 8», lista de SIN VERIFICAR; ADR-0034, fila 12), más lo que esta entrega necesita saber de la plataforma:

1. **Que la condición de IAM sobre `ses:FromAddress` y `ses:Recipients`**, con la condición `Null` que impide enviar sin destinatarios, **se aplica a `SendEmail` de la API v2 de SES** (`sesv2:SendEmail` o `ses:SendEmail`: qué acción autoriza IAM para la v2 y qué claves de condición admite). Con la documentación de SES y de IAM (*Service Authorization Reference*). **Si no se aplica, para**: es la única salvaguarda de ADR-0034, fila 12, en una cuenta que puede estar fuera del *sandbox*.
2. **Si una política de identidad de SES** (la de la identidad del remitente) **impide, dentro de la misma cuenta, que otro proyecto envíe como Atlas**. Si no lo impide, se escribe como riesgo con su fuente. No para.
3. **Si el coste de SES se atribuye por la etiqueta de asignación de costes** (ADR-0034, fila 9, «SES, cuya atribución por etiqueta está SIN VERIFICAR»). Si no, se escribe; no para.
4. **Cómo invoca EventBridge Scheduler a una Lambda**: el evento que llega (lo fija el `Input` de la programación), **la política de reintentos por defecto** (número de intentos y edad máxima), la cola de mensajes fallidos, la **zona horaria** de una expresión `cron` y la **ventana flexible**. Y **cómo reintenta Lambda una invocación asíncrona** que falla. De esto sale el diseño de la idempotencia (§0).
5. **Los límites de SES**: tamaño del mensaje, cuántos destinatarios, y **si el cuerpo en texto plano sin HTML** se envía tal cual con `SendEmail` de la v2 (contenido «Simple»).
6. **Si las programaciones de Scheduler se pueden etiquetar** una a una o solo por grupo (ADR-0034, fila 9). Es de la 017, pero la lista de recursos del plan lo necesita; si no llegas a una fuente clara, se deja a la 017 y se dice.

**Qué se hace si sale mal**: el punto 1 para la entrega. El 4, si la documentación no dice cuántas veces se reintenta, no para: el diseño supone **más de una**, que es lo seguro.

#### Bloque 1 — Los guardianes, antes que el código

Antes de crear nada, **los tests de arquitectura tienen que cubrir lo que vas a crear**, y los ves fallar con un módulo vacío:

- **La regla de dependencias de `apps/jobs`** en el test de arquitectura ([§8.1 P3](#p3-resp)): `apps/jobs` importa `@atlas/domain` y `@atlas/adapters`, como las demás aplicaciones, y **nada importa `apps/jobs`**: ni el dominio, ni los adaptadores, ni otra aplicación. `CLAUDE.md` («Code architecture») ya lo nombra.
- **El código de las tareas no es alcanzable** desde la web, desde la consola ni desde la API; y **la API no alcanza el `Notifier`, SES ni las claves de las fuentes**. Por el **grafo real**, con reexportaciones, rutas relativas, alias y `import()` con argumento que no sea una cadena literal (§5, familia 1).
- **El SDK de SES, solo en su adaptador fino** de `packages/adapters/src/aws/`, detrás de una puerta que ni la web ni la API importan, y con la lista cerrada de órdenes que usa (`SendEmail` y nada más).
- **Nada nuevo de la web en el arranque**, y ningún módulo de la web alcanza el código de las tareas.
- **El reloj**: ningún fichero nuevo fuera del adaptador del reloj nombra `new Date(` sin argumento ni `Date.now(`.
- **El test de los registros con centinelas**, vacío pero corriendo sobre el manejador de las tareas: un importe, un correo, un `asset_id`, un símbolo, una clave y el destinatario centinelas. **Captura `stdout` y `stderr`**, no solo el registrador, y prueba **los caminos de fallo** (§5, familia 6).

#### Bloque 2 — El esqueleto

- **El paquete de las tareas: `apps/jobs` (`@atlas/jobs`)** ([§8.1 P3](#p3-resp)), con **un manejador que compone y no decide** y un artefacto, `jobs.zip`, construido **una vez** por `npm run build` (como `lambda.zip`, determinista y sin dobles ni tests dentro, con su test). **Un solo artefacto y una Lambda por familia de permisos, cada una con su rol** ([§8.1 P4](#p4-resp)): el BCE, los precios, el correo, el volcado y la integridad. El manejador **se niega a una tarea que no está en la lista de su función** (`ATLAS_JOBS`).
- **El evento de Scheduler, leído de forma estricta**: un JSON con la tarea y nada más que lo que diga el contrato del plan. Un campo desconocido, una tarea que esa Lambda no tiene o un evento que no es JSON **se niega con su código y no hace nada** (§5, familia 7).
- **Qué toca hoy** ([§8.1 P5](#p5-resp)): **una programación diaria por función**, a una hora fija, y una función pura del dominio que, con `job_frequencies`, el día en `Europe/Madrid` y el registro de la última ejecución, dice si la tarea toca. **Un conjunto cerrado de claves y valores**; **lectura tolerante** (una clave o un valor desconocidos en una línea ya escrita no invalidan el libro: se usa el valor por defecto y **se dice** en Ajustes y en el registro de la tarea) y **escritura estricta** (los formularios solo escriben valores válidos). **El recordatorio mensual no se puede apagar** (constitución V).
- **El registro de ejecución** de cada tarea y periodo, escrito de forma condicional (`If-None-Match: *` para reclamar, `If-Match` para cerrar), con **qué hace cada reintento en cada estado** ([§8.1 P10](#p10-resp): el recordatorio mensual, al menos una vez; los avisos, como mucho una vez) y **un test de corte entre reclamar y hacer, y entre hacer y cerrar**.
- **Los hallazgos para el correo** ([§8.2 B2](#r1-b2)): **solo la función de correo envía**. Una tarea que encuentra algo que avisar lo deja **en su registro de ejecución, bajo `jobs/`**, con su código y sin nada de lo que §2 bis prohíbe registrar; la función de correo lo lee, lo envía y **apunta la racha**, para avisar **una vez por racha**. El formato del hallazgo y de la racha, en el plan, con su test de corte entre enviar y apuntar.
- **La configuración de cada Lambda**: variables `ATLAS_*`, leídas con la regla de la API (`docs/api.md` §9): una desconocida o que no se entiende **impide arrancar**; **ningún secreto en una variable de entorno**. El arranque captura su propio fallo sin copiar el mensaje del SDK (`compose_failed` de la 015, §26.1 N2).

#### Bloque 3 — El correo

- **El puerto `Notifier`** en `packages/domain/src/ports/`: recibe un mensaje ya redactado (asunto y cuerpo en texto plano) y devuelve el resultado con un código. **No recibe el destinatario**: lo pone el adaptador, que lo lee de SSM. Así, nada del dominio ni de la redacción puede llegar a escribir a otra dirección.
- **El adaptador de SES**, contra la interfaz estrecha (§2 bis), que lee **el destinatario** (un `String` de SSM que Terraform escribe desde `terraform.tfvars`, ADR-0034, fila 12) y **no lee el interruptor**. Un destinatario que no es una dirección válida no envía.
- **El interruptor de importes tiene un solo lector** ([§8.2 M2](#r1-m2)): **la composición de la tarea** lo lee de SSM (un `String` junto al destinatario, que escribe Terraform con el valor por defecto «sin importes», ADR-0028, fila 18; [§8.2 M3](#r1-m3)), con la regla de siempre —**un valor que no se entiende, o ausente, no activa nada**—, y le pasa **el valor ya interpretado** a la redacción del dominio. Un test de estructura comprueba que ningún otro módulo nombra ese parámetro. El remitente es configuración de la Lambda. Un fallo transitorio de SSM o de SES es un fallo con código, nunca un envío dado por hecho.
- **Un `Notifier` de fichero** para las pruebas y las capturas: escribe el mensaje en un directorio del *scratchpad*. **No es alcanzable desde el artefacto de producción**, y un test lo comprueba (el guardián de los dobles; su única excepción declarada es la fuente simulada de `dev`, [§8.2 m3](#r1-m3m)).
- **La redacción, en el dominio**: una función pura por correo, que recibe los datos ya calculados y **el interruptor**, y devuelve asunto y cuerpo. **«Sin importes» es la regla de [§8.1 P9](#p9-resp)**, y un test **renderiza cada correo** con un libro sembrado de importes, cantidades, precios, nombres de activos, ISIN y cuentas centinela, y **falla si aparece cualquiera** con el interruptor apagado. Con el interruptor encendido, aparecen **exactamente** las cifras que el plan diga, con su valor, y ninguna otra.
- **Texto plano, en español, sin HTML**: sin nada remoto que cargar, sin enlaces de seguimiento. Como mucho, el origen de la aplicación, que es configuración.

#### Bloque 4 — El recordatorio mensual (`docs/specification.md` §9.5)

**No espera a E2** ([§8.2 M6](#r1-m6)): lee `reference/ecb/` y `prices/` del bucket con el `ReferenceReader` de solo lectura de la 015 (`packages/adapters/src/aws/reference-reader.ts`) y, mientras E2 no esté, **valora con lo que haya**: valoraciones manuales o precios ya subidos. Lo que no puede valorar lo dice.

**Siempre llega**, y dice:

- **la aportación del mes con el reparto calculado** (`contributionPlan`), con la nota `weights_use_approximation` si algún peso depende de una aproximación, **sin importes salvo que se activen**;
- **los días desde el último inicio de sesión, contando los de la consola** (ADR-0027, «Riesgo»; ADR-0033, «Consecuencias»), con **el aviso antes de los seis meses** del cliente OAuth sin uso. **Hoy nada registra el inicio de sesión de la web** ([§8.1 P6](#p6-resp)): **la API escribe un objeto pequeño en el bucket con solo la fecha del último inicio de sesión web**, sin `sub`, sin correo y sin dispositivo, con `If-Match` para que solo avance; la consola cuenta por el `issued_at` de sus tokens. Toca `apps/api`, va en este bloque y se revisa en la zona Z1;
- **cuántos tokens de consola siguen vivos y cuántos se emitieron en el mes**, sin nombres (del registro de SSM, `GetParametersByPath` bajo `/atlas/<entorno>/device-tokens/`; un registro ilegible se cuenta como tal, nunca se omite);
- **el recordatorio de la copia fuera de AWS** (ADR-0032, capa 4), con la orden exacta (`atlas backup --to <dir> --from-bucket --env prod`).

Con un libro inválido, o sin precios, **el correo llega igual** y dice qué no pudo calcular y por qué: fallo seguro, nunca silencio.

### E2 — Los datos del día en la nube (ADR-0029, ADR-0031)

#### Bloque 0 — Verificar antes de escribir código

1. **Que la consola y la nube pueden compartir las claves y el cupo** como dice ADR-0031: el cupo de EODHD se reinicia a medianoche GMT y el de Alpha Vantage no documenta la hora (tercera enmienda, §1). El reparto está decidido ([§8.2 M5](#r1-m5), que enmienda [§8.1 P11](#p11-resp)): **los presupuestos de la nube son variables de entorno de la Lambda de precios que escribe Terraform** (por defecto, **18 para EODHD y 23 para Alpha Vantage**), y el `prices/config.json` local sigue siendo el presupuesto de la consola.
2. **Qué nombres escribe la tarea en `prices/` y cuáles sirve `GET /api/reference/prices/<name>`** (§1, punto 11): lista los que no pasan `REFERENCE_NAME` con el código de hoy. **Recorre la lista completa de casos del revisor** ([§8.2 M1](#r1-m1)): `%`, `! ' ( ) * ~`, un `_` o un `-` al principio, el punto inicial (`%2Ex.jsonl`) y un nombre de más de 128 y de más de 255 caracteres, y comprueba cada uno contra la regla decidida (ida y vuelta con `priceFileName`, 255 como máximo). Si alguno que un dispositivo necesita sigue sin pasar, **para** y dilo. `_status.json` no se sirve.
3. **El tiempo máximo y la memoria de una Lambda**, frente a una descarga del BCE (el ZIP, unos 600 KB) y a veinte llamadas a EODHD con el segundo de espera de Alpha Vantage.

#### Bloque 1 — Los almacenes de S3

- **`EcbHistoryStore` sobre S3**: `activate` y `keepRejected`, con la procedencia de la tercera enmienda de ADR-0029 (`manifest.json`, `previous/`, `rejected/`), **sin `rename` y sin cerrojo**. El plan enumera la secuencia de escrituras condicionales, **cada estado intermedio** y qué ve un lector (la API, la web, la consola) en cada uno. **Un lector nunca ve un fichero en vigor que no cuadra con su manifiesto como si cuadrara** (`EcbHistoryDamaged`), y la tarea siguiente sabe terminar o deshacer lo que quedó a medias. Un test de corte en cada hueco.
- **`PriceStore` sobre S3**: `transact` no puede ser una transacción. Lo que se escribe **dentro** de `transact` en local (la reserva del cupo en `_status.json`, las líneas de cierres) se escribe aquí con `If-Match` sobre lo leído, y **un conflicto aborta la ejecución sin reintentar** en ella. La regla que no se negocia: **un corte o un conflicto nunca devuelve una llamada ya reservada** (el cupo se cuenta de más, nunca de menos) y **nunca deja una línea de cierre a medias**.
- **Los mismos tests de contrato** que el almacén de carpeta, contra el doble de S3 con las cuatro salidas verificadas en la 015 (`412`, `409`, `404` de `If-Match` sin objeto, `200`).
- **Un solo escritor por objeto** ([§8.1 P18](#p18-resp)): la tarea escribe `_status.json`, los cierres y `reference/ecb/`; **nunca** `symbols.json`, que solo sube `atlas admin prices push` (bloque 3). **En la nube no hay `prices/config.json`** ([§8.2 M5](#r1-m5)): el orden de las fuentes y el umbral de fallos seguidos, como los presupuestos, son configuración de la Lambda. Un test de estructura lo comprueba en el código de la tarea.

#### Bloque 2 — Las tareas diarias

- **El BCE**: `updateEcbHistory` sobre el almacén de S3, con la descarga de siempre (primero el ZIP, la API si falla). **Notifica solo si hay hallazgo** (§9.5): una actualización que pisaría un tipo ya publicado, o el calendario TARGET en desacuerdo.
- **Los precios**: `updatePrices` sobre el almacén de S3, **los activos y su prioridad sacados del libro remoto** (`ledger/ledger.jsonl`, leído con el almacén de S3 de la 015; ADR-0031, segunda enmienda, punto 5), `symbols.json` **del bucket** y la configuración de la Lambda (los presupuestos, el orden de las fuentes y el umbral de fallos seguidos, [§8.2 M5](#r1-m5)). **Nunca el día en curso.** Una correspondencia sin contrastar **no se descarga** (tercera enmienda, §4), y **la tarea no contrasta nunca** ([§8.1 P18](#p18-resp)): una fuente sin `currency_check` en el `symbols.json` subido se queda sin descargar, y la tarea lo deja como hallazgo en su registro.
- **Las claves**, de SSM (`SecureString` bajo `/atlas/<entorno>/`, nombres en el plan), leídas en cada ejecución, **nunca en una variable de entorno ni en un registro**, y **censuradas en toda URL** que llegue a un error. **Sin claves** (el caso de `dev`, ADR-0034, fila 2), la tarea no descarga, **no cuenta fallos seguidos**, lo dice en el registro con un código y **no deja ningún hallazgo para el correo**.
- **La fuente simulada de `dev`** ([§8.1 P14](#p14-resp), precisada en [§8.2 m3](#r1-m3m)): un adaptador de `PriceSource` con respuestas fijas. **Es la única excepción declarada al guardián de los dobles**, y el guardián la nombra de forma explícita: **viaja en `jobs.zip`**, porque se construye una vez y se promociona, pero **la composición se niega a usarla si el entorno es `prod`**, con su test y su mutante.
- **Los hallazgos de E2**, cada uno solo cuando hay algo que hacer. **La tarea de precios nunca envía correo** ([§8.2 B2](#r1-b2)): deja cada hallazgo en su registro de ejecución, bajo `jobs/`, y la función de correo de E1 lo envía y apunta la racha:
  - **fallos seguidos** de una fuente al llegar al umbral (ADR-0031, tercera enmienda, §5: solo `unavailable`, `rate_limited`, `blocked` e `invalid_response`), **una vez por racha**, no uno al día;
  - **una tesis del cubo con el horizonte vencido** (`horizon_exceeded`, `packages/domain/src/projections/bucket.ts:156`), la única regla que existe ([§8.2 B1](#r1-b1)). **La condición de invalidación es texto libre y no genera aviso** (§4);
  - **un hallazgo del BCE**, por el mismo camino (propuesta de quien redacta en [§8.2 B2](#r1-b2), a confirmar en el alto).

#### Bloque 3 — `atlas admin prices push` ([§8.1 P18](#p18-resp), enmendada en [§8.2 M4](#r1-m4) y [M5](#r1-m5))

- **Sube solo `prices/symbols.json`** de la carpeta al bucket, con el rol de administración y MFA, como las demás órdenes de `atlas admin`. **No guarda ningún estado local**: lee el objeto remoto, **enseña la diferencia** con el local y **pide confirmación tecleando el nombre del entorno**. **Rechaza `--yes`**, y sin terminal sale con 4 sin tocar nada. Escribe con `If-Match` sobre el ETag de **esa misma lectura** (o `If-None-Match: *` si no había objeto); un conflicto no escribe nada.
- **Se niega** a subir un `symbols.json` con `misstored` (hay que purgar antes en local), uno que no se lee o uno de un formato más nuevo.
- **Nunca sube `prices/config.json`**, que sigue siendo el presupuesto de la consola.
- Revisión en la zona **Z3**, con sus mutantes (§6, 13 bis).

### E3 — Los dispositivos beben de la nube

#### Bloque 1 — La consola deja de pedir lo que ya bajó la nube (ADR-0031, «Una sola clave, un solo presupuesto diario»)

- En una carpeta sincronizada con un remoto (`sync/remote.json`) cuya nube tiene precios, **`atlas prices update` baja de la API** (`GET /api/reference/index` y `GET /api/reference/prices/<name>`, con el token de la carpeta y el cliente HTTP de la 015) **y no llama a EODHD ni a Alpha Vantage**. Llamar a las fuentes desde esa carpeta es **una opción explícita**, que dice que gasta el cupo que comparte con la nube ([§8.1 P11](#p11-resp)).
- **Lo que baja se añade a los ficheros locales con las reglas de la 013** ([§8.1 P7](#p7-resp)): una línea solo si no hay ninguna de esa fecha, si es de la misma fuente con otro valor, o si es de una fuente anterior en el orden. Nunca se reescribe un byte local. **La red, fuera del cerrojo; comparar y escribir, dentro.**
- **La consola no cambia con el BCE** ([§8.1 P16](#p16-resp)): sigue descargándolo del BCE, que no tiene cupo.
- `atlas prices status` dice **de dónde vinieron** los precios de la carpeta y cuándo.

#### Bloque 2 — La web del móvil descarga el histórico del BCE (015, §7 P12)

- Con sesión, **una tercera procedencia** además de la carpeta y la copia importada: la web lee `manifest.json` y el fichero en vigor de `GET /api/reference/ecb/…`, **comprueba el SHA-256 del manifiesto** y lo guarda como hoy guarda la copia importada. Un fichero que no cuadra **no se usa** y se dice.
- **Solo cuando el usuario lo pide o al abrir la tarjeta del BCE**, con `If-None-Match` sobre la versión que tiene. **Nada lo dispara al arrancar ni con un temporizador**: los guardianes de la 014 siguen en verde.
- **Los precios en el móvil también** ([§8.1 P7](#p7-resp)), con las mismas reglas y en carga diferida. Si no caben en la autorización de [§8.1 P13](#p13-resp), **para**: solo el BCE es obligatorio (015, §7 P12).
- **La CSP no cambia** (`connect-src 'self'`): es el propio origen.

#### Bloque 3 — `notification_email` sale de la web, y `alert_channels`

- **Ajustes deja de ofrecer `notification_email`**. **El cargador lo sigue aceptando** en las líneas `settings_changed` ya escritas (ADR-0018: retirarlo del validador sería endurecer), **la lista congelada de claves de `Settings` no cambia** y **el generador sintético no se toca** (está en el *golden*). **Una foto nueva de `settings_changed` ya no lo lleva** ([§8.1 P12](#p12-resp)): las líneas antiguas lo conservan, porque el libro es append-only. **La regla vive en el dominio** ([§8.2 M7](#r1-m7)) y la usan **la web y la consola**, que también escribe fotos completas (`apps/cli/src/commands/catalogue.ts:516`); un test la fija en las dos.
- **`alert_channels`**: `docs/specification.md` §5 dice que «entra en §7 el día que la Fase 4 la implemente». Con la constitución **1.6.0** (principio IV), una configuración que ninguna cifra lee **no va en `Settings`**: va fuera del libro, junto al destinatario, o no existe. **Tú no tocas `docs/`**: escribes en `questions.md`, apartado «Documentos», la redacción que propones, y la dirección la aplica. **No se implementa** ([§8.1 P17](#p17-resp)): la redacción que propones dice que, si algún día existe, vive fuera del libro, junto al destinatario, y nunca en `docs/business-rules.md` §7.

### E4 — Copias, integridad y avisos periódicos (ADR-0032, ADR-0028)

#### Bloque 0 — Verificar antes de escribir código

1. **Que el rol de una tarea puede escribir `backups/<YYYY-MM>/` solo con `If-None-Match: *`**, y qué permisos exige (la 015 verificó que `If-Match` pide también `s3:GetObject`, §23.1). Para la lista de la 017.
2. **Cómo lee la tarea el tamaño del libro** sin descargarlo si no hace falta (`HeadObject`, o el tamaño del listado), con su permiso.

#### Bloque 1 — El volcado mensual

- En `backups/<YYYY-MM>/` (el mes de `Europe/Madrid`): **el libro byte a byte**, el histórico del BCE en vigor **con su manifiesto**, `prices/` entero y **`positions.json`**, la proyección valorada, legible sin la aplicación (su forma, en el plan). **Cada objeto con `If-None-Match: *`: un volcado nunca se sobrescribe.** Si el objeto existe con los mismos bytes, se deja; si tiene otros, **se niega y avisa**, como `atlas backup` en E5 de la 015 (§33.7).
- **El volcado de un mes a medias** (un corte entre dos objetos) lo termina el reintento sin pisar lo escrito, y el registro de ejecución lo sabe. Test de corte.
- **Notifica solo si falla.**

#### Bloque 2 — La integridad y el ensayo de restauración, cada trimestre

- **Recalcular todo desde cero y comparar**, y **el ensayo automático de restauración**: cargar el último volcado en un almacén en memoria, proyectarlo y compararlo con la proyección del libro vivo **cortado en los mismos eventos** (ADR-0032). La comparación es del dominio. **Cualquier diferencia manda un correo** que dice qué difiere, sin importes salvo el interruptor.
- **Nunca en `dev` con datos reales** (ADR-0032): en `dev` solo hay datos sintéticos, y la tarea no hace nada distinto por entorno.
- **El tamaño del libro** (ADR-0028): la tarea lo informa y **avisa al pasar del umbral** (1 MB, configuración de la Lambda con ese valor por defecto) para que se revise el plazo de expiración de las versiones no vigentes de ADR-0006. El aviso dice el tamaño y el umbral, que no son importes.

#### Bloque 3 — Los avisos periódicos

Cada uno **solo cuando hay algo que hacer**, con los umbrales de `Settings` (nunca un número en el código):

- **semanal**: las desviaciones de los pesos del núcleo por encima de `deviation_threshold_pp`, y las reglas del cubo (17 y 18 del plan; el peso del cubo sobre el patrimonio);
- **enero**: los datos de la Renta del ejercicio anterior están listos, con cuántas notas y criterios en disputa lleva (ADR-0024), **sin la base ni ninguna cifra** salvo el interruptor;
- **anual**: los umbrales del 720 y el 721, con `model_720_alert_threshold_eur` y `model_721_alert_threshold_eur`, **calculados solo con valoraciones manuales**, por la misma función que usa el modelo y que no alcanza la puerta de precios. **Un test siembra cierres automáticos posteriores** que harían saltar el aviso si entraran, y comprueba que no salta.

#### Bloque 4 — Los procedimientos

En `specs/016-scheduled-jobs/runbooks/`, en español, **probados en todo lo que no necesita AWS real** (contra los dobles), con lo que no se pudo probar dicho como tal:

1. **Qué hacer con cada correo de aviso**: fallos seguidos de una fuente, hallazgo del BCE, discrepancia de integridad o de restauración, libro por encima del umbral, volcado fallido.
2. **Activar o desactivar los importes en el correo**, y **cambiar el destinatario**: los dos en `terraform.tfvars`, **nunca a mano en SSM** (ADR-0034, filas 12 y 21; [§8.2 M3](#r1-m3)), **sin dejar la dirección en el historial del *shell***.
3. **Subir la correspondencia de símbolos a la nube** con `atlas admin prices push` (E2, bloque 3): cuándo hay que volver a subirla, cómo se lee la diferencia y cómo se confirma tecleando el entorno. **Cambiar los presupuestos de la nube** es cambiar sus variables en `terraform.tfvars` ([§8.2 M5](#r1-m5)).

## 4. Fuera de alcance y bloqueado

- **Desplegar, y todo lo que toca AWS de verdad** (018 y 019). **La infraestructura** (017): las programaciones de Scheduler, desactivadas en `dev`; los roles con su límite de permisos; la identidad de SES y la condición de IAM; los parámetros de SSM y **el guion de secretos**, que creará los de esta feature con los nombres y formatos que fijes. Tú entregas **la lista de permisos** de cada Lambda y **los nombres y formatos**, no los recursos.
- **Las tareas bloqueadas por los importadores** (Ronda 6): la importación diaria de IBKR, la conciliación semanal y la rotación del token Flex.
- **El ensayo anual de restauración** en la máquina del usuario: es un procedimiento manual (§9.5), y ya está escrito (`docs/runbooks/restore-the-ledger.md`).
- **La subida de `documents/` e `imports/` al bucket** (015, §7 P5): sigue sin etapa.
- **Las mejoras visuales aprobadas**: van después de la 015, en su propia ronda, y compiten con esta feature por el paquete (§0).
- **Un aviso automático por la condición de invalidación de una tesis** ([§8.2 B1](#r1-b1)): `Thesis.invalidation` es texto libre (`packages/domain/src/projections/state.ts:252`), y darle forma tocaría el esquema. El único aviso de tesis es el del horizonte vencido.
- **Aceptar una ADR** (puedes proponerla, con `/adr`), reabrir una aceptada, cambiar el esquema del libro o el contrato de `docs/api.md`, **salvo P6 y P6 bis** ([§8.1 P6](#p6-resp) y [P6 bis](#p6bis-resp), con [§8.2 M1](#r1-m1)), que lo cambian por decisión de la dirección.

## 5. Autocomprobación antes de abrir cada PR

Estas son **las diez familias de defectos que las revisiones de la 015 encontraron una y otra vez**, a veces en la misma entrega y después de un arreglo. **Antes de congelar y de pedir revisión**, las pasas tú, **las diez**, sobre lo que cambia esa entrega, y escribes en `questions.md` una tabla: **familia, qué miraste, con qué orden o test, y lo que salió**. «No aplica» vale solo con el motivo escrito. Si una revisión encuentra después un defecto de una familia que dabas por pasada, se anota como hallazgo también sobre la autocomprobación.

Las citas son de `specs/015-api-access/questions.md` (rama `feature/015-api-access`) y de las revisiones de la PR #98, que son el registro más reciente.

**1. Guardianes que se pueden eludir.** Una regla que lee el texto de los fuentes con una expresión regular no ve lo que el empaquetador sí une: una reexportación, una ruta relativa, un alias, un `import()` con plantilla, un `?raw`, un `?url&inline` o un *worker*. En la 015 sobrevivieron así, uno detrás de otro:
   - el `?url&inline` de un `.tsx` (V5-tsx y V5-cts, §20.1);
   - la clave `sync:` compuesta en tiempo de ejecución, que el guardián textual no ve (§30.3, aceptado como riesgo);
   - el salto por `sync-controller`, la reexportación y el alias de ruta absoluta (MB1 a MB3, §31.1 y §31.4);
   - y el temporizador que llegaba al motor a través de `App.tsx` (O1, §32.1).
   Antes, en E1, el *worker* `?worker&inline`, el `?raw` y el alias con `preserveSymlinks` (V1 a V4, §16.4).
   - **Ejemplo**: MB2 era un fichero `src/sync/controller-relay.ts` que solo reexportaba el controlador; la regla estática lo dejaba pasar y el grafo solo fallaba «por bytes», sin ningún mensaje de regla.
   - **En esta feature**: que el código de las tareas, el `Notifier`, SES y las claves no se alcancen desde la API ni desde la web. **Comprueba cada guardián nuevo con la batería de elusiones** (reexportación, ruta relativa, alias, `import()` no literal, `?raw`, `?url&inline`, *worker*), **mírala morir por su regla** y no por los bytes, y **cuenta los tests de guardianes** contra `develop`: un guardián borrado no falla (§33.4). **Y un comentario que afirma un guardián tiene que tener el guardián**: `sdk-admin.ts` decía «never reached by the web (architecture tests)» y no había test (revisión de seguridad de la PR #98, N7).

**2. Reglas del código sin su test, o tests que no fijan el valor exacto.** Un test que pasa con cualquier implementación da cobertura falsa. En la 015:
   - siete mutantes de un revisor sobrevivieron a los tests de E2 (S1 a S7, §22.3 y §22.4);
   - once de doce sobrevivieron a los de E3 antes de su ronda (§26.3);
   - un test de estructura solo probaba el caso en que las dos variantes se niegan igual (C4, §28.3).
   - **Ejemplo**: `own-coverage.test.ts` afirmaba solo `amount_eur.toString() !== "0"` para la pérdida diferida de la propuesta de la Renta. **El mutante que cambia `total.add(…)` por `total.sub(…)` en `filings/proposal.ts:109` sobrevivía**: la cifra fiscal podía salir con el signo cambiado y el único test que cubría la línea no lo veía (revisión de corrección de la PR #98, B2). Del mismo sitio, un `every` sobre una lista que puede venir vacía (N1).
   - **En esta feature**: **cada cifra de un correo con el interruptor encendido, cada recuento** (tokens vivos, días sin iniciar sesión, llamadas reservadas) **y cada umbral se afirma con su valor exacto**, y con el signo cuando lo tiene. **Cada regla de la tabla del alto tiene un mutante que la rompe y un test que lo mata**, visto morir.

**3. Tests que dependen del reloj o de la red.** Un test que espera un tiempo fijo falla con la máquina cargada, y uno que depende de la hora del día falla un día al año.
   - **Ejemplo**: `apps/web/test/prices.test.tsx` esperaba con `settle(30)` y falló en la ejecución de un revisor. Se cambió a `until`, pero una última aserción siguió sin esperar, y la frase «ningún test falló solo por el tiempo» se escribió dos veces sin ser cierta (§26.2 N4, §26.4 y §27.1).
   - **En esta feature**, que vive del reloj: **ningún test lee la hora real**; todos usan un `Clock` fijo, **ni un `setTimeout` para esperar** a algo que tiene condición, y **los bordes con su test**: el cambio de hora de marzo y octubre en `Europe/Madrid`, fin de mes, 31 de diciembre a las 23:59 frente al 1 de enero, y la medianoche GMT del cupo de EODHD. **Ninguna llamada de red**: el test de la tubería busca `ECONNREFUSED` y cualquier `fetch` sin doble, como en la 015 (§20.11).

**4. Documentos desalineados con el código, o la descripción de la PR desactualizada.**
   - **Ejemplo**: la descripción de la PR #98 decía que el código estaba congelado en `a0a06ea` cuando llegaba a `b04e828`, que el punto 4 era «PROPOSAL, not applied» cuando ya estaba aplicado, y que los procedimientos estaban en `specs/…/runbooks/` cuando estaban en `docs/runbooks/` (revisión de corrección de la PR #98, P1).
   - Otros casos de la 015: el nombre real de `pre-restore-…` frente al de `data-schema.md` (§33.10); un commit que debía llevar la hoja de ruta y no la llevaba (§22.5); y un borrador de procedimiento que decía que el SDK pedía el código de MFA, y no lo pide (§33.6).
   - **En esta feature**: **antes de pedir revisión, relee la descripción de la PR contra el último commit**: SHA congelado, qué está aplicado, dónde vive cada fichero y qué dice la tubería. **Cada afirmación de un documento o de un comentario sobre la conducta del código cita fichero y función**, y la contrastas con el código, no con tu memoria. La lista de «Documentos» de `questions.md`, al día en cada entrega.

**5. El techo del paquete subido después del commit que lo necesita.** El *build* estuvo en rojo desde `d8c7885` hasta `2ecf09f` porque `rawLinesText` costaba **+37** en el arranque y el techo se subió después, en `9d45cdb` (§26.5). Antes, en E1, `d82e45a` y `f20c5bf` (`docs/prompts/000-director-handoff.md` §5.6). Y dos commits de E4 que no pasaban solos (§28.5).
   - **Ejemplo**: `rawLinesText`, del párrafo de arriba.
   - **En esta feature**: **mide con un prototipo construido y deshecho antes de cada commit que toca la web**. Si hay que subir un techo, va **en su propio commit, antes**, con la medida, el desglose y la tendencia en el comentario de `check-bundle.mjs`. Y **cada commit de la rama pasa `build`** si toca la web: compruébalo con un guion que construya **cada commit nuevo en un worktree desacoplado** antes de empujarlo, sin reescribir nada.

**6. Registros con datos sensibles, sin cubrir en los caminos de fallo.** El camino feliz se prueba; el que se rompe, no. En la 015:
   - el test de centinelas no cubría las rutas nuevas de E2 ni sus fallos, y al extenderlo encontró que el registro tiraba una plantilla de ruta (§22.1, B1);
   - el `token_id` que quedaba vivo no salía en el registro cuando fallaban todas las revocaciones (§24.1, R2-2);
   - un error de arranque del SDK llevaba el ARN en su mensaje (§26.1, N2);
   - y un `AccessDenied` no transitorio llevaba el *bucket*, la clave y la cuenta (§26.1, N4).
   - **Ejemplo**: `lambda.ts` relanzaba el `AccessDeniedException` entero, con el ARN en el mensaje, hasta que se capturó como `compose_failed` con solo `error_name` (§26.1, N2).
   - **En esta feature**: el destinatario, el cuerpo de un correo, una clave de fuente (también dentro de una URL de error), un `asset_id` y un importe **nunca** en un registro. **El test de centinelas recorre cada tarea por su camino de fallo**: SSM limitado, SES que rechaza, una fuente que responde 401, S3 que da `AccessDenied`, el arranque sin configuración. Captura `stdout` y `stderr`, y **prohíbe registrar tal cual el mensaje de un error ajeno** (del SDK, de `fetch`, de `JSON.parse`, de SES).

**7. Entradas del exterior sin validar de forma estricta.** En la 015:
   - una línea con **un suplente suelto** dejaba el remoto en bytes que no son UTF-8, y desde ahí toda escritura por la API daba `500` (§26.1, B1);
   - **una clave repetida** en una línea (`JSON.parse` se queda con la última sin avisar) dio Q12 (§26.1 N3, §27.2 y §33.3);
   - `--env __proto__` o `--env toString` encontraban un entorno por el prototipo (revisión de seguridad de la PR #98, N6);
   - restaurar desde un fichero lo decodificaba sin `fatal` y convertía un byte inválido en `U+FFFD` (N9);
   - y una clave de S3 que saldría del destino se niega con `bucket_key_unsafe` (§33.7).
   - **Ejemplo**: el suplente suelto, arriba.
   - **En esta feature**, todo lo que llega de fuera se lee de forma estricta: el evento de Scheduler, los parámetros de SSM (el destinatario, el interruptor), la respuesta de SES, lo que baja de `/api/reference/*` en la consola y en la web (UTF-8 con `fatal: true`, el SHA-256 contra el manifiesto), y cada clave de S3 que se construye a partir de un `asset_id` o de un mes (**sin recorrido de rutas**: ni `..`, ni `/`, ni una clave vacía). **Un mapa indexado por lo que dice el exterior** usa `Object.hasOwn` o un objeto sin prototipo.

**8. Escrituras en dos pasos sin probar el corte entre ellos.** En la 015:
   - archivar y escribir el libro en S3 son dos escrituras condicionales, y hasta el test del corte (`6b01733`) un mutante que reutilizaba el archivo sobrevivía (S3C, §25);
   - el token creado antes de que fallara el objeto del dispositivo se quedaba vivo (§22.2, N3);
   - `sync redo` se registraba dos veces tras un corte entre registrar y terminar (§26.2, N1);
   - y olvidar un dispositivo deja una ventana entre revocar y marcar (§33.7; revisión de seguridad de la PR #98, N8).
   - **Ejemplo**: S3C, arriba: el mutante sobrevivió a todos los tests de la carrera y solo lo mató el test que corta el proceso entre las dos escrituras.
   - **En esta feature**, casi todo son dos o más pasos: reclamar y cerrar el registro de ejecución; **enviar el correo y apuntarlo**; reservar el cupo y añadir los cierres; el manifiesto y el fichero del BCE; los objetos del volcado de un mes. **Enumera cada secuencia en el plan, con lo que ve un lector y lo que hace el reintento en cada hueco, y un test de corte en cada uno**, visto matar a un mutante que invierte el orden.

**9. Procedimientos (runbooks) con pasos imposibles en el estado en que se ejecutan, o que dejan secretos en el historial.** En la PR #98:
   - el paso 5 de la cuenta robada pedía `atlas sync` después de quitar el par y revocar todos los tokens, y fallaba con `not_allowed` o `device_token_revoked` (revisión de seguridad, B1);
   - la alternativa con `jq` usaba `echo`, que en `dash` y en `zsh` interpreta `\`, y un token se quedaba sin revocar; además decía «probado» sin un ensayo versionado (N3);
   - `--value '{"allow_list_format":1,"entries":[{"sub":"…","email":"…"}]}'` dejaba el `sub` y el correo en `~/.bash_history` (N4);
   - y `--value "$(…)"` fallaba cuando la clave empezaba por `-` (N5).
   - **Ejemplo**: el paso 5, arriba.
   - **En esta feature**: **recorre cada procedimiento contra los dobles en el estado exacto que deja el paso anterior**. Nada personal ni secreto en una línea de orden: `file://` con un fichero `600` que se borra después, o la entrada estándar. `printf '%s\n'` en lugar de `echo`, el bloque marcado con su *shell*, y **«probado» solo con el ensayo versionado** en el repositorio.

**10. `--yes` en operaciones destructivas.** `confirm` devuelve `true` con `--yes` sin enseñar nada (`apps/cli/src/commands/shared.ts:97-99`), y `atlas admin restore`, `compact` y `forget-device` lo aceptaban.
   - **Ejemplo**: en diciembre, el usuario recupera del historial (Ctrl-R) `atlas admin restore --env prod --from backups/2026-10 --yes`, y la nube vuelve a octubre sin ninguna pregunta. ADR-0032, paso 4, pide «confirmación explícita, con esa lista delante», y un `--yes` escrito antes de ver la lista no la cumple (revisión de seguridad de la PR #98, N1).
   - **En esta feature**: ninguna orden nueva que escriba en el bucket, que envíe un correo o que no se pueda deshacer acepta `--yes`. **Decidido en la PR #98** (N1; `questions.md` §35, decisiones sobre las revisiones de la PR #98): `atlas admin restore`, `compact` y `forget-device` **rechazan `--yes`**, y la confirmación **exige escribir el nombre del entorno**. Toda orden destructiva nueva de esta feature sigue la misma regla, **`atlas admin prices push` incluida**, porque sobrescribe: rechaza `--yes`, enseña la diferencia, pide que se teclee el entorno, y **sin terminal sale con 4 sin tocar nada**.

## 6. Criterios de terminado

Valen **para cada entrega**, sobre lo que esa entrega construye, y para la feature entera al final:

- `lint`, `typecheck`, las dos pasadas de la cobertura, `build` y CI en verde; `packages/domain` al **100 %** de líneas, ramas, funciones y sentencias **en su propia pasada**; **los tests de arquitectura en verde**, con la cuenta de sus tests igual o mayor que en `develop`.
- **La autocomprobación de §5, pasada y escrita**, las diez familias.
- **El bloque 0 de cada entrega escrito y reportado antes de su primer commit de código**, cada verificación con su fuente, su fecha y su salida, y **la lista de lo que la dirección tiene que escribir en cada ADR** (ADR-0034, fila 12 y fila 9; ADR-0031; ADR-0032).
- **Cada regla de la tabla del alto con su test**, y **cada respuesta de §8 aplicada con el test que la ata**.
- **Cada código nuevo** de rechazo, negativa y fallo, **con su literal** y traducido donde se enseñe (la consola, la web, el correo), con `tests/messages.test.ts` extendido.
- **Tests vistos en rojo primero**, y de cada arreglo, **cómo lo viste en rojo** y **qué volviste a mirar alrededor**, en `questions.md`.
- **Ningún gemelo `.js`** en el árbol de trabajo, comprobado antes de cada lote de mutación y antes de cada PR.
- **La salida fiscal no se mueve.** La **predicción** —que no se mueve nada— se escribe en `questions.md` **antes** de correr la suite: `tax` (con `--lots`, `--boxes` y `--json`), `gains`, `income`, `m720`, `m721` y `filed` dan los mismos bytes con y sin `prices/` de la nube, y **ningún fichero dorado cambia** (`git diff tests/fixtures` vacío). **Retirar `notification_email` de la web no toca el generador ni el *golden*.** Si algo se mueve, se para.
- **Revisión por mutación**, con la disciplina de §2 ter y las reglas de memoria de §2 quater. Los tests que matan, como mínimo, estos mutantes, **cada uno visto morir**:
  - **E1**:
    1. **un importe, una cantidad, un precio, un nombre de activo, un ISIN o una cuenta** en un correo con el interruptor apagado (el test que renderiza);
    2. **el interruptor** leído como encendido con un valor que no se entiende, o ausente; o **leído por otro módulo** que la composición de la tarea (el adaptador de SES, la redacción), con otra regla ([§8.2 M2](#r1-m2));
    3. **el `Notifier` recibiendo el destinatario** desde el dominio, o enviando con un destinatario que no es el de SSM;
    4. **el recordatorio mensual apagado** por `job_frequencies`, o que no llega con un libro inválido o sin precios; y **una clave o un valor desconocidos de `job_frequencies`** que invalidan el libro, o que se usan en silencio sin decirlo;
    5. **una tarea que toca dos veces** en el mismo periodo tras un reintento, o que no toca tras un corte entre reclamar y hacer;
    6. **el mes, el trimestre o el año en UTC** en lugar de `Europe/Madrid` (el 31 de diciembre a las 23:30 de Madrid);
    7. **un evento de Scheduler con un campo desconocido**, o con una tarea que esa Lambda no tiene, que se ejecuta;
    8. **el recuento de tokens** que omite un registro ilegible, o que cuenta como vivo uno revocado o caducado;
    9. **registrar** el destinatario, el cuerpo, un importe o el mensaje de un error de SES o de SSM (el test de centinelas, también en los caminos de fallo); y **el objeto del último inicio de sesión web** con algo más que la fecha (un `sub`, un correo, un dispositivo), o que retrocede;
    10. **el `Notifier` de fichero alcanzable** desde el artefacto de producción;
  - **E2**:
    11. **pedir el día en curso**;
    12. **devolver una llamada reservada** tras un corte o un conflicto, o **reservar después de llamar**;
    13. **la tarea escribiendo `symbols.json`**, o leyendo un `prices/config.json` en la nube en lugar de su configuración;
    13 bis. **`atlas admin prices push`** ([§8.2 M4](#r1-m4)): subir un `symbols.json` con `misstored`; sobrescribir sin `If-Match` sobre la lectura que enseñó la diferencia; aceptar `--yes` o confirmar sin teclear el entorno; guardar estado local; o subir también `config.json`;
    14. **descargar una correspondencia sin contrastar**;
    15. **la clave en un registro, en un error o en una URL guardada**;
    16. **sin claves, contar un fallo seguido** o mandar un correo;
    17. **la fuente simulada** usada por la composición con `ATLAS_ENV=prod`, o **una segunda excepción** al guardián de los dobles que no se nombra ([§8.2 m3](#r1-m3m));
    18. **el aviso de fallos seguidos** que se repite cada día de la misma racha, o que cuenta `not_found` o `budget_exhausted`;
    18 bis. **la tarea de precios enviando un correo** o con cualquier permiso `ses:*` en la lista del alto, o **la función de correo alcanzando una clave de fuente** ([§8.2 B2](#r1-b2)); y **un aviso de tesis por algo que no es `horizon_exceeded`** ([§8.2 B1](#r1-b1));
    19. **el BCE activado a medias**: un lector que ve el fichero nuevo con el manifiesto viejo como si cuadrara, o una actualización que pisa un tipo ya publicado;
    20. **un conflicto de S3 que se reintenta** dentro de la misma ejecución;
    21. **los activos sacados de otra parte** que el libro remoto;
  - **E3**:
    22. **la consola llamando a EODHD o a Alpha Vantage** en una carpeta cuya nube tiene precios, sin la opción explícita;
    23. **reescribir un byte local** al añadir lo que baja, o añadir una línea que las reglas de la 013 no añaden;
    24. **la red con el cerrojo tomado**;
    25. **la web usando un histórico que no cuadra** con el SHA-256 de su manifiesto, o **descargándolo al arrancar** o con un temporizador;
    26. **Ajustes ofreciendo todavía `notification_email`**, o **el cargador rechazando** una línea antigua que lo lleva; y **una foto nueva de `settings_changed` que todavía lo lleva**, escrita **desde la web o desde la consola** ([§8.2 M7](#r1-m7));
    27. **cualquier módulo nuevo de la web en el arranque**;
  - **E4**:
    28. **sobrescribir un objeto de `backups/`**, o dejar un mes a medias que el reintento no termina;
    29. **el ensayo de restauración** que compara con el libro vivo sin cortarlo en los mismos eventos, o que no avisa de una diferencia;
    30. **el aviso de tamaño** con el umbral escrito en el código, o que no salta justo por encima;
    31. **el aviso del 720 o del 721 calculado con cierres automáticos** (el test siembra cierres posteriores que lo harían saltar);
    32. **un aviso periódico que se envía sin nada que hacer**;
    33. **un paso de un procedimiento** que no se puede ejecutar en el estado que deja el anterior (el ensayo versionado);
  - **Siempre**: 34. **una cifra fiscal que cambie**; 35. **plegar dos códigos** en uno; 36. **una orden nueva destructiva que acepte `--yes`**, o que confirme **sin que se teclee el nombre del entorno**.
- **Verificación en el navegador, con capturas medidas**, en E3: a **400×890 con DPR 3** y a **2045×1141**, más **360** de ancho sin desplazamiento lateral (`scrollWidth === clientWidth`); con el libro vacío y con datos; con el modo privacidad puesto y quitado; claro y oscuro al menos una vez. Lo que hay que mirar: la tarjeta del BCE con la descarga de la nube (bien, sin conexión, con un fichero que no cuadra) y Ajustes sin `notification_email`. **Y en E1, los correos**: el cuerpo de cada uno, con el interruptor apagado y encendido, entregado como texto con el `Notifier` de fichero. Las capturas van a `~/personal/atlas/privado/capturas/<fecha>-<asunto>/`, **nunca al repositorio**.
- **El paquete web, medido en cada entrega.** Todo lo nuevo de la web va en carga diferida, en `LAZY_ONLY` desde su primer commit. **El techo del arranque no sube** ([§8.1 P13](#p13-resp)): todo lo nuevo, en carga diferida. **El total, lo medido y hasta 3 KB** por encima del techo de partida. Por encima de cualquiera de los dos, se para. El total sube, dentro de esa autorización, con la regla de siempre: lo medido más un margen pequeño, **en su propio commit y antes del que lo necesita**.
- **`docs/` sin cambios**, salvo una ADR en estado `Propuesta` si la propones. Y `specs/016-scheduled-jobs/questions.md` con: el bloque 0 de cada entrega y sus fuentes, la autocomprobación de cada entrega, lo preguntado y lo respondido, el SHA congelado, cómo viste fallar cada test, lo medido del paquete, los procedimientos y su ensayo, y **la lista de documentos que la dirección tendrá que actualizar**. Como mínimo:
  - `docs/specification.md` §5 (`alert_channels`), §9.2 y §9.5;
  - `docs/business-rules.md` §7 (`notification_email`, `job_frequencies`);
  - `docs/data-schema.md` §1: quién escribe `prices/` y `reference/ecb/` en la nube, el registro de ejecución, `positions.json`, el objeto de la fecha del último inicio de sesión web (P6) y los nombres de `prices/` que se sirven (P6 bis);
  - `docs/api.md` §6 (`REFERENCE_NAME` con `%XX`, P6 bis) y el objeto que escribe la API al iniciar sesión (P6);
  - ADR-0034 (fila 12 verificada, fila 9 sobre SES y Scheduler), ADR-0031 (el cupo compartido) y ADR-0032 (el volcado);
  - `docs/dependencies.md`, si el usuario autoriza un paquete;
  - los procedimientos para `docs/runbooks/`;
  - `docs/decision-roadmap.md` (017: la lista de permisos) y `docs/prompts/README.md`.
- **`npm run lint` como último paso** de cada entrega, redirigiendo a un fichero y leyendo `$?`. Commits de una línea, sin rastro de IA, uno a uno en verde, y la rama empujada.

## 7. Decisiones

### 7.1 Lo que ya está decidido, con su fuente (este prompt no lo reabre)

- **(a) Solo las tareas que no dependen de los importadores.** *Fuente:* `docs/decision-roadmap.md`, entrada de la 016; `docs/specification.md` §9.5.
- **(b) El destinatario tiene una sola fuente, `terraform.tfvars`**, de la que Terraform escribe el parámetro `String` de SSM que lee la Lambda y la condición de IAM del envío; **el interruptor de importes vive en SSM, junto a él**, también como `String` escrito por Terraform, por defecto «sin importes» ([§8.2 M3](#r1-m3)); ninguno de los dos en `Settings` ni en el repositorio. *Fuente:* ADR-0028, filas 17 y 18; ADR-0034, fila 12; `docs/business-rules.md` §7.
- **(c) Los correos no llevan importes por defecto**; el mensual llega siempre, los demás solo cuando hay algo que hacer. *Fuente:* ADR-0028, fila 18; constitución V; `docs/specification.md` §9.5.
- **(d) Las claves de las fuentes, en SSM como `SecureString`**, creadas por el guion de secretos con el rol de administración, **nunca por Terraform** ni en una variable de entorno; **`dev` no lleva las del usuario**. *Fuente:* ADR-0031, «Claves de API»; ADR-0034, filas 2 y 21; `docs/specification.md` §11.8.
- **(e) Una sola clave, un solo cupo: la consola deja de pedir lo que ya pidió la nube** y lo baja de la API. *Fuente:* ADR-0031, «Consecuencias»; `docs/decision-roadmap.md`, «Etapas pendientes», 016.
- **(f) Las reglas de la 013 no cambian**: la cascada, nunca el día en curso, un cierre en vigor por fecha, la divisa declarada y contrastada, los fallos seguidos. *Fuente:* ADR-0031, tercera enmienda.
- **(g) El BCE, byte a byte**, que solo sustituye al anterior si contiene todos sus tipos con el mismo valor, con su procedencia. *Fuente:* ADR-0029, punto 2 y tercera enmienda.
- **(h) El volcado mensual** en `backups/<YYYY-MM>/`, para siempre, con el libro, el BCE, los precios y `positions.json`; **el ensayo de restauración cada trimestre**, en memoria, y **nunca con datos reales en `dev`**. *Fuente:* ADR-0032; ADR-0006.
- **(i) El aviso al pasar el libro de 1 MB**, en la tarea trimestral de integridad. *Fuente:* ADR-0028, «Revisión del plazo de las versiones».
- **(j) `notification_email` sale de la interfaz** y el cargador lo sigue aceptando. *Fuente:* ADR-0028, «Consecuencias»; ADR-0018; `docs/business-rules.md` §7.
- **(k) La web del móvil descarga de la API el histórico del BCE**, y la CSP no cambia. *Fuente:* `docs/prompts/015-api-access.md` §7 P12; ADR-0029, punto 3.
- **(l) Ningún precio automático llega a la fiscalidad**, tampoco a un aviso fiscal. *Fuente:* ADR-0031, segunda enmienda; `CLAUDE.md`, *domain trap* 5.
- **(m) La condición de IAM de SES, verificada por esta feature contra la API v2**, sin AWS real. *Fuente:* ADR-0034, fila 12 y «Consecuencias».
- **(n) En `dev`, las programaciones se crean desactivadas** (017), **y la 018 activa una vez** una con una fuente de precios simulada. *Fuente:* ADR-0034, fila 2.
- **(o) Nada se despliega ni toca AWS** en esta feature. *Fuente:* `docs/decision-roadmap.md`, etapa 2.

### 7.2 Lo que propone el plan y confirma la dirección en el alto

Sin elegir tú: cada una, **marcada como propuesta** en el plan, con su motivo.

- **(a)** Los **nombres y formatos de los parámetros de SSM** nuevos (el destinatario y el interruptor, `String` de Terraform; las claves de EODHD y Alpha Vantage, `SecureString` del guion de secretos), con la forma de la tabla de `docs/api.md` §9.
- **(b)** **Las variables `ATLAS_*`** de cada Lambda, con sus valores por defecto y sus techos fijos, como en `docs/api.md` §9: el remitente, el origen de la aplicación, el umbral de tamaño del libro (1 MB por defecto) y la fuente simulada.
- **(c)** **Las claves de `job_frequencies` y sus valores** ([§8.1 P5](#p5-resp)), y **la hora** de cada programación en `Europe/Madrid`: después de las 16:00 CET para tener el BCE del día, o por la mañana con el del día anterior.
- **(d)** **La forma del registro de ejecución** de cada tarea y dónde vive (un prefijo propio en el bucket de datos, por ejemplo `jobs/`).
- **(e)** **El texto de cada correo**: su asunto, sus frases y qué cifras lleva con el interruptor encendido.
- **(f)** **La forma de `positions.json`**, legible sin la aplicación.
- **(g)** **Los nombres de las órdenes nuevas de la consola**, si las hay (la opción explícita de llamar a las fuentes en una carpeta sincronizada; `atlas admin prices push`, [§8.1 P18](#p18-resp)).
- **(h)** **Cómo se ejercita todo en local**, sin AWS: por ejemplo, un guion en el *scratchpad* que compone cada tarea con los dobles y el `Notifier` de fichero. Condición: **ningún doble es alcanzable desde un artefacto de producción**, y un test lo comprueba; **la única excepción declarada es la fuente simulada de `dev`**, que el guardián nombra y que la composición se niega a usar en `prod` ([§8.2 m3](#r1-m3m)).
- **(i)** **Las zonas de revisión** de cada entrega, con sus ficheros (§2 quater).

## 8. Respuestas

### 8.1 Respuestas de la dirección a §9 (2026-09-27)

**Todas aceptadas tal como las recomendaba quien redacta**, con cuatro precisiones (P1, P3, P6 y P8). Además, la decisión sobre `--yes`, que llegó de la PR #98. Van con su motivo y con dónde las aplica el texto; §0 a §7 ya las citan como «§8.1 Pn».

- <a id="p1-resp"></a>**P1 — Sí: la 016 empieza desde `develop` después de fusionar la PR #98.** *Motivo:* E5 trae la puerta `@atlas/domain/tools`, la cobertura en dos pasadas, `atlas admin` y el techo del arranque, y la partida del paquete medida sin E5 sería falsa. Aplicada en el requisito previo y en §2, punto 1.
- <a id="p2-resp"></a>**P2 — Cuatro entregas, una rama y una PR por entrega**, como propone §3. *Motivo:* E1 cierra primero y sola la superficie más cara, lo que sale por correo, y fija el esqueleto de las demás. Aplicada en §3, «La partición».
- <a id="p3-resp"></a>**P3 — `apps/jobs` (`@atlas/jobs`).** *Motivo:* la API es la única pieza que alcanza Internet; con dos paquetes, «la API no alcanza SES ni las claves» es una regla sobre el grafo entre paquetes, y el artefacto de la API no crece. **Por orden expresa de la dirección, la PR de este prompt añade la línea de `apps/jobs` al bloque «Code architecture» de `CLAUDE.md`.** **La regla de dependencias** (`apps/jobs` importa el dominio y los adaptadores, y nada importa `apps/jobs`) **entra en el test de arquitectura como parte de E1**. Aplicada en §2 bis, en E1 (bloques 1 y 2) y en §6.
- <a id="p4-resp"></a>**P4 — Un solo artefacto (`jobs.zip`) y una Lambda por familia de permisos, cada una con su rol**: el BCE, los precios, el correo, el volcado y la integridad. El manejador se niega a una tarea que no está en la lista de su función (`ATLAS_JOBS`). *Motivo:* coste cero, «un rol por Lambda», y la clave de EODHD nunca al alcance del rol que envía correo. Aplicada en E1, bloque 2, y en la lista de permisos del alto (§2). *(Precisada en [§8.2 B2](#r1-b2): solo la función de correo envía.)*
- <a id="p5-resp"></a>**P5 — Una programación diaria por función y una función pura del dominio que decide si la tarea toca**, con un conjunto cerrado de claves y valores de `job_frequencies`, **lectura tolerante y escritura estricta**, y el recordatorio mensual que no se puede apagar. *Motivo:* la frecuencia se cambia desde la interfaz, como pide la especificación, sin tocar Terraform, y sin endurecer el validador (ADR-0018). Aplicada en E1, bloque 2, en §7.2 (c) y en el mutante 4.
- <a id="p6-resp"></a>**P6 — Opción (a), con una precisión: el objeto guarda solo la fecha del último inicio de sesión web**, sin `sub` ni correo. Lo escribe la API tras cada inicio de sesión web, con `If-Match` para que solo avance. La consola cuenta por el `issued_at` de sus tokens. *Motivo:* es lo que Google cuenta como uso del cliente OAuth, y un dato sin nada personal no necesita más protección que la del bucket. Aplicada en E1, bloque 4, en la zona Z1, en el mutante 9 y en la lista de documentos de §6.
- <a id="p6bis-resp"></a>**P6 bis — `REFERENCE_NAME` admite secuencias `%XX` en hexadecimal, y `_status.json` no se sirve.** *Motivo:* S3 no decodifica la clave, la regla ya prohíbe `/` y `..`, y ningún dispositivo necesita el estado de las fuentes de la nube. *(Enmendada en [§8.2 M1](#r1-m1): la regla es la ida y vuelta con `priceFileName`, con 255 como máximo.)* La dirección escribe el cambio en `docs/api.md` §6 al cerrar E2. Aplicada en §1, punto 11, en E2, bloque 0, y en §6.
- <a id="p7-resp"></a>**P7 — La consola añade lo que baja con las reglas de la 013**, conservando `source` y `fetched_at` de la nube, **y el móvil baja también los precios**, en E3 y en carga diferida. *Motivo:* no se pierde nada ni se inventa una regla, y ADR-0031 dice que «los dispositivos lo reciben por la API». Si los precios del móvil no caben en P13, solo el BCE. Aplicada en E3, bloques 1 y 2.
- <a id="p8-resp"></a>**P8 — `@aws-sdk/client-sesv2@3.1141.0`, que sustituye al `@aws-sdk/client-ses` presupuestado.** Solo en un adaptador fino de `packages/adapters/src/aws/`, con `SendEmail` como única orden. **`docs/dependencies.md` se actualiza en la PR de este prompt.** Se instala en E1, después del bloque 0. El usuario autorizó en su día instalar lo que haga falta (`specs/015-api-access/questions.md` §24.2), y la dirección se lo comunica. *Motivo:* ADR-0034, fila 12, habla de `SendEmail` de la API v2, y es la misma versión exacta de los otros dos clientes. Aplicada en §2 bis.
- <a id="p9-resp"></a>**P9 — «Sin importes»**: con el interruptor apagado, ni euros, ni cantidades, ni precios, ni saldos, ni posiciones, ni nombres de activos, ISIN, símbolos o identificadores de cuenta. Sí lleva las clases del núcleo, porcentajes (el reparto y las desviaciones en puntos), recuentos, fechas y códigos. Con el interruptor encendido se añaden los euros del reparto y de los avisos, **nunca** una cuenta ni un ISIN. Aplicada en E1, bloque 3, y en el mutante 1.
- <a id="p10-resp"></a>**P10 — El recordatorio mensual, al menos una vez**, con un identificador del periodo en el asunto. **Los avisos, como mucho una vez.** Pocos reintentos de Scheduler y ninguno de la invocación asíncrona, con los números del bloque 0 de E1. Cada caso, con su test de corte. Aplicada en E1, bloque 2, y en el mutante 5.
- <a id="p11-resp"></a>**P11 — El `prices/config.json` de la nube reserva por debajo del cupo del plan** (por ejemplo 18 y 23; la cifra es configuración del usuario), **concurrencia reservada de 1** en cada función de tareas, y **todas las escrituras condicionales**. Un conflicto aborta la ejecución sin reintentar. Aplicada en §0, en E2 (bloques 0 y 1) y en E3, bloque 1. *(Enmendada en [§8.2 M5](#r1-m5): los presupuestos de la nube son variables de entorno de la Lambda, no un `config.json` del bucket.)*
- <a id="p12-resp"></a>**P12 — Una foto nueva de `settings_changed` ya no lleva `notification_email`**; las líneas antiguas lo conservan. Con su test, y con una nota en `docs/business-rules.md` §7 que escribe la dirección. Aplicada en E3, bloque 3.
- <a id="p13-resp"></a>**P13 — El paquete web: el arranque, +0; el total, lo medido y hasta 3 KB por encima del techo de partida.** Por encima de cualquiera de los dos, se para, y se dice cuánto queda para las mejoras visuales. Aplicada en §0, en E3, bloque 2, y en §6.
- <a id="p14-resp"></a>**P14 — La 016 construye la fuente simulada de `dev`**, elegida solo por la configuración de la Lambda, que **se niega a arrancar con `ATLAS_ENV=prod`**. Aplicada en E2, bloque 2, y en el mutante 17. *(Precisada en [§8.2 m3](#r1-m3m).)*
- <a id="p15-resp"></a>**P15 — Los periodos de las tareas, en `Europe/Madrid`**; el día GMT del cupo de EODHD no cambia. Cada uno con sus bordes probados. Aplicada en §2 bis y en §5, familia 3.
- <a id="p16-resp"></a>**P16 — La consola sigue bajando el BCE del propio BCE.** Aplicada en E3, bloque 1.
- <a id="p17-resp"></a>**P17 — `alert_channels` no se implementa.** La redacción de `docs/specification.md` §5 se corrige: si algún día existe, vive fuera del libro, junto al destinatario (constitución IV, 1.6.0), y nunca en `docs/business-rules.md` §7. Aplicada en E3, bloque 3.
- <a id="p18-resp"></a>**P18 — `atlas admin prices push --env <entorno>`**, con el rol de administración y MFA, sube `symbols.json` y `config.json` con `If-Match` sobre lo que subió la última vez. **Un solo escritor por objeto**: la orden escribe esos dos, y la tarea nunca. La orden se niega a subir un `symbols.json` con `misstored`. **La tarea no contrasta nunca**: una fuente sin contrastar en el fichero subido no se descarga. Como sobrescribe, **sigue la regla de `--yes` de abajo**. Aplicada en §0, en E2 (bloques 1 a 3), en E4, bloque 4, y en §5, familia 10. *(Enmendada en [§8.2 M4](#r1-m4) y [M5](#r1-m5): va en E2, sin estado local, y sube solo `symbols.json`.)*
- <a id="yes-resp"></a>**`--yes` en las órdenes destructivas: decidido en la PR #98, N1** (`specs/015-api-access/questions.md` §35, decisiones sobre las revisiones de la PR #98). `atlas admin restore`, `compact` y `forget-device` **rechazan `--yes`**, y **la confirmación exige escribir el nombre del entorno**. En la 016, **cualquier orden destructiva nueva sigue la misma regla, `atlas admin prices push` incluida** si sobrescribe. Aplicada en §2 bis, en §5, familia 10, y en el mutante 36.

### 8.2 Decisiones tras la revisión de la ronda 1 de la PR #99 (2026-09-27)

La revisión (comentario 5856795660 de la PR #99) encontró dos bloqueantes, siete puntos medios y tres menores. Estas son las decisiones de la dirección, del mismo día; donde cambian una respuesta de §8.1, lo dicen.

**Bloqueantes**

- <a id="r1-b1"></a>**B1 — El aviso de tesis se limita a `horizon_exceeded`**, la regla que ya existe (`packages/domain/src/projections/bucket.ts:156`). **La condición de invalidación sigue siendo texto libre** (`Thesis.invalidation`, `projections/state.ts:252`) **y no genera aviso automático**; queda fuera de alcance (§4). *Motivo (la revisión):* el prompt pedía avisar «con la regla que ya tiene el dominio», y esa regla no existe; el implementador habría tenido que inventar un umbral o interpretar texto libre, que son decisiones de producto, y darle forma a la condición tocaría el esquema. Aplicada en E2, bloque 2, en §4 y en el mutante 18 bis.
- <a id="r1-b2"></a>**B2 — La tarea de precios nunca envía correo.** Deja cada hallazgo (fallos seguidos, tesis con el horizonte vencido) **en su registro de ejecución, bajo `jobs/` en S3**. **La función de correo los lee, los envía y apunta la racha**, para avisar una vez por racha. **El rol de precios no tiene `ses:*`, y el de correo no alcanza la clave de EODHD** (ni la de Alpha Vantage). Se recoge en la lista de permisos del alto (§2) y tiene su mutante (§6, 18 bis). Precisa §8.1 P4. *Motivo (la revisión):* P4 separa los roles para que la clave de EODHD nunca esté al alcance del rol que envía correo, pero el texto ponía el aviso en la tarea de precios, y la 017 habría dado a un mismo rol `ses:SendEmail`, el destinatario y la clave. Aplicada en §2, en E1, bloque 2, en E2, bloque 2, y en el mutante 18 bis.
  - **Propuesta de quien redacta, a confirmar en el alto:** el mismo camino para el BCE, el volcado y la integridad, de modo que **solo la función de correo tenga `ses:*`**. La dirección decidió B2 para los precios; extenderlo a las demás es coherente con P4, pero no está decidido.

**Medios**

- <a id="r1-m1"></a>**M1 — `REFERENCE_NAME` valida por ida y vuelta con el `priceFileName` del dominio**: un nombre vale si decodificarlo y volver a codificarlo da el mismo nombre. **Longitud máxima: 255.** El bloque 0.2 de E2 recorre **la lista completa de casos del revisor**: `%`, `! ' ( ) * ~`, un `_` o un `-` al principio, el punto inicial (`%2Ex.jsonl`) y los nombres largos. `_status.json` sigue sin servirse. **Enmienda §8.1 P6 bis.** *Motivo (la revisión):* admitir `%XX` no bastaba, porque `encodeURIComponent` deja pasar `! ' ( ) * ~` y `priceFileName` deja un `_` o un `-` al principio. Aplicada en §1, punto 11, en E2, bloque 0, y en §4.
- <a id="r1-m2"></a>**M2 — El interruptor de importes tiene un solo lector**: la composición de la tarea lo lee de SSM y le pasa **el valor ya interpretado** a la redacción del dominio. **El adaptador de SES no lo lee.** *Motivo (la revisión):* con dos lectores posibles, uno de ellos podía leerlo con otra regla (ausente = encendido) y el correo saldría con importes. Aplicada en E1, bloque 3, y en el mutante 2.
- <a id="r1-m3"></a>**M3 — El destinatario y el interruptor son parámetros `String` que escribe Terraform desde `terraform.tfvars`**; el interruptor, **por defecto «sin importes»**. **No los crea el guion de secretos**, que solo crea los `SecureString` (ADR-0034, filas 12 y 21). *Motivo (la revisión):* el texto decía que el guion crearía los tres, y ningún documento decía quién escribe el interruptor. Aplicada en §2 (los formatos del alto), en E1, bloque 3, en E4, bloque 4, en §7.1 (b) y en §7.2 (a).
- <a id="r1-m4"></a>**M4 — `atlas admin prices push` va en E2**, con su zona de revisión (Z3) y sus mutantes. **No guarda estado local**: compara con el objeto remoto, enseña la diferencia y pide confirmación **tecleando el entorno**, sin `--yes`. Enmienda §8.1 P18. *Motivo (la revisión):* ningún bloque la construía, no tenía zona ni mutantes propios, y «`If-Match` sobre lo que subió la última vez» pedía un estado local que nadie definía. Aplicada en E2, bloque 3, en la tabla de la partición y en el mutante 13 bis.
- <a id="r1-m5"></a>**M5 — `push` sube solo `symbols.json`.** **Los presupuestos de llamadas de la nube son variables de entorno de la Lambda de precios, que escribe Terraform** (por defecto, **18 para EODHD y 23 para Alpha Vantage**). **El `prices/config.json` local sigue siendo el presupuesto de la consola.** Enmienda §8.1 P11 y P18. *Motivo (la revisión):* subir el `config.json` local habría dado a la nube el mismo presupuesto que a la consola, y ese fichero lo escribe el usuario y nunca la aplicación. Aplicada en E2, bloques 0 a 3, en E4, bloque 4, y en los mutantes 13 y 13 bis.
- <a id="r1-m6"></a>**M6 — El recordatorio mensual de E1 lee con el `ReferenceReader` de la 015** (`packages/adapters/src/aws/reference-reader.ts`) y, mientras E2 no esté, **valora con lo que haya**: valoraciones manuales o precios subidos. **No espera a E2.** *Motivo (la revisión):* `contributionPlan` necesita precios y el histórico del BCE, y los almacenes de S3 llegan en E2. Aplicada en E1, bloque 4.
- <a id="r1-m7"></a>**M7 — La regla de P12 vive en el dominio** y la usan **la web y la consola** (`apps/cli/src/commands/catalogue.ts:516` escribe fotos completas). **El mutante 26 cubre las dos.** *Motivo (la revisión):* con la regla solo en la web, las fotos de la consola seguirían arrastrando el campo. Aplicada en E3, bloque 3, y en el mutante 26.

**Menores**

- <a id="r1-m1m"></a>**m1 — La cita de `questions.md` §35 se mantiene tal cual.** La está escribiendo ahora el implementador de la 015 (las decisiones sobre las revisiones de la PR #98). El código ya aplica la regla de `--yes`.
- <a id="r1-m2m"></a>**m2 — §4 dice «salvo P6 y P6 bis»** al excluir cambios del contrato de `docs/api.md`. Aplicada en §4.
- <a id="r1-m3m"></a>**m3 — La fuente simulada de `dev` es la única excepción declarada al guardián de los dobles.** Viaja en `jobs.zip`, pero **la composición se niega a usarla si el entorno es `prod`**, con su test y su mutante, y **el guardián la nombra de forma explícita**. Precisa §8.1 P14. *Motivo (la revisión):* «ningún doble es alcanzable desde un artefacto de producción» chocaba con una fuente simulada que viaja en el mismo artefacto que se promociona. Aplicada en E1, bloque 3, en E2, bloque 2, en §7.2 (h) y en el mutante 17.

**Además**, por orden expresa de la dirección, la PR de este prompt añade `@atlas/jobs` a la regla 5 de `CLAUDE.md` (los nombres de paquete).

### 8.3 Respuestas a las preguntas del implementador, y errores de este prompt

*(Vacío.)*

## 9. Preguntas abiertas para la dirección

Lo que la primera redacción de este prompt no podía decidir, cada una con la recomendación de quien redacta. **Todas están respondidas** por la dirección el 2026-09-27, y cada una enlaza a su respuesta en §8.1. Se conservan con su texto original para que se vea qué se preguntó.

- **P1 — ¿La 016 espera a que la PR #98 (E5 de la 015) esté fusionada?** E5 saca `deepCheck` del barril a `@atlas/domain/tools`, parte la cobertura en dos pasadas, trae `atlas admin` y baja el techo del arranque. La integridad y el ensayo de restauración de E4 usan esas piezas, y medir la partida del paquete sobre un `develop` sin E5 daría una línea falsa. **Recomendación: sí.** Además, que la dirección decida antes N1 de la PR #98 (`--yes` en `atlas admin`), porque §5, familia 10, se apoya en esa decisión. **Respondida:** [§8.1 P1](#p1-resp).

- **P2 — La partición en cuatro entregas** (§3): ¿se confirma, con una rama y cuatro PRs sucesivas? **Recomendación: sí**, con E1 pequeña y primero, porque cierra la superficie más cara (lo que sale por correo) y fija el esqueleto del que dependen las demás. La alternativa de tres (E3 dentro de E2) mezclaría el paquete web con las escrituras en S3 en una misma revisión. **Respondida:** [§8.1 P2](#p2-resp).

- **P3 — Dónde vive el código de las tareas.** (a) **Un *workspace* nuevo, `apps/jobs` (`@atlas/jobs`)**, con su artefacto `jobs.zip`. (b) Un segundo punto de entrada dentro de `apps/api`, con un segundo ZIP. `CLAUDE.md` (regla 5 y *Code architecture*) solo nombra cinco paquetes, así que las dos piden una línea nueva en `CLAUDE.md`. **Recomendación: (a)**. La API es la única pieza que alcanza Internet, y las tareas llevan las claves de las fuentes y el permiso de SES. Con dos paquetes, el guardián «la API no alcanza SES ni las claves» es una regla sobre el grafo entre dos paquetes, que es la que mejor sabe hacer el repositorio. Y el artefacto de la API no crece con el código de las tareas. **Respondida:** [§8.1 P3](#p3-resp).

- **P4 — Cuántas Lambdas y con qué rol.** (a) Una sola Lambda para todas las tareas, que elige por el evento. (b) **Un solo artefacto y una función por familia de permisos, cada una con su rol**: el BCE (escribe `reference/ecb/`); los precios (lee el libro, escribe `prices/`, lee las claves); el correo (lee el libro, `prices/`, `reference/ecb/`, `sync/devices/` y el registro de tokens, lee el destinatario y el interruptor, envía por SES); el volcado (lee todo y escribe `backups/`); y la integridad (lee todo, y envía por el correo o se lo deja a la función de correo). **Recomendación: (b)**, con el manejador negándose a una tarea que no está en la lista de su función (`ATLAS_JOBS`). Cuesta cero, cumple «un rol por Lambda» (`CLAUDE.md`, *Security*) y hace que la clave de EODHD nunca esté al alcance del rol que envía correo, ni el permiso de SES al del que llama a una fuente externa. El precio: más Terraform en la 017. **Respondida:** [§8.1 P4](#p4-resp).

- **P5 — `job_frequencies`: quién decide cuándo toca una tarea.** `docs/specification.md` §9.5 dice que las frecuencias son configurables con `job_frequencies`, que vive en `Settings` (hoy `Record<string, string>` sin validar, y en el *golden*). Pero las programaciones de Scheduler son de Terraform. **Recomendación:**
  - **una programación diaria por función**, a una hora fija (§7.2 (c)), y **una función pura del dominio** que decide si la tarea toca hoy, con `job_frequencies`, el día en `Europe/Madrid` y el registro de la última ejecución. Así la frecuencia se cambia desde la interfaz, como pide la especificación, sin tocar Terraform;
  - **un conjunto cerrado de claves y valores**, fijado en el plan;
  - **lectura tolerante y escritura estricta**. Una clave o un valor desconocidos en una línea ya escrita no invalidan el libro: se ignoran, se usa el valor por defecto y **se dice** en Ajustes y en el registro de la tarea. Los formularios solo escriben valores válidos. Así no hay endurecimiento de ADR-0018, aunque hoy todavía se permitiría con el libro real vacío;
  - **el recordatorio mensual no se puede apagar** (constitución V). **Respondida:** [§8.1 P5](#p5-resp).

- **P6 — De dónde sale «el último inicio de sesión» de la web.** El correo mensual tiene que decir los días desde el último inicio de sesión, contando los de la consola (ADR-0027, ADR-0033). La consola deja `issued_at` en su registro de SSM, pero **hoy nada registra un inicio de sesión de la web**: el objeto del dispositivo solo tiene `created_at`, y `last_sync_at` mide sincronizaciones, no pasos por Google. Y lo que Google cuenta como uso del cliente OAuth son los pasos por Google. Opciones:
  - **(a)** un objeto pequeño en el bucket, escrito por la API al final de cada verificación con Google (web y consola), con solo la hora y la vía. Es un objeto y un permiso nuevos, y entra en `docs/api.md` y `docs/data-schema.md`;
  - **(b)** un campo nuevo en el objeto del dispositivo web, que obliga a `device_format: 2` y a tocar los lectores estrictos de la API y de `atlas admin`;
  - **(c)** aproximarlo con `last_sync_at`, que no es lo mismo y lo diría así.
  
  **Recomendación: (a)**, escrito con `If-Match` para que solo avance, nunca retroceda, sin ningún dato personal y con su test de centinelas. Toca `apps/api`, así que va en E1 y se revisa en la zona Z1. **Respondida:** [§8.1 P6](#p6-resp).

- **P6 bis — Los nombres que la ruta de referencia no sirve** (§1, punto 11): `_status.json` y los `priceFileName` con `%`. **Recomendación**: la consola y la web no necesitan `_status.json`, que se queda sin servir; y `REFERENCE_NAME` admite secuencias `%XX` en hexadecimal, porque S3 no decodifica la clave y la regla ya prohíbe `/` y `..`. Si la dirección prefiere no tocar el contrato, la tarea se niega a descargar un activo cuyo nombre de fichero no se podría servir, y lo dice. **Respondida:** [§8.1 P6 bis](#p6bis-resp).

- **P7 — Cómo junta la consola lo que baja de la nube con su `prices/` local, y si el móvil baja también los precios.** (a) **Añadir con las reglas de la 013**: una línea local nueva solo si no hay ninguna de esa fecha, si es de la misma fuente con otro valor, o si es de una fuente anterior en el orden, conservando `source` y `fetched_at` de la nube. (b) Hacer de `prices/` local una réplica byte a byte de la nube, como el libro, perdiendo lo que la consola tuviera y la nube no. **Recomendación: (a)**, porque no pierde nada y no inventa una regla nueva. **Para el móvil: sí, en E3**, con las mismas reglas y en carga diferida. ADR-0031 dice que «los dispositivos lo reciben por la API», y sin precios automáticos el móvil ve siempre valoraciones manuales. Si el paquete no lo permite, solo el BCE, que es lo que fija la P12 de la 015. **Respondida:** [§8.1 P7](#p7-resp).

- **P8 — Qué SDK de SES se instala** (hay que preguntárselo al usuario). `docs/dependencies.md` presupuesta `@aws-sdk/client-ses`, la API v1. ADR-0034, fila 12, habla de `SendEmail` de la API v2, que es `@aws-sdk/client-sesv2`. **Recomendación: `@aws-sdk/client-sesv2`**, con la versión exacta de los otros dos clientes (`3.1141.0`), solo en un adaptador fino de `packages/adapters/src/aws/`, con la lista cerrada de órdenes (`SendEmail`). La fila de `docs/dependencies.md` cambia de paquete, y la dirección lo traslada. **Instalarlo en E1**, después del bloque 0, si el usuario lo autoriza. Hasta entonces, la interfaz estrecha. **Respondida:** [§8.1 P8](#p8-resp).

- **P9 — Qué es exactamente «sin importes».** **Recomendación**: con el interruptor apagado, el correo **no lleva** euros, cantidades, precios, saldos, posiciones, **nombres de activos, ISIN, símbolos ni identificadores de cuenta**. Nombrar lo que se tiene ya es una posición. **Sí lleva** las clases del núcleo (renta variable, renta fija, oro, cripto), **porcentajes** (el reparto de la aportación y las desviaciones en puntos), **recuentos** (tokens, días, avisos), fechas y códigos, más «abre la aplicación». Con el interruptor encendido se añaden los euros del reparto y de los avisos, y **nunca** una cuenta ni un ISIN. El test de §3, E1, bloque 3, fija las dos listas. **Respondida:** [§8.1 P9](#p9-resp).

- **P10 — El correo y los reintentos: al menos una vez o como mucho una vez.** Enviar y apuntar son dos pasos, y un corte entre ellos o duplica el correo o lo pierde. **Recomendación**:
  - **al menos una vez** para el recordatorio mensual, que tiene que llegar siempre, con un identificador del periodo en el asunto para que un duplicado se reconozca;
  - **como mucho una vez** para los avisos, que no deben hacer ruido;
  - **pocos reintentos de Scheduler** y ninguno de la invocación asíncrona, con los números verificados en el bloque 0 de E1;
  - cada caso, con su test de corte. **Respondida:** [§8.1 P10](#p10-resp).

- **P11 — Cómo se reparte el cupo entre la nube y la consola, y la concurrencia en S3.** La consola todavía gasta cupo al declarar una correspondencia (el contraste de la divisa cuesta una llamada) y con la opción explícita de E3. **Recomendación**:
  - el `prices/config.json` de la nube reserva **por debajo del cupo del plan**, por ejemplo 18 y 23, y deja el resto a la consola. La cifra es configuración del usuario, no del código;
  - **una concurrencia reservada de 1** en cada función de tareas, y **todas las escrituras condicionales**. Un conflicto aborta la ejecución sin reintentar, porque solo puede venir de otra ejecución o de la administración. **Respondida:** [§8.1 P11](#p11-resp).

- **P12 — Qué hace una foto nueva de `settings_changed` con el `notification_email` que ya había.** (a) Lo conserva sin enseñarlo. (b) Lo quita: la foto nueva ya no lo lleva, y las líneas antiguas lo conservan porque el libro es append-only. **Recomendación: (b)**. Es un dato personal que nadie lee y que la sincronización replicaría en cada foto. Quitarlo de una foto no invalida nada, porque el campo es opcional. Con un test que lo fija y una nota en `docs/business-rules.md` §7. **Respondida:** [§8.1 P12](#p12-resp).

- **P13 — La autorización previa del paquete web para esta feature.** **Recomendación**:
  - **el arranque, cero**: todo lo nuevo en carga diferida, y quitar `notification_email` de Ajustes, que está en un trozo perezoso, no debería mover el arranque;
  - **el total, lo medido y hasta 3 KB** por encima del techo de partida;
  - **por encima de cualquiera de los dos, se para**;
  - y se dice cuánto deja libre para las mejoras visuales. **Respondida:** [§8.1 P13](#p13-resp).

- **P14 — La fuente de precios simulada de `dev`** (ADR-0034, fila 2: «la 018 activa una vez una programación de `dev` con una fuente de precios simulada»). ¿La construye esta feature? **Recomendación: sí.** Es un adaptador de `PriceSource` con respuestas fijas, elegido solo por la configuración de la Lambda, que **se niega a arrancar con `ATLAS_ENV=prod`**. Así la 018 no escribe código. Con su mutante (§6, 17). **Respondida:** [§8.1 P14](#p14-resp).

- **P15 — La zona horaria de los periodos.** **Recomendación: `Europe/Madrid`** para el mes, el trimestre y el año de las tareas, que son los del contribuyente y los de toda fecha de los documentos. El día GMT del cupo de EODHD no cambia. Cada uno con sus bordes probados (§5, familia 3). **Respondida:** [§8.1 P15](#p15-resp).

- **P16 — ¿La consola deja también de bajar el BCE del BCE y lo toma de la API?** **Recomendación: no.** El BCE no tiene clave ni cupo, y bajarlo de la fuente oficial no gasta nada de nadie. Se puede reconsiderar si alguna vez tiene sentido que la carpeta y la nube tengan el mismo fichero byte a byte. **Respondida:** [§8.1 P16](#p16-resp).

- **P17 — `alert_channels`: ¿se implementa?** **Recomendación: no en esta feature.** El principio de notificación de §9.5 ya dice qué avisa cada tarea, y un interruptor por aviso es una forma de silenciar una alarma, que la constitución pide advertir. La redacción de `docs/specification.md` §5 se corrige igual (§3, E3, bloque 3): si algún día existe, vive **fuera del libro**, junto al destinatario (constitución IV, 1.6.0), y nunca en `docs/business-rules.md` §7. **Respondida:** [§8.1 P17](#p17-resp).

- **P18 — Quién sube `prices/symbols.json` y `prices/config.json` al bucket.** Hoy los escribe la consola en su carpeta, y nada los lleva a la nube. Sin ellos, la tarea de precios no sabe qué descargar. Opciones:
  - **(a)** una orden de administración, `atlas admin prices push --env <entorno>`, con el rol de administración y MFA, que sube los dos con `If-Match` sobre lo que subió la última vez, **sin `--yes`** y enseñando antes la diferencia;
  - **(b)** una ruta de escritura de la API con el token de la consola, que **amplía su alcance** más allá de ADR-0033, punto 6, y exige enmendarla;
  - **(c)** que la tarea los derive del libro, lo que no puede hacer, porque la correspondencia y la divisa las declara el usuario.
  
  **Recomendación: (a)**, con **un solo escritor por objeto**: la orden escribe `symbols.json` y `config.json`, y la tarea nunca. Y dos negativas. Primera, la orden se niega a subir un `symbols.json` con `misstored`, que hay que purgar antes en local. Segunda, **una fuente sin contrastar en el fichero subido no la descarga la tarea**: la tarea no contrasta, para que la consola y la nube no se repartan esa decisión. Así queda cerrado el «un solo escritor por objeto» de E2, bloque 1, y el procedimiento 3 de E4 dice cuándo hay que volver a subirlos. **Respondida:** [§8.1 P18](#p18-resp).
