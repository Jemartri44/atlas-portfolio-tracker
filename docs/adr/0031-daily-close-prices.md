# ADR-0031 — Precios de cierre diarios: puerto, almacén y política de fallo

**Estado:** Aceptada (2026-09-24), por decisión de la dirección, que además resuelve lo que guarda CoinGecko y lo que pasa con los fondos que `EUFUND` no cubre. **Enmendada el mismo día** tras la revisión de la PR #72: la correspondencia de símbolos sale del libro (ver al final). **Enmendada otra vez el mismo día** al escribir el prompt de la feature 013: dónde viven las claves, qué gana en la puerta, la aproximación por ETF, CoinGecko, la divisa, el cupo, la censura de la clave y la lista SIN VERIFICAR (ver «Segunda enmienda»). Ronda 8. Las fuentes son decisión de la dirección, tomada sobre la investigación del 2026-09-24; el puerto, el almacén y la política de fallo desarrollan lo que ya pedía `docs/specification.md` §7.

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
| CoinGecko Demo | 10.000 créditos al mes, cotiza en EUR, **obliga a mostrar «Powered by CoinGecko»** y a **refrescar la caché cada 24 h** | `coingecko.com/en/api_terms` |
| OpenFIGI | Traduce ISIN a símbolo, gratis | `openfigi.com/api/documentation` |

## Opciones consideradas

1. **Rascar páginas públicas** (lo que suponía la tabla de §7, con Yahoo). Excluido: Yahoo lo prohíbe por escrito, Stooq lo bloquea y Morningstar no ofrece nada utilizable. **Quedan excluidos por escrito para que nadie los reintroduzca.**
2. **APIs con plan gratuito y clave** (decidida): EODHD, Alpha Vantage y CoinGecko.
3. **Sin precios automáticos.** Siempre posible, y el sistema tiene que seguir funcionando así; no es la opción, es el suelo.

## Decisión

**Fuentes** (decisión de la dirección): principal **EODHD Free**, respaldo **Alpha Vantage Free**; cripto, **CoinGecko Demo**, con la atribución **visible** donde se enseñe su cotización. Fondos por `EUFUND` **solo si cubre el ISIN concreto**; si no, extracto o entrada manual, y para la evolución, **la aproximación por ETF de referencia** de `docs/specification.md` §7.1, **siempre marcada como aproximación** (fórmula y alcance en la segunda enmienda). La entrada manual nunca desaparece.

**Correspondencia ISIN → símbolo: configuración de la descarga, no una búsqueda diaria.** ~~`asset_created`/`asset_updated` ganan `price_symbols?`, un mapa de fuente (`eodhd`, `alpha_vantage`, `coingecko`) a su símbolo.~~ **Corregido en la enmienda:** la correspondencia **no va en el libro**. Es configuración para descargar precios, que son informativos, no un hecho de la cartera, y una foto completa `asset_updated` escrita por un cliente antiguo la borraría sin avisar (ADR-0026, caso 6). Vive **con los precios**, en `prices/symbols.json` (junto a `prices/` en local, en el bucket en la nube): por activo, un mapa de fuente (`eodhd`, `alpha_vantage`, `coingecko`) a su símbolo. OpenFIGI **propone** el símbolo al dar de alta el activo y el usuario lo confirma; nada lo consulta después. Si el fichero se pierde, se rehace.

**Puerto `PriceSource`** en `packages/domain/src/ports/`, asíncrono, un adaptador por fuente. Pide cierres diarios de un símbolo entre dos fechas y devuelve cotizaciones (`date`, `close`, `currency`) o un fallo **con tipo**: `unavailable`, `not_found`, `rate_limited`, `blocked`, `invalid_response`, `budget_exhausted`. La cascada vive en un caso de uso del dominio que recibe los puertos (ADR-0007) y lo que escribe pasa por un puerto de almacén de precios, igual que el libro pasa por `LedgerStore`.

**Almacén: `prices/<asset_id>.jsonl`** (`docs/data-schema.md` §1), fuera del libro, una línea por fecha y fuente: `schema_version`, `date`, `close` (decimal como cadena, ADR-0005), `currency` tal como la devuelve la fuente (o, si no la devuelve, la declarada en `prices/symbols.json`: segunda enmienda), `source`, `fetched_at`. Solo se añade (salvo los datos de CoinGecko, en un fichero propio que se sobrescribe: segunda enmienda): si una fuente corrige un cierre ya guardado, entra una línea nueva y gana la más reciente, con la diferencia a la vista. **El paso a euros no se guarda**: lo hace la puerta al leer, con el histórico del BCE (ADR-0029); una cotización en una divisa sin tipo se enseña en su divisa, no se convierte con un tipo inventado.

**Política de fallo** (§7.2 y constitución V): fuente principal → respaldo → **último valor conocido con su antigüedad** → entrada manual ~~(`valuation`, que gana siempre)~~ (`valuation`; para enseñar un valor gana el dato de fecha más reciente, y con la misma fecha la valoración manual: segunda enmienda). `stale_price_days` marca lo antiguo. **Nunca se interpola** ni se rellena un día que falta. Cada fuente lleva su estado en `prices/_status.json` (fallos seguidos, último éxito, tipo del último fallo); un `blocked` o un `rate_limited` no se reintenta en bucle dentro de la misma ejecución; y superar un número configurable de fallos seguidos manda un correo, que es lo que avisará de que una fuente ha cambiado sus condiciones (el correo es de la feature 016; la 013 solo registra los fallos: segunda enmienda).

**Presupuesto de llamadas.** Veinte o veinticinco al día obligan a priorizar: primero las posiciones del cubo (la tarea diaria de §9.5 avisa si una tesis se acerca a su invalidación), después el índice de referencia del cubo y los ETF de referencia, después el resto del núcleo. Lo que no quepa ese día conserva su último valor con su antigüedad.

**Claves de API: son secretos** (decisión de la dirección). En local, en un fichero de configuración **fuera del repositorio** ~~; en la nube, SSM `SecureString`. El orden de las fuentes y su presupuesto viven con la clave, fuera del libro: son configuración de la máquina que descarga, no de la cartera.~~ **y fuera de la carpeta del libro**, `~/.config/atlas/secrets.json`, que la web no lee nunca; en la nube, SSM `SecureString`. El orden de las fuentes y su presupuesto, que no son secretos, van fuera del libro en `atlas.config.json`, junto a él (segunda enmienda).

**Dónde se descarga.** Etapa local: la consola (`atlas prices update`, nombre provisional). La web de escritorio lee `prices/` de la carpeta compartida; en el móvil, sin nube, no hay precios automáticos, y sí la importación a mano (segunda enmienda). No se abre la CSP (ADR-0029, punto 3). Etapa de nube: una tarea diaria en la Lambda escribe `prices/` y los dispositivos lo reciben por la API.

## Consecuencias

- **CoinGecko** (decisión de la dirección): sus condiciones piden refrescar la caché cada 24 h, y §1 del esquema dice que `prices/` se guarda **para siempre**. **De cripto solo se guarda el último valor conocido, sin histórico**, renovado cada día, hasta que alguien lea sus condiciones completas (la segunda enmienda precisa que la regla es **por fuente**, no por tipo de activo, y que un valor sin renovar en 24 horas deja de mostrarse). **Las acciones y los ETF sí guardan histórico.**
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

1. **Claves.** Las claves de API van en un fichero de secretos **fuera de la carpeta del libro**, `~/.config/atlas/secrets.json` (o el equivalente XDG, `$XDG_CONFIG_HOME/atlas/secrets.json`), con permisos `600`. **La web no lo lee nunca**, y no entra en ninguna copia de seguridad, exportación ni sincronización: la carpeta del libro se copia, se exporta y un día se sincronizará, y una clave no debe viajar con ella. **El orden de las fuentes y el presupuesto de llamadas** no son secretos y van en `atlas.config.json`, junto al libro; su lector aprende esas claves nuevas sin dejar de rechazar las desconocidas.
2. **Qué gana en la puerta de precios.** Para **enseñar un valor**, gana **el dato de fecha más reciente**; con la misma fecha gana **la valoración manual**, porque el usuario es la autoridad. Para el Modelo 720 y cualquier ruta fiscal **no cambia nada**: solo cuentan las valoraciones del libro, y el test de arquitectura sigue impidiendo que entre una cotización automática. Lo destapó la redacción del prompt: con el código de entonces, cualquier valoración anterior ganaba por antigua que fuera, y la del 31 de diciembre para el 720 habría tapado todos los cierres automáticos posteriores.
3. **Aproximación por ETF de referencia** de un fondo que `EUFUND` no cubre: **último valor liquidativo real conocido del fondo × (cierre del ETF hoy / cierre del ETF en la fecha de ese liquidativo)**. Sin un liquidativo real que la ancle, **no hay aproximación**. Llega a la **presentación y a los pesos**, **siempre marcada como aproximada**; la calculadora de la aportación **dice** cuándo algún peso que usa depende de una aproximación. **Nunca llega a nada fiscal.**
4. **«Solo el último valor» es por fuente**, no por tipo de activo: es una condición contractual de CoinGecko. Una ETP de cripto que llegue por EODHD guarda histórico.
5. **Los activos y su prioridad salen del libro de la consola**, que es quien descarga. Un activo creado solo en la web no tiene precio automático hasta que exista la sincronización, o se pase por exportar e importar.
6. **Importar precios a mano en el móvil: sí.** La entrada manual nunca desaparece.
7. **Dos fuentes con cierre para la misma fecha:** gana **la primera en el orden configurado**, y se guarda de qué fuente vino. No se promedia nada.
8. **El correo por fallos seguidos es de la feature 016.** La 013 solo lleva el registro de fallos.
9. **Atribución de CoinGecko: texto y enlace**, con `rel="noopener noreferrer"`. Un enlace no carga nada de fuera, así que no choca con la CSP. Si la comprobación del paquete rechaza URLs externas, se añade la excepción con su motivo escrito, como la del BOE.
10. **El techo del total del paquete web** sube con la regla de siempre, en su propio commit, a lo medido más un margen pequeño y con el desglose. **El arranque no sube en ningún caso**, y si no cabe, la feature para.

**Lo que esta ADR dejaba sin decir:**

- **La divisa de la cotización.** Si la fuente no la devuelve, **la declara cada entrada de `prices/symbols.json`** de forma explícita, y se contrasta con los metadatos de la fuente cuando existan. Si no coinciden, **no se guarda** y queda un fallo registrado. Nunca se supone.
- **CoinGecko y «solo se añade».** Esa regla es **del libro**, no de la caché de precios. Los datos de CoinGecko van en **un fichero propio que se sobrescribe**, separado del histórico de las demás fuentes.
- **Las 24 horas de CoinGecko.** Un valor que no se ha podido renovar en 24 horas **deja de mostrarse**, y la aplicación dice que ha caducado y no se pudo renovar; queda a mano la entrada manual. Es la lectura conservadora de sus condiciones: la dirección prefiere eso a enseñar un dato que sus condiciones no permiten conservar. Es la única excepción a «último valor conocido con su antigüedad».
- **El cupo del día** se cuenta en `prices/_status.json` y **se reserva bajo el cerrojo de la carpeta antes de llamar**, de modo que dos consolas a la vez no se pasan.
- **La clave en la URL** (EODHD y Alpha Vantage) **se censura** en todo mensaje de error y en todo registro. Un test con una clave centinela falla si la clave aparece en cualquier salida, y un mutante quita la censura.
- **SIN VERIFICAR**, con la regla de la Ronda 8 (cada feature lo verifica, con fuente, antes de escribir código, y lo que encuentre se escribe aquí): las condiciones completas de **EODHD Free** (cupo y su reinicio, coste de pedir un año de cierres, si el uso personal permite guardar, si el cierre es sin ajustar, si la respuesta dice la divisa, cómo marca los errores); **si su plan gratuito incluye índices**; **si incluye `EUFUND` y si cubre los ISIN concretos** de los fondos del usuario; las condiciones completas de **Alpha Vantage Free** (cupo, histórico del *endpoint* diario, divisa, sufijo de bolsa europeo, si permite guardar); las condiciones completas de **CoinGecko Demo** (cupo, qué exige exactamente la atribución, qué significa «refrescar la caché cada 24 h»); **OpenFIGI** (uso sin clave, cupo, y cómo se traduce su código de bolsa al símbolo de EODHD y de Alpha Vantage); y **cómo lleva cada fuente la clave** y qué devuelve en un error. Qué hacer si algo sale mal está en el bloque 0 del prompt 013; en ningún caso se sustituye una fuente por otra sin la investigación de esta ADR.

**Documentos que hay que actualizar** además de esta ADR: `docs/data-schema.md` §1 (las filas de `prices/`, el fichero propio de CoinGecko, las claves nuevas de `atlas.config.json` y el fichero de secretos fuera de la carpeta) y `docs/specification.md` §7.2 (la entrada manual «gana siempre») y §11.8 («con ellas van el orden de las fuentes y su presupuesto»). Los traslada la dirección al cerrar la feature 013, con lo verificado.
