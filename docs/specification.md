# Especificación — Aplicación de gestión de cartera

**Fecha:** agosto 2026
**Estado:** definición de requisitos. Sin implementar.
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

**Account** (cuenta)
`id`, `name`, `platform`, `book`, `base_currency`, `country` (para el Modelo 720), `active`

El saldo de efectivo de cada cuenta (`cash_balance`) es **derivado**: resulta de `cash_deposit`, `cash_withdrawal`, compras, ventas, dividendos y comisiones. Se usa para conciliar con el bróker y para la vista de patrimonio. No hay cuentas bancarias puras: el colchón se gestiona fuera de la app (ADR-0004).

**Asset** (activo)
`id`, `type` (`fund` | `etc` | `etp` | `stock` | `crypto` | `money_market`), `book`, `asset_class` (solo `core`: `equity` | `fixed_income` | `gold` | `crypto`), `isin`, `ticker`, `name`, `currency`, `ter`, `transferable` (bool), `reference_etf_id` (solo fondos, ver §7), `active` (bool)

Los identificadores cambian con el tiempo. El `id` interno es inmutable; ISIN y ticker son atributos que se versionan.

**Lot** (lote) — *la entidad central*
`id`, `asset_id`, `account_id`, `acquisition_date`, `quantity`, `original_unit_cost`, `original_currency`, `ecb_fx_rate`, `unit_cost_eur`, `fee_eur`, `source_lot_id` (para traspasos), `closed` (bool)

**Nunca almacenar posiciones agregadas.** El FIFO exige el detalle lote a lote. La posición actual es una consulta, no un campo.

**Transaction** (operación)
`id`, `trade_date`, `value_date`, `type`, `asset_id`, `account_id`, `quantity`, `unit_price`, `currency`, `fx_rate`, `fee`, `affected_lots[]`, `notes`

Tipos (`type`): `buy`, `sell`, `transfer`, `dividend`, `corporate_action`, `cash_deposit`, `cash_withdrawal`, `standalone_fee`.

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

| Parámetro | Valor inicial | Uso |
|---|---|---|
| `target_weights{}` | Por definir (P1 del plan) | Cálculo de aportación y desviaciones |
| `deviation_threshold_pp` | 5 puntos porcentuales | Regla 3 del plan |
| `satellite_min_weight_pct` | 10% | Regla 6b del plan |
| `monthly_contribution_eur` | Por definir | Reparto mensual |
| `bucket_pct_of_contribution` | Por definir | Presupuesto del cubo |
| `bucket_max_cumulative_contribution` | Por definir | Regla 17 |
| `bucket_stop_loss_pct` | Por definir | Regla 17 |
| `bucket_max_weight_pct` | Por definir | Regla 18 |
| `stale_price_days` | 5 | Aviso de antigüedad |
| `model_720_alert_threshold_eur` | 45.000€ | Margen sobre los 50.000€ |
| `model_721_alert_threshold_eur` | 45.000€ | Ídem para cripto |
| `savings_tax_brackets[]` | Ver `business-rules.md` §5.1 | Motor fiscal |
| `tax_residence` | España | `business-rules.md` §5.9 |
| `job_frequencies{}` | Ver §9.4 | Programación de trabajos |
| `notification_email` | — | Destino SES |
| `alert_channels{}` | — | Qué avisa por correo y qué solo en la interfaz |

### 5.2 Requisitos

- **Historial de cambios de configuración.** Cambiar los pesos objetivo altera el cálculo de desviaciones históricas; hay que poder saber qué valores estaban vigentes en cada momento.
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

| Dato | Fuente | Fiabilidad | Riesgo |
|---|---|---|---|
| Acciones, ETFs, ETCs | Yahoo Finance (scraping / API no oficial) | Buena | IPs de AWS bloqueadas por antibot |
| Cripto | CoinGecko o similar | Buena | Límites de uso en plan gratuito |
| Tipos de cambio | BCE (CSV/API oficial) | Excelente | Ninguno |
| Valor liquidativo de fondos | **Aproximación por ETF equivalente** | Buena para consulta | No sirve para fiscalidad |
| Valor liquidativo exacto | Entrada manual al registrar la operación | Exacta | Requiere disciplina |
| Operaciones IBKR | Flex Query (API con token) | Excelente | Token a rotar |
| Operaciones MyInvestor | Subida de extracto o entrada manual | Buena | Formato puede cambiar |

### 7.1 Estrategia de precios: dos niveles

El error de diseño a evitar es intentar obtener el valor liquidativo oficial de los fondos por scraping. Yahoo Finance cubre mal los fondos UCITS irlandeses, y depender de ello hace frágil todo el sistema.

**Nivel 1 — Precio exacto (para fiscalidad y libro mayor).**
Se introduce a mano en el momento de registrar la operación, o llega del extracto del bróker. Es el único que alimenta cálculos fiscales. Nunca se estima.

**Nivel 2 — Precio aproximado (para consulta y paneles).**
Para cada fondo se configura un **ETF de referencia que replica el mismo índice** (`Asset.reference_etf_id`). El movimiento del ETF sirve como aproximación de la evolución del fondo. Resuelve el caso "compré hace un año y quiero ver cómo va" sin depender de scraping de fondos.

Estos precios son **exclusivamente informativos** y la interfaz los marca como aproximados. Ningún cálculo fiscal los toca.

### 7.2 Arquitectura de fuentes: patrón adaptador

Cada fuente es un módulo intercambiable con la misma interfaz (`getPrice(asset, date)`). Requisitos:

- **Cascada de respaldo**: fuente primaria → secundaria → último valor conocido → entrada manual.
- **Antigüedad siempre visible.** Si un precio lleva más de `stale_price_days` sin refrescarse, la interfaz lo indica.
- **Nunca interpolar ni estimar en silencio.**
- **Registro de fallos**: si una fuente falla repetidamente, aviso por correo. Es lo que te va a avisar de que Yahoo ha empezado a bloquear las IPs de Lambda.

### 7.3 ⚠ Riesgo conocido: scraping desde Lambda

Los rangos de IP de AWS son bloqueados con frecuencia por sistemas antibot. El scraping puede funcionar durante meses y dejar de hacerlo sin previo aviso.

Mitigaciones, en orden:
1. Diseño con adaptadores y respaldo manual (arriba). El sistema degrada, no se rompe.
2. Cachear agresivamente: una consulta al día por activo es suficiente.
3. Si se vuelve inviable: mover el recolector a una máquina propia que empuje los precios a la API. Rompe la autonomía del sistema pero resuelve el bloqueo.

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
3. **Detección de duplicados** por huella (fecha + activo + cantidad + importe). Reimportar el mismo extracto no debe duplicar nada.
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

```
Navegador (PC / móvil)
    │
    ├── CloudFront ──── S3 (SPA estática, privada vía OAC)
    │      <dominio de la app>
    │
    └── Lambda Function URL ─── Lambda (API) ─── DynamoDB (libro mayor)
           (valida JWT de Cognito)     │
                                       └───── S3 (backups JSON, documentos de eventos)

EventBridge Scheduler ─── Lambdas programadas ─── SES (correo)
                                │
                                └── SSM Parameter Store (token IBKR)
```

**Decisiones deliberadas para minimizar coste y servicios:**

- **Lambda Function URL en vez de API Gateway.** Un servicio menos. La Lambda valida el JWT de Cognito directamente.
- **SSM Parameter Store en vez de Secrets Manager.** El estándar es gratuito; Secrets Manager cuesta ~0,40$/secreto/mes.
- **DNS en el registrador, no en Route 53.** Un CNAME del subdominio propio a la distribución de CloudFront evita los 0,50$/mes de zona alojada. Certificado en ACM (gratuito), **obligatoriamente en us-east-1** para CloudFront. El dominio real vive en `terraform.tfvars`, fuera del repositorio.
- **DynamoDB con capacidad aprovisionada** dentro del always-free (25 RCU/WCU), no bajo demanda.

### 9.3 Costes

Servicios en la categoría **Always Free**, perpetua e independiente de la antigüedad de la cuenta:

| Servicio | Límite gratuito mensual | Uso previsto |
|---|---|---|
| Lambda | 1M invocaciones, 400.000 GB-segundo | Unos cientos de invocaciones |
| DynamoDB | 25 GB, 25 RCU/WCU, 200M peticiones | Unos MB, decenas de operaciones |
| CloudFront | 1 TB de salida, 10M peticiones | Unos MB |
| SNS | 1M publicaciones | Marginal |
| SSM Parameter Store (estándar) | Gratuito | 1-2 parámetros |
| Cognito | Miles de usuarios activos | 1 usuario |
| SES | 0,10$ por 1.000 correos | ~20 correos/mes |
| S3 | 5 GB (solo primeros 12 meses) | Unos MB → céntimos después |

**Coste estimado: entre 0 y 1$ al mes, indefinidamente.**

### 9.4 ⚠ Trampa crítica del Free Plan

AWS cambió el modelo el 15 de julio de 2025. Las cuentas nuevas entran en un **Free Plan** con 100$ de crédito inicial y hasta 100$ más por completar actividades, con ventana de seis meses.

**En el Free Plan, cuando se agotan los créditos o vencen los seis meses, la cuenta se cierra automáticamente**, sin factura previa ni periodo de gracia. Quedan 90 días para pasar al Paid Plan y recuperar los datos antes de que se borren.

**Acción obligatoria: pasar al Paid Plan desde el principio.** Con tarjeta asociada y usando solo servicios always-free, la facturación es cero pero la cuenta no se cierra.

**Además:** alerta de presupuesto (AWS Budgets) en 1$, con aviso por correo. Es la red que avisa si algo se sale de los límites gratuitos.

### 9.5 Lambdas programadas

| Frecuencia | Función | Notifica |
|---|---|---|
| Diaria | Actualizar precios (posiciones del cubo y ETFs de referencia) | Solo si una tesis se acerca a su condición de invalidación |
| Diaria | Actualizar tipos de cambio del BCE | No |
| Diaria | Importar operaciones nuevas de IBKR vía Flex Query | Solo si hay operaciones nuevas o discrepancias |
| Semanal | Comprobar desviaciones de pesos y reglas del cubo | Sí, si se supera algún umbral |
| Semanal | Conciliar posiciones del libro contra extracto de IBKR | Sí, si divergen |
| Mensual | Recordatorio de aportación con el reparto calculado | Sí, siempre |
| Mensual | Volcado completo del libro mayor a S3 | Solo si falla |
| Trimestral | Verificación de integridad: recalcular todo desde cero y comparar | Sí, si hay discrepancia |
| Anual (enero) | Preparar datos de la Renta del ejercicio anterior | Sí |
| Anual | Comprobar umbrales de los Modelos 720 y 721 | Sí, si se acerca a 50.000€ |

**Todas las frecuencias y umbrales son configurables** (`job_frequencies`, ver §5).

**Principio de notificación:** el correo mensual siempre llega. Los demás solo cuando hay algo que hacer. Un sistema que envía correos rutinarios acaba filtrado a los seis meses.

### 9.6 Frontend

**Requisito:** compila a archivos estáticos servibles desde S3, sin servidor de renderizado.

| Opción | Ventaja | Inconveniente |
|---|---|---|
| Vite + TypeScript sin framework | Dependencias mínimas, máxima auditabilidad | Todo a mano |
| **Vite + Svelte** | Árbol de dependencias pequeño, compila a JS mínimo | Ecosistema menor |
| **Vite + Solid** | Ligero, API tipo React | Menos material de apoyo |
| Vite + React | Ecosistema enorme | Árbol de dependencias grande |
| Astro | Pensado para estático | Puede quedarse corto con estado |

**Recomendación: Svelte o Solid con Vite.** Suficientes para una app con estado y con un árbol de dependencias auditable de verdad.

**Requisitos transversales:**
- Responsive real: se va a consultar desde el móvil.
- Modo de solo lectura por defecto; registrar operaciones requiere acción explícita.
- Funciona sin conexión para consulta (los datos cacheados siguen visibles con su antigüedad marcada).

---

## 10. Seguridad

Son datos financieros personales completos. Nivel de exigencia alto.

- **Nunca almacenar credenciales de brókers.** Ni usuario, ni contraseña, ni claves de exchange. El único secreto es el token Flex de IBKR, que es de **solo lectura** y va en SSM Parameter Store como `SecureString`, jamás en el frontend.
- **S3 privado**, servido solo vía CloudFront con Origin Access Control. Sin buckets públicos.
- **Cognito con MFA obligatorio.** Sin excepciones ni "recordar dispositivo" indefinido.
- **IAM de mínimo privilegio**: cada Lambda con su rol y solo los permisos que necesita.
- **Cifrado en reposo** en DynamoDB y S3, y en tránsito por TLS.
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

### 11.3 Entornos

| Entorno | Rama | Infraestructura | Datos |
|---|---|---|---|
| `dev` | `develop` | Pila completa separada, sufijo en todos los recursos | Datos sintéticos |
| `prod` | `main` | Pila de producción | Datos reales |

- **Aislamiento total**: cuentas o al menos pilas independientes, sin recursos compartidos.
- **Despliegue a producción solo desde `main`**, tras PR aprobada y CI en verde.
- **Los artefactos que se despliegan a producción son los mismos que se validaron en dev.** Se construye una vez y se promociona; no se reconstruye por entorno.
- **Datos de producción jamás en dev.** Generador de datos sintéticos como parte del repositorio.

### 11.4 Infraestructura

- **Terraform** para todos los recursos AWS. Nada creado a mano en la consola.
- Estado remoto en S3 con bloqueo (DynamoDB o el bloqueo nativo de S3).
- Módulos reutilizables y ficheros `.tfvars` por entorno.
- `terraform plan` obligatorio en la PR, `apply` solo tras aprobación.

### 11.5 Tests

| Nivel | Cobertura |
|---|---|
| **Unitarios** | Motor FIFO, transformaciones de lotes por evento corporativo, conversión de divisa, regla de los dos meses, cálculo de reparto mensual |
| **Integración** | API contra DynamoDB local, adaptadores de importación con extractos de ejemplo |
| **Contrato** | Parsers de extractos contra ficheros reales anonimizados guardados en el repositorio |
| **End-to-end** | Flujos críticos: registrar operación, importar extracto, calcular aportación |

**Prioridad absoluta: el motor fiscal.** Es donde un error silencioso cuesta dinero y no se detecta hasta años después. Cobertura alta y casos límite explícitos (misma fecha en varios lotes, fracciones, contrasplit con liquidación en efectivo, recompra en el límite de los dos meses).

**Ficheros de ejemplo anonimizados** de cada formato de extracto, versionados en el repositorio. Cuando un bróker cambie el formato, el test falla y te enteras.

### 11.6 CI/CD

GitHub Actions:
1. Lint y formateo
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

- **SSM Parameter Store** (nivel estándar, gratuito) con parámetros cifrados de tipo `SecureString`.
- Token Flex de IBKR: **solo lectura**, rotado anualmente, jamás en el frontend ni en el repositorio.
- Sin secretos en variables de entorno de la Lambda visibles en la consola.
- `.gitignore` estricto y escaneo de secretos en CI.

### 11.9 Documentación

- `README` con arranque en local, arquitectura y despliegue.
- **ADRs** (registros de decisión de arquitectura) para las decisiones importantes: por qué DynamoDB, por qué modelo propio, por qué aproximación por ETF.
- **El esquema de datos documentado en el repositorio**, incluida la lógica de transformación de lotes de cada evento corporativo.

---

## 12. Supervivencia a 20 años

Requisitos que no son técnicos pero deciden si el sistema sigue vivo en 2046:

- **Exportación completa a CSV/JSON en un clic**, en cualquier momento y sin depender del código.
- **El libro mayor debe ser legible sin la aplicación.** Si el proyecto muere, los datos siguen siendo utilizables.
- **Documentar el esquema** en el propio repositorio, incluida la lógica de transformación de lotes de cada tipo de evento.
- **Cero dependencia de servicios de pago de terceros** en el camino crítico. Si CoinGecko cierra, se introduce el precio a mano y no pasa nada.
- **Prueba de restauración anual**: reconstruir el sistema desde cero con el backup y verificar que cuadra. Va en la revisión anual del plan.
- **Idempotencia**: registrar dos veces la misma operación debe detectarse, no duplicarse.

---

## 13. Fases

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

**Orden deliberado:** el motor fiscal va al final porque no se necesita hasta la primera declaración, pero **el modelo de datos de la Fase 1 tiene que soportarlo desde el primer día**. Si los lotes o los traspasos se modelan mal, la Fase 5 obliga a rehacer todo.

---

## 14. Decisiones abiertas

- [ ] **¿Svelte o Solid?** Ambos válidos. Decidir por preferencia tras un prototipo pequeño.
- [ ] **¿DynamoDB, o JSON en S3 con versionado?** Decidido a favor de DynamoDB por encaje con Lambda y por estar en always-free. Reconsiderar solo si el modelo resulta muy relacional.
- [ ] **Umbrales del cubo (reglas 17 y 18)**: dependen de la conversación P3 del plan financiero.
- [ ] **Pesos objetivo**: dependen de la decisión P1 del plan financiero.
- [ ] **¿Qué ETF de referencia para cada fondo?** Depende de P2 del plan financiero.
- [ ] **Nivel de importación automática de IBKR**: diaria automática frente a bajo demanda. Empezar bajo demanda y automatizar cuando el parser esté probado.

### 14.1 Pendientes de la revisión de agosto de 2026

Puntos detectados al revisar la especificación. Sin decidir todavía; cada uno merece una conversación y, si procede, un ADR.

- [ ] **Lenguaje del backend** (ADR-0001, propuesta). No está definido. TypeScript en todo (un solo toolchain, tipos del dominio compartidos con el frontend) o Python (`decimal` en la biblioteca estándar). Si es TypeScript: el SDK de DynamoDB devuelve los números como `number` de JS salvo que se configure `wrapNumbers`; candidato a trampa de dominio nº 8.
- [ ] **Corrección de errores de registro** (ADR-0003, propuesta). Propuesta: las operaciones son *append-only*, nunca se editan ni borran; un error se corrige con una operación de rectificación que referencia a la original. Los lotes pasan a ser una proyección recalculable desde cero.
- [x] **Posición de efectivo.** Decidido (ADR-0004): saldo derivado por cuenta de inversión; el colchón bancario queda fuera de la app.
- [ ] **Retención a cuenta en reembolsos de fondos.** Registrarla en las ventas de fondos para que la salida de la Renta cuadre.
- [ ] **Valoración a 31 de diciembre.** El Modelo 720 exige valor de mercado a fin de año. Foto manual anual guardada como dato de Nivel 1, no como precio scrapeado.
- [ ] **Despliegue desde GitHub Actions con OIDC**, sin claves de AWS de larga duración en el repositorio.
- [ ] **Tests de propiedades** para el motor FIFO (suma de lotes = posición; recalcular = almacenado; split e inverso dejan el coste intacto).
- [ ] **Reconsiderar DynamoDB frente a JSONL en S3** (ADR-0002, propuesta). El libro mayor completo cabe en memoria en una Lambda; con "cargar todo, calcular, guardar" el fichero versionado cumple mejor "legible sin la aplicación".
- [ ] **Esqueleto del repositorio**: `docs/adr/`, `docs/data-schema.md`, `LICENSE`, `.editorconfig`, CI, escaneo de secretos.
- [ ] **Protección de ramas** en GitHub para `main` y `develop`.
