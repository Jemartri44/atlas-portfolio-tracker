# Reglas de negocio y mecánica fiscal

Reglas de dominio que la aplicación implementa. La especificación técnica (`specification.md`) las referencia por número. Las referencias a "regla N del plan" o "P1/P2/P3" apuntan a `plan-financiero.md`, documento privado que no está en el repositorio.

> **Aviso.** Este documento describe la mecánica fiscal española tal como se entiende en agosto de 2026, para orientar el diseño del software. La normativa cambia y su interpretación es el criterio de Atlas (`docs/fiscal-questions.md`), que no es asesoramiento fiscal. Cualquier cifra o tipo debe verificarse en la AEAT antes de usarse en producción. El sistema debe permitir cambiar tipos y umbrales por configuración, no por despliegue.

---

## 1. Estructura de la cartera

### Dos libros compartimentados

| Libro (`book`) | Nombre | Contenido | Plataforma | Métrica principal |
|---|---|---|---|---|
| `core` | **Cartera principal / núcleo** | Cuatro clases de activo: renta variable, renta fija, oro y cripto | MyInvestor (fondos), IBKR (ETC/ETP) | Desviación frente a pesos objetivo |
| `bucket` | **Cubo especulativo** | Acciones al contado, operativa de días a semanas. Pequeña parte para especular, trastear y aprender | IBKR (cuenta separada) | Rendimiento frente al índice |

Uso previsto: ver `specification.md` §3. Para el bitcoin, un ETP tributa por defecto como rendimiento del capital mobiliario (criterio #24 de `fiscal-questions.md`) y la tenencia directa va por permutas y Modelo 721; Atlas cubre las dos vías.

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

### Lo aportado a la cartera principal

Es la línea con la que se lee la evolución del núcleo: cuánto dinero ha puesto el usuario, frente a **lo que vale la cartera principal con el efectivo de sus cuentas** (activos del núcleo más el efectivo de las cuentas del libro `core`). El patrimonio es núcleo + cubo + efectivo de las cuentas de inversión (ADR-0004), así que el efectivo no se compara aparte ni se deja fuera: una cartera financiada con 10.000 € que ha comprado por 2.000 € vale 2.000 € en activos y 8.000 € en efectivo, y frente a lo aportado (10.000 €) está en 10.000 contra 10.000, no en 2.000 contra 10.000. El efectivo de las cuentas del cubo va con el cubo, así que los dos paneles suman el patrimonio sin contar nada dos veces ni mezclar libros (`bookCashSeries`). Lo aportado es una **derivación del libro** (`contributedSeries`), nunca un dato guardado.

1. **Qué cuenta.** Los `cash_deposit` (suman) y los `cash_withdrawal` (restan) en cuentas cuyo libro es `core`. Ingresos de 1.000 € el 01/02 y el 01/03 y una retirada de 300 € el 15/03: lo aportado a 31/03 es 1.700 €.
2. **Su valor en euros** es `amount / fx_rate` del propio evento, con la precisión de ADR-0005 (la misma expresión que usa el cubo), nunca el tipo del día de la gráfica. 1.100 USD con `fx_rate` 1,1000 son 1.000 € en cualquier fecha posterior.
3. **Qué no cuenta:** dividendos, intereses, comisiones sueltas, compras, ventas, cambios de divisa, eventos corporativos y traspasos (también el de custodia, ADR-0012): no son dinero que el usuario pone o saca.
4. **El cubo nunca entra** (constitución III). El dinero que pasa del núcleo al cubo se registra como retirada en uno e ingreso en el otro, y resta de lo aportado al núcleo, que es lo que pasó.
5. **Anulados y corregidos:** manda la proyección. Un evento anulado no cuenta y su corrección sí.
6. **Compras sin ingreso previo.** Si el núcleo tiene una compra anterior a su primer ingreso (o ninguno), lo aportado **no se inventa a partir de las compras**: la serie lleva `uncovered_buys` y la pantalla lo dice en una frase. Es un hecho del libro, no del rango pedido: se calcula sobre todas las compras del núcleo y sale igual con un `from` posterior a la compra.
7. **Una fecha de consulta** (ADR-0016): el punto de la fecha `d` cuenta los eventos de fecha de negocio `<= d`, en las mismas fechas que la serie del patrimonio. No depende de ningún precio: no tiene huecos.
8. **El libro de la cuenta** es el actual, como en las aportaciones del cubo.

### Variación de la cartera principal («este mes» y «12 meses»)

Cuánto ha variado la cartera principal en un periodo, **descontado el dinero que entró o salió** (`coreReturn`, en `charts/core-return.ts`). Definición aprobada por la coordinadora el 2026-11-03.

1. **Solo la cartera principal**: sus activos y el efectivo de sus cuentas, los mismos valores que la línea de `bookCashSeries`. Un rendimiento sobre el total mezclaría núcleo y cubo en una métrica (constitución III); el cubo tiene su comparación propia, frente al índice.
2. **Dietz modificado**: `r = (V1 − V0 − F) / (V0 + Σ wᵢ·Fᵢ)`, con `wᵢ = (fin − dᵢ) / (fin − inicio)` en días. Los flujos `Fᵢ` son exactamente los de lo aportado (apartado anterior), con fecha de negocio en `(inicio, fin]`. Un dividendo o un interés no es flujo: es rendimiento.
3. **Periodos.** «Este mes», del último día del mes anterior a la fecha consultada. «12 meses», del mismo día un año antes (el 29/02 pasa al 28/02).
4. **Sin cifra, con su motivo**, nunca estimada: falta un precio o un tipo en un extremo (`partial`); el núcleo empieza después del inicio del periodo (`short_history`: «menos de 12 meses de historia», sin recalcular desde el primer día); una compra anterior al dinero que la pagó (`uncovered_buys`); o nada invertido en el periodo (`no_base`).
5. Depende de precios: **es informativa** y nada fiscal la lee. Se enseña en porcentaje con un decimal, también con la privacidad puesta.

Ejemplo: 1.000 € el 31/01, 300 € ingresados el 15/02 y 1.400 € el 28/02 dan `(1.400 − 1.000 − 300) / (1.000 + 300 × 13/28)` = **+8,8 %**.

### Lo ganado desde el primer ingreso y la rentabilidad ponderada por dinero

`coreXirr` (`charts/core-xirr.ts`): «he aportado X, vale Y, he ganado Z %» y la tasa anual que dan los flujos con sus fechas (XIRR, días reales / 365). Informativa; nada fiscal la lee.

1. **Solo la cartera principal**, con los mismos flujos y el mismo valor que la variación de arriba (`coreCashFlows`, `bookCashSeries`); dividendos, intereses y comisiones son rendimiento, no flujo. El cubo no entra.
2. **Aportado** = ingresos menos retiradas hasta la fecha; **vale** = núcleo con el efectivo de sus cuentas; **ganado** = vale − aportado, y `ganado / aportado` en porcentaje (sin cifra si lo aportado neto no es positivo).
3. **Tasa**: la que hace que cada flujo, capitalizado día a día hasta la fecha, sume el valor. Se resuelve por bisección en decimal con exponente entero, sin coma flotante, y se da con 4 decimales.
4. **Sin cifra, con su motivo**: falta un precio o un tipo (`partial`); compra anterior al dinero que la pagó (`uncovered_buys`); ningún flujo (`no_flows`); tasa fuera de −99 %…+1000 % anual (`no_rate`; también la da un primer ingreso de hace pocos días, cuya anualización se dispara). Con flujos de signo mixto la ecuación puede tener varias raíces: se da la que encuentra la bisección, o `no_rate` si el número de raíces es par.
5. **Rentabilidad real** (parámetro `inflationPct`, año natural → variación anual del IPC, en porcentaje): cada flujo y el valor se llevan a euros de una fecha con la inflación de cada año natural que cubren, capitalizada día a día (en los años parciales, solo los días que caen dentro del periodo). **El IPC de un año se publica en enero del siguiente**, así que la cifra real se mide hasta `real.until`: la fecha de cálculo o el 31/12 del último año con IPC (años naturales completos), la que llegue antes, y la salida dice esa fecha; la nominal sale siempre a la fecha de cálculo. **Si el primer año del periodo no tiene IPC no hay cifra real** (`real.missing_years` dice los que faltan). Si falta un precio en `real.until`, tampoco (`real.gap`). Una variación fuera de −99 %…1000 % se rechaza (`invalid_inflation`). La tabla va como dato en el código (`charts/spanish-cpi.ts`: IPC general nacional, diciembre a diciembre, del INE, 2002-2025, con la consulta de cada año y el día que se comprobó), no la mete el dueño; **cada enero se añade el año nuevo**.

### Lo ganado por clase de activo

`classReturns` (`charts/class-return.ts`): para cada clase del núcleo (`equity`, `fixed_income`, `gold`, `crypto`), lo puesto, lo devuelto, lo que vale, lo ganado y la tasa anual ponderada por dinero desde su primera compra. Informativa; nada fiscal la lee.

1. **Solo el núcleo y solo las posiciones**: el efectivo de las cuentas no es de ninguna clase, así que cada clase se mide por lo que se movió entre ella y el efectivo. El cubo no entra.
2. **Flujos**: una compra es dinero que entra en la clase (base más comisión); una venta, lo que sale (base menos comisión y retención); un dividendo, lo que sale (bruto menos retenciones); una permuta saca de una clase y mete en otra por los valores de mercado de sus patas, y su comisión no se imputa a ninguna. Una permuta dentro de una misma clase solo mueve la diferencia. Los intereses, las comisiones sueltas, los cambios de divisa y los ingresos o retiradas son del efectivo y no cuentan. Las fechas son las de negocio de cada operación (la fiscal en valores y fondos), que puede diferir un par de días de la liquidación.
3. **Traspasos**: entre fondos de la misma clase no es flujo (no se mueve dinero). Si cambia de clase, saca de la clase de origen `quantity_out × nav_out` en `value_date_out` y mete en la de destino `quantity_in × nav_in` en `value_date_in`, como una permuta por el valor de cada pata. Sin NAV en una pata, vale el precio que el libro ya tiene de ese activo **en esa misma fecha** (una valoración manual o un cierre de ese día, el mismo que usa la valoración del núcleo); nunca se interpola ni se toma el más cercano. Sin ninguno, esa clase queda sin cifra (`transfer_without_nav`) y el motivo dice el activo y la fecha: se arregla añadiendo el valor liquidativo al traspaso o una valoración de ese día. En el total del núcleo el traspaso es un movimiento interno.
4. **Operaciones corporativas**, leídas por sus efectos y no por su tipo: `scale` (división y contradivisión) no mueve dinero, cambia las unidades y no el valor; `forced_sale` (el efectivo en sustitución de fracciones, una liquidación, la pata en efectivo de una fusión o un `spin-off`) saca de la clase lo que la proyección registró como cobrado, menos la retención; `cost_adjustment` saca el efectivo recibido; `convert` y `carve_out` dentro de la misma clase y libro no mueven dinero. Un evento que la proyección rechazó no cuenta. Sin lectura clara, la clase queda sin cifra: `convert` o `carve_out` que cambian de clase o de libro (`corporate_action_reclassifies`, marca origen y destino) y `grant` (`corporate_action_grant`: se reciben unidades sin un precio que el evento dé).
5. **Sin cifra, con su motivo**: algo de la clase que no se lee (los dos casos de arriba, o un `asset_updated` que cambia la clase o el libro de un activo —la clase se lee con la última versión del activo y reasignaría toda la historia—, `asset_reclassified`, que marca la clase vieja y la nueva aunque se registre después de la fecha; el resto, solo si ya había ocurrido a la fecha) deja **esa clase** sin cifra y con `unsupported`: una entrada por evento con su motivo, el id, la fecha, los activos y, si es corporativa, su `kind`. No se inventa nada para cubrirlo. También falta un precio (`partial`), no ha habido ningún movimiento (`no_flows`; una clase que solo cobró dividendos sale como `no_rate`) o la tasa cae fuera de −99 %…+1000 % (`no_rate`).

### Exposición por divisa y región: los valores por defecto

`exposure` (`projections/exposure.ts`) reparte el núcleo por divisa y región. El dueño **no tiene que saber esos porcentajes**: por activo y dimensión manda, por este orden, (1) el reparto que haya escrito él, (2) el perfil del **índice** del activo (el que eligió en `index`, o el que Atlas propone por el ISIN o por la clase), (3) nada: «sin propuesta», nunca una estimación. Informativo; nada fiscal lo lee.

1. **Los perfiles son datos en el código** (`projections/index-profiles.ts`), como el IPC. Cada uno dice de dónde sale: la **cartera del ETF que replica físicamente el índice**, leída en el fichero de posiciones del proveedor (`via`: ISIN y nombre; `as_of`: fecha de las posiciones). Es un proxy declarado, porque las fichas de MSCI solo dan los cinco primeros países. La etiqueta es siempre «por defecto · <índice> (según la cartera de <ETF>) · <fecha>», a la vista y nunca plegada.
2. **La divisa sale del país** de cada valor del índice sin cubrir, no de la divisa de cotización; en un perfil cubierto a euros (bonos) es EUR. La región sale del mismo país con claves cerradas (`north_america`, `europe_developed`, `asia_pacific_developed`, `emerging`, `global`, `other`); un valor cuyo «país» es solo un domicilio legal (Caimán, Bermudas…) o Israel va a `other`, y los supranacionales de un índice de bonos a `global`. Los porcentajes llevan dos decimales y el resto del redondeo va a la mayor entrada para sumar exactamente 100.
3. **Oro y cripto** son una definición, no un dato: divisa USD y región `global`, sin fecha ni fondo. El monetario euro tiene divisa EUR por definición y **no tiene región** hasta que una ficha la dé.
4. **ISIN → índice** (`KNOWN_FUNDS`): solo con la ficha del gestor abierta, que confirme el ISIN y el índice. Un fondo que no está no tiene propuesta y el dueño elige el índice en el selector.
5. **Los porcentajes por defecto no se copian** a `settings/exposure.json`: solo se guarda la elección de `index` y lo que el dueño escribe. Si cambia un perfil, cambia lo que se propone.
6. El total enseña cuántos activos van por defecto, cuántos con reparto propio y cuántos sin propuesta.
7. **Cada enero se revisa, junto con el IPC**: las posiciones de los ETF se mueven (los pesos de un índice cambian unos puntos al año). Se vuelve a leer cada fichero, se actualizan `as_of` y `checked` y se comprueba que las sumas cierran.

### Proyección

`projectionCases` (`projections/projection-cases.ts`) es una cuenta directa, sin simulaciones: los mismos datos dan siempre lo mismo. Solo el núcleo; es informativa y ninguna cifra fiscal la lee.

1. **Caso normal.** Cada clase crece a su rentabilidad **compuesta**, la que publican las fuentes: un mes es la raíz duodécima del año, no un doceavo de la tasa. La aportación entra a final de mes.
2. **Pesimista y optimista en el año t.** `μ ± 1,28·σ/√t`: el margen en el que caería unas 8 de cada 10 veces. Se estrecha como tasa anual y se abre en euros. Todas las clases van mal, o bien, a la vez: es lo más simple y exagera algo la banda. Un año nunca pierde más del 99 %.
3. **Cripto** usa sus casos malo y bueno publicados (`lowPct`, `highPct`) mientras no se edite su rentabilidad o su volatilidad; al editarlas, usa la fórmula, para que esos campos no queden sin efecto.
4. **Descuentos, por este orden.** Comisiones: el TER medio del núcleo se resta de la tasa, y lo que no declara TER cuenta como nada, sin heredar la media, y se dice cuánto es; la comisión de cada aportación es un supuesto del dueño, vacía de inicio. Impuestos: la escala del ahorro (`quotaOfBase`, la de la ley o `savings_tax_brackets`) sobre la ganancia de venderlo todo ese año, frente a lo invertido más lo aportado. Esa base es coste histórico y falla en los dos sentidos: las ventas no restan su coste y lo llegado por traspaso no tiene compra. Es un orden de magnitud. Inflación: al final, porque el impuesto cae sobre la ganancia nominal.
5. **Valores de partida** (`PROJECTION_START`): J.P. Morgan Asset Management, *Long-Term Capital Market Assumptions 2027*, datos a 30/09/2026, horizonte de 10 a 15 años, en euros salvo bitcoin, en dólares. Son estimaciones de una gestora. Solo se guarda lo editado, así que su actualización anual llega a todo lo que el dueño no tocó.

### Este mes: el plan de la aportación como lista de tareas

`monthPlan` (`projections/month-plan.ts`) dice qué compras del plan del mes ya están registradas. Definición aprobada el 2026-11-03.

1. **El plan queda fijo todo el mes.** Es `contributionPlan` sobre el libro tal como estaba el **último día del mes anterior**, con los ajustes vigentes ese día (el libro guarda su historia) y `monthly_contribution_eur`. Calculado con la fecha de hoy, cada compra registrada movería lo que falta y la lista nunca se cerraría. Un evento con fecha de negocio del mes anterior, aunque se registre después, sí entra: el plan es el libro tal como estaba ese día (ADR-0016).
2. **Tareas**: el ingreso de efectivo del mes, una por activo del núcleo al que el plan manda dinero y el presupuesto del cubo.
3. **Hecha**, con los eventos vivos del mes hasta la fecha consultada: el ingreso, con cualquier `cash_deposit` en una cuenta del núcleo; un activo, con cualquier `buy` de ese activo en una cuenta del núcleo; el cubo, con cualquier `buy` en una cuenta del cubo. Cada tarea hecha lleva la fecha de la primera operación y lo registrado en euros (base bruta de la compra o el ingreso, al tipo de su evento) frente a lo propuesto. No se marca «a medias» por importe: se ve cuánto entró.
4. **Sin plan**: sin `monthly_contribution_eur`, sin pesos o con un precio que falta a fin de mes, la tarjeta dice el motivo (el código del dominio) en lugar de una lista.

---

## 2. Reglas de cartera

**Regla 1 — Base de los porcentajes.**
Los pesos objetivo se calculan sobre el valor total del núcleo, no sobre la aportación mensual. Única excepción: el cubo.

**Regla 2 — Rebalanceo con dinero nuevo.**
Cada mes la aportación se dirige a los activos por debajo de su peso objetivo. Es el mecanismo de rebalanceo por defecto.
→ Mecánica de la calculadora (features 004 y 028): del importe del mes se separa primero el presupuesto del cubo (`bucket_pct_of_contribution`); el resto se reparte entre los activos del núcleo **por nivel de agua**: primero al activo más lejos de su peso objetivo (calculado sobre el valor tras la aportación), hasta igualarlo con el siguiente; luego a los dos, y así sucesivamente. Un activo por encima de su objetivo no recibe nada. Si la aportación supera el déficit total, el sobrante se reparte por pesos objetivo. Redondeo a céntimos una vez por activo. Sustituye al reparto proporcional al déficit de la feature 004 (el dueño, 2026-10-26: «a qué se le da prioridad si hay varios activos que necesitan»; aprobado el mismo día). La calculadora **propone y nunca vende ni escribe**: las órdenes se dan a mano y se registran como siempre. La propuesta dice también cuánto ingresar en cada plataforma y qué comprar en ella (`specs/028-rebalance/spec.md`).

**Regla 3 — Umbral de rebalanceo por venta.**
Solo se vende para rebalancear si un activo se desvía más de un umbral (inicialmente 5 puntos porcentuales) de su peso objetivo. Revisión anual, no más frecuente.
→ La app avisa al superarse el umbral. El valor es configurable (`deviation_threshold_pp`).
→ El botón «Rebalancear» (feature 028) es lo que propone ventas, y solo si algún activo supera el umbral una vez colocado el dinero nuevo; frena también los traspasos de ese botón (el simulador de traspaso suelto no). La «revisión anual» sigue siendo una recomendación: la regla 7 anulada impide restringir el botón por frecuencia. Sin `deviation_threshold_pp` configurado se niega a proponer, en vez de inventar uno.

**Regla 4 — Orden de venta en retiradas.**
Al retirar dinero se vende lo que esté **por encima** de su peso objetivo, nunca proporcionalmente de todo.
- Bolsa caída → se vende renta fija u oro (están por encima en peso relativo).
- Bolsa disparada → se vende renta variable.
En ambos casos la retirada rebalancea sola.
→ La app calcula y propone el desglose de la venta. Las ventas del botón «Rebalancear» siguen este orden: lo que esté por encima de su objetivo, del más lejano al más cercano, y nunca proporcionalmente de todo; antes de vender, traspasos entre fondos y, si se escribe, dinero nuevo. Cada venta enseña el impuesto aproximado (la diferencia de la cuota estimada del ahorro, §5.1, con y sin ella, sobre una copia del libro en memoria; si es negativa, porque una pérdida compensa ganancias del mismo año, se dice como ahorro: «reduce tu impuesto en ≈ X €») y las comisiones reales del dueño, las de su última operación equivalente; sin ninguna, «desconocida», nunca cero. La retirada de dinero como función propia no está construida y reutilizará este orden.

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
→ Mecánica (feature 005): el índice es un activo configurable (`bucket_benchmark_asset_id`) cuyos precios salen de las `valuation` manuales, como cualquier otro precio (Nivel 1). El equivalente en índice de una tesis es `Σ coste_i × P(fecha de cierre) / P(fecha de la compra i)` sobre sus compras enlazadas, y el resultado frente al índice es el resultado de la tesis menos el del índice. Si falta cualquiera de esos precios, la comparación queda **sin dato**: nunca se estima (constitución V).

**Regla 17 — Regla de parada.** *(Pendiente de definir. Configurable.)*
Umbral de pérdida acumulada o tope de aportación total tras el cual se deja de financiar el cubo.
→ La app avisa al acercarse y bloquea de forma visible al superarse (`bucket_max_cumulative_contribution`, `bucket_stop_loss_pct`).

**Regla 18 — Regla de recogida.** *(Umbral pendiente de definir. Configurable.)*
Si el cubo supera un porcentaje de la cartera total, el exceso se traspasa al núcleo (`bucket_max_weight_pct`).
→ El denominador es el **patrimonio total** (núcleo valorado + cubo valorado + efectivo de las cuentas de inversión, ADR-0004), siempre mostrado desglosado. Es una de las dos excepciones acotadas a la compartimentación (constitución III): un control de presupuesto, no una métrica de cartera mezclada. Sin el umbral configurado, el aviso no se evalúa.

**Regla 19 — No reponer el cubo con dinero de las otras partes.**

**Regla 20 — Registro en el momento de operar**, no reconstruido a posteriori. Fecha, activo, cantidad, precio, comisión, divisa, tipo de cambio.

---

## 5. Mecánica fiscal española

La declaración es **por contribuyente, no por libro**: la base del ahorro, la compensación de pérdidas y los umbrales de los Modelos 720/721 agregan núcleo y cubo. Es la única excepción a la compartimentación (constitución III) y toda salida que la use se etiqueta como total fiscal.

**Lo que Atlas no calcula y hay que mirar en el borrador de la AEAT.** Las **bonificaciones de los brókeres** (dinero por abrir cuenta o por traer un traspaso) no tienen evento: apuntadas como `cash_deposit` no tributan en ningún sitio, y la ley las grava como ganancia no derivada de transmisión (base general, arts. 33.1 y 45 LIRPF) o como rendimiento del capital mobiliario, según la doctrina de la DGT, sin verificar. Suelen venir en los datos fiscales: míralas en el borrador. Un evento propio, solo si llega a pasar (`fiscal-questions.md`, «Lo que falta», 12). La cuota, el mínimo personal y el segundo límite de la doble imposición los calcula Renta WEB.

### 5.1 Base del ahorro

Escala de la base del ahorro, **por año** (arts. 66.1 y 76 LIRPF, mitad estatal y mitad autonómica, régimen común), leída en el BOE redacción a redacción y guardada como datos en `packages/domain/src/tax/savings-scale.ts`. Desde 2025:

| Tramo de base del ahorro | Tipo |
|---|---|
| Hasta 6.000€ | 19% |
| 6.000 - 50.000€ | 21% |
| 50.000 - 200.000€ | 23% |
| 200.000 - 300.000€ | 27% |
| Más de 300.000€ | 30% |

Antes: 28 % por encima de 300.000 € en 2023-2024, 26 % por encima de 200.000 € en 2021-2022 y 23 % por encima de 50.000 € hasta 2020. Un año sin escala comprobada no tiene cuota. `savings_tax_brackets`, si se configura, sustituye a la escala en todos los años, y la cuota avisa cuando difiere de la ley.

**Cuota estimada** (`savingsQuota`, criterio #27 de `fiscal-questions.md`): la escala sobre la base del ahorro, la deducción por doble imposición con sus dos límites y las retenciones del ahorro. Es una estimación: no conoce el resto de la Renta y supone que el mínimo personal y familiar se agota en la base general.

**Rendimientos de fuera de la cartera** (`external_income`, criterio #28): los intereses de otro banco o los dividendos de tu empresa, apuntados a mano con su bruto y su retención en euros. Entran **solo en la estimación** (cuota y «¿Y si vendo?»): se integran y compensan con el capital mobiliario de la cartera (art. 49) y su retención se resta. No entran en las casillas ni en el paquete de la cartera, porque quien paga ya los comunica (modelos 193 y 196) y vienen en tus datos fiscales: la Declaración los enseña aparte para que los compruebes en Renta WEB. No mueven efectivo ni patrimonio.

**Pago de la Renta** (`tax_payment`): lo pagado o devuelto por **toda** la Renta de un ejercicio, en uno o dos plazos. La Declaración lo pone junto al resultado estimado de la parte del ahorro, con la nota de que el pago incluye el resto de la Renta: se compara, nunca se resta.

**Rentabilidad del núcleo después de impuestos** (`coreXirrAfterTax`, criterio #29), junto a la de antes y sin sustituirla. En cada ejercicio cerrado, el impuesto de la cartera es lo que **añade** al resultado estimado: el resultado con todo menos el resultado con solo los rendimientos de fuera. Se reparte entre núcleo y cubo en proporción a lo que cada libro aporta a la base del año, con signo y la parte del núcleo entre 0 y 100 % (lo arrastrado de otros años se reparte con las líneas del año que compensa; si suman cero, al núcleo no le toca nada). Entra en la tasa como una aportación más, fechada el día del pago (los plazos, en proporción) o el 30/06 del año siguiente; si aún se debe, al final del periodo. Una pérdida que rebaja la cuota es un ahorro y suma.

Los tramos se aplican a la **base liquidable del ahorro** del ejercicio: ganancias realizadas y rendimientos del capital mobiliario **tras compensar** (art. 49), no al patrimonio ni al importe retirado. La cuota estimada supone que el **mínimo personal y familiar se agota en la base general** (art. 56.2); si no, parte de él rebaja la base del ahorro y la cuota real es menor. Solo tributa la plusvalía, no el capital aportado.

### 5.2 Traspaso entre fondos — el caso crítico

Los fondos de inversión españoles y los UCITS comercializados en España admiten **traspaso** sin tributación. Afecta a las clases `equity` y `fixed_income` del núcleo.

**Efecto sobre el modelo de datos:**
- Se conservan la **fecha de adquisición original** y el **valor de adquisición original**.
- Los lotes del fondo destino **heredan** `acquisition_date` y `unit_cost_eur` de los lotes origen, enlazados por `source_lot_id`.
- **No genera ganancia ni pérdida patrimonial.** No aparece en la declaración.
- Un traspaso parcial consume lotes en orden FIFO.

**Modelarlo como venta seguida de compra rompe la fiscalidad de forma silenciosa durante años.** Es el error más caro posible en este sistema.

Los ETFs, ETCs y ETPs (oro, cripto y las acciones del cubo) **no** admiten traspaso: cada venta es hecho imponible (art. 94.1.a LIRPF: el diferimiento es solo para fondos de inversión). El motor lo hace cumplir: un `transfer` o `transfer_requested` entre activos distintos solo se **escribe** (registro, corrección o unidad que recibe el servidor) si ambos son `fund` o `money_market` y están marcados `transferable` (en otro caso se rechaza con `not_transferable`). Al **reproducir** un libro que ya lo contenía no se bloquea la carga: sale el aviso `transfer_not_between_funds` en la atención, con el texto de registrarlo como venta y compra. Un catálogo con `transferable: true` en otro tipo de activo también carga, con el aviso `transferable_not_fund`.

`transferable` lo marca el usuario y el motor no puede comprobarlo: un fondo extranjero solo admite traspaso si es una IIC de la Directiva 2009/65/CE «constituida y domiciliada en algún Estado miembro de la Unión Europea» (el EEE no basta), inscrita en el registro especial de la CNMV y operada a través de entidades comercializadoras inscritas en la CNMV (art. 94.2.a y su 1.º), y una SICAV si tiene más de 500 socios (por compartimento si los hay, art. 94.2.a.2.º) y el contribuyente no ha tenido más del 5 % del capital en los 12 meses anteriores (art. 94.1.a.2.º). El diferimiento tampoco vale cuando la operación tiene por objeto fondos o sociedades cotizados del art. 79 del RD 1082/2012 (art. 94.1.a, último párrafo), ni, en una IIC extranjera, las «análogas» a ellos, «cualquiera que sea el mercado regulado o el sistema multilateral» y el índice que repliquen (art. 94.2.a.3.º); tampoco cuando el importe se pone a disposición del contribuyente (art. 94.1.a, párrafo 3.º). Texto leído en el BOE consolidado el 2026-11-04. Atlas no avisa de un `convert` de fondo a ETF y conserva el coste, y la ley no da diferimiento en ese caso; no es un movimiento propio de inversiones comunes. `atlas asset add` y `asset update` lo recuerdan al marcar traspasable un fondo: entero si no consta como español (ISIN o país emisor `ES`), y solo la condición de la SICAV si consta, porque el catálogo no distingue una SICAV de un fondo.

### 5.3 FIFO

El método de imputación es **primera entrada, primera salida**, aplicado por producto homogéneo (mismo `asset_id`) **a través de todas las cuentas** (ADR-0009): una venta en una cuenta consume fiscalmente los lotes más antiguos del activo aunque estén en otra. Empates de fecha: la posición en el fichero del evento que abrió el lote; si ese evento es una corrección, la de **la raíz de su cadena**, porque corregir un dato de una compra no cambia cuándo ocurrió (ADR-0009, enmienda del 2026-09-24; `data-schema.md` §8.1).

**Regla 21 — El mismo activo no puede estar en `core` y en `bucket`.** Evita que una venta del cubo consuma lotes del núcleo. El sistema rechaza el alta. En dos cuentas del mismo libro se permite con aviso.

**Traspaso de custodia.** Mover un valor (mismo ISIN) de un depositario a otro no es transmisión: conserva fecha y coste. Se registra como `transfer` del mismo activo entre cuentas (ADR-0012).

**Comisiones en la base fiscal** (art. 35 LIRPF): la de compra se suma al coste de adquisición; la de venta se resta del valor de transmisión; las de **custodia, administración o conectividad no son deducibles** en la ganancia patrimonial, porque no son inherentes a la adquisición ni a la transmisión (`docs/fiscal-questions.md` #3, certeza alta). Se guardan aparte del precio.

No deducibles **de la ganancia patrimonial** no quiere decir no deducibles en absoluto: el art. 26.1.a) permite restar del rendimiento íntegro del capital mobiliario los gastos de **administración y depósito** de valores negociables (nunca la gestión discrecional de carteras). El motor fiscal resta por eso las comisiones sueltas marcadas `custody` o `administration` (`standalone_fee.fee_kind`, criterio #23); `connectivity`, `discretionary_management` y `other` no se restan, y una comisión sin marcar es `other`, así que **sin clasificar nada no cambia nada**. Clasificar cada comisión es del usuario, y marcar como custodia lo que no lo es es la lectura agresiva. **La cripto en tenencia directa no es un valor negociable** (DGT V0648-24): la custodia de una cuenta en la que solo ha entrado cripto directa no se resta, y el informe lo dice (`tax_crypto_custody_not_deductible`). Un ETC o un ETP sí son valores negociables.

**Retención a cuenta en reembolsos de fondos:** el comercializador retiene sobre la plusvalía; se registra en la venta (`withholding`) para que cuadre la declaración.

Casos límite a cubrir en tests:
- Varios lotes con la misma fecha de adquisición
- Lotes procedentes de traspaso (mantienen la fecha original, no la del traspaso)
- Cantidades fraccionarias
- Venta que consume parcialmente un lote

### 5.4 Regla de recompra con pérdidas (dos meses / un año)

Si se vende con pérdidas y se recompra el **mismo valor homogéneo** dentro de la ventana anterior o posterior a la venta (solo la posterior en la cripto directa), la pérdida **no es computable** en ese ejercicio. Se difiere hasta que se transmitan los valores recomprados.

La ventana es de **dos meses** para valores admitidos a negociación (acciones, ETF, ETC, ETP) y de **un año** para los no admitidos. **Los fondos —y los monetarios, que en este catálogo son fondos— llevan dos meses por defecto, españoles o extranjeros** (decisión del dueño del 2026-11-03, criterio #2). Es una lectura agresiva y amparada en una interpretación, no una certeza: si Hacienda aplicara un año a un fondo extranjero, tocaría pagar la cuota, intereses de demora y quizá sanción, y por eso «Criterios en duda» enseña esa cifra. Lo que sostiene cada caso es distinto. Un fondo **español** (ISIN `ES…`, o `issuer_country` `ES` si no hay ISIN) lleva **dos meses** (`2:fund_admitted_2m`): el art. 4.9 del RD 1082/2012 da a sus participaciones «la consideración de valores admitidos a cotización», y la DGT lo aplica a la letra f) en cuatro consultas vinculantes no modificadas (V0011-00, 1897-01, 0881-02 y V2067-06: «Esta regla resulta aplicable en relación con las participaciones de fondos de inversión dada la consideración de valores admitidos a cotización que les otorga el artículo 4, apartado 9, del Reglamento […]»; arts. 89.1 y 179.2.d LGT). Esa ficción vale solo para fondos que garantizan el reembolso diario con difusión diaria del valor liquidativo; Atlas no lo sabe y trata igual a todo fondo `ES` (dos meses): un fondo español sin reembolso diario queda en lectura discutible, que pagaría de menos si Hacienda no la comparte. Un fondo **extranjero** (`2:fund_unlisted_2m`), o uno sin ISIN ni país, no tiene esa base, y lo que sale de las fuentes es **un año** (`2:fund_1y`, art. 33.5.g, lo que hace `"by_domicile"`): esa ficción exige una SGIIC que inscriba el fondo en la CNMV (art. 4.8), la CNMV «no exigirá información o documentación adicional» a un UCITS de otro Estado (art. 15.1 Ley 35/2003), la 1897-01 la limita a los fondos «regulados en la Ley 46/1984», los fondos indexados habituales solo están en sistemas multilaterales (FIRDS) y un sistema multilateral no es mercado secundario oficial (V0422-09). La guía de la CNMV de 2026 y la práctica (Indexa) dicen dos meses para todo fondo, sin razonarlo; los cinco pasos y las citas, en `fiscal-questions.md` #2. Una clase extranjera admitida en un **mercado regulado** de la UE cuenta como admitida si se escribe ese mercado en su `market` (por el MIC del segmento, de la lista `FUND_REGULATED_MARKETS`: `XMSM` para Euronext Dublin, `XLUX`, `XAMS`…; un sistema multilateral como `XEYE` o `EMTF`, o el MIC de toda una bolsa como `XDUB`, no cuenta). **Manda el ISIN**: un ISIN `IE…` es un fondo irlandés aunque `issuer_country` diga `ES`, que solo cuenta sin ISIN. Con `"by_domicile"`, cambiar después `market`, `isin` o `issuer_country` de un fondo mueve sus ventas pasadas, y la escritura avisa de los ejercicios presentados que mueve. Una ventana escrita en la configuración para `fund` o `money_market` sustituye el valor por defecto, y el informe enseña en los dudosos la cifra de la otra lectura de cada grupo de fondos. Base: art. 33.5 **f)** y **g)** LIRPF (**verificar**). **La cripto directa** (sin mercado secundario oficial) va por el art. 33.5.**e)**, que mira **solo el año siguiente** a la venta: una compra anterior a la venta no cuenta (criterio #2), salvo la del propio día de la venta, que cuenta por prudencia. Confirmado por la investigación fiscal del 2026-10-26 (letra del art. 33.5.e y ayuda del Modelo 100 de 2025); antes la cripto iba a un año a cada lado «por prudencia». Si la recompra llega **después del plazo de declarar** el año en que se computó la pérdida, hay que presentar una **complementaria con intereses de demora** antes de que acabe el plazo de la Renta del año de la recompra (art. 73.2 RIRPF, releído en el BOE el 2026-10-26), y el aviso de ejercicio presentado lo dice. Los ETP de cripto son valores admitidos y siguen con dos meses antes y después. Un activo que tributa como **rendimiento del capital mobiliario** (ETC y ETP por defecto, criterio #24) lleva siempre dos meses, porque el art. 25.2.b) LIRPF tiene su propia regla, sin mercado y sin variante de un año: la ventana configurada no se le aplica. Se cuenta **de fecha a fecha** en meses y años naturales, no en un número fijo de días (61 días no son dos meses: pregunta #14). Con aportaciones mensuales a un fondo, cualquier reembolso con pérdida de ese fondo activa la regla. Parametrizada por tipo de activo (`wash_sale_window`, `"2m"`/`"1y"`/`"<n>d"` y, solo en fondos y monetarios, `"by_domicile"`; ADR-0013 y `data-schema.md` §8.4).

**Ventana de recompra abierta** (`repurchaseCalendar`): por activo, el último día en que una compra aún difiere la pérdida de una venta (incluido, #14) y la pérdida todavía en juego, es decir, la que no ha diferido ya una recompra. Sale de las líneas del motor de cada año que aún tiene ventanas abiertas (`provisional_until`), no de un segundo cálculo. **Atlas avisa y nunca impide comprar**: recomprar aplaza la pérdida, no la pierde. El plan del mes en Cartera avisa junto a cada compra que la aplazaría (`planRepurchaseWarnings`, la misma función para el correo mensual). La difiere una compra del mismo activo en cualquier cuenta y un traspaso entrante si `wash_sale_transfer_counts` lo dice (#2b); no la difieren unas acciones liberadas ni un `grant` a coste cero, y la excepción de la compra única (#18) solo mira la ventana anterior a la venta, así que nunca libera una compra hecha ahora. Una venta cuya pérdida ya difirió entera una recompra no sale: comprar más no difiere nada más. Las diferencias de cambio de divisa (#4) tienen su propia ventana y no están en esta lista.

**Excepción de la compra única** (DGT V3282-18 y Manual de Renta 2025, certeza alta, `fiscal-questions.md` #18): si en la ventana **anterior** a la venta solo hubo una operación de compra (una `buy`) y al inicio de esa ventana no se tenían valores homogéneos, esa compra no es recompra; las compras posteriores a la venta siguen contando, y no rige para la cripto directa, que no mira atrás. En ETC y ETP como rendimiento del capital mobiliario se aplica por analogía (certeza media). La compra del mismo día cuenta por su orden de registro; sin saldo previo la venta no puede ir antes que la única compra, así que el orden no cambia el resultado. Si se aplica, la línea declara `18:single_purchase` (o `_etc`).

**Qué cuenta como adquisición** (criterio fijado el 2026-09-18, `docs/fiscal-questions.md` #2b, certeza media): un **traspaso entrante sí cuenta**, porque es una adquisición de valores homogéneos aunque no haya tributado en origen; unas acciones liberadas (`scale`) y un `grant` con coste cero **no** cuentan, porque no hay desembolso. El criterio es configurable (`wash_sale_transfer_counts`, por defecto `true`): contar difiere la pérdida, que es la lectura prudente, y no contarla la deduce antes.

→ La app alerta al intentar registrar una recompra que active la regla, y **aplica el diferimiento completo** en el motor fiscal: la parte de la pérdida proporcional a la cantidad recomprada queda pendiente, asociada a los lotes recomprados, y se libera cuando estos se transmiten; si esos lotes se traspasan o se canjean antes (`transfer`, `convert`, `carve_out`), el diferimiento viaja con los lotes descendientes y se libera cuando estos se transmiten (pregunta #15, **verificar**). Es el error más común en operativa activa.

La ley no cierra cuatro cosas que el motor no puede dejar de decidir, y que van numeradas en `docs/fiscal-questions.md` con su certeza y la dirección de su riesgo: solo cuenta la recompra que **sigue en el patrimonio** tras la venta (#18); cada unidad recomprada difiere **una sola** unidad vendida, atendiendo las pérdidas por orden cronológico (#19); la regla mira el **resultado neto de la operación**, no lote a lote (#20); y una pérdida diferida solo se libera con una transmisión **definitiva**, sin recompra en su propia ventana, aunque esa transmisión dé ganancia (#21, DGT V3282-18). El detalle está en `data-schema.md` §8.4.

### 5.5 Compensación de pérdidas

- Las pérdidas patrimoniales compensan primero con ganancias patrimoniales del mismo ejercicio.
- El remanente compensa con rendimientos del capital mobiliario **hasta el 25 %** del saldo positivo de esos rendimientos (art. 49 LIRPF; porcentaje vigente **desde 2018**, tras el 10, 15 y 20 % de 2015, 2016 y 2017 de la disposición adicional 12.ª LIRPF; `docs/fiscal-questions.md` #10). **El cruce va en los dos sentidos**: un saldo negativo de rendimientos del capital mobiliario compensa el saldo positivo de ganancias patrimoniales con el mismo límite.
- Lo no compensado se arrastra hasta **4 ejercicios** siguientes.

**El orden, que decide qué caduca** (criterio #22, tomado del manual práctico de IRPF de la AEAT): **fase 1**, el ejercicio —cada categoría se integra por separado y el saldo negativo de una compensa el positivo de la otra hasta el límite—; **fase 2**, lo pendiente de ejercicios anteriores —primero contra el saldo positivo restante de **su misma categoría**, sin límite, y después contra el de la otra, donde el límite es **conjunto** con lo ya compensado en la fase 1—. Entre ejercicios pendientes, los **más antiguos primero**, que es lo que minimiza lo que caduca. El límite se redondea a céntimos half-up, como cualquier otra cifra (#6). El motor compensa siempre el máximo posible: no compensar no es una opción que se deje al usuario.

El porcentaje y los cuatro años son **configuración**, no constantes del código (`savings_offset_limit_pct` y `loss_carryforward_years`, §7): el primero ya fue 10, 15 y 20 entre 2015 y 2017.

**El arrastre se ancla en lo declarado** (ADR-0020). El motor recorre la cadena de ejercicios desde el primero que importa, y en cada uno en que consta una **Renta presentada** —solo `renta`, solo la vigente el día de la consulta, nunca un 720 ni un 721— sustituye lo pendiente que él había calculado por **lo que aquella declaración dio por pendiente**, y sigue la cadena desde ahí. Una Renta presentada de un ejercicio anterior a los datos del libro es la vía por la que entra lo que se arrastraba de antes de usar la aplicación. El informe lleva las dos cifras y su diferencia **de cada ejercicio en que ancló**, no solo del último: lo declarado manda, pero la cifra que el motor calculaba no se tira.

→ La app mantiene el saldo de pérdidas pendientes **por ejercicio de origen y por categoría**, con el último ejercicio en que se puede usar cada uno. Separarlos por categoría no es cosmético: un saldo negativo de ganancias patrimoniales y uno de rendimientos del capital mobiliario compensan de forma distinta, sin límite dentro de su categoría y con el límite en la otra.

### 5.6 Dividendos y rendimientos extranjeros

- Tributan como **rendimiento del capital mobiliario** en la base del ahorro.
- Si hubo retención en origen, corresponde la **deducción por doble imposición internacional**.
- La deducción tiene dos límites y el motor solo calcula el primero: el **tipo del convenio** con el país del pagador (`treaty_withholding_pct`, §7). Sin ese tipo configurado, o sin `source_country` en el dividendo, no se calcula nada y la salida dice por qué; deducir todo lo retenido sería justo el exceso que el convenio manda reclamar en origen. El segundo límite (el tipo medio efectivo del contribuyente) no es calculable desde el libro, porque el motor no ve la base general; la salida lo dice, y dice también que el exceso **se pierde**, sin arrastre en IRPF.
- **La cifra que se copia en Renta WEB como «impuesto satisfecho en el extranjero» es la ya limitada al convenio** (DGT V0080-20: lo deducible «no podrá exceder, en ningún caso, del importe que, derivado de la correcta aplicación del Convenio, correspondiera gravar al país extranjero»). La retención entera va aparte como dato de detalle, con el rótulo «el exceso sobre el convenio se reclama en el país de origen» (en la práctica, W-8BEN en EE. UU. o formulario V2A en Irlanda). Sin tipo de convenio, esa cifra y el «límite del convenio» salen **vacíos**, nunca a 0 €. Ejemplo: 100 USD brutos, 30 retenidos, tipo 1,25 y tope del 15 %: se retienen 24 €, se copian 12 €. Certeza alta; si fallara, se pagaría de menos (el exceso se deduciría de más).
- Al faltar el tipo, el aviso **sugiere** (no aplica) EE. UU. 15 % en dividendos de una persona física (Convenio España-EE. UU., BOE-A-1990-30940, art. 10.2.b) e Irlanda 0 % (Convenio España-Irlanda, BOE-A-1994-28597, art. 10.1.c); el usuario los confirma y los fija él.
- Se registra: importe bruto, retención en origen, retención en España, divisa, tipo de cambio de la fecha y **país del pagador** (`source_country`): de su convenio dependen el tipo deducible y el límite de la deducción (pregunta #16).

### 5.7 Divisa

Toda operación en divisa distinta del euro requiere conversión al **tipo de cambio oficial del BCE de la fecha fiscal** (§5.10).

- Se almacena el tipo **tal cual lo publica el BCE** (unidades de divisa por EUR, todos los decimales) y la fecha del tipo aplicado; en días sin publicación, el último anterior (**verificar**). Conversión: `eur = importe / tipo` (ADR-0013).
- Se almacenan siempre importe original, divisa y tipo aplicado.
- Los cambios de divisa dentro de una cuenta se registran como `fx_exchange` con ambos importes y ambos tipos (ADR-0012).
- Nunca convertir y descartar el original.
- **La ganancia de una acción, un ETC o un ETP en divisa se calcula primero en la divisa** y la diferencia se convierte al tipo de la transmisión (criterio #4, DGT V1740-17, V2422-20 y V0152-26; certeza media, riesgo en las dos direcciones). La lectura anterior, cada pata a su tipo, queda como alternativa entre los dudosos (`fx_gain_method = each_leg`).
- **Un fondo, un ETF o un monetario en divisa (IIC) se calcula cada pata a su tipo**, y la diferencia de cambio de la divisa invertida en él se imputa **en el año de la venta**; la divisa cobrada entra al tipo de la venta (`4:iic`, DGT V0777-21 y V0207-24; certeza media-alta en fondos, media en ETF UCITS y baja en un ETF de EE. UU., que el catálogo no distingue, así que declara baja; riesgo en las dos direcciones). Igual un lote comprado en una divisa y vendido en otra (`4:mixed_currency`).
- **La divisa es un elemento patrimonial con lotes** (FIFO por divisa a través de las cuentas, `data-schema.md` §8.7). Su diferencia de cambio se imputa **cuando el cambio se realiza** (art. 14.2.e LIRPF, V2466-08): al convertirla a euros, al pagar con ella y cuando una entrada cubre divisa gastada sin tenerla. Cambiarla por otra divisa no imputa nada. **Comprar un valor en esa divisa no imputa nada**: en acciones, ETC y ETP la divisa invertida sigue en el lote y su diferencia sale al convertir a euros lo cobrado en la venta; en una IIC se imputa al vender (`4:iic`). «Pagar» es pagar una comisión o un gasto, no invertir. La diferencia va a la base del ahorro del año en que se realiza (V1877-10). **La regla de recompra de un año** (art. 33.5.e LIRPF, DGT V1613-25, que solo habla de la conversión a euros; aplicarla también al pago es lectura propia, la prudente) difiere la pérdida de una conversión o un pago si se vuelve a adquirir la divisa en el año siguiente, y la integra cuando se convierte o se paga con la readquirida (`4:currency_wash_sale`, certeza alta en la regla y media en los detalles, riesgo en las dos direcciones; el detalle, en `fiscal-questions.md` #4). Lo que convierte el bróker por su cuenta se valora con `broker_settled_eur` (`4:auto_conversion`, abierto hasta ver un extracto de IBKR). Spec 029 y ADR-0036; criterio de Atlas (#4).

### 5.8 Obligaciones informativas

**Modelo 720** — declaración informativa (no se paga nada) si los bienes en el extranjero superan **50.000€ por categoría** (cuentas, valores, inmuebles).

**Solo obligan a los residentes fiscales en España**, el 720 y el 721 (arts. 42 bis.1, 42 ter.1 y 42 quater.1 RGAT, releídos en el BOE el 2026-10-26: «las personas físicas y jurídicas residentes en territorio español»). Si la `tax_residence` en vigor a 31/12 del ejercicio (§5.9: España no fracciona el año; vigente según el día en que se registró, como en el traspaso) no es `ES`, los dos modelos responden **«sin obligación: no residente en España»** (periodo `not_resident`, nota `informative_not_resident`), sin veredicto por categoría. «Extranjero» sigue siendo fuera de España, sea cual sea la residencia: no se compara con `tax_residence`. Decidido con Coordinación el 2026-10-27.
- Aplica a IBKR y a cualquier entidad extranjera. **No aplica a MyInvestor** — pero no por ser entidad española: el criterio legal es dónde están **situados** los bienes, y un fondo luxemburgués está en el extranjero. Lo que salva el caso es que en cuenta ómnibus la titular formal es la comercializadora española, que informa por sus propios modelos. **Comprar un fondo extranjero en una plataforma extranjera cambiaría la respuesta.**
- Se repite si el valor sube más de 20.000€ sobre la última declaración presentada **o si se deja de ser titular** de un bien previamente declarado (extinción). Sin el segundo disparador, la aplicación diría "no hace falta declarar" en un año en que sí hace falta.
- **Una venta parcial también es extinción**: obliga la **transmisión** de un bien (cuenta + activo) de la última declaración presentada, aunque luego se recompre y la cantidad neta no baje. Se mira desde el cierre del año de esa declaración hasta el 31/12 del ejercicio, con la **fecha fiscal** del activo (la misma de las tenencias: `value_date` en fondos). Cuentan la venta, lo que entrega una permuta, lo que sale de una cuenta en un traspaso y la venta forzosa de una operación corporativa; no un `split`, una conversión, un `grant`, un dividendo ni un evento anulado. Lo nunca declarado no obliga. Las cuentas de efectivo conservan su regla (se extinguen al cerrarse). **Certeza:** alta para la venta, media para el traspaso saliente y la permuta (extensión prudente sin consulta). **Si fallara:** en la venta, no presentar una informativa obligatoria (sanción formal); en traspaso y permuta, presentar de más, que no tiene sanción. Fuentes y detalle en el criterio #11 (bis) de `docs/fiscal-questions.md`.

**Las dos cifras de una cuenta.** Una cuenta se juzga por el **saldo a 31/12** y por el **saldo medio del cuarto trimestre**, los dos, tanto para el umbral como para la subida de 20.000€ (criterio #11). El saldo medio es la media de los saldos al cierre de cada día natural entre el 1 de octubre —o el primer movimiento de la cuenta, si es posterior— y el 31 de diciembre, con una cuenta cancelada contando cero desde su cierre. Las dos cifras se convierten con el **último tipo del BCE que el libro conoce** para esa divisa, y la aplicación **lo marca** cuando no es el de fin de año. El día de referencia no es el 31/12 a secas sino el **último día hábil** hasta él inclusive, porque el BCE no publica en fin de semana. Dentro de la categoría, los saldos **negativos netean** con los positivos.

**Los valores van en un bloque único.** Valores, instituciones de inversión colectiva y seguros comparten un solo umbral (art. 42 ter.4.c), así que fondos, ETF, ETC, ETP y acciones se suman juntos, y **la clave con la que cada uno se rellene en el impreso no mueve el umbral**. Qué clave le corresponde a cada vehículo es una pregunta abierta de `docs/fiscal-questions.md`, no un criterio aplicado: la aplicación decide si hay que presentar, no rellena el modelo. **Ningún ETP va al 721**: es un valor.

**Con qué valor.** Fondos, ETF y monetarios (IIC) se declaran por su **valor liquidativo** a 31/12; acciones y ETC, por la cotización de ese día (criterio #11 de `fiscal-questions.md`). Atlas toma la `valuation` que anotes y te recuerda lo primero con `informative_iic_net_asset_value`.

De las tres categorías del modelo, la aplicación calcula **dos** —cuentas y valores—: en el libro no hay inmuebles.

**Plazos de presentación del 720 y del 721** (verificados el 2026-10-04, `specs/020-visual-refresh/questions.md (en el historial de git)` §14). Los dos se presentan **entre el 1 de enero y el 31 de marzo del año siguiente** al ejercicio: art. 7 de la Orden HAP/72/2013 (<https://www.boe.es/buscar/act.php?id=BOE-A-2013-954>; el artículo no ha sido modificado, la Orden HFP/1180/2023 toca otros preceptos) y art. 4 de la Orden HFP/886/2023 (<https://www.boe.es/buscar/act.php?id=BOE-A-2023-17429>; solo su anexo se sustituyó, por la Orden HAC/1504/2024). La AEAT lo confirma para el ejercicio 2025, «del 1 de enero al 31 de marzo de 2026», en sus páginas de plazos de presentación del [720](https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-720-decla_____sobre-bienes-derechos-extranjero_/plazos-presentacion.html) y del [721](https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-721-decla-sobre-monedas-extranjero/plazos-presentacion.html). **Si el 31 de marzo cae en sábado o domingo** (ejercicios 2017, 2018 y 2023 del 720 y 2023 del 721, cuyo 31/03 fue sábado 31/03/2018, domingo 31/03/2019 y domingo 31/03/2024; también lo serán los ejercicios 2028, 2029 y 2034), el plazo se prorroga al **primer día hábil siguiente** (02/04/2018, 01/04/2019, 01/04/2024): art. 30.5 de la Ley 39/2015 (<https://www.boe.es/buscar/act.php?id=BOE-A-2015-10565>), aplicable de forma supletoria a lo tributario (disposición adicional 1.ª 2.a de la Ley 58/2003). La aplicación lo calcula (sábado o domingo → lunes) para cualquier ejercicio y lo muestra como **prórroga legal**, con la nota de que conviene presentar antes (como muy tarde, el último día hábil anterior). **No verificado**: no se encontró un calendario de la AEAT de esos años que lo confirme. Los festivos no se modelan: si el día resultante es el lunes de Pascua (02/04/2018 y 01/04/2024), el art. 30.6 lo hace depender de la comunidad del contribuyente.

**Modelo 721** — equivalente para los criptoactivos **custodiados por un tercero en el extranjero** por encima de 50.000€, con un umbral único **sobre el conjunto**, no por categorías como el 720. **La autocustodia queda fuera** (criterio #11). Existe desde el ejercicio **2023** (Orden HFP/886/2023), y un ejercicio anterior no tiene 721.
- **Se valora a la cotización de 31 de diciembre** que ofrezcan las principales plataformas, indicando la usada (art. 42 quater.3.c RGAT, releído en el BOE el 2026-10-27): para la cripto **no hay media del cuarto trimestre**, igual que para los valores del 720: esa media solo existe para las **cuentas** (art. 42 bis RGAT).
- **No aplica a un ETP**, que es un valor, no una tenencia de criptoactivos.
- La regla de los 20.000€ y la extinción **también se le aplican** (art. 42 quater.6), pero cuenta **solo el saldo a 31/12**, nunca la media.
- **La aplicación sobredeclara, a propósito y dicho.** El libro no distingue una cuenta de autocustodia de la de un custodio extranjero, así que cuenta **todo** lo que hay en una cuenta cuyo país no es España y emite una nota que lo dice: «se cuenta todo lo que hay en cuentas extranjeras; si alguna es de autocustodia, no entraría». Sobredeclarar en una declaración informativa es la dirección prudente, y un campo nuevo en la cuenta no se justifica mientras la cripto sea vía ETP.

**Nunca se dice «no obligado» con datos incompletos.** El veredicto solo puede ser «no obligado» con todos los bienes de la categoría valorados y ninguna valoración marcada; si falta algo, es «no se puede determinar», con lo que falta como acción. La excepción es que lo que sí se conoce ya supere el umbral: entonces obliga igual, y la salida nombra con qué valores marcados se decidió. Todas las comparaciones son **estrictamente mayores**: 50.000,00€ no obliga y 50.000,01€ sí.

**Y una categoría sin ningún bien registrado tampoco es «no obligado»: es «nada registrado».** Un libro en el que no se ha anotado nada del extranjero no es un libro que se calculó y salió por debajo del umbral, y decirle «no estás obligado» a quien no ha metido nada es exactamente la clase de afirmación que esta aplicación no hace.

El veredicto solo existe para un 31 de diciembre que ya ha pasado; del año en curso se enseña lo que hay el día de la consulta, dicho como tal.

→ La app avisa al acercarse a los umbrales, con margen configurable (§7).

### 5.10 Fecha fiscal por tipo de activo

La fecha que determina el ejercicio, la antigüedad del lote, el tipo de cambio y la ventana de recompra es la **fecha de contratación** para valores cotizados (acciones, ETF, ETC, ETP; una venta el 30/12 con liquidación el 02/01 es del ejercicio anterior) y, para fondos, la **fecha del valor liquidativo aplicado** al reembolso o la suscripción, que el libro guarda en `value_date`. Ese día el partícipe deja de serlo y pasa a ser acreedor del fondo, aunque el dinero llegue días después: DGT **V1017-10** (14/05/2010, vinculante, con informe de la CNMV: el reembolso «se devenga en la fecha del valor liquidativo aplicable») y **V1257-22** (06/06/2022), las dos releídas en PETETE el 2026-10-26. **No es la «fecha valor» del abono en la cuenta de efectivo**: un reembolso del 30/12 cuyo dinero llega el 02/01 es del año del valor liquidativo (`docs/statements/myinvestor.md`). Certeza alta en el principio; media-alta para un fondo ordinario, porque la consulta trata de fondos de inversión libre. Si fallara (se usara la fecha del abono), con ganancia se pagaría de menos ese año y con pérdida se perdería su compensación. Parametrizada por tipo de activo (`fiscal_date_rule`, ADR-0013); el libro guarda siempre ambas fechas.

### 5.9 Residencia fiscal

- Se es residente si se pasan más de 183 días del año natural en España, o si está aquí el centro principal de intereses económicos.
- **España no fracciona el ejercicio**: se es residente o no residente para el año completo.
- Perder la residencia fiscal **elimina el derecho al traspaso**, que es la base de toda la arquitectura de vehículos.

→ La residencia fiscal es un campo de configuración (`tax_residence`), no una constante. Un cambio invalida las funciones de traspaso: con `tax_residence` distinta de `ES` (vigente el día de registro), el traspaso se rechaza al registrarlo y avisa al reproducirlo (`transfer_not_resident`), y el simulador se niega. `ES` se lee sin distinguir mayúsculas ni espacios; vacío cuenta como `ES`. La residencia vigente se resuelve por día de Madrid.

### 5.11 Las casillas de la Renta son datos por ejercicio

Lo que el motor calcula son **conceptos** —el interés del año, el valor de transmisión de una venta, lo que compensa una pérdida de 2023—, y un concepto no depende de ningún impreso. La **casilla** sí: la Agencia Tributaria renumera el Modelo 100 cada campaña (en 2025 los ETF estrenaron un apartado propio, 2224-2236, que en 2024 no existía). Por eso las casillas son **datos por ejercicio** y la tabla de un año **no se hereda nunca**: una casilla prestada es una cifra creíble y falsa que el usuario teclea en una declaración real.

- Un ejercicio sin tabla comprobada sale por conceptos y **sin ningún número**, y lo dice.
- Un concepto sin fila en la tabla de su año sale sin número, y lo dice.
- No hay respaldo ni «año más cercano»: la tabla de otro ejercicio no se consulta en ningún momento.
- **La 0031 sale por filas y como suma.** Cada fila se teclea; la suma (`rcm.transmission_total`) es la misma casilla y solo sirve para cuadrar.
- **Lo que se teclea.** Con casilla, el importe sale como **magnitud**, sin signo, salvo en las casillas que el impreso pide con signo (`SIGNED_CONCEPTS`: rendimientos del capital mobiliario, 0031 incluida): los rótulos dicen qué es (pérdida, gasto, pendiente) y las fórmulas restan (`[0036] – [0037]`). Comprobado el 2026-11-03 en el [diccionario de datos del Modelo 100 de 2025](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/diccionarioXSD_2025.properties) y su [`Renta2025.xsd`](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/Renta2025.xsd): cada casilla está tipada como «solo positivo» (`P102`) o «admite negativo» (`N102`), y solo 0027, 0031, 0036, 0038, 0040 y 0041 admiten negativo (la 0029 de los dividendos, no). Los números de todas las casillas que usa Atlas coinciden; los rótulos de Atlas son los del BOE, más largos que los del diccionario. Sin casilla, la cifra conserva su signo, porque nada más diría que es negativa. La cifra exacta (`exact_eur`) lleva siempre el signo.
- **Apartados de 2025 que no son evidentes.** Los derechos de suscripción (un `grant` de otro activo en un `stock_dividend`, se vendan en el propio evento o después) van a su apartado, 0341-0355; solo la venta del propio derecho, no la de acciones en que se convirtió (cómo se registra un *scrip* en parte vendido y en parte convertido: `data-schema.md` §8.5). Una acción cuyo `market` está fuera de los mercados regulados de la UE (NYSE, Nasdaq, Londres, Suiza… tabla corta en `projections/markets.ts`; un mercado que no conoce, o ninguno, deja la acción donde estaba con la nota `tax_box_market_unknown`, y lo mismo una comprada en Xetra, Fráncfort, Dublín, Milán, Viena, Euronext o BME —escrita con el MIC de toda la bolsa y no con el de su segmento regulado— sin ISIN de la UE en euros, porque lo que cuenta es la admisión del valor y no la bolsa: ayuda de 2025, clave 2, «acciones no admitidas a negociación») va a «otros elementos patrimoniales» con la **clave 2**, como dice la ayuda del Modelo 100; la salida avisa de que el apartado es **dudoso**. Las diferencias de cambio de la divisa y un ETC o ETP configurado como ganancia van a «otros elementos patrimoniales» con la **clave 4** (1626, 1633, 1637, 1638-1639 o 1640-1645-1650), que la ayuda del Modelo 100 de 2025 reserva para «cualesquiera otros bienes o derechos no incluidos en los apartados anteriores»; la salida dice que el apartado se elige **por exclusión**, porque ninguna fuente nombra la divisa. Las dos claves de «otros elementos» suman juntas en 0385 y 0386.

- **El paquete de la Renta** (`rentaPackage`, `@atlas/domain/fiscal`) es un CSV con lo mismo que la pantalla, para guardar, adjuntar o teclear. Tiene una fila `ejercicio` con el impreso en el que se leyeron las casillas, una fila `casilla` por cada concepto, con su número, el rótulo literal y la imagen del BOE, una fila `lote` por cada lote que consumió una venta, con la compra de origen (fecha, cantidad, importe en su divisa y tipo del BCE) o, en una diferencia de cambio, con los lotes de divisa que gastó, y una fila `nota` por cada aviso. No calcula nada. Lleva `;`, coma decimal, UTF-8 con BOM y CRLF. Cualquier campo que empiece por `=`, `+`, `-`, `@`, un tabulador o un retorno va con apóstrofo, para que la hoja de cálculo no lo ejecute; los números, también los negativos, salen como números. Las palabras (apartados, motivos de «parcial» y avisos) las pone la interfaz que ya las dice en pantalla.

**Procedimiento para añadir un ejercicio.** No es copiar el anterior. Se espera a la orden del BOE que aprueba el impreso; se lee cada concepto **en el formulario de ese año**; se transcribe el rótulo palabra por palabra, con la URL de la imagen del anexo y la fecha en que se comprobó; y solo después se compara con el año anterior, como control. La tabla vive como dato, y ningún `if` sobre un ejercicio se escribe fuera de ella. Hoy está comprobado **2025**.

### 5.12 Lo presentado es un hecho, y cierra el ejercicio

La aplicación deja constancia de cada declaración **realmente presentada** —la Renta, el 720 y el 721— con su justificante, sus cifras y su fecha (ADR-0020). Lo presentado es **un hecho, no un cálculo**: se guarda tal como se declaró aunque el motor calcule hoy otra cosa, y al lado se guarda lo que la aplicación calculaba aquel día y la configuración con la que lo hizo, para poder distinguir después un cambio del motor de un cambio del libro.

- **Una complementaria sustituye, no anula.** Es otra presentación que nombra a la que reemplaza; la primera ocurrió y sigue constando. A una fecha dada, la vigente es la última presentada hasta ese día.
- **Un ejercicio con presentación vigente está cerrado** para ese modelo. Escribir en él no se prohíbe —hacerlo tarde puede ser legítimo, y a veces obligatorio—, pero **no debe hacerse en silencio**: la aplicación avisa antes de confirmar, diciendo qué declaración habría que mirar y cuánto se mueve. Avisa en los dos casos: cuando lo registrado cae por fecha dentro del ejercicio cerrado, y cuando mueve una cifra declarada aunque su propia fecha sea de otro año.
- **Cuando no se puede comparar, también avisa, y dice por qué.** Si el libro tiene eventos inválidos, la comparación entre las dos lecturas no se hace —una comparación aproximada sobre un libro roto sería peor que ninguna (ADR-0015)—; tampoco si una de las dos lecturas tendría que empezar antes del primer ejercicio que el motor calcula. En los dos casos el aviso sale igual, **nunca diciendo que no se mueve nada**, y nombra el motivo, porque el primero se arregla reparando el libro y el segundo no tiene arreglo. Hasta la feature 011 el primer caso, con un cambio fechado fuera del ejercicio, no avisaba de nada.
- **Un 720 o un 721 se avisa solo cuando la escritura puede afectarlo.** Sus cifras son valores a mercado y no se comparan con el motor de la Renta, así que el aviso dice que hay que mirarlo a mano. Sale cuando lo que se registra, se corrige o se anula tiene fecha de negocio anterior o igual al 31/12 de ese ejercicio, o cuando se cambia —o se anula un cambio de— la regla de fecha fiscal, que puede mover operaciones de un lado a otro del 31/12. Un umbral, un peso o el seguimiento de órdenes y traspasos no avisan.
- **Una recompra que difiere una pérdida ya declarada obliga a rectificar la Renta.** Si lo que se registra es una adquisición de un ejercicio posterior (`buy`, `swap` o `transfer` entrante, o una entrada de divisa que el motor cuenta como readquisición de la divisa con la que se perdió, letra e) por la V1613-25, ver `4:currency_wash_sale` en [fiscal-questions.md](fiscal-questions.md)) y mueve alguna cifra de una Renta presentada, es una recompra que difiere una pérdida que esa Renta computó. El aviso no dice «puede que toque»; distingue **dos casos por la fecha de la compra frente al fin del plazo de declaración de ese ejercicio** (el 30/06 del año siguiente por defecto, `renta_season_end`):
  - **Compra posterior a ese plazo**: art. 73.2 RIRPF. Hay que presentar la autoliquidación (la AEAT la llama hoy **rectificativa**, con la casilla [121] marcada; el reglamento dice «complementaria») **con intereses de demora**, entre la fecha de la compra y el fin del plazo de declaración del año de la compra (Manual práctico de Renta 2025, cap. 18, y art. 73.2, releídos el 2026-10-27). Con la cripto directa, cuya ventana es el año siguiente a la venta, es el caso real.
  - **Compra anterior al fin de ese plazo, con la Renta ya presentada**: no es el art. 73.2. La Renta presentada queda mal y se rectifica con una autoliquidación rectificativa (casilla [121]) **antes del fin de ese plazo**: dentro del plazo no es extemporánea y no hay recargo; después, el art. 27 LGT (releído en el BOE el 2026-10-27) aplica el recargo de lo presentado fuera de plazo, un 1 % más un 1 % por mes completo de retraso sobre lo que salga a ingresar, y un 15 % pasados 12 meses (sin sanción, con intereses de demora desde que se cumplen esos 12 meses; art. 27.2 LGT). Certeza alta.
  - El art. 73.2 solo cubre las letras e) y g) del art. 33.5 LIRPF. Con la ventana de dos meses (letra f) una compra no puede quedar después del plazo, así que ese artículo no se cita nunca para ella.
  - Si hay compras a los dos lados del plazo, el aviso dice los dos casos: rectificar la Renta por la primera, y el art. 73.2 con intereses por la posterior.
  En cualquier otro caso el aviso dice que puede tocar una autoliquidación rectificativa.
- Un ejercicio pasado **con cifras y sin presentación registrada** no da aviso: da una nota, por si falta registrarla.

---

## 6. Eventos corporativos

Transformaciones que la app debe soportar sin migración de esquema. Se implementan como composición de seis primitivas de lote (`scale`, `convert`, `carve_out`, `forced_sale`, `grant`, `cost_adjustment`; ADR-0011, `docs/data-schema.md` §6.5). El dividendo en efectivo no es un evento corporativo sino un `dividend`. El cambio puro de ISIN/ticker es un `asset_updated`, no un evento corporativo.

| Evento (`corporate_action.kind`) | Efecto sobre los lotes |
|---|---|
| **Split** (`split`, ej. 4:1) | Multiplica cantidad, divide coste unitario. Fecha y coste total intactos. |
| **Contrasplit** (`reverse_split`) | Inverso. Las fracciones sobrantes suelen liquidarse en efectivo: **hecho imponible**. |
| **Dividendo en efectivo** (`cash_dividend`) | No toca lotes. Rendimiento del capital mobiliario. |
| **Dividendo en acciones** (`stock_dividend`) | Lotes nuevos. Fecha y valoración según normativa. Un *scrip* en parte vendido y en parte convertido son dos eventos (`data-schema.md` §8.5). |
| **Fusión / absorción** (`merger`) | Los lotes se transforman en el valor nuevo por canje. Conserva antigüedad. Con régimen de neutralidad, el dinero del canje **rebaja el coste** de lo recibido (arts. 80.3 y 81.2 LIS, criterio #13); los picos que vende el depositario son una transmisión. **Sin régimen no conserva nada:** se registra como `swap`, y `convert` o `carve_out` con `neutrality_regime: false` se rechaza. Si ninguna entidad es española y se aplica la neutralidad, el socio tiene que comunicarlo en el plazo de su declaración (art. 89.1 LIS y art. 48.2 RIS; multa fija de 10.000 € por operación). Requisitos y hueco de la escisión sin régimen: `fiscal-questions.md`, #7 y #13. |
| **Escisión** (`spin_off`) | El coste original se reparte entre matriz y escindida según la proporción publicada. |
| **Fusión de fondos** (`fund_merger`) | Frecuente en indexados. Como el traspaso: conserva antigüedad y coste. |
| **Cambio de clase de participación** (`share_class_change`) | Muy frecuente. Mismo fondo, otro ISIN, otro TER. Conserva antigüedad. |
| **Cierre / liquidación de fondo** (`fund_liquidation`) | Reembolso forzoso. **Sí es hecho imponible.** |
| **Cambio de ISIN o ticker** (`identifier_change`) | Solo metadatos, pero rompe las fuentes de precios. |
| **Exclusión de cotización** (`delisting`) | Posición sin precio. Requiere marcado manual. |
| **Fork o *airdrop* de cripto** (`crypto_fork`) | Activo nuevo con fecha de recepción. Su valor de mercado es **renta de la base general del año** y el coste del lote; la Declaración lo enseña aparte para que lo sumes tú (criterio #8). |
| **Migración de token** (`token_migration`) | Canje. Documentar el criterio aplicado. |
| **Reestructuración de emisor de ETC/ETP** (`issuer_restructuring`) | Puede implicar canje o reembolso forzoso. |
| **Devolución de prima de emisión o de aportaciones** (`capital_return`) | No vende nada: el importe **rebaja el valor de adquisición** de cada lote, por títulos, hasta cero, y el exceso es rendimiento del capital mobiliario (arts. 25.1.e y 33.3.a LIRPF, criterio #26). Solo acciones **admitidas en un mercado regulado de la UE** según el `market` del catálogo, por el MIC del segmento regulado (`RMKT` en ISO 10383, la lista `FUND_REGULATED_MARKETS`); con el MIC de toda una bolsa —Xetra, Fráncfort, Dublín, Milán, Viena— o con Euronext o BME, también su divisa y su ISIN (fuera de él la prima es rendimiento con el tope de fondos propios, no modelado; en una IIC rige el art. 94.1 LIRPF); la reducción con cargo a beneficios es un dividendo. |

Cada evento registrado guarda su **fuente documental** (URL o PDF del emisor).

---

## 7. Parámetros configurables

Ninguno de estos valores va codificado en el fuente. Los valores marcados como *pendiente* dependen del plan financiero privado.

Algunos parámetros tienen un **valor por defecto documentado** (el que aplica mientras el libro no diga otra cosa). Ese valor por defecto **se materializa en el libro** en cuanto se escribe un `settings_changed`, porque cada uno registra la configuración vigente **entera**, no un parche (ADR-0022): un ejercicio calculado hoy se reproduce dentro de quince años aunque el valor por defecto del código haya cambiado, que es lo que un cálculo fiscal necesita.

| Parámetro | Valor sugerido (el código no fija ninguno por defecto: sin el parámetro, el aviso no se evalúa) | Regla asociada |
|---|---|---|
| `target_weights{}` | Pendiente (claves: `asset_id` del núcleo; suman 100) | 1, 2 |
| `deviation_threshold_pp` | 5 puntos (sugerido) | 3 |
| `satellite_min_weight_pct` | 10-12 % según el plan del dueño (privado); sin valor fijado en el código | 6b |
| `monthly_contribution_eur` | Pendiente | 9 |
| `bucket_pct_of_contribution` | Pendiente | — |
| `bucket_max_cumulative_contribution` | Pendiente | 17 |
| `bucket_stop_loss_pct` | Pendiente | 17 |
| `bucket_max_weight_pct` | Pendiente | 18 |
| `bucket_benchmark_asset_id` | Pendiente (`asset_id` del índice de referencia) | 16 |
| `stale_price_days` | 5 (sugerido) | — |
| `model_720_threshold_eur` | 50.000€. Importe por encima del cual una categoría del Modelo 720 obliga a presentar (arts. 42 bis.4.e y 42 ter.4.c RD 1065/2007) | 5.8 |
| `model_720_increase_eur` | 20.000€. Subida sobre la última presentada que vuelve a obligar (arts. 42 bis.5 y 42 ter.5) | 5.8 |
| `model_720_alert_threshold_eur` | 45.000€. Importe al que la aplicación avisa, antes de que el umbral obligue. No es una cifra de la ley: es una elección del usuario, y la validación exige que no supere al umbral | 5.8 |
| `model_721_threshold_eur` | 50.000€ (art. 42 quater.5.d) | 5.8 |
| `model_721_increase_eur` | 20.000€ (art. 42 quater.6) | 5.8 |
| `model_721_alert_threshold_eur` | 45.000€, con el mismo criterio que el del 720 | 5.8 |
| `renta_season_start`, `renta_season_end` | `04-01` y `06-30`, como `MM-DD`. Semanas en que la tarjeta fiscal del Resumen sube arriba del todo: las fechas de la campaña se mueven cada año, así que también son configuración | — |
| `savings_tax_brackets[]` | Ver 5.1 | 5.1 |
| `fiscal_date_rule{}` | cotizados → contratación; fondos → fecha valor. **Mapa parcial**, como el anterior (ADR-0018). Cambiarlo puede dejar el `fx_rate` guardado de una línea sin corresponder a la fecha fiscal nueva; el motor nunca recalcula en silencio. **Antes de confirmar** el cambio, la consola (`atlas settings set`) y la web (Ajustes → Configuración) nombran las líneas cuyo tipo deja de ser el de su fecha fiscal, o que no se pueden verificar sin el histórico; después lo señala `check --deep`, y el informe fiscal lleva una nota mientras queden. La corrección es la de siempre, anulación más línea nueva con el tipo oficial, y la aplicación la **propone** entera para que el usuario la confirme (`atlas fx correct`; en la web, Verificación → Tipos del BCE) (ADR-0029, punto 10; criterio **25** de `docs/fiscal-questions.md`) | 5.10 |
| `wash_sale_window{}` | cripto `"1y"` (solo el año posterior a la venta); cotizados `"2m"`; fondos y monetarios `"2m"`, o `"by_domicile"` si se configura (criterio #2, §5.4) (de fecha a fecha; `wash_sale_window_days` en días es la forma antigua aceptada). **Mapa parcial**: un tipo de activo ausente toma su valor por defecto, para que añadir un tipo nuevo no invalide la configuración ya escrita (ADR-0018) | 5.4 |
| `wash_sale_transfer_counts` | `true`: un traspaso entrante cuenta como adquisición a efectos de la regla de recompra | 5.4 |
| `fx_gain_method` | `currency_first`: la ganancia en divisa se calcula primero en la divisa; `each_leg`, cada pata a su tipo (criterio #4) | 5.7 |
| `income_category` | Por tipo de activo: `capital_gain` (ganancia patrimonial, art. 33) o `movable_capital` (rendimiento del capital mobiliario por transmisión, art. 25.2). **Por defecto `movable_capital` para `etc` y `etp`** (criterio **#24**: consulta vinculante DGT V0267-25, un ETC es un valor de deuda) y `capital_gain` para el resto. **Mapa parcial** (ADR-0018). Es el campo que ADR-0021 dejó previsto para resolver el asunto de los ETC sin tocar código | 5.1 |
| `savings_offset_limit_pct` | `"25"` (%). Parte del saldo positivo de una categoría de la base del ahorro que puede compensar el saldo negativo de la otra (art. 49). Fue 10, 15 y 20 en 2015-2017, así que es configuración y no una constante | 5.5 |
| `loss_carryforward_years` | `4`. Ejercicios a los que se arrastra un saldo negativo de la base del ahorro (art. 49) | 5.5 |
| `treaty_withholding_pct{}` | **Sin valor por defecto, a propósito**: tipo máximo de retención en origen que el convenio de doble imposición permite a cada país, por clave ISO 3166-1 alfa-2. Son cifras de tratados, verificables una a una; un dividendo de un país que no esté aquí, o sin `source_country`, no recibe deducción calculada y la salida dice por qué | 5.6 |
| `transfer_max_days` | Pendiente. Días que puede estar abierta una solicitud de traspaso antes de que la aplicación avise; contados hasta la fecha de la consulta, no hasta hoy | 5.2 |
| `tax_residence` | España | 5.9 |
| ~~`notification_email`~~ | **Sale de `Settings` (ADR-0028, Ronda 8).** El destinatario del correo tiene **una sola fuente, `terraform.tfvars`**, fuera del repositorio, de la que Terraform escribe el parámetro de SSM Parameter Store que lee la Lambda y la condición de IAM que acota el envío (ADR-0034, fila 12). No va en el repositorio porque es un dato personal y el repositorio es público; y no va en `Settings` porque **ninguna cifra del libro lo lee** y quien lo usa es la Lambda que envía el correo: un dato personal que solo usa el servidor vive donde lo lee el servidor (principio IV de la constitución, enmienda 1.6.0: en `Settings` solo la configuración que afecta a cifras del libro). Junto a él, en SSM, va un interruptor que decide si los correos llevan importes (por defecto, no): configuración operativa que ninguna cifra lee y, además, un **campo nuevo**, que en una foto completa (`settings_changed`) un cliente antiguo borraría sin avisar al escribir la foto siguiente (ADR-0026, caso 6; enmienda de ADR-0018, `docs/data-schema.md` §5). El campo `notification_email` se sigue **aceptando al cargar** líneas `settings_changed` ya escritas, para no invalidarlas (ADR-0018: retirarlo del validador sería endurecer), y nadie lo lee. **Retirado con la feature 016 (2026-09-28)**: la web ya no lo ofrece en Ajustes y ninguna foto nueva de `settings_changed` lo lleva, la escriba la web o la consola (`mergeSettings` lo quita). Cambiar el destinatario: [`docs/runbooks/mail-recipient-and-amounts.md`](runbooks/mail-recipient-and-amounts.md) | — |
| `job_frequencies{}` | Cada cuánto corre cada tarea programada (feature 016; `docs/specification.md` §9.5). **Conjunto cerrado de claves y valores, el primero por defecto, sin `off`**: `ecb` (`daily`, `weekly`), `prices` (`daily`, `weekly`), `reminder` (`monthly`, fijo), `backup` (`monthly`, fijo), `integrity` (`quarterly`, `monthly`), `review` (`weekly`, `monthly`), `tax_return` (`yearly`, fijo) e `informative_thresholds` (`yearly`, fijo). Apagar un aviso sería silenciar una alarma (constitución IV), y el recordatorio mensual llega siempre (constitución V). `reconciliation` está **reservada** para la Ronda 6 (la escribe el generador sintético). **Mapa parcial y lectura tolerante** (ADR-0018): una clave ausente toma su valor por defecto; una clave desconocida, un valor que no se admite o una clave reservada no invalidan el libro, se ignoran y se dicen en el registro de la tarea (`job_frequency_unknown_key`, `job_frequency_invalid_value`, `job_not_available`). Hoy ninguna pantalla lo escribe | — |

**Requisitos:**
- Historial de cambios de configuración: cambiar los pesos objetivo altera el cálculo de desviaciones históricas.
- Validación: los pesos objetivo suman 100%; los umbrales deben ser coherentes entre sí.
- **Aviso al modificar un umbral que esté silenciando una alerta activa.**
- **Aviso al cambiar un parámetro fiscal que mueve un ejercicio ya cerrado.** La ventana de recompra, `wash_sale_transfer_counts`, `income_category` y los dos parámetros de la compensación mueven la **base del ahorro** de un ejercicio pasado sin mover ninguna ganancia realizada, así que el aviso relee cada ejercicio pasado con la configuración en vigor y con la propuesta y compara las **tres** cifras que fija una Renta —la base del ahorro, los saldos pendientes y el diferido al cierre—, porque un ejercicio puede conservar la base y aun así mover los siguientes. Dice qué ejercicios se mueven antes de guardar.
