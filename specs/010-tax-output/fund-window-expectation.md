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

Rellenado después, sin tocar nada de lo de arriba.

**El fichero dorado: exactamente dos rutas distintas**, las dos previstas.

```
/2027/capital_gains/lines[0]/criteria[1]:  "2:fund" → "2:fund_1y"
/2027/doubtful:                            10 entradas → 11
```

- ✅ La entrada nueva es `2:fund_1y`, en **tercera posición**, con `measure: "difference"`, las **tres diferencias a cero** y `direction: "none"`, tal y como se razonó: con dos meses, [06/11/2026, 06/03/2027], las dos adquisiciones de `ast_world` siguen dentro y la lectura alternativa difiere lo mismo.
- ✅ **2026, 2028 y 2029, byte a byte.**
- ✅ Ninguna cifra movida en ningún ejercicio.
- ✅ La instantánea del libro, sin cambios.

**El ejercicio calculado a mano de la 009: el dinero en juego cuadró a la primera.** `base_difference_eur` **−10,00**, `pending_difference_eur` **0,00**, `deferred_difference_eur` **+10,00**, dirección **conservadora**, certeza media — exactamente lo calculado a mano en §3, sin tocar un literal. Y ninguna cifra aplicada se movió, porque el libro fija su ventana.

### 5.1 Lo que la predicción erró, y lo que no enumeró

1. **Un valor mal dicho en la predicción.** §2 decía que la entrada nueva llevaría riesgo documentado `aggressive`. Lleva **`conservative`**, y es lo correcto: el criterio se etiqueta por la lectura **aplicada**, y la aplicada en ese libro es el año, que es la lectura conservadora; la agresiva es la de dos meses, `2:fund_2m`. El catálogo estaba bien escrito; la descripción de la predicción, mal.
2. **El libro a mano de la 009 heredaba el valor por defecto.** §3 daba por supuesto que fijaba su ventana. No la fijaba: `exercise-ledger.ts` escribía `{...DEFAULT_SETTINGS}`, así que el cambio **movía sus cifras aplicadas**. Es exactamente la trampa de la nota N17 con `income_category`, y se resuelve igual: el libro **fija ahora `wash_sale_window`** explícitamente, con su comentario, y sus literales vuelven a ser el cálculo que dicen codificar.
3. **La lista de «tests que fijan el comportamiento viejo» no estaba enumerada**, y eran **dieciocho**. Ninguno reveló un fallo del motor; todos eran escenarios apoyados en que un fondo tenía un año. Se resolvieron de tres maneras, según lo que cada test existiera para demostrar:
   - **Fijando la ventana en el libro** cuando lo que se comprueba no es la ventana sino otra cosa (la aritmética de un año desde un 29 de febrero, el invariante de que lo diferido se libera o queda pendiente, el criterio #2b).
   - **Moviendo las fechas dentro de los dos meses** cuando el escenario se sostiene igual (los avisos de compra anterior y de recompra, el traspaso entrante, la venta forzosa, el cambio de configuración de la CLI).
   - **Cubriendo las dos lecturas** en el caso obligatorio de la constitución VII (pérdida en fondo seguida de la aportación mensual): con dos meses difiere −160,00 y con un año −200,00, y ahora se comprueban las dos.
4. **Un detalle de fechas, no de fiscalidad**: una de las fechas nuevas cayó en domingo y el BCE no publica, así que la CLI la rechazó. Corregida al lunes siguiente.

### 5.2 Las dos tablas de valores por defecto: se quedan en dos, y por qué

La dirección pedía unificar `SCENARIO_WASH_SALE_WINDOW` con `DEFAULT_WASH_SALE_WINDOW` o dejar escrito por qué son dos. **Se quedan en dos**, y el motivo se comprobó intentándolo: al unificarlas, el generador empezó a escribir `fund: "2m"` y **el fichero dorado dejó de reproducirse byte a byte**. El dorado está **congelado una vez fusionado** (decisión (i) de la 003), y un generador que lee el valor por defecto lo reescribe cada vez que el código cambia de opinión sobre un criterio. El escenario es **dato**; el valor por defecto es **lo que el código cree hoy**; un *fixture* que sigue al código no demuestra nada del código.

Lo que eso cuesta es deriva, y contra la deriva hay ahora un test: el escenario **tiene que nombrar todos los tipos de activo menos `etf`**, que se deja fuera a propósito para que el dorado ejercite el respaldo por defecto y el informe lo liste en `settings.from_code`. Un tipo nuevo en la enumeración no puede colarse aquí sin que alguien lo vea.

---

## 6. Segunda parte: los monetarios, también a dos meses (2026-09-22)

La dirección nombró solo `fund` por descuido y lo corrige: **`money_market` pasa igualmente a `2m`**, con el mismo fundamento y la misma certeza, y con las mismas variantes del criterio #2.

**Salvedad comprobada antes de aplicarlo.** La dirección pedía parar si `money_market` pudiera designar algo que **no** sea una IIC —letras del Tesoro, un repo, un depósito—, porque entonces el fundamento no le alcanzaría. No es el caso: en este proyecto `money_market` es un **fondo monetario**. Lo dicen las tres fuentes internas: `business-rules.md` y `specification.md` describen la clase `fixed_income` como «Fondos indexados o **monetarios**»; el generador sintético crea su `ast_mm` como «Money Market **Fund**», con ISIN, TER y `transferable: true`; y `transferable` es precisamente el régimen de traspaso español, que **solo** existe para las IIC. Así que el art. 4.9 del RD 1082/2012 le alcanza igual que a cualquier otro fondo.

**Predicción: el fichero dorado no se mueve ni un byte.**

- Los tres `settings_changed` del libro sintético fijan `money_market: "1y"` **explícitamente**, igual que el `fund`.
- El informe congelado **no tiene ninguna transmisión de `ast_mm`**: la única línea que lleva una variante de `2:fund` es la de `ast_world`, y esa ya se movió en la primera parte.
- La alternativa de fondos ya agrupaba `fund` y `money_market`, y en ese libro los dos aplican el año: sigue habiendo **una** alternativa, con los mismos ceros.
- El libro a mano de la 009 y `tax-hand-v1.jsonl` fijan también su ventana: **sin cambios**.

**Lo que sí se mueve son los tests del valor por defecto**, y solo ellos: los dos que afirman `money_market → "1y"` (`settings.test.ts` y `settings/wash-sale.test.ts`), que pasan a `"2m"`.

**Y dos cosas más que la dirección pide en el mismo lote:**

1. **La leyenda de la tabla de criterios** deja escrito qué responde cada columna, porque es la segunda vez que se confunden: la **dirección** dice *hacia qué lado falla si falla*; la **certeza**, *qué probabilidad hay de que falle*; y **subir la certeza nunca cambia la dirección**.
2. **Todo lo que el libro a mano de la 009 hereda en vez de fijar, se fija.** Ya se fijaron `income_category` (nota N17) y `wash_sale_window`; queda **`fiscal_date_rule`**, que sigue viniendo de `DEFAULT_SETTINGS`. Se fija también, para que no haya una tercera vez. Un cálculo a mano cuyos literales dependen de lo que el código crea hoy no es un cálculo a mano.

**Pregunta abierta anotada, para el bloque 2**: con `19` en certeza alta desaparece del apartado de dudosos y **con él los 200,00 € en juego de esa lectura**. Una cifra grande deja de verse porque se ha dejado de dudar de ella. No se resuelve aquí: se decide dónde la ve el usuario cuando se diseñe la salida por casillas y el informe.
