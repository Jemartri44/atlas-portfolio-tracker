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
