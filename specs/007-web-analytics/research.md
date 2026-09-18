# Investigación y mediciones — feature `007-web-analytics`

Todo lo de aquí está **medido en este worktree** el 2026-09-18 sobre `origin/develop` en `272ff9e`, con Node 22.23.2 y el libro sintético `tests/fixtures/ledger/synthetic-v1.jsonl` (200 eventos, fechas de negocio de 2026-08-25 a 2028-12-31). Ningún número de este documento está estimado.

---

## 1. El libro sintético: cuántos precios hay de verdad

30 eventos `valuation` repartidos entre 13 activos. Fechas por activo:

| Activo | Valoraciones | Primera | Última |
|---|---|---|---|
| `ast_world` | 8 | 2026-09-01 | 2028-12-31 |
| `ast_gold` | 5 | 2026-12-31 | 2028-12-31 |
| `ast_btc` | 3 | 2026-12-31 | 2028-12-31 |
| `ast_mm` | 3 | 2026-12-31 | 2028-12-31 |
| `ast_bonds` | 2 | 2026-12-31 | 2027-12-31 |
| `ast_gamma` | 2 | 2027-12-31 | 2028-12-31 |
| `ast_alpha`, `ast_beta`, `ast_smallcap`, `ast_beta_new`, `ast_smallcap_b`, `ast_bonds_i`, `ast_delta` | 1 cada uno | — | — |

`stale_price_days` en la configuración vigente del libro es **7**. Con valoraciones prácticamente anuales, **casi todo precio leído fuera de un 31/12 está caducado**.

Esto no es un defecto del generador: es el modo de funcionamiento real del proyecto. Los precios son manuales (nivel 1 de la especificación §7.1) y el usuario los registra cuando le conviene. Cualquier gráfica tiene que sobrevivir a eso.

---

## 2. Coste de proyectar

| Medición | Valor |
|---|---|
| `projectLedger(events, {collectErrors})` en frío | 11,8 ms |
| Ídem, media de 50 pasadas en caliente | **1,95 ms** |
| Ídem con `asOf`, media de 20 pasadas | **1,57 ms** |
| Serie mensual de 29 puntos (proyectar + `settingsAt` + `netWorth` por punto) | **56–61 ms** → 1,9–2,1 ms por punto |
| Serie diaria de 366 puntos (2028 entero) | **435 ms** → 1,19 ms por punto |

Conclusión operativa: **una serie cuesta una proyección por punto**. Con 200 eventos son ~2 ms; con un libro de veinte años el coste por punto crece linealmente con el número de eventos, así que la **densidad de puntos** es la decisión de diseño que importa, no la velocidad del motor. Una serie diaria de veinte años (≈7300 puntos) sobre un libro de unos pocos miles de eventos se iría a decenas de segundos y está descartada.

---

## 3. Lo que dice el libro cuando se le pregunta mes a mes

Proyectando con `asOf` en los 29 cierres de mes entre 2026-08-31 y 2028-12-31, y mirando `netWorth`:

| Bloque | Puntos **completos** de 29 |
|---|---|
| Núcleo (`core.partial === false`) | **6** |
| Cubo (`bucket.partial === false`) | **3** |
| Efectivo (`cash.partial === false`) | **29** |
| Los tres a la vez (`partial === false`) | **2** |

Con rejilla **diaria** durante 2028 (366 puntos): núcleo completo en 38, cubo en 0, efectivo en 366, los tres en 0.

Dos consecuencias que condicionan el diseño de las gráficas:

1. **Una línea única del patrimonio total sería casi siempre un hueco** (2 puntos de 29). Tres series por libro, que es lo que el prompt pide de todas formas, recuperan 6 y 3 puntos y dejan el efectivo completo.
2. **`netWorth.total_eur` con `partial === true` es la suma de lo que sí tiene precio**, es decir, un número *más pequeño* que la realidad. Dibujarlo sería exactamente la mentira silenciosa que la constitución V prohíbe. Por eso un punto parcial tiene que ser un hueco, no un valor.

Se descartó la variante «rejilla fija + arrastrar el último precio conocido»: `priceAt` ya arrastra el último precio (con `age_days` y `stale`), así que una rejilla mensual dibujaría doce puntos idénticos entre dos valoraciones anuales y una recta entre ellos. La recta es información inventada; los doce puntos idénticos, ruido.

---

## 4. uPlot 1.6.32: lo que pesa de verdad

Descargado de `https://registry.npmjs.org/uplot/-/uplot-1.6.32.tgz` y medido fichero a fichero:

| Fichero | Sin comprimir | gzip |
|---|---|---|
| `uPlot.esm.js` | 142,0 KB | 40,9 KB |
| `uPlot.iife.min.js` | 49,9 KB | **21,6 KB** |
| `uPlot.min.css` | 1,8 KB | 0,7 KB |
| `uPlot.d.ts` | 37,6 KB | 10,3 KB |

ADR-0017 dice «23 KB»: es el tamaño **minificado**, coherente con los 49,9/2 de la tabla si se compara con las cifras minificadas de Chart.js y ECharts que el ADR pone al lado. **Gzip, en el *bundle*, uPlot son ~21,6 KB.** El ADR no se contradice; simplemente la unidad no era gzip.

Se vendoriza `uPlot.esm.js` (la fuente ESM, no el `iife.min`), porque Rolldown la minifica igual y así el código vendorizado es legible dentro de veinte años, que es el motivo de vendorizar. `uPlot.d.ts` entra para que `tsc` en modo estricto no necesite un `any`.

---

## 5. El *bundle* de hoy, y por qué el presupuesto no llega

`npm run build` sobre `develop`, medido por `apps/web/scripts/check-bundle.mjs`:

| Fragmento | Sin comprimir | gzip | ¿Arranque? |
|---|---|---|---|
| `assets/components-*.js` (dominio + componentes compartidos) | 93,9 KB | 28,8 KB | sí |
| `assets/index-*.css` (Pico vendorizado + nuestras hojas) | 99,3 KB | 14,5 KB | sí |
| `assets/routing-*.js` | 31,6 KB | 12,2 KB | sí |
| `assets/index-*.js` | 21,4 KB | 8,3 KB | sí |
| `workbox-*.js` | 14,8 KB | 5,1 KB | no (*service worker*) |
| `assets/view-models-*.js` | 14,1 KB | 4,7 KB | no |
| resto de fragmentos perezosos (21 ficheros) | — | ~39 KB | no |
| **TOTAL** | — | **113,3 KB** | — |
| **Presupuesto actual** | — | **120,0 KB** | — |

Del total, lo que el navegador descarga **para arrancar** (lo que `index.html` precarga) son ~70 KB gzip: `index` + `routing` + `components` + `source` + `names` + `errors` + CSS.

**Quedan 6,7 KB de margen y uPlot solo ya son 21,6.** Con tres pantallas nuevas, tres formularios y las gráficas, el `build` fallará por presupuesto. El comprobador dice en su cabecera que mide «lo que el navegador descarga para arrancar», pero en realidad suma **todos** los `.js` y `.css` de `dist`, fragmentos perezosos incluidos. Esa es la incoherencia que hay que resolver, y está en la pregunta **Q6**.

---

## 6. La puerta de `Amount` y el eje de una gráfica

`tests/architecture.test.ts` comprueba sobre el grafo de importaciones que **solo** `components/Amount.tsx` importa `format/money.ts`. Es la regla que hace imposible saltarse el modo privacidad.

Una gráfica de patrimonio necesita formatear euros en dos sitios donde no hay componente: la función `values` del eje Y de uPlot y su *tooltip*, que reciben números y devuelven cadenas. No hay forma de pasar por `Amount` ahí dentro.

Tres salidas, medidas contra la regla y no contra la comodidad:

- Añadir **un** módulo a la lista de autorizados (`components/chart/money-axis.ts`) que formatea y enmascara llamando a `amountDisplay`, con su motivo escrito, exactamente como está autorizado `Amount`. La regla sigue siendo «los sitios que formatean dinero están enumerados y son dos».
- Dejar el eje **sin números** y poner los valores solo en la tabla equivalente, que sí usa `Amount`. Cumple sin tocar nada, pero un eje sin escala es una gráfica peor.
- Pintar el eje con una escala relativa (porcentaje sobre el máximo). No delata importes, pero deja de ser la gráfica que se pide.

Recomendación en **Q5**.

---

## 7. Lo que la CLI enseña, para que la web enseñe lo mismo

Leído entero (`apps/cli/src/commands/{portfolio,bucket,tracking,thesis,corporate-actions}.ts` y `output/`). Lo relevante para no divergir:

- **Nada de `--book`**: no existe tal opción. Las vistas del núcleo y del cubo son comandos distintos, que es la compartimentación aplicada a la interfaz.
- `weights`, `contribute`, `costs`, `networth`, `bucket`, `thesis list|show` y `transfer simulate` aceptan `--date` y proyectan con `asOf`. **`order list` y `transfer pending` no**: cargan sin `asOf` y cuentan los días hasta hoy. Es el punto que la decisión (c) del prompt obliga a cambiar (al menos en `transfer pending`).
- Sin dato se imprime `—` para importes y porcentajes, y **celda vacía** para puntos porcentuales. Sin precio, la celda del precio dice literalmente `sin precio`. Un total parcial se marca `(parcial)`.
- Un precio caducado lleva `⚠` pegado a su antigüedad; un plazo de tesis superado, también.
- Los avisos se imprimen al pie como `Aviso (<code>): <texto español>`, sin deduplicar. La web **sí** deduplica por código y sujeto (`view-models/attention.ts`), y esa diferencia es deliberada: en la web son elementos pulsables, no líneas de texto.
- `atlas bucket` imprime la regla de parada **dos veces**: arriba del todo y otra vez en el pie. Arriba es deliberado («es la regla que el plan quiere que sea más difícil de ignorar»); la web la pondrá arriba y no la repetirá.
- El cubo se pide con `bucketStats(state, events, date, settings, date)`: la fecha va **dos veces**, como fecha de valoración y como corte `asOf`. La web hará lo mismo.
- Inconsistencia anotada, no tocada: `thesis list` imprime `invertido`, `resultado` y `previsto` **sin redondear** (`.amount.toString()`) mientras `atlas bucket` los redondea a céntimos con `eur()`. La web redondeará a céntimos en los dos sitios, como `atlas bucket`; si la dirección prefiere lo contrario, es una línea.

---

## 8. Eventos corporativos: dónde vive hoy la lógica

`apps/cli/src/commands/corporate-actions.ts` (368 líneas) tiene nueve asistentes (`split`, `reverse-split`, `merger`, `spin-off`, `fund-merger`, `share-class-change`, `fund-liquidation`, `delisting`, `raw`). Cada uno toma unas banderas y **compone el array `effects`** que el evento lleva.

Dentro hay una función que no es composición sino cálculo: `fractionalSale` ejecuta un `previewEvent` anidado con solo los efectos principales, mira la posición resultante por cuenta, calcula `posición − ⌊posición⌋` y añade un `forced_sale` con ese reparto. **Eso es una regla de negocio** (qué se vende en un contrasplit con picos, y cuánto en cada cuenta), y hoy vive en `apps/cli`.

Si la web la reimplementa, hay dos definiciones de la misma regla fiscal, que es exactamente lo que la decisión (c) de la 006 existe para impedir, y exactamente el caso que la decisión (h) resolvió moviendo `previewEvent` al dominio. Propuesta y alternativas en **Q4**.

---

## 9. Entorno

- **Hay red**: el registro de npm responde y uPlot 1.6.32 se descarga (comprobado).
- **Hay Chromium de Playwright** en `~/.cache/ms-playwright/`, y la 006 ya lo condujo desde el *scratchpad* con un cliente del protocolo DevTools escrito con `fetch` y `WebSocket` nativos de Node 22. Se hará igual: **nada de Playwright en el `package.json` del repositorio**.
- `npm ci`, `npm run typecheck` y `npm run build` pasan en verde en este worktree antes de tocar nada.
