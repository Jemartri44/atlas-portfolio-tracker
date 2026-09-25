# Especificación — Aplicación de gestión de cartera

**Fecha:** agosto 2026
**Estado:** especificación de producto, viva. Ya no es un documento sin implementar: el estado fase a fase está en §13.
**Documentos relacionados:** `business-rules.md` (reglas de dominio, referenciadas aquí por número) y `plan-financiero.md` (plan de inversión personal; **privado, no está en el repositorio**; las referencias a "regla N del plan" o "P1/P2/P3" apuntan a él).

**Convención de idioma:** prosa en español; identificadores, nombres de campo, tipos y código en inglés, tal como aparecerán en el fuente.

---

## 1. Objetivo

Sistema personal para registrar, consultar y controlar una cartera de inversión a 20+ años, repartida entre varias plataformas y con reglas de operación escritas.

**Lo que hace:**
- Registro de todas las operaciones, con trazabilidad fiscal.
- Cálculo de la aportación mensual según los pesos objetivo.
- Seguimiento de la operativa especulativa con evaluación de rendimiento frente a índice, gráficas y comparativas.
- Comprobaciones automáticas y avisos por correo.
- Preparación de los datos de la declaración de la Renta.

**Lo que NO hace:**
- No ejecuta órdenes. Todas las operaciones son manuales.
- No conecta con credenciales de brókers (salvo un token de solo lectura de IBKR, opcional).
- No da recomendaciones de inversión.

---

## 2. Principios de diseño

1. **El libro mayor propio es la fuente de verdad.** Los extractos de los brókers sirven para conciliar, no para alimentar el sistema. Los brókers cambian formatos, cierran cuentas antiguas y desaparecen; el registro propio no.
2. **Registro en el momento de operar**, no reconstruido a posteriori (regla 20 del plan).
3. **Compartimentación estricta.** Núcleo y cubo no se mezclan en ningún cálculo, vista ni métrica.
4. **Todo dato derivado es recalculable** desde el libro mayor. Nada de valores agregados almacenados sin poder regenerarlos.
5. **Supervivencia a 20 años** por encima de elegancia técnica: pocas dependencias, formatos abiertos, datos exportables en cualquier momento.
6. **Fallo seguro.** Si una fuente de precios cae, el sistema muestra el último dato conocido con su antigüedad marcada. Nunca inventa ni interpola en silencio.

---

## 3. Estructura de la cartera

Dos libros (`book`) independientes. Cada uno con sus reglas, sus métricas y su vista.

| `book` | Nombre | Contenido | Plataforma | Métrica principal |
|---|---|---|---|---|
| `core` | **Cartera principal / núcleo** | Cuatro clases de activo: renta variable, renta fija, oro y cripto | MyInvestor (fondos), IBKR (ETC/ETP) | Desviación frente a pesos objetivo |
| `bucket` | **Cubo especulativo** | Acciones al contado, operativa corta. Pequeña parte para especular, trastear y aprender | IBKR (cuenta separada) | Rendimiento frente al índice |

### 3.1 Clases de activo del núcleo (`asset_class`)

| Clase | Nombre | Vehículo | Traspasable | Particularidad |
|---|---|---|---|---|
| `equity` | Renta variable (RV) | Fondos indexados | Sí | Traspasos, aproximación de precio por ETF |
| `fixed_income` | Renta fija (RF) / monetario | Fondos indexados o monetarios | Sí | Destino del desriesgado (regla 5) |
| `gold` | Oro | ETC de oro físico | No | Satélite; comisiones por orden; Modelo 720 |
| `crypto` | Cripto | ETP o tenencia directa | No | Satélite; Modelo 720/721 según vehículo |

Los pesos objetivo (`target_weights`) se definen por activo y se aplican **sobre el valor total del núcleo**. Las vistas agrupan también por clase de activo.

### 3.2 Regla transversal

El cubo nunca entra en el cálculo de los pesos objetivo del núcleo. Es un presupuesto (porcentaje fijo de la aportación mensual), no una asignación. Pero **sí** aparece en la vista de patrimonio total, con etiqueta propia.

**Vista consolidada:** patrimonio total = núcleo (desglosado por clase de activo) + cubo + efectivo de las cuentas de inversión, con desglose siempre visible. Nunca un único número sin descomponer. El colchón bancario queda **fuera del alcance** de la aplicación (ADR-0004).

---

## 4. Modelo de datos

### 4.1 Entidades

**Magnitudes numéricas (ADR-0005):** importes, cantidades y tipos de cambio son decimales exactos (`big.js` vendorizada, envuelta en `Money`, `Quantity`, `Price`, `FxRate`), serializados como **cadenas** en JSON. Se guarda lo que dice el bróker sin truncar; se redondea a céntimos solo en la salida fiscal (half-up) y en pantalla, una vez por operación.

**Account** (cuenta)
`id`, `name`, `platform`, `book`, `base_currency`, `country` (para el Modelo 720), `active`

El saldo de efectivo de cada cuenta (`cash_balance`) es **derivado**: resulta de `cash_deposit`, `cash_withdrawal`, compras, ventas, dividendos y comisiones. Se usa para conciliar con el bróker y para la vista de patrimonio. No hay cuentas bancarias puras: el colchón se gestiona fuera de la app (ADR-0004).

**Asset** (activo)
`id`, `type` (`fund` | `etf` | `etc` | `etp` | `stock` | `crypto` | `money_market`), `book`, `asset_class` (solo `core`: `equity` | `fixed_income` | `gold` | `crypto`), `isin`, `ticker`, `name`, `currency`, `ter`, `transferable` (bool), `reference_etf_id` (solo fondos, ver §7), `active` (bool)

Los identificadores cambian con el tiempo. El `id` interno es inmutable; ISIN y ticker son atributos que se versionan.

**Lot** (lote) — *la entidad central*
`id`, `asset_id`, `acquisition_date`, `quantity`, `original_quantity`, `cost_eur` (total, con la comisión de compra incluida), `source_event_id`, `source_lot_id` (para traspasos), `closed` (bool). Sin `account_id`: los lotes son globales por activo (ADR-0009); la cuenta vive en `physicalPositions`.

**Los lotes no se almacenan: son una proyección** calculada desde cero a partir de las operaciones (`projectLots(transactions)`, ADR-0003). **Nunca almacenar posiciones agregadas.** El FIFO exige el detalle lote a lote. La posición actual es una consulta, no un campo.

**Transaction** (operación)
`id`, `trade_date`, `value_date`, `type`, `asset_id`, `account_id`, `quantity`, `unit_price`, `currency`, `fx_rate`, `fee`, `notes`, `reverses_transaction_id` (opcional), `corrects_transaction_id` (opcional)

Tipos (`type`): `buy`, `sell`, `transfer`, `dividend`, `interest`, `fx_exchange`, `swap`, `corporate_action`, `cash_deposit`, `cash_withdrawal`, `standalone_fee`, `valuation`, `reversal`; los eventos de seguimiento sin efecto contable `order_placed`/`order_updated` y `transfer_requested`/`transfer_request_updated` (ADR-0010, ADR-0012); las tesis del cubo `thesis_opened`/`thesis_closed`; y `tax_return_filed`, la constancia de lo declarado (ADR-0020). Con el catálogo y la configuración, **25 tipos**. Detalle en `docs/data-schema.md`.

**El libro es append-only** (ADR-0003): las operaciones nunca se editan ni se borran. *Editar* en la interfaz escribe un `reversal` de la original más la operación correcta enlazada por `corrects_transaction_id`; *Eliminar* escribe solo el `reversal`. La proyección de lotes ignora las parejas anuladas. Si la rectificación afecta a un ejercicio fiscal ya declarado, la app lo advierte.

**Price** (precio)
`asset_id`, `date`, `value`, `currency`, `source`, `fetched_at`

**ExchangeRate** (tipo de cambio)
`date`, `pair`, `rate`, `source` (BCE)

**Thesis** (tesis) — solo cubo
`id`, `opened_at`, `asset_id`, `hypothesis`, `expected_horizon`, `invalidation`, `planned_size`, `opening_transaction_id`, `closing_transaction_id`, `result_eur`, `result_vs_index`, `closing_notes`

Se crea **antes** de abrir la posición (regla 15). El sistema no debe permitir registrar un `buy` en el libro `bucket` sin una tesis asociada.

### 4.2 El traspaso: el caso que hay que modelar bien

Cuando se traspasa entre fondos (clases `equity` y `fixed_income`):

- **Se conserva la fecha de adquisición original y el coste original.** No es una venta seguida de una compra.
- El evento genera lotes nuevos en el fondo destino que **heredan** `acquisition_date` y `unit_cost_eur` de los lotes origen, enlazados por `source_lot_id`.
- No genera ganancia ni pérdida patrimonial. No aparece en la declaración.

Si esto se modela como venta + compra, la fiscalidad sale mal durante veinte años. Es la trampa principal del modelo.

### 4.3 Eventos corporativos

A 20 años, todos estos van a ocurrir. El modelo debe soportarlos sin migración de esquema. Un evento corporativo es una `Transaction` de tipo `corporate_action` con un subtipo `kind`:

| `kind` | Evento | Efecto sobre los lotes |
|---|---|---|
| `split` | Split (ej. 4:1) | Multiplica cantidad, divide coste unitario. Fecha y coste total intactos. |
| `reverse_split` | Contrasplit | Inverso. Cuidado con las fracciones sobrantes, que suelen liquidarse en efectivo (hecho imponible). |
| `cash_dividend` | Dividendo en efectivo | No toca lotes. Rendimiento del capital mobiliario. Si hay retención en origen, registrarla para la deducción por doble imposición. |
| `stock_dividend` | Dividendo en acciones | Lotes nuevos. Fecha de adquisición y valoración según normativa. |
| `merger` | Fusión / absorción | Los lotes se transforman en el valor nuevo con canje. Conserva antigüedad. |
| `spin_off` | Escisión | El coste original se reparte entre matriz y escindida según proporción publicada. |
| `fund_merger` | Fusión de fondos | Frecuente en fondos indexados. Similar al traspaso: conserva antigüedad y coste. |
| `share_class_change` | Cambio de clase de participación | Muy frecuente. Mismo fondo, otro ISIN, otro TER. Conserva antigüedad. |
| `fund_liquidation` | Cierre / liquidación de fondo | Reembolso forzoso. **Sí es hecho imponible.** |
| `identifier_change` | Cambio de ISIN o ticker | Solo metadatos, pero rompe las fuentes de precios. |
| `delisting` | Exclusión de cotización | Posición sin precio. Requiere marcado manual. |
| `crypto_fork` | Fork de cripto | Activo nuevo con coste de adquisición cero o valor de mercado, según criterio. |
| `token_migration` | Migración de token | Canje. Documentar el criterio aplicado. |
| `issuer_restructuring` | Reestructuración del emisor de un ETC/ETP | Puede implicar canje o reembolso forzoso. |

**Requisito:** un evento corporativo es un tipo de operación de primera clase, con su propia lógica de transformación de lotes, no un apaño manual sobre la base de datos.

**Requisito:** todo evento corporativo guarda la **fuente documental** (`source_document`: URL o PDF del emisor). Dentro de doce años no vas a recordar por qué tus lotes cambiaron en marzo de 2031.

### 4.4 Qué es el modelo de datos y qué hay ya hecho

El modelo de datos no es una librería: es el diseño de qué entidades existen, qué campos tienen y qué reglas las relacionan. Primero un documento, después un esquema.

Proyectos de código abierto que ya han resuelto partes de esto:

| Proyecto | Stack | Qué aporta | Qué le falta |
|---|---|---|---|
| **Ghostfolio** | TypeScript, NestJS + Angular + Postgres | Lo más parecido al objetivo: cuentas, actividades, multidivisa, dividendos, autohospedable | Sin traspaso español, sin FIFO fiscal español, eventos corporativos limitados, sin concepto de cubo |
| **Beancount** | Python | **El mejor motor de lotes disponible**: coste base, métodos de imputación, multidivisa, texto plano versionable en git | Python; es CLI y ficheros, no app web |
| **Portfolio Performance** | Java, escritorio | Excelente en eventos corporativos y seguimiento de lotes | Escritorio, no embebible |
| **Firefly III** | PHP | Finanzas personales generales | Orientado a presupuesto, flojo en inversión |

**Decisión: modelo propio.** Los requisitos específicos (traspaso español, regla de los dos meses, log de tesis, comparación contra índice) hacen que adaptar una app general sea pelear contra sus suposiciones.

**Pero antes de diseñar:** leer cómo Beancount modela lotes y métodos de imputación de coste, y cómo Ghostfolio modela actividades y cuentas. Una tarde de lectura ahorra semanas de rediseño.

---

## 5. Configuración

**Todo umbral, frecuencia y regla es configurable desde la interfaz.** Nada codificado en el fuente. Los valores cambian con la vida y con la cartera, y editar código para cambiar un porcentaje garantiza que no se hará.

### 5.1 Entidad Settings

`Settings` es el conjunto de parámetros que la aplicación **lee** en lugar de llevarlos escritos en el fuente: pesos objetivo, umbrales, frecuencias, criterios fiscales y residencia. Existe por el principio IV de la constitución —nada codificado que deba ser configurable—: estos valores cambian con la vida, con la cartera y con la normativa, y obligar a editar código para mover un porcentaje garantiza que no se mueva. No vive en un fichero aparte: cada cambio es un evento `settings_changed` del libro mayor (ADR-0006) y registra la configuración vigente **entera**, de modo que un cálculo de hoy se reproduce dentro de quince años aunque el valor por defecto del código haya cambiado (ADR-0022).

**No toda la configuración vive en `Settings`** (principio IV de la constitución, enmendado en la 1.6.0). Nada configurable se escribe en el código, pero en `Settings` vive solo la configuración que **afecta a cifras del libro**. La que es **dato personal o secreto** (destinatario del correo, lista permitida de acceso, claves) y la **configuración operativa que ninguna cifra lee** (fuentes de precios, correo) viven **fuera del libro**, en SSM Parameter Store en la nube o en un fichero de configuración local fuera del repositorio (ADR-0027, ADR-0028, ADR-0031; detalle en §11.8). Un campo nuevo en `settings_changed` sigue además la enmienda de ADR-0018.

**La lista normativa de parámetros es `business-rules.md` §7**, con el valor inicial y la regla asociada de cada uno. Manda ella, y esta especificación **no la repite**: la tabla que había aquí se quedó desfasada durante meses —le faltaban los criterios fiscales que el motor ya usaba y le sobraba alguno que nunca existió en el código—, que es lo que pasa siempre con una lista duplicada. Cualquier parámetro nuevo se añade en §7 y solo en §7.

**Previsión, todavía fuera de la lista normativa:** `alert_channels{}` —qué avisa por correo y qué se queda solo en la interfaz— es una previsión de la **Fase 4 (automatización)**, coherente con la columna «Notifica» y el principio de notificación de §9.5, pero **no existe en el código ni en §7**. Se anota aquí para no perderla; entra en §7 el día que la Fase 4 la implemente, no antes.

### 5.2 Requisitos

- **Historial de cambios de configuración.** Cambiar los pesos objetivo altera el cálculo de desviaciones históricas; hay que poder saber qué valores estaban vigentes en cada momento. Se cumple porque cada cambio es un evento `settings_changed` del libro (ADR-0006).
- **Validación**: los pesos objetivo deben sumar 100%. Los umbrales deben ser coherentes entre sí.
- **Aviso al cambiar**: modificar un umbral que está silenciando una alerta activa debe advertirlo explícitamente. Es la protección frente a subir el listón para no oír la alarma.

---

## 6. Funcionalidad por libro

### 6.1 Núcleo

Funcionalidad común a las cuatro clases de activo:

- Posición actual por activo y por clase: valor, peso real, peso objetivo, desviación en puntos porcentuales.
- **Calculadora de aportación mensual**: dado el importe del mes (menos el presupuesto del cubo), reparte hacia los activos más rezagados.
- **Aviso de desviación** si algún activo supera el umbral (regla 3).
- Histórico de aportaciones y evolución del valor, total y por clase.
- TER medio ponderado del núcleo y coste anual estimado en euros.
- Coste acumulado en comisiones por activo, en euros y como porcentaje de lo invertido.

#### 6.1.1 Renta variable y renta fija (fondos)

- **Simulador de traspaso**: qué pesos quedarían tras un traspaso, y confirmación de que no genera hecho imponible.
- Precio aproximado por ETF de referencia (§7) para consulta; valor liquidativo exacto solo en el libro mayor.
- Regla 5 (desriesgado hacia RF con objetivo concreto): funcionalidad futura.

#### 6.1.2 Oro (ETC)

- **Aviso de regla del umbral (6b)**: si el peso cae por debajo del mínimo de satélite, avisar de que la posición ha dejado de ser significativa.
- Comisiones de compra acumuladas: con órdenes pequeñas se disparan y conviene verlas.
- Entra en el cómputo del Modelo 720 (entidad extranjera).

#### 6.1.3 Cripto (ETP o tenencia directa)

- Aviso de regla 6b, igual que el oro.
- **Si hay tenencia directa**: registro de cada permuta como hecho imponible, con valoración en euros en el momento del canje, y **control del umbral del Modelo 721**.
- **Si es ETP**: se trata como cualquier valor (Modelo 720), sin especificidad.

### 6.2 Cubo especulativo

Es el libro con más funcionalidad propia: es una parte pequeña de la cartera para especular, trastear y aprender, y por eso necesita las mejores herramientas de seguimiento.

**Registro de tesis (obligatorio antes de abrir):**
- Hipótesis: qué crees que va a pasar y por qué.
- Plazo esperado.
- Condición de invalidación: qué te haría estar equivocado.
- Tamaño previsto.

**Posiciones abiertas:**
- Precio actual, P&L latente, días abierta, plazo esperado ya superado o no.
- Recordatorio visible de la condición de invalidación.

**Métricas de rendimiento:**
- **Comparación frente al índice**: para cada operación cerrada, qué habría rendido ese mismo importe invertido en el fondo global durante el mismo periodo. Esta es la métrica que importa (regla 16), no el resultado absoluto.
- Tasa de acierto, ganancia media, pérdida media, esperanza matemática por operación.
- **Comisiones acumuladas como porcentaje del capital operado.** Con este tamaño de cuenta es probablemente el número más importante del panel.
- Máxima caída del libro.
- Número de operaciones (para saber cuándo la muestra empieza a tener significado; por debajo de ~100 no distingue habilidad de suerte).

**Gráficas y comparativas:**
- Curva de valor del cubo frente a la del mismo dinero invertido en el índice.
- Distribución de resultados por operación (histograma) y por tesis.
- Línea temporal de cada tesis: apertura, precio, invalidación, cierre.
- Rendimiento por plazo, por tamaño y por tipo de hipótesis, para aprender qué funciona y qué no.
- Evolución de comisiones acumuladas frente al capital operado.

**Reglas de control:**
- **Regla de parada (17)**: aviso al acercarse al umbral, bloqueo visible al superarlo.
- **Regla de recogida (18)**: aviso si el cubo supera su peso máximo sobre la cartera.
- **Regla de los dos meses**: alerta al intentar registrar una recompra de un valor vendido con pérdidas en los dos meses anteriores. Es el error fiscal más común en operativa activa.
- Aporte acumulado al cubo frente al presupuesto anual previsto.

---

## 7. Fuentes de datos

> **Vigente desde ADR-0031 (2026-09-24, Ronda 8).** Yahoo Finance, Stooq y Morningstar quedan **descartados**: las condiciones de Yahoo prohíben por escrito el acceso automatizado, Stooq responde con un reto anti-*bot* y Morningstar solo ofrece API de empresa (investigación del 2026-09-24). Las fuentes de precio de cierre diario son APIs gratuitas con clave: **EODHD** (principal) y **Alpha Vantage** (respaldo). **CoinGecko y OpenFIGI quedaron retirados al cerrar la feature 013** (ADR-0031, tercera enmienda): las condiciones de CoinGecko describen su plan gratuito como para probar, y OpenFIGI no documenta qué bolsa es cada código. La tabla de abajo queda como referencia histórica salvo las filas corregidas.

| Dato | Fuente | Fiabilidad | Riesgo |
|---|---|---|---|
| Acciones, ETFs, ETCs | **EODHD (principal), Alpha Vantage (respaldo)**, APIs con clave gratuita (ADR-0031) | Buena | Cupo diario (20 y 25 llamadas) y condiciones de uso de una API gratuita. El plan gratuito de Alpha Vantage solo ve **los últimos 100 días de mercado**: sirve para el día a día, no para rellenar un año |
| Cripto | **EODHD si su plan gratuito la cubre**; si no, entrada manual (ADR-0031, tercera enmienda). ~~CoinGecko Demo~~ | **Sin verificar** | Cobertura del plan gratuito **SIN VERIFICAR** hasta la prueba con la clave del usuario (`docs/runbooks/013-daily-close-prices-live-test.md`) |
| Tipos de cambio | BCE (CSV/API oficial) | Excelente | Ninguno |
| Valor liquidativo de fondos | `EUFUND` de EODHD si cubre el ISIN; si no, **aproximación por ETF equivalente**, siempre marcada como tal (ADR-0031) | Buena para consulta | No sirve para fiscalidad |
| Valor liquidativo exacto | Entrada manual al registrar la operación | Exacta | Requiere disciplina |
| Operaciones IBKR | Flex Query (API con token) | Excelente | Token a rotar |
| Operaciones MyInvestor | Subida de extracto o entrada manual | Buena | Formato puede cambiar |

### 7.1 Estrategia de precios: dos niveles

El error de diseño a evitar es intentar obtener el valor liquidativo oficial de los fondos por *scraping*. Yahoo Finance cubre mal los fondos UCITS irlandeses, y depender de ello hace frágil todo el sistema — motivo por el que ADR-0031 lo descarta directamente junto con Stooq y Morningstar.

**Nivel 1 — Precio exacto (para fiscalidad y libro mayor).**
Se introduce a mano en el momento de registrar la operación, o llega del extracto del bróker. Es el único que alimenta cálculos fiscales. Nunca se estima.

**Nivel 2 — Precio aproximado (para consulta y paneles).**
Para cada fondo se configura un **ETF de referencia que replica el mismo índice** (`Asset.reference_etf_id`). El movimiento del ETF sirve como aproximación de la evolución del fondo. Resuelve el caso "compré hace un año y quiero ver cómo va" sin depender de scraping de fondos.

Estos precios son **exclusivamente informativos** y la interfaz los marca como aproximados. Ningún cálculo fiscal los toca.

### 7.2 Arquitectura de fuentes: patrón adaptador

Cada fuente es un adaptador del puerto `PriceSource` (`packages/domain/src/ports/`, ADR-0031), asíncrono, que pide cierres diarios de un símbolo entre dos fechas. Requisitos:

- **Cascada de respaldo**: fuente primaria (EODHD) → secundaria (Alpha Vantage) → último valor conocido con su antigüedad → entrada manual. ~~La entrada manual gana siempre.~~ **Para enseñar un valor, gana el dato de fecha más reciente, y con la misma fecha la valoración manual**, siempre entre los precios que tienen valor en euros (ADR-0031, segunda y tercera enmiendas). El Modelo 720 y toda ruta fiscal siguen leyendo solo la valoración manual.
- **Antigüedad siempre visible.** Si un precio lleva más de `stale_price_days` sin refrescarse, la interfaz lo indica.
- **Nunca interpolar ni estimar en silencio.**
- **Registro de fallos con tipo** (`unavailable`, `not_found`, `rate_limited`, `blocked`, `invalid_response`, `budget_exhausted`); si una fuente falla repetidamente, aviso por correo. Es lo que avisará de que una fuente ha cambiado sus condiciones o agotado su cupo.
- **Correspondencia ISIN → símbolo** en `prices/symbols.json`, fuera del libro (ADR-0031): configuración de la descarga, nunca un hecho de la cartera. ~~Propuesta por OpenFIGI y confirmada por el usuario al dar de alta el activo.~~ **La declara el usuario**, con la divisa de la cotización, y la consola la contrasta con la fuente; si la fuente dice otra divisa, el usuario la confirma una vez y de forma explícita (`atlas prices symbols set`, ADR-0031, tercera enmienda).

### 7.3 ⚠ Riesgo conocido: condiciones y cupos de una API gratuita

> **Vigente desde ADR-0031 (2026-09-24).** El riesgo ya no es el bloqueo de las IPs de AWS por sistemas anti-*bot* de *scraping* (Yahoo, Stooq y Morningstar quedan descartados, §7): es que una API gratuita con clave cambie sus condiciones, reduzca su cupo diario o cierre el plan gratuito.

Mitigaciones, en orden:
1. Diseño con adaptadores y respaldo manual (arriba). El sistema degrada, no se rompe.
2. **Presupuesto de llamadas diario**, priorizado: primero las posiciones del cubo, después el índice de referencia y los ETF de referencia, después el resto del núcleo (ADR-0031). Lo que no quepa ese día conserva su último valor con su antigüedad.
3. Si una fuente deja de servir: sustituirla por otra de la misma categoría (acciones/ETF, cripto) tras la misma investigación que hizo ADR-0031, o volver a la entrada manual. Las condiciones del plan gratuito cuentan tanto como las técnicas: CoinGecko se retiró porque las suyas describen ese plan como para probar.

**Norma:** el sistema debe seguir siendo plenamente funcional con cero fuentes automáticas de precios. Todo lo automático es comodidad, no requisito.

---

## 8. Importación de extractos

Toda entrada de datos tiene dos vías: **importación** y **manual**. La manual siempre disponible, nunca eliminada.

### 8.1 Fuentes de importación

| Origen | Formato | Método |
|---|---|---|
| IBKR | Flex Query (XML/CSV) | **Automático vía API** con token de solo lectura |
| MyInvestor | Extracto exportado | Subida de fichero |
| Exchange de cripto | CSV | Subida de fichero |

### 8.2 Flujo de importación

1. **Subida o descarga automática** del extracto.
2. **Parseo** con el adaptador correspondiente al origen.
3. **Detección de duplicados** por huella que incluye el identificador del bróker cuando existe (ADR-0012): reimportar el mismo extracto no duplica nada, y dos ejecuciones parciales idénticas no se confunden. Huella repetida = aviso con confirmación.
4. **Vista de conciliación**: qué operaciones son nuevas, cuáles ya existen, cuáles difieren de lo registrado.
5. **Confirmación explícita** antes de escribir. Nada entra en el libro mayor sin que lo apruebes.
6. **Informe de discrepancias**: si el extracto dice que tienes 24,31 participaciones y tu libro dice 24,30, sale un aviso.

### 8.3 Conciliación periódica

Trabajo programado que compara las posiciones del libro mayor contra el extracto de IBKR y avisa si divergen. Es la red de seguridad frente a errores de transcripción y a eventos corporativos que se hayan pasado por alto.

---

## 9. Arquitectura

### 9.1 Decisión: AWS, no Vercel ni VPS

| Opción | A favor | En contra |
|---|---|---|
| **AWS (estático + Lambda)** | Always Free estable desde hace más de una década; control total del scheduling; **es donde tiene sentido el Terraform** | Más trabajo inicial |
| Vercel Hobby | Despliegue con `git push` | Sin base de datos incluida; cron limitado; timeouts cortos para scraping; nivel gratuito sujeto a política comercial |
| VPS | Control total | Mantener un servidor durante 20 años: parches, actualizaciones, renovaciones |

**Elegido: AWS.** "Estático" se refiere solo al frontend: la SPA se sirve desde S3, pero hay backend real en Lambda para scraping, cálculos y trabajos programados. No se pierde funcionalidad; se elimina el servidor de renderizado.

### 9.2 Componentes

> **Diagrama y decisiones vigentes desde ADR-0026, ADR-0027 y ADR-0028 (2026-09-24, Ronda 8).** Cognito desaparece: el acceso es solo con Google, verificado por la propia Lambda (ADR-0027). **Desde el 2026-09-25 no hay cuentas miembro dedicadas** (decisión del usuario; ADR-0034): `dev` y `prod` son dos pilas en una cuenta de AWS que el usuario comparte con otros proyectos, separadas por nombre, etiqueta, estado, prefijo de SSM, roles y un límite de permisos por entorno (detalle en §11.3).

```
Navegador (PC / móvil)      Consola (`atlas`; token de dispositivo
    │                           │  en cabecera propia, ADR-0033)
    ├───────────────────────────┘
    └── CloudFront  <dominio de la app>   [plan Free de tarifa plana + WAF]
           │
           ├── /*      ──── S3 (SPA estática, privada vía OAC)
           │
           └── /api/*  ──── Lambda Function URL ─── Lambda (API) ─── S3 (datos: libro mayor
                            (AuthType=AWS_IAM;                        JSONL versionado, precios,
                             OAC firma la petición;                   histórico del BCE,
                             la Lambda verifica la sesión             documentos de eventos;
                             propia o el token de la                  nunca origen de CloudFront)
                             consola y, en el acceso,
                             el ID token de Google)

EventBridge Scheduler ─── Lambdas programadas ─── SES (correo)
                                │
                                └── SSM Parameter Store (token IBKR, secreto de
                                    cliente de Google, clave de sesión, claves
                                    de las fuentes de precios, destinatario del
                                    correo; registro de los tokens de consola,
                                    que lee y escribe la API, ADR-0033)
```

**Decisiones deliberadas para minimizar coste y servicios:**

- **Lambda Function URL en vez de API Gateway.** Un servicio menos. **La Lambda solo se alcanza a través de CloudFront**, en la misma distribución que la SPA y bajo `/api/*` (ADR-0028, fila 6): mismo origen, así que la cookie de sesión es del mismo sitio y no hace falta CORS. El navegador nunca llama a la Function URL directamente. Con Origin Access Control, CloudFront sobrescribe la cabecera `Authorization` para firmar la petición a la Function URL, así que la sesión y el acceso viajan en cookie o en cabeceras propias, nunca en `Authorization` (ADR-0027).
- **Acceso solo con Google, verificado en la propia Lambda; sin Cognito ni Lambda@Edge** (ADR-0027). Código de autorización con PKCE, la Lambda como cliente OAuth: el token de Google nunca toca la SPA. Sesión propia en una cookie `__Host-` firmada, con lista permitida de `{sub, email}` en SSM. Detalle en §10.
- **SSM Parameter Store en vez de Secrets Manager.** El estándar es gratuito; Secrets Manager cuesta ~0,40$/secreto/mes.
- **DNS en el registrador, no en Route 53.** Un CNAME del subdominio propio a la distribución de CloudFront evita los 0,50$/mes de zona alojada. Certificado en ACM (gratuito), **obligatoriamente en us-east-1** para CloudFront. El dominio real vive en `terraform.tfvars`, fuera del repositorio.
- **S3 como único almacén** (ADR-0002, ADR-0006): un único `ledger/ledger.jsonl` con **todos los eventos** (operaciones, catálogo de cuentas y activos, cambios de configuración); la Lambda lo carga entero, proyecta y guarda con escritura condicional (`If-Match`). El versionado del bucket da historial y backup sin servicios adicionales. La Lambda solo añade: nunca reescribe ni borra líneas (ADR-0026). Esquema y distribución del bucket en `docs/data-schema.md`.
- **Plan Free de tarifa plana de CloudFront** como cortafuegos de aplicación: 0$, cubre 1 M de peticiones y 100 GB al mes, e incluye una *web ACL* de WAF con limitación de tasa por IP (ADR-0028).

### 9.3 Costes

> **Rehecha desde ADR-0028 (2026-09-24, Ronda 8).** La tabla de abajo mezclaba límites de un modelo de precios anterior y contaba con Cognito; la restricción deja de ser «*always-free* indefinidamente» y pasa a ser **coste mínimo con alarma de presupuesto** (constitución, principio VI).

| Servicio | Límite gratuito mensual | Uso previsto |
|---|---|---|
| Lambda | 1M invocaciones, 400.000 GB-segundo, **por cuenta y compartido** con los otros proyectos de la cuenta (ADR-0034) | Unos cientos de invocaciones; si los otros proyectos agotan el nivel gratuito, Atlas paga su parte a precio de lista, céntimos |
| CloudFront (plan Free de tarifa plana) | 1 M de peticiones, 100 GB de salida, WAF con 5 reglas incluido; **como mucho 3 planes Free por cuenta**, sin ampliación (ADR-0034, F9) | Unos MB. Al superar lo incluido **no hay cargos por exceso**; un exceso sostenido durante meses puede reducir la calidad de entrega (ADR-0034, F9). Con un solo plan Free libre, `dev` va con CloudFront de pago por uso, sin WAF (ADR-0034, fila 19) |
| SSM Parameter Store (estándar) | Gratuito; cupo de 10.000 parámetros y rendimiento **por cuenta y región, compartidos** (ADR-0034) | Varios parámetros: token IBKR, secreto de cliente de Google, clave de sesión, claves de las fuentes de precios, destinatario del correo, tokens de la consola |
| Acceso con Google (Lambda propia) | Sin coste de AWS | 1 usuario; sin Cognito |
| SES | 0,10$ por 1.000 correos | ~10 correos/mes ≈ 0,001$. El *sandbox* es por cuenta y región y la cuenta compartida puede estar ya fuera: el rol que envía está acotado por IAM al remitente de Atlas y a la dirección del usuario (ADR-0034, fila 12) |
| S3 (versionado, SSE-S3) | Sin nivel gratuito perpetuo | Unos MB de libro, configuración, histórico del BCE y precios → céntimos al año |
| EODHD, Alpha Vantage | Planes gratuitos con clave | Cupos diarios (20 y 25 llamadas). CoinGecko, retirada (ADR-0031, tercera enmienda) |

**Coste estimado: ≈ 0,01-0,05 $/mes**, cubierto por los créditos de la cuenta mientras duren (investigación del 2026-09-24); agotados los créditos, la cuenta paga ese coste. **Alarma de AWS Budgets a 1 $** por correo, que mide el coste antes de aplicar créditos (ADR-0028).

### 9.4 ⚠ Trampa crítica del Free Plan

AWS cambió el modelo el 15 de julio de 2025. Las cuentas nuevas entran en un **Free Plan** con 100$ de crédito inicial y hasta 100$ más por completar actividades, con ventana de seis meses.

**En el Free Plan, cuando se agotan los créditos o vencen los seis meses, la cuenta se cierra automáticamente**, sin factura previa ni periodo de gracia. Quedan 90 días para pasar al Paid Plan y recuperar los datos antes de que se borren.

**Acción obligatoria: pasar al Paid Plan desde el principio.** Con tarjeta asociada y usando solo servicios de coste mínimo, la facturación queda cubierta por los créditos mientras duren y después es mínima, pero la cuenta no se cierra. Desde el 2026-09-25 Atlas se despliega en una cuenta que el usuario **ya tiene en el Paid Plan** y comparte con otros proyectos (ADR-0034), así que no hay organización ni cuentas miembro que crear. Una cuenta que esté usando el AWS Free Tier **no puede suscribir** los planes de tarifa plana de CloudFront (ADR-0034, F9): se comprueba antes de desplegar.

**Además:** alerta de presupuesto (AWS Budgets) en 1$, con aviso por correo, que mide el coste **antes** de aplicar los créditos. Es la red que avisa si algo se sale de lo previsto (ADR-0028). En la cuenta compartida, el presupuesto **filtra por la etiqueta de asignación de costes `project=atlas`**, que se activa a mano en Billing; los impuestos y lo que pase de los niveles gratuitos compartidos no se etiquetan (ADR-0034, fila 9).

### 9.5 Lambdas programadas

> **Actualizada desde ADR-0029, ADR-0031 y ADR-0032 (2026-09-24, Ronda 8).** La importación diaria de IBKR y la conciliación semanal siguen **bloqueadas por la Ronda 6** (los importadores): entran cuando la Fase 0 los desbloquee. Las tareas de BCE, precios, integridad y volcado sí están diseñadas en esta ronda (feature `016`, sin desplegar todavía).

| Frecuencia | Función | Notifica |
|---|---|---|
| Diaria | Actualizar precios de cierre: EODHD, respaldo Alpha Vantage; cripto por EODHD si su plan gratuito la cubre (ADR-0031, tercera enmienda) | Solo si una tesis se acerca a su condición de invalidación |
| Diaria | Actualizar el histórico del BCE, byte a byte, con el calendario TARGET como comprobación cruzada (ADR-0029) | No, salvo hallazgo de integridad |
| Diaria *(bloqueada, Ronda 6)* | Importar operaciones nuevas de IBKR vía Flex Query | Solo si hay operaciones nuevas o discrepancias |
| Semanal | Comprobar desviaciones de pesos y reglas del cubo | Sí, si se supera algún umbral |
| Semanal *(bloqueada, Ronda 6)* | Conciliar posiciones del libro contra extracto de IBKR | Sí, si divergen |
| Mensual | Recordatorio de aportación con el reparto calculado, **sin importes salvo que se active** (ADR-0028); con los días desde el último inicio de sesión, **contando también los de la consola**, cuántos tokens de consola siguen vivos y cuántos se emitieron en el mes, sin nombres ni importes (ADR-0027, ADR-0033), y el recordatorio de la copia fuera de AWS (ADR-0032) | Sí, siempre |
| Mensual | Volcado del libro mayor, el histórico del BCE, los precios y `positions.json` a `backups/<YYYY-MM>/`, para siempre (ADR-0032) | Solo si falla |
| Trimestral | Verificación de integridad: recalcular todo desde cero y comparar, **más el ensayo automático de restauración** (carga el último volcado en memoria y compara la proyección con la del libro vivo, ADR-0032) | Sí, si hay discrepancia |
| Anual (enero) | Preparar datos de la Renta del ejercicio anterior | Sí |
| Anual | Comprobar umbrales de los Modelos 720 y 721 | Sí, si se acerca a 50.000€ |
| Anual | Ensayo manual de restauración desde el último volcado, en máquina del usuario (constitución VI, ADR-0032) | — (procedimiento manual) |

**Todas las frecuencias y umbrales son configurables** (`job_frequencies`, ver §5).

**Principio de notificación:** el correo mensual siempre llega. Los demás solo cuando hay algo que hacer. Un sistema que envía correos rutinarios acaba filtrado a los seis meses. El destinatario del correo tiene **una sola fuente, `terraform.tfvars`**, fuera del repositorio, de la que Terraform escribe el parámetro de SSM que lee la Lambda y la condición de IAM del envío; nunca va en `Settings` ni en el repositorio (ADR-0028, ADR-0034).

### 9.6 Frontend

> **Vigente desde ADR-0017 y ADR-0019 (2026-09-18).** El *stack* está decidido con investigación verificada (Solid con versión fijada, uPlot vendorizada, sin librería de componentes, tablas HTML nativas; la base de estilos es propia desde ADR-0023, que retiró Pico), así que la comparativa de abajo es **histórica** y la decisión abierta «¿Svelte o Solid?» de §14 queda resuelta: **Solid**. Y la web **no necesita servidor para funcionar**: funciona en el dispositivo, con el libro en el almacenamiento del navegador (IndexedDB) **también en el escritorio**. Desde el 2026-09-24 (feature 012, ADR-0019 enmendada) la web de escritorio **ya no trabaja sobre el mismo fichero que la CLI**: nunca escribe en la carpeta del libro, porque el navegador no puede tomar el cerrojo de la consola (la File System Access API no crea ficheros en exclusiva); de la carpeta solo **lee** el histórico del BCE y, con confirmación, un libro que importar. Hasta la sincronización, la web y la CLI del mismo ordenador no comparten un libro vivo: se pasa de una a otra exportando e importando. Lo que esta sección y la §9.2 describen detrás de una Lambda es la **sincronización de la Fase 4** (ADR-0026), no un requisito para que la web exista. **Desde ADR-0027 (2026-09-24, Ronda 8) esa Lambda ya no valida contra Cognito**: verifica el acceso con Google.

**Requisito:** compila a archivos estáticos servibles desde S3, sin servidor de renderizado.

| Opción | Ventaja | Inconveniente |
|---|---|---|
| Vite + TypeScript sin framework | Dependencias mínimas, máxima auditabilidad | Todo a mano |
| **Vite + Svelte** | Árbol de dependencias pequeño, compila a JS mínimo | Ecosistema menor |
| **Vite + Solid** | Ligero, API tipo React | Menos material de apoyo |
| Vite + React | Ecosistema enorme | Árbol de dependencias grande |
| Astro | Pensado para estático | Puede quedarse corto con estado |

**Recomendación (histórica): Svelte o Solid con Vite.** Suficientes para una app con estado y con un árbol de dependencias auditable de verdad. **Decidido: Solid** (ADR-0017, 2026-09-18).

**Requisitos transversales:**
- Responsive real: la misma interfaz en PC y móvil, sin funcionalidad recortada en móvil.
- **Modo privacidad**: un interruptor, **activado por defecto** (mientras el usuario no lo apague en ese dispositivo), que oculta todos los importes y cantidades (saldos, posiciones, P&L, ejes de gráficas) sustituyéndolos por una máscara, como en las apps bancarias. Los porcentajes y las formas de las gráficas siguen visibles. La máscara mide siempre lo mismo y conserva la unidad («•••• €», «•••• part.»), que dice qué se oculta sin decir cuánto. Lo que el usuario escribe no se oculta; lo que la aplicación precarga en un campo (corregir un movimiento, la configuración) sí, hasta que el campo recibe el foco. Se implementa en un único componente de importe para que ninguna pantalla pueda saltárselo; el estado se recuerda por dispositivo.
- Modo de solo lectura por defecto; registrar operaciones requiere acción explícita.
- Funciona sin conexión para consulta (los datos cacheados siguen visibles con su antigüedad marcada).
- **Consistencia visual**: un sistema de componentes y tokens (colores, tipografía, espaciado) definido una vez y reutilizado; ninguna pantalla con estilos propios. El sistema está en `docs/design/system.md` y la base de estilos es propia (ADR-0023).

---

## 10. Seguridad

Son datos financieros personales completos. Nivel de exigencia alto.

> **Acceso y secretos vigentes desde ADR-0027 (2026-09-24, Ronda 8)**, que sustituye a «Cognito con MFA» en todo este documento.

- **Nunca almacenar credenciales de brókers.** Ni usuario, ni contraseña, ni claves de exchange. Los secretos van en SSM Parameter Store como `SecureString`, jamás en el frontend ni en el repositorio: el token Flex de IBKR (**solo lectura**) y el secreto del cliente OAuth de Google y la clave de firma de la sesión (ADR-0027). **Las claves de las fuentes de precios** EODHD y Alpha Vantage (ADR-0031) van **en local, en un fichero fuera del repositorio y de la carpeta del libro, y en la nube, en SSM** (§11.8).
- **S3 privado**, servido solo vía CloudFront con Origin Access Control. Sin buckets públicos.
- **Acceso solo con Google, verificado en la propia Lambda de la API; sin Cognito ni Lambda@Edge** (ADR-0027). Código de autorización con PKCE y `state`: la Lambda es el cliente OAuth y canjea el código directamente con Google, así que el token nunca toca la SPA ni la URL. Verificación completa del ID token (firma, `aud` del entorno, `iss`, `exp`, `nonce`, `email_verified`) y lista permitida de `{sub, email}` en SSM, consultada en cada petición con una caché de pocos minutos. Sesión propia en una cookie `__Host-` firmada (`HttpOnly`, `Secure`, `SameSite=Strict`), sin *refresh token*: al caducar, se repite el flujo con Google. **La verificación en dos pasos de la cuenta de Google es un requisito operativo del usuario**, no algo que la aplicación pueda comprobar (`docs/prompts/000-director-handoff.md`).
- **La consola, con un token de dispositivo propio** (ADR-0033, aceptada el 2026-09-25). Se emite **solo** al final de un inicio de sesión con Google que abre la propia consola (`atlas remote login`: *loopback* a `127.0.0.1` con PKCE, y una variante manual para WSL en modo NAT o SSH), **nunca desde la web**. Caduca a los 90 días, sin renovarse con el uso, bajo un techo fijo de 120 en el código; se revoca uno a uno desde la web o con `atlas remote logout`. Viaja en la cabecera `x-atlas-device-token`, solo al origen que lo emitió, por HTTPS y sin seguir redirecciones; una petición con cookie **y** token se rechaza. La API guarda solo su hash (SSM), lo comprueba en cada petición sin caché y vuelve a consultar la lista permitida; su alcance es sincronizar y leer, nunca emitir ni revocar otros tokens. Contrato en `docs/api.md`.
- **IAM de mínimo privilegio**: cada Lambda con su rol y solo los permisos que necesita.
- **Cifrado en reposo** en S3, y en tránsito por TLS.
- **Sin analítica de terceros, sin CDN externos, sin fuentes remotas.** Todo se sirve desde tu propio origen. Un script de terceros en una app financiera es una vía de exfiltración.
- **CSP restrictiva** que solo permita el propio origen y los endpoints de API necesarios.
- **Validación en el backend**, siempre. El frontend es una comodidad, no un control de seguridad.
- **Registro de auditoría**: cada escritura queda registrada con marca temporal. El versionado de S3 aporta la segunda capa.
- **Nada personal en el repositorio público**: ni dominio real, ni importes, ni entidades donde está el dinero más allá de las integraciones soportadas. Los valores reales viven en la configuración de la app y en `terraform.tfvars` ignorado.

### 10.1 Gestión de dependencias

- Lockfile fijado y comprometido en el repositorio.
- `npm audit` en CI, y revisión manual antes de cada actualización.
- **Presupuesto explícito de dependencias.** Cada paquete nuevo requiere justificación. Menos dependencias es más seguridad y más probabilidad de que compile dentro de cinco años.
- Preferir la biblioteca estándar frente a paquetes pequeños de utilidad.
- Herramientas útiles: Dependabot para avisos, y servicios de análisis de cadena de suministro para detectar paquetes comprometidos.

---

## 11. Prácticas de ingeniería

Repositorio público en GitHub, así que las prácticas son también parte del entregable.

### 11.1 Idioma

- **Todo lo técnico en inglés**: código, identificadores, comentarios, mensajes de commit, nombres de rama, nombres de fichero, infraestructura.
- **Documentos de `docs/` en español** (prosa), con los identificadores en inglés.

### 11.2 Git

- **Git flow con comandos básicos de git** (sin la extensión `git-flow`): `main` (producción), `develop` (integración), `feature/*`, `fix/*`, `release/*`, `hotfix/*`. Fusiones con `--no-ff`.
- **Pull requests obligatorias** hacia `develop` y `main`. Sin push directo. Protección de rama activada.
- **Conventional Commits**, mensajes breves, en imperativo y en inglés; solo la línea de asunto siempre que sea posible:
  `feat(ledger): add fund transfer event`
  `fix(fifo): fix lot ordering on equal dates`
  `test(tax): cover the two-month rule`
- **Ninguna herramienta de IA puede figurar como coautora ni aparecer en los mensajes de commit.**
- Commits atómicos: un cambio conceptual por commit.
- Hooks de git versionados en `.githooks/` (`core.hooksPath`): `commit-msg` valida el formato y `pre-commit` hace dos comprobaciones antes de cada commit, y cualquiera de las dos que falle lo aborta. `gitleaks` revisa lo preparado (el índice); Biome revisa la **copia de trabajo** de los ficheros preparados:
  - **`gitleaks`**, con las reglas por defecto más las del proyecto en `.gitleaks.toml`: la regla `atlas-console-device-token` reconoce el token de dispositivo de la consola (`atlasdt1.<token_id>.<secret>`, ADR-0033, `docs/api.md` §2.1) y deja pasar el `token_id` solo, que es público.
  - **Biome** en modo de comprobación (`biome check`, las mismas reglas que `npm run lint`), sobre todos los ficheros preparados, con el binario del repositorio (`node_modules/.bin/biome`). Qué ficheros trata lo decide Biome, igual que en `npm run lint`: los tipos que no conoce y las rutas que excluye `biome.json` se saltan sin error, así que un commit solo de Markdown pasa. Si no hay nada preparado, no se ejecuta. Como lee la copia de trabajo y no el índice, un fichero preparado con cambios sin preparar se comprueba tal como está en disco (el hook lo avisa): un contenido preparado mal formateado puede pasar si la copia de trabajo ya está corregida, y lo recoge la CI con `npm run lint`. Si falla, `npm run format` arregla el formato y los arreglos seguros; lo demás se corrige a mano.
  - Si falta la herramienta (`gitleaks` sin instalar, Biome sin `npm ci`, o un Biome que no arranca porque `biome --version` falla: sin `node` en el `PATH`, como cuando un cliente gráfico no carga nvm, o con `node_modules` instalado desde otra plataforma), el hook avisa y **no bloquea**. En una emergencia, `git commit --no-verify` se salta las dos comprobaciones; la CI sigue ejecutando `npm run lint`.
  - El asistente de código tiene el mismo control de los mensajes en `.claude/settings.json`.
- Plantilla de PR con la checklist de la constitución en `.github/pull_request_template.md`.

### 11.3 Entornos

> **Vigente desde ADR-0034 (2026-09-25)**, que sustituye en parte a ADR-0028: el usuario decidió no crear organización ni cuentas miembro. Hasta ese día el aislamiento era **por cuenta**; ahora es **por políticas**, dentro de una cuenta que el usuario comparte con otros proyectos.

| Entorno | Rama | Infraestructura | Datos |
|---|---|---|---|
| `dev` | `develop` | Pila `atlas-dev-*` en la cuenta compartida del usuario, **en reposo** cuando no se usa (tareas programadas desactivadas, sin las claves de precios del usuario) | Datos sintéticos |
| `prod` | `main` | Pila `atlas-prod-*` en la misma cuenta | Datos reales |

- **Aislamiento por políticas, no por cuenta**: todo recurso lleva el prefijo `atlas-<entorno>-` y las etiquetas `project=atlas` y `env=<entorno>`; SSM, bajo `/atlas/<entorno>/`; cada entorno tiene su estado de Terraform, sus roles y **un límite de permisos** que ningún rol suyo puede quitarse. «Datos de producción jamás en dev» lo garantizan **dos cerraduras independientes**: la política de cada rol de `dev`, que solo nombra recursos de `dev`, y la política del bucket de datos de `prod`, que niega a todo principal que no sea de `prod`. **Frente a quien administra la cuenta no hay aislamiento**, y los parámetros de SSM no tienen política de recurso: el riesgo que queda está escrito en ADR-0034.
- **Despliegue a producción solo desde `main`**, tras PR aprobada y CI en verde; el rol de despliegue de `prod` exige además el *environment* `prod` de GitHub con aprobación obligatoria.
- **Los artefactos que se despliegan a producción son los mismos que se validaron en dev.** Se construye una vez y se promociona; no se reconstruye por entorno.
- **Datos de producción jamás en dev.** Generador de datos sintéticos como parte del repositorio.

### 11.4 Infraestructura

- **Terraform** para todos los recursos AWS. Nada creado a mano en la consola, **salvo las excepciones declaradas por ADR-0028 y ADR-0034, cada una con su condición de retirada**: la suscripción al plan de tarifa plana de CloudFront, que tampoco se hace a mano sino con un **guion idempotente de la CLI de AWS versionado en el repositorio**, y se retira cuando el proveedor de Terraform lo soporte; el cliente OAuth de Google por entorno (ADR-0027), el *bootstrap* de Terraform, **aplicado una vez para la cuenta compartida** (ADR-0034), la activación de la etiqueta de asignación de costes `project` en Billing (ADR-0034), y la petición de aumento de cuota de concurrencia si hace falta. La organización y las cuentas miembro de ADR-0028 **no existen** (decisión del usuario del 2026-09-25).
- Estado remoto en S3 con el bloqueo nativo de S3, en **un bucket propio de Atlas** con una clave por entorno; cada rol solo alcanza la de su entorno (ADR-0034).
- Módulos reutilizables (`infra/modules/atlas/`) y una carpeta por entorno (`infra/envs/dev/`, `infra/envs/prod/`), las dos contra la misma cuenta. **Las carpetas se versionan; solo sus ficheros `.tfvars` quedan fuera del repositorio.**
- `terraform plan` obligatorio en la PR, `apply` solo tras aprobación.

### 11.5 Tests

| Nivel | Cobertura |
|---|---|
| **Unitarios** | Motor FIFO, transformaciones de lotes por evento corporativo, conversión de divisa, regla de los dos meses, cálculo de reparto mensual |
| **Integración** | API contra un `LedgerStore` en memoria o en fichero local, adaptadores de importación con extractos de ejemplo |
| **Contrato** | Parsers de extractos contra ficheros reales anonimizados guardados en el repositorio |
| **End-to-end** | Flujos críticos: registrar operación, importar extracto, calcular aportación |

**Prioridad absoluta: el motor fiscal.** Es donde un error silencioso cuesta dinero y no se detecta hasta años después. **Cobertura del 100% de líneas y ramas en `packages/domain`, bloqueante en CI**; sin umbral numérico fuera del dominio (ahí mandan los tests de contrato e integración). Casos límite explícitos (misma fecha en varios lotes, fracciones, contrasplit con liquidación en efectivo, recompra en el límite de los dos meses).

**Ficheros de ejemplo anonimizados** de cada formato de extracto, versionados en el repositorio. Cuando un bróker cambie el formato, el test falla y te enteras.

### 11.6 CI/CD

GitHub Actions:
1. Lint y formateo (Biome, ADR-0008)
2. Comprobación de tipos
3. Tests unitarios y de integración
4. `npm audit` y análisis de dependencias
5. `terraform plan`
6. Build
7. Despliegue (solo en merge a `develop` o `main`)

### 11.7 Logging por capas

| Nivel | Uso |
|---|---|
| `ERROR` | Fallo que requiere intervención: importación fallida, discrepancia de conciliación |
| `WARN` | Degradación: fuente de precios caída, precio obsoleto, umbral rozado |
| `INFO` | Eventos de negocio: operación registrada, aportación calculada, correo enviado |
| `DEBUG` | Detalle de ejecución, desactivado en producción |

- **Logs estructurados en JSON**, con `request_id` para correlacionar entre Lambdas.
- **Nunca registrar importes, posiciones ni identificadores de cuenta.** Los logs de CloudWatch son un almacén menos protegido que la base de datos; que un log filtre tu patrimonio sería absurdo.
- **Retención corta** (30 días en prod, 7 en dev). CloudWatch cobra por almacenamiento y no aporta nada tener logs de 2029.

### 11.8 Gestión de secretos

> **Ampliada desde ADR-0027, ADR-0028 y ADR-0031 (2026-09-24, Ronda 8).**

- **SSM Parameter Store** (nivel estándar, gratuito) con parámetros cifrados de tipo `SecureString`.
- Token Flex de IBKR: **solo lectura**, rotado anualmente, jamás en el frontend ni en el repositorio.
- **Secreto del cliente OAuth de Google y clave de firma de la sesión** (ADR-0027), uno por entorno: `dev` nunca acepta la cuenta de Google que da acceso a `prod`.
- **Claves de las fuentes de precios** EODHD y Alpha Vantage (ADR-0031; CoinGecko, retirada en su tercera enmienda): en local, en `~/.config/atlas/secrets.json`, **fuera del repositorio y de la carpeta del libro**, con permisos `600` (con otros permisos, la consola no las usa); en la nube, SSM. ~~Con ellas van el orden de las fuentes y su presupuesto: configuración operativa de la máquina que descarga, que ninguna cifra del libro lee.~~ El orden de las fuentes y su presupuesto **no** van con ellas, porque no son secretos: viven en `prices/config.json`, junto al libro (`docs/data-schema.md` §1).
- **Lista permitida** de `{sub, email}` de Google (ADR-0027) y **destinatario del correo** (ADR-0028): en SSM. La lista la crea y la rota el guion de secretos con el rol de administración, nunca Terraform; el destinatario sale de `terraform.tfvars`, de donde Terraform escribe también la condición de IAM de SES (ADR-0034, filas 12 y 21). No van en el repositorio porque son datos personales y el repositorio es público; y no van en `Settings` porque **ninguna cifra del libro los lee** y quien los usa es la Lambda (la API, que comprueba la lista; la que envía el correo, el destinatario): un dato personal que solo usa el servidor vive donde lo lee el servidor (principio IV). El campo `notification_email` de `Settings` se sigue aceptando al cargar (ADR-0018), pero deja de leerse; la web todavía lo ofrece en Ajustes y **se retira con la feature 016** (tareas y correo).
- **Interruptor de importes del correo** (ADR-0028, fila 18): también en SSM, junto al destinatario. No es dato personal ni secreto: es configuración operativa que ninguna cifra lee, y además un campo nuevo, que en `Settings` —una foto completa— un cliente antiguo borraría sin avisar al escribir la foto siguiente (ADR-0026, caso 6; enmienda de ADR-0018).
- **Tokens de dispositivo de la consola** (ADR-0033): en la nube, un parámetro `SecureString` estándar por token bajo `/atlas/<entorno>/device-tokens/<id>`, con **solo el hash** del secreto, el par `{sub, email}`, el nombre, el dispositivo, la emisión, la caducidad y la revocación; se escribe solo al crearlo y al revocarlo, y la API nunca lo borra. **No va en el bucket de datos**, que se copia y se restaura: una restauración podría reactivar tokens revocados. En local, el token vive en `~/.config/atlas/credentials.json` (o `$XDG_CONFIG_HOME/atlas/`), hermano de `secrets.json` y con sus mismas reglas (`600`, fuera de la carpeta del libro, nunca en una copia, exportación ni sincronización), pero **lo escribe la consola**. En WSL, el `600` no protege frente a un proceso de Windows del mismo usuario; es el mismo límite que ya tienen `secrets.json` y la réplica del libro.
- Sin secretos en variables de entorno de la Lambda visibles en la consola.
- `.gitignore` estricto y escaneo de secretos en CI.

### 11.9 Documentación

- `README` con arranque en local, arquitectura y despliegue.
- Licencia **MIT** (`LICENSE`).
- Versionado: etiquetas `vX.Y.Z` en `main` al cerrar cada `release/*`; `CHANGELOG.md` escrito a mano en la rama de release, sin herramienta de generación.
- **ADRs** (registros de decisión de arquitectura) en `docs/adr/` para las decisiones importantes: lenguaje, almacenamiento, modelo del libro, por qué modelo propio, por qué aproximación por ETF.
- **El esquema de datos documentado en el repositorio**, incluida la lógica de transformación de lotes de cada evento corporativo.

---

## 12. Supervivencia a 20 años

Requisitos que no son técnicos pero deciden si el sistema sigue vivo en 2046:

- **Exportación completa a CSV/JSON en un clic**, en cualquier momento y sin depender del código.
- **El libro mayor debe ser legible sin la aplicación.** Si el proyecto muere, los datos siguen siendo utilizables.
- **Documentar el esquema** en el propio repositorio, incluida la lógica de transformación de lotes de cada tipo de evento.
- **Cero dependencia de servicios de pago de terceros** en el camino crítico. Si una fuente de precios cierra, se introduce el precio a mano y no pasa nada.
- **Prueba de restauración anual**: reconstruir el sistema desde cero con el backup y verificar que cuadra. Va en la revisión anual del plan.
- **Idempotencia**: registrar dos veces la misma operación debe detectarse, no duplicarse.

---

## 13. Fases

**Estado a 2026-09-23:** entregadas las fases 1, 2, 3 y 5, más la aplicación web entera. Sin empezar: la Fase 4 (automatización) y toda la infraestructura en la nube; los datos viven en un fichero local o en el navegador.

**Fase 0 — Validación (antes de escribir nada)**
1. **Pasar la cuenta AWS al Paid Plan** y configurar alerta de presupuesto en 1$.
2. Probar la Flex Query de IBKR: configurar un informe, descargarlo por API, ver qué campos trae realmente.
3. Descargar los tipos de cambio del BCE y verificar formato e histórico disponible.
4. Probar el scraping de Yahoo desde una Lambda real, no desde tu máquina. Es donde se verá si las IPs de AWS están bloqueadas.
5. Exportar un extracto de MyInvestor y ver qué formato y qué campos ofrece.
6. Leer los esquemas de Beancount y Ghostfolio antes de diseñar el propio.

**Fase 1 — Libro mayor (el núcleo del valor)**
Modelo de datos, alta de operaciones, cálculo de posiciones, FIFO, traspasos, eventos corporativos. Sin interfaz bonita: una CLI o una página mínima. **Si solo se construye esto, el sistema ya cumple.**

**Fase 2 — Aportación mensual**
Calculadora de reparto, desviaciones, aviso de umbrales.

**Fase 3 — Cubo**
Registro de tesis, posiciones abiertas, métricas frente al índice, gráficas y comparativas, reglas de control.

**Fase 4 — Automatización**
Lambdas programadas, correos, precios automáticos.

**Fase 5 — Motor fiscal**
FIFO consolidado, conversión de divisa por fecha valor, regla de los dos meses, dividendos y doble imposición, salida agregada por casilla.

**Entregada** (features 008, 009 y 010): las previsiones del esquema (ADR-0021); el ejercicio consolidado con la regla de recompra aplicada, la compensación del art. 49 y el arrastre a cuatro ejercicios; la constancia de lo declarado (`tax_return_filed`, ADR-0020) con la comparación entre lo presentado y lo calculado y el aviso al escribir en un ejercicio cerrado; la Renta ordenada **por casillas del Modelo 100 del ejercicio**, con 2025 como único año comprobado; los Modelos 720 y 721 con su veredicto a prueba de datos incompletos; y las dos salidas, `atlas tax`, `atlas m720`, `atlas m721` y `atlas filed` en la consola y la pantalla `/fiscal` en la web. Lo que **no** hace: no calcula la cuota, y ninguna cifra fiscal mira un precio de mercado salvo la valoración a 31/12 de los modelos informativos, que es dato de Nivel 1.

**Orden deliberado:** el motor fiscal va al final porque no se necesita hasta la primera declaración, pero **el modelo de datos de la Fase 1 tiene que soportarlo desde el primer día**. Si los lotes o los traspasos se modelan mal, la Fase 5 obliga a rehacer todo.

---

## 14. Decisiones abiertas

- [x] **¿Svelte o Solid?** **Solid** (ADR-0017, 2026-09-18).
- [x] **¿DynamoDB, o JSON en S3 con versionado?** S3 (ADR-0002).
- [ ] **Umbrales del cubo (reglas 17 y 18)**: dependen de la conversación P3 del plan financiero.
- [ ] **Pesos objetivo**: dependen de la decisión P1 del plan financiero.
- [ ] **¿Qué ETF de referencia para cada fondo?** Depende de P2 del plan financiero.
- [ ] **Nivel de importación automática de IBKR**: diaria automática frente a bajo demanda. Empezar bajo demanda y automatizar cuando el parser esté probado.

### 14.1 Pendientes de la revisión de agosto de 2026

Puntos detectados al revisar la especificación. Sin decidir todavía; cada uno merece una conversación y, si procede, un ADR.

- [x] **Lenguaje del backend**: TypeScript en todo, dominio compartido (ADR-0001). Trampa derivada: los importes se serializan como cadenas, nunca como números JSON.
- [x] **Corrección de errores de registro**: libro append-only con rectificación; lotes como proyección (ADR-0003).
- [x] **Posición de efectivo.** Decidido (ADR-0004): saldo derivado por cuenta de inversión; el colchón bancario queda fuera de la app.
- [x] **Retención a cuenta en reembolsos de fondos.** Hecho: `sell.withholding` (`data-schema.md` §6.2), con su equivalente por cuenta en `forced_sale` (§6.5). Sale del efectivo que entra, no toca el valor de transmisión ni el coste de los lotes, y la salida fiscal la suma a las retenciones del ejercicio (criterio #12).
- [x] **Valoración a 31 de diciembre.** Resuelta como se preveía (feature 010): los Modelos 720 y 721 valoran con la `valuation` registrada a mano, dato de **Nivel 1**, convertida al tipo del BCE de esa fecha. Es la única ruta fiscal que lee precios; si falta alguno, el veredicto es «no se puede determinar» y nunca «no obligado» (§5.8 de `business-rules.md`).
- [x] **Despliegue desde GitHub Actions con OIDC**, sin claves de AWS de larga duración en el repositorio. Resuelto (ADR-0028, 2026-09-24; cuenta compartida desde ADR-0034, 2026-09-25): un rol de despliegue por entorno en la misma cuenta, que solo puede crear roles con el límite de permisos de su entorno; el de `dev` solo desde `develop`, el de `prod` solo desde el *environment* `prod` con aprobación obligatoria, y un rol de `terraform plan` de solo lectura que nunca se usa para una PR desde un *fork*.
- [x] **Tests de propiedades** para el motor FIFO. Hecho con `fast-check` en `packages/domain/test/properties/`: los lotes abiertos igualan la posición física por activo, proyectar dos veces da lo mismo y el diario reconstruye cada lote y cada ganancia, y `scale` seguido de su inverso deja lotes y posiciones idénticos.
- [x] **Reconsiderar DynamoDB frente a JSONL en S3**: S3 (ADR-0002).
- [ ] **Esqueleto del repositorio**: `docs/adr/`, `docs/data-schema.md`, `LICENSE`, `.editorconfig`, CI, escaneo de secretos. Está todo salvo **`.editorconfig`, que no existe**; el escaneo de secretos es `gitleaks` en `.githooks/pre-commit`, local por clon y no en CI.
- [x] **Protección de ramas** en GitHub para `main` y `develop` (hecho por el usuario).
- [x] **Revisión externa (*challenge*) del 2026-08-30**: diez hallazgos aplicados (ADR-0012, ADR-0013, `docs/data-schema.md`); preguntas al asesor consolidadas en `docs/fiscal-questions.md`.
