# Prompt 020 — Feature `020-visual-refresh`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/020-visual-refresh.md`.
>
> **Requisito previo, sin cumplir al escribir este prompt: la feature 015 fusionada entera en `develop`, con su última entrega (E5, PR #98).** Esta feature **no empieza** hasta que `git log origin/develop..origin/feature/015-api-access` salga **vacío**. **La puerta no depende de ninguna cifra** (§8.1, segunda ronda, B1): una vez fusionada la 015, **lees los techos que haya dejado en `apps/web/scripts/check-bundle.mjs` de `origin/develop`**, con su comentario, y **mides tú el punto de partida**, arranque y total, antes de nada. E5 toca poco la web, pero cambia el reparto del arranque (la puerta `@atlas/domain/tools` sacó 2.166 bytes de él y el remedio de Q12 añadió algunos), así que las cifras de §5 se miden sobre ese `develop`, no sobre uno anterior.
>
> **Qué es.** La capa visual siguiente al sistema «papel y tinta»: **todas las mejoras M1-M13 de [`docs/design/proposals/2026-09-25-visual-improvements.md`](../design/proposals/2026-09-25-visual-improvements.md)**, con sus maquetas de [`docs/design/proposals/mockups/`](../design/proposals/mockups/), que **el usuario aprobó enteras**. La dirección cerró el 2026-09-27 las decisiones que la propuesta dejaba abiertas (§7.1): **el calendario fiscal entra como cuarta gráfica**; **el rango «1 mes» pasa a ser «Este año»**; **la tarjeta *Declaración* deja de ir primera fuera de la campaña de la Renta**; **los dos colores nuevos de ganancia y pérdida entran si pasan la prueba de daltonismo en claro y en oscuro**; y **cargar los estilos de cada pantalla con su pantalla (M14) solo si la propuesta lo justifica**, que hoy no lo hace (§0, punto 4). Se suma un defecto que dejó la 015: al entrar por `/ajustes#sincronizacion`, la barra superior fija tapa el título de la tarjeta.
>
> **Este prompt propone partir la feature en cuatro entregas**, una rama y una PR por entrega, como la 015 (§3, «La partición»). Las nueve preguntas que quien redacta no podía cerrar están en **§9**, y **la dirección las contestó todas el 2026-09-27**: sus respuestas están en **§8**, cada una enlazada desde su pregunta, y el texto de §0 a §7 ya las aplica. Entre ellas, **la autorización del total sube a 309.500 bytes** (§8 P1). §8 es también donde se responderán tus preguntas y se anotarán los errores de este prompt, como en los anteriores.

---

Eres **un asistente implementador nuevo** del proyecto **Atlas Portfolio Tracker** (`~/personal/atlas/atlas-portfolio-tracker`). No eres el de la 015 y no heredas su contexto: lo que necesitas de ella está citado aquí, con su sección. Vas a construir **la capa visual siguiente** de la web: que el estado por defecto (la privacidad activada) informe en vez de enseñar muros de «•••• €», que el primer pantallazo del Resumen siga la importancia, que el monitor de 2045 px se aproveche, que ganancia y pérdida se distingan también con daltonismo y dejen el rojo para los problemas, que las gráficas digan algo con precios anotados a mano y que el tiempo fiscal se vea. **Nada de esto puede enseñar un importe con la privacidad puesta, mover una cifra fiscal, añadir una dependencia ni pasarse del presupuesto del paquete sin pararse, y lo primero que construyes, en cada entrega, son los tests que lo demuestran.**

## 0. Siete cosas que tienes que entender antes de leer nada más

**1. Es una feature de interfaz, y el dominio cambia en cinco sitios contados.** No se toca el esquema del libro, no se añade ningún tipo de evento ni ningún campo, no sube `schema_version` y no se mueve ninguna cifra fiscal. Pero cinco necesidades piden algo del dominio, porque la regla que las gobierna es del dominio y no de la web:

- **M3**, lo aportado a la cartera principal en cada fecha (`contributedSeries`);
- **M7**, el cubo frente al índice en porcentaje sobre lo aportado, en cada fecha;
- **M12**, las fechas del calendario fiscal (fin de las ventanas de recompra, campaña, plazo y valoración de los modelos 720 y 721);
- **M2**, que la tarjeta *Declaración* suba arriba **solo en la campaña**. Hoy lo decide `fiscalAttention` (`packages/domain/src/informative/attention.ts`), con `prominent: season || todo.length > 0 || state.invalid.length > 0`, porque «una regla sobre cuándo vence una declaración es una regla fiscal» (prompt 010, Q11). **La propuesta no la contaba como cambio de dominio; lo es.**
- **Lo que el arranque necesita del dominio** (quinta necesidad, declarada por la dirección: §8.1, segunda ronda, B3 y N1). Son dos piezas, las dos **exportadas por el barril** porque las usa código del arranque, y cada una con su coste en bytes medido:
  - `hasForeignAccountsAt`, una función pura que dice si el libro tiene, a una fecha, alguna cuenta en el extranjero. Compara con **`tax_residence` de `Settings`**, nunca con el literal `"ES"`, y vive en un módulo que el arranque pueda importar, **fuera de `informative/`**, que está en `LAZY_ONLY`. La usa *Atención* para reservar la fila del aviso fiscal (§3, E2, bloque 2);
  - `NEAR_LIMIT_PCT`, la marca del aviso del tope del cubo (hoy una constante sin exportar en `packages/domain/src/projections/bucket-stats.ts:38`), que el dominio pasa a exportar y la web usa en su medidor (§3, E3, bloque 5).

Cada uno va **en sus propios commits**, con sus tests en rojo primero, el dominio al 100 % y **señalado en la descripción de la PR** con su lista de commits. Si cualquier otra mejora necesita un valor que el dominio no da (M1 y M10 pueden necesitarlo: §3, E3), **lo dices en el plan** y lo aprueba la dirección en el alto; no lo descubres a mitad de una entrega.

**2. La privacidad es el estado principal, y `Amount` es su única puerta.** La aplicación se abre con los importes ocultos (`docs/design/brief.md` §4). Los porcentajes, pesos, desviaciones, fechas y nombres se ven; los importes y las cantidades, no, **tampoco dentro de una frase, de un `title`, de un `aria-label`, del `<title>` o el `<desc>` de un SVG, ni de la tabla equivalente de una gráfica**. Casi todo lo nuevo de esta feature son porcentajes junto a una máscara o marcas SVG dibujadas desde porcentajes: es exactamente donde un importe se cuela por un atributo que ningún test de texto mira. **Los tests de privacidad renderizan y recorren texto y atributos**; no buscan un `import` (`docs/prompts/000-director-handoff.md` §7).

**3. El presupuesto del paquete: el arranque cabe, y el total cabe con la autorización nueva.** La partida de referencia es **la de la PR #98 a su fecha, y se vuelve a medir al empezar** (§8.1, segunda ronda, B1): **arranque 74.114 bytes gzip medidos, techo 74.134, autorizado hasta 76.069, es decir, 1.955 bytes de margen**; **total en torno a 301.370 (medido antes del último cambio de E5), techo 301.496, autorizado hasta 309.500** (la dirección subió la autorización desde 304.640 para esta feature: §8 P1). El total también se vuelve a medir al empezar. La propuesta calculaba **+5 a +6 KiB en el total** y unos **+0,8 KiB en el arranque**. En el arranque queda holgura. **En el total quedan unos 8.130 bytes**: la estimación alta más un 30 % de holgura. Con los 3.270 que quedaban hasta 304.640 no llegaba. La regla no cambia (§5): cada mejora se mide, cada techo sube **en su propio commit y antes del commit que lo necesita**, y **si no cabe, se para y se propone un recorte, con la medida trozo a trozo**. No se inventa una autorización nueva, no se esconde nada con una importación dinámica que cambie lo que se ve y no se recorta una comprobación para que quepa. Si aun así no cabe, la parada cae en una frontera de entrega (§3), y el plan trae el orden de recorte (§7.2 (h)).

**4. M14 (los estilos de cada pantalla, perezosos) no entra, salvo que lo pida la medida.** La propuesta lo presentaba como **requisito previo** porque el arranque tenía «decenas de bytes» de margen y la hoja de estilos entera va en él. Esa premisa ya no vale: la 015 liberó 2.166 bytes con la puerta `@atlas/domain/tools` (§33.2 de su `questions.md`), y las reglas CSS nuevas de toda la feature suman unos 0,8 KiB. La propia propuesta dice además que M14 **sube el total** (+0,1 a +0,3 KiB, porque gzip comprime peor las hojas sueltas), y el total es justo lo que no cabe. Por eso **M14 queda fuera** con una condición de entrada escrita (§3, «M14, condicional»): si una medida real del arranque no cabe en 76.069, **se para**, y entonces M14 es la primera propuesta de recorte, **con una ADR en estado `Propuesta`** antes de su primer commit. La dirección lo confirmó (§8 P2).

**5. Varias cosas que la propuesta afirma del código ya no son ciertas, o no lo fueron nunca.** Están comprobadas sobre `develop` (`640fa98`) el 2026-09-27; compruébalas tú otra vez:
- **Las cifras del presupuesto** de la propuesta (§0 y §6) son anteriores a la 015. Valen las de este prompt, y las que midas tú.
- **«Las fechas de la campaña y de los modelos ya son `Settings`»** (§3.4 de la propuesta): solo lo es la campaña (`renta_season_start` y `renta_season_end`, `packages/domain/src/settings/settings.ts:140`, con `rentaSeasonOf` y el valor por defecto `04-01` a `06-30`). **El plazo de los modelos 720 y 721 no es configuración ni está en el dominio**: entra en el dominio como dato normativo por ejercicio, con su fuente (§8 P4). La valoración a 31 de diciembre sí está, como `yearEnd` (`informative/valuation.ts:71`).
- **El umbral de desviación es por activo, no por tipo de activo.** `deviation_above_threshold` se emite por `asset_id` (`warnThresholds`, `packages/domain/src/projections/weights.ts:182`). La tira de M5 «por tipo de activo, con la banda del umbral y el punto coloreado si el dominio emite el aviso» no tiene aviso del dominio al que atarse. La dirección decidió cómo se resuelve (§8 P3).
- **El Chromium** de `~/.cache/ms-playwright/` ya no es el `chromium-1234` que usó la propuesta; hoy es `chromium-1243`. **Busca la versión, no la fijes** (§5, «Capturas»).

**6. Mirar la pantalla encuentra lo que ningún test encuentra**, y aquí la pantalla es el entregable. Cada entrega termina con **capturas antes y después** en los tamaños reales del usuario, y **esas capturas se envían al usuario antes de fusionar** (§5, «Capturas»). Una entrega con los tests en verde y una captura que el usuario no ha visto **no está terminada**.

**7. La máquina es compartida y se queda sin memoria.** Otros proyectos dejan la memoria disponible oscilando entre 500 y 3.500 MB (`specs/015-api-access/questions.md` §24.11). Todo `vitest` corre con `--pool=forks --maxWorkers=1`, y **antes de cada paso pesado** (una suite, `npm run build`, un lote de mutación, una pasada de capturas) miras `free -m` y **no lo lanzas si la columna `available` baja de 1.500 MB** (§2 bis).

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero. Te afectan sobre todo *Design principles* (fallo seguro, compartimentación y sus dos excepciones acotadas, nada codificado que deba ser configurable), *Security* («No third-party analytics, no external CDNs, no remote fonts… Strict CSP»), *Logging* y *Working on a feature*. De los *domain traps*, el **3** (dinero en decimal: ningún porcentaje que se lee se calcula con `number`), el **5** (ninguna cifra fiscal depende de un precio) y el **9** (la ventana de recompra es configuración por tipo de activo).
2. `.specify/memory/constitution.md` **1.6.2**: **III** (compartimentación, con las dos excepciones: la fiscal y el patrimonio total con el peso del cubo, «siempre desglosado» y señalado), **IV** (umbrales, topes, regla de parada y fechas de campaña son configuración), **V** (fallo seguro: el hueco se dibuja, nunca se inventa), **VI** (pocas dependencias) y **VII** (tests primero donde un error cuesta dinero).
3. **Las ADRs de la web, enteras**: **ADR-0017** (Solid, uPlot vendorizada, tablas nativas, sin directivas `use:`, **el rango con botones**, cuyas Consecuencias nombran «1M/1A/5A/Todo»), **ADR-0023** (la base de estilos propia: «ningún valor se escribe fuera de `tokens.css`»), **ADR-0019** con su enmienda (local-first) y **ADR-0024** (una salvedad fiscal es una nota del informe, no una decisión de la interfaz). Para el dominio que tocas: **ADR-0013** y **ADR-0014** (la ventana de recompra de fecha a fecha, que el calendario **no recalcula**), **ADR-0016** (la consulta a una fecha), **ADR-0020** (lo declarado) y **ADR-0015** (la proyección degradada).
4. **`docs/design/` entero**:
   - `brief.md`, sobre todo §2 (tamaños), §4 (privacidad), §6 (estados), §7 (gráficas, que esta feature enmienda: son cuatro) y §10 (restricciones técnicas);
   - `system.md` entero: es el sistema que **no se sustituye**, solo se amplía. §3 (variables), §4 (maquetación), §5 (componentes; §5.15, las gráficas), §6 (vocabulario) y §7 (cada pantalla);
   - **la propuesta**, entera, y **las dos maquetas**, abiertas en un navegador a 400 y a 2045 px, en claro y en oscuro. Son la referencia visual; donde la maqueta y el texto de la propuesta discrepan, **manda el texto** y lo dices (§8 P6);
   - `prototype/` solo como referencia de lo aprobado en septiembre.
5. `docs/business-rules.md`: la mecánica de la aportación mensual (línea 45), las reglas del cubo (reglas 10, 17 y 18) y la tabla de `Settings`, con `renta_season_start` y `renta_season_end` (línea 324).
6. **`specs/015-api-access/questions.md`**, ya en `develop`, en estas secciones: §24.11 (la máquina y la puerta de memoria), §26.5 y §27.3 (**el techo subido tarde**, y cómo se evitó después), §28.4 y §28.5 (el paquete, entrega a entrega, y los commits en rojo por sí solos), §30.5 (**capturas por *viewport***, y el defecto de `#sincronizacion`), §32.2 y §33.2 (de dónde salió el sitio del arranque: la puerta `@atlas/domain/tools`) y §34.2 (las dos pasadas de cobertura).
7. `docs/prompts/015-api-access.md`, §2 bis, §2 ter y §5: la disciplina de mutación, de medida y de congelado sigue valiendo entera. Y `docs/prompts/000-director-handoff.md` §7, las lecciones.
8. **El código. Todo lo que este prompt afirma de él está comprobado sobre `develop` (`640fa98`) el 2026-09-27; compruébalo tú otra vez sobre el `develop` con la 015 entera antes de tocarlo.**
   - **Los estilos**: `apps/web/src/styles/index.css` importa `uPlot.css` y las 16 hojas propias, con `layout.css` **la última a propósito**. `tokens.css` define cada color **tres veces**: el tema claro, el oscuro bajo `@media (prefers-color-scheme: dark)` guardado por `:root:not([data-theme="light"])`, y el oscuro forzado con `[data-theme="dark"]` (`--c-positive`, líneas 134, 213 y 260).
   - **El contraste**: `apps/web/test/contrast.test.ts` solo comprueba el 3:1 del contorno de un campo, y lee los valores de cada variable **en orden de aparición**. **No hay ninguna prueba de daltonismo** en el repositorio: el comentario de `tokens.css:146` («CVD ΔE ≥ 8») describe una validación que se hizo fuera.
   - **Las gráficas**: `apps/web/src/components/chart/` (`SeriesCard`, `Chart`, `ChartTable`, `RangeButtons`, `gaps.ts`, `axis.ts`) y `ranges.ts`, con `RANGE_KEYS = ["1M", "1A", "5A", "TODO"]`, `RANGE_DAYS` contados hacia atrás desde el último punto, y la regla de que un rango sin puntos se ofrece **desactivado y con su motivo**. `apps/web/src/view-models/series.ts` («nada decide aquí qué es un hueco»).
   - **El indicador de la desviación**: `apps/web/src/routes/cartera/Gauge.tsx` (72×12, geometría con `parseFloat`, que es dibujo y no una cifra que se lee), usado solo en `WeightsCard.tsx:104`, **activo por activo**, con `offTarget` sacado de los avisos `deviation_above_threshold` del dominio (`view-models/core/weights.ts:129`).
   - **La tarjeta *Declaración***: `apps/web/src/routes/resumen/FiscalCard.tsx`, perezosa (`lazy` en `resumen/index.tsx:56`), que carga `fiscal-status.ts` tras la primera pintada y se coloca con `is-first` o `is-last` según `prominent`.
   - **Atención**: `apps/web/src/view-models/attention.ts`, en el arranque, que ya importa `washSaleWindowEnd` del dominio (`packages/domain/src/settings/wash-sale.ts:56`).
   - **Las series del dominio**: `netWorthSeries` y `bucketIndexSeries` en `packages/domain/src/projections/series.ts`, exportadas por el barril `@atlas/domain`. **El barril va en el arranque** (el grupo `domain` de `advancedChunks`, feature 010; `specs/015-api-access/questions.md` §32.2): una función nueva exportada por él **cuesta bytes del arranque** aunque solo la use una pantalla perezosa.
   - **El cubo**: `vs_index_pct` en `projections/bucket-stats.ts:350`; `unrealized_pct` por posición en `projections/bucket.ts:142`; `loss_pct` y `weight_pct` en `bucket-stats.ts`, con la regla de parada y el peso máximo leídos de `Settings`.
   - **El efectivo**: `cash_deposit` y `cash_withdrawal` (`packages/domain/src/schema/events.ts:355-361`) llevan `amount`, `currency`, `fx_rate` y `fx_rate_date`; su valor en euros es `amount / fx_rate` (ADR-0013).
   - **El paquete**: `apps/web/scripts/check-bundle.mjs`, con `BOOT_BUDGET_GZIP_BYTES`, `TOTAL_BUDGET_GZIP_BYTES` y `LAZY_ONLY` (hoy en las líneas 307, 740 y 876 de `640fa98`; E5 los cambia) y la comprobación de que no hay estilos en línea. La CSP de producción sirve `style-src 'self'` (`vite.config.ts:138`).
   - **El ancla**: `apps/web/src/routes/ajustes/index.tsx:223` (`<div id="sincronizacion">`), enlazada desde `routes/guard.tsx:28`.
   - **Las pruebas**: tras la 015, `npm run test:coverage` encadena `test:coverage:domain` y `test:others` (§34.2 de su `questions.md`). **`npm run test:coverage -- --pool=forks --maxWorkers=1` solo pasa las opciones a la segunda**: corre las dos por separado con las opciones, o comprueba cómo llegan.

Si algo es ambiguo, contradictorio o te bloquea, **no lo resuelvas**: `specs/020-visual-refresh/questions.md`, y avisa. Nada fiscal ni estructural se decide aquí.

## 2. Flujo de trabajo

1. **No empieces sin el requisito previo** (cabecera). Worktree separado, rama desde `develop` **actualizado**:
   ```bash
   cd ~/personal/atlas/atlas-portfolio-tracker && git fetch origin
   git log origin/develop..origin/feature/015-api-access   # tiene que salir vacío
   git worktree add .claude/worktrees/020-visual-refresh -b feature/020-visual-refresh origin/develop
   cd .claude/worktrees/020-visual-refresh && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. **Spec Kit** en `specs/020-visual-refresh/` (español, identificadores en inglés): un solo `spec.md` y un solo `plan.md` para las cuatro entregas, con las entregas como fases, y `tasks.md` agrupado por entrega. **Para después de `spec.md` y `plan.md`**, con tus preguntas en `questions.md`, y **espera el visto bueno de la dirección antes de escribir código**. El alto tiene que traer:
   - **la línea de partida del paquete**, medida con `npm run build` sobre tu `develop`: arranque y total, contra los techos y las autorizaciones de §5;
   - **tu estimación mejora a mejora** (M1-M13 y el ancla) de lo que añade cada una al arranque y al total, **acumulada por entrega**, y **en qué entrega se acaba el total** con la autorización de hoy; y **el orden de recorte que propones** si se acaba;
   - **el bloque 0 del color** (§3, E1): las fuentes de la simulación del daltonismo y de OKLab, con su dirección, su fecha y lo que dicen, y **tu recálculo de los ΔE de la propuesta** (§5.1 de la propuesta) con tu propia implementación. Si un color propuesto no pasa, **para**: no eliges otro tú;
   - **la tabla de reglas**: una fila por regla visible de esta feature (cada una de §3 y de §6 del vocabulario de la propuesta), con el test que la ata y el mutante que la rompe (§5, «Mutación»);
   - **la definición de lo aportado** (M3, §3, E4), caso a caso, **como propuesta**: la escribe la dirección en `docs/business-rules.md` en el alto, **antes** de la primera línea de su código;
   - **las necesidades de dominio**, las cinco de §0 y cualquier otra que veas (M1, M10), cada una con su puerta perezosa (§2 bis), salvo las dos piezas de la quinta, que van en el barril con su coste medido;
   - **el guion de capturas**, cómo siembra los dos libros, cómo fija el reloj y **qué versión de Chromium encontró** (§5, «Capturas»);
   - **la partición** tal como la vas a seguir (§3), o lo que cambiarías y por qué.
3. Implementación **por entregas, en el orden de §3**, commits atómicos y en verde uno a uno (§6, «Techo subido tarde»).
4. **Cada entrega termina así**, y la siguiente no empieza sin la palabra de la dirección:
   - la tubería entera en verde (§5) y la rama empujada;
   - **las capturas antes y después**, en su carpeta y con su índice (§5, «Capturas»);
   - **la autocomprobación de §6**, hecha y escrita en `questions.md`, familia a familia;
   - **congelas un commit** y dices su SHA en `questions.md` y en tu informe. Sobre él la dirección lanza el verificador y los revisores, **cada uno en un worktree desacoplado y congelado** (`git worktree add --detach .claude/worktrees/020-rev-E<n>-<revisor> <sha>`), nunca en el tuyo;
   - **mientras dura la revisión no empujas nada a la rama**: puedes preparar en `questions.md` el plan de la entrega siguiente, no código;
   - con los hallazgos que la dirección elija, los arreglas con tests en rojo primero, **vuelves a mirar alrededor** y repites los lotes de mutación y las capturas afectadas;
   - **abres tú la PR a `develop`** con la plantilla (`.github/pull_request_template.md`) y su lista **rellenada con honestidad**, con los commits de dominio señalados (§0, punto 1) y las cifras del paquete. **No la fusionas nunca**: la fusiona la dirección, y **no antes de que el usuario haya visto las capturas de esa entrega**. Antes de dar por integrada una entrega, `git log origin/develop..feature/020-visual-refresh` tiene que salir **vacío**, y la entrega siguiente empieza con `git merge origin/develop` en tu rama.

## 2 bis. Reglas de operación

- **Sin dependencias nuevas.** Ni de ejecución ni de desarrollo, ni para el color, ni para las capturas, ni para medir. Todo lo propuesto se hace con uPlot vendorizada (escalones con `paths.stepped`, cursores sincronizados con `cursor.sync`, varias instancias) y SVG escrito a mano (propuesta, §6). Para el navegador, el Chromium de `~/.cache/ms-playwright/`, conducido **desde tu scratchpad** por el protocolo DevTools con el `fetch` y el `WebSocket` de Node 22, como la propuesta y la 015; **nunca Playwright en un `package.json`**. Cualquier paquete es una pregunta en `questions.md`, nunca un `npm install`.
- **Nada de fuera**: ni fuentes alojadas (la propuesta, §5.2, descarta expresamente una), ni CDNs, ni imágenes o iconos remotos, ni analítica. Iconos en SVG en línea.
- **CSP estricta**, sin tocarla: `script-src 'self'`, `style-src 'self'`. **Ningún atributo `style`** en el marcado, ni `setAttribute("style", …)`, ni `innerHTML` con estilos: la posición de una marca va en **atributos SVG**, con coordenadas en porcentaje (`cx="61%"`) y radios en píxeles, como en las maquetas y en `Gauge.tsx`. La única excepción que existe es la de uPlot, que pinta por CSSOM, y no se amplía. `check-bundle.mjs` ya comprueba que no hay estilos en línea; no lo relajes.
- **Ningún valor fuera de `tokens.css`** (ADR-0023): ni un color, ni un tamaño, ni un radio, ni una sombra. Un color nuevo se define en **los tres bloques** del fichero (§1, punto 8).
- **Ninguna regla de dominio en la web.** Qué es lo aportado, cuándo es la campaña, cuándo termina una ventana, cuándo sube *Declaración*, qué activo está fuera de umbral: **lo decide `packages/domain`**, en funciones puras con el 100 % de cobertura. La web traduce, coloca y dibuja. Lo que es **presentación** (agrupar las valoraciones de un día, cortar un rango, saltar al último tramo con datos, el orden de las tarjetas) vive en `view-models/`, en funciones puras con su test.
- **Ningún porcentaje que se lee se calcula con `number`.** Se calcula en el dominio, o en un modelo de vista **con el `Decimal` del dominio**, y se redondea **una vez, al mostrarlo**, con la regla de siempre. La geometría de un dibujo sí puede usar `number`.
- **Toda función nueva del dominio, detrás de una puerta perezosa.** Nada nuevo en el barril `@atlas/domain`, que va en el arranque (§1, punto 8), **salvo las dos piezas de la quinta necesidad** (`hasForeignAccountsAt` y `NEAR_LIMIT_PCT`, §0, punto 1), que usa código del arranque; su coste en bytes se mide y se escribe. El calendario, en `@atlas/domain/fiscal` o en su carpeta; las series, en una puerta nueva (por ejemplo `@atlas/domain/charts`) con el patrón de `@atlas/domain/tools` de la 015: **una regla en `tests/architecture.test.ts` que impide que el barril la exporte**, y **su entrada en `LAZY_ONLY` desde su primer commit**. El plan puede proponer mover allí también `netWorthSeries` y `bucketIndexSeries` si lo mide y libera arranque; no es obligatorio.
- **`packages/domain` al 100 % de líneas, ramas, funciones y sentencias**, medido en su propia pasada (`test:coverage:domain`). Una rama muerta **se borra**, con un comentario que explique el invariante.
- **La salida fiscal no se mueve.** Ningún fichero dorado cambia (`git diff tests/fixtures` vacío). Antes de correr la suite de cada entrega con dominio (E2 y E4), **escribes en `questions.md` la predicción**: `tax` (con `--lots`, `--boxes` y `--json`), `gains`, `income`, `m720`, `m721` y `filed` dan los mismos bytes sobre `synthetic-v1`. **Si algo se mueve, para.**
- **No toques `docs/`, `.githooks/`, `.claude/`, `.specify/` ni `CLAUDE.md`**, con una excepción: **proponer una ADR con `/adr`**, en estado `Propuesta`, si una decisión lo pide (M14, si entra). Lo que creas que debe cambiar en `docs/` va a `questions.md`, apartado «Documentos», y lo traslada la dirección (§5). Tampoco tocas `docs/design/prototype/` ni las maquetas.
- **Memoria.** Todo `vitest` con `--pool=forks --maxWorkers=1`, las dos pasadas de cobertura incluidas (§1, punto 8). **Antes de cada paso pesado**, `free -m`: si `available` baja de 1.500 MB, **no lo lances**; espera y vuelve a mirar, sin `sleep` en primer plano. **Nunca dos pasos pesados a la vez**, ni un Chromium abierto mientras corre una suite. Un lote de mutación es un paso pesado por mutante.
- **Las fechas que escribas en cualquier documento van en `Europe/Madrid`**, no en UTC.
- **Verifica antes de tocar lo que este prompt afirma del código.** Si algo no cuadra, **para y dilo**: encontrar un error de este prompt es trabajo hecho.
- **Commits de una línea, en inglés, Conventional Commits, sin rastro de ninguna herramienta de IA** ni en el asunto, ni en el cuerpo, ni en la PR (el gancho rechaza mencionarla). **`npm run lint` en verde antes de cada commit**, y otra vez como último paso. **Empuja tu rama cada pocos commits**, siempre en verde, y **nunca fusiones nada**.
- **Los ficheros temporales de tu scratchpad llevan el prefijo `020-`** (`020-bundle/`, `020-mut/`, `020-capture.mjs`…): otros agentes comparten el scratchpad de la sesión.

## 2 ter. Lo que las rondas anteriores aprendieron a golpes

Siguen valiendo enteras las lecciones de §2 ter de los prompts 012 a 015: **un test que no has visto fallar no es un test**; **un mutante que sobrevive puede ser un mutante que nunca se aplicó** (el guion afirma que la sustitución ocurre las veces que dice, restaura el fichero, **lo compara byte a byte** con el original y **se niega a correr si hay un gemelo `.js`** junto a una fuente); **un resultado leído a través de una tubería se come el error** (redirige a un fichero y lee `$?`); **mirar la pantalla encuentra lo que ningún test encuentra**; **un ternario que colapsa un conjunto en otro más pequeño esconde un caso**; y **una verificación que no se escribe con su fuente no es una verificación**.

Y cuatro que son de esta feature:

- **Un techo subido después del commit que lo necesitaba deja un commit en rojo en la historia.** Pasó en la E3 de la 015 (`specs/015-api-access/questions.md` §26.5): la tubería lo encontró antes de congelar, pero el commit ya estaba. Desde entonces se mide **con un prototipo construido y deshecho** y la subida va **delante**. Aquí cada mejora es un candidato.
- **Un guardián borrado no falla.** En la E4 de la 015, un commit borró por error cuatro bloques de `tests/api-access.test.ts` y nadie lo echó de menos durante una entrega entera (§33.4). **Al cerrar cada entrega, compara la lista de nombres de test de `develop` con la de tu rama**: ninguno desaparece sin una línea en `questions.md` que diga por qué.
- **La captura a página completa miente con las barras fijas**: la barra inferior sale a mitad de página (propuesta, §0). Por eso las capturas son **por *viewport***, con las barras encima como las ve el usuario (015, §30.5), y así apareció el defecto de `#sincronizacion`.
- **Una regla visual sin medida es una opinión.** «Por encima del pliegue», «sin desplazamiento lateral», «nada salta», «44 px», «13 px»: cada una se **mide** en el navegador y se escribe en `medidas.json`, no se da por vista.

## 3. Alcance, por entregas y en este orden

### La partición: cuatro entregas, una rama, cuatro PRs

| Entrega | Qué | Dominio | Coste estimado (arranque / total) |
|---|---|---|---|
| **E1** | **El marco y el color**: M6 (ganancia y pérdida fuera del rojo, con la prueba de daltonismo), M4 (el paso de 1.800 px), M11 (Registrar compacto), M13 (el pulido) y el ancla de `#sincronizacion` | No | ~0,35 KiB / ~0,05 KiB |
| **E2** | **El primer pantallazo y la lista**: M2 (el Resumen por importancia) y M8 (Movimientos más densos, y las valoraciones de un día agrupadas también en *Últimos movimientos*) | **Sí**: `fiscalAttention` (M2) y `hasForeignAccountsAt` | ~0,15 / ~0,6 |
| **E3** | **La privacidad que informa**: M1 (un porcentaje junto a cada importe oculto), M9 (tablas con privacidad), M5 (la tira de desviación) y M10 (los medidores del cubo y las mancuernas de las tesis) | **Sí**: exportar `NEAR_LIMIT_PCT`; lo demás, solo si el plan lo demuestra (§0, punto 1) | ~0,3 / ~2,1 |
| **E4** | **Las gráficas y el tiempo**: M3 (la evolución en paneles con lo aportado), el rango «Este año», M7 (el cubo frente al índice en porcentaje, con la regla del hueco) y M12 (el calendario fiscal, cuarta gráfica) | **Sí**: `contributedSeries`, el porcentaje del cubo por fecha y el calendario | ~0,05 / ~2,6 |

Las estimaciones son las de la propuesta (§3.6 y §6), no medidas. **Acumuladas, E1 a E3 gastan unos 2,75 KiB del total y E4 unos 2,6 más**: con la autorización anterior (304.640) el total se acababa al empezar E4; con la de 309.500 (§8 P1) caben con unos 2,6 KiB de holgura (§0, punto 3).

**Por qué este orden y este corte.**
- **E1 va primero porque las demás lo usan**: los colores de ganancia y pérdida, la serie de lo aportado y el paso de 1.800 px son variables que E2-E4 consumen. Y es la más barata: casi todo es CSS del arranque, donde hay sitio.
- **E2 junta lo que responde a «¿hay algo que tenga que hacer?»**, con el único cambio de dominio que es fiscal (`fiscalAttention`) aislado en una revisión pequeña.
- **E3 y E4 son las caras**: E3 casi todo en vistas, E4 casi todo en gráficas y dominio. **Cada revisión mira una sola superficie.** Si el total se acabara aun con la autorización nueva, la parada caería **dentro de E4**, que es donde están el dominio y las gráficas, y la dirección decidiría con la medida en la mano.
- **Una rama y cuatro PRs, no cuatro ramas**, como la 015 (su §3, «La partición»): `CLAUDE.md` fija «un spec ↔ una rama».

### E1 — El marco y el color

#### Bloque 0 — Verificar antes de escribir código (va en el alto del plan)

1. **La simulación del daltonismo**: las matrices para protanopía, deuteranopía y tritanopía (por ejemplo, Machado, Oliveira y Fernandes, 2009, con severidad 1; o Viénot, Brettel y Mollon, 1999), aplicadas en RGB lineal. **La fuente, su dirección y su fecha**, y cuál eliges y por qué.
2. **OKLab**: las fórmulas de Björn Ottosson (2020), con su dirección y su fecha.
3. **Tu recálculo de los ΔE de la propuesta** (§5.1): ganancia frente a pérdida en el peor caso de daltonismo, en claro y en oscuro (la propuesta dice 8,9 y 9,9); pérdida frente a peligro con visión normal (7,5); y los de hoy (6,3, 4,2 y 2,1). **Si tus cifras no coinciden con las de la propuesta, dilo con las dos**; si un color propuesto no llega al umbral, **para**.
4. El contraste WCAG de cada color nuevo sobre `--c-surface` y `--c-canvas`, en los dos temas.

#### Bloque 1 — Los guardianes, antes que el código

- **La prueba del color**, en `apps/web/test/` y sin dependencias: lee `tokens.css`, **exige cada variable en los tres bloques** y falla si falta en uno (un color definido en claro y olvidado en `[data-theme="dark"]` es exactamente el defecto que un lector «en orden de aparición» no ve), y comprueba:
  - **ganancia frente a pérdida: ΔE OKLab ×100 ≥ 8** en el peor caso de protanopía, deuteranopía y tritanopía, en claro y en oscuro;
  - **pérdida frente a peligro, con visión normal**, al menos lo que midas (la propuesta dice 7,5; el test falla por debajo de 7);
  - **el contraste**: ≥ 4,5:1 como texto para `--c-gain` y `--c-loss`, y ≥ 3:1 para `--c-series-contrib` sobre la superficie, en los dos temas;
  - **y la propia simulación contra valores publicados por su fuente**: un color conocido que atraviesa la matriz da lo que dice la fuente. Sin eso, una matriz identidad pasa todo.
- **Una regla que impide volver atrás**: ni `--c-positive` ni `--c-negative` quedan en ninguna hoja, y `--c-gain` y `--c-loss` **solo se usan en los selectores de resultados** (ganancias y pérdidas realizadas o latentes). Nunca en pesos, desviaciones, precios ni saldos (propuesta, §5.4). Y **no se pueden alias**: una variable que valga `var(--c-gain)` fuera de `tokens.css` es la vía para saltarse la regla, y el test la cierra.
- **El mismo guardián, dentro de `tokens.css`** (§8.1, segunda ronda, N2), en cada uno de los tres bloques:
  - **ninguna variable toma el `var()` de un color semántico**: `--c-gain`, `--c-loss`, `--c-danger` con `-soft` y `-border`, y `--c-caution` con `-icon` y `-soft`;
  - **dos variables de color no pueden tener el mismo valor**. La única salvedad es una lista cerrada, escrita en el test con el motivo de cada par, y **en ella no puede entrar ningún color semántico**. El propio test lo comprueba. En `640fa98` hay pares iguales legítimos que la lista tiene que recoger y justificar: la superficie y los textos sobre acento y sobre peligro (`#ffffff`); `--c-accent` con `--c-accent-soft-text` en claro, y `--c-accent-hover` con `--c-accent-soft-text` en oscuro; cada serie con su tipo de activo; y en oscuro, `--c-fill` con `--c-chart-grid` y `--c-raised` con `--c-chart-gap-edge`. Tras M6 entra `--c-series-contrib` con `--c-series-index`, y `--c-done` deja de ser igual a la ganancia. Compruébalo tú: esta lista es de quien redacta.

- **`check-bundle.mjs` falla si algún techo supera su autorización** (§8.1, segunda ronda, preferencia aceptada): dos constantes nuevas, **76.069 para el arranque y 309.500 para el total**, con su fuente en el comentario, y un error propio si `BOOT_BUDGET_GZIP_BYTES` o `TOTAL_BUDGET_GZIP_BYTES` pasan de ellas. Así, un techo subido por encima de la autorización no construye en verde. Subir una autorización es decisión de la dirección, nunca un commit de una mejora.

#### Bloque 2 — M6: ganancia y pérdida

- `--c-gain` (`#0f6b5c` / `#5cc6b0`) sustituye a `--c-positive`, y `--c-loss` (`#b04a12` / `#f2a066`) a `--c-negative`, en los tres bloques. `--c-done` **no cambia**: un paso completado no es una ganancia.
- `--c-series-contrib` (`#8a8880` / `#8f8d86`), nueva, para la espina de lo aportado de E4. Comparte gris con el índice del cubo, y **nunca van en la misma gráfica**: lo dices en el comentario de la variable.
- **El color acompaña al signo, nunca lo sustituye**: «+» y «−» (U+2212, nunca el guion), y el cero sin signo («0,0 pp»). **pp** para una diferencia de pesos, **%** para un peso o un rendimiento, y nunca los dos en una misma columna (propuesta, §5.4). Cada una de estas reglas, con su test.

#### Bloque 3 — M4: el paso de escritorio a partir de 1.800 px

- En `tokens.css`, desde 1.800 px: `--text-md` 16, `--text-lg` 19, `--text-xl` 28, `--text-display` 48, `--chart-h` `clamp(15rem, 28vh, 22rem)`, `--gutter` 40, `--grid-gap` 24 y el contenedor de lectura hasta **1.840 px** (propuesta, §5.2 y §5.3).
- **El Resumen en 8+4** a partir de 1.800 px, con la evolución **por encima del pliegue** a 2045×1141 y *Declaración* a la derecha, **nunca sola en su fila** (maqueta `resumen-privacidad.html`). La gráfica más alta llega completa en E4 (M3); aquí se prepara la rejilla.
- **Medido**: a 1.799 y a 1.800 px, el tamaño computado del cuerpo cambia justo ahí; a 2045×1141, el borde superior de la gráfica de evolución queda dentro de los 1.141 px. **Esta medida se repite en E2**, que añade la línea de perder datos y reordena el Resumen, **y en la verificación final** (§5).

#### Bloque 4 — M11: Registrar compacto

- Las siete baldosas del día a día, de **64 px en tres columnas** (tres filas), con «Otros registros» a la vista en el primer pantallazo del móvil.
- En el móvil, **los campos cortos en pareja**: las dos fechas, y cantidad con precio. **Solo si caben a 360 px sin desplazamiento lateral**, medido; si no caben, se quedan en columna a ese ancho. Los campos siguen a 44 px y a 16 px.

#### Bloque 5 — M13: el pulido que hoy se ve

- El botón «Importar desde la carpeta de la consola» **no se parte en dos líneas** a 400 px (propuesta: «Importar de la carpeta», o alto automático; el plan elige y lo dice), en el primer arranque y en Ajustes.
- El eje del cubo **con su unidad** (en E4 pasa a %; aquí, que no quede «400, 0, −200» sin unidad).
- En Movimientos de escritorio, **la fecha en tinta y la fila entera como objetivo**, sin veinte subrayados; y **la columna *Estado* solo cuando alguna fila la usa**.
- Sin sangría en la lista de *Declaración*.

#### Bloque 6 — El ancla que la barra tapa

- Al entrar por `/ajustes#sincronizacion` (y por cualquier ancla de la aplicación), el título **queda debajo de la barra superior fija**, no tapado por ella. Con `scroll-margin-top` en los destinos o `scroll-padding-top` en el documento, **atado a la variable del alto de la barra**, no a un número: si la barra cambia de alto, el margen la sigue. El plan dice cuál y por qué.
- **Medido en el navegador**, a 400 y a 2045: tras navegar al ancla, el borde superior del título es mayor o igual que el borde inferior de la barra.

### E2 — El primer pantallazo y la lista

#### Bloque 1 — M2 en el dominio: *Declaración* sube solo en la campaña (commits propios)

- `fiscalAttention.prominent` pasa a ser **solo la campaña** (`season`). Lo que había que hacer del 720 o del 721 fuera de la campaña (`todo`) y los ejercicios sin declarar **siguen saliendo** en `FiscalAttention`: cambia dónde se dicen, no que se digan. **Lo mismo con los eventos inválidos** (§8.1, segunda ronda, N4): hoy también suben la tarjeta (`state.invalid.length > 0`); desde ahora no la suben, y fuera de la campaña el aviso de que «con movimientos inválidos no se calcula nada fiscal» va a *Atención* (bloque 2).
- **Tests en rojo primero**, en los bordes: el primer y el último día de la campaña (incluidos), el día antes y el día después, con una campaña configurada distinta de la de por defecto, y un 720 pendiente **fuera** de la campaña, que ya no sube la tarjeta. **La fecha entra como argumento**; ningún test lee el reloj (§6, familia 3).
- **La salida fiscal no se mueve** (§2 bis): la predicción, antes.
- En la PR, **señalado** como cambio de dominio, con su lista de commits. Lo que cambia en `docs/business-rules.md` (línea 324, «Semanas en que la tarjeta fiscal del Resumen sube arriba del todo») va a la lista de documentos.

#### Bloque 2 — M2 en la pantalla: el Resumen por importancia

- **El riesgo de perder datos, primero y en una línea**, encima de todo, siempre (en campaña también, delante de *Declaración*): «Tus datos viven en el navegador y hace 9 días que no los exportas» con su acción (maqueta). **No se repite dentro de *Atención***: un aviso que ya se dice en su sitio no se repite en una lista (`system.md` §5.6). El orden lo sigue decidiendo `view-models/attention.ts`.
- ***Declaración***: en la campaña, **primera** (tras la línea anterior), con «Campaña de la Renta» junto al título, como hoy. Fuera de la campaña, **plegada a una fila que solo dice su estado neutro**, por ejemplo «Declaración 2028 · fuera de campaña · Ver →», **sin repetir ningún aviso** (§8.1, segunda ronda, B2). Va en su sitio del final en el móvil y a la derecha del patrimonio a partir de 1.800 px. Aquí la maqueta, que pone el aviso del 720 en la fila, y el texto de la propuesta, que lo manda a *Atención*, discrepan: **manda el texto**, como en P6.
- **Lo que había del 720 y del 721 fuera de la campaña entra en *Atención***, como un aviso más, con su acción a `/fiscal`. Llega **después de la primera pintada**, porque el motor fiscal es perezoso. Para que la lista no salte (§8 P5): fuera de la campaña, y **solo si el libro tiene alguna cuenta en el extranjero**, *Atención* reserva **una fila de esqueleto al final de sus grupos visibles**, que se llena o desaparece al llegar el estado fiscal; el aviso cuenta entre los cuatro visibles. Sin cuentas en el extranjero, no se reserva nada. Si ves que desaparecer también salta, lo mides y lo dices.
  - **Quién dice si hay cuentas en el extranjero: `hasForeignAccountsAt`**, del dominio (§0, punto 1; §8.1, segunda ronda, B3). No se escribe `country !== "ES"` en la web ni se importa nada de `informative/`. Compara con `tax_residence` de `Settings`. **Sin `tax_residence`, no supone `ES`**: responde que sí, y se reserva la fila, porque reservar no esconde nada; el plan puede proponer otra salida segura. Hoy `fiscalAttention` y los modelos informativos comparan con `"ES"`. **Si alinearlos con el predicado nuevo movería alguna cifra o algún aviso fiscal, no los cambias**: lo dices en el plan, y lo decide la dirección.
- **Fuera de la campaña y con eventos inválidos** (§8.1, segunda ronda, N4), el aviso de que con movimientos inválidos no se calcula nada fiscal va a *Atención*, y la fila de *Declaración* dice solo su estado neutro. El número de inválidos se sabe en el arranque. Si *Atención* ya dice los inválidos por la verificación, **la frase fiscal se suma a ese grupo, no crea otro** (`system.md` §5.6).
- **«Pendiente» en una sola línea** cuando falta **un solo** precio; el bloque de hoy, con dos o más.
- **El orden del móvil** (§8 P6): manda el texto de la propuesta, no el orden del DOM de la maqueta. La línea de perder datos; *Declaración*, solo en campaña; el patrimonio; *Atención*; *Últimos movimientos*; la evolución; y la fila de *Declaración*, fuera de campaña. En el monitor, el 8+4 de la maqueta.
- **Medido**: con la privacidad puesta, a 400×890 y a 20/01/2029, qué cabe en el primer pantallazo, antes y después; y **que nada salta** dentro del primer pantallazo cuando llega lo perezoso (las posiciones de cada tarjeta antes y después de la carga, en `medidas.json`).

#### Bloque 3 — M8: Movimientos más densos

- En el móvil, **una cabecera por mes** y la fecha en la fila, en lugar de una cabecera por día. Mes y día, en `Europe/Madrid`.
- **Las valoraciones de un mismo día, agrupadas en una fila que se despliega** («7 valoraciones · 31/12/2028»), con el `Disclosure` de siempre (un `<summary>` de 44 px). Solo valoraciones, solo del mismo día; **una anulada no se agrupa con las vigentes**. También en *Últimos movimientos* del Resumen, donde **un grupo cuenta como una fila** de las cinco y **se corta por la fecha consultada** como hoy.
- **Medido**: con el libro sintético, cuántas pantallas del móvil ocupan 20 movimientos (la propuesta estima 1,6, frente a 2,6).

### E3 — La privacidad que informa

#### Bloque 1 — Los guardianes, antes que el código

- **Un test que renderiza cada pantalla que esta entrega toca con la privacidad puesta** y recorre **el texto y los atributos** (`aria-label`, `title`, y el `<title>` y el `<desc>` de los SVG) buscando cualquier importe o cantidad del libro sintético en su forma española: **falla con una sola aparición**. Un importe en un `aria-label` lo lee un lector de pantalla, y también quien mira el DOM.
- **Un porcentaje no se enseña sobre un total parcial**: las proporciones de un total incompleto no significan nada (`system.md` §5.2). Test en cada sitio nuevo.

#### Bloque 2 — M1: un porcentaje junto a cada importe oculto

- **La aportación del mes**: cada tipo de activo con su **% de la parte de la cartera**, y la partición cartera/cubo en % (maqueta `indicadores.html`, tarjeta B). La calculadora ya da los importes; el porcentaje sale con `Decimal`, redondeado al mostrarlo (§2 bis).
- **El cubo**: el aportado como **% del tope**, el resultado como **% sobre lo aportado**, cada tesis frente al índice **en pp**, y el **peso de cada posición en el cubo** (que hoy dice «sin dato» con el total parcial, y así sigue: un peso sobre un total parcial no se enseña).
- **En las tablas**, el porcentaje **delante** de la columna enmascarada.
- **Qué da ya el dominio y qué no**: `vs_index_pct`, `unrealized_pct`, `loss_pct` y `weight_pct` existen (§1, punto 8). **Lo que falte se dice en el plan** (§0, punto 1).

#### Bloque 3 — M9: tablas con privacidad

- Con la privacidad puesta, **las columnas que solo tendrían máscaras se funden en una**, «importes ocultos», y los porcentajes pasan delante (*Costes*, *Posiciones abiertas*, *Tesis*). Con la privacidad quitada, la tabla es la de hoy.
- **`Amount` sigue siendo la única puerta** de la privacidad y **`DataTable` conserva su doble presentación** (tabla ancha y filas estrechas, por consulta de contenedor). La fusión es una forma de la tabla, no un segundo camino para decidir qué se oculta.

#### Bloque 4 — M5: la tira de desviación

- La **tira divergente** de la maqueta (tarjeta A): pista, marca del objetivo en el centro, trazo hasta el punto del peso actual, cifra en **pp** en tinta. SVG a mano con coordenadas en porcentaje; reutiliza la geometría de `Gauge`. La barra doble de hoy se queda arriba, como miniatura del reparto.
- **La banda del umbral y el color del punto salen de los avisos del dominio, nunca de comparar cifras en la interfaz** (decisión (c) de `system.md`). **Como el aviso es por activo** (§0, punto 5), la dirección decidió (§8 P3):
  - la tira de cada **tipo** lleva la pista, el objetivo, el punto y la cifra en pp, **sin banda y en tinta**;
  - si algún activo de ese tipo tiene el aviso, lleva también una etiqueta «⚠ N activos fuera de umbral», que sale de los avisos del dominio agrupados por la clase del activo (agrupar un aviso no es comparar cifras);
  - **la tira completa, con la banda y el punto coloreado, va por activo**, en «Ver activo por activo» del móvil y en la tabla de escritorio, donde ya está el `Gauge`.

  No cambia el dominio.
- **Renta variable y cripto no se distinguen solo por el color** en ninguna gráfica de líneas (propuesta, T5 y §5.1): llevan etiqueta directa o trazo distinto.

#### Bloque 5 — M10: los medidores del cubo y las mancuernas de las tesis

- **Tres barras de medida** (tarjeta C): lo aportado frente al tope, con la marca del aviso; el resultado sobre lo aportado, con **la regla de parada**; y **el peso del cubo sobre el patrimonio**, con su máximo, **la única cifra que junta los dos libros**, con su filete de acento y la frase que lo dice (constitución III). **Ninguna marca se escribe en la web**: la regla de parada y el peso máximo salen de `Settings` (`bucket_stop_loss_pct` y `bucket_max_weight_pct`), y el aviso del tope sale del dominio, de `NEAR_LIMIT_PCT`. Hoy es una constante del dominio sin exportar (`bucket-stats.ts:38`), no un campo de `Settings`; **pasa a exportarse**, y la web la usa (§0, punto 1; §8.1, segunda ronda, N1). El −30 % y el 10 % de la maqueta son datos de ejemplo (constitución IV).
- **Las mancuernas por tesis** (tarjeta D): el punto de la tesis y el anillo del índice sobre una escala común, la línea fina del 0 %, y la diferencia **en pp, en tinta y con su signo**: el color no la lleva. Punto frente a anillo: **la forma** distingue, no el color.

### E4 — Las gráficas y el tiempo

#### Bloque 0 — Lo que se fija antes del código (en el alto del plan, o antes de E4 si la dirección lo aplaza)

- **La definición de lo aportado**, escrita por la dirección en `docs/business-rules.md` a partir de tu propuesta. Tu propuesta responde, caso a caso y con un ejemplo cada uno: qué eventos cuentan (ingresos y retiradas de efectivo **en cuentas de la cartera principal**); su valor en euros (`amount / fx_rate` del propio evento, ADR-0013, nunca otro tipo); que **los dividendos, los intereses, las comisiones y los traspasos internos no cuentan**; qué pasa con un traspaso de custodia (ADR-0012), con un evento anulado o corregido (la proyección ya los resuelve), con un libro que registra compras sin ingresos previos, y con la consulta a una fecha (ADR-0016). **El cubo nunca entra** (constitución III).
- **La regla de «Este año»**, ya decidida (§8 P8): bloque 3.

#### Bloque 1 — Los guardianes y el dominio, antes que la pantalla (commits propios)

- **`contributedSeries`**: una función pura del dominio, **detrás de su puerta perezosa** (§2 bis), que da lo aportado a la cartera principal **en cada fecha de la serie**. Sale solo de los movimientos y **nunca tiene huecos**: no depende de ningún precio. Tests, uno por caso de la definición.
- **El cubo frente al índice en porcentaje sobre lo aportado, en cada fecha**: el `vs_index_pct` de `bucket-stats.ts`, por punto de `bucketIndexSeries`, **sin recalcular la regla 16** (la serie ya consume `bucketTheses`). Un punto con una comparación parcial **no tiene porcentaje**.
- **El calendario fiscal**: una función pura del dominio, en la parte fiscal y perezosa (`@atlas/domain/fiscal`), que dada una fecha de consulta devuelve las fechas que importan, cada una con su clase (fin de una ventana de recompra, plazo de un modelo, valoración de fin de año, campaña) y **los identificadores de lo que la origina, nunca un importe**. La ventana **no se recalcula**: se usa `washSaleWindowEnd` con la configuración por tipo de activo (ADR-0014, *domain trap* 9). La campaña, de `rentaSeasonOf`. La valoración, de `yearEnd`. **El plazo de los modelos** es **un dato normativo por ejercicio, en el dominio, con su fuente citada: la norma y la orden ministerial que lo fijan**, con su dirección y su fecha (§8 P4), igual que las casillas del Modelo 100 viven por ejercicio. Un ejercicio sin dato no pinta plazo y lo dice; nunca lo supone. **Si no encuentras la fuente, PARA** y lo dices en `questions.md`. **Ninguna fecha fiscal escrita en la web**, y un guardián lo comprueba (§6, familia 1).
- **La salida fiscal no se mueve** (§2 bis), con la predicción antes.
- En la PR, los tres **señalados** como cambios de dominio, con su lista de commits.

#### Bloque 2 — M3: la evolución en paneles, con lo aportado

- **Paneles alineados que comparten el eje de fechas**, no un gráfico de doble eje: arriba, la cartera principal con lo aportado (discontinuo, `--c-series-contrib`, en escalón con `paths.stepped`); debajo, dos tiras, el cubo y el efectivo, **cada una con su escala** y rotuladas «escala propia» (maqueta `resumen-privacidad.html`). Alturas de la propuesta (132 px en el móvil y unos 300 en el monitor para el panel principal, 44-64 px las tiras), afinadas en el plan con `--chart-h`. Tres instancias de uPlot con `cursor.sync`.
- **Con la privacidad puesta, ningún eje lleva cifras** y la distancia entre la cartera y lo aportado se ve sin ellas. **La tabla equivalente plegada** lleva también lo aportado, con sus importes por `Amount`.
- **El hueco**: la opción A, la de hoy (la línea se corta; la banda solo donde no hay ninguna serie), que es la que eligió la dirección (§8 P7). Lo aportado cruza por encima de los huecos, que es lo que hace que la gráfica deje de parecer rota. **La línea que explica el hueco** sigue debajo.

#### Bloque 3 — El rango «Este año»

- «1 mes» desaparece y entra **«Este año»**: «Este año · 1 año · 5 años · Todo». La regla, en `ranges.ts` (§8 P8): desde el **1 de enero del año de la fecha consultada** (la de «hoy» por defecto, o la del selector de fecha), en `Europe/Madrid`, hasta esa fecha. El rango que se abre por defecto sigue siendo el de hoy. Y con la misma norma de hoy: **un rango sin puntos se ofrece desactivado y con su motivo**. Vale para las dos gráficas con rango (evolución y cubo).

#### Bloque 4 — M7: el cubo frente al índice, en porcentaje

- La gráfica, **en % sobre lo aportado**, que se lee con la privacidad puesta **y con el eje**, porque un porcentaje no delata la magnitud. El eje, con su unidad.
- **La regla del hueco**: si en el rango elegido el hueco ocupa **más de la mitad** del ancho, el rango salta al último tramo con datos, y lo dice. Si no queda ningún tramo, la tarjeta enseña el bloque *pendiente* y **ninguna gráfica**. Es presentación: vive en `view-models/series.ts`, con su test en el borde exacto de la mitad.

#### Bloque 5 — M12: el calendario fiscal, cuarta gráfica

- **Una tira anual de doce meses** (tarjeta E): la campaña como banda, «hoy» como línea de acento, y las fechas como marcas de **forma distinta**: triángulo para el fin de una ventana, cuadrado para un plazo, círculo para una valoración. Debajo, **la lista** con la fecha y una frase, que es además el equivalente accesible. Todo son fechas y nombres: **se ve entero con la privacidad puesta**, y ninguna frase lleva un importe.
- **Dónde**: en `/fiscal`, y **en su versión corta dentro de *Declaración* durante la campaña**.
- **Qué año enseña la tira** y qué pasa con una fecha que cae fuera de él (una ventana de un año que termina el año siguiente): lo propone el plan, con una regla que no esconda ninguna fecha (por ejemplo, la fecha va en la lista y la tira la señala en su borde).
- Coste: en el trozo fiscal, que es perezoso. **Nada del calendario en el arranque.**

### M14, condicional: los estilos de cada pantalla con su pantalla

**No entra** (§0, punto 4). Entra solo si **una medida real** del arranque, en cualquier entrega, **no cabe en 76.069 bytes**. Entonces:
- **se para** y se dice con la medida trozo a trozo, como cualquier otra parada;
- M14 es **la primera propuesta de recorte**, con un prototipo construido y deshecho que diga cuánto libera del arranque y cuánto sube el total;
- si la dirección la elige, **va una ADR en estado `Propuesta`** (`/adr`) antes de su primer commit, porque cambia cómo se cargan los estilos que fijó ADR-0023 y añade una regla que toda pantalla futura tiene que cumplir: el orden de la cascada (`layout.css` va la última a propósito) y que ninguna hoja de pantalla llegue tarde (un destello sin estilos). La ADR la acepta el usuario, nunca tú.

## 4. Fuera de alcance

- **Cualquier cambio del esquema del libro**, de `schema_version` o de un campo de `Settings`. Si una mejora lo pide (el plazo del 720 configurable, por ejemplo), **para** (§8 P4).
- **La deriva de la desviación en el tiempo** (propuesta, §3.1, «Más adelante, no ahora»).
- **La opción B del hueco** (el último precio conocido sostenido), que la dirección descartó para esta feature (§8 P7).
- **Una fuente alojada**, cualquier dependencia nueva y cualquier cambio de la CSP.
- **M14**, salvo su condición (§3).
- **La consola**: esta feature es de la web. Ningún cambio de salida de `apps/cli`.
- **Aceptar una ADR** (puedes proponerla), reabrir una aceptada o tocar `docs/`.

## 5. Criterios de terminado

Valen **para cada entrega**, sobre lo que construye, y para la feature entera al final.

- **La tubería**: `lint`, `typecheck`, las dos pasadas de cobertura (`test:coverage:domain` con el umbral del 100 % y `test:others`), `build` (con `check-bundle.mjs`) y la CI, en verde. **El test de arquitectura en verde**, con las reglas nuevas de las puertas.
- **Cada regla de la tabla del alto con su test**, visto en rojo antes que en verde, y **de cada arreglo, cómo lo viste en rojo y qué volviste a mirar alrededor**, en `questions.md`.
- **Ningún gemelo `.js`** junto a una fuente fuera de `dist*/`, comprobado antes de cada lote de mutación y antes de cada PR, con la orden y su salida en `questions.md`.
- **La salida fiscal, igual byte a byte** (§2 bis), con la predicción escrita antes.
- **El paquete web, medido mejora a mejora.** Partida, sobre el `develop` con la 015 entera: **la mides tú al empezar**, arranque y total, y lees los techos de `check-bundle.mjs`. **Referencia a la fecha de la PR #98, que se vuelve a medir al empezar**: arranque 74.114 medidos, techo 74.134 y 1.955 bytes de margen hasta la autorización; total en torno a 301.370, techo 301.496. Si tu medida se aparta de la referencia, **escribe las dos** en `questions.md`. No es una parada: la referencia no es una puerta.
  - **Autorización de la dirección para esta feature**: **el arranque, hasta 76.069**, la de la 015 (su prompt, §7 P13), que sigue en pie; y **el total, hasta 309.500**, subida desde los 304.640 de la 015 para esta feature (§8 P1).
  - **Cada subida de techo, en su propio commit y antes del commit que la necesita**: lo medido **más 20 bytes** en el arranque, y lo medido más un margen pequeño (no más de 256 bytes) en el total. Con la medida y el desglose **trozo a trozo** en el mensaje y en `questions.md`, y la tendencia en el comentario de `check-bundle.mjs`. Se mide **con un prototipo construido y deshecho** antes del commit de la mejora, no después.
  - **Una tabla por mejora** en `questions.md`: arranque y total antes y después de cada M, contra lo que estimaba la propuesta.
  - **Si un techo no cabe en su autorización, se para.** Se dice con la medida trozo a trozo, con lo que falta, y con **una propuesta de recorte** que diga qué mejora o qué parte se quita y cuánto libera cada opción. **No se inventa una autorización**, no se esconde nada con una importación dinámica que cambie lo que se ve, y no se recorta una comprobación. Si es el arranque, M14 es la primera propuesta (§3).
  - **Si una medida baja**, va un techo nuevo más bajo en su propio commit, con 20 bytes de margen.
- **Capturas antes y después, que se envían al usuario antes de fusionar.**
  - **Chromium**: el de `~/.cache/ms-playwright/`. **Busca la versión** (`ls -d ~/.cache/ms-playwright/chromium-*`, la más alta), no la fijes en el guion, y escribe en `questions.md` cuál usaste.
  - **Dos compilaciones de producción**, servidas con `vite preview` y su CSP: **antes**, la de `develop` al empezar la entrega, en un worktree desacoplado; **después**, la de tu commit congelado.
  - **La matriz**, en cada pantalla que la entrega toca y siempre en el Resumen: **400×890 con DPR 3** (su móvil) y **2045×1141** (su monitor); **claro y oscuro**; **con la privacidad puesta y quitada**; **con el libro vacío y con datos sintéticos** (`atlas synth --out <ruta> --seed 1`, sembrado desde tu scratchpad). Más el primer arranque, sin libro.
  - **Por *viewport*, no a página completa**: desde arriba y una pantalla más abajo cada vez hasta el final, con las barras fijas encima, como las ve el usuario (015, §30.5).
  - **El reloj, fijado fuera de la aplicación**, con un guion inyectado por DevTools, **en dos fechas**: el **20/01/2029**, fuera de la campaña, y el **15/05/2029**, dentro. La aplicación no sabe nada de ese guion.
  - **Además, medido** (en `medidas.json`): sin desplazamiento lateral a **360**, 400, 1.440 y 2045 px (`scrollWidth === clientWidth`); ningún objetivo táctil por debajo de 44 px; ningún texto que se lee por debajo de 13 px (salvo los puntos de la máscara); el ancla de `#sincronizacion`; el cambio del paso de 1.800 px; **la evolución por encima del pliegue a 2045×1141**, en cada entrega que toca el Resumen y en la verificación final (§8.1, segunda ronda, N3); y **que nada salta en el primer pantallazo** cuando llega lo perezoso.
  - **Dónde**: `~/personal/atlas/privado/capturas/<YYYY-MM-DD>-020-E<n>/antes/` y `…/despues/`, con los nombres `<pantalla>-<ancho>-<tema>-<privacidad>-<libro>-<fecha>-<n>.png`, y **un índice** (`LEEME.md`) que empareje cada antes con su después y diga qué mejora enseña. **Nunca en el repositorio.**
  - **La dirección las envía al usuario**, y la PR de la entrega **no se fusiona** sin que el usuario las haya visto.
- **Revisión por mutación**, con la disciplina de §2 ter, en la lógica que toques: el dominio nuevo, los modelos de vista nuevos y las reglas de los guardianes. Los lotes, en tu scratchpad con el prefijo `020-`; el recuento, en `questions.md`. Como mínimo, **cada uno visto morir**:
  - **E1**:
    1. un color definido en claro y **ausente en uno de los dos bloques oscuros**;
    2. ganancia y pérdida **intercambiadas**, o la pérdida con el valor del peligro;
    3. **una matriz de simulación identidad**, o la de otra deficiencia;
    4. `--c-positive` o `--c-negative` **olvidados** en una hoja, o `--c-gain` **en un peso o una desviación**, o **por un alias**;
    5. **el guion en lugar del menos** (U+2212), o **el cero con signo**;
    6. **el margen del ancla** escrito como un número en lugar de la variable del alto de la barra;
    7. **la columna *Estado*** siempre visible, o nunca;
    7 bis. **un techo de `check-bundle.mjs` por encima de su autorización** (76.069 o 309.500) que construye en verde;
    7 ter. **dentro de `tokens.css`**: una variable que toma `var(--c-loss)`, u otra con el mismo valor que `--c-gain`; y **un color semántico metido en la lista de pares permitidos**.
  - **E2**:
    8. **`prominent` con la regla de antes** (un 720 pendiente sube la tarjeta fuera de la campaña);
    9. **la campaña sin sus bordes** (el primer o el último día fuera), o **leída en UTC**;
    10. **la línea de perder datos repetida** en *Atención*, o **no la primera**;
    11. **el aviso del 720 perdido** fuera de la campaña, o **dicho dos veces** (en la fila y en *Atención*);
    11 bis. **fuera de la campaña y con eventos inválidos**, la tarjeta sube, la fila repite el aviso, o el aviso no llega a *Atención*;
    11 ter. **`hasForeignAccountsAt`** que compara con el literal `"ES"` en lugar de `tax_residence`, que supone `ES` cuando falta `tax_residence`, o **una fila reservada sin cuentas en el extranjero**;
    12. **«pendiente» en una línea** con dos precios que faltan, o el bloque con uno solo;
    13. **las valoraciones agrupadas entre días distintos**, con otro tipo de movimiento o **con una anulada**; el mes **en UTC**; y **un grupo que cuenta como varias filas** en *Últimos movimientos*, o que ignora la fecha consultada.
  - **E3**:
    14. **un importe fuera de `Amount`**, en el texto, en un `title`, en un `aria-label` o en el `<title>` de un SVG, con la privacidad puesta;
    15. **un porcentaje calculado con `number`** (un caso que redondea distinto, como 1,005);
    16. **un porcentaje sobre un total parcial**;
    17. **la columna fundida** con la privacidad quitada, o **las columnas sueltas de máscaras** con ella puesta;
    18. **el punto de la tira coloreado comparando cifras** en la interfaz (un caso por encima del umbral **sin** aviso del dominio no se colorea);
    19. **la marca del aviso del tope escrita en la web**: si `NEAR_LIMIT_PCT` cambia en el dominio (a 75, por ejemplo), la marca del medidor se mueve, y un test lo comprueba. Además, **la parada o el máximo como constantes** en lugar de su valor de `Settings`, o el peso del cubo **sin su señal** de única cifra que junta los dos libros;
    20. **la diferencia de la tesis coloreada**, o el punto y el anillo intercambiados.
  - **E4**:
    21. **lo aportado** contando un dividendo, un traspaso interno o una cuenta del cubo, con **otro tipo de cambio** que el del evento, o con `number`;
    22. **lo aportado con un hueco** en una fecha a la que le falta un precio;
    23. **«Este año»** que empieza un día antes o después, o **en UTC**;
    24. **la regla del hueco** con `≥` en lugar de `>` en la mitad exacta, o dibujando una gráfica cuando no queda ningún tramo;
    25. **el porcentaje del cubo** sobre el valor en lugar de sobre lo aportado, o **presente** con una comparación parcial;
    26. **una fecha fiscal escrita en la web**; **la campaña por defecto** ignorando `Settings`; **la ventana recalculada** en lugar de `washSaleWindowEnd`; **un importe en una frase** del calendario;
    27. **los paneles con una sola escala**, o **sin `cursor.sync`**;
    28. **una función nueva del dominio exportada por el barril**, o **fuera de `LAZY_ONLY`**.
  - **Siempre**: 29. **una cifra fiscal que cambie**; y 30. **un test de `develop` que desaparece** de la rama sin decirlo (§2 ter).
- **`docs/` sin cambios**, salvo una ADR en estado `Propuesta` si la propones. Y **`specs/020-visual-refresh/questions.md`** con: el bloque 0 y sus fuentes, lo preguntado y lo respondido, el SHA congelado de cada entrega, cómo viste fallar cada test, la tabla del paquete, las capturas y sus medidas, la autocomprobación de §6, y **la lista de documentos que la dirección tendrá que actualizar**. Como mínimo:
  - **`docs/design/system.md`**: §3.1 (`--c-gain`, `--c-loss` y `--c-series-contrib`), §3.3 y §3.4 (el paso de 1.800 px), §4.1 (el punto de corte), §5.2 (un porcentaje junto a cada máscara), §5.12 (los rangos), §5.15 (los paneles, lo aportado, la tira, los medidores, las mancuernas y el calendario), §6 (pp y %, U+2212, el cero sin signo), §7.2 (el Resumen, la línea de perder datos y *Declaración*), §7.3 (la cabecera por mes y las valoraciones agrupadas), §7.4 a §7.8, §8 (las decisiones nuevas) y §9 (dónde vive cada cosa);
  - **`docs/design/brief.md` §7** (cuatro gráficas; «Este año» en lugar de «1M»), con una nota fechada, no reescrito;
  - **ADR-0017**, una nota fechada: sus Consecuencias nombran «1M/1A/5A/Todo»;
  - **`docs/business-rules.md`**: lo aportado (escrito ya en el alto), la línea 324 (la tarjeta sube solo en la campaña) y el calendario fiscal;
  - **la propuesta**, con su estado: implementada, y en qué PRs;
  - `docs/decision-roadmap.md` y `docs/prompts/README.md`.
- **`npm run lint` como último paso** de cada entrega, redirigiendo a un fichero y leyendo `$?`. Commits de una línea, sin rastro de IA, cada uno en verde, y la rama empujada.

## 6. Autocomprobación antes de abrir cada PR

Antes de abrir la PR de cada entrega, y otra vez antes de pedir la revisión, **recorres estas seis familias** y escribes en `questions.md`, familia a familia, **qué miraste, cómo y qué salió**. Son las familias de defectos que más han costado en las features anteriores. Una familia con «nada que mirar» se justifica en una línea.

1. **Guardianes que se pueden eludir.** Para cada guardián nuevo o tocado (el del color, el de los alias, el de la privacidad por atributos, el de las fechas fiscales en la web, el de la puerta del barril, `LAZY_ONLY`, los estilos en línea), **escribe la vía que lo salta y mira que muere**:
   - el color: un valor en `rgb()`, `hsl()` o con nombre en lugar de `#hex`; un tercer bloque de tema que el lector no mira; un alias;
   - la privacidad: un importe en un atributo, en un SVG, en la tabla equivalente o en el texto de un `Disclosure` plegado;
   - las fechas fiscales: `"03-31"`, `"3/31"`, `new Date(año, 2, 31)` o un mes escrito en letra;
   - la puerta: una reexportación por otro módulo del dominio, o una importación con ruta relativa que se salta el nombre de la puerta;
   - los estilos: `style` puesto por `setAttribute` o por `innerHTML`.
   Un guardián que reconoce algo **por parecido** (un nombre, un prefijo, una ruta) y no **por identidad** es el primero que se salta.
2. **Reglas sin test.** Recorre la tabla de reglas del alto y **cada frase de §3 que dice «siempre», «nunca», «solo» o un número**: cada una tiene su test, y el test **falla** si la regla se rompe (su mutante lo prueba). Busca también reglas que el código cumple por casualidad: un orden que sale bien porque los datos de prueba vienen ya ordenados, un porcentaje que redondea bien porque ningún caso cae en el medio.
3. **Tests que dependen del reloj.** Ningún test ni ningún modelo de vista lee `Date.now()`, `new Date()` sin argumento ni la hora del sistema: la fecha entra como argumento (la fecha de consulta, ADR-0016). Para demostrarlo:
   - **corre las suites de la web y del dominio con dos husos extremos** (`TZ=Pacific/Kiritimati` y `TZ=Pacific/Pago_Pago`) y con el reloj del sistema falseado a un **31 de diciembre a las 23:30** y a un **1 de enero a las 00:30**: el resultado tiene que ser el mismo;
   - los bordes de la campaña, de «Este año», de la cabecera por mes y del calendario, **en `Europe/Madrid`**, con su test en el día exacto y en el de al lado.
4. **Documentos y descripción de la PR desalineados.** La descripción de la PR, `questions.md`, `tasks.md` y lo que de verdad hay en la rama **dicen lo mismo**:
   - cada cosa que la PR dice que está hecha tiene su commit, y cada commit está en la PR;
   - las cifras del paquete de la PR son las medidas sobre el commit congelado, no las de un commit anterior;
   - las capturas que la PR cita existen en su carpeta, con esa fecha y ese Chromium;
   - los cambios de dominio están **señalados** con su lista de commits;
   - **la lista de documentos para la dirección** está completa: cada regla visible que cambió tiene su línea (§5);
   - lo que no se hizo, **se dice como no hecho**, con su motivo.
5. **Techo subido tarde.** **Cada commit de la entrega construye en verde por sí solo**, `check-bundle.mjs` incluido. Compruébalo commit a commit sobre los que tocan `apps/web/`, `packages/domain/src/` o `check-bundle.mjs`: cada uno en un worktree desacoplado, en secuencia y detrás de la puerta de memoria, con `npm run build` y su `$?` en una tabla de `questions.md`. **Cada subida de techo va delante del commit que la necesita** y dentro de su autorización; ningún techo sube «de paso» en el commit de una mejora.
6. **Accesibilidad y contraste.**
   - **Contraste**: los colores nuevos, medidos por el test del color (§3, E1) en los tres bloques; y en el navegador, el texto sobre `--c-fill` (el bloque *pendiente*, la cabecera plegada) en los dos temas.
   - **El color nunca va solo**: signo en cada resultado; forma distinta en cada marca (punto y anillo; triángulo, cuadrado y círculo); trazo distinto en cada serie (continuo, discontinuo, punteado); renta variable y cripto nunca juntas sin etiqueta directa.
   - **Cada SVG nuevo** es `role="img"` con un `aria-label` que dice lo que enseña **en porcentajes y fechas, nunca en importes** (y con la privacidad quitada, tampoco: la etiqueta no cambia con la privacidad), o es `aria-hidden` y tiene al lado su equivalente en texto. Cada gráfica conserva **su tabla equivalente plegada**.
   - **Objetivos de 44 px**, **nada que se lee por debajo de 13 px**, el foco visible con el anillo de acento y **el orden de tabulación igual al visual**, también en el 8+4 de 1.800 px, donde la rejilla coloca las tarjetas fuera del orden del DOM.
   - **«Reducir movimiento»** respetado: nada nuevo se anima.
   - **Sin desplazamiento lateral de 360 a 2045 px**, medido (§5).

## 7. Decisiones

### 7.1 Lo que ya está decidido, con su fuente (este prompt no lo reabre)

- **(a) El alcance: todas las mejoras de la propuesta, M1 a M13, con sus maquetas.** *Fuente:* el usuario, que aprobó la propuesta entera (2026-09-27, por la dirección).
- **(b) El calendario fiscal entra como cuarta gráfica** (M12), frente a la regla de «tres gráficas y ninguna más» de `brief.md` §7. *Fuente:* la dirección, 2026-09-27.
- **(c) El rango «1 mes» pasa a ser «Este año»**: «Este año · 1 año · 5 años · Todo». *Fuente:* la dirección, 2026-09-27 (propuesta, §3.2, «Rango»).
- **(d) *Declaración* deja de ir primera fuera de la campaña de la Renta**; lo que había del 720 y del 721 fuera de ella entra en *Atención*. *Fuente:* la dirección, 2026-09-27 (propuesta, M2).
- **(e) Los dos colores nuevos, `--c-gain` y `--c-loss`, con los valores de la propuesta, entran si pasan la prueba de daltonismo en claro y en oscuro**, y la prueba queda en el repositorio. *Fuente:* la dirección, 2026-09-27 (propuesta, M6 y §5.1).
- **(f) M14 solo si la propuesta lo justifica, y con una ADR en estado `Propuesta` si lo exige.** Quien redacta este prompt concluyó que hoy no lo justifica (§0, punto 4), y **la dirección lo confirmó** el 2026-09-27: M14 queda fuera, con su condición de entrada (§8 P2).
- **(g) El ancla de `#sincronizacion`**, que la 015 encontró y dejó para la dirección (`specs/015-api-access/questions.md` §30.5), entra en E1.
- **(h) Sin dependencias nuevas, sin fuentes remotas, CDNs ni analítica, y con la CSP estricta.** *Fuente:* `CLAUDE.md`, *Security*; ADR-0017; ADR-0023; propuesta, §6.
- **(i) Las mejoras visuales no cambian la lógica del dominio**, salvo M3, M7 y M12, que se hacen en commits propios, con sus tests, señalados en la PR. *Fuente:* la dirección, 2026-09-27. **Quien redacta añadió M2** con el mismo tratamiento, porque la regla que cambia vive en el dominio (§0, punto 1), y **la dirección lo confirmó** el 2026-09-27: commits propios, señalado en la PR y con su test y su mutante (§5, mutante 8). **La dirección declaró una quinta necesidad** en la segunda ronda: `hasForeignAccountsAt` y la exportación de `NEAR_LIMIT_PCT`, en el barril y con su coste medido (§0, punto 1; mutantes 11 ter y 19).
- **(j) El presupuesto**: la partida y las autorizaciones de §5 (el total, hasta 309.500, §8 P1); cada techo en su propio commit y antes del que lo necesita; si no cabe, se para y se propone un recorte, sin inventar una autorización. *Fuente:* la dirección, 2026-09-27; su precedente, `docs/prompts/015-api-access.md` §7 P13, y D-Q7 de la 014.
- **(k) La implementación empieza desde `develop` después de que se fusione la 015 entera.** *Fuente:* la dirección, 2026-09-27.
- **(l) Un implementador nuevo, no el de la 015.** *Fuente:* la dirección, 2026-09-27.

### 7.2 Lo que propone el plan y confirma la dirección en el alto

Sin elegir tú: cada una, **marcada como propuesta** en el plan, con su motivo.

- **(a)** La definición de lo aportado (§3, E4, bloque 0), caso a caso.
- **(b)** Qué año enseña el calendario y cómo se señala una fecha fuera de él (§3, E4, bloque 5).
- **(c)** El texto del botón de M13 («Importar de la carpeta» o el alto automático).
- **(d)** `scroll-margin-top` en los destinos o `scroll-padding-top` en el documento (§3, E1, bloque 6).
- **(e)** Los nombres de las puertas nuevas del dominio, y si `netWorthSeries` y `bucketIndexSeries` se mudan a ellas (§2 bis).
- **(f)** Las alturas finales de los paneles de M3.
- **(g)** Qué valores del dominio faltan para M1 y M10, si falta alguno (§0, punto 1).
- **(h)** El orden de recorte si el total se acaba (§5).

## 8. Respuestas de la dirección

### 8.1 Las respuestas de la dirección a §9 (2026-09-27)

Tal como llegaron. El texto de §0 a §7 ya las aplica.

#### Primera ronda: las preguntas de §9

- <a id="p1-resp"></a>**P1 — El total: sí.** **La autorización del total sube a 309.500 bytes.** La del arranque se queda en **76.069**. Cada techo se sigue subiendo **en su propio commit y antes del commit que lo necesita**. Por encima de cualquiera de las dos, se para y se propone un recorte, como siempre. Aplicada en la cabecera, en §0, punto 3, en §3, «La partición», en §5 y en §7.1 (j).
- <a id="p2-resp"></a>**P2 — M14 queda fuera**, con su condición de entrada tal como está escrita en §3, «M14, condicional», y su ADR en estado `Propuesta` si llegara a entrar. Aplicada en §0, punto 4, y en §7.1 (f).
- <a id="p3-resp"></a>**P3 — La tira de M5: como recomendaba quien redacta.** La tira de cada tipo va sin banda y en tinta, con la etiqueta «N activos fuera de umbral» sacada de los avisos del dominio agrupados por clase. La tira completa va por activo. Sin cambio de dominio. Aplicada en §3, E3, bloque 4.
- <a id="p4-resp"></a>**P4 — El plazo del 720 y del 721: como recomendaba quien redacta.** Es **un dato normativo por ejercicio, en el dominio, con su fuente citada: la norma y la orden ministerial**. **Si no se encuentra la fuente, el implementador PARA.** No es configuración ni cambia el esquema. Aplicada en §0, punto 5, en §3, E4, bloque 1, y en §4.
- <a id="p5-resp"></a>**P5 — El aviso del 720 en *Atención*: como recomendaba quien redacta.** Una fila de esqueleto al final de los grupos visibles, solo fuera de la campaña y solo si hay alguna cuenta en el extranjero. Aplicada en §3, E2, bloque 2.
- <a id="p6-resp"></a>**P6 — El orden del Resumen en el móvil: como recomendaba quien redacta.** Manda el texto de la propuesta, no el orden del DOM de la maqueta. Aplicada en §1, punto 4, y en §3, E2, bloque 2.
- <a id="p7-resp"></a>**P7 — El hueco de la evolución: la opción A, como recomendaba quien redacta.** La B queda fuera de esta feature y pide su propia decisión. Aplicada en §3, E4, bloque 2, y en §4.
- <a id="p8-resp"></a>**P8 — «Este año»: como recomendaba quien redacta.** Desde el 1 de enero del año de la fecha consultada, en `Europe/Madrid`, hasta esa fecha. Sin puntos, se ofrece desactivado y con su motivo, y el rango por defecto no cambia. Aplicada en §3, E4, bloques 0 y 3.
- <a id="p9-resp"></a>**P9 — La hoja de ruta: ya, en la PR de este prompt**, no al cierre. `docs/decision-roadmap.md` lleva la entrada de la 020.
- <a id="m2-resp"></a>**M2 como cambio de dominio: de acuerdo.** Commits propios, señalado en la PR y con su test y su mutante (§5, mutante 8). Aplicada en §0, punto 1, en §3, E2, bloque 1, y en §7.1 (i).

#### Segunda ronda: la revisión 1 de la PR #100 (2026-09-27)

La revisión ([comentario de la PR #100](https://github.com/Jemartri44/atlas-portfolio-tracker/pull/100#issuecomment-5856792031)) no convergió: tres bloqueantes, cuatro puntos más y una preferencia. Estas son las decisiones de la dirección, del mismo día. El texto de §0 a §7 ya las aplica.

- <a id="r1-b1"></a>**B1 — La puerta de entrada no depende de ninguna cifra literal.** El commit `5d73d34` de E5 subió el techo del arranque a 74.134 tras medir 74.114, así que la puerta que exigía «74.093» no se habría cumplido nunca. **El implementador lee el techo que haya dejado la 015 en `check-bundle.mjs` después de fusionarla, y mide él mismo el punto de partida**, arranque y total. **La partida de referencia es 74.114 medidos, 74.134 de techo y 1.955 bytes de margen, a la fecha de la PR #98, y se vuelve a medir al empezar.** Aplicada en la cabecera, en §0, punto 3, y en §5.
- <a id="r1-b2"></a>**B2 — El aviso del 720 va a *Atención***, como dice la propuesta. **Plegada, la fila de *Declaración* muestra solo su estado neutro**, por ejemplo «Declaración 2028 · fuera de campaña», sin repetir el aviso. Se corrige el ejemplo de la fila, que era el mismo aviso. **El mutante 11 se mantiene**: el aviso dicho dos veces muere. Aplicada en §3, E2, bloque 2.
- <a id="r1-b3"></a>**B3 — Quinta necesidad de dominio: `hasForeignAccountsAt`.** Es una función pura del dominio que usa **`tax_residence` de `Settings`** y no el literal `"ES"`. Va en un módulo que el arranque pueda importar, **se exporta por el barril** y se mide su coste en bytes. Lleva test y mutante (11 ter). Los «cuatro sitios contados» pasan a cinco. Aplicada en §0, punto 1, en §2 bis, en la partición, en §3, E2, bloque 2, y en §7.1 (i). **Precisión de quien redacta**: hoy `fiscalAttention` y los modelos informativos comparan con `"ES"`. Alinearlos con el predicado solo se hace si no mueve ninguna cifra ni ningún aviso fiscal, y si lo movería, lo decide la dirección. **Sin `tax_residence`, el predicado no supone `ES`**: reserva la fila, que es lo seguro.
- <a id="r1-n1"></a>**N1 — El dominio exporta `NEAR_LIMIT_PCT`**, como parte de la quinta necesidad, y la web lo usa. El mutante 19 se reformula: si la constante cambia, la marca se mueve. Aplicada en §0, punto 1, en §3, E3, bloque 5, y en el mutante 19.
- <a id="r1-n2"></a>**N2 — El guardián se amplía a `tokens.css`**: dentro de él no puede haber dos tokens de color con el mismo valor ni alias de los colores semánticos. Su mutante es el 7 ter. **Precisión de quien redacta**: en `640fa98` ya hay pares iguales legítimos (la superficie y los textos sobre acento y peligro, cada serie con su tipo de activo, y otros dos en oscuro). Tal como estaba escrita, la regla fallaba sobre `develop`. Por eso admite una **lista cerrada de pares**, con el motivo de cada uno, en la que **ningún color semántico puede entrar**. Aplicada en §3, E1, bloque 1.
- <a id="r1-n3"></a>**N3 — «La evolución por encima del pliegue a 2045×1141» se vuelve a medir en E2 y en la verificación final.** Aplicada en §3, E1, bloque 3, y en §5.
- <a id="r1-n4"></a>**N4 — Fuera de la campaña y con eventos inválidos, el aviso de inválidos va a *Atención*** y la fila de *Declaración* muestra su estado neutro. Su mutante es el 11 bis. Aplicada en §3, E2, bloques 1 y 2.
- <a id="r1-pref"></a>**Preferencia aceptada — `check-bundle.mjs` falla si algún techo supera su autorización** (76.069 para el arranque, 309.500 para el total). El implementador lo añade en E1, con su mutante (7 bis). Aplicada en §3, E1, bloque 1.

### 8.2 Respuestas a las preguntas del implementador

*(Vacío: aquí responderá la dirección, y se anotarán los errores de este prompt.)*

## 9. Preguntas abiertas para la dirección

Lo que la primera redacción de este prompt no podía cerrar, cada una con la recomendación de quien redacta. **Todas están respondidas** por la dirección el 2026-09-27, y cada una enlaza a su respuesta en §8. Se conservan con su texto original para que se vea qué se preguntó. **El alto del plan no espera a ninguna.**

- **P1 — El total del paquete no cabe en la autorización de hoy.** Quedan 3.270 bytes hasta 304.640, y la propuesta estima entre +5 y +6 KiB (entre 5.120 y 6.144 bytes). Acumulando por entregas (§3), E1 a E3 gastan unos 2,75 KiB y el total se acaba al empezar E4, justo en M3, que es la tercera mejora de más valor. Todo lo que cuesta total es **código perezoso**: no se descarga antes de la primera pantalla. **Recomendación: que la dirección suba ya la autorización del total a 309.500 bytes** (unos +4,7 KiB sobre la de hoy: la estimación alta más un 30 % de holgura), **sin tocar la del arranque** (76.069), para que la parada no caiga en las gráficas. La regla de cada techo no cambia: lo medido, en su propio commit, antes del que lo necesita. Si la dirección prefiere no subirla, que lo diga en el alto, y el plan trae el orden de recorte (§7.2 (h)); la propuesta de quien redacta sería, por este orden, las mancuernas de M10, la versión corta del calendario dentro de *Declaración* y M9. Bloqueaba el alto. **Respondida:** [§8 P1](#p1-resp).
- **P2 — M14 fuera.** La premisa de la propuesta (el arranque sin margen) ya no vale tras la 015, y M14 sube el total, que es lo que no cabe (§0, punto 4). **Recomendación: confirmar que M14 no entra**, con la condición de entrada de §3 y su ADR en estado `Propuesta` si llegara a entrar. Mientras no conteste, vale. **Respondida:** [§8 P2](#p2-resp).
- **P3 — La tira de M5 y el umbral por activo.** El dominio avisa de la desviación **por activo** (`deviation_above_threshold` con `asset_id`), no por tipo de activo, así que la banda del umbral en la tira de un tipo no tiene una regla detrás, y colorear su punto exigiría comparar cifras en la interfaz o inventar un aviso por tipo. **Recomendación, sin cambio de dominio**: la tira de cada **tipo** lleva la pista, el objetivo, el punto y la cifra en pp, **sin banda y en tinta**, y, si algún activo de ese tipo tiene el aviso, una etiqueta «⚠ N activos fuera de umbral» que sale de los avisos del dominio agrupados por la clase del activo (agrupar un aviso no es comparar cifras). **La tira completa, con la banda y el punto coloreado, va por activo**, en «Ver activo por activo» del móvil y en la tabla de escritorio, donde ya está el `Gauge`. Mientras no conteste, vale. **Respondida:** [§8 P3](#p3-resp).
- **P4 — El plazo de los modelos 720 y 721 en el calendario.** No es configuración ni está en el dominio; solo lo son la campaña (`Settings`) y la valoración a 31/12 (`yearEnd`). Hacerlo configurable es un campo nuevo de `Settings`, es decir, un cambio de esquema, que esta feature no hace. **Recomendación**: el plazo vive en el dominio como **dato normativo por ejercicio, con su fuente** (la orden ministerial que lo fija, que el implementador verifica y cita con su dirección y su fecha), igual que las casillas del Modelo 100 viven por ejercicio y `yearEnd` fija el 31/12; **un ejercicio sin dato no pinta plazo** y lo dice, nunca lo supone. Si la dirección quiere que sea configuración, **sale de esta feature** y va con las reglas de ADR-0018 y ADR-0022. Mientras no conteste, vale la recomendación, pero **el implementador para** si no encuentra la fuente. **Respondida:** [§8 P4](#p4-resp).
- **P5 — El aviso del 720 dentro de *Atención* llega tarde.** El motor fiscal es perezoso: el aviso llega después de la primera pintada y, en el móvil, *Atención* está en el primer pantallazo. Insertarlo haría saltar la lista. **Recomendación**: fuera de la campaña, y **solo si el libro tiene alguna cuenta en el extranjero** (lo único que puede producir un 720 o un 721, y que se sabe en el arranque por el catálogo de cuentas), *Atención* reserva **una fila de esqueleto al final de sus grupos visibles**, que se llena o desaparece al llegar el estado fiscal; el aviso cuenta entre los cuatro visibles. Sin cuentas en el extranjero, no se reserva nada. Mientras no conteste, vale; si el implementador ve que desaparecer también salta, lo mide y lo dice. **Respondida:** [§8 P5](#p5-resp).
- **P6 — El orden del Resumen en el móvil.** La maqueta pone la evolución **antes** de *Atención* en el orden del DOM, que es el del móvil, pero el texto de la propuesta no lo pide: M2 habla de la línea de perder datos, de *Declaración* y de «pendiente», y M4 de la evolución por encima del pliegue **en el monitor**. El orden de la maqueta parece un efecto de colocar la rejilla del monitor con `grid-row`. **Recomendación: manda el texto**. En el móvil: la línea de perder datos, *Declaración* (solo en campaña), el patrimonio, *Atención*, *Últimos movimientos*, la evolución y la fila de *Declaración* (fuera de campaña). En el monitor, el 8+4 de la maqueta. Así *Atención*, la mitad de la pregunta del Resumen («¿hay algo que tenga que hacer?»), sigue en el primer pantallazo. Mientras no conteste, vale; las capturas del alto enseñan los dos órdenes si la dirección quiere verlos. **Respondida:** [§8 P6](#p6-resp).
- **P7 — El hueco de la evolución: opción A u opción B.** La propuesta (§3.2) deja la B (el último precio conocido sostenido, en escalón, más apagado y con su antigüedad) «para decisión», porque contradice la letra de `brief.md` §7 («la línea se corta»), aunque se apoya en el principio de fallo seguro («el último valor conocido con su antigüedad»). La lista de decisiones de la dirección no la cierra. **Recomendación: la A**, la de hoy. La espina de lo aportado ya quita la impresión de gráfica rota, que era el problema, y la B abre una discusión de fondo (un valor sostenido **es** una estimación dibujada) que merece su propia decisión. Mientras no conteste, vale la A. **Respondida:** [§8 P7](#p7-resp).
- **P8 — La regla de «Este año».** **Recomendación**: desde el **1 de enero del año de la fecha consultada** (la de «hoy» por defecto, o la del selector de fecha), en `Europe/Madrid`, hasta esa fecha. Con precios anotados a mano, en enero tendrá cero o un punto: **se ofrece desactivado y con su motivo**, como hoy «1 mes». El rango que se abre por defecto sigue siendo el de hoy. Mientras no conteste, vale. **Respondida:** [§8 P8](#p8-resp).
- **P9 — La hoja de ruta no lista la 020.** `docs/decision-roadmap.md` reserva 016-019 para la etapa 2 y 3 de la Ronda 8, y no dice nada de esta feature. **Recomendación**: que la dirección añada una línea en su cierre, como hizo con la 015; no hace falta antes de lanzarla. **Respondida:** [§8 P9](#p9-resp).
