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

El **efectivo en divisa** se valora con **el más reciente de dos tipos del BCE**: el último del histórico descargado hasta esa fecha y el último que conoce el libro (con la misma fecha, el del histórico). Así un histórico sin actualizar no tapa un tipo más nuevo del libro. Cada fila dice la fecha y el origen del tipo, y un tipo caducado se avisa **una vez por divisa**, con la fecha del tipo usado (prueba real del 2026-09-27). Es una valoración informativa: ningún cálculo fiscal la lee, y la fiscalidad sigue usando solo el tipo del BCE de su fecha fiscal, guardado en el libro.

---

## 4. Modelo de datos

### 4.1 Entidades

**Magnitudes numéricas (ADR-0005):** importes, cantidades y tipos de cambio son decimales exactos (`big.js` vendorizada, envuelta en `Money`, `Quantity`, `Price`, `FxRate`), serializados como **cadenas** en JSON. Se guarda lo que dice el bróker sin truncar; se redondea a céntimos solo en la salida fiscal (half-up) y en pantalla, una vez por operación.

**Account** (cuenta)
`id`, `name`, `platform`, `book`, `base_currency`, `country` (para el Modelo 720), `active`

El saldo de efectivo de cada cuenta (`cash_balance`) es **derivado**: resulta de `cash_deposit`, `cash_withdrawal`, compras, ventas, dividendos y comisiones. Se usa para conciliar con el bróker y para la vista de patrimonio. No hay cuentas bancarias puras: el colchón se gestiona fuera de la app (ADR-0004).

**Asset** (activo)
`id`, `type` (`fund` | `etf` | `etc` | `etp` | `stock` | `crypto` | `money_market`), `book`, `asset_class` (solo `core`: `equity` | `fixed_income` | `gold` | `crypto`), `isin`, `ticker`, `name`, `currency`, `ter`, `transferable` (bool; solo surte efecto en `fund` y `money_market`, business-rules.md §5.2), `reference_etf_id` (solo fondos, ver §7), `active` (bool)

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

**`alert_channels{}` no existe y no entra en §7.** Qué avisa por correo y qué se queda solo en la interfaz lo decide hoy el código de las tareas (feature 016): cada aviso tiene su canal fijo (§9.5). Si algún día se configura, **vive fuera del libro, junto al destinatario del correo**, en SSM (ADR-0028, ADR-0034): es configuración operativa que ninguna cifra del libro lee (constitución, principio IV, enmienda 1.6.0), y en `Settings`, que es una foto completa, un cliente antiguo la borraría al escribir la foto siguiente. **Nunca en `docs/business-rules.md` §7.**

### 5.2 Requisitos

- **Historial de cambios de configuración.** Cambiar los pesos objetivo altera el cálculo de desviaciones históricas; hay que poder saber qué valores estaban vigentes en cada momento. Se cumple porque cada cambio es un evento `settings_changed` del libro (ADR-0006).
- **Validación**: los pesos objetivo deben sumar 100%. Los umbrales deben ser coherentes entre sí.
- **Aviso al cambiar**: modificar un umbral que está silenciando una alerta activa debe advertirlo explícitamente. Es la protección frente a subir el listón para no oír la alarma.

---

## 6. Funcionalidad por libro

### 6.1 Núcleo

Funcionalidad común a las cuatro clases de activo:

- Posición actual por activo y por clase: valor, peso real, peso objetivo, desviación en puntos porcentuales.
- **Calculadora de aportación mensual**: dado el importe del mes (menos el presupuesto del cubo), reparte por nivel: primero al activo más lejos de su peso, hasta igualarlo con el siguiente (regla 2). Dice también cuánto ingresar en cada plataforma, qué comprar en ella y la comisión estimada, que sale del libro y va aparte del importe del mes.
- **Rebalanceo** («Rebalancear» en la web): propone, por este orden, dinero nuevo, traspasos entre fondos y ventas, con el impuesto aproximado y las comisiones delante y lo que queda si se para en cada paso. Solo si algún activo supera el umbral (reglas 3 y 4). Nunca toca el cubo y nunca escribe. Se carga bajo demanda (`@atlas/domain/rebalance`) porque lleva el motor fiscal.
- **Aviso de desviación** si algún activo supera el umbral (regla 3).
- Histórico de aportaciones y evolución del valor, total y por clase.
- TER medio ponderado del núcleo y coste anual estimado en euros. El promedio cuenta solo los activos con TER declarado y dice cuánto valor de la cartera valorada queda fuera, en vez de contarlo como TER 0.
- Exposición del núcleo por divisa y por región (`exposure`): el valor del núcleo repartido según la exposición de cada activo (porcentajes que suman 100; `currency` de un activo es su divisa de cotización, no su exposición). El dueño no tiene que saber esos porcentajes: por activo y dimensión manda lo que él escriba, si no el perfil de su índice (elegido en `index` o propuesto por el ISIN o la clase; oro y cripto son USD y `global` por definición), marcado «por defecto» con índice, fondo y fecha, y el total cuenta cuántos activos van por defecto, propios y sin propuesta (`docs/business-rules.md`, «Exposición por divisa y región»). Sin dato no se estima: si un activo con valor no tiene ni lo uno ni lo otro, esa dimensión no da reparto y lista los activos. El cubo no entra, ni el efectivo del núcleo (no está en `coreWeights`; incluirlo exige valorar cada saldo en divisa a euros): la exposición cubre las posiciones, no el efectivo. Se guarda **fuera del libro** (ADR-0018), en `settings/exposure.json` del bucket de datos, que escribe solo la API (`docs/api.md` §6.2, `docs/data-schema.md` §1); un objeto ilegible o inválido es «sin dato».
- **Rentabilidad** (`coreXirr`, `classReturns`): lo aportado, lo que vale y lo ganado, la rentabilidad anual ponderada por dinero (total y por clase) y la real descontando el IPC (`spanishCpiPct`) y, junto a la de antes y sin sustituirla, la **estimada después de impuestos** (`coreXirrAfterTax`, criterio #29 y `business-rules.md` §5.1), que se carga aparte y dice que el año en curso no lleva impuesto hasta que se cierra. Sin precio, sin el IPC de un año o con operaciones que no modela, la cifra no se enseña y se dice qué falta. En la web, en Cartera, con los importes tapados en modo privacidad y los porcentajes a la vista.
- Proyección a N años con escenarios (`projection`; N entero de 0 a 100, el mismo tope que `totalCost`, `MAX_HORIZON_YEARS`): el valor actual del núcleo más la aportación mensual de los ajustes (sin la parte del cubo), con rentabilidad por clase que escribe el dueño para cada escenario, mezclada con los pesos objetivo. Sin rentabilidad por defecto: el escenario al que le falte la de una clase con peso no da cifra y dice cuál. Opcional, un patrimonio objetivo y el mes en que se alcanza. El valor de hoy crece con la rentabilidad mezclada con los pesos **objetivo**, no con los reales: un núcleo desviado se proyecta como si ya estuviera en el objetivo. Sin precio de algún activo del núcleo, con pesos que no suman 100 o sin aportación o porcentaje del cubo en los ajustes, no da cifra y dice cuál falta. Informativa, no es una previsión. En la web, en Cartera; los supuestos y los escenarios (hasta tres) se teclean en la pantalla y no se guardan.
- Coste total a 20 años (`totalCost`): TER, comisiones y fricción fiscal de venta proyectados en euros sobre el núcleo, con supuestos editables (rentabilidad bruta, horizonte, comisión, tipo de salida). Usa la aportación y el porcentaje del cubo de los ajustes. Solo proyecta el valor con TER declarado (dice cuánto deja fuera). La fricción fiscal es un tipo plano sobre la ganancia frente a lo invertido: orden de magnitud, no el impuesto del motor fiscal. Sin precio de algún activo del núcleo no da cifra; lo que falta (aportación, comisión, tipo) se dice, no se inventa. En la web, en Cartera junto a *Costes*; los supuestos se teclean en la pantalla y no se guardan.
- Coste acumulado en comisiones por activo, en euros y como porcentaje de lo invertido; la comisión de una permuta (`swap`) se imputa al activo recibido.

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

> **Vigente desde ADR-0031 (2026-09-24, Ronda 8).** Yahoo Finance, Stooq y Morningstar quedan **descartados**: las condiciones de Yahoo prohíben por escrito el acceso automatizado, Stooq responde con un reto anti-*bot* y Morningstar solo ofrece API de empresa (investigación del 2026-09-24). Las fuentes de precio de cierre diario es una API gratuita con clave: **EODHD**. **CoinGecko y OpenFIGI quedaron retirados al cerrar la feature 013** (ADR-0031, tercera enmienda): las condiciones de CoinGecko describen su plan gratuito como para probar, y OpenFIGI no documenta qué bolsa es cada código. La tabla de abajo queda como referencia histórica salvo las filas corregidas.

| Dato | Fuente | Fiabilidad | Riesgo |
|---|---|---|---|
| Acciones, ETFs, ETCs | **EODHD**, API con clave gratuita (ADR-0031) | Buena | Cupo diario (20 llamadas) y condiciones de uso de una API gratuita |
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

- **Cascada de respaldo**: EODHD → último valor conocido con su antigüedad → entrada manual. ~~La entrada manual gana siempre.~~ **Para enseñar un valor, gana el dato de fecha más reciente, y con la misma fecha la valoración manual**, siempre entre los precios que tienen valor en euros (ADR-0031, segunda y tercera enmiendas). El Modelo 720 y toda ruta fiscal siguen leyendo solo la valoración manual.
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

Este apartado enuncia la forma de la plataforma; el porqué y los detalles están en los ADR y en [`api.md`](api.md).

### 9.1 Decisión: AWS

Frontend estático en S3 y backend en Lambda, con Terraform para toda la infraestructura. «Estático» se refiere solo al frontend: hay backend real para la API y las tareas programadas, y se elimina el servidor de renderizado. Se descartaron Vercel (sin base de datos, cron limitado) y un VPS (mantener un servidor durante 20 años). La cuenta, la línea base de seguridad y el coste mínimo con alarma de presupuesto están en ADR-0028 y ADR-0034.

### 9.2 Componentes

**Atlas es siempre en la nube (ADR-0035).** El libro de S3 (`ledger/ledger.jsonl`) es la única fuente de verdad: la web escribe directamente contra la API con `If-Match`, sin cola local y sin libro en el dispositivo; la API es el único escritor y solo añade ([`api.md`](api.md) §5.8). **La consola no tiene acceso propio a la API** (ADR-0037): trabaja sobre una carpeta local (`ledger.jsonl`) y llega a la nube solo como administración, con el rol de AWS y MFA (`atlas admin pull|compact|restore`, [`cli.md`](cli.md)).

```
Navegador (PC / móvil)      Consola (`atlas`): solo administración,
    │                        con el rol de AWS y MFA, directa a S3 (ADR-0037)
    └── CloudFront  <dominio de la app>   [plan Free de tarifa plana + WAF]
           │
           ├── /*      ──── S3 (SPA estática, privada vía OAC)
           │
           └── /api/*  ──── Lambda Function URL ─── Lambda (API) ─── S3 (datos: libro mayor
                            (AuthType=AWS_IAM; OAC firma                JSONL versionado, precios,
                             la petición; la Lambda verifica            histórico del BCE,
                             la sesión propia o el ID token             documentos; nunca origen
                             de Google)                                 de CloudFront)

EventBridge Scheduler ─── Lambdas programadas (cinco, un solo artefacto) ─── SES (solo la función de correo)
                                │
                                └── SSM Parameter Store (secretos, lista permitida, claves de precios,
                                    destinatario del correo)
```

Decisiones deliberadas para minimizar coste y servicios, cada una en su ADR:

- Lambda Function URL en vez de API Gateway, alcanzada solo a través de CloudFront bajo `/api/*` (mismo origen: sin CORS) (ADR-0028, fila 6).
- Acceso solo con Google, verificado en la propia Lambda; sin Cognito ni Lambda@Edge (ADR-0027, [`api.md`](api.md) §3).
- SSM Parameter Store estándar en vez de Secrets Manager (ADR-0028, ADR-0034).
- DNS en el registrador (un CNAME), sin Route 53; certificado ACM en us-east-1. El dominio real vive en `terraform.tfvars`, fuera del repositorio (ADR-0028).
- S3 como único almacén: un `ledger/ledger.jsonl` con todos los eventos, escritura condicional y versionado del bucket como historial y copia (ADR-0002, ADR-0006, [`data-schema.md`](data-schema.md)).
- Plan Free de tarifa plana de CloudFront como cortafuegos (ADR-0028).

### 9.3 Costes

Restricción: **coste mínimo con alarma de presupuesto**, no «always-free indefinido» (constitución VI, ADR-0028). Estimación de ≈ 0,01-0,05 $/mes, cubierta por los créditos de la cuenta mientras duren y pagada después. Una alarma de AWS Budgets, `atlas-cost`, avisa por correo a 1 $, medida antes de créditos y filtrada por la etiqueta `project=atlas` (ADR-0028, ADR-0034). Los niveles gratuitos de Lambda, SSM y CloudFront son por cuenta y se comparten con los otros proyectos de ella (ADR-0034). Las fuentes de precios (EODHD) son un plan gratuito con cupo diario (ADR-0031).

### 9.4 Cuenta en el Paid Plan

En el Free Plan de AWS (cuentas nuevas desde julio de 2025) la cuenta se cierra sola, sin factura previa, al agotar los créditos o a los seis meses; quedan 90 días para pasar al Paid Plan y recuperar los datos. Atlas se despliega en una cuenta que el usuario **ya tiene en el Paid Plan** y comparte con otros proyectos (ADR-0034), así que no hay organización ni cuentas miembro. Los detalles de la trampa del Free Plan y de la suscripción al plan de tarifa plana de CloudFront están en ADR-0028 y ADR-0034 y en [`runbooks/bootstrap-and-ci.md`](runbooks/bootstrap-and-ci.md).

### 9.5 Lambdas programadas

Construidas (feature 016) y sin desplegar todavía: la infraestructura es de la 017 y la prueba contra AWS real, de la 018 ([`decision-roadmap.md`](decision-roadmap.md)). EventBridge Scheduler despierta **una vez al día** a cada una de las cinco funciones (`apps/jobs`, un solo artefacto), en hora de Madrid; el dominio decide qué tarea toca según su periodo y `job_frequencies`. Cada tarea deja un registro por periodo en `jobs/<familia>/<tarea>/<periodo>.json` ([`data-schema.md`](data-schema.md) §1). **Solo la función de correo envía**; las demás dejan sus hallazgos y `dispatch_findings` los avisa una vez por racha.

| Función (hora de Madrid) | Tarea | `job_frequencies` (por defecto, primero) | Notifica |
|---|---|---|---|
| `job-ecb` (17:15) | Histórico del BCE, con el calendario TARGET como comprobación (ADR-0029) | `ecb`: `daily`, `weekly` | Solo con un hallazgo |
| `job-prices` (07:00) | Precios de cierre: EODHD; nunca escribe `prices/symbols.json` (ADR-0031). Cada llamada, 15 s de tope, sin seguir redirecciones (la clave va en la dirección) y leyendo como mucho 8 MiB | `prices`: `daily`, `weekly` | Solo con un hallazgo (fuente caída, correspondencias sin contrastar, horizonte de una tesis vencido) |
| `job-backup` (03:15) | Volcado mensual a `backups/<YYYY-MM>/` (ADR-0032) | `backup`: `monthly` (fijo) | Solo si falla o queda incompleto |
| `job-integrity` (04:15) | Errores de `atlas check --deep`, ensayo de restauración en memoria y tamaño del libro (ADR-0032) | `integrity`: `quarterly`, `monthly` | Solo con errores |
| `job-mail` (08:00) | Recordatorio mensual: reparto de la aportación (sin importes salvo que se active, ADR-0028), días desde el último inicio de sesión en la web, si una compra del plan cae en la ventana de recompra (sin nombres) y los plazos de la Renta del mes (junio y, si se pagó en dos plazos, noviembre) | `reminder`: `monthly` (fijo) | **Siempre, al menos una vez** |
| `job-mail` | Revisión de desviaciones de los pesos del núcleo por clase y reglas 17 y 18 del cubo | `review`: `weekly`, `monthly` | Solo si se pasa un umbral, como mucho una vez por periodo |
| `job-mail` | Datos de la Renta y modelos 720 y 721 (enero); el de la Renta dice además qué falta añadir a mano (IPC del año, perfiles de índice con ficha de más de un año) | `tax_return` y `informative_thresholds`: `yearly` (fijos) | Una vez, sin cifras ni base |
| *(bloqueadas, Ronda 6)* | Importación diaria de IBKR y conciliación semanal | `reconciliation`: reservada | — |

`job_frequencies` es un conjunto cerrado de claves y valores, sin `off`: apagar un aviso es silenciar una alarma (constitución IV) y el recordatorio mensual llega siempre (constitución V); se lee con tolerancia ([`business-rules.md`](business-rules.md) §7). El recordatorio se envía al menos una vez y los demás avisos como mucho una vez; un periodo que ya pasó se cierra `expired` sin enviar. El correo mensual siempre llega y los demás solo cuando hay algo que hacer: un sistema que envía correos rutinarios acaba filtrado. El destinatario tiene una sola fuente, `terraform.tfvars`, fuera del repositorio (ADR-0028, ADR-0034; [`runbooks/mail-recipient-and-amounts.md`](runbooks/mail-recipient-and-amounts.md)). Ninguna hora cae entre las 02:00 y las 03:00 de Madrid, por el cambio de hora, y la condición de invalidación de una tesis es texto libre y no avisa. Todos los correos salen de una sola pieza de composición (`packages/domain/src/jobs/mail/layout.ts`): título, avisos, secciones y pie, en dos versiones que SES envía juntas, texto (de respaldo, sin columnas alineadas con espacios) y HTML sencillo con los colores de la dirección A, estilos en línea, sin imágenes ni fuentes remotas y con un único enlace, el origen de la aplicación sin parámetros. Las fechas van como 20/10/2026 y los periodos con su nombre («octubre de 2026», «la semana 45 de 2026»); el asunto, en ASCII. Qué hacer con cada aviso: [`runbooks/`](runbooks/README.md).

### 9.6 Frontend

SPA estática (Vite + Solid, ADR-0017; base de estilos propia, ADR-0023) servida desde S3 por CloudFront. **Cloud-only (ADR-0035):** entra con Google, descarga el libro al arrancar y escribe directamente con `If-Match`; no guarda libro, borradores ni cierres en el dispositivo (solo el *shell*, preferencias y la copia pública del histórico del BCE). Sin conexión muestra solo «Sin conexión» con «Reintentar». Si dos sitios registran a la vez, el segundo recarga y confirma de nuevo. «Descargar copia» baja el libro (JSONL y CSV).

Requisitos transversales:

- Responsive real: la misma interfaz en PC y móvil, sin funcionalidad recortada.
- **Modo privacidad**, activado por defecto: oculta importes y cantidades con una máscara de ancho fijo que conserva la unidad; porcentajes y formas de gráficas siguen visibles. Lo que el usuario escribe no se oculta ([`design/brief.md`](design/brief.md)).
- Modo de solo lectura por defecto; registrar operaciones requiere acción explícita.
- Un único sistema de componentes y tokens, en [`design/system.md`](design/system.md).

---

## 10. Seguridad

Son datos financieros personales completos: nivel de exigencia alto. Las decisiones están en ADR-0026, ADR-0027, ADR-0028, ADR-0034 y ADR-0037; el contrato de acceso, en [`api.md`](api.md) §2 y §3.

- **Nunca se almacenan credenciales de brókers.** Los secretos van en SSM como `SecureString`, nunca en el frontend ni en el repositorio (§11.8).
- **S3 privado**, servido solo vía CloudFront con Origin Access Control; el bucket de datos nunca es origen de CloudFront.
- **Acceso solo con Google**, verificado en la propia Lambda con PKCE y `state`, lista permitida de `{sub, email}` en SSM y sesión propia en una cookie `__Host-` firmada (ADR-0027).
- **La consola no tiene acceso propio a la API**: solo administración, con credenciales cortas de AWS y MFA. Desde Ajustes se pueden **cerrar a la vez las sesiones de todos los dispositivos** (ADR-0037).
- IAM de mínimo privilegio, un rol por Lambda; cifrado en reposo y TLS en tránsito.
- Sin analítica de terceros, CDN externos ni fuentes remotas; CSP restrictiva que solo permite el propio origen.
- Validación siempre en el backend: el frontend es comodidad, no control de seguridad.
- Registro de auditoría: cada escritura queda con marca temporal y el versionado de S3 aporta la segunda capa.
- Nada personal en el repositorio público (dominio real, importes); los valores reales viven en la configuración de la app y en `terraform.tfvars`, ignorado.

### 10.1 Gestión de dependencias

Lockfile comprometido, `npm audit` en CI, revisión manual antes de actualizar y **presupuesto cerrado de dependencias** ([`dependencies.md`](dependencies.md)): cada paquete nuevo requiere justificación y se prefiere la biblioteca estándar.

---

## 11. Prácticas de ingeniería

Repositorio público en GitHub, así que las prácticas son también parte del entregable. Las reglas operativas están en `CLAUDE.md` y en la constitución; aquí, el enunciado.

### 11.1 Idioma

Todo lo técnico en inglés (código, comentarios, commits, ramas, ficheros, infraestructura); la prosa de `docs/` en español, con los identificadores en inglés.

### 11.2 Git

- Git flow con comandos básicos (`main`, `develop`, `feature/*`, `fix/*`, `release/*`, `hotfix/*`), fusiones con `--no-ff`; commits atómicos, Conventional Commits en inglés y sin coautoría de herramientas de IA.
- Pull requests obligatorias hacia `develop` y `main`, sin push directo: `main` tiene protección de rama en GitHub (PR con una aprobación, sin comprobaciones obligatorias); `develop` no está protegida y el «sin push directo» es disciplina (`CLAUDE.md`).
- Hooks versionados en `.githooks/` (`core.hooksPath`): `commit-msg` valida el formato y `pre-commit` ejecuta `gitleaks` (reglas por defecto más las de `.gitleaks.toml`, entre ellas la del antiguo token de dispositivo de ADR-0033) y `biome check` sobre los ficheros preparados. Si falta la herramienta, el hook avisa y no bloquea; la CI sigue ejecutando `npm run lint`.
- Plantilla de PR con la lista de la constitución en `.github/pull_request_template.md`.

### 11.3 Entornos

`dev` (rama `develop`) y `prod` (rama `main`) son dos pilas en **una cuenta de AWS compartida** con otros proyectos (ADR-0034): el aislamiento es por políticas (prefijo `atlas-<entorno>-`, etiquetas `project=atlas` y `env`, SSM bajo `/atlas/<entorno>/`, un estado de Terraform y un límite de permisos por entorno), no por cuenta. `dev` está en reposo cuando no se usa y solo lleva datos sintéticos. A producción se despliega solo desde `main`, tras PR aprobada y CI en verde, con el *environment* `prod` de GitHub con aprobación; el artefacto es el mismo que se validó en `dev` (se construye una vez y se promociona). Datos de producción jamás en `dev`.

### 11.4 Infraestructura

Terraform para todos los recursos AWS, sin nada creado a mano salvo las excepciones de ADR-0028 y ADR-0034, cada una con su condición de retirada. Estado remoto en un bucket propio de Atlas con una clave por entorno (ADR-0034); módulos en `infra/modules/atlas/` y una carpeta por entorno en `infra/envs/` (solo los `.tfvars` quedan fuera del repositorio). `terraform plan` en la PR y `apply` solo tras aprobación.

### 11.5 Tests

Unitarios (FIFO, transformaciones de lotes, divisa, regla de los dos meses, reparto mensual), de integración (API contra un `LedgerStore` en memoria o fichero), de contrato (parsers contra extractos anonimizados) y de extremo a extremo (flujos críticos). **Prioridad absoluta: el motor fiscal.** Cobertura del 100 % de líneas y ramas en `packages/domain`, bloqueante en CI; sin umbral fuera del dominio. Casos límite explícitos en `CLAUDE.md`. Los extractos de ejemplo son sintéticos y están versionados.

### 11.6 CI/CD

GitHub Actions: lint y formato (Biome, ADR-0008), tipos, tests, `npm audit`, `terraform plan`, build y despliegue (solo al fusionar en `develop` o `main`).

### 11.7 Logging por capas

Niveles `ERROR` (requiere intervención), `WARN` (degradación), `INFO` (eventos de negocio) y `DEBUG` (desactivado en producción), en JSON con `request_id`. **Nunca se registran importes, posiciones ni identificadores de cuenta**, ni tokens, correos o `sub` de Google (ADR-0027, ADR-0028). Retención de 30 días en producción y 7 en `dev`.

### 11.8 Gestión de secretos

Todo en SSM Parameter Store estándar como `SecureString`; los valores nunca pasan por Terraform: un guion versionado, con el rol de administración, los crea y rota (ADR-0034, fila 21). Qué guarda y dónde:

- Token Flex de IBKR, solo lectura (cuando haya importador).
- Secreto del cliente OAuth de Google y clave de firma de la sesión, uno por entorno (ADR-0027).
- Claves de las fuentes de precios: en local, `~/.config/atlas/secrets.json` (`600`, fuera del repositorio y del libro); en la nube, SSM (ADR-0031).
- Lista permitida de `{sub, email}` y destinatario del correo (que sale de `terraform.tfvars`) y el interruptor de importes del correo, en SSM (ADR-0028, ADR-0034).
- Sin secretos en variables de entorno de la Lambda; `.gitignore` estricto y escaneo de secretos.

### 11.9 Documentación

`README` con arranque en local; licencia MIT; etiquetas `vX.Y.Z` en `main` al cerrar cada `release/*` y `CHANGELOG.md` a mano; ADR en `docs/adr/` para las decisiones importantes; esquema de datos en el repositorio, con la lógica de transformación de lotes de cada evento corporativo.

---

## 12. Supervivencia a 20 años

Requisitos que no son técnicos pero deciden si el sistema sigue vivo en 2046:

- **Exportación completa a CSV/JSON en un clic**, en cualquier momento y sin depender del código.
- **El libro mayor debe ser legible sin la aplicación.** Si el proyecto muere, los datos siguen siendo utilizables.
- **Documentar el esquema** en el propio repositorio, incluida la lógica de transformación de lotes de cada tipo de evento.
- **El uso diario depende de AWS** (coste mínimo, con alarma de presupuesto) **y del acceso con Google** (ADR-0035, constitución 2.0.0, principio VI). **La supervivencia no depende de ellos**: el libro se descarga en un clic («Descargar copia»), `atlas backup` hace copias verificadas fuera de AWS (junto con el volcado mensual a `backups/`, que vive en AWS), y la consola trabaja sobre una copia local sin ningún servicio. Los dispositivos ya no guardan una réplica: esas dos son **las únicas copias fuera de AWS**, y el correo mensual lo recuerda. Si una fuente de precios cierra, se introduce el precio a mano y no pasa nada.
- **Prueba de restauración anual**: reconstruir el sistema desde cero con el backup y verificar que cuadra. Va en la revisión anual del plan.
- **Idempotencia**: registrar dos veces la misma operación debe detectarse, no duplicarse.

---

## 13. Fases

**Estado a 2026-10-24:** entregadas las fases 1, 2, 3 y 5, la aplicación web contra la nube (ADR-0035) y la consola, local y de administración (ADR-0037). La Fase 4 y la infraestructura están en código y probadas con dobles, **sin desplegar** (018 y 019).

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

**En código, sin desplegar** (feature 016, fusionada el 2026-09-28): las cinco funciones programadas, el correo y los precios y el histórico del BCE de la nube (§9.5). La infraestructura es de la 017 y la prueba contra AWS real, de la 018 (`docs/decision-roadmap.md`).

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
- [x] **Valoración a 31 de diciembre.** Resuelta como se preveía (feature 010): los Modelos 720 y 721 valoran con la `valuation` registrada a mano, dato de **Nivel 1**, convertida al tipo del BCE de esa fecha (en una IIC, su valor liquidativo: criterio #11). Es la única ruta fiscal que lee precios; si falta alguno, el veredicto es «no se puede determinar» y nunca «no obligado» (§5.8 de `business-rules.md`).
- [x] **Despliegue desde GitHub Actions con OIDC**, sin claves de AWS de larga duración en el repositorio. Resuelto (ADR-0028, 2026-09-24; cuenta compartida desde ADR-0034, 2026-09-25): un rol de despliegue por entorno en la misma cuenta, que solo puede crear roles con el límite de permisos de su entorno; el de `dev` solo desde `develop`, el de `prod` solo desde el *environment* `prod` con aprobación obligatoria, y un rol de `terraform plan` de solo lectura que nunca se usa para una PR desde un *fork*.
- [x] **Tests de propiedades** para el motor FIFO. Hecho con `fast-check` en `packages/domain/test/properties/`: los lotes abiertos igualan la posición física por activo, proyectar dos veces da lo mismo y el diario reconstruye cada lote y cada ganancia, y `scale` seguido de su inverso deja lotes y posiciones idénticos.
- [x] **Reconsiderar DynamoDB frente a JSONL en S3**: S3 (ADR-0002).
- [ ] **Esqueleto del repositorio**: `docs/adr/`, `docs/data-schema.md`, `LICENSE`, CI, escaneo de secretos. El formato lo impone Biome, sin `.editorconfig`; el escaneo de secretos es `gitleaks` en `.githooks/pre-commit`, local por clon y no en CI.
- [x] **Protección de ramas** en GitHub: hecha solo para `main` (comprobado el 2026-11-03); `develop` sin proteger.
- [x] **Revisión externa (*challenge*) del 2026-08-30**: diez hallazgos aplicados (ADR-0012, ADR-0013, `docs/data-schema.md`); criterios fiscales consolidados en `docs/fiscal-questions.md`.
