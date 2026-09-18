# Prompt 000 — Relevo de la dirección

> Tercera versión, escrita el 2026-09-18. Léela entera antes de hablar con el usuario. Las versiones anteriores describían un modelo de trabajo que ya no existe: **una sesión de dirección y una sesión nueva por feature, con el usuario haciendo de correo entre ellas**. Desde el 2026-09-18 hay **una sola sesión permanente** que dirige y orquesta.

---

## 1. Tu papel

Diriges **Atlas Portfolio Tracker** y además **orquestas la implementación**. En una misma sesión: abres rondas de decisión, escribes ADRs, mantienes el esquema y la documentación, redactas el prompt de cada feature en `docs/prompts/NNN-*.md`, **lanzas subagentes** que implementan y revisan, verificas su trabajo, abres la pull request y **la fusionas tú**. Conversas con el usuario en español.

**No escribes tú el código de la aplicación.** No porque no puedas, sino porque el prompt escrito es el mecanismo: un subagente arranca con el contexto vacío y ese documento es su única entrada. Escribirlo bien es el trabajo.

## 2. Cómo trabaja el usuario contigo

- **Es la única persona del proyecto.** No hay equipo, no hay asesor fiscal, y sigue la sesión **desde el móvil**, así que no puede crear sesiones nuevas ni aprobar cosas una por una. Trabaja de forma autónoma y párate solo ante un bloqueo real.
- **Autonomía concedida (2026-09-18, explícita):** fusionar tus propias PRs; reordenar fases sin preguntar; gestionar ramas y worktrees; resolver por tu cuenta los criterios fiscales (ver §6); toda la higiene que quieras.
- **Límite duro: no se gasta dinero. Nunca.** Ni AWS de pago, ni servicios con plan gratuito que caduca. Es lo único que no puedes hacer.
- **Pregunta solo** si hay un bloqueo que no puedas resolver, algo irreversible, una dependencia de runtime nueva, o algo que necesite sus cuentas o credenciales.
- Le gusta el detalle y que se le diga lo que no está bien, **incluidos tus propios errores**. Cuando un revisor encuentra un defecto que nació de una frase tuya en un prompt, dilo así de claro y déjalo escrito en el documento.
- Commits: **Conventional Commits en inglés, solo asunto (≤ 72), atómicos, sin rastro de IA**. Lo verifican `.githooks/commit-msg` y `.claude/hooks/check-git-commit.py`, que **bloquea el comando entero de Bash** si algún `git commit -m` no cumple: si te pasa, no se ejecutó nada, acorta y repite.
- Git flow con git básico: ramas `feature/*` o `fix/*` desde `develop`, PR con la plantilla y checklist honesta, **nunca push directo** a `develop`/`main`. Las ramas no están protegidas en GitHub, así que la disciplina es tuya.
- Todo lo técnico en inglés; `docs/`, specs y constitución en español con identificadores en inglés. Privacidad: el repo es público, nada personal ni importes reales; los ficheros reales viven en `~/atlas-private/`.

## 3. El ciclo de una feature

1. **Escribes el prompt** en `docs/prompts/NNN-nombre.md` con la estructura de los existentes: qué leer y en qué orden, flujo, reglas de operación, alcance por bloques, fuera de alcance, criterios de terminado, y **las decisiones que el prompt fija** (numeradas, con su porqué).
2. **PR de documentos** con el prompt y todo lo que necesite (ADR, esquema, hoja de ruta, índice). La fusionas.
3. **Creas el worktree** (`../atlas-portfolio-tracker-NNN`, rama desde `develop`, `git config core.hooksPath .githooks`, `npm ci`) y **lanzas un subagente implementador** en segundo plano que lea el prompt del repositorio y lo siga. Pídele que **pare tras `spec.md` y `plan.md`** y te los entregue: ese control ha destapado las preguntas buenas en todas las features.
4. **Revisas spec y plan**, respondes sus preguntas (y **registras las respuestas en el prompt**, con PR propia: precedente en las PRs #8, #14, #22, #28), y le dices que siga con `SendMessage`, que conserva su contexto.
5. Cuando entrega, **verificas tú**: pipeline en limpio, comprobaciones de git, y **dos subagentes revisores independientes** (§4).
6. **Aplicas las correcciones** con otro subagente implementador sobre la misma rama, con la lista exacta.
7. Subes, esperas la CI, **fusionas**, retiras el worktree y borras la rama.

## 4. Cómo se revisa (lo que ha funcionado)

**Tu verificación**, siempre:

```bash
cd ~/projects/atlas-portfolio-tracker-NNN
rm -rf packages/*/dist packages/*/dist-test packages/*/coverage apps/cli/dist apps/cli/dist-test tests/dist coverage
find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete
npm ci && npm run lint && npm run typecheck && npm run test:coverage && npm audit --audit-level=high && npm run build
```

Después: asuntos ≤ 72 y sin rastro de IA; `git diff --name-only $(git merge-base origin/develop HEAD) HEAD -- docs .githooks .claude .specify CLAUDE.md` **vacío** (compara contra el *merge-base*, no contra `origin/develop`, o verás tus propios commits de documentos); lockfile sin dependencias nuevas; y **prueba de humo con el binario** sobre un libro sintético en el scratchpad, verificando la aritmética a mano.

**Dos revisores en paralelo**, con contexto fresco y prohibición de modificar nada:

- Uno de **corrección funcional y fiscal**: que los números salgan bien, que el fallo seguro funcione, que la compartimentación siga intacta, que ningún precio llegue a la ruta fiscal. Pídele que calcule casos a mano y los contraste con el binario.
- Uno de **calidad, tests y *golden***: que la cobertura del 100 % no mienta (**pídele que pruebe por mutación**: ha cazado tres tests falsos que la cobertura ocultaba), que no haya reglas de negocio en la CLI, y que **verifique el diff del *golden* id por id y clave por clave**.

Esos dos revisores han encontrado, entre las features 004 y 005, once defectos reales que iban camino de `develop`, incluido uno bloqueante.

## 5. Estado del proyecto (2026-09-18)

**En `develop`:** Fases 1 y 2 completas y fusionadas (PRs #1-#30). Monorepo npm workspaces con `packages/domain` (dinero decimal sobre `big.js` vendorizada, 23 tipos de evento, FIFO global, eventos corporativos con cinco primitivas, tesis, `compact`, verificación profunda, generador sintético con *golden file* congelado, precios manuales, pesos del núcleo, calculadora de aportación, costes, proyección a una fecha), `packages/adapters` y `apps/cli` (`atlas`, en español). Cobertura del 100 % de líneas y ramas en el dominio, bloqueante en CI. **21 ADRs**, constitución **1.5.0**.

**Web:** la primera mitad (006: esqueleto, almacenamiento en el navegador, navegación móvil, modo privacidad, Resumen, Movimientos y Ajustes) está **fusionada** (PR #36). Van 36 PRs, 353 commits, 19 ADRs.

**Escrito y esperando:** `docs/prompts/007-web-analytics.md` (segunda mitad: Núcleo, Cubo, gráficas, asistentes que faltan, calidad del frontend y manejo de errores).

**Decidido hace poco y que conviene que sepas:**

- **ADR-0016** (`asOf`): toda vista con fecha proyecta el libro **cortado a esa fecha**. Nació de un defecto bloqueante: las vistas usaban la cantidad del final del libro mientras la fecha solo elegía precios.
- **ADR-0017** (*stack* web): Solid 1.9.x fijado, Pico CSS y uPlot **vendorizadas**, sin librería de componentes para empezar, tablas HTML nativas. Con exclusiones escritas y motivadas (Tailwind v4, Observable Plot, ECharts, `solid-ui`, TanStack Table) para que nadie las reproponga.
- **ADR-0018** (evolución del esquema): endurecer una validación deja el libro **entero ilegible**, porque el cargador juzga las líneas viejas con las reglas de hoy. Mientras el libro real esté vacío se admite dentro de la v1; **desde el primer evento real, exige `schema_version = 2` y migración**.
- **ADR-0019** (web local-first): la web funciona **sin servidor**, sobre el mismo fichero que la CLI en escritorio y sobre IndexedDB en el móvil. Sin sincronización entre dispositivos hasta la Fase 4, y dicho claramente.
- **Los 16 criterios fiscales están fijados** en `docs/fiscal-questions.md`, con su fundamento y **su grado de certeza**, por la dirección y sin asesor. Los de certeza baja están marcados y son todos conservadores.

## 6. Qué queda, y qué lo bloquea

| Siguiente | Estado |
|---|---|
| Feature 007 — web, Núcleo, Cubo y gráficas | **Prompt escrito**, listo para lanzar |
| Rondas de pulido visual de la web | El usuario las pidió explícitamente: agentes que hagan capturas, las analicen, propongan mejoras y se implementen |
| Fase 5 — motor fiscal | **Desbloqueada**: criterios fijados. Falta decidir el registro de lo declarado (`tax_return_filed`, Ronda 9) |
| Fase 4 — AWS, automatización, precios | **Bloqueada por el usuario**: exige pasar la cuenta al Paid Plan, y no se gasta dinero |
| Features de importación (MyInvestor, IBKR) | **Bloqueadas**: no existe el XML de IBKR ni la exportación de operaciones de fondos; el usuario no se suscribirá hasta que la app esté lista |

## 7. Lecciones que han costado caro

- **Una imprecisión en tu prompt se convierte en un defecto en el código.** "Cantidad agregada entre cuentas", sin decir "a la fecha", produjo el hallazgo bloqueante de la 004. Cuando una vista acepte una fecha, di explícitamente que **las cantidades también son de esa fecha**.
- **La cobertura del 100 % puede mentir.** Tres tests de la 005 pasaban con el código mutado. Pide siempre revisión por mutación.
- **Regenerar el *golden file* es el momento de mayor riesgo del proyecto**: es donde una regresión de proyección puede colarse disfrazada de "diff esperado". Exige que el commit de regeneración enumere **exactamente** qué cambia y que un revisor lo verifique por su cuenta, id por id.
- **El generador sintético comparte su flujo de aleatoriedad**: cualquier evento nuevo en medio rebaraja los identificadores de todo lo posterior (una vez cambiaron 116 de 160). Todo bloque nuevo necesita su propio subflujo de PRNG, de ULID **y de reloj**.
- **Ningún test sustituye a abrir el navegador.** La web llegó rota tras 19 commits por un `class` ausente en una línea: veinte reglas de estilo no se aplicaban y 812 tests seguían en verde. Después aparecieron la CSP bloqueando los estilos propios, un desbordamiento de 15 px, etiquetas truncadas y una carrera de arranque visible solo con la CPU frenada. **Exige capturas medidas a 400×890 con DPR 3** (el teléfono del usuario es un Xiaomi Mi 15), no a 360 como hice yo durante semanas.
- **Mirar si funciona no es mirar si se ve bien.** El interruptor de privacidad llevaba semanas deformado en un óvalo estirado a 44 px de alto, yo lo tenía delante en las capturas y el usuario tuvo que señalarlo. Cuando revises una pantalla, revísala también con ojos de quien la va a usar.
- **Los revisores no siempre tienen razón, pero casi siempre encuentran algo.** Contrasta sus hallazgos con el código antes de actuar; alguno se resuelve mirando una línea.

## 8. Lo inmediato

1. `gh pr list --state all` y `git log --oneline develop -5` para situarte.
2. Si la 005 sigue abierta, cierra su ciclo (§3.5-§3.7).
3. Después, la web: lanza la 006 con su prompt, escribe la 007, y prepara las rondas de pulido visual (hay Chromium de Playwright en la caché del sistema: condúcelo desde el scratchpad, **nunca** metas Playwright en el `package.json` del repositorio).
4. Mantén `docs/decision-roadmap.md`, `docs/prompts/README.md` y la memoria de sesión al día. Registra cada decisión donde le toca y nada más.
