# ADR-0031 — Precios de cierre diarios: puerto, almacén y política de fallo

**Estado:** Aceptada (2026-09-24), por decisión de la dirección, que además resuelve lo que guarda CoinGecko y lo que pasa con los fondos que `EUFUND` no cubre. **Enmendada el mismo día** tras la revisión de la PR #72: la correspondencia de símbolos sale del libro (ver al final). **Enmendada otra vez el mismo día** al escribir el prompt de la feature 013: dónde viven las claves, qué gana en la puerta, la aproximación por ETF, CoinGecko, la divisa, el cupo, la censura de la clave y la lista SIN VERIFICAR (ver «Segunda enmienda»). **Enmendada por tercera vez al cerrar la feature 013** (2026-09-24/25, PR #78): lo verificado con sus fuentes, **CoinGecko y OpenFIGI retirados**, la divisa confirmada por el usuario, el cupo, los fallos, un solo cierre en vigor por fecha, el precio con valor en euros, nunca el día en curso y la nota de la aproximación (ver «Tercera enmienda»). Ronda 8. Las fuentes son decisión de la dirección, tomada sobre la investigación del 2026-09-24; el puerto, el almacén y la política de fallo desarrollan lo que ya pedía `docs/specification.md` §7.

## Contexto

La especificación separa dos niveles de precio (§7.1): el **exacto**, que se teclea o llega del extracto y es el único que puede tocar la fiscalidad, y el **aproximado**, informativo, para paneles y seguimiento. Pide fuentes intercambiables tras un mismo puerto, cascada de respaldo, antigüedad siempre visible y **nunca interpolar** (§7.2, constitución V), y que el sistema funcione **con cero fuentes automáticas**. La puerta única de precios ya existe (`packages/domain/src/projections/prices.ts`): recibe cotizaciones externas como dato puro (`ExternalPrices`) y la valoración manual gana siempre. El Modelo 720 la llama **sin** fuente externa (`packages/domain/src/informative/valuation.ts`): una cotización automática nunca entra en una declaración.

**La dirección decide:** precios de **cierre diario**, nunca en tiempo real, siempre informativos; primero desde local y después programados.

**Hechos de las fuentes** (investigación del 2026-09-24):

| Fuente | Qué ofrece | Fuente del dato |
|---|---|---|
| Yahoo | Sus condiciones **prohíben el acceso automatizado** (§2.4(i) y (j)) | `legal.yahoo.com/us/en/yahoo/terms/otos` |
| Stooq | Responde con un reto anti-bot | Comprobado por la investigación |
| Morningstar | Solo APIs empresariales | Comprobado por la investigación |
| EODHD Free | 20 llamadas al día, un año de histórico, uso personal, bolsas de todo el mundo y fondos europeos por ISIN en `EUFUND` | `eodhd.com/pricing` |
| Alpha Vantage Free | 25 llamadas al día; el símbolo lleva sufijo de bolsa | `alphavantage.co/support` |
| CoinGecko Demo | 10.000 créditos al mes, cotiza en EUR, **obliga a mostrar «Powered by CoinGecko»** y a **refrescar la caché cada 24 h**. *Retirada en la tercera enmienda* | `coingecko.com/en/api_terms` |
| OpenFIGI | Traduce ISIN a símbolo, gratis. *Retirada en la tercera enmienda*: no documenta qué bolsa es cada código | `openfigi.com/api/documentation` |

## Opciones consideradas

1. **Rascar páginas públicas** (lo que suponía la tabla de §7, con Yahoo). Excluido: Yahoo lo prohíbe por escrito, Stooq lo bloquea y Morningstar no ofrece nada utilizable. **Quedan excluidos por escrito para que nadie los reintroduzca.**
2. **APIs con plan gratuito y clave** (decidida): EODHD, Alpha Vantage ~~y CoinGecko~~ (CoinGecko, retirada en la tercera enmienda).
3. **Sin precios automáticos.** Siempre posible, y el sistema tiene que seguir funcionando así; no es la opción, es el suelo.

## Decisión

**Fuentes** (decisión de la dirección): principal **EODHD Free**, respaldo **Alpha Vantage Free**; ~~cripto, **CoinGecko Demo**, con la atribución **visible** donde se enseñe su cotización~~ cripto, **EODHD si su plan gratuito la cubre**, y si no, entrada manual (tercera enmienda). Fondos por `EUFUND` **solo si cubre el ISIN concreto**; si no, extracto o entrada manual, y para la evolución, **la aproximación por ETF de referencia** de `docs/specification.md` §7.1, **siempre marcada como aproximación** (fórmula y alcance en la segunda enmienda). La entrada manual nunca desaparece.

**Correspondencia ISIN → símbolo: configuración de la descarga, no una búsqueda diaria.** ~~`asset_created`/`asset_updated` ganan `price_symbols?`, un mapa de fuente (`eodhd`, `alpha_vantage`, `coingecko`) a su símbolo.~~ **Corregido en la enmienda:** la correspondencia **no va en el libro**. Es configuración para descargar precios, que son informativos, no un hecho de la cartera, y una foto completa `asset_updated` escrita por un cliente antiguo la borraría sin avisar (ADR-0026, caso 6). Vive **con los precios**, en `prices/symbols.json` (junto a `prices/` en local, en el bucket en la nube): por activo, un mapa de fuente (`eodhd`, `alpha_vantage`~~, `coingecko`~~) a su símbolo. ~~OpenFIGI **propone** el símbolo al dar de alta el activo y el usuario lo confirma; nada lo consulta después.~~ **El usuario la declara**, con la divisa de la cotización, y la aplicación **la contrasta con la fuente** al declararla (tercera enmienda). Si el fichero se pierde, se rehace.

**Puerto `PriceSource`** en `packages/domain/src/ports/`, asíncrono, un adaptador por fuente. Pide cierres diarios de un símbolo entre dos fechas y devuelve cotizaciones (`date`, `close`, `currency`) o un fallo **con tipo**: `unavailable`, `not_found`, `rate_limited`, `blocked`, `invalid_response`, `budget_exhausted`. La cascada vive en un caso de uso del dominio que recibe los puertos (ADR-0007) y lo que escribe pasa por un puerto de almacén de precios, igual que el libro pasa por `LedgerStore`.

**Almacén: `prices/<asset_id>.jsonl`** (`docs/data-schema.md` §1), fuera del libro, ~~una línea por fecha y fuente~~ una línea por cierre, con **un solo cierre en vigor por fecha**, el de la última línea de esa fecha (tercera enmienda, §6): `schema_version`, `date`, `close` (decimal como cadena, ADR-0005), `currency` tal como la devuelve la fuente (o, si no la devuelve, la declarada en `prices/symbols.json`: segunda enmienda), `source`, `fetched_at`. Solo se añade ~~(salvo los datos de CoinGecko, en un fichero propio que se sobrescribe: segunda enmienda)~~: si una fuente corrige un cierre ya guardado, entra una línea nueva y gana la más reciente, con la diferencia a la vista. **El paso a euros no se guarda**: lo hace la puerta al leer, con el histórico del BCE (ADR-0029); una cotización en una divisa sin tipo se enseña en su divisa, no se convierte con un tipo inventado.

**Política de fallo** (§7.2 y constitución V): fuente principal → respaldo → **último valor conocido con su antigüedad** → entrada manual ~~(`valuation`, que gana siempre)~~ (`valuation`; para enseñar un valor gana el dato de fecha más reciente, y con la misma fecha la valoración manual: segunda enmienda). `stale_price_days` marca lo antiguo. **Nunca se interpola** ni se rellena un día que falta. Cada fuente lleva su estado en `prices/_status.json` (fallos seguidos, último éxito, tipo del último fallo); un `blocked` o un `rate_limited` no se reintenta en bucle dentro de la misma ejecución; y superar un número configurable de fallos seguidos manda un correo, que es lo que avisará de que una fuente ha cambiado sus condiciones (el correo es de la feature 016; la 013 solo registra los fallos: segunda enmienda).

**Presupuesto de llamadas.** Veinte o veinticinco al día obligan a priorizar: primero las posiciones del cubo (la tarea diaria de §9.5 avisa si una tesis se acerca a su invalidación), después el índice de referencia del cubo y los ETF de referencia, después el resto del núcleo. Lo que no quepa ese día conserva su último valor con su antigüedad.

**Claves de API: son secretos** (decisión de la dirección). En local, en un fichero de configuración **fuera del repositorio** ~~; en la nube, SSM `SecureString`. El orden de las fuentes y su presupuesto viven con la clave, fuera del libro: son configuración de la máquina que descarga, no de la cartera.~~ **y fuera de la carpeta del libro**, `~/.config/atlas/secrets.json`, que la web no lee nunca; en la nube, SSM `SecureString`. El orden de las fuentes y su presupuesto, que no son secretos, van fuera del libro en `prices/config.json`, junto a él (segunda enmienda).

**Dónde se descarga.** Etapa local: la consola (`atlas prices update`, nombre provisional). La web de escritorio lee `prices/` de la carpeta compartida; en el móvil, sin nube, no hay precios automáticos, y sí la importación a mano (segunda enmienda). No se abre la CSP (ADR-0029, punto 3). Etapa de nube: una tarea diaria en la Lambda escribe `prices/` y los dispositivos lo reciben por la API.

## Consecuencias

- ~~**CoinGecko** (decisión de la dirección): sus condiciones piden refrescar la caché cada 24 h, y §1 del esquema dice que `prices/` se guarda **para siempre**. **De cripto solo se guarda el último valor conocido, sin histórico**, renovado cada día, hasta que alguien lea sus condiciones completas (la segunda enmienda precisa que la regla es **por fuente**, no por tipo de activo, y que un valor sin renovar en 24 horas deja de mostrarse). **Las acciones y los ETF sí guardan histórico.**~~ CoinGecko, retirada (tercera enmienda): todo lo que guarda `prices/` es histórico de solo añadir.
- **Una sola clave, un solo presupuesto diario.** Cuando exista la tarea programada, la consola deja de pedir lo que ya pidió la nube y lo descarga de la API; si no, las dos se comen el mismo cupo.
- EODHD Free solo da **un año de histórico**: lo que no se guarde hoy no se podrá pedir dentro de dos años. Es un motivo más para guardar los cierres, dentro de lo que permitan las condiciones de cada fuente.
- La divisa de una cotización puede no ser la del activo (por ejemplo, una subunidad de la divisa): se guarda la que devuelve la fuente y la puerta rechaza la que no sepa convertir, en vez de suponer.
- **Ningún cálculo fiscal cambia**: la puerta sigue siendo la única entrada y el Modelo 720 sigue leyendo solo la valoración manual.
- Documentos que hay que actualizar: `docs/specification.md` §7 (la tabla nombra a Yahoo; §7.3, el riesgo de rascar desde Lambda, cambia de naturaleza: pasa a ser el de condiciones y cupos de una API), `docs/data-schema.md` §1 (`prices/symbols.json` y `prices/_status.json`), y `docs/dependencies.md`, que no cambia de paquetes: los adaptadores usan `fetch` de Node.
- Relacionadas: ADR-0005, ADR-0007, ADR-0018, ADR-0026, ADR-0028 y ADR-0029.

## Enmienda del 2026-09-24 (revisión de la PR #72)

Decidida por la dirección el mismo día. La correspondencia de símbolos iba como campo opcional de `asset_created`/`asset_updated`. Un cliente antiguo que escribiera un `asset_updated` —una foto completa, ADR-0022— lo borraría sin avisar, aunque añadir el campo fuera compatible según ADR-0018. En vez de parchearlo, sale del libro: es configuración de la descarga de precios, que son informativos, y vive en `prices/symbols.json`.

## Segunda enmienda del 2026-09-24 (prompt de la feature 013)

Decidida por la dirección al contestar las diez preguntas de la primera redacción de `docs/prompts/013-daily-close-prices.md` y seis puntos que esta ADR dejaba sin decir. El prompt las recoge en su §6.2 y §6.3, con su motivo. Las frases de arriba que ya no aplican están tachadas o remiten aquí.

**Las diez preguntas del prompt:**

1. **Claves.** Las claves de API van en un fichero de secretos **fuera de la carpeta del libro**, `~/.config/atlas/secrets.json` (o el equivalente XDG, `$XDG_CONFIG_HOME/atlas/secrets.json`), con permisos `600`. **La web no lo lee nunca**, y no entra en ninguna copia de seguridad, exportación ni sincronización: la carpeta del libro se copia, se exporta y un día se sincronizará, y una clave no debe viajar con ella. **El orden de las fuentes y el presupuesto de llamadas** no son secretos y van ~~en `atlas.config.json`, junto al libro; su lector aprende esas claves nuevas sin dejar de rechazar las desconocidas~~ en su propio fichero, `prices/config.json`, junto al libro (corregido tras la verificación del prompt, abajo).
2. **Qué gana en la puerta de precios.** Para **enseñar un valor**, gana **el dato de fecha más reciente**; con la misma fecha gana **la valoración manual**, porque el usuario es la autoridad. Para el Modelo 720 y cualquier ruta fiscal **no cambia nada**: solo cuentan las valoraciones del libro, y el test de arquitectura sigue impidiendo que entre una cotización automática (cerrado por estructura tras la verificación del prompt, abajo). Sustituye a la decisión (j) del prompt 005 («la valoración manual gana siempre») **solo para enseñar un valor**. Lo destapó la redacción del prompt: con el código de entonces, cualquier valoración anterior ganaba por antigua que fuera, y la del 31 de diciembre para el 720 habría tapado todos los cierres automáticos posteriores.
3. **Aproximación por ETF de referencia** de un fondo que `EUFUND` no cubre: **último valor liquidativo real conocido del fondo × (cierre del ETF hoy / cierre del ETF en la fecha de ese liquidativo)**. Sin un liquidativo real que la ancle, **no hay aproximación**. Llega a la **presentación y a los pesos**, **siempre marcada como aproximada**; la calculadora de la aportación **dice** cuándo algún peso que usa depende de una aproximación. **Nunca llega a nada fiscal.**
4. ~~**«Solo el último valor» es por fuente**, no por tipo de activo: es una condición contractual de CoinGecko. Una ETP de cripto que llegue por EODHD guarda histórico.~~ Retirada con CoinGecko (tercera enmienda).
5. **Los activos y su prioridad salen del libro de la consola**, que es quien descarga. Un activo creado solo en la web no tiene precio automático hasta que exista la sincronización, o se pase por exportar e importar.
6. **Importar precios a mano en el móvil: sí.** La entrada manual nunca desaparece.
7. **Dos fuentes con cierre para la misma fecha:** gana **la primera en el orden configurado**, y se guarda de qué fuente vino. No se promedia nada.
8. **El correo por fallos seguidos es de la feature 016.** La 013 solo lleva el registro de fallos.
9. ~~**Atribución de CoinGecko: texto y enlace**, con `rel="noopener noreferrer"`. Un enlace no carga nada de fuera, así que no choca con la CSP. Si la comprobación del paquete rechaza URLs externas, se añade la excepción con su motivo escrito, como la del BOE.~~ Retirada con CoinGecko (tercera enmienda): la web no enlaza a ninguna fuente de precios.
10. **El techo del total del paquete web** sube con la regla de siempre, en su propio commit, a lo medido más un margen pequeño y con el desglose. **El arranque no sube en ningún caso**, y si no cabe, la feature para.

**Lo que esta ADR dejaba sin decir:**

- **La divisa de la cotización.** Si la fuente no la devuelve, **la declara cada entrada de `prices/symbols.json`** de forma explícita, y se contrasta con los metadatos de la fuente cuando existan. ~~Si no coinciden, **no se guarda** y queda un fallo registrado.~~ Si no coinciden, se enseña el desacuerdo y el usuario confirma la declarada una vez y de forma explícita; sin esa confirmación no se descarga nada de esa fuente y queda un fallo registrado (tercera enmienda). Nunca se supone.
- ~~**CoinGecko y «solo se añade».** Esa regla es **del libro**, no de la caché de precios. Los datos de CoinGecko van en **un fichero propio que se sobrescribe**, separado del histórico de las demás fuentes, en `cache/` (abajo).~~ Retirada con CoinGecko (tercera enmienda).
- ~~**Las 24 horas de CoinGecko.** Un valor que no se ha podido renovar en 24 horas **deja de mostrarse**, y la aplicación dice que ha caducado y no se pudo renovar; queda a mano la entrada manual. Es la lectura conservadora de sus condiciones: la dirección prefiere eso a enseñar un dato que sus condiciones no permiten conservar. Es la única excepción a «último valor conocido con su antigüedad».~~ Retirada con CoinGecko (tercera enmienda): «último valor conocido con su antigüedad» ya no tiene excepciones.
- **El cupo del día** se cuenta en `prices/_status.json` y **se reserva bajo el cerrojo de la carpeta antes de llamar**, de modo que dos consolas a la vez no se pasan.
- **La clave en la URL** (EODHD y Alpha Vantage) **se censura** en todo mensaje de error y en todo registro. Un test con una clave centinela falla si la clave aparece en cualquier salida, y un mutante quita la censura.
- **SIN VERIFICAR**, con la regla de la Ronda 8 (cada feature lo verifica, con fuente, antes de escribir código, y lo que encuentre se escribe aquí): las condiciones completas de **EODHD Free** (cupo y su reinicio, coste de pedir un año de cierres, si el uso personal permite guardar, si el cierre es sin ajustar, si la respuesta dice la divisa, cómo marca los errores); **si su plan gratuito incluye índices**; **si incluye `EUFUND` y si cubre los ISIN concretos** de los fondos del usuario; las condiciones completas de **Alpha Vantage Free** (cupo, histórico del *endpoint* diario, divisa, sufijo de bolsa europeo, si permite guardar); las condiciones completas de **CoinGecko Demo** (cupo, qué exige exactamente la atribución, qué significa «refrescar la caché cada 24 h»); **OpenFIGI** (uso sin clave, cupo, y cómo se traduce su código de bolsa al símbolo de EODHD y de Alpha Vantage); y **cómo lleva cada fuente la clave** y qué devuelve en un error. Qué hacer si algo sale mal está en el bloque 0 del prompt 013; en ningún caso se sustituye una fuente por otra sin la investigación de esta ADR. *Verificado en la tercera enmienda*, salvo lo que solo se comprueba con la clave del usuario.

**Tras la verificación independiente del prompt** (decidido por la dirección el mismo día; el verificador confirmó todas las afirmaciones del prompt sobre el código y encontró un bloqueante):

- **La puerta del Modelo 720 se cierra por alcance, no por nombres.** Una función de **solo valoración manual**, sin parámetro externo, vive en **un fichero hoja propio** que no importa nada de la puerta de precios. **Un test lee el grafo de importaciones** y exige que desde `informative/`, a cualquier profundidad, no se alcance `projections/prices.ts` ni ningún fichero que importe `priceAt` o `manualPrices`: lo único relacionado con precios que `informative/` alcanza es esa hoja. **`tax/` no importa nada de la puerta, ni siquiera la hoja.** La regla anterior buscaba el nombre `external`, y un quinto argumento llamado de otra forma la esquivaba; y prohibir que se importen dos nombres dejaba pasar `bucketPositions`, `coreWeights`, `netWorth` o `costSummary`, que reenvían la fuente externa a la puerta (segunda pasada de la verificación).
- **Las cotizaciones nunca entran en `LedgerState` ni en `Settings`**, y lo prohíbe un test que **congela la lista de claves** de los dos (buscar tipos de cotización dejaría pasar un campo con el tipo escrito en línea). Y **ningún `import()` dinámico en `packages/domain`**, con otro test, porque el grafo de los guardianes no lo ve. El comentario de `projections/prices.ts` que invitaba a añadir las fechas automáticas por ahí se corrige.
- **Los tipos de la puerta se declaran en `projections/prices.ts`**, y los módulos de precios los importan de ahí, nunca al revés; la hoja de solo valoración manual es la excepción, porque no importa nada de la puerta.
- **El test de que la salida fiscal no cambia** lleva cotizaciones **posteriores** a las valoraciones de los activos del 720, que son las que ganarían en una vista; sin ellas no prueba nada.
- **La configuración de precios** (orden de las fuentes, presupuesto, umbral de fallos seguidos) va en **`prices/config.json`**, no en `atlas.config.json`: la web no la necesita, así que una web antigua en caché nunca la ve y el lector de `atlas.config.json` no cambia de forma.
- ~~**Los datos de CoinGecko van en `cache/`**, dentro de la carpeta del libro para que la web pueda leerlos, y **`cache/` queda excluida expresamente de las copias mensuales (ADR-0032), de la exportación y de la sincronización (ADR-0026)**, para que no se acumule el histórico que sus condiciones prohíben.~~ Retirada con CoinGecko (tercera enmienda): `cache/` no existe, y no hay nada que excluir.
- ~~**Si un valor de CoinGecko caduca y hay una valoración manual más antigua, se enseña la manual con su antigüedad.**~~ Las series y las fechas de las gráficas sí pueden usar fechas automáticas: es presentación.
- **`unit_value_eur` pasa a opcional**: cuando el tipo del BCE no se puede resolver, se enseña la cotización en su divisa y se dice que falta el valor en euros. Nunca se suma en euros algo sin tipo.
- **Las fugas de la clave, una por una**: un `secrets.json` mal escrito da un mensaje sin su contenido; un error de `fetch` censura la URL entera; lo que se guarde de una descarga (como el manifiesto del BCE guarda su URL) guarda la dirección sin la clave; los errores de configuración de secretos nunca incluyen valores; ~~CoinGecko lleva la clave en una cabecera, nunca en la URL;~~ y la consola se niega si la carpeta de configuración y la del libro están una dentro de la otra.

**Documentos que hay que actualizar** además de esta ADR: `docs/data-schema.md` §1 (las filas de `prices/`, `prices/config.json`, ~~`cache/` con el fichero de CoinGecko y su exclusión de copias, exportación y sincronización,~~ y el fichero de secretos fuera de la carpeta), **ADR-0032** ~~(`cache/` fuera de las copias mensuales)~~, **ADR-0026** ~~(`cache/` fuera de la sincronización)~~ y `docs/specification.md` §7.2 (la entrada manual «gana siempre») y §11.8 («con ellas van el orden de las fuentes y su presupuesto»). Los traslada la dirección al cerrar la feature 013, con lo verificado.

## Tercera enmienda del 2026-09-24/25 (cierre de la feature 013)

Decidida por la dirección durante la feature 013 (PR #78, fusionada el 2026-09-25 a las 02:45 hora de Madrid) y escrita al cerrarla. El registro entero está en `specs/013-daily-close-prices/questions.md`: la verificación en §1, las respuestas de la dirección en §6 y las dos pasadas de la revisión en §10 y §11. Las frases de arriba que ya no aplican están tachadas o remiten aquí.

### 1. Lo verificado, con su fuente (bloque 0, leído el 2026-09-24)

| Qué | EODHD Free | Alpha Vantage Free |
|---|---|---|
| Cupo | 20 llamadas al día; **reinicio a medianoche GMT** (`eodhd.com/financial-apis/api-limits`) | 25 al día (`alphavantage.co/support`); **la hora de reinicio no está documentada** |
| Coste de un histórico | Una llamada por petición, sea cual sea su longitud, también un 404 (`…/api-for-historical-data-and-volumes`) | — |
| Histórico gratuito | **Un año** (`eodhd.com/pricing`) | *compact*: **los últimos 100 días de mercado**; *full* es de pago (`alphavantage.co/documentation`). Sirve para el día a día, no para rellenar un año |
| Guardar | **Permitido** para uso privado y no comercial; prohibido redistribuir o enseñar a terceros (`…/terms-conditions`, `…/commercial-vs-personal-license-use`) | Las condiciones conceden uso personal y no comercial y **callan** sobre guardar (`alphavantage.co/terms_of_service`, §2.a y §3) |
| Cierre | `close` sin ajustar; `adjusted_close` se recalcula y no se guarda nunca | `TIME_SERIES_DAILY`, sin ajustar |
| Divisa en la respuesta | **No.** Sale de `exchange-symbol-list/{bolsa}?symbols=` (`Currency`), a una llamada | **No.** Sale de `SYMBOL_SEARCH` (`"8. currency"`); si cuenta contra el cupo no está documentado |
| Forma del número | **Número JSON** (`"close":325.13`), comprobado en vivo | Cadena (`"4. close": "232.7600"`) |
| Clave | `api_token` en la URL | `apikey` en la URL |
| Errores | Por código HTTP: 401, 402 (su cupo agotado), 403 (clave sin derecho a ese símbolo), 404, 429; un `[]` con 200 **no es un error** | **Todos con HTTP 200**, se distinguen por la clave del cuerpo (`Error Message`, `Information`); **una clave inventada no se rechaza** |

Sufijos de bolsa documentados en Alpha Vantage: `.LON`, `.DEX` (Xetra), `.TRT`, `.TRV`, `.BSE`, `.SHH`, `.SHZ`; EE. UU. sin sufijo. París, Ámsterdam, Madrid, Milán y Suiza **no están documentados**. El detalle de cada cita, literal y con su dirección, está en `questions.md` §1.1, §1.4 y §1.7.

**Sigue SIN VERIFICAR**, porque solo se comprueba con la clave del usuario (procedimiento en [`docs/runbooks/013-daily-close-prices-live-test.md`](../runbooks/013-daily-close-prices-live-test.md)): si el plan gratuito de EODHD incluye **índices**; cuántos de los ISIN del usuario cubre **`EUFUND`** y si el plan gratuito sirve sus cierres; en qué unidad llegan los cierres de **Londres** frente a la divisa que dice el listado; y si el plan gratuito cubre **cripto** (`<PAR>.CC`). Hasta entonces, un índice, un fondo o una cripto sin precio automático se dice como tal y queda la entrada manual.

### 2. CoinGecko, retirada (D-Q5)

**Motivo de la dirección:** sus propias condiciones describen el plan Demo como un plan para probar («a free plan to try out the CoinGecko API. It's good for testing and exploration»), y el que describen como «suited for personal use» es **Basic, de pago** (`coingecko.com/en/api/pricing`). Una fuente permanente sobre Demo se apoyaría en una zona gris de sus condiciones, y el proyecto no hace eso. Sus condiciones piden además cifrar lo guardado («should») y desaconsejan guardarlo (`coingecko.com/en/api_terms`, «Data Caching and Storage»).

**Los precios de cripto serán de EODHD si su plan gratuito los cubre** (la cuarta comprobación con la clave), **y si no, entrada manual.** Se retiran con ella: el adaptador, la regla de «solo el último valor» por fuente, el fichero propio en `cache/` y su exclusión de copias, exportación y sincronización, la caducidad de 24 horas, la atribución con su enlace y sus excepciones en la comprobación del paquete, y la clave en cabecera. **`cache/` no existe**, y ADR-0026 y ADR-0032 no tienen nada que excluir.

### 3. OpenFIGI, retirada (D-Q6)

**Motivo de la dirección:** OpenFIGI no documenta qué bolsa es cada código de su respuesta (`exchCode`): `GET /v3/mapping/values/exchCode` lista 1.106 códigos sin descripción, y que `GY` sea Xetra es una convención de Bloomberg, no un dato de su documentación. Una traducción sin documentar no es base para decidir qué precio es de qué activo. **La correspondencia la declara el usuario** en `prices/symbols.json` (`atlas prices symbols set`), con la divisa de la cotización, y la aplicación **la contrasta con la fuente** al declararla. No hay proponedor ni pregunta en `atlas asset add`.

### 4. La divisa: declarada, contrastada y confirmada (D-Q2 y las revisiones)

- La divisa de la cotización **se declara siempre** (`--currency`, tres mayúsculas; puede ser una subunidad como `GBX`) y se contrasta con los metadatos de cada fuente **al declararla**, a una llamada de su cupo. El resultado queda en `currency_check` de esa fuente.
- **Si la fuente dice otra cosa, ni se rechaza ni se acepta en silencio**: la consola enseña el desacuerdo y pide al usuario que confirme la declarada **una vez y de forma explícita** (`--accept-currency` o la pregunta); lo que confirmó queda en `currency_confirmed_over`. Sin esa confirmación, esa fuente no se descarga (`currency_mismatch`).
- Lo que dice la fuente se guarda **tal como viene**, también si no es un código de tres mayúsculas (`GBp`, hasta 16 caracteres), y entonces es un desacuerdo que se confirma. Solo la ausencia, el texto vacío y `Unknown` cuentan como que la fuente no dice la divisa (`saidCurrency`, `packages/adapters/src/prices/shape.ts`).
- **Una correspondencia sin contrastar no se descarga.** Si al declararla no había clave o cupo, `atlas prices update` la contrasta **antes de su primera descarga**, bajo el cerrojo; si no puede (sin cupo o con un fallo de la fuente), no descarga nada de esa fuente. `atlas prices symbols` dice «sin contrastar».
- `currency_mismatch` es un **séptimo tipo** de fallo, fuera de los seis del puerto: no lo produce la fuente sino el contraste, y **no cuenta como fallo seguido** de la fuente.

### 5. Cupo, fallos y parada (D-Q1, D-Q3, D-Q4)

- **El cupo se cuenta por día GMT en EODHD y en una ventana móvil de 24 horas en Alpha Vantage**, que nunca se pasa sea cual sea su hora de reinicio (`BUDGET_WINDOW`, `packages/domain/src/quotes/status.ts`). Cada llamada se reserva **una a una bajo el cerrojo** en `prices/_status.json` (`calls_at`), antes de llamar y fuera del cerrojo la llamada. Alpha Vantage deja además **un segundo** entre llamadas.
- **Los fallos de Alpha Vantage se clasifican por el cuerpo**, porque todo llega con 200; como una clave inventada no se rechaza, Alpha Vantage no puede dar `blocked` de forma fiable. **En EODHD**, 401 es `blocked`, 402 y 429 son `rate_limited`, y **403 y 404 son `not_found` de ese símbolo**: un índice fuera del plan no deja sin precios al resto. `budget_exhausted` es **nuestro** cupo, el que se agota antes de llamar.
- **Solo cuentan como fallos seguidos** `unavailable`, `rate_limited`, `blocked` e `invalid_response`: `not_found` habla de un símbolo y `budget_exhausted` de nuestro cupo. Llegar al umbral (`failure_threshold`, 3 por defecto) hace que `atlas prices update` lo diga y salga con el código **7**; el correo sigue siendo de la feature 016.
- **Números JSON por su texto exacto** (D-Q1): EODHD da los cierres como números JSON, y se leen con el tercer argumento del *reviver* de `JSON.parse` (`context.source`). Donde no existe, **se para con un error claro**, nunca se lee como coma flotante. El puerto gana **`ready?()`**, que la cascada y la declaración llaman **antes de reservar nada**: sin `context`, la consola para con su mensaje, sin gastar cupo y sin escribir `_status.json`.

### 6. Qué se guarda y qué se lee

- **Nunca se guarda el valor del día en curso.** La cascada pide y guarda hasta **ayer** (`to = today − 1`): pedido por la tarde, el «cierre» de hoy sería un precio de media sesión, y guardado se quedaría para siempre.
- **Un solo cierre en vigor por activo y fecha** (D-Q10), con su fuente. El fichero sigue siendo de solo añadir, así que el cierre en vigor de una fecha es **la última línea de esa fecha**. La consola añade una línea si no hay ninguna de esa fecha, si es de la misma fuente con un valor numéricamente distinto (una corrección), o si es de una fuente **anterior** en el orden configurado (la principal sustituye al respaldo, nunca al revés). La web no necesita el orden de las fuentes y no lee `prices/config.json`.
- **Un fichero de precios con una línea de una versión más nueva se rechaza entero** (`price_file_newer_version`), no la línea, y lo mismo una línea ilegible (`price_line_invalid`): ese activo se queda sin precio automático, se dice, y la consola no añade nada a ese fichero.
- **El nombre del fichero** es `priceFileName(asset_id)`: un id normal es él mismo; lo que no podría nombrar un fichero se codifica, con la misma función en la consola y en la web.
- **Un `[]` de EODHD no es un fallo**: no hay cierres nuevos en esa ventana. Un activo cuyo último cierre ya es el último día de lunes a viernes anterior a hoy no gasta cupo; un festivo cuesta una llamada.

### 7. Todo cálculo en euros usa el precio más reciente que tenga valor en euros (revisión de la PR #78)

- La puerta (`choose`, `packages/domain/src/projections/prices.ts`) elige por la regla de la segunda enmienda (gana la fecha más reciente, y con la misma fecha la valoración manual) **entre los precios que tienen valor en euros**. Una cotización más nueva sin él viaja como **`newer_quote`**, calculada contra la más nueva que existe, y las dos interfaces la enseñan al lado, como información y con su motivo.
- En los cierres automáticos, `externalPricesOf` (`packages/domain/src/quotes/external.ts`) **vuelve atrás** hasta el último cierre que convierte, sea cual sea la divisa, y lleva el más nuevo como información.
- **`GBX` es `GBP / 100`**, con la tabla explícita `SUBUNITS` (hoy solo `GBX`): una cotización en peniques se convierte con el tipo de la libra por cien. Es un cambio de unidad, no una estimación; una subunidad que no está en la tabla sigue sin tipo. Tratar `GBX` **como** `GBP` sigue prohibido.
- El aviso de `missing_manual_prices` dice **precio en euros**, en el dominio y en las dos interfaces, con los dos remedios.

### 8. La aproximación por ETF: lo que la ancla y quién la dice

- **Solo anclan** una `valuation` del fondo o un cierre propio (de `EUFUND`), el más reciente en o antes de la fecha; **nunca** el `unit_price` de una operación, que puede ser de la fecha de la orden o de la de valor sin que el libro diga cuál, ni otra aproximación. Sin un cierre del ETF **exactamente** en la fecha del ancla, no hay aproximación.
- **El aviso lo emite el dominio**: `contributionPlan` añade la nota `weights_use_approximation`, y las dos interfaces solo eligen palabras y sitio (ADR-0024). En los pesos, cada fila lleva su marca de aproximación, que decide el dominio.
- **Las series** del patrimonio siguen con las fechas de las valoraciones: usar fechas automáticas se permite y no se ha hecho. Es trabajo aparte.

### 9. Los ficheros de configuración

- **`prices/config.json`**, escrito por el usuario y nunca por la aplicación: `source_order` (por defecto `eodhd`, `alpha_vantage`), `daily_calls` (20 y 25; `0` apaga una fuente) y `failure_threshold` (3). Sin fichero, los valores por defecto; una clave desconocida o un valor que no se entiende es un error, nunca un valor por defecto en silencio.
- **`~/.config/atlas/secrets.json`** (o `$XDG_CONFIG_HOME/atlas/secrets.json`), con solo `eodhd` y `alpha_vantage`. **Si su modo deja leer a otros** (cualquier bit de grupo u otros), la consola **no usa las claves** (`secrets_too_open`) y dice la orden `chmod 600` que lo arregla; todo lo demás funciona igual. **`atlas prices update` sale con 1**; **`atlas prices symbols set` sale con 0** y guarda la correspondencia como «sin contrastar», que se contrastará antes de su primera descarga (§4). Una clave desconocida se dice **por su posición**, nunca por su nombre, por si el usuario invirtió nombre y valor. La consola se niega si la carpeta de la configuración y la del libro están una dentro de la otra.
- **`prices/` no guarda nada que no pueda viajar**: ni claves ni direcciones. Puede entrar en las copias, la exportación y la sincronización sin excluir nada.
