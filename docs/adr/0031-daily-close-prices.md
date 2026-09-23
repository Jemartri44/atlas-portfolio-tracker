# ADR-0031 — Precios de cierre diarios: puerto, almacén y política de fallo

**Estado:** Aceptada (2026-09-24), por decisión de la dirección, que además resuelve lo que guarda CoinGecko y lo que pasa con los fondos que `EUFUND` no cubre. Ronda 8. Las fuentes son decisión de la dirección, tomada sobre la investigación del 2026-09-24; el puerto, el almacén y la política de fallo desarrollan lo que ya pedía `docs/specification.md` §7.

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

**Fuentes** (decisión de la dirección): principal **EODHD Free**, respaldo **Alpha Vantage Free**; cripto, **CoinGecko Demo**, con la atribución **visible** donde se enseñe su cotización. Fondos por `EUFUND` **solo si cubre el ISIN concreto**; si no, extracto o entrada manual, y para la evolución, **la aproximación por ETF de referencia** de `docs/specification.md` §7.1, **siempre marcada como aproximación**. La entrada manual nunca desaparece.

**Correspondencia ISIN → símbolo: dato del catálogo, no una búsqueda diaria.** `asset_created`/`asset_updated` ganan `price_symbols?`, un mapa de fuente (`eodhd`, `alpha_vantage`, `coingecko`) a su símbolo. OpenFIGI **propone** el símbolo al dar de alta el activo y el usuario lo confirma; nada lo consulta después. Es un campo opcional nuevo y añadir una fuente es añadir un valor a un enumerado: los dos son cambios **compatibles** según ADR-0018.

**Puerto `PriceSource`** en `packages/domain/src/ports/`, asíncrono, un adaptador por fuente. Pide cierres diarios de un símbolo entre dos fechas y devuelve cotizaciones (`date`, `close`, `currency`) o un fallo **con tipo**: `unavailable`, `not_found`, `rate_limited`, `blocked`, `invalid_response`, `budget_exhausted`. La cascada vive en un caso de uso del dominio que recibe los puertos (ADR-0007) y lo que escribe pasa por un puerto de almacén de precios, igual que el libro pasa por `LedgerStore`.

**Almacén: `prices/<asset_id>.jsonl`** (`docs/data-schema.md` §1), fuera del libro, una línea por fecha y fuente: `schema_version`, `date`, `close` (decimal como cadena, ADR-0005), `currency` tal como la devuelve la fuente, `source`, `fetched_at`. Solo se añade: si una fuente corrige un cierre ya guardado, entra una línea nueva y gana la más reciente, con la diferencia a la vista. **El paso a euros no se guarda**: lo hace la puerta al leer, con el histórico del BCE (ADR-0029); una cotización en una divisa sin tipo se enseña en su divisa, no se convierte con un tipo inventado.

**Política de fallo** (§7.2 y constitución V): fuente principal → respaldo → **último valor conocido con su antigüedad** → entrada manual (`valuation`, que gana siempre). `stale_price_days` marca lo antiguo. **Nunca se interpola** ni se rellena un día que falta. Cada fuente lleva su estado en `prices/_status.json` (fallos seguidos, último éxito, tipo del último fallo); un `blocked` o un `rate_limited` no se reintenta en bucle dentro de la misma ejecución; y superar un número configurable de fallos seguidos manda un correo, que es lo que avisará de que una fuente ha cambiado sus condiciones.

**Presupuesto de llamadas.** Veinte o veinticinco al día obligan a priorizar: primero las posiciones del cubo (la tarea diaria de §9.5 avisa si una tesis se acerca a su invalidación), después el índice de referencia del cubo y los ETF de referencia, después el resto del núcleo. Lo que no quepa ese día conserva su último valor con su antigüedad.

**Claves de API: son secretos** (decisión de la dirección). En local, en un fichero de configuración **fuera del repositorio**; en la nube, SSM `SecureString`. El orden de las fuentes y su presupuesto viven con la clave, fuera del libro: son configuración de la máquina que descarga, no de la cartera.

**Dónde se descarga.** Etapa local: la consola (`atlas prices update`, nombre provisional). La web de escritorio lee `prices/` de la carpeta compartida; en el móvil, sin nube, no hay precios automáticos. No se abre la CSP (ADR-0029, punto 3). Etapa de nube: una tarea diaria en la Lambda escribe `prices/` y los dispositivos lo reciben por la API.

## Consecuencias

- **CoinGecko** (decisión de la dirección): sus condiciones piden refrescar la caché cada 24 h, y §1 del esquema dice que `prices/` se guarda **para siempre**. **De cripto solo se guarda el último valor conocido, sin histórico**, renovado cada día, hasta que alguien lea sus condiciones completas. **Las acciones y los ETF sí guardan histórico.**
- **Una sola clave, un solo presupuesto diario.** Cuando exista la tarea programada, la consola deja de pedir lo que ya pidió la nube y lo descarga de la API; si no, las dos se comen el mismo cupo.
- EODHD Free solo da **un año de histórico**: lo que no se guarde hoy no se podrá pedir dentro de dos años. Es un motivo más para guardar los cierres, dentro de lo que permitan las condiciones de cada fuente.
- La divisa de una cotización puede no ser la del activo (por ejemplo, una subunidad de la divisa): se guarda la que devuelve la fuente y la puerta rechaza la que no sepa convertir, en vez de suponer.
- **Ningún cálculo fiscal cambia**: la puerta sigue siendo la única entrada y el Modelo 720 sigue leyendo solo la valoración manual.
- Documentos que hay que actualizar: `docs/specification.md` §7 (la tabla nombra a Yahoo; §7.3, el riesgo de rascar desde Lambda, cambia de naturaleza: pasa a ser el de condiciones y cupos de una API), `docs/data-schema.md` §1 y §6.1 (`price_symbols`), y `docs/dependencies.md`, que no cambia de paquetes: los adaptadores usan `fetch` de Node.
- Relacionadas: ADR-0005, ADR-0007, ADR-0018, ADR-0026, ADR-0028 y ADR-0029.
