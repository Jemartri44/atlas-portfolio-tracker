# Preguntas fiscales: criterios aplicados

Todo lo que los documentos marcan como *verificar*, consolidado. Cada respuesta se traduce en un valor de `Settings` o en una nota de `business-rules.md`; ninguna exige cambiar el esquema salvo donde se diga.

> **Quién ha respondido esto y con qué valor.** El usuario **no tiene asesor fiscal**, así que los criterios de abajo los ha fijado la dirección del proyecto (2026-09-18) con su mejor lectura de la normativa española, citando el artículo cuando existe y **declarando el grado de certeza de cada uno**. No es asesoramiento fiscal. La regla de uso es esta: mientras las cifras sean pequeñas, estos criterios son razonables y están documentados; **antes de presentar una declaración en la que alguna de las respuestas de certeza media o baja mueva una cantidad que importe, conviene una revisión profesional**. Todas son valores de configuración: cambiar un criterio es un `settings_changed`, no un despliegue (ADR-0013), y las respuestas de certeza baja están marcadas para que se vean de lejos.
>
> Fecha de referencia de la normativa: septiembre de 2026.

| Grado | Qué significa |
|---|---|
| **Alta** | Hay artículo o regla expresa y su lectura no es controvertida |
| **Media** | Hay norma o doctrina aplicable, pero requiere interpretación o hay criterios discrepantes |
| **Baja** | No hay norma específica; el criterio elegido es el prudente y hay que revisarlo si la cifra crece |

---

## Respondidas

| # | Pregunta | Criterio aplicado | Fundamento | Certeza |
|---|---|---|---|---|
| 1 | Fecha de la alteración patrimonial (y del tipo de cambio) | **Cotizados: fecha de contratación. Fondos: fecha valor** del reembolso o suscripción. Es el valor por defecto de `fiscal_date_rule` | La alteración se produce cuando se perfecciona la transmisión; en un fondo, el hecho es el reembolso al valor liquidativo aplicable | Media |
| 2 | Plazo de la regla de recompra | **Dos meses** para valores admitidos a negociación; **un año** para los no admitidos, entre ellos las participaciones de fondos. Para cripto se aplica **un año** por prudencia | Art. 33.5.f) y g) LIRPF. Para cripto no hay norma expresa: el año es el criterio conservador (difiere más pérdida, nunca deduce de más) | Alta (valores) / Baja (cripto) |
| 2b | ¿Un **traspaso entrante** cuenta como adquisición a efectos de la recompra? | **Sí**, cambio respecto al valor por defecto anterior. Unas acciones **liberadas** (`scale`) y un `grant` con coste cero **no** cuentan | Un traspaso entrante es una adquisición de valores homogéneos aunque no haya tributado en origen (art. 94 LIRPF). Contar difiere la pérdida, que es la lectura prudente; no contar la deduce antes y es la arriesgada | Media |
| 3 | Comisiones en la base | La de **compra suma** al valor de adquisición; la de **venta resta** del valor de transmisión. Las de **custodia, administración o conectividad no son deducibles** en la ganancia patrimonial | Art. 35 LIRPF: gastos y tributos **inherentes** a la adquisición o a la transmisión. Una cuota periódica de custodia no es inherente a ninguna de las dos | Alta |
| 4 | Diferencias de cambio del efectivo en divisa | Generan **ganancia o pérdida patrimonial** cuando la divisa se convierte a euros, se cambia por otra divisa o se emplea en una adquisición. Imputación **FIFO por divisa** | La moneda extranjera es un elemento patrimonial y su variación de valor aflora con la alteración; el FIFO se aplica por analogía con el art. 37.2 | Media |
| 5 | Tipo de cambio en días sin publicación del BCE | **El último publicado anterior**, guardando siempre su fecha (`fx_rate_date`) | Práctica habitual y reproducible desde la tabla oficial; el libro guarda la fecha para poder rehacerlo | Media |
| 6 | Redondeo a céntimos | **Half-up, una vez por operación**, nunca por lote | Convención contable ordinaria; la norma no impone método. Lo importante es aplicarlo una sola vez y de forma consistente | Media |
| 7 | Reparto del coste en una escisión | **La proporción que publique el emisor**; si no publica ninguna, los valores de mercado del primer día de cotización separada | Es el criterio que sostiene la propia sociedad y el que la administración puede contrastar | Media |
| 8 | Fork de cripto | **Coste de adquisición cero y fecha del fork** | Sin norma específica. Coste cero es el criterio prudente: al vender tributa todo, nunca se deduce un coste no acreditado | Baja |
| 9 | Pérdida por liquidación de una sociedad | Computable **cuando la sociedad se disuelve y se liquida**, por la diferencia entre la cuota de liquidación y el valor de adquisición. **Una exclusión de cotización no basta** | Art. 37.1.e) LIRPF. Sin disolución no hay alteración patrimonial, solo un valor que nadie cotiza | Alta |
| 10 | Compensación de pérdidas con rendimientos del capital mobiliario | Hasta el **25 %** del saldo positivo de los rendimientos de la base del ahorro. El remanente se arrastra **cuatro ejercicios** | Art. 49 LIRPF con el porcentaje vigente desde 2022 | Media-alta |
| 11 | Modelo 720 | Valoración a **31/12**; los valores por su cotización a esa fecha convertida al tipo del BCE del día (o el último anterior). Umbral de **50.000 € por categoría** (cuentas / valores / inmuebles), con aviso configurable a 45.000 €. Se repite la declaración solo si una categoría **sube más de 20.000 €** sobre la última presentada | Normativa del modelo 720 y reglas de valoración del Impuesto sobre el Patrimonio | Media |
| 12 | Retención en reembolsos de fondos | **19 % sobre la ganancia patrimonial** calculada por la comercializadora; se registra en `sell.withholding` y se resta de la cuota | Art. 101.6 LIRPF. Solo la practican las comercializadoras sujetas a retención en España | Alta |
| 13 | Fusión o canje con **compensación en efectivo** | El efectivo recibido **tributa como ganancia patrimonial** en el ejercicio del canje, con el coste proporcional de los títulos entregados. Se registra como venta parcial de las antiguas antes del `convert` (`data-schema.md` §6.5) | En un canje acogido al régimen de neutralidad, la parte en dinero queda fuera del diferimiento | Media |
| 14 | ¿La ventana se cuenta de fecha a fecha? | **Sí, de fecha a fecha** en meses y años naturales, con el día inexistente llevado al **último del mes** (31 de enero más un mes = 28 o 29 de febrero). El último día de la ventana **sí** avisa | Cómputo civil de plazos por meses (art. 5 CC): de fecha a fecha, no en número fijo de días. Es lo que corrigió ADR-0014 | Alta |
| 15 | Pérdida diferida cuyos lotes se **traspasan o canjean** antes de liberarse | El diferimiento **viaja con los lotes descendientes** (`source_lot_id`) y se libera cuando estos se transmiten | Sin norma expresa. Es la única lectura coherente con que los descendientes conserven antigüedad y valor de adquisición (art. 94 LIRPF); la alternativa haría desaparecer la pérdida para siempre | Media-baja |
| 16 | Deducción por doble imposición de dividendos extranjeros | La menor de: (a) el impuesto efectivamente satisfecho en el extranjero **limitado al tipo del convenio** con el país del pagador —el exceso se reclama a ese país, no a la AEAT— y (b) el tipo medio efectivo aplicado a esa renta. Por eso `dividend` guarda `source_country` | Art. 80 LIRPF y convenios de doble imposición | Alta |

## Lo que sigue sin respuesta y por qué

- **Nada bloquea el motor fiscal de la Fase 5.** Los dieciséis criterios están fijados y son configurables.
- Las respuestas de **certeza baja** (8, y la parte de cripto de la 2) y **media-baja** (15) son las que conviene revisar con un profesional antes de que muevan una cantidad relevante. Las tres son conservadoras: si resultan estar equivocadas, el error habrá sido pagar de más o deducir de menos, nunca al revés.
- Queda abierta una decisión **de diseño**, no fiscal: qué deja registrado el libro sobre lo ya declarado (evento `tax_return_filed`), sin lo cual un cambio de criterio reescribe en silencio un ejercicio presentado, la regla de los 20.000 € del 720 no es calculable y el arrastre de pérdidas no tiene ancla. Está en la Ronda 9 de `docs/decision-roadmap.md`.
