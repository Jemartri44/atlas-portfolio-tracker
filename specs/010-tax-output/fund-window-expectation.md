# Predicción: qué mueve la ventana de recompra de los fondos, de un año a dos meses

**Fecha**: 2026-09-22 · **Decisión de la dirección** (2026-09-22), con las fuentes leídas en el original.

**Se escribe y se comitea antes de tocar el valor por defecto ni el catálogo.** Después se regenera lo que haya que regenerar y se compara. **Cualquier diferencia que no esté aquí es un hallazgo: se para y se pregunta.** Y lo que la dirección dejó dicho sin margen: **si un ejercicio calculado a mano se mueve, se rehace a mano**, con la ventana nueva, y el código se contrasta contra eso; nunca al revés.

---

## 1. Qué cambia

**`DEFAULT_WASH_SALE_WINDOW.fund`: `1y` → `2m`.** La cadena de fundamento, que va escrita en el criterio #2:

- **Art. 33.5 f) y g) LIRPF**: lo único que separa los dos meses del año es estar «admitidos a negociación en alguno de los mercados secundarios oficiales definidos en la Directiva 2014/65/UE». La ley **no menciona los fondos**.
- **Art. 4.9 del RD 1082/2012**: cumplir la obligación de difusión diaria del valor liquidativo «determinará que las participaciones […] **tengan la consideración de valores admitidos a cotización**».
- **DGT 0011-00** (17/02/2000) y **DGT V2067-06** (20/10/2006), las **dos únicas** consultas sobre esto: encajan las participaciones de fondos en la **letra f)**.
- **Manual de ayuda del Modelo 100, edición IRPF 2025**: al enumerar el supuesto de **dos meses** incluye «los fondos de inversión que cumplen las obligaciones de información diaria establecida en la normativa que regula las IIC». El ejemplo del **año** son las SICAV y SOCIMI del MAB, no los fondos.
- **Guía de fiscalidad de fondos de la CNMV**: solo contempla dos meses.

**Certeza media y dirección agresiva**, y por qué: el fundamento reglamentario está redactado para **fondos españoles gestionados por una SGIIC e inscritos en la CNMV**, y **ninguna fuente resuelve qué pasa con un UCITS irlandés o luxemburgués**, que es lo que se contrata habitualmente en España. El manual de la AEAT no distingue, pero es un manual, no una norma.

**El catálogo, con los dos identificadores explícitos** (decisión de la dirección): **`2:fund_2m`** (dos meses, la lectura documentada ahora) y **`2:fund_1y`** (un año, la contraria, que pasa a ser la conservadora). **`2:fund` a secas se retira**: un identificador jamás cambia de significado, y hoy significa «un año, indiscutido». `2:listed` y `2:crypto` se quedan como están.

Y con ellos: `windowCriterion("fund", "1y")` deja de caer en `2:other` —un año ya no es una ventana que nadie sostenga— y **aparece un par de alternativas para fondos** en `alternatives()`, porque un criterio dudoso sin cifra no sirve de nada.

### 1.1 Lo que **no** cambia, y hay que decirlo

**`money_market` se queda en `1y`.** La dirección nombró `wash_sale_window.fund` y solo ese. Un fondo monetario es una IIC con valor liquidativo diario, así que el mismo razonamiento le aplicaría; dejarlo en un año es una **incoherencia que queda señalada y sin resolver**, no una decisión. Va preguntada.

## 2. Qué se mueve en el fichero dorado

**El valor por defecto no mueve ninguna cifra del libro sintético**: sus tres `settings_changed` fijan `fund: "1y"` **explícitamente**. Lo que se mueve es la **etiqueta** y el **apartado de dudosos**.

`synthetic-v1.jsonl` omite `etf`, que sí cabalga sobre el valor por defecto — pero el de `etf` es `2m` y **no cambia**.

**Una sola línea de fondo en todo el informe**: `ast_world` en 2027.

1. **Su lista de criterios**: `["1","2:fund","3","6","14","18"]` → `["1","2:fund_1y","3","6","14","18"]`. Misma posición (el orden del catálogo no cambia entre los dos).
2. **2027 gana una entrada de dudosos, `2:fund_1y`**, con certeza `medium`, riesgo documentado `aggressive` y **las tres diferencias a cero**. El porqué de los ceros: la venta de `ast_world` del 06/01/2027 difiere −90,82 con adquisiciones el **03/01/2027** (anterior) y el **05/02/2027** (posterior); con la ventana de dos meses, [06/11/2026, 06/03/2027], **las dos siguen dentro**, así que la lectura alternativa difiere exactamente lo mismo. `direction` será `none`.
3. **2026, 2028 y 2029, idénticos byte a byte**: no tienen ninguna transmisión de fondo, y como la alternativa no mueve 2027, tampoco mueve la cadena.

La entrada nueva va **en tercera posición** de la lista de 2027, que pasa de diez a once: el orden es el del catálogo, y `2:fund_2m`/`2:fund_1y` van tras `2:crypto_2m` y antes de `2:other` y `2b`.

**La instantánea del libro no se mueve**: no guarda criterios ni ventanas resueltas.

## 3. Qué se mueve en el ejercicio calculado a mano de la 009, **rehecho a mano**

El libro a mano fija `fund: "1y"` explícitamente, así que **ninguna cifra aplicada se mueve**. Lo que aparece es una **lectura alternativa nueva** cuyo dinero en juego hay que calcular, y se calcula aquí a mano, no con el motor.

**El único diferimiento de fondo del ejercicio es E11**, y es el que la ventana de dos meses deshace:

- **E11** (venta de `fund_a` el 01/03/2028, 40 participaciones a 8,00; coste 400,00, cobro 320,00 → propio **−80,00**). Las únicas adquisiciones de `fund_a` son **E1** (01/02/2027) y **E15** (01/06/2028).
  - Con **un año**, ventana [01/03/2027, 01/03/2029]: E15 está dentro → difiere **−40,00** (20 de las 40 participaciones), computable **−40,00**.
  - Con **dos meses**, ventana [01/01/2028, 01/05/2028]: E1 queda fuera por mucho y **E15 también** (01/06/2028 es un mes más tarde). **No difiere nada**: computable **−80,00**.
- **E20** (venta de `fund_b` el 15/11/2028) libera en el caso base los **−30,00** que el traspaso E18 le trajo de E11, y su computable es **+135,00**. Sin diferimiento en E11 no hay nada que liberar: **+165,00**.
- Ninguna otra transmisión cambia: E12 y E19 son del ETC (dos meses ya), E13, E17 y E21 no son fondos, y E20 tiene ganancia, así que no se plantea diferir.

**Saldos de 2028 con la lectura alternativa**:

- Ganancias: **372,50** (caso base) **− 40,00 + 30,00 = 362,50**.
- Rendimientos: **64,00**, sin cambio.
- Fase 2 con los −260,80 de 2027, misma categoría y sin límite: 362,50 − 260,80 = **101,70**.
- **Base 2028 alternativa: 101,70 + 64,00 = 165,70** (caso base **175,70**).
- Diferido pendiente a 31/12/2028: el caso base deja **−20,00** (−10,00 de E11, que viajó, y −10,00 de E19); sin el diferimiento de E11 queda **−10,00**.
- Pendiente de compensar a 31/12/2028: **0,00** en las dos lecturas.

**Dinero en juego del criterio de la ventana de los fondos en 2028**:

| Cifra | Valor |
|---|---|
| `base_difference_eur` | **−10,00** |
| `pending_difference_eur` | **0,00** |
| `deferred_difference_eur` | **+10,00** |
| `direction` | **conservative** (la alternativa da **menos** base: la lectura aplicada declara de más) |

**2027 del ejercicio no gana entrada**: no tiene ninguna transmisión de fondo y la alternativa no mueve sus cifras.

Y la entrada exhaustiva de dudosos de 2028 pasa de

`["1","2:listed","4","15","17","21","22","24:etc_gain"]` a `["1","2:listed","2:fund_1y","4","15","17","21","22","24:etc_gain"]`,

con `2:fund_1y` en **tercera posición**, por el orden del catálogo.

## 4. Qué más toca, fuera de las cifras

| Sitio | Qué |
|---|---|
| `packages/domain/src/synth/scenario.ts` | **Duplica los valores por defecto** (`SCENARIO_WASH_SALE_WINDOW`), así que cambiar `DEFAULT_WASH_SALE_WINDOW` **no mueve el generador**. Se unifica: el escenario pasa a usar el valor por defecto del dominio, y así deja de haber dos fuentes de verdad para lo mismo |
| `tests/fiscal-criteria.test.ts` | `DOCUMENT_SILENT`: se retira la entrada de `2:fund` y entra la de `2:fund_1y`, solo para el riesgo, como `2:listed_1y` |
| `test/tax/review.test.ts` | `windowCriterion("fund", "1y")` deja de ser `2:fund`; y el caso que afirma que dos meses en un fondo cae en `2:other` deja de ser cierto |
| `test/tax/exercise.test.ts` | Dos listas de criterios (`2:fund` → `2:fund_1y`) y la lista exhaustiva de dudosos de 2028 |
| `apps/cli/test/commands/tax-figures.test.ts` | `"1* 2:fund 3 6 14 18*"` → `"1* 2:fund_1y* 3 6 14 18*"`: con certeza media, el criterio pasa a llevar estrella |
| CLI | Textos que enseñan el valor viejo como ejemplo y la etiqueta «ventana de un año (fondos)» |
| `docs/business-rules.md` §5.4, `docs/data-schema.md` §8.4, `docs/fiscal-questions.md` fila #2, ADR-0013 y ADR-0014 | El valor por defecto nuevo y su fundamento |

**Y dos erratas documentales que este cambio se lleva por delante**, las dos verificadas contra el BOE:

1. **ADR-0013 cita el año de los fondos como «art. 33.5.f)». Es la letra g)**: la f) son los dos meses de los admitidos a negociación.
2. **`docs/fiscal-questions.md` afirma que «el catálogo de activos no guarda dónde cotiza cada valor». Ya no es cierto**: `asset.market` existe desde la feature 008 y se vuelca al informe, aunque no gobierne la ventana.

Y queda anotado que **`issuer_country` deja de ser un campo sin uso**: es el dato que permitiría distinguir un fondo español de un UCITS extranjero el día que se decida afinar la ventana por activo. **No se implementa ahora.**

---

## 5. Resultado de la comparación

Se rellena después, sin tocar nada de lo de arriba.

- [ ] El dorado: solo 2027, solo la lista de criterios de `ast_world` y una entrada de dudosos con tres ceros.
- [ ] 2026, 2028 y 2029, byte a byte.
- [ ] El ejercicio a mano: **−10,00 / 0,00 / +10,00**, conservador, y ninguna cifra aplicada movida.
- [ ] La instantánea del libro, sin cambios.
