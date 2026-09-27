# Especificación de la feature: la capa visual siguiente (`020-visual-refresh`)

**Rama**: `feature/020-visual-refresh`, creada desde `origin/develop` (`ae66814`, la fusión de la PR #98, que cierra la 015 entera: `git log origin/develop..origin/feature/015-api-access` sale vacío).

**Creada**: 2026-09-27 (Europe/Madrid)

**Estado**: **borrador para el alto del plan**. Espera el visto bueno de la dirección junto con [`plan.md`](plan.md) y [`questions.md`](questions.md). No hay ni una línea de código de producción.

**Entrada**: `docs/prompts/020-visual-refresh.md` entero, con las respuestas de su §8.1 (P1-P9, M2, y la segunda ronda: B1-B3, N1-N4 y la preferencia aceptada). Además: la propuesta `docs/design/proposals/2026-09-25-visual-improvements.md` y sus dos maquetas, `docs/design/brief.md` y `docs/design/system.md` enteros; ADR-0017, ADR-0023, ADR-0019, ADR-0024, ADR-0013, ADR-0014, ADR-0015, ADR-0016 y ADR-0020; `docs/business-rules.md` (regla 2, reglas 16-18 y la tabla de `Settings`); `specs/015-api-access/questions.md` §24.11, §26.5, §27.3, §28.4, §28.5, §30.5, §32.2, §33.2, §33.4 y §34.2. Constitución 1.6.2. **Donde la maqueta y el texto de la propuesta discrepan, manda el texto** (§8 P6 del encargo), y la discrepancia se dice.

---

## Resumen

La web ya tiene su sistema «papel y tinta» (`system.md`). Esta feature es **la capa siguiente**, lo que se ve mal con dos años de datos y la privacidad puesta, que es como se abre la aplicación:

- que el estado por defecto **informe**, con un porcentaje junto a cada importe oculto, en vez de enseñar muros de «•••• €»;
- que el primer pantallazo del Resumen **siga la importancia**: primero el riesgo de perder datos, y *Declaración* arriba solo en la campaña de la Renta;
- que el monitor de 2045 px **se aproveche**;
- que ganancia y pérdida **se distingan también con daltonismo** y dejen el rojo para los problemas;
- que las gráficas **digan algo** con precios anotados a mano: lo aportado como espina sin huecos, cada bloque con su escala, el cubo en porcentaje;
- que **el tiempo fiscal se vea**: un calendario anual con las fechas que cuestan dinero.

Son las mejoras **M1 a M13** de la propuesta, que el usuario aprobó enteras. **M14** (los estilos de cada pantalla, perezosos) **no entra** salvo que una medida real del arranque no quepa (§8 P2 del encargo). Se suma el defecto del ancla `/ajustes#sincronizacion` que dejó la 015.

Se entrega en **cuatro partes**, una PR por entrega desde esta rama:

| Entrega | Qué deja funcionando | Toca el dominio |
|---|---|---|
| **E1** | El marco y el color: ganancia y pérdida fuera del rojo y probadas contra el daltonismo (M6), el paso de 1.800 px (M4), Registrar compacto (M11), el pulido (M13) y el ancla que la barra tapa | No |
| **E2** | El primer pantallazo y la lista: el Resumen por importancia (M2) y Movimientos más densos (M8) | Sí: `fiscalAttention` y `hasForeignAccountsAt` |
| **E3** | La privacidad que informa: un porcentaje junto a cada máscara (M1), tablas con privacidad (M9), la tira de desviación (M5), los medidores del cubo y las mancuernas de las tesis (M10) | Sí: exportar `NEAR_LIMIT_PCT`, y lo que el plan declara (plan §4) |
| **E4** | Las gráficas y el tiempo: la evolución en paneles con lo aportado (M3), el rango «Este año», el cubo en porcentaje (M7) y el calendario fiscal (M12) | Sí: lo aportado, el cubo en porcentaje por fecha y el calendario |

Seis reglas atraviesan la feature (§0 del encargo):

1. **Ningún importe ni ninguna cantidad se ve con la privacidad puesta**, tampoco en una frase, un `title`, un `aria-label`, el `<title>` o el `<desc>` de un SVG, ni en la tabla equivalente de una gráfica. `Amount` sigue siendo la única puerta.
2. **Ninguna cifra fiscal se mueve.** La salida fiscal de `synthetic-v1` da los mismos bytes antes y después de cada entrega con dominio.
3. **Ninguna regla de dominio en la web.** Qué es lo aportado, cuándo es la campaña, cuándo termina una ventana, cuándo sube *Declaración*, qué activo está fuera de umbral: lo decide `packages/domain`. La web traduce, coloca y dibuja.
4. **Ningún porcentaje que se lee se calcula con `number`**, y se redondea una sola vez, al mostrarlo.
5. **Ni una dependencia nueva, ni un valor fuera de `tokens.css`, ni un estilo en línea**, con la CSP estricta sin tocar.
6. **El paquete se mide mejora a mejora**; cada techo sube en su propio commit y antes del que lo necesita, y **si no cabe en la autorización (arranque 76.069, total 309.500), se para**.

## Escenarios de usuario y pruebas

El usuario abre Atlas en su móvil (400×890, densidad ×3) y en su monitor (2045×1141), en claro y en oscuro, casi siempre con la privacidad puesta. Todo se prueba con tests que renderizan y recorren texto y atributos, y **se mira en un navegador de verdad**: cada entrega acaba con capturas antes y después, por *viewport*, en esa matriz, con el reloj fijado fuera de la aplicación el 20/01/2029 (fuera de la campaña) y el 15/05/2029 (dentro). **Una entrega con los tests en verde y unas capturas que el usuario no ha visto no está terminada.**

### Historia 1 — Ganancia, pérdida y problema se distinguen, también con daltonismo (Prioridad: P1, E1)

El usuario ve una ganancia en un verde azulado y una pérdida en un naranja tostado, siempre con su signo; el rojo queda solo para un problema de verdad. Quien tiene protanopía, deuteranopía o tritanopía las distingue igual, en claro y en oscuro.

**Por qué esta prioridad**: hoy pérdida y peligro son el mismo rojo (ΔE 2,1) y, en oscuro, ganancia y pérdida no se separan con deuteranopía (ΔE 4,2). Las entregas siguientes usan estos colores.

**Prueba independiente**: la prueba del color del repositorio simula las tres deficiencias sobre los valores de `tokens.css` y exige las separaciones; la matriz de capturas enseña los resultados en las pantallas.

**Escenarios de aceptación**:

1. **Dado** el fichero de variables, **cuando** falta un color en cualquiera de sus tres bloques (claro, oscuro por preferencia, oscuro forzado), **entonces** la prueba falla.
2. **Dado** el par ganancia/pérdida, **cuando** se simula la peor de las tres deficiencias, **entonces** su distancia perceptiva es al menos 8 en los dos temas.
3. **Dada** cualquier hoja de estilos, **cuando** usa el color de ganancia o de pérdida fuera de un resultado (un peso, una desviación, un precio, un saldo), o lo toma por un alias, **entonces** la prueba falla.
4. **Dado** un resultado negativo, **cuando** se muestra, **entonces** lleva el menos tipográfico (U+2212); un cero no lleva signo («0,0 pp»).

### Historia 2 — El monitor se aprovecha y el pulido que hoy se ve desaparece (Prioridad: P1, E1)

A partir de 1.800 px de ancho el texto sube un paso, la gráfica gana altura y el Resumen se ordena en 8+4 columnas con la evolución por encima del pliegue a 2045×1141. Registrar cabe en un pantallazo del móvil. El botón «Importar desde la carpeta de la consola» no se parte; la fecha de Movimientos no es un subrayado en cada fila; la columna *Estado* solo aparece si alguna fila la usa. Al entrar por `/ajustes#sincronizacion`, el título queda debajo de la barra fija.

**Prueba independiente**: medidas en el navegador (`medidas.json`) a 1.799 y 1.800 px, a 2045×1141, a 360 y 400 px, y tras navegar al ancla.

**Escenarios de aceptación**:

1. **Dado** un ancho de 1.799 px, **cuando** pasa a 1.800, **entonces** el tamaño computado del cuerpo cambia justo ahí.
2. **Dado** el Resumen a 2045×1141, **cuando** se abre, **entonces** el borde superior de la gráfica de evolución queda dentro de los 1.141 px.
3. **Dado** `/ajustes#sincronizacion`, **cuando** se abre a 400 y a 2045, **entonces** el borde superior del título es mayor o igual que el borde inferior de la barra superior, y el margen sigue a la variable del alto de la barra.
4. **Dado** Registrar a 400×890, **cuando** se abre, **entonces** las siete baldosas y «Otros registros» están en el primer pantallazo; a 360 px no hay desplazamiento lateral.

### Historia 3 — El primer pantallazo del Resumen dice lo importante primero (Prioridad: P1, E2)

Si los datos viven solo en el navegador y hace más de una semana que no se exportan, la primera línea lo dice, con su acción, siempre. *Declaración* va arriba solo en la campaña de la Renta; fuera de ella es una fila plegada que dice su estado neutro, y lo que haya que hacer del 720 o del 721, o el aviso de movimientos inválidos, va a *Atención*, sin decirse dos veces. Cuando falta un solo precio, «pendiente» ocupa una línea.

**Por qué esta prioridad**: en enero el primer pantallazo del móvil se lo llevan hoy *Declaración* y un bloque «pendiente» por un solo precio, y el riesgo de perder datos aparece a 1,3 pantallas.

**Prueba independiente**: la regla de la tarjeta se prueba en el dominio con la fecha como argumento, en los bordes de la campaña; el orden y la no repetición, en el modelo de vista; el pantallazo y que nada salte al llegar lo perezoso, medidos en el navegador.

**Escenarios de aceptación**:

1. **Dada** una campaña configurada, **cuando** la fecha consultada es su primer o su último día, **entonces** *Declaración* va primera; el día antes y el día después, no.
2. **Dado** un Modelo 720 pendiente fuera de la campaña, **cuando** se abre el Resumen, **entonces** la tarjeta no sube, la fila dice solo su estado neutro y el aviso del 720 está en *Atención*, una sola vez.
3. **Dado** un libro sin ninguna cuenta en el extranjero a la fecha (comparando con la residencia fiscal de `Settings`), **cuando** se abre el Resumen fuera de la campaña, **entonces** *Atención* no reserva ninguna fila; con alguna, reserva una fila de esqueleto que se llena o desaparece sin mover el resto del primer pantallazo.
4. **Dado** el aviso de exportación vencida, **cuando** se abre el Resumen, **entonces** va en su línea, encima de todo (también de *Declaración* en campaña), y no se repite dentro de *Atención*.

### Historia 4 — Movimientos se leen en menos pantallas (Prioridad: P2, E2)

En el móvil los movimientos van bajo una cabecera por mes, con la fecha en la fila, y las valoraciones de un mismo día se agrupan en una fila que se despliega («7 valoraciones · 31/12/2028»), también en *Últimos movimientos*, donde un grupo cuenta como una fila.

**Prueba independiente**: el agrupamiento es una función pura del modelo de vista, probada en sus bordes; la densidad se mide con el libro sintético.

**Escenarios de aceptación**:

1. **Dadas** siete valoraciones del mismo día y una anulada, **cuando** se agrupan, **entonces** la anulada queda fuera del grupo y ninguna valoración de otro día o movimiento de otro tipo entra.
2. **Dado** un movimiento del 31/12 a las 23:30 en Madrid, **cuando** se agrupa por mes, **entonces** cae en diciembre, nunca en enero.
3. **Dado** el libro sintético, **cuando** se listan 20 movimientos en el móvil, **entonces** ocupan menos pantallas que hoy (la propuesta estima 1,6 frente a 2,6), y se mide.

### Historia 5 — Con la privacidad puesta, la pantalla sigue informando (Prioridad: P1, E3)

La aportación del mes dice qué porcentaje va a cada tipo de activo y cómo se parte entre cartera y cubo; el cubo dice qué parte del tope lleva aportada, su resultado sobre lo aportado, cada tesis frente al índice en puntos y el peso de cada posición. Las tablas funden sus columnas de máscaras en una. La desviación de cada tipo de activo se ve como una tira; el cubo, como tres medidores; cada tesis, como una mancuerna.

**Por qué esta prioridad**: es el estado por defecto, y hoy es el que peor informa (el Cubo: 20 máscaras y 7 porcentajes).

**Prueba independiente**: un test renderiza cada pantalla tocada con la privacidad puesta y falla con una sola aparición de un importe o una cantidad del libro sintético en el texto o en un atributo.

**Escenarios de aceptación**:

1. **Dada** la privacidad puesta, **cuando** se recorre el DOM de cada pantalla tocada, texto y atributos incluidos, **entonces** no aparece ningún importe ni ninguna cantidad.
2. **Dado** un total parcial, **cuando** una tarjeta tendría un porcentaje sobre él, **entonces** no lo enseña.
3. **Dado** un activo por encima del umbral **sin** aviso del dominio, **cuando** se dibuja su tira, **entonces** su punto no se colorea: el color sale del aviso, nunca de comparar cifras.
4. **Dado** que el dominio cambia la marca del aviso del tope, **cuando** se dibuja el medidor, **entonces** la marca se mueve con él; la regla de parada y el peso máximo salen de `Settings`.
5. **Dada** la privacidad quitada, **cuando** se abre una tabla, **entonces** es la de hoy, sin la columna fundida.

### Historia 6 — Las gráficas dicen algo y el tiempo fiscal se ve (Prioridad: P2, E4)

La evolución es una pila de paneles que comparten las fechas: arriba la cartera principal con lo aportado en escalón, debajo el cubo y el efectivo, cada uno con su escala. Lo aportado no tiene huecos. El rango «1 mes» pasa a «Este año». El cubo frente al índice se dibuja en porcentaje sobre lo aportado, y si el hueco ocupa más de la mitad del rango, salta al último tramo con datos. En `/fiscal`, y en su versión corta dentro de *Declaración* durante la campaña, una tira anual enseña la campaña, hoy y las fechas que cuestan dinero, con su lista debajo.

**Prueba independiente**: lo aportado, el cubo en porcentaje y el calendario son funciones puras del dominio, probadas caso a caso; la regla del hueco y la de «Este año», funciones puras del modelo de vista, probadas en su borde exacto.

**Escenarios de aceptación**:

1. **Dado** un libro con ingresos y retiradas en cuentas de la cartera principal, dividendos, traspasos y un ingreso en el cubo, **cuando** se calcula lo aportado, **entonces** cuentan solo los ingresos y retiradas de la cartera principal, a su propio tipo de cambio.
2. **Dada** una fecha sin precio de algún activo, **cuando** se dibuja la evolución, **entonces** la cartera se corta ahí y lo aportado no.
3. **Dada** la fecha consultada 15/05/2029, **cuando** se elige «Este año», **entonces** el rango va del 01/01/2029 al 15/05/2029 en Europe/Madrid; sin puntos, el botón se ofrece desactivado y con su motivo.
4. **Dado** un rango en el que el hueco ocupa exactamente la mitad del ancho, **cuando** se dibuja el cubo, **entonces** no salta; con más de la mitad, salta al último tramo y lo dice; sin ningún tramo, enseña el bloque *pendiente* y ninguna gráfica.
5. **Dada** una venta con pérdida y la ventana de recompra de su tipo de activo, **cuando** se construye el calendario, **entonces** el fin de la ventana es el de `washSaleWindowEnd`, sin recalcularlo, y ninguna frase lleva un importe; un ejercicio sin plazo normativo registrado no pinta plazo y lo dice.

### Casos límite

- **El primer día y el último de la campaña**, con una campaña configurada distinta de la de por defecto; el día antes y el de después.
- **Un 720 pendiente fuera de la campaña** con y sin cuentas en el extranjero; **`tax_residence` ausente** (el predicado no supone `ES`: responde que sí y se reserva la fila).
- **Movimientos inválidos fuera de la campaña**: la tarjeta no sube, la fila no repite el aviso y el aviso llega a *Atención* dentro del grupo de inválidos que ya exista.
- **«Pendiente» con un precio que falta** (una línea) y con dos (el bloque de hoy).
- **Valoraciones del mismo día con una anulada**; valoraciones de dos días distintos; un grupo en *Últimos movimientos* cortado por la fecha consultada.
- **Un porcentaje que redondea en el medio** (1,005) y un porcentaje sobre un total parcial.
- **Una compra sin ingreso previo** en la cartera principal (lo aportado no se inventa: plan §5).
- **Un hueco que ocupa exactamente la mitad del rango**; ningún tramo con datos.
- **Una ventana de un año que termina el año siguiente**: la fecha va en la lista y la tira la señala en su borde.
- **Los relojes extremos**: las suites corren igual con `TZ=Pacific/Kiritimati` y `TZ=Pacific/Pago_Pago` y con el reloj del sistema en un 31/12 a las 23:30 y un 01/01 a las 00:30.
- **Anchos**: 360, 400, 1.440, 1.799, 1.800 y 2045 px, sin desplazamiento lateral, con la privacidad puesta y quitada (los importes reales son más anchos que la máscara).

## Requisitos

### Requisitos funcionales

**Transversales (todas las entregas)**

- **FR-001**: Con la privacidad puesta, ninguna pantalla DEBE mostrar un importe o una cantidad, ni en el texto ni en ningún atributo ni en la tabla equivalente de una gráfica; un test que renderiza lo DEBE comprobar en cada pantalla tocada.
- **FR-002**: Ninguna cifra fiscal DEBE cambiar: la salida fiscal (`tax` con `--lots`, `--boxes` y `--json`, `gains`, `income`, `m720`, `m721` y `filed`) de `synthetic-v1` DEBE dar los mismos bytes, con la predicción escrita antes.
- **FR-003**: Toda regla de negocio nueva (lo aportado, la campaña, el fin de una ventana, cuándo sube *Declaración*, qué activo está fuera de umbral, el plazo de un modelo) DEBE vivir en el dominio, en funciones puras con el 100 % de cobertura; la web solo presenta.
- **FR-004**: Todo porcentaje que se lee DEBE calcularse en decimal (dominio o modelo de vista con el decimal del dominio) y redondearse una sola vez al mostrarse.
- **FR-005**: Toda función nueva del dominio DEBE vivir detrás de una puerta perezosa con su guardián de arquitectura y su entrada en la lista de lo que no puede ir en el arranque, salvo `hasForeignAccountsAt` y `NEAR_LIMIT_PCT`, que van en el barril con su coste medido.
- **FR-006**: El color NUNCA DEBE ir solo: signo en cada resultado, forma distinta en cada marca, trazo distinto en cada serie, y renta variable y cripto nunca juntas sin etiqueta directa.
- **FR-007**: Cada SVG nuevo DEBE ser una imagen con etiqueta accesible en porcentajes y fechas (nunca importes, con la privacidad puesta o quitada) o estar oculto con su equivalente en texto al lado; cada gráfica DEBE conservar su tabla equivalente plegada.
- **FR-008**: Ningún objetivo táctil por debajo de 44 px, ningún texto que se lee por debajo de 13 px, ningún desplazamiento lateral de 360 a 2045 px, el orden de tabulación igual al visual y nada nuevo animado.
- **FR-009**: El paquete DEBE medirse mejora a mejora; ningún techo DEBE superar su autorización (arranque 76.069 bytes gzip, total 309.500), y la comprobación del paquete DEBE fallar si un techo la supera.

**E1 — El marco y el color**

- **FR-010**: Los colores de ganancia y de pérdida DEBEN sustituir a los de hoy en los tres bloques de variables, con los valores de la propuesta si pasan la prueba (ver `questions.md` Q1); el color de «paso completado» no cambia.
- **FR-011**: Una prueba del repositorio, sin dependencias, DEBE exigir cada variable en los tres bloques, la separación ganancia/pérdida (≥ 8 en el peor caso de las tres deficiencias, en los dos temas), la separación pérdida/peligro con visión normal, el contraste de texto (≥ 4,5:1) de ganancia y pérdida y el de la espina de lo aportado (≥ 3:1), y la propia simulación contra los valores publicados por su fuente.
- **FR-012**: Los colores de ganancia y pérdida SOLO DEBEN usarse en resultados, sin alias fuera ni dentro del fichero de variables; dos variables de color no DEBEN compartir valor salvo una lista cerrada y justificada en la que no entra ningún color semántico.
- **FR-013**: A partir de 1.800 px, el texto, la altura de la gráfica, el margen, la separación y el ancho máximo DEBEN subir un paso, y el Resumen DEBE ir en 8+4 con *Declaración* a la derecha, nunca sola en su fila.
- **FR-014**: Registrar DEBE mostrar sus siete baldosas en tres columnas de 64 px y «Otros registros» en el primer pantallazo del móvil; los campos cortos van en pareja solo si caben a 360 px.
- **FR-015**: El botón de importar de la carpeta NO DEBE partirse a 400 px; el eje del cubo DEBE llevar unidad; la fecha de Movimientos en escritorio DEBE ir en tinta con la fila entera como objetivo; la columna *Estado* SOLO DEBE aparecer si alguna fila la usa; la lista de *Declaración* no lleva sangría.
- **FR-016**: Al entrar por cualquier ancla de la aplicación, el destino DEBE quedar debajo de la barra superior fija, con un margen atado a la variable del alto de la barra.

**E2 — El primer pantallazo y la lista**

- **FR-020**: *Declaración* SOLO DEBE subir arriba en la campaña de la Renta (ambos extremos incluidos, en la fecha consultada); lo pendiente del 720 y del 721 y los ejercicios sin declarar DEBEN seguir saliendo en el estado fiscal del dominio.
- **FR-021**: El riesgo de perder datos DEBE ir primero y en una línea, siempre, y NO DEBE repetirse en *Atención*.
- **FR-022**: Fuera de la campaña, *Declaración* DEBE ser una fila con su estado neutro, sin repetir ningún aviso; lo pendiente del 720 y del 721 DEBE ir a *Atención*, y el aviso de movimientos inválidos también, sumado al grupo de inválidos si existe.
- **FR-023**: Fuera de la campaña y solo si el libro tiene alguna cuenta en el extranjero a la fecha (según la residencia fiscal de `Settings`, que sin valor no se supone), *Atención* DEBE reservar una fila de esqueleto al final de sus grupos visibles.
- **FR-024**: «Pendiente» DEBE ir en una línea cuando falta un solo precio y en el bloque de hoy con dos o más.
- **FR-025**: El orden del Resumen en el móvil DEBE ser: la línea de perder datos, *Declaración* (solo en campaña), el patrimonio, *Atención*, *Últimos movimientos*, la evolución y la fila de *Declaración* (fuera de campaña).
- **FR-026**: En el móvil, Movimientos DEBE agruparse por mes (Europe/Madrid) con la fecha en la fila, y las valoraciones de un mismo día, no anuladas, DEBEN agruparse en una fila desplegable, también en *Últimos movimientos*, donde un grupo cuenta como una fila y respeta la fecha consultada.

**E3 — La privacidad que informa**

- **FR-030**: Junto a cada importe oculto de la aportación, del cubo y de las tablas DEBE ir su porcentaje, cuando el total sobre el que se calcula está completo.
- **FR-031**: Con la privacidad puesta, las columnas que solo tendrían máscaras DEBEN fundirse en una («importes ocultos»), con los porcentajes delante; con ella quitada, la tabla es la de hoy. La decisión de ocultar sigue siendo de `Amount`.
- **FR-032**: Cada tipo de activo DEBE tener su tira de desviación (pista, objetivo, punto y cifra en pp, en tinta y sin banda), con «⚠ N activos fuera de umbral» cuando el dominio avisa de alguno de ese tipo; la tira completa, con banda y punto coloreado por el aviso, va por activo.
- **FR-033**: El cubo DEBE tener tres medidores (aportado frente al tope con la marca del aviso del dominio, resultado sobre lo aportado con la regla de parada, y peso del cubo sobre el patrimonio con su máximo, señalado como la única cifra que junta los dos libros) y una mancuerna por tesis (punto de la tesis, anillo del índice, línea del 0 % y la diferencia en pp en tinta con su signo).

**E4 — Las gráficas y el tiempo**

- **FR-040**: El dominio DEBE dar lo aportado a la cartera principal en cada fecha de la serie, sin huecos y sin depender de ningún precio, según la definición que la dirección escriba en `business-rules.md` (propuesta en plan §5).
- **FR-041**: La evolución DEBE dibujarse en paneles que comparten el eje de fechas (la cartera con lo aportado en escalón; el cubo y el efectivo, cada uno con su escala y rotulado «escala propia»), sin cifras en los ejes con la privacidad puesta; su tabla equivalente DEBE llevar lo aportado.
- **FR-042**: El rango «1 mes» DEBE sustituirse por «Este año» (del 1 de enero del año de la fecha consultada hasta ella, en Europe/Madrid), desactivado y con su motivo si no tiene puntos, en las dos gráficas con rango.
- **FR-043**: El cubo frente al índice DEBE dibujarse en porcentaje sobre lo aportado en cada fecha, sin porcentaje en un punto con comparación parcial; si el hueco ocupa más de la mitad del rango, el rango DEBE saltar al último tramo con datos y decirlo; sin tramo, el bloque *pendiente* y ninguna gráfica.
- **FR-044**: El dominio DEBE dar, para una fecha de consulta, las fechas fiscales que importan (fin de una ventana de recompra, plazo de un modelo, valoración de fin de año, campaña), con su clase y los identificadores de lo que las origina, nunca un importe; el plazo de los modelos 720 y 721 DEBE ser un dato normativo por ejercicio con su fuente, y un ejercicio sin dato no pinta plazo.
- **FR-045**: El calendario DEBE dibujarse como una tira anual con marcas de forma distinta por clase y su lista debajo, en `/fiscal` y en su versión corta dentro de *Declaración* durante la campaña, sin ninguna fecha fiscal escrita en la web.

### Entidades clave

- **Estado fiscal del Resumen** (`FiscalAttention`): la campaña, lo pendiente de los modelos informativos, los ejercicios sin declarar, los inválidos y si la tarjeta sube (desde ahora, solo la campaña).
- **Serie de lo aportado**: por fecha, lo aportado neto a la cartera principal en euros; nunca ausente.
- **Serie del cubo en porcentaje**: por fecha, el resultado del cubo y el del índice sobre lo aportado al cubo; ausente donde la comparación es parcial.
- **Fecha fiscal del calendario**: fecha, clase (ventana, plazo, valoración, campaña), ejercicio y modelo cuando toca, e identificadores de lo que la origina.
- **Plazo normativo por ejercicio**: modelo, ejercicio, fecha límite y su fuente (norma, artículo, dirección y fecha de consulta).
- **Grupo de valoraciones**: un día, las valoraciones vigentes de ese día y cuántas son.

## Criterios de éxito

### Resultados medibles

- **SC-001**: Con la privacidad puesta, **cero** apariciones de un importe o una cantidad del libro sintético en el texto o los atributos de cada pantalla tocada.
- **SC-002**: La salida fiscal de `synthetic-v1` da **los mismos bytes** antes y después de cada entrega; `git diff tests/fixtures` vacío.
- **SC-003**: Ganancia frente a pérdida: distancia perceptiva **≥ 8** en el peor caso de protanopía, deuteranopía y tritanopía, en claro y en oscuro; pérdida frente a peligro con visión normal, **≥ 7** (ver Q1: en oscuro la propuesta mide 5,05).
- **SC-004**: A 400×890, con la privacidad puesta el 20/01/2029, el primer pantallazo del Resumen contiene la línea de perder datos, el patrimonio con sus porcentajes y el primer grupo de *Atención*; **nada salta** en él al llegar lo perezoso (posiciones medidas antes y después).
- **SC-005**: A 2045×1141, el borde superior de la gráfica de evolución queda **dentro de los 1.141 px** (hoy, en 1.187).
- **SC-006**: 20 movimientos del libro sintético ocupan **menos de 2 pantallas** del móvil (hoy, 2,6).
- **SC-007**: Registrar a 400×890: las siete baldosas y «Otros registros» **en el primer pantallazo**.
- **SC-008**: Cada pantalla tocada tiene **al menos un porcentaje visible** junto a cada grupo de máscaras con la privacidad puesta; el Cubo pasa de 20 máscaras y 7 porcentajes a más porcentajes que máscaras.
- **SC-009**: Sin desplazamiento lateral a 360, 400, 1.440 y 2045 px; **ningún** objetivo táctil nuevo por debajo de 44 px ni texto que se lee por debajo de 13 px.
- **SC-010**: El arranque cabe en **76.069** bytes gzip y el total en **309.500**, con cada techo subido en su commit y antes del que lo necesita.
- **SC-011**: `packages/domain` al **100 %** de líneas, ramas, funciones y sentencias; cada regla de la tabla del plan con su test visto en rojo y su mutante muerto.

## Supuestos

- La partición en cuatro entregas del encargo se sigue tal cual (plan §2); la siguiente no empieza sin la palabra de la dirección.
- Los valores de color de la propuesta son los de partida; si alguno no pasa su umbral, **se para** y los cambia la dirección, nunca el implementador (Q1).
- Las fuentes de la simulación del daltonismo y de OKLab son Machado, Oliveira y Fernandes (2009), severidad 1, en RGB lineal, y Ottosson (2020); están citadas con su dirección en el plan §3.
- El plazo de los modelos 720 y 721 es del 1 de enero al 31 de marzo del año siguiente según la orden de cada modelo (Orden HAP/72/2013, art. 7; Orden HFP/886/2023, art. 4), verificadas en el BOE el 2026-09-27; cómo se guarda por ejercicio es Q4.
- M14 no entra; si una medida real del arranque no cabe, se para y M14 es la primera propuesta de recorte, con una ADR en estado `Propuesta`.
- La web sigue siendo local-first (ADR-0019); nada de esta feature llama a la red.

## Fuera de alcance

- Cualquier cambio del esquema del libro, de `schema_version` o de un campo de `Settings`.
- La deriva de la desviación en el tiempo, la opción B del hueco (último precio sostenido), una fuente alojada, cualquier dependencia nueva y cualquier cambio de la CSP.
- M14, salvo su condición.
- La consola: ningún cambio de salida de `apps/cli`.
- Tocar `docs/`, `.githooks/`, `.claude/`, `.specify/` o `CLAUDE.md` (salvo proponer una ADR en estado `Propuesta`); lo que haya que cambiar en `docs/` va a `questions.md`, «Documentos».
