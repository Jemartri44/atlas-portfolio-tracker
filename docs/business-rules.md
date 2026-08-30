# Reglas de negocio y mecánica fiscal

Reglas de dominio que la aplicación implementa. La especificación técnica (`specification.md`) las referencia por número. Las referencias a "regla N del plan" o "P1/P2/P3" apuntan a `plan-financiero.md`, documento privado que no está en el repositorio.

> **Aviso.** Este documento describe la mecánica fiscal española tal como se entiende en agosto de 2026, para orientar el diseño del software. La normativa cambia y su interpretación corresponde a un asesor fiscal, no a este documento. Cualquier cifra o tipo debe verificarse en la AEAT antes de usarse en producción. El sistema debe permitir cambiar tipos y umbrales por configuración, no por despliegue.

---

## 1. Estructura de la cartera

### Dos libros compartimentados

| Libro (`book`) | Nombre | Contenido | Plataforma | Métrica principal |
|---|---|---|---|---|
| `core` | **Cartera principal / núcleo** | Cuatro clases de activo: renta variable, renta fija, oro y cripto | MyInvestor (fondos), IBKR (ETC/ETP) | Desviación frente a pesos objetivo |
| `bucket` | **Cubo especulativo** | Acciones al contado, operativa de días a semanas. Pequeña parte para especular, trastear y aprender | IBKR (cuenta separada) | Rendimiento frente al índice |

### Clases de activo del núcleo (`asset_class`)

| Clase | Nombre | Vehículo habitual | Traspasable |
|---|---|---|---|
| `equity` | Renta variable (RV) | Fondos indexados | Sí |
| `fixed_income` | Renta fija (RF) / monetario | Fondos indexados o monetarios | Sí |
| `gold` | Oro | ETC de oro físico | No |
| `crypto` | Cripto | ETP (o tenencia directa) | No |

Oro y cripto son **satélites**: posiciones pequeñas que deben comportarse distinto al resto (regla 6b).

### Bases de cálculo distintas

- **Núcleo:** los pesos objetivo se aplican **sobre el valor total del núcleo**, para las cuatro clases de activo. Recibe la aportación mensual menos el porcentaje reservado al cubo.
- **Cubo:** es un **presupuesto**, no una asignación. Recibe un porcentaje fijo y configurable de la **aportación mensual**, y nunca entra en el cálculo de pesos objetivo.

El cubo sí aparece en la vista de patrimonio total, con etiqueta propia. El patrimonio nunca se muestra como un único número sin descomponer.

---

## 2. Reglas de cartera

**Regla 1 — Base de los porcentajes.**
Los pesos objetivo se calculan sobre el valor total del núcleo, no sobre la aportación mensual. Única excepción: el cubo.

**Regla 2 — Rebalanceo con dinero nuevo.**
Cada mes la aportación se dirige a los activos por debajo de su peso objetivo. Es el mecanismo de rebalanceo por defecto.
→ Mecánica de la calculadora (feature 004): del importe del mes se separa primero el presupuesto del cubo (`bucket_pct_of_contribution`); el resto se reparte entre los activos del núcleo **proporcionalmente a su déficit** frente al objetivo calculado sobre el valor tras la aportación; si la aportación supera el déficit total, el sobrante se reparte por pesos objetivo. Redondeo a céntimos una vez por activo. La calculadora **propone y nunca vende ni escribe**: las órdenes se dan a mano y se registran como siempre.

**Regla 3 — Umbral de rebalanceo por venta.**
Solo se vende para rebalancear si un activo se desvía más de un umbral (inicialmente 5 puntos porcentuales) de su peso objetivo. Revisión anual, no más frecuente.
→ La app avisa al superarse el umbral. El valor es configurable (`deviation_threshold_pp`).

**Regla 4 — Orden de venta en retiradas.**
Al retirar dinero se vende lo que esté **por encima** de su peso objetivo, nunca proporcionalmente de todo.
- Bolsa caída → se vende renta fija u oro (están por encima en peso relativo).
- Bolsa disparada → se vende renta variable.
En ambos casos la retirada rebalancea sola.
→ La app calcula y propone el desglose de la venta.

**Regla 5 — Desriesgado solo con plan concreto.**
No se reduce el riesgo de forma preventiva. Cuando exista un objetivo con fecha y cifra, desde 2-3 años antes las aportaciones mensuales van a renta fija/monetario hasta cubrir el importe, sin frenar el resto de la cartera.
→ Funcionalidad futura, no de la primera versión.

**Regla 6 — No añadir sin quitar.**
No se incorpora un activo nuevo sin eliminar otro. El número de posiciones no es diversificación.

**Regla 6b — Umbral mínimo de satélite: 0% o al menos 10-12%.**
Un satélite (oro, cripto) debe comportarse distinto al resto **y** ser lo bastante grande para que eso se note. La contribución de un activo es `peso × movimiento`: al 7%, un activo que sube un 30% mientras la bolsa cae un 40% aporta solo +2,1 puntos. Por debajo del 10% se paga complejidad por un efecto que se pierde en el ruido.
→ La app avisa si un satélite cae por debajo del umbral. Configurable (`satellite_min_weight_pct`).

**Regla 6c — Desviarse del índice solo de forma estructural.**
Cualquier desviación respecto a la ponderación por capitalización debe ser una decisión permanente y documentada, nunca una apuesta sobre el momento del mercado.
→ Sin implicación técnica directa; documentada para el registro de decisiones.

---

## 3. Reglas de conducta

**Regla 7** — Frecuencia de consulta a discreción del usuario. *(Anulada respecto a versiones anteriores del plan: no se imponen restricciones de diseño basadas en esto.)*

**Regla 8** — No tomar decisiones por noticias.

**Regla 9** — Cuando suba el sueldo, sube la aportación antes que el nivel de vida.
→ La aportación mensual es configurable (`monthly_contribution_eur`).

**Regla 10** — Una caída fuerte en los primeros años es una rebaja, no un desastre: las aportaciones dominan sobre los rendimientos. Solo es un desastre si se vende.

**Regla 11** — La cartera mediocre mantenida 30 años bate a la óptima abandonada en dos. Ante la duda, simplificar.

**Regla 12** — El mayor activo son los ingresos futuros, no la cartera.

---

## 4. Reglas del cubo especulativo

**Regla 13 — Cuenta separada**, en entidad distinta al núcleo. Una liquidación forzosa solo puede alcanzar esa cuenta.

**Regla 14 — Pocas operaciones y grandes.** Con capital pequeño y comisiones fijas, las comisiones deciden el resultado antes que el criterio.
→ La app muestra las comisiones acumuladas como porcentaje del capital operado. Es probablemente la métrica más reveladora del panel.

**Regla 15 — Log de tesis obligatorio ANTES de abrir la posición.**
Campos: hipótesis, plazo esperado, condición de invalidación, tamaño previsto.
→ **El sistema no debe permitir registrar una compra en el cubo sin tesis asociada.** Es un requisito funcional, no una recomendación.

**Regla 16 — La referencia es el índice, no cero.**
Para cada operación cerrada se calcula qué habría rendido ese mismo importe invertido en el fondo global durante el mismo periodo. La pregunta no es "¿gané?" sino "¿gané más que la alternativa aburrida?".

**Regla 17 — Regla de parada.** *(Pendiente de definir. Configurable.)*
Umbral de pérdida acumulada o tope de aportación total tras el cual se deja de financiar el cubo.
→ La app avisa al acercarse y bloquea de forma visible al superarse (`bucket_max_cumulative_contribution`, `bucket_stop_loss_pct`).

**Regla 18 — Regla de recogida.** *(Pendiente de definir. Configurable.)*
Si el cubo supera un porcentaje de la cartera total, el exceso se traspasa al núcleo (`bucket_max_weight_pct`).

**Regla 19 — No reponer el cubo con dinero de las otras partes.**

**Regla 20 — Registro en el momento de operar**, no reconstruido a posteriori. Fecha, activo, cantidad, precio, comisión, divisa, tipo de cambio.

---

## 5. Mecánica fiscal española

La declaración es **por contribuyente, no por libro**: la base del ahorro, la compensación de pérdidas y los umbrales de los Modelos 720/721 agregan núcleo y cubo. Es la única excepción a la compartimentación (constitución III) y toda salida que la use se etiqueta como total fiscal.

### 5.1 Base del ahorro

Tipos vigentes según se entienden en agosto de 2026 (**verificar y mantener configurable**, `savings_tax_brackets`):

| Tramo de ganancia anual | Tipo |
|---|---|
| Hasta 6.000€ | 19% |
| 6.000 - 50.000€ | 21% |
| 50.000 - 200.000€ | 23% |
| 200.000 - 300.000€ | 27% |
| Más de 300.000€ | 30% |

Los tramos se aplican a la **ganancia realizada en el ejercicio**, no al patrimonio ni al importe retirado. Solo tributa la plusvalía, no el capital aportado.

### 5.2 Traspaso entre fondos — el caso crítico

Los fondos de inversión españoles y los UCITS comercializados en España admiten **traspaso** sin tributación. Afecta a las clases `equity` y `fixed_income` del núcleo.

**Efecto sobre el modelo de datos:**
- Se conservan la **fecha de adquisición original** y el **valor de adquisición original**.
- Los lotes del fondo destino **heredan** `acquisition_date` y `unit_cost_eur` de los lotes origen, enlazados por `source_lot_id`.
- **No genera ganancia ni pérdida patrimonial.** No aparece en la declaración.
- Un traspaso parcial consume lotes en orden FIFO.

**Modelarlo como venta seguida de compra rompe la fiscalidad de forma silenciosa durante años.** Es el error más caro posible en este sistema.

Los ETFs, ETCs y ETPs (oro, cripto y todo el cubo) **no** admiten traspaso: cada venta es hecho imponible.

### 5.3 FIFO

El método de imputación es **primera entrada, primera salida**, aplicado por producto homogéneo (mismo `asset_id`) **a través de todas las cuentas** (ADR-0009): una venta en una cuenta consume fiscalmente los lotes más antiguos del activo aunque estén en otra. Empates de fecha: orden de registro (`id`).

**Regla 21 — El mismo activo no puede estar en `core` y en `bucket`.** Evita que una venta del cubo consuma lotes del núcleo. El sistema rechaza el alta. En dos cuentas del mismo libro se permite con aviso.

**Traspaso de custodia.** Mover un valor (mismo ISIN) de un depositario a otro no es transmisión: conserva fecha y coste. Se registra como `transfer` del mismo activo entre cuentas (ADR-0012).

**Comisiones en la base fiscal** (art. 35 LIRPF, *verificar*): la de compra se suma al coste de adquisición; la de venta se resta del valor de transmisión. Se guardan aparte del precio.

**Retención a cuenta en reembolsos de fondos:** el comercializador retiene sobre la plusvalía; se registra en la venta (`withholding`) para que cuadre la declaración.

Casos límite a cubrir en tests:
- Varios lotes con la misma fecha de adquisición
- Lotes procedentes de traspaso (mantienen la fecha original, no la del traspaso)
- Cantidades fraccionarias
- Venta que consume parcialmente un lote

### 5.4 Regla de recompra con pérdidas (dos meses / un año)

Si se vende con pérdidas y se recompra el **mismo valor homogéneo** dentro de la ventana anterior o posterior a la venta, la pérdida **no es computable** en ese ejercicio. Se difiere hasta que se transmitan los valores recomprados.

La ventana es de **dos meses** para valores admitidos a negociación (acciones, ETF, ETC, ETP) y de **un año** para los no admitidos (participaciones de fondos —es decir, todo el núcleo `equity` y `fixed_income`— y cripto) (art. 33.5 LIRPF, **verificar**), contada **de fecha a fecha** en meses y años naturales, no en un número fijo de días (61 días no son dos meses: pregunta #14). Con aportaciones mensuales a un fondo, cualquier reembolso con pérdida de ese fondo activa la regla. Parametrizada por tipo de activo (`wash_sale_window`, `"2m"`/`"1y"`/`"<n>d"`, ADR-0013 y `data-schema.md` §8.4). Un traspaso entrante no cuenta como adquisición (**verificar**).

→ La app alerta al intentar registrar una recompra que active la regla, y **aplica el diferimiento completo** en el motor fiscal: la parte de la pérdida proporcional a la cantidad recomprada queda pendiente, asociada a los lotes recomprados, y se libera cuando estos se transmiten; si esos lotes se traspasan o se canjean antes (`transfer`, `convert`, `carve_out`), el diferimiento viaja con los lotes descendientes y se libera cuando estos se transmiten (pregunta #15, **verificar**). Es el error más común en operativa activa.

### 5.5 Compensación de pérdidas

- Las pérdidas patrimoniales compensan primero con ganancias patrimoniales del mismo ejercicio.
- El remanente compensa con rendimientos del capital mobiliario hasta un porcentaje limitado (**verificar el porcentaje vigente**).
- Lo no compensado se arrastra hasta **4 ejercicios** siguientes.

→ La app mantiene el saldo de pérdidas pendientes por ejercicio de origen.

### 5.6 Dividendos y rendimientos extranjeros

- Tributan como **rendimiento del capital mobiliario** en la base del ahorro.
- Si hubo retención en origen, corresponde la **deducción por doble imposición internacional**.
- Se registra: importe bruto, retención en origen, retención en España, divisa, tipo de cambio de la fecha y **país del pagador** (`source_country`): de su convenio dependen el tipo deducible y el límite de la deducción (pregunta #16).

### 5.7 Divisa

Toda operación en divisa distinta del euro requiere conversión al **tipo de cambio oficial del BCE de la fecha fiscal** (§5.10).

- Se almacena el tipo **tal cual lo publica el BCE** (unidades de divisa por EUR, todos los decimales) y la fecha del tipo aplicado; en días sin publicación, el último anterior (**verificar**). Conversión: `eur = importe / tipo` (ADR-0013).
- Se almacenan siempre importe original, divisa y tipo aplicado.
- Los cambios de divisa dentro de una cuenta se registran como `fx_exchange` con ambos importes y ambos tipos, para poder calcular diferencias de cambio cuando se confirme su tratamiento (ADR-0012).
- Nunca convertir y descartar el original.
- Las cuentas multidivisa pueden generar ganancias o pérdidas por diferencias de cambio con tratamiento propio (**verificar la doctrina aplicable**).

### 5.8 Obligaciones informativas

**Modelo 720** — declaración informativa (no se paga nada) si los bienes en el extranjero superan **50.000€ por categoría** (cuentas, valores, inmuebles).
- Aplica a IBKR y a cualquier entidad extranjera. **No aplica a MyInvestor**, que es entidad española.
- Solo se repite si el valor sube más de 20.000€ sobre la última declaración presentada.

**Modelo 721** — equivalente para criptoactivos en el extranjero por encima de 50.000€.
- **No aplica a un ETP**, que es un valor, no una tenencia de criptoactivos.

→ La app avisa al acercarse a los umbrales, con margen configurable.

### 5.10 Fecha fiscal por tipo de activo

La fecha que determina el ejercicio, la antigüedad del lote, el tipo de cambio y la ventana de recompra es la **fecha de contratación** para valores cotizados (acciones, ETF, ETC, ETP; una venta el 30/12 con liquidación el 02/01 es del ejercicio anterior) y la **fecha valor** del reembolso o suscripción para fondos (**verificar**). Parametrizada por tipo de activo (`fiscal_date_rule`, ADR-0013); el libro guarda siempre ambas fechas.

### 5.9 Residencia fiscal

- Se es residente si se pasan más de 183 días del año natural en España, o si está aquí el centro principal de intereses económicos.
- **España no fracciona el ejercicio**: se es residente o no residente para el año completo.
- Perder la residencia fiscal **elimina el derecho al traspaso**, que es la base de toda la arquitectura de vehículos.

→ La residencia fiscal es un campo de configuración (`tax_residence`), no una constante. Un cambio invalida las funciones de traspaso.

---

## 6. Eventos corporativos

Transformaciones que la app debe soportar sin migración de esquema. Se implementan como composición de cinco primitivas de lote (`scale`, `convert`, `carve_out`, `forced_sale`, `grant`; ADR-0011). El dividendo en efectivo no es un evento corporativo sino un `dividend`. El cambio puro de ISIN/ticker es un `asset_updated`, no un evento corporativo.

| Evento (`corporate_action.kind`) | Efecto sobre los lotes |
|---|---|
| **Split** (`split`, ej. 4:1) | Multiplica cantidad, divide coste unitario. Fecha y coste total intactos. |
| **Contrasplit** (`reverse_split`) | Inverso. Las fracciones sobrantes suelen liquidarse en efectivo: **hecho imponible**. |
| **Dividendo en efectivo** (`cash_dividend`) | No toca lotes. Rendimiento del capital mobiliario. |
| **Dividendo en acciones** (`stock_dividend`) | Lotes nuevos. Fecha y valoración según normativa. |
| **Fusión / absorción** (`merger`) | Los lotes se transforman en el valor nuevo por canje. Conserva antigüedad. |
| **Escisión** (`spin_off`) | El coste original se reparte entre matriz y escindida según la proporción publicada. |
| **Fusión de fondos** (`fund_merger`) | Frecuente en indexados. Como el traspaso: conserva antigüedad y coste. |
| **Cambio de clase de participación** (`share_class_change`) | Muy frecuente. Mismo fondo, otro ISIN, otro TER. Conserva antigüedad. |
| **Cierre / liquidación de fondo** (`fund_liquidation`) | Reembolso forzoso. **Sí es hecho imponible.** |
| **Cambio de ISIN o ticker** (`identifier_change`) | Solo metadatos, pero rompe las fuentes de precios. |
| **Exclusión de cotización** (`delisting`) | Posición sin precio. Requiere marcado manual. |
| **Fork de cripto** (`crypto_fork`) | Activo nuevo con **coste de adquisición cero** y fecha del fork (criterio conservador, *verificar*). Se documenta en el evento. |
| **Migración de token** (`token_migration`) | Canje. Documentar el criterio aplicado. |
| **Reestructuración de emisor de ETC/ETP** (`issuer_restructuring`) | Puede implicar canje o reembolso forzoso. |

Cada evento registrado guarda su **fuente documental** (URL o PDF del emisor).

---

## 7. Parámetros configurables

Ninguno de estos valores va codificado en el fuente. Los valores marcados como *pendiente* dependen del plan financiero privado.

| Parámetro | Valor inicial | Regla asociada |
|---|---|---|
| `target_weights{}` | Pendiente (claves: `asset_id` del núcleo; suman 100) | 1, 2 |
| `deviation_threshold_pp` | 5 puntos | 3 |
| `satellite_min_weight_pct` | 10% | 6b |
| `monthly_contribution_eur` | Pendiente | 9 |
| `bucket_pct_of_contribution` | Pendiente | — |
| `bucket_max_cumulative_contribution` | Pendiente | 17 |
| `bucket_stop_loss_pct` | Pendiente | 17 |
| `bucket_max_weight_pct` | Pendiente | 18 |
| `stale_price_days` | 5 | — |
| `model_720_alert_threshold_eur` | 45.000€ | 5.8 |
| `model_721_alert_threshold_eur` | 45.000€ | 5.8 |
| `savings_tax_brackets[]` | Ver 5.1 | 5.1 |
| `fiscal_date_rule{}` | cotizados → contratación; fondos → fecha valor | 5.10 |
| `wash_sale_window{}` | fondos/cripto `"1y"`; cotizados `"2m"` (de fecha a fecha; `wash_sale_window_days` en días es la forma antigua aceptada) | 5.4 |
| `tax_residence` | España | 5.9 |
| `notification_email` | — | — |
| `job_frequencies{}` | Ver especificación | — |

**Requisitos:**
- Historial de cambios de configuración: cambiar los pesos objetivo altera el cálculo de desviaciones históricas.
- Validación: los pesos objetivo suman 100%; los umbrales deben ser coherentes entre sí.
- **Aviso al modificar un umbral que esté silenciando una alerta activa.**
