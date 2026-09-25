# Preguntas y verificaciones de la feature 013

Fechas en `Europe/Madrid`. Todo lo descargado o ejecutado está en el *scratchpad* de la sesión (ficheros con `013` en el nombre), **nunca en el repositorio**. Las citas de los proveedores van en inglés, literales, con su dirección; se leyeron el **2026-09-24**.

---

## 0. Estado: alto del plan (2026-09-24)

`spec.md` y `plan.md` escritos; el bloque 0 hecho hasta donde se puede sin una clave real. **No hay código de producción.** Para seguir hace falta:

1. **El visto bueno de la dirección** al plan y a las propuestas de §2.
2. **Las respuestas de §3** (preguntas **Q1-Q10**; Q9 es una errata y no pide respuesta).
3. **Tres comprobaciones que solo puede hacer el usuario con su clave de EODHD** (§1.8): índices, `EUFUND` para sus ISIN y la unidad de Londres. **No bloquean la construcción** (los adaptadores se construyen con dobles), pero sí lo que el plan diga de índices y fondos hasta que lleguen.

**Ninguna verificación ha salido «prohibido».** Ninguna fuente de ADR-0031 prohíbe lo que la ADR le pide; ninguna se deja sin implementar por sus condiciones. Sí han salido **cuatro cosas que la ADR no sabía** y que cambian el diseño o piden una decisión (Q1-Q4): los cierres llegan como **números JSON** (trampa 3), **ninguna de las dos fuentes de acciones devuelve la divisa**, **Alpha Vantage no documenta cuándo reinicia su cupo y responde todo con HTTP 200**, y **OpenFIGI no documenta qué significan sus códigos de bolsa**. Y dos cláusulas de CoinGecko que el encargo no nombra (Q5).

---

## 1. Bloque 0 — las verificaciones, con su fuente

### 1.1 EODHD Free, condiciones completas (punto 0.1)

| Qué | Lo que dice | Fuente |
|---|---|---|
| Cupo | «Daily call limit … 20 on the Free plan … Midnight GMT»; «Free plan — 20 API calls per day» | `https://eodhd.com/financial-apis/api-limits` |
| Reinicio | «For subscription plans the daily limit resets at midnight GMT. The counter itself is reset lazily: it is zeroed by your first request after midnight». La fila de la tabla que cubre el plan gratuito dice «Midnight GMT» sin la salvedad | ídem |
| Coste de un año de cierres | «Each request — whatever its length, and including a 404 — costs one API call»; «1 call per request (any length of price history)» | `https://eodhd.com/financial-apis/api-for-historical-data-and-volumes` |
| Histórico gratuito | «only the past year of history and 20 API calls a day»; en precios, «Data Range: Past year» | ídem; `https://eodhd.com/pricing` |
| Guardar | «Non-Professional Users are permitted to store, manipulate, and analyze the data for private, non-commercial purposes. However, they are prohibited from: Sharing access to their account … Selling, reselling, retransmitting, redistributing, displaying, or granting access to the Information … to others» | `https://eodhd.com/financial-apis/terms-conditions` |
| Uso personal | «The packages on the pricing page are intended for personal use only» | `https://eodhd.com/financial-apis/commercial-vs-personal-license-use` |
| Sin ajustar | «close … Closing price, as traded — not adjusted»; «adjusted_close … adjusted for both splits and dividends»; «Adjusted closes are recomputed, not stored … Never treat an adjusted close as a stable key» | página de fin de día |
| Divisa en la respuesta | **No.** Campos: `date, open, high, low, close, adjusted_close, volume` (documentado y comprobado en vivo) | página de fin de día; llamada con la clave `demo` |
| Divisa por otra vía | `exchange-symbol-list/{EX}` («Currency … Trading currency of the listing», «Each request consumes 1 API call», «All plans», admite `symbols=` para mirar solo unos códigos); `search/{q}` (1 llamada, plan gratuito); *fundamentals* cuesta 10 y **no** está en el gratuito | `https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours`, `…/search-api-for-stocks-etfs-mutual-funds`, `…/stock-etfs-fundamental-data-feeds` |
| Errores | 401 «The api_token is missing, malformed or invalid»; 403 «The token is valid but not entitled to that symbol»; 404 «Ticker Not Found.»; 200 con `[]` «Not an error: the window ends before it starts, lies entirely in the future, or the symbol has been renamed away»; cupo agotado: «HTTP 402 … API Rate Limit Exceeded»; por minuto: «HTTP 429 … Retry-After». Cuerpos en texto plano | página de fin de día; `…/api-limits` |
| Clave | «Authentication is by api_token in the query string» (OpenAPI oficial: `in: query`). Una cabecera `Authorization: Bearer` **funciona en vivo pero no está documentada** para la API REST | página de fin de día; `raw.githubusercontent.com/EodHistoricalData/EODHD-openapi/main/components/securitySchemes.yaml` |
| Forma del número | **`close` llega como número JSON** (`"close":325.13`), no como cadena | llamada en vivo, clave `demo`, `AAPL.US`, 2026-09-01 a 05 |

**Lectura.** Guardar para uso privado está **expresamente permitido**; «para siempre» no está escrito, pero tampoco limitado. Nada sobre uso automatizado. Lo único prohibido que roza la feature es **«displaying … to others»**: la aplicación es de un solo usuario y no enseña nada a terceros. Rareza: las condiciones dicen «One API key allows querying 100 000 API requests per day», que contradice las 20; manda la página de límites.

**Consecuencias en el plan:** el cupo se cuenta por **día GMT** (Q3); el primer cierre de un activo pide **un año**; se guarda solo `close`, nunca `adjusted_close`; un `[]` **no es un fallo** (§2.6); la divisa la declara `symbols.json` (§6.3 (a)) y el contraste va en Q2; el número se lee **por su texto** (Q1).

### 1.2 Índices en el plan gratuito (punto 0.2) — **SIN VERIFICAR**

La documentación dice «INDX for indices» y «the same endpoint for any ticker», con `GSPC.INDX` de ejemplo; **no dice** que el plan gratuito incluya índices. La clave `demo` responde 403 a `GSPC.INDX`, lo esperado para ella (solo sirve para seis *tickers*). Hace falta la comprobación del usuario (§1.8). **Si sale que no**: el índice del cubo no tiene precio automático y se dice; el usuario puede poner un ETF como referencia. No se busca otra fuente.

### 1.3 `EUFUND` (punto 0.3) — formato verificado; cobertura **SIN VERIFICAR**

«EUFUND | Europe Fund Virtual Exchange | European mutual funds, quoted in EUR»; «EUFUND holds 69,327 instruments»; el símbolo es `<ISIN>.EUFUND` (`https://eodhd.com/exchange/EUFUND`: «Active Tickers 68802», filas como `AT0000494893.EUFUND`, divisa EUR, tipo FUND). El listado se pide con `exchange-symbol-list/EUFUND`, **1 llamada** en todos los planes. **No dice** que el fin de día del plan gratuito cubra `EUFUND`. Los ISIN del usuario **no están a mi alcance** (`plan-financiero.md` no está en esta máquina ni en el repositorio): va a §1.8. En este fichero se escribirá solo el recuento.

### 1.4 Alpha Vantage Free, condiciones completas (punto 0.4)

| Qué | Lo que dice | Fuente |
|---|---|---|
| Cupo | «free stock API service … for 25 API requests per day» | `https://www.alphavantage.co/support/` |
| Reinicio | **No documentado.** Buscado «reset», «midnight», «UTC» en soporte, *premium*, condiciones y documentación | ídem, `…/premium/`, `…/documentation/` |
| Por minuto | No documentado; solo un mensaje de error sugiere «1 request per second» | respuesta en vivo |
| Cierres diarios | `TIME_SERIES_DAILY` sin marca *premium*, «raw (as-traded)»; «The "compact" outputsize is available to both free and premium API keys. The "full" outputsize is available to premium keys»; *compact* = «the latest 100 data points» | `https://www.alphavantage.co/documentation/` |
| Divisa en la respuesta | **No.** `Meta Data` (información, símbolo, último refresco, tamaño, zona horaria) y `Time Series (Daily)` con `"4. close": "232.7600"` **como cadena** | llamada en vivo, clave `demo`, IBM |
| Divisa por otra vía | `SYMBOL_SEARCH`, gratuito, devuelve `"8. currency"` (p. ej. `TSCO.LON` → `GBX`). Si cuenta contra las 25: **no documentado** | documentación; llamada en vivo `keywords=tesco` |
| Sufijos | Documentados: `TSCO.LON`, `MBG.DEX` (XETRA), `SHOP.TRT`, `GPV.TRV`, `RELIANCE.BSE`, `600104.SHH`, `000002.SHZ`; EE. UU. sin sufijo. `.FRK` solo aparece en una búsqueda. **París, Ámsterdam, Madrid, Milán y Suiza: no documentados** | documentación |
| Guardar | Las condiciones (PDF) conceden uso «for personal, non-commercial use», que incluye «investment analysis, research, testing, monitoring, and any other activities that are private and individual in nature». **No hablan de guardar, cachear, automatizar ni atribuir**: ni lo permiten ni lo prohíben expresamente | `https://www.alphavantage.co/terms_of_service/` §2.a, §3 |
| Clave | Solo `apikey` en la URL; ninguna cabecera documentada | documentación |
| Errores | **Todos con HTTP 200**, se distinguen por la clave del cuerpo: `"Error Message": "the parameter apikey is invalid or missing…"` (sin clave), `"Error Message": "Invalid API call…"` (símbolo inexistente), `"Information": "…free key rate limit (25 requests per day)…"` (cupo o ráfaga). **Una clave inventada no se rechaza**: según el símbolo recibe datos (IBM), un `Error Message` o el `Information` del cupo. El antiguo `"Note"` no aparece | llamadas en vivo |

**Lectura.** Guardar no está prohibido, así que **no se para** (bloque 0, «si las condiciones prohíben»): se dice que las condiciones callan. El respaldo gratuito solo ve **los últimos 100 días de mercado**: sirve para el día a día, no para rellenar un año. Consecuencias: Q3 (reinicio desconocido) y Q4 (clasificar fallos por el cuerpo).

### 1.5 CoinGecko Demo, condiciones completas (punto 0.5)

| Qué | Lo que dice | Fuente |
|---|---|---|
| Cupo | «Call credits /mo | 10k», «Rate limit /min | 100»; «on the first day of the following month, your request will reset again»; ningún límite diario | `https://www.coingecko.com/en/api/pricing` |
| Atribución | «you shall duly attribute ownership of the CoinGecko API to CoinGecko by displaying prominently the message "Powered by CoinGecko" in a legible font (an example of a legible font type being "Arial") no smaller than font size 10» | `https://www.coingecko.com/en/api_terms` («Latest Version: 5 Sept 2025») |
| Guía de atribución | Dos opciones: «Text attribution» (ejemplo en imagen: «Powered by CoinGecko API» con el nombre enlazado, encima de la tabla) o logotipo con enlace a `https://www.coingecko.com` o `https://www.coingecko.com/en/api`. «Ensure that the attribution is placed in a visible location, close to where the data is displayed, i.e. above or below the data set»; «Do not remove or obscure the attribution» | `https://brand.coingecko.com/resources/attribution-guide` |
| Caché | «We do not encourage caching or storage of Data. However, if you must cache or store Data:- You should refresh the cache at least every 24 hours; **Strong encryption and other security measures should be applied to stored Data**; … In the event that CoinGecko terminates your access … you agree to promptly and permanently delete all Data … Except as expressly permitted hereunder … you are not allowed to duplicate, reproduce, copy, store … any Data» | `…/api_terms`, «Data Caching and Storage» |
| Uso | Licencia «to use the CoinGecko API to develop, test, and support any software application»; prohibido redistribuir. La página de precios describe Demo como «a free plan to try out the CoinGecko API. It's good for testing and exploration», y **Basic** como «suited for personal use» | `…/api_terms`; `…/api/pricing` |
| Clave | Cabecera `x-cg-demo-api-key` («recommended») o parámetro `x_cg_demo_api_key`; «Avoid query string parameters in production — they risk exposing your key in logs»; raíz `https://api.coingecko.com/api/v3/` | `https://docs.coingecko.com/demo/reference/authentication.md` |
| Precio | `/simple/price?ids=…&vs_currencies=eur&include_last_updated_at=true` → `{"bitcoin":{"eur":<número>,"last_updated_at":<segundos UNIX>}}`; es el **precio actual** (refresco de 60 s en Demo), no un cierre | `…/demo/reference/simple-price.md`; llamada en vivo sin clave |
| Errores | 401 «Missing or invalid API key»; 429 «Rate limit exceeded»; en vivo, una clave inválida da 401 con `error_code: 10002`; **un `id` inexistente da 200 con `{}`** | `https://docs.coingecko.com/docs/errors-and-rate-limits.md`; llamadas en vivo |

**Lectura.** La atribución decidida (P9: texto «Powered by CoinGecko» **y** enlace, junto al valor) **cumple** las condiciones y la guía; el logotipo es opcional. Nada pide **más**, salvo el tamaño mínimo (≥ 10), que la escala tipográfica de la web ya supera (13 px) y que en la consola no aplica. Las condiciones **callan** sobre enseñar un valor sin renovar: la regla de §6.3 (c) no es más laxa que ellas; es su lectura conservadora, y la cláusula final («not allowed to … store … except as expressly permitted») la respalda. Guardar **solo el último valor**, renovado, es compatible. **Dos cláusulas que el encargo no recoge** van a Q5.

### 1.6 OpenFIGI (punto 0.6)

| Qué | Lo que dice | Fuente |
|---|---|---|
| Sin clave | «The API is free and open to the public, though unauthenticated traffic will be subject to a lower rate-limit» | `https://www.openfigi.com/api/documentation` |
| Cupo sin clave | «25 Per Minute»; «Max Jobs Per Request 10» (otra tabla de la misma página dice 5); cabeceras en vivo `ratelimit-limit: 25`, `ratelimit-reset: 60` | ídem; llamada en vivo |
| Condiciones | Los identificadores FIGI son de dominio público; «related security descriptions are provided "as is"». Nada sobre uso automatizado ni sobre guardar el resultado | `https://www.openfigi.com/docs/terms-of-service` |
| Respuesta | `figi, name, ticker, exchCode, compositeFIGI, securityType, marketSector, shareClassFIGI, securityType2, securityDescription`. **Ni divisa ni MIC** (solo existen como filtros de la petición). ISIN desconocido: 200 con `[{"warning":"No identifier found."}]`; mal formado: `[{"error":"Invalid idValue format."}]` | documentación; llamadas en vivo |
| Códigos de bolsa | `GET /v3/mapping/values/exchCode` lista 1.106 códigos **sin descripción**. **OpenFIGI no documenta qué significa ninguno** (que `GY` es Xetra es convención de Bloomberg, no un dato de su documentación) | llamada en vivo |
| Filtro por MIC | Documentado como campo de petición (`micCode`). Probado el 2026-09-24 con un ISIN público (Apple): `XETR` → un resultado (`APC`/`GY`); `XLON` → **28** (varias divisas y plataformas); `XNAS` → «No identifier found.» (EE. UU. va por el compuesto `US`) | llamada en vivo |

**Traducción a EODHD y a Alpha Vantage** (tabla de datos, no criterio; cada celda con su estado):

| Bolsa | MIC | EODHD | Alpha Vantage |
|---|---|---|---|
| EE. UU. (compuesto) | — (OpenFIGI `US`) | `.US` — documentado | sin sufijo — documentado |
| Xetra | `XETR` | `.XETRA` — documentado | `.DEX` — documentado |
| Fráncfort | `XFRA` | `.F` — documentado | `.FRK` — solo visto en una búsqueda |
| Londres | `XLON` | `.LSE` — documentado en ejemplos, **ausente** de la lista de bolsas | `.LON` — documentado |
| Ámsterdam | `XAMS` | `.AS` — documentado | **no documentado** |
| París | `XPAR` | `.PA` — documentado | **no documentado** |
| Madrid | `BMEX` (EODHD) | `.MC` — documentado | **no documentado** |
| Suiza | `XSWX` | `.SW` — documentado | **no documentado** |
| Milán | — | **no documentado** | **no documentado** |

Fuentes: `https://eodhd.com/list-of-stock-markets`, página de fin de día de EODHD, documentación de Alpha Vantage. Propuesta de uso en Q6.

### 1.7 Cómo lleva cada fuente la clave y qué devuelve al fallar (punto 0.7)

| Fuente | Clave | Dónde se puede filtrar | Fallos |
|---|---|---|---|
| EODHD | `api_token` en la URL | **URL**: en un mensaje de `fetch`, en un registro, en lo guardado de la descarga | Por código HTTP (401, 402, 403, 404, 429); cuerpo en texto |
| Alpha Vantage | `apikey` en la URL | **URL**, igual | Siempre 200; por la clave del cuerpo JSON |
| CoinGecko | cabecera `x-cg-demo-api-key` | una cabecera volcada en un error | Por código HTTP (401, 429); `{}` para un `id` desconocido |
| OpenFIGI | sin clave (la opcional iría en `X-OPENFIGI-APIKEY`) | — | 200 con `warning`/`error` por trabajo; 400, 413, 429 |

Qué se enseña de una URL al fallar: **nada de la URL**. El mensaje dice la fuente, el símbolo y el tipo de fallo (§6.4 (e)); lo que se guarde de una descarga guarda `source` y símbolo, no la dirección.

### 1.8 Lo que tiene que comprobar el usuario con su clave de EODHD

Cinco o seis llamadas, **1 del cupo cada una**, en su máquina, **sin pasarme la clave ni los ISIN**. La dirección se las hace llegar si lo aprueba:

```bash
K=$(jq -r .eodhd ~/.config/atlas/secrets.json)   # o la clave a mano
# 1. Índices en el plan gratuito
curl -s -o /dev/null -w 'GSPC.INDX %{http_code}\n' "https://eodhd.com/api/eod/GSPC.INDX?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"
curl -s -o /dev/null -w 'STOXX50E.INDX %{http_code}\n' "https://eodhd.com/api/eod/STOXX50E.INDX?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"
# 2. EUFUND: cuántos de sus ISIN cubre (sustituir ISIN1,ISIN2,… por los suyos; no copiar la salida, solo el recuento)
curl -s "https://eodhd.com/api/exchange-symbol-list/EUFUND?api_token=$K&fmt=json&symbols=ISIN1,ISIN2" | jq length
#    y si el fin de día del plan gratuito los sirve (uno cualquiera de los cubiertos):
curl -s -o /dev/null -w 'EUFUND eod %{http_code}\n' "https://eodhd.com/api/eod/ISIN1.EUFUND?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"
# 3. La unidad de Londres (un ETF público en libras, p. ej. CSPX.LSE): el cierre y la divisa que dice el listado
curl -s "https://eodhd.com/api/eod/CSPX.LSE?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05" | jq '.[0].close'
curl -s "https://eodhd.com/api/exchange-symbol-list/LSE?api_token=$K&fmt=json&symbols=CSPX" | jq '.[0].Currency'
# 4. Cripto en el plan gratuito (D-Q5): el formato de la bolsa virtual CC es <PAR>.CC
curl -s -o /dev/null -w 'BTC-EUR.CC %{http_code}\n' "https://eodhd.com/api/eod/BTC-EUR.CC?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"
```

Qué anotar: los códigos HTTP, el recuento de `EUFUND` (no los ISIN) y los dos valores de Londres (para ver si el cierre está en peniques mientras el listado dice `GBP`, que es lo que afirma un informe de terceros no verificado). Si el parámetro `symbols=` no filtra en `EUFUND`, la respuesta entera es muy grande: entonces `| jq '[.[] | select(.Code=="ISIN1" or .Code=="ISIN2")] | length'`.

---

## 2. Propuestas del plan (las decide la dirección)

### 2.1 Qué cuenta como «liquidativo real» para anclar la aproximación (P3)

**Propuesta: solo dos datos cuentan, y el más reciente en o antes de la fecha pedida gana:**

1. **una `valuation` del fondo** en el libro (con su fecha);
2. **un cierre de `EUFUND` del fondo** guardado en `prices/` (con su fecha).

**No cuenta el `unit_price` de una operación**, y lo propongo así a sabiendas: en un fondo la fecha fiscal es la de valor (`value_date`), y el `unit_price` es el liquidativo **de la fecha de la orden** o de la de valor según la gestora, sin que el libro diga de cuál; anclar en él mezclaría fechas y el cociente del ETF se tomaría en el día equivocado. Si la dirección lo quiere incluir, pido la regla de qué fecha lleva ese liquidativo (`trade_date` o `value_date`). **Nunca cuenta otra aproximación.** Sin cierre del ETF **exactamente** en la fecha del ancla, no hay aproximación, y se dice (`approximation_no_etf_close_at_anchor`).

### 2.2 El nombre del fichero de CoinGecko

**Propuesta: `cache/coingecko.json`**, un solo fichero que se sobrescribe entero, con este contrato:

```json
{ "cache_format": 1,
  "values": { "<asset_id>": { "symbol": "bitcoin", "value": "54321.5", "currency": "EUR",
                              "last_updated_at": "2026-09-24T05:23:20Z", "fetched_at": "2026-09-24T05:25:02Z" } } }
```

Un solo fichero, y no uno por activo, porque `/simple/price` trae todas las criptos en **una** llamada y así la sustitución es atómica de una vez. Sin histórico: cada escritura reemplaza el valor del activo. La **caducidad de 24 h se mide desde `fetched_at`** (la última vez que **nosotros** refrescamos, que es lo que pide «refresh the cache at least every 24 hours»), no desde `last_updated_at`. La fecha de la cotización para la puerta es la fecha en `Europe/Madrid` de `last_updated_at`.

### 2.3 El literal del fallo de divisa

**Propuesta: `currency_mismatch`**, séptimo tipo de fallo de la descarga, fuera de los seis de `PriceSource` porque no lo produce la fuente sino el contraste del caso de uso (la fuente no sabe qué divisa se declaró). Queda registrado en `_status.json` por activo, con la divisa declarada y la encontrada, y **no** cuenta como fallo seguido de la fuente (la fuente respondió bien; lo que no cuadra es la configuración del usuario).

### 2.4 Qué hace la consola con un `secrets.json` demasiado abierto

**Propuesta: se niega a usar las claves**, sin llamar a ninguna fuente, y lo dice con el código `secrets_too_open` y la orden que lo arregla (`chmod 600 <ruta>`); todo lo demás funciona (es el mismo camino que «sin claves»). No lo arregla ella: **la aplicación no escribe ese fichero**. Motivo: un aviso que deja seguir enseña a ignorarlo, y el coste de negarse es un `chmod`. «Demasiado abierto» = cualquier bit de grupo u otros (`mode & 0o077 ≠ 0`); en Windows (sin permisos POSIX) no se comprueba y se dice una vez.

### 2.5 Qué hace un lector con una línea de precio de una `schema_version` que no conoce

Partiendo de `docs/data-schema.md` §5 (el cargador del libro **rechaza** el fichero entero si una línea es más nueva): **propuesta, rechazar el fichero de ese activo, no la línea, y decirlo** (`price_file_newer_version`). Ese activo se queda **sin precio automático** (no con el que quede de quitar la línea), las demás siguen; y la escritura de la consola **se niega a añadir** a ese fichero, como el libro. Motivo: una línea más nueva puede ser la corrección de otra más antigua del mismo (`date`, `source`); leer las demás daría el cierre corregido por la mitad. Una línea **ilegible** de la versión conocida: el mismo trato (`price_line_invalid`, con el número de línea).

### 2.6 Otras decisiones de plan que conviene ver ahora

- **Un `[]` de EODHD no es un fallo**: es «no hay cierres nuevos en esa ventana» (fin de semana, festivo). La cascada no pasa al respaldo por él. Un símbolo renombrado también da `[]` para siempre; lo delata la antigüedad del último cierre, que se ve y se marca.
- **Qué se pide**: desde el día siguiente al último cierre guardado de esa fuente hasta hoy; sin ninguno, un año (EODHD) o *compact* (Alpha Vantage). La segunda ejecución del día **no gasta cupo** en un activo cuyo último cierre ya es el último día hábil (lunes a viernes) anterior a hoy; festivos no se conocen y cuestan una llamada.
- **CoinGecko se refresca en cada `atlas prices update`** con una sola llamada para todas las criptos, aunque sea la segunda del día (10.000 al mes dan de sobra): es la única forma de que el valor no caduque entre dos ejecuciones separadas más de 24 h, que con una ejecución diaria a horas distintas pasaría a menudo.

---

## 3. Preguntas a la dirección

**Q1 — Los cierres llegan como números JSON (EODHD y CoinGecko).** Trampa 3: un `325.13` leído con `JSON.parse` pasa por coma flotante. **Propuesta:** leer el **texto** del número con el tercer argumento del *reviver* de `JSON.parse` (`context.source`, disponible en Node 22), y rechazar como `invalid_response` todo número que no llegue con su texto. Sin dependencia nueva. ¿De acuerdo? (Alpha Vantage ya los da como cadena.)

**Q2 — La divisa: cuándo se contrasta.** Ninguna de las dos fuentes de acciones devuelve la divisa en los cierres; sus metadatos sí (EODHD `exchange-symbol-list?symbols=`, Alpha Vantage `SYMBOL_SEARCH`), a **1 llamada del cupo** cada uno. **Propuesta:** contrastar **al confirmar la correspondencia** (alta del activo u orden de símbolos), no en cada descarga, guardando en `symbols.json` el resultado del contraste (`currency_checked_at` por fuente); la descarga diaria no gasta cupo en metadatos. Y un **caso que puede dar un falso desacuerdo**: un informe de terceros dice que EODHD etiqueta Londres como `GBP` mientras los cierres van en peniques (sin verificar, §1.8 punto 3). Si se confirma, el contraste rechazaría una declaración `GBX` **correcta**. ¿Contrastar al confirmar, y qué hacer si el listado de la bolsa dice una cosa y el precio otra?

**Q3 — El día del cupo.** EODHD reinicia a medianoche GMT (documentado). **Alpha Vantage no documenta cuándo.** **Propuesta:** EODHD por día GMT (`_status.json` guarda el día GMT al que corresponde lo gastado); Alpha Vantage por **ventana móvil de 24 horas** (se guardan las horas de las llamadas de las últimas 24 h), que nunca se pasa del cupo sea cual sea su hora de reinicio; CoinGecko por **mes natural UTC** con su cupo de 10.000 (configurable). ¿De acuerdo?

**Q4 — Clasificar los fallos de Alpha Vantage por el cuerpo.** Todo llega con 200. **Propuesta:** `Time Series (Daily)` → éxito; `Error Message` que nombra `apikey` → `blocked`; otro `Error Message` → `not_found`; `Information` o `Note` → `rate_limited`; cualquier otra cosa → `invalid_response`. **Salvedad que hay que decir en la interfaz:** una clave inventada no se rechaza, así que Alpha Vantage **no puede dar `blocked` de forma fiable** (se verá como `rate_limited`). Distinguir por el texto del mensaje es frágil y el test lo ata a los cuerpos observados. ¿De acuerdo? Y en EODHD, **el 403** («token válido sin derecho a ese símbolo»): propongo **`not_found` para ese símbolo** (no `blocked`), porque `blocked` detiene la fuente entera en la ejecución y un índice fuera del plan no debe dejar sin precios al resto; el mensaje dice «la clave no da acceso a este símbolo». ¿O prefieres un literal propio?

**Q5 — Dos cláusulas de CoinGecko que el encargo no recoge.** (a) «Strong encryption and other security measures **should** be applied to stored Data»: `cache/coingecko.json` va en claro en la carpeta del libro. (b) Demo se describe como «good for testing and exploration», y el plan que se describe como «suited for personal use» es **Basic**, de pago. Ninguna prohíbe lo que pide ADR-0031 (la primera es «should»; la segunda describe, no restringe), así que no paro; pero ninguna de las dos es mía de leer. ¿Seguimos con el fichero en claro y con Demo?

**Q6 — La propuesta de OpenFIGI, sin traducción documentada.** OpenFIGI no dice qué bolsa es cada `exchCode`. **Propuesta:** preguntar por ISIN **con `micCode`** (campo documentado) para cada MIC de la tabla de §1.6 cuyo sufijo de EODHD está documentado, y además el compuesto `US`; enseñar al usuario **la lista de candidatos** (símbolo EODHD, símbolo Alpha Vantage donde el sufijo está documentado, nombre) y que elija uno o ninguno. Donde un MIC da varios resultados (Londres dio 28), se enseñan todos los que no llevan divisa en el *ticker* y el usuario elige. Para Alpha Vantage, sin sufijo documentado **no se propone nada** y el usuario lo escribe. Cuesta una llamada a OpenFIGI (hasta 10 trabajos por petición) por alta. ¿Así, o solo EE. UU., Xetra y Londres, que es lo único documentado en las dos fuentes?

**Q7 — Coste en el arranque del paquete web: cabe por 23 bytes.** Medido con un **ensayo desechado** (no está en la rama): P2 en `priceAt`/`manualPrices`, `unit_value_eur` opcional, el aviso de «sin valor en euros» en los pesos y la guarda del cubo añaden **+121 bytes gzip** al trozo del dominio y +9 a la entrada (nombres de trozos): **75.548 de 75.571** (73,8 KB), **23 bytes** de margen. Todo lo demás de la feature se puede hacer diferido (las vistas de la web ya son perezosas; el dominio de precios va en su puerta propia). Pero **`networth.ts`** tendrá que distinguir «sin precio» de «sin valor en euros» y no está en el ensayo: **es probable que no quepa**. La regla del encargo es parar y decirlo con la medida; lo adelanto ahora. ¿Qué prefieres si al implementarlo pasa del techo: (a) para y decides con la medida exacta, (b) autorizas de antemano subir el techo del arranque **solo** lo que midan esos cambios del dominio (nada de precios en sí entra en el arranque), o (c) otra cosa?

**Q8 — La hoja `manualPriceAt` y la puerta.** Tu preferencia (la puerta importa la hoja) **no rompe ningún guardián**, con dos admisiones nombradas que el encargo ya prevé: la hoja entra en la lista cerrada de «keeps every read of the valuations behind the gate of prices.ts», y «keeps prices.ts a leaf among the projections» la admite por su nombre. Detalle en `plan.md` §2. La contrapartida, dicha: con una sola lectura de las valoraciones, **un cambio en la hoja para la presentación cambia también el 720**. Lo cubre el test de salida fiscal idéntica y los mutantes del 720, pero es un acoplamiento que la otra forma no tendría. ¿Confirmas la hoja importada por la puerta?

**Q10 — La web necesita el orden de las fuentes para P7.** Con dos cierres de la misma fecha de fuentes distintas, gana la primera **en el orden configurado**, que vive en `prices/config.json`; el encargo dice que la web no lo necesita. Pero la web **lee** y tiene que desempatar igual que la consola. **Propuesta:** la web lee `prices/config.json` de la carpeta **solo** por `source_order` (no es secreto; una web antigua lo ignora porque no lo lee); con importación a mano, el orden por defecto (`eodhd`, `alpha_vantage`). Alternativa: que la consola no escriba nunca un segundo cierre de la misma fecha si ya hay uno de una fuente anterior en el orden (entonces no hay nada que desempatar, pero se pierde la corrección cruzada). ¿Cuál?

**Q9 — Una errata del encargo.** §1.8 dice que lo comprobado del código es sobre `develop` `7cc01ed`; el `develop` de hoy es `6a8ac2d` (el prompt se fusionó después). He comprobado sobre `6a8ac2d` todo lo que el encargo afirma del código (§4) y cuadra. No pide respuesta; se anota para §7.

---

## 4. Lo que el encargo afirma del código, comprobado sobre `develop` (`6a8ac2d`)

Cuadra todo lo mirado:

- `prices.ts`: `priceAt(state, assetId, date, settings, external?)`, `manualPrices(…, external?)`, `ExternalPrices.at` síncrono, `ExternalQuote.fx_rate` obligatorio y `fx_rate_date` opcional; la valoración manual gana siempre (`latestValuations`); el comentario de `priceDates` (líneas 142-143) invita a añadir las fechas automáticas «here». Cuadra.
- **Quién llama a la puerta** (enumerado a mano; §3 del bloque 1 del encargo): `priceAt` desde `bucket.ts` (193, 304, 311, 370) e `informative/valuation.ts` (94); `manualPrices` desde `weights.ts` (268), `costs.ts` (341) y `simulate-transfer.ts` (97, sin `external`); `ExternalPrices` en la firma de `bucket.ts`, `bucket-stats.ts`, `weights.ts`, `costs.ts` y `networth.ts`; `priceDates` desde `series.ts` (144). **Lectores de `unit_value_eur`**: `positionValueOf` (`prices.ts`), `bucket.ts:317`, `simulate-transfer.ts:145`, `informative/valuation.ts:108`. Las dos interfaces **no** leen `unit_value_eur` directamente (la consola lee `fx_rate` en `portfolio.ts:31` y `:135`, que también pasa a opcional). El ensayo de Q7 lo confirma: el compilador marca exactamente esos sitios.
- `informative/` alcanza `prices.ts` solo por `valuation.ts` (`attention.ts` → `m720.ts` → `valuation.ts`; `m721.ts` → `m720.ts`). Cuadra.
- `apps/web/src/ecb/history.ts:60-64`: `parseLocalConfig` se llama **fuera** del `try` de `fromFolder`; su excepción sube a `loadWebHistory().catch` y sale `problem: "storage"`. El defecto existe tal como lo describe el encargo.
- `atlas backup` copia solo los bytes del libro; la exportación, solo el libro. `cache/` hoy no entra en ninguno.
- Paquete web sobre `6a8ac2d`: **arranque 73,7 / 73,8 KB (75.418 bytes de 75.571)**, **total 262,1 / 263,0**. Cuadra con §5 del encargo.

---

## 5. Documentos (para que los traslade la dirección al cerrar)

Además de la lista de §5 del encargo, lo verificado aquí: ADR-0031 (§1 entero; el contraste de divisa de Q2; el día del cupo de Q3; la tabla de §1.6 con sus huecos; Q5), `docs/data-schema.md` §1 (formatos de `plan.md` §4) y `docs/specification.md` §7 (Alpha Vantage gratuito solo ve 100 días).

---

## 6. Respuestas de la dirección (2026-09-24)

Visto bueno al plan, con estas decisiones. Lo que cambian en `spec.md` y `plan.md` ya está aplicado.

- **D-Q5 — CoinGecko sale de la feature 013.** *Motivo de la dirección:* sus condiciones describen el plan Demo como un plan «para probar», y el de uso personal es de pago; una fuente permanente sobre él se apoya en una zona gris de sus condiciones, y el proyecto no hace eso. **Los precios de cripto serán de EODHD si su plan gratuito los cubre** (cuarta comprobación con la clave del usuario, §1.8), **y si no, entrada manual.** **Quedan retiradas por la dirección** estas piezas del encargo que lo exigían: el adaptador de CoinGecko (bloque 3), la regla «solo el último valor» por fuente (§6.2 P4, bloque 2), el fichero propio en `cache/` y su exclusión de copias y exportación (§6.3 (b), §6.4 (g)), la caducidad de 24 horas (§6.3 (c), §6.4 (h) en lo que toca a CoinGecko), la atribución con su enlace y sus excepciones en `ALLOWED_URLS` y en «names no remote origin» (§6.2 P9, §6.4 (c) en esa parte, bloque 5), la clave en cabecera (§6.4 (e) en esa parte), la dirección `api.coingecko.com` del test de direcciones, y los mutantes 11 y 12 ter en lo que tocan a CoinGecko. ADR-0031 no se toca: la enmienda la escribe la dirección al cerrar.
- **D-Q6 — Sin OpenFIGI.** *Motivo:* una traducción de códigos de bolsa sin documentar no es base para decidir qué precio es de qué activo. **La correspondencia ISIN → símbolo la declara el usuario** en `prices/symbols.json`, con su divisa, y la aplicación **la confirma con la fuente** al darla de alta. Retirados: el proponedor, sus *fixtures* (`tests/fixtures/openfigi/`), la pregunta en `atlas asset add` y la dirección de OpenFIGI del test de direcciones; el mutante 16 queda en «meter la correspondencia en `asset_updated`».
- **D-Q1 — Números JSON por su texto exacto** (`JSON.parse` con `context.source`). **Si esa función no existe en el entorno, se para con un error claro**; nunca se lee como coma flotante. Test que lo fija.
- **D-Q2 — El contraste de divisa, al confirmar la correspondencia**, no en cada descarga. Si los metadatos de la fuente contradicen la divisa declarada, **ni se rechaza ni se acepta en silencio**: se enseña el desacuerdo y el usuario **confirma una vez y de forma explícita** la divisa declarada, y queda guardado que la confirmó. Nunca se supone.
- **D-Q3 — Cupo de Alpha Vantage en ventana móvil de 24 horas**; EODHD por día GMT.
- **D-Q4 — Fallos de Alpha Vantage por el cuerpo; el 403 de EODHD, `not_found` de ese símbolo**, no `blocked` de la fuente.
- **D-Q7 — Arranque:** se autoriza subir el techo **exactamente lo que midan** los cambios del dominio de la puerta (P2, `unit_value_eur` opcional, `networth.ts`), **con un tope de +0,3 KB**, en su propio commit, con desglose y tendencia. Si pasa del tope, se para. Nada de descarga de precios en el arranque.
- **D-Q8 — La hoja leída en un solo sitio** (la puerta importa la hoja). La cabecera de la hoja dice que **cualquier cambio en ella cambia el 720** y que por eso lleva el test de salida fiscal idéntica y los mutantes del 720.
- **D-Q10 — El desempate lo resuelve la consola al escribir**: **un solo cierre por activo y fecha**, con su fuente. La web no necesita el orden de las fuentes y no lee `prices/config.json`. *Cómo lo aplico* (lectura mía, dicha para que la dirección la vea): el fichero sigue siendo de solo añadir, así que el cierre vigente de una fecha es **la última línea de esa fecha**; la consola añade una línea para una fecha solo si no hay ninguna, si es de la **misma** fuente con un valor numéricamente distinto (corrección), o si es de una fuente **anterior** en el orden que la de la línea vigente (la principal sustituye al respaldo). Un respaldo nunca sustituye a la principal. El lector toma la última línea de cada fecha y no conoce el orden.
- **Las cuatro propuestas del plan, aceptadas** salvo la de CoinGecko (retirada por D-Q5): liquidativo real = `valuation` o cierre de `EUFUND`; `currency_mismatch`, que no cuenta como fallo seguido; `secrets_too_open`, con el `chmod 600`, y todo lo demás sigue.
- **Q9** anotada como errata.
- **Las comprobaciones con la clave**: se añade la cuarta, si el plan gratuito de EODHD cubre cripto (§1.8). El procedimiento queda listo para que la dirección lo pase al terminar; no bloquean la construcción.

### 7.2 La puerta: P2 y `unit_value_eur` opcional (2026-09-24)

**Quién llama a la puerta y qué ve distinto** (enumerado a mano; el compilador no lo dice, porque la firma no cambia):

| Quien llama | Qué ve distinto con P2 y `unit_value_eur` opcional |
|---|---|
| `bucket.ts` `bucketPositions` (`priceAt`) | Una cotización más reciente que la valoración gana; una cotización sin tipo cuenta como sin precio en euros (`missing`, `partial`) y se dice con `price_without_eur_value` |
| `bucket.ts` comparación con el índice (`priceAt`, línea 317) | Sin valor en euros en el final o en una compra, hueco `no_price` con `fx_missing`; el aviso `missing_benchmark_price` dice por qué |
| `bucket.ts` `thesisView` (`priceAt`) | P2; sin valor en euros, `positionValueOf` no da valor (como sin precio) |
| `weights.ts` `coreWeights` (`manualPrices`) | P2; sin valor en euros, el activo entra en `missing_prices`, el total es parcial (no se calculan pesos, como hoy) y se dice con `price_without_eur_value` |
| `costs.ts` `costSummary` (`manualPrices`) | P2; sin valor en euros, `partial` (antes solo sin precio) |
| `networth.ts` (vía `coreWeights` y `bucketPositions`) | Hereda las dos: el total parcial ya lista los activos sin precio en euros. **No cambia de código** |
| `bucket-stats.ts` (reenvía `external`) | Hereda `bucketPositions` |
| `simulate-transfer.ts` (`manualPrices` sin fuente) | Nada: solo precios manuales, y una `valuation` siempre lleva tipo (el `as Money` lo dice con su invariante) |
| `informative/valuation.ts` (720) | **Nada**: ya no llama a la puerta, lee la hoja (bloque 1) |
| `series.ts` (`priceDates`) | Nada: las fechas automáticas llegan aparte (bloque 5) |
| Consola `portfolio.ts` (`fx_rate`) | Sin tipo, «sin tipo del BCE»; el resto de la presentación, en el bloque 4 |

**Arranque**: +258 bytes (dominio +249, entrada +9), techo subido exactamente eso en su propio commit (`7a13a1f`, D-Q7). Un intento de ahorro: el mensaje inglés del aviso se acortó (−5 bytes).

### 7.3 Bloque 2 — el núcleo puro (2026-09-24)

- `packages/domain/src/quotes/` detrás de `@atlas/domain/quotes`: `line.ts` (la línea, su lectura estricta, el cierre en vigor de cada fecha y qué se añade según D-Q10), `config.ts`, `symbols.ts` (declarar y contrastar la divisa, D-Q2), `status.ts` (estado, cupo por día GMT o ventana de 24 h, fallos seguidos), `priority.ts`, `cascade.ts` (el caso de uso), `external.ts` (el `ExternalPrices` con el BCE y la aproximación P3), `declare.ts` (comprobar y registrar símbolos en dos pasos), `view.ts` (estado para la consola y el aviso de pesos sobre una aproximación).
- **Decisiones de implementación que conviene ver** (ninguna fiscal ni estructural):
  - **Solo cuentan como fallo seguido** `unavailable`, `rate_limited`, `blocked` e `invalid_response`: un `not_found` habla de un símbolo y un `budget_exhausted` de nuestro cupo, no de la fuente.
  - **El cupo se reserva llamada a llamada** bajo el cerrojo (una transacción por reserva), no en bloque al principio: así nunca queda una reserva sin usar que devolver, y dos consolas a la vez se reparten el cupo sin pasarse (test con dos ejecuciones entrelazadas y un cupo de 3: 3 llamadas en total).
  - **El 402 de EODHD** («API Rate Limit Exceeded», su cupo agotado) se traducirá a `rate_limited` (bloque 3): `budget_exhausted` es **nuestro** cupo, el que se agota antes de llamar.
  - **Un `[]` no es un fallo** (§2.6): la fuente respondió y no hay nada nuevo; el activo sale `unchanged`.
  - **Una aproximación siempre es la más reciente** cuando existe (se fecha en un cierre del ETF posterior a su ancla, y el ancla ya es lo más reciente entre el cierre propio y la valoración), así que no hay rama que compare las dos: se dice en el código.
- **Mutantes del bloque 2**, vistos morir (`mut-013/block2-013.log`): 4a, 4b, 5a, 5b, 6, 7a-7e (sin respaldo, reintentar `blocked`, reintentar `rate_limited`, plegar dos tipos, el respaldo sustituye a la principal, promediar), 8a-8c (llamar sin cupo, reservar fuera del cerrojo, invertir la prioridad), 9a-9e (cadena, huella de la línea, gana la más antigua, decidir fuera del cerrojo, reescribir lo que había), 10 (llamar con el cerrojo tomado), 12a-12d (aproximar sin ancla, el cierre más cercano del ETF, sin marca, la aportación que calla), 12 bis a-d (suponer la divisa del activo, guardar con divisa distinta, no registrar el desacuerdo, descargar sobre un desacuerdo de metadatos). **Cuatro sobrevivieron a la primera** y se mataron con tests nuevos: 9b (la sustitución no se aplicaba: Biome había partido la línea; el guion lo dijo como `ERROR`, no como superviviente), 9d (el test escribía «la otra consola» antes de la descarga del mismo activo, así que decidir fuera del cerrojo también lo veía: ahora escribe durante la descarga de **otro** activo), 9e (nada comprobaba que los bytes anteriores siguen iguales) y 12 bis a (la divisa declarada coincidía con la del activo en todos los casos).

### 7.4 Bloque 3 — los adaptadores (2026-09-24)

- `packages/adapters/src/prices/`: `eodhd.ts`, `alpha-vantage.ts`, `exact-json.ts` (D-Q1: cada número JSON como `JsonNumber` con su texto; sin `context.source`, `ExactJsonUnsupported`, nunca un *float*), `fetch.ts` (el error de `fetch` se tira **sin leerlo**), `shape.ts`, `file-store.ts` (`FilePriceStore`: todo bajo `withFolderLock`, temporal `"wx"`, `sync`, `assertOwned`, renombrado; añadir = bytes de antes intactos + líneas nuevas; espera breve y acotada al cerrojo en vez de fallar a la primera, porque dos consolas que reservan a la vez tienen que hacer cola) y `secrets.ts`. Todo en el barril de Node; **ninguna subruta nueva** para la web.
- *Fixtures* sintéticas deterministas: `tests/fixtures/eodhd/make-synthetic.mjs` y `tests/fixtures/alpha-vantage/make-synthetic.mjs` (formato real de §1, símbolos inventados, cifras redondas); ejecutadas dos veces, mismos bytes (md5).
- El test de direcciones pasa a mirar los *hosts* de las cuatro fuentes de ADR-0031 (también CoinGecko y OpenFIGI, que salieron: ninguna debe llegar a la web) y deriva los ficheros alcanzables por la web de `exports`, excluido `"."`, siguiendo sus importaciones. Uno nuevo: la web no alcanza nada que nombre `secrets.json` ni su lector.
- **Mutantes del bloque 3** (`mut-013/block3-013.log`): 13a-13e, 13 bis a-b, 10a-10b, 14a-14c, los plegados de tipos en los dos adaptadores, D-Q1 (leer por *float*) y D-Q4 (403 como `blocked`). **Uno sobrevivió**, y es una lección: **13a** (el mensaje de un `secrets.json` mal escrito con el `SyntaxError`). El `SyntaxError` de Node **cita un trozo cortado** del texto (`..."{"eodhd": TEST-KEY-0"...`), y el test buscaba la clave **entera**: una fuga parcial pasaba. Ahora el mensaje de un error de secretos tiene que ser **exactamente** código, ruta y, como mucho, el nombre de la clave. Lo mismo se aplica en la consola (bloque 4): la centinela se busca también por su prefijo.

### 7.5 Bloque 4 — la consola (2026-09-25)

- **Órdenes**: `atlas prices update` (código de salida **7** si una fuente llega al umbral de fallos seguidos), `atlas prices status`, `atlas prices symbols [<activo>]`, `atlas prices symbols set <activo> --currency C [--eodhd S] [--alpha-vantage S] [--accept-currency]` (confirma con la fuente; con desacuerdo lo enseña y pide el sí explícito, D-Q2) y `atlas prices symbols remove <activo>`. Sin claves: no llama a nadie, lo dice y sale con 0. `secrets.json` demasiado abierto: no usa las claves, dice el `chmod 600`, sale con 1, y el resto de órdenes sigue igual. Carpeta de claves dentro de la del libro, o al revés: se niega.
- **Las vistas** (`weights`, `contribute`, `costs`, `networth`, `bucket`, `thesis list|show`) leen `prices/` y el histórico del BCE de la carpeta y pasan las cotizaciones por la puerta: columna **origen** (manual, EODHD, Alpha Vantage, con «≈ aprox.»), antigüedad con ⚠, «sin tipo BCE» y la nota de que falta el valor en euros, y la calculadora de la aportación dice cuándo un peso se apoya en una aproximación. `--json` lleva el precio entero (`origin`, `source`, `approximate`, `fx_missing`…). Un fichero de precios que no se lee se dice en la salida de errores y ese activo se queda sin precio automático.
- **`contributionPlan` gana `external?`** (un campo opcional en su entrada, en el arranque): sin él la calculadora no podía usar ninguna cotización automática.
- **Nombre de fichero seguro**: el libro acepta cualquier texto como `asset_id`, así que `prices/<asset_id>.jsonl` codifica lo que no podría nombrar un fichero (`priceFileName`, en el dominio, para que la consola y la web usen la misma regla); un id normal es él mismo.
- **La salida fiscal no se mueve** (`apps/cli/test/prices/views.test.ts`). **La predicción, escrita antes de correrlo: no se mueve ninguna.** Se cumplió. Dos casos: un activo en el extranjero valorado a mano el 28 de diciembre con cierres automáticos del 29, 30 y 31 mucho más altos —y el test comprueba que **sí** ganan en `weights` del 31, mientras `m720 --json` sigue con el 400 manual—; y el libro sintético de los ficheros dorados, con cierres el mismo día de cada valoración (pierden) y el día siguiente (ganarían en una vista), comparando `tax`, `tax --lots`, `tax --boxes`, `tax --json`, `gains`, `income`, `m720`, `m720 --json`, `m721` y `m721 --json` de 2026, 2027 y 2028, **byte a byte**, con y sin `prices/`.
- **La centinela**, con los adaptadores **reales** y un `fetch` que falla citando la URL (excepción y 401 con la URL en el cuerpo): ninguna salida, ningún fichero de la carpeta ni el estado contienen la clave **ni su prefijo** (la lección del bloque 3).
- **Mutantes del bloque 4** (`mut-013/block4-013.log`; el guion se rehízo tras perderse el *scratchpad* con la caída de la sesión): 19/3c (el 720 alimentado con los cierres de `prices/`: rojo en los dos tests de salida fiscal), 13f (la clave en la salida), 13g (usar un `secrets.json` abierto), 17 (una vista que exige `prices/`: 31 tests rojos), 12d (la calculadora calla la aproximación), 18 (la consola oculta la antigüedad), la marca de aproximación y la nota de «falta el valor en euros». Todos muertos a la primera.
- **Incidencias**: la sesión se cayó con este bloque sin comitear; al retomarla se pasó typecheck y la suite entera antes de comitear nada. Dos tests de la web cayeron por **tiempo** (5 s) con la máquina a carga 16 y pasan solos y en la suite siguiente: no son de esta feature. El test del libro sintético tarda (60 órdenes sobre dos carpetas) y lleva su propio límite de 120 s.

### 7.6 Bloque 5 — la web, que solo lee (2026-09-25)

- **`@atlas/adapters/prices`** (subruta nueva, `ledger-store/browser/prices.ts`): lee `prices/<asset_id>.jsonl` de la carpeta enlazada con `readFolderText` (solo lectura) y guarda la importación a mano en IndexedDB bajo la clave `prices:imported` del almacén existente, **sin subir `DB_VERSION`**. El test de direcciones la mira por construcción (se deriva de `exports`).
- **`apps/web/src/prices/`**: `quotes.ts` (carpeta, si no importado, si no nada; convierte con el histórico del BCE que ya lee la web; la importación lee **cada** fichero con el lector del dominio antes de guardar nada: uno que no se lee rechaza la importación entera) y `use-quotes.tsx` (el recurso de cada pantalla y el aviso `QuotesNotice` para una carpeta sin permiso, un navegador que no guarda datos o ficheros que no se leen). Cartera, Cubo y Resumen pasan las cotizaciones a la puerta; la calculadora de la aportación dice cuándo un peso se apoya en una aproximación. Mientras se leen, y sin ninguna, todo funciona con los precios manuales.
- **Lo que enseña un precio** (`components/Price.tsx`, `view-models/price-info.ts`): su origen (manual, EODHD, Alpha Vantage), la marca de aproximación (≈, siempre), y la de «sin valor en euros» con el motivo. Todo pasa por `Amount` y respeta la privacidad.
- **Ajustes, «Precios automáticos»**: de dónde vienen, cuántos activos, hasta qué día; importar a mano (`.jsonl` de `prices/`); **en el móvil: «En el teléfono no hay precios automáticos hasta que exista la sincronización con la nube»**, sin «próximamente»; y que la consola descarga los activos **de su libro** (P5).
- **El defecto de la 012 arreglado** (§6.4 (d)): un `atlas.config.json` mal escrito da `problem: "config"` con la clave que no se entiende, no «storage». Rojo antes (la excepción subía al `catch` de `loadWebHistory`), verde después, y mutante muerto.
- **Arranque** *(cifra corregida en la revisión de la PR #78, §10: en la cabeza de la rama revisada eran **+303**, no +294; la de abajo era la de este bloque antes de las capturas)*: 75.712 bytes, dentro del techo de 75.829. Frente a `develop` (75.418), **+294** en toda la feature: los +258 de la puerta (bloque 2 de la puerta, medido y autorizado) más **+36** del campo `external?` de `contributionPlan` (bloque 4), que cabe en el techo ya subido y dentro del tope de +0,3 KB (307 bytes) de D-Q7. **Total**: 267,19 KB (273.607 bytes), techo **267,5** en su propio commit (`0ec32be`), con el desglose trozo a trozo contra `develop` en el comentario de `check-bundle.mjs` (el trozo `quotes` +2,1; `ajustes` +0,9; mensajes +0,5; `chart` +0,5; dominio +0,3; pantallas +0,5).
- **Las series** (la gráfica de la evolución del patrimonio) **siguen con las fechas de las valoraciones**: `netWorthSeries` proyecta desde los eventos y no recibe fuente externa. §6.4 (h) permite usar fechas automáticas, no lo exige; la función `quoteDates` está en `@atlas/domain/quotes` para cuando se haga. **Pendiente, dicho**.
- **Mutantes del bloque 5** (`mut-013/block5-013.log`): 20 (un módulo de precios en el marco: el *build* se para, y lo dice `LAZY_ONLY`: «es de arranque y trae los precios automáticos»), 12 quater (el `atlas.config.json` otra vez como «storage»), la marca de aproximación, la de «sin valor en euros», el origen, el teléfono que no dice nada, las pantallas que no pasan las cotizaciones, 15 (la web que escribe en la carpeta: el test existente, sin tocarlo) y una importación a medias. Todos muertos a la primera.

### 7.7 Verificación en el navegador (2026-09-25)

- **Cómo**: el Chromium de Playwright (`chromium_headless_shell-1234`) desde el *scratchpad* contra `vite preview` del paquete construido; el libro sembrado desde el *scratchpad* con activos **inventados** (`013-shots/seed.mjs`: un fondo con ETF de referencia, un ETF, un ETC en dólares, una acción del cubo con su tesis) y los precios escritos como los escribe la consola, cargados en el navegador como los guarda la web (el libro y la importación a mano en IndexedDB). **16 capturas** y `medidas.json` en `~/atlas-private/capturas/2026-09-25-precios/`: Cartera, Cubo, Resumen y Ajustes a **400×890 con DPR 3**, a **2045×1141** y a **360** de ancho; Cartera en oscuro, con la privacidad puesta, y sin precios; Ajustes con el libro vacío.
- **Medido en el navegador**: `scrollWidth === clientWidth` en las 16; ningún error de consola; **ninguna petición a otro origen**.
- **Lo que encontró mirar la pantalla, y ningún test** (la lección de siempre, otra vez):
  1. **La tarjeta de Ajustes decía «Sin precios automáticos» teniéndolos**: se pintaba antes de abrir el libro y leía los precios de un catálogo vacío. Ahora el recurso depende del libro abierto. El test que se añadió comprueba el caso bueno; **no reproduce el orden de la carrera** (los tests abren el libro antes de pintar), y se dice.
  2. **La tarjeta de pesos decía «Falta el precio de Oro X»** de un activo que tenía cotización sin valor en euros, y **no enseñaba** ni ese motivo ni el aviso de la aproximación (la tarjeta no pinta la lista de avisos). Ahora los dos avisos salen en la tarjeta y el «falta el precio» solo nombra lo que de verdad no tiene precio.
  3. **En pantalla ancha no se decía de dónde venía un precio**: la tabla solo tenía la cifra. Nueva columna «Origen» («EODHD · 24/09/2026», «manual · 15/09/2026») en Cartera y Cubo; en el teléfono, el origen va delante en la línea del precio, para que no lo corte la elipsis.
- **Queda sin corregir, dicho**: la tarjeta de la aportación sigue diciendo «Falta el precio a … Oro X. Regístralo con una valoración» cuando el activo tiene una cotización sin tipo del BCE: es el mensaje de `missing_manual_prices` del dominio, que no distingue los dos casos; el remedio que propone (una valoración) sí lo resuelve. Y el patrimonio parcial de Cubo dice «falta Oro X» por lo mismo. Cambiarlo toca el dominio del arranque.
- **Lo que no se pudo capturar**: **la carpeta sin permiso**. El selector de carpetas del navegador no se puede conducir sin pantalla, y un asa de carpeta de mentira no se puede guardar en IndexedDB. Está cubierto por el test de la web (`prices.test.tsx`, «reads prices/ … and says a lost permission») y por el aviso `QuotesNotice`, pero **no está visto en pantalla**.

### 7.8 Los últimos mutantes (2026-09-25)

- **16** (la correspondencia en `asset_updated`): no la cazaba nada —la lista congelada era la de `LedgerState` y `Settings`—; nuevo test que congela los campos de `AssetFields`, y el mutante (`price_symbols?` en el activo) muere. **13 bis c** (el lector de `prices/config.json` acepta una clave desconocida) y **13 bis d** (la configuración de precios en `atlas.config.json`): muertos.
- **Recuento**: 19 del bloque 1, 6 de la puerta, 28 del bloque 2, 17 del bloque 3, 8 del bloque 4, 9 del bloque 5 y estos 3: **90 mutantes, todos muertos**; **cuatro sobrevivieron a la primera** (9d, 9e, 12 bis a y 13a) y uno no llegó a aplicarse (9b, dicho como `ERROR` por el guion) y se mataron con tests nuevos, y los defectos que solo encontró la pantalla están en §7.7. Los de CoinGecko y OpenFIGI (11, parte de 12 ter y 14, 16 en su parte de OpenFIGI) quedan **retirados por la dirección** con esas fuentes.

---

## 8. Bloque 6 — la prueba con las claves del usuario (procedimiento; **pendiente**)

La feature está construida con dobles; **se da por verificada solo con las claves del usuario**. Lo ejecuta él, en su máquina, **en una carpeta de prueba que no es la de su libro**, y anota lo que se pide. **No tiene que pasar ninguna clave a nadie.** CoinGecko y OpenFIGI ya no forman parte (D-Q5, D-Q6).

1. **Crear las dos claves gratuitas**: EODHD Free en `https://eodhd.com/register` y Alpha Vantage en `https://www.alphavantage.co/support/#api-key`.
2. **Guardarlas fuera de la carpeta del libro**, solo legibles por él:
   ```bash
   mkdir -p ~/.config/atlas
   printf '{"eodhd":"%s","alpha_vantage":"%s"}\n' 'SU_CLAVE_EODHD' 'SU_CLAVE_AV' > ~/.config/atlas/secrets.json
   chmod 600 ~/.config/atlas/secrets.json
   ```
3. **Las comprobaciones del bloque 0 que faltan** (§1.8), con la clave de EODHD: índices, cuántos de sus ISIN cubre `EUFUND` (**solo el recuento**), la unidad de los cierres de Londres y si el plan gratuito cubre cripto (`BTC-EUR.CC`). Anotar los códigos HTTP y los dos valores de Londres.
4. **Un libro de prueba** con activos que tienen posición hoy, y a cada uno un **valor público** (los del libro sintético son inventados; aquí solo se les da un símbolo real para que haya algo que descargar):
   ```bash
   T=~/atlas-prueba-013 && mkdir -p $T
   atlas synth --out $T/ledger.jsonl
   A="atlas --ledger $T/ledger.jsonl"
   $A prices symbols set ast_world --currency EUR --eodhd IWDA.AS                      # un ETF europeo
   $A prices symbols set ast_gold  --currency USD --eodhd AAPL.US --alpha-vantage AAPL # una acción de EE. UU.
   $A prices symbols set ast_btc   --currency EUR --eodhd BTC-EUR.CC                   # cripto por EODHD (D-Q5)
   $A prices symbols set ast_mm    --currency EUR --eodhd <ISIN_PÚBLICO>.EUFUND        # solo si el punto 3 dijo que EUFUND está en el plan gratuito
   $A prices symbols set ast_delta --eodhd CSPX.LSE --eodhd-currency GBP --alpha-vantage CSPX.LON --alpha-vantage-currency GBX  # Londres: la divisa de cada fuente (§12); anotar si alguna pide confirmación
   $A fx update     # el histórico del BCE, para que las cotizaciones en dólares tengan valor en euros
   ```
   Cada `set` gasta **una llamada del cupo por fuente** (confirma la divisa con los metadatos de la fuente). Si la fuente dice otra divisa, la consola lo enseña y pide confirmarla (o `--accept-currency`): anotar qué dijo.
5. **Descargar dos veces seguidas y ver el estado**, copiando la salida **sin claves**:
   ```bash
   $A prices update; echo "salida $?"
   $A prices update; echo "salida $?"
   $A prices status
   $A weights; $A bucket; $A networth
   ```
6. **Forzar un fallo**: cambiar a propósito una letra de la clave de EODHD en `secrets.json`, poner `{"failure_threshold":1}` en `$T/prices/config.json` y repetir `prices update`: tiene que decir que EODHD ha rechazado la clave y salir con **7**. Devolver la clave buena.
7. **La web de escritorio con otro perfil del navegador** (o `chromium --user-data-dir=/tmp/atlas-prueba-013`), **nunca el perfil del libro real**: importar el libro de prueba, enlazar la carpeta `$T` en Ajustes → «Tipos del BCE» → «Leer de la carpeta de la consola», y mirar Cartera, Cubo y Ajustes → «Precios automáticos». `~/.config/atlas/` **no está** dentro de `$T`, así que la web no puede leer las claves.
8. **Buscar la clave en lo escrito**: `grep -rF "$(jq -r .eodhd ~/.config/atlas/secrets.json | cut -c1-8)" $T && echo FUGA || echo limpio` (y lo mismo con la de Alpha Vantage).

**Cuenta como «sí»**: cada fuente responde para su activo; la segunda ejecución **no gasta cupo** en lo que ya está al día (lo que llega a gastar es un festivo o un símbolo sin cierres nuevos, que no se puede saber sin preguntar); ninguna salida ni fichero contiene una clave; y la web enseña lo que la consola descargó. **Un «sí» que no venga de las claves reales no vale.** Resultado: *pendiente*.

---

## 9. Documentos que la dirección tendrá que actualizar al cerrar

- **ADR-0031**: lo verificado en §1, con sus fuentes; **la retirada de CoinGecko y de OpenFIGI** (D-Q5, D-Q6) y lo que decía de ellos (atribución, caché de 24 h, `cache/`, clave en cabecera, proponedor); el contraste de divisa al declarar y la confirmación explícita (D-Q2); el día del cupo (D-Q3); la clasificación de fallos (D-Q4, el 403 como `not_found`); el cierre vigente único por activo y fecha (D-Q10); `currency_mismatch` fuera de los seis tipos del puerto y fuera de los fallos seguidos; qué cuenta como fallo seguido; el nombre de fichero codificado (`priceFileName`); `prices/config.json` y `~/.config/atlas/secrets.json`.
- **`docs/data-schema.md` §1**: las filas de `prices/<asset_id>.jsonl` (campos y regla de la última línea), `prices/symbols.json` (formato de `plan.md` §4 con `currency_check` y `currency_confirmed_over`), `prices/_status.json` (`calls_at`, sin direcciones), `prices/config.json`, el fichero de secretos fuera de la carpeta; **quitar** «de cripto (CoinGecko) solo el último valor» de la fila de `prices/`.
- **ADR-0032 y ADR-0026**: ya **no** hace falta excluir `cache/` (no existe tras D-Q5); sí conviene decir que `prices/` no guarda nada que no pueda viajar (no hay claves en la carpeta).
- **`docs/specification.md` §7** (la tabla y §7.2: CoinGecko fuera, «la entrada manual gana siempre» → P2; Alpha Vantage gratuito solo ve 100 días) y **§11.8** («con ellas van el orden de las fuentes y su presupuesto» deja de ser cierto con P1; CoinGecko fuera).
- **`docs/prompts/README.md`** al cerrar, y en el prompt 013 §7, la errata de Q9.
- **El comentario de `bucket-stats`/series**: las series del patrimonio siguen sin fechas automáticas (§7.6); si la dirección lo quiere, es trabajo aparte.

---

## 10. Revisión adversarial de la PR #78 (2026-09-25)

Sin bloqueantes: con cierres de 98.765 € posteriores a todas las valoraciones, las 60 salidas fiscales salen idénticas; ninguna fuga de clave en 24 ejecuciones con seis formas de fallo; el cupo aguanta con tres consolas a la vez. Dos defectos de funcionamiento y varios arreglos baratos, **decididos por la dirección** y aplicados así:

1. **Una cotización sin tipo del BCE tapaba una valoración con valor en euros y bloqueaba la aportación** (en Londres en peniques, para siempre).
   - **Todo cálculo en euros usa el precio más reciente que tenga valor en euros.** La puerta (`choose` en `prices.ts`) elige por P2 **entre los precios con valor en euros**. Una cotización más nueva sin él viaja como `newer_quote`, y las dos interfaces la enseñan al lado, como información y con su motivo.
   - En los cierres automáticos, `externalPricesOf` vuelve atrás hasta el último cierre que convierte y lleva el más nuevo como `newer`. Deja de mirar atrás cuando ningún cierre de esa divisa puede convertir: sin histórico, o con una divisa que el BCE no publica.
   - **GBX = GBP / 100**, con la tabla explícita `SUBUNITS` (solo GBX) en `quotes/external.ts`. `fx_rate` es el tipo de la libra por cien (peniques por euro), y una subunidad que no está en la tabla sigue sin tipo.
   - El mensaje de `missing_manual_prices` dice ahora **precio en euros**, en el dominio y en las dos interfaces, con los dos remedios.
2. **Nunca se guarda el valor del día en curso.** La cascada pide y guarda hasta **ayer** (`to = today − 1`). Lo prueba el caso del revisor: el miércoles por la tarde llega un «cierre» del miércoles, y no se guarda.
3. **D-Q1**:
   - El puerto gana `ready?()`, que la cascada y la declaración llaman **antes de reservar nada**.
   - `EodhdPriceSource.ready()` lanza `ExactJsonUnsupported` donde `JSON.parse` no da `context`. La consola para con su mensaje, sin gastar cupo y sin escribir `_status.json`.
   - Tests con un `JSON.parse` sin `context` en el adaptador, en el dominio y en la consola.
4. **Un `atlas.config.json` mal escrito ya no tumba las vistas de la consola.** Se dice con la clave que no se entiende, y la vista sigue con los precios manuales.
5. **La congelación de claves**:
   - `interfaceKeys` lee también las claves entre comillas.
   - El contraste con `Object.keys(createEmptyState())` va en un test del dominio (`test/projections/state-keys.test.ts`), no en el de arquitectura. Importar el dominio desde el de arquitectura hizo que `tsc -b` compilara **gemelos `.js` junto a 18 fuentes del dominio**. Esos gemelos, ignorados por git, los usaron luego Vite y vitest en lugar de los `.ts`.
   - Lo cazó el guion de mutación, que se niega a correr con gemelos. Se borraron y se volvió a medir todo: mismas cifras, porque los gemelos eran de fuentes que no habían cambiado desde entonces. Queda dicho aquí.
6. **Una correspondencia sin contrastar se contrasta antes de su primera descarga.**
   - Sin `currency_check` de esa fuente, `updatePrices` reserva una llamada, pregunta la divisa a la fuente, lo anota en `symbols.json` bajo el cerrojo y solo si coincide descarga.
   - Si la declaración cambió entre medias, no se toca.
   - Si no se pudo contrastar (sin cupo, fallo de la fuente), no se descarga nada.
   - `atlas prices symbols` dice «sin contrastar».
7. **El aviso de aproximación lo emite `contributionPlan`**, como nota con código `weights_use_approximation`. Se quitaron los añadidos de la consola y de la web; la web lo pinta en la tarjeta de la aportación. En los pesos, cada fila lleva su marca ≈, que decide el dominio.
8. **La cifra del arranque**:
   - Era +303, no +294. El comentario de `check-bundle.mjs` y §7.6 están corregidos.
   - Tras los arreglos: **75.690 bytes, +272**. Para mantenerse en esa cifra hubo que hacer dos cosas:
     - las pantallas cargan el módulo de cotizaciones bajo demanda, para que la entrada no lo precargue (−33 bytes);
     - borrar los precios importados no usa `idbDelete`, que nadie del arranque importaba (−35 bytes).
   - **El techo del arranque es ahora `develop` + 307** (75.725): pasarse del tope de D-Q7 para el *build*. Ya no depende de un comentario.
   - Total: 267,79 KB, techo 268,1 en su propio commit.
9. **R17, R18 y R19** muertos con tests nuevos: una divisa que el BCE dejó de publicar no convierte; el filtro de fechas de la cascada; un éxito limpia el último fallo del activo.
10. **Menores**:
    - `--json` de `weights` y `bucket`: el precio de cada fila pasa a ser el objeto `price`. Se dice en la PR y en el README.
    - `secrets_unknown_key` ya no dice el nombre de la clave, sino su **posición**: si el usuario invierte nombre y valor, la clave no sale en pantalla. Hay un test con el caso invertido.
    - Alpha Vantage deja **un segundo** entre llamadas.
    - En la web se pueden **borrar** los precios importados a mano, y una importación con `symbols.json`, `_status.json` o `config.json` los deja aparte con una nota.

**Rojo primero** (`mut-013/review-013.log`): cada arreglo tiene su mutante que devuelve el código a su forma anterior, y **los 21 mueren**. Van F1a a F1e, F2, F3a y F3b, F4, F5a y F5b, F6a y F6b, F7, R17, R18, R19, el ritmo de Alpha Vantage, el nombre de la clave desconocida, los ficheros acompañantes y el borrado.

**Lo que queda dicho y no se cambia**: el patrimonio parcial de Cubo y el aviso de la aportación, cuando un activo **solo** tiene cotización sin tipo, siguen diciendo que falta su precio en euros. Es cierto, y el remedio que proponen lo resuelve.

## 11. Segunda pasada de la revisión de la PR #78 (2026-09-25)

Sin bloqueantes; los puntos 1 a 7 de §10 cerrados, y mueren los nueve mutantes del revisor sobre los arreglos. Cuatro detalles, cada uno con su test **visto en rojo** sobre el código anterior (los cinco tests nuevos fallaron juntos antes de tocar nada) y su mutante (`mut-013/second-013.log`, cinco de cinco muertos):

1. **Una firma de índice esquivaba la congelación de claves** (`[quote: \`price_${string}\`]: string | undefined`), porque `interfaceKeys` no leía lo que va entre corchetes. Ahora cualquier firma de índice de la interfaz, con `readonly` o sin él, se lee como una clave `[index signature]` que ninguna lista congelada contiene. Un fichero de texto de prueba (`tests/fixtures/architecture-013/index-signature.ts.txt`) fija las dos formas. Mutantes: una firma de índice en `Settings` y otra en `LedgerState`, las dos rojas.
2. **`newer_quote` se calculaba contra la cotización de la vuelta atrás.** Ahora se calcula contra la más nueva que existe (`quote.newer ?? quote`). Lo prueba el caso del revisor: valoración el 2027-01-04, cierre convertible el 2026-12-31 y cierre sin tipo el 2027-01-06. Sale la manual, con la del 06 al lado.
3. **La vuelta atrás ya no se corta** en el primer `currency_not_published` ni en `no_history`. Sigue hasta un cierre que convierta, también de otra divisa (por ejemplo un euro anterior a unos cierres en ILA).
4. **Una divisa de la fuente que no son tres mayúsculas** (`GBp`) se dice tal como viene (`saidCurrency` de los adaptadores), y es un **desacuerdo que el usuario confirma**. Solo «nada», el texto vacío y `Unknown` cuentan como que la fuente no dice la divisa. `symbols.json` acepta lo dicho por la fuente (hasta 16 caracteres) en `currency_check` y en `currency_confirmed_over`. La divisa **declarada** sigue siendo un código de tres mayúsculas.

**Arranque**: 75.694 bytes, **+276** frente a `develop`, dentro del techo de `develop` + 307. **Total**: 267,7 KB.

## 12. Arreglo tras la verificación del procedimiento: la divisa por fuente (2026-09-25)

**El defecto** (reproducido por la dirección con `TSCO.LSE`/`TSCO.LON`): `prices/symbols.json` llevaba una sola `currency` por activo para las dos fuentes. En Londres, EODHD dice GBP y Alpha Vantage GBX, así que siempre una de las dos pedía confirmación, y repetir el procedimiento gastaba cupo en cada intento. Y si se confirmaba GBP, los cierres de Alpha Vantage, que llegan en peniques, se guardaban como libras: cien veces más altos cada vez que respondía la fuente de respaldo.

**Decisión de la dirección: la divisa se declara por fuente.** Cómo queda (rama `fix/013-currency-per-source`):

- **`symbols.json` pasa al formato 2**: cada entrada lleva `currencies`, una divisa por cada fuente con símbolo, obligatoria para cada una, y cada fuente se contrasta y se confirma por separado.
  - **El formato 1 de la 013 se sigue leyendo**: su `currency` se entiende como la de todas sus fuentes, y una fuente ya contrastada que la contradiga pide confirmación como siempre.
  - Al volver a escribir el fichero se escribe en formato 2, con el mismo significado.
  - **Una consola de la 013 rechaza el formato 2** (`invalid_symbols_file`) en vez de leerlo mal. Es a propósito: con una sola divisa volvería a guardar los peniques como libras.
- **Cada cierre se guarda con la divisa de la fuente que lo trajo** (`entry.currencies[source]`), y el contraste de cada fuente se hace contra su propia divisa.
- **La conversión ya trataba GBX como GBP / 100**: 10 GBP de EODHD y 1.000 GBX de Alpha Vantage dan **el mismo valor en euros** (12,5 € con 0,8 libras por euro), y hay un test que lo fija.
- **La consola**: `atlas prices symbols set <activo> [--eodhd S] [--alpha-vantage S] --currency C [--eodhd-currency C] [--alpha-vantage-currency C] [--accept-currency]`.
  - `--currency` vale para toda fuente que no traiga la suya.
  - Una fuente sin ninguna de las dos es un error de uso que dice cuál falta.
  - `atlas prices symbols` enseña cada símbolo con su divisa: `TSCO.LSE (GBP)`, `TSCO.LON (GBX)`.
  - El README lo recoge.
- **Tests escritos primero y vistos en rojo** (cinco del dominio y tres de la consola, más las dos expectativas de la 013 que cambian de forma):
  - Londres con las dos fuentes de principio a fin: se declara, se contrasta sin preguntar y cada cierre se guarda en su divisa.
  - El mismo valor en euros: este test no fue rojo, porque fija una propiedad que ya existía y que el arreglo no puede romper.
  - Un `symbols.json` de la 013 que se sigue leyendo y con el que se sigue descargando.
  - Una segunda declaración igual que no pide nada (sin bucle).
  - Una fuente sin divisa, rechazada.
- **Mutantes** (`mut-013/fix013.log`), los cuatro muertos:
  - volver a una divisa por activo;
  - guardar el cierre con la divisa declarada del activo en vez de la de su fuente;
  - contrastar una fuente con la divisa de otra;
  - dejar de leer el formato 1.
- **`docs/` sin tocar**: ADR-0031, `docs/data-schema.md` §1 (`symbols.json` en formato 2) y el procedimiento del bloque 6 (§8, que ahora declara Londres con una divisa por fuente) los pone al día el documentador.

## 13. Revisión de la PR #80 (2026-09-25)

Cinco puntos de la dirección. Cada arreglo tiene su test escrito antes y visto en rojo, y un mutante que lo mata (`mut-013/fix013-review.log`: los once, muertos).

1. **Bloqueante: el formato 1 ya no hereda confirmaciones.**
   - Al leer un `symbols.json` de la 013 se descarta `currency_confirmed_over` y, con él, el `currency_check` de cada fuente confirmada frente a una divisa distinta de la declarada. Esa fuente queda sin contrastar y se contrasta con la regla del formato 2 antes de su siguiente descarga.
   - Las fuentes cuyo contraste coincidió con la divisa declarada lo conservan: ahí no hubo nada que confirmar. Si no queda ninguno, desaparece `currency_check`.
   - Tests: las dos direcciones (GBP confirmado frente al GBX de Alpha Vantage, y GBX confirmado frente al GBP de EODHD) y el recontraste, que ya nunca guarda peniques como libras.
2. **Las líneas guardadas en una divisa que no es la que ahora declara su fuente quedan fuera de toda cifra en euros.**
   - `readCloses(files, symbols)` las aparta antes de elegir el cierre en vigor. Dejan un hueco declarado, nunca una cifra cien veces mayor.
   - `prices status` (texto y JSON, `mismatched`) y el aviso de las vistas de la consola y de la web las señalan.
   - `atlas prices purge <activo> --source <fuente> [--yes]` las borra, solo las de ese activo y esa fuente, en una transacción bajo el cerrojo. El siguiente `update` las vuelve a descargar. Pide confirmación; sin terminal y sin `--yes` no hace nada (salida 4). El README lo recoge.
   - Límite: en la web, los precios **importados** a mano no traen `symbols.json`, así que no se pueden filtrar. Solo se filtran los leídos de la carpeta.
3. **La aproximación con una ETF de referencia de Londres normaliza GBP/GBX con `SUBUNITS`** en vez de devolver `etf_currency_changed`. Solo un cambio de divisa real se queda sin aproximación.
4. **La consola no descarta opciones en silencio.** Son errores de uso:
   - `--alpha-vantage-currency` sin `--alpha-vantage`, y lo mismo con EODHD;
   - un `set` sin ningún símbolo.
5. **Mutantes de la revisión:**
   - **M4** muere con un test en el que el usuario cambia la divisa de la fuente mientras se contrasta. El contraste no la pisa.
   - **M8** muere con un test en el que `--currency GBP --alpha-vantage-currency GBX` declara GBX para Alpha Vantage.
   - **M2**: la comprobación de la divisa de cada cierre se mantiene. Se prueba con un adaptador simulado que devuelve divisa por cierre. Mueren dos variantes: comparar con la divisa de otra fuente y quitar la comprobación.
   - **M9, M10 y M11 se dejan vivos, porque son inocuos**:
     - **M9**: una clave de más en `currencies` no tiene símbolo, así que nunca se descarga ni se contrasta con ella.
     - **M10**: sobre la misma forma laxa, ninguna lectura consulta la divisa de una fuente sin símbolo.
     - **M11**: las dos claves a la vez en el formato 1 solo las escribiría una mano ajena. La lectura de la 013 ya se queda con `currency`, y el formato 1 ya no hereda confirmaciones (punto 1).

## 14. Segunda pasada de la revisión de la PR #80 (2026-09-25)

Cuatro puntos de la dirección. Cada uno tiene tests escritos antes y vistos en rojo, y mutantes que los matan (`mut-013/fix013-pass2.log`: catorce, todos muertos; uno, P4d, sobrevivió al principio y lo mata un test añadido).

1. **Bloqueante: con un `symbols.json` de formato 1, las líneas que la 013 guardó mal quedan fuera de toda cifra en euros.**
   - Al leer el formato 1, `currency_confirmed_over[source]` se toma como lo que dijo la fuente. Si difiere de la divisa del activo, esa fuente queda marcada en el campo nuevo `misstored` con la divisa del activo. Sus líneas guardadas en esa divisa son las del defecto: `readCloses` las deja fuera, `prices status` y las vistas las señalan con un aviso propio («se guardó en GBP, pero esa fuente dijo otra divisa…»), y `purge` las borra.
   - **Cómo se implementa.** La divisa declarada de esa fuente sigue siendo la del activo, porque no se supone ninguna. La fuente queda sin contrastar, como en §13, y se contrasta antes de su siguiente descarga.
   - `misstored` es un campo nuevo del formato 2, así que el arreglo no se pierde cuando el fichero se vuelve a escribir. Lo mantienen tanto el contraste como una declaración nueva de esa fuente, y solo `purge` lo quita.
   - Tests en los dos sentidos: GBP sobre GBX (cien veces más) y GBX sobre GBP (cien veces menos). Se comprueban en el dominio y en la consola, con `weights` antes y después de `prices update`.
2. **Un `symbols.json` ilegible, o de un formato más nuevo, ya no tumba las vistas de valoración.**
   - Las vistas se degradan como con `readLocalConfig`: se quedan sin precios automáticos y dicen el motivo.
   - El formato más nuevo tiene código propio, `symbols_file_newer_version`, traducido en la consola y en la web.
   - `update`, `status` y `symbols` siguen negándose, porque escribirían el fichero.
3. **La web.**
   - La importación a mano admite `symbols.json`. Si no se entiende, rechaza la importación entera. La web lo guarda junto a los precios y lo usa para el filtro; si una importación posterior no lo trae, conserva el anterior.
   - **Sin `symbols.json`**, la web avisa de que no puede comprobar la divisa y usa los cierres tal como están.
   - **Con un `symbols.json` ilegible en la carpeta**, la web lo dice y no usa precios automáticos, igual que la consola.
   - Los avisos salen en Cartera, Resumen, Cubo y Ajustes.
   - `_status.json` y `config.json` se siguen dejando aparte, con aviso.
4. **`purge` cumple lo que promete.**
   - Anota por activo y fuente, en el campo nuevo `refetch_from` de `symbols.json`, el primer día que quitó.
   - La siguiente descarga del activo empieza en el primer día pendiente, responda la fuente que responda, y no se da por al día mientras quede alguno pendiente.
   - Una vez pedido, se borra. Solo se borra lo que se pidió: una purga hecha mientras tanto sigue pendiente.
   - Test con el caso del revisor: una línea mala del día 4 y una buena del 5, que se purga y se vuelve a pedir desde el 4.
- **Techo total del bundle**: pasa de 269,0 a 270,0 KB. Se midió 269,61 (276.081 bytes), y todo lo añadido es diferido. El arranque, 73,9 KB, sigue bajo su techo.
- **`docs/` sin tocar**: el documentador debe recoger en `docs/data-schema.md` los campos `misstored` y `refetch_from` del formato 2.
