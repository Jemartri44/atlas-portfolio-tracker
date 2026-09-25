# Hoja de ruta de decisiones

Qué queda por decidir antes de (y durante) la construcción, en qué orden y por qué. Se recorre **ronda a ronda**: el asistente plantea cada ronda con contexto, opciones, ventajas, inconvenientes y recomendación; el usuario confirma; el resultado se registra como ADR o como sección de la especificación / modelo de datos. Las rondas cerradas se marcan aquí.

Criterios para que algo entre en esta lista:

1. **Bloquea código** o cambia de forma cara de revertir cómo se escribe.
2. **Ayuda a los asistentes de código**: sin la decisión escrita, cada sesión la improvisaría distinto.
3. **No está ya decidido** en la especificación, la constitución o un ADR.

Lo que no cumple los tres criterios se decide sobre la marcha en el plan de cada feature, sin preguntar.

## Estado

| Ronda | Tema | Bloquea | Registro | Estado |
|---|---|---|---|---|
| 1 | Dinero y cantidades | Fase 1 | ADR-0005 | **Cerrada** 2026-08-30 |
| 2 | Esquema del libro en S3 | Fase 1 | ADR-0006, `docs/data-schema.md` | **Cerrada** 2026-08-30 |
| 3 | Estructura del código y toolchain | Primer commit de código | ADR-0007, ADR-0008 | **Cerrada** 2026-08-30 |
| 4 | Semántica de operaciones y FIFO | Fase 1 | ADR-0009, ADR-0010, ADR-0011, `docs/data-schema.md` §6-8 | **Cerrada** 2026-08-30 |
| 5 | Calidad, proceso y tooling del asistente | Fase 1 | Spec §11, `.githooks/`, `.claude/`, `.github/`, `LICENSE` | **Cerrada** 2026-08-30 |
| — | *Challenge externo de las rondas 1-5* | Fase 1 | ADR-0012, ADR-0013, `docs/fiscal-questions.md` | **Hecho** 2026-08-30: 10 hallazgos aplicados; repetir antes de cada fase |
| — | *Challenge 3 (documentos + código de las Fases 1 y 2)* | Fase 3 | ADR-0018, `data-schema.md` §3/§5/§6, bloque 0 del prompt 005, correcciones al prompt 005 | **Hecho** 2026-09-18: 7 hallazgos, todos aceptados; los 18 anteriores verificados como aplicados (informe en `~/atlas-private/reviews/`) |
| — | *Challenge 2 (rondas + código de la Fase 1)* | Fase 2 | ADR-0014, ADR-0015, constitución 1.4.0, `data-schema.md` §4/§6/§8.4, `business-rules.md` §5, preguntas fiscales 14-16, bloque 0 del prompt 004 | **Hecho** 2026-08-31: 8 hallazgos, todos aceptados (informe en `~/atlas-private/reviews/`) |
| — | *Fase 0 (validación con la realidad, tareas del usuario)* | Rondas 6-7 | — | En curso: IBKR sin abrir; la primera suscripción a MyInvestor (y con ella la exportación de operaciones de fondos) se aplaza hasta que la app esté lista para registrarla; AWS y Yahoo diferidos a antes de la Fase 4 |
| — | *Fase 1 (libro mayor): features 001-003* | Fases 2-5 | `specs/001-ledger-core/`, `specs/002-corporate-actions/`, `specs/003-synthetic-data/`, PRs #10, #12, #15, #18 | **Cerrada** 2026-08-30; *challenge* 2 ejecutado y triado el 2026-08-31. La Fase 2 es la feature `004-monthly-contribution`; los importadores de MyInvestor e IBKR tomarán los números siguientes cuando la Fase 0 los desbloquee. Candidatos de integridad anotados en `specs/003-synthetic-data/research.md` §1 (`inactive_reference`, `duplicate_valuation`, `valuation_quantity_mismatch`): decidir cuando se amplíe `integrity`. los importadores siguen dependiendo de la Fase 0 |
| — | *Fase 2 (aportación mensual): feature `004-monthly-contribution`* | Fase 3 | `docs/prompts/004-monthly-contribution.md`, `specs/004-monthly-contribution/` | Implementada; PR #23 |
| — | *Fase 3 (cubo especulativo): feature `005-bucket-tracking`* | Web | `docs/prompts/005-bucket-tracking.md`, constitución 1.5.0, ADR-0018 | **Fusionada** 2026-09-18 (PR #33). Dos revisores encontraron dos defectos bloqueantes antes de fusionar |
| — | *Web, primera mitad: feature `006-web-shell`* | Web (2.ª mitad) | `docs/prompts/006-web-shell.md`, ADR-0017, ADR-0019 | **Fusionada** 2026-09-18 (PR #36). Abrir un navegador de verdad encontró lo que ningún test vio: un `class` ausente que anulaba veinte reglas de estilo, la CSP bloqueando los estilos propios, etiquetas truncadas y una carrera de arranque visible solo con la CPU frenada |
| — | *Web, segunda mitad: feature `007-web-analytics`* | Pulido visual | `docs/prompts/007-web-analytics.md` | **Fusionada** 2026-09-18 (PR #47). Dos revisores encontraron **cuatro bloqueantes**: el modo privacidad roto en las dos pantallas nuevas, la capa de componentes sin un solo test (ocho mutantes vivos), el control "valor por defecto" que decía guardar sin guardar, y la comisión de un evento corporativo irregistrable desde la web (subía la ganancia). Origen del ADR-0022. Recoge los dos cabos sueltos de la 006 (`transfer_max_days` sin consumir —ahora regla de dominio, decisión (c)— y uPlot por vendorizar) y añade, a petición del usuario, calidad del frontend (techo de 250 líneas por fichero, componentes reutilizados) y manejo de errores a partir del inventario de la 006 |
| — | *Previsiones del esquema: feature `008-fiscal-provisions`* | Fase 5 | **ADR-0021**, `docs/prompts/008-fiscal-provisions.md`, `docs/data-schema.md` §8.6 | **Prompt escrito** 2026-09-18. Va **antes** que el motor fiscal porque endurecer `fx_rate_date` solo cabe mientras el libro real esté vacío (ADR-0018), y el libro deja de estarlo en cuanto la web esté lista. Regenera el *golden*: nueve líneas esperadas, cualquier otra cosa es un hallazgo |
| — | *Fase 5 (motor fiscal): feature `009-tax-engine`* | Salida fiscal por casillas | `docs/prompts/009-tax-engine.md`, ADR-0020, ADR-0021, `docs/fiscal-questions.md` | **Prompt escrito** 2026-09-18, requiere la 008 fusionada. Decisión de fondo: el motor calcula **la base, no la cuota** (no ve el resto de la declaración), **toda cifra dice de qué criterio depende** y hay un apartado con las que penden de un criterio en disputa, su importe y la dirección del riesgo. La salida por casillas, el 720/721, `tax_return_filed` y la pantalla web son la feature siguiente |
| 6 | Importadores | Fase 4 | ADRs según hallazgos de Fase 0 | Pendiente; bloqueada por la Fase 0 (IBKR y exportación de fondos de MyInvestor). *Desde el 2026-09-24, el cotejo de `fx_rate` con el BCE, los festivos TARGET y las fuentes de precios pasan a la Ronda 8 (ADR-0029, ADR-0031)* |
| 7 | Aplicación web: framework, offline, auth, API | Fase 2 | **ADR-0017** (*stack*), **ADR-0019** (local-first, sin servidor), `docs/prompts/006-web-shell.md` (pantallas y navegación) | **Cerrada** 2026-09-18. La autenticación desaparece del alcance: sin servidor no hay nada que autenticar; Cognito protegerá la API en la Fase 4. *La Ronda 8 propone sustituir Cognito por Google verificado en la Lambda (ADR-0027)* |
| 8 | Capa en la nube: sincronización, acceso, plataforma, BCE, precios, tareas y copias | Fase 4 | **ADR-0026 a ADR-0032** | **Cerrada** 2026-09-24. Siete ADRs aceptadas por la dirección el mismo día, con la investigación incorporada, y **enmendadas** tras la revisión de la PR #72 (cuatro bloqueantes y nueve no bloqueantes, todos con decisión de la dirección). Plan por etapas abajo; los documentos que cambian están listados y los encarga la dirección |
| 9 | Salida fiscal | Fase 5 | **ADR-0020**, **ADR-0021**, `docs/fiscal-questions.md`, `docs/data-schema.md` §3 | **Desbloqueada**: los 16 criterios fiscales están respondidos con su grado de certeza y el registro de lo declarado está decidido (ADR-0020, 2026-09-18). Queda el formato de la salida, que se decide al escribir el prompt de la fase. **Revisión adversarial del 2026-09-18**: 3 criterios incorrectos y 6 en disputa; ninguno se resuelve sin asesor, pero ADR-0021 fija las nueve previsiones del esquema para que la fase pueda escribirse igualmente |

---

## Ronda 1 — Dinero y cantidades (ADR-0005)

**Por qué primero:** cada línea del dominio toca importes; cambiar la representación después es reescribir el dominio y migrar el libro.

Decisiones:
- Tipo `Money`: enteros escalados con `bigint` (sin dependencia) o `decimal.js`.
- Escalas: importes en EUR y divisa (¿×10⁴?), participaciones de fondos (¿×10⁸?), tipos de cambio (el BCE publica 4-6 decimales).
- **Reglas de redondeo**: cuándo se redondea (solo en salida fiscal, a céntimos, modo half-up como Hacienda) y cuándo nunca (costes unitarios, cantidades).
- Serialización: cadenas en JSON, siempre.
- Prohibiciones de lint: `number` en el dominio para importes.

## Ronda 2 — Esquema del libro en S3 (ADR-0006, `docs/data-schema.md`)

**Por qué:** es el fichero que debe ser legible en 2046 y el contrato entre todas las piezas.

Decisiones:
- Un objeto por año (`ledger/2026.jsonl`) o un único `ledger.jsonl`; qué gana cada uno en escrituras condicionales y en legibilidad.
- Envoltorio de cada línea: `schema_version`, `id` (ULID), `recorded_at`, y la operación. Orden canónico de las líneas.
- **Migraciones de esquema**: funciones puras versionadas `v1→v2` aplicadas al cargar; nunca se reescribe el histórico.
- **Configuración como eventos del libro** (`settings_changed`) para cumplir el historial de configuración sin un segundo sistema, o `settings.json` aparte con versionado de S3.
- Catálogo de activos y cuentas: ¿eventos del libro (`asset_created`, `asset_updated`) o ficheros de catálogo? (Los ISIN cambian; el historial importa.)
- Histórico de tipos de cambio del BCE: descargado entero y guardado en S3 (unos MB) frente a bajo demanda.
- Snapshot de proyección cacheado (`positions.json`) o recalcular siempre.

## Ronda 3 — Estructura del código y toolchain (ADR-0007, ADR-0008)

**Por qué:** es lo primero que un asistente necesita para no inventarse la estructura; se decide una vez.

Decisiones:
- Monorepo: `packages/domain`, `apps/api`, `apps/web`, `apps/cli`, `infra/`. Gestor: npm workspaces (cero dependencias) o pnpm.
- Versión de Node (LTS) y `tsconfig` estricto; ESM.
- Calidad: Biome (un paquete: lint + formato) frente a eslint + prettier + plugins.
- Tests: `vitest` + `fast-check`. Empaquetado de Lambda con `esbuild`.
- **Arquitectura interna con nombre**: núcleo funcional puro (`transactions → projections`) y puertos/adaptadores (`LedgerStore`, `PriceSource`, `StatementParser`, `Notifier`). Sin frameworks en el dominio.
- **Interfaz de la Fase 1**: CLI primero (sirve para tests, datos sintéticos y uso real sin AWS) y API después.
- Presupuesto de dependencias: lista explícita de las permitidas en `domain` (idealmente cero en runtime).

## Ronda 4 — Semántica de operaciones y FIFO (`docs/data-schema.md`, spec de la feature 001)

**Por qué:** es donde vive el valor y el riesgo. Sin esto escrito, dos asistentes implementarían dos FIFOs distintos.

Decisiones (varias son de dominio fiscal y llevan la etiqueta "verificar con asesor"):
- Forma exacta de `Transaction` por tipo (unión discriminada): campos obligatorios de `buy`, `sell`, `transfer` (origen y destino en una sola operación), `dividend` (bruto, retención origen, retención España), `corporate_action` (payload por `kind`), `reversal`.
- **Comisiones en la base fiscal**: la comisión de compra se suma al coste de adquisición y la de venta se resta del valor de transmisión (criterio AEAT). Cómo se guarda para no perder el importe original.
- **Valores homogéneos**: el FIFO se aplica por activo **a través de todas las cuentas** o por cuenta. (Hacienda: por valor homogéneo, independientemente de la cuenta. Afecta al diseño.)
- Orden de lotes con la misma fecha (por `recorded_at`, por `id`).
- Traspaso parcial: consume lotes en FIFO y hereda fecha y coste; ¿qué pasa con las comisiones del traspaso?
- Regla de los dos meses: algoritmo (ventana ±2 meses, emparejamiento de cantidades, diferimiento), y cómo se marca la pérdida diferida.
- Transformaciones de lotes por cada `kind` de evento corporativo, escritas una a una con ejemplo numérico.
- Cómo se derivan `cash_balance` y las posiciones desde la misma proyección.
- Idempotencia: huella de importación (`fingerprint`) y su unicidad.

## Ronda 5 — Calidad, proceso y tooling del asistente

**Por qué:** convierte las convenciones en mecanismos. Barato y de retorno inmediato.

Decisiones:
- Estrategia de tests por capa; **cobertura exigida en `domain`** (¿100% de ramas?); *golden files* para la salida fiscal; fixtures anonimizadas y su formato.
- CI en GitHub Actions: qué corre en PR, qué en `develop`, qué en `main`; despliegue con OIDC (sin claves de larga duración).
- Protección de ramas y plantilla de PR con checklist de la constitución.
- Tooling de Claude Code: hook que valide mensajes de commit; skill `/adr`; plantilla de ADR; más adelante subagente `fiscal-reviewer`.
- Licencia (propuesta: MIT).
- Versionado de la app: etiquetas `vX.Y.Z` en `main`, `CHANGELOG` generado desde Conventional Commits o manual.

## Fase 0 — Validación con la realidad (tareas del usuario, en paralelo)

Ninguna bloquea la Fase 1: el dominio y la CLI no dependen de nada externo. Sus resultados alimentan las rondas 6 y 7 y los tests de contrato. Los ficheros privados (extractos reales, capturas) se dejan **fuera del repo**, en `~/atlas-private/` (ver `CLAUDE.md` → Private inputs).

**Cuanto antes**
1. **Extracto de MyInvestor**: recibidos el 2026-08-30 el xlsx de movimientos de efectivo y el PDF de posición (formato documentado en `docs/statements/myinvestor.md`). Falta la exportación de **operaciones de fondos**, que solo existirá tras la primera suscripción; el usuario la hará cuando la app esté lista para registrarla (decidido el 2026-08-30), así que la feature 004 espera a la Fase 2.

**Cuando la cuenta de IBKR esté abierta**
2. **Flex Query**: Activity Flex Query en XML con *Trades*, *Cash Transactions*, *Corporate Actions*, *Transfers*, *Open Positions*; activar Flex Web Service y generar el token de solo lectura. Descargar una vez por API y dejar el XML en `~/atlas-private/statements/ibkr/`.

> **La web ya no depende de la Fase 4** (ADR-0019): funciona en el dispositivo, sin servidor y sin cuenta. Lo que la Fase 4 añade es la sincronización entre dispositivos, los precios automáticos y los avisos por correo.

**Antes de la Fase 4, no antes**
3. **Cuenta AWS al Paid Plan** y alerta de presupuesto de 1 $ (crearla antes solo arranca el reloj de seis meses del Free Plan).
4. **Yahoo desde Lambda**: Lambda mínima que haga un `GET` a la API de gráficos y registre el código de respuesta.

**No es tarea del usuario**
- Lectura de Beancount y Ghostfolio: la hace el asistente al planificar la feature 001.
- Pesos objetivo, ETFs de referencia y umbrales del cubo (P1/P2/P3 del plan privado): son valores de configuración que se introducen en la app cuando exista la pantalla de ajustes (Fase 2). No hay que decidirlos antes.

## Ronda 6 — Importadores y fuentes de precios

Depende de la Fase 0. Decisiones: mapeo de campos de cada extracto a `Transaction`, huella de duplicados por origen, política de caché de precios, respaldo si Lambda está bloqueada (recolector externo), formato del histórico de precios en S3; cotejo de `(fx_rate, fx_rate_date)` contra la tabla del BCE en `check --deep` y validación de festivos TARGET (challenge 2, hallazgo 5); ajuste de cotizaciones históricas tras un `scale` (seguimiento de la 002).

## Ronda 7 — Aplicación web

Antes de la Fase 2. Decisiones: Svelte o Solid (tras prototipo); **librería de UI y de gráficas** (sistema de componentes consistente, responsive PC/móvil, sin CDN externos, dentro del presupuesto de dependencias); **modo privacidad** activado por defecto (diseño del componente de importe y de las gráficas enmascaradas); **datos en el dispositivo** para consulta sin conexión (PWA + libro cacheado: ¿cifrado local?, ¿caducidad?) frente a solo lectura en línea; flujo de autenticación con Cognito (Hosted UI o formulario propio, dónde vive el token); diseño de la API sobre Function URL; idioma de la interfaz (español, sin i18n). Referencias de diseño: capturas que aporte el usuario (fuera del repo) y apps abiertas como Ghostfolio o Wealthfolio.

## Ronda 8 — Capa en la nube

**Cerrada el 2026-09-24.** La dirección fija el marco: la nube es una **capa añadida** sobre lo local (ADR-0019 sigue en pie); aporta sincronización, tareas programadas y correos; y el coste pasa a ser **coste mínimo con alarma de presupuesto**, que sustituye a «dentro del *always-free* indefinidamente» (ADR-0028): ≈ 0,01-0,05 $/mes según la investigación del mismo día, cubierto por los créditos mientras duren y pagado después, con la alarma de Budgets a 1 $. **El modelo de dominio no cambia**; lo que se añade es compatible según ADR-0018, **salvo una regla nueva de la proyección** que no puede invalidar ningún libro escrito por la aplicación (la lista y la justificación, en ADR-0026). La Ronda 8 original (cuentas, *bootstrap*, promoción, copia fuera de AWS, alarmas) queda dentro.

| ADR | Qué fija |
|---|---|
| 0026 | Sincronización: **opción 2**, explícita; cola local por dispositivo, reaplicación línea a línea sobre el remoto, **parando en la primera que falla**, que queda retenida y nunca perdida. **Lo que sella el prefijo no se mueve de sitio**; anulación y corrección son una pareja que se evalúa como una unidad en los dos sentidos, cuenta como una sola línea y no se parte entre dos peticiones; **la cola no avanza detrás de algo retenido**; **una operación anulada tiene como mucho una corrección viva** (regla nueva del dominio, que no puede invalidar ningún libro escrito por la aplicación). El puerto gana **operaciones sobre líneas crudas**, y los almacenes locales, un **cerrojo consultivo** en la carpeta del libro, sin ruptura automática, que cierra la ventana en la consola y en el navegador solo si existe la creación exclusiva (SIN VERIFICAR; si no existe, la 012 para). La API solo añade y rechaza por línea; la reescritura del remoto se detecta por el hash del prefijo; y `compact` y restaurar se niegan con pendientes conocidas, con el marcador ilegible o con `sync/` sin marcador |
| 0027 | Acceso solo con Google verificado en la Lambda, **vía c** (código de autorización con la Lambda como cliente; corrige el texto de apertura de la dirección); secreto de cliente en SSM; lista permitida en SSM; sesión propia, que vuelve a consultar la lista en cada petición; `state` además de PKCE. La verificación en dos pasos de Google es **requisito operativo del usuario**. Sustituye a Cognito |
| 0028 | **Sustituye «always-free indefinidamente» por coste mínimo con alarma de presupuesto**. Cuenta de gestión en el Paid Plan; organización con **dos cuentas miembro**, `atlas-dev` y `atlas-prod`; `eu-west-1`; línea base de seguridad a coste cero; plan Free de CloudFront con WAF; CSP en `'self'` servida por una CloudFront Function; OIDC; Budgets antes de créditos con alarma a 1 $; destinatario del correo e interruptor de importes solo en SSM, correos sin importes por defecto; y revisión del plazo de versiones al pasar el libro de 1 MB |
| 0029 | BCE: histórico oficial en local, forma canónica del histórico, días sin publicación por ausencia, calendario TARGET como comprobación, hallazgos de integridad. **Opción B**: borrador fuera del libro, que no es un hecho y nunca se confirma solo. Tras un cambio de `fiscal_date_rule`, el motor nunca recalcula en silencio: aviso, hallazgo, nota y corrección propuesta; criterio nuevo con certeza media y riesgo **Ambas** |
| 0030 | `broker_settled_eur`, dato informativo; compatible según ADR-0018; antes de la primera operación real |
| 0031 | Precios de cierre: EODHD y Alpha Vantage (CoinGecko y OpenFIGI, retirados al cerrar la 013, tercera enmienda); Yahoo, Stooq y Morningstar excluidos; la correspondencia de símbolos **fuera del libro**, en `prices/symbols.json`, declarada por el usuario con su divisa; fondos fuera de `EUFUND` por ETF de referencia, marcado como aproximación |
| 0032 | Cuatro capas de copia, restauración en seis pasos con líneas crudas, lo pendiente de cada dispositivo retenido para revisión tras restaurar, ensayo trimestral y anual, nunca con datos reales en `atlas-dev` |

**SIN VERIFICAR**, con una condición (decisión de la dirección): **cada feature que dependa de uno de estos puntos lo verifica, con fuente, antes de escribir código**, y lo que encuentre se escribe en su ADR el mismo día. Son: ~~si la File System Access API permite crear un fichero de forma exclusiva en una carpeta elegida por el usuario (feature 012);~~ (**verificado que no** en el paso 0 de la 012; la web de escritorio deja de escribir en la carpeta, enmiendas de ADR-0019 y ADR-0026 del 2026-09-24) si Google admite forzar la reautenticación en cada acceso, los valores de `iss` y la dirección de sus claves, las condiciones del borrado de un cliente OAuth sin uso y si hay API para gestionarlo (feature 015); que las SCP no se aplican a la cuenta de gestión, si una cuenta nueva tiene cuota para reservar concurrencia qué hace CloudFront al superar el millón de peticiones del plan Free y el enlace de la PR del proveedor de Terraform para los planes de tarifa plana (017 y 018); y el coste de S3 Object Lock (si alguna vez se propone).

**Propuesta, pendiente de la dirección (2026-09-25): ADR-0033**, cómo se autentica la consola frente a la API, que ADR-0027 dejaba fuera. Propone un token de dispositivo propio, emitido al final de un inicio de sesión con Google que abre la propia consola (*loopback* con PKCE y una variante manual), guardado en un fichero propio junto a `secrets.json` y registrado en SSM. Mientras no se acepte, la 014 puede fijar en `docs/api.md` la cabecera y las rutas sin implementarlas; lo que cambia al aceptarla está listado en la propia ADR.

**Documentos que hay que actualizar**, que la dirección encarga aparte:

- La constitución (principio VI y Restricciones técnicas: el coste deja de ser «always-free indefinidamente»; Cognito; secretos; y «Terraform para todo; nada creado a mano», que ADR-0028 exceptúa con condiciones de retirada).
- `CLAUDE.md` (*stack*, seguridad, entornos por cuenta, «el único secreto es el token de IBKR», y «the project must stay inside the AWS always-free tier indefinitely»).
- `docs/specification.md` §7, §9.2-§9.6, §10, §11.3-§11.8 y §14.1.
- `docs/data-schema.md` §1 (`prices/symbols.json`, `reference/ecb/` en local, `sync/devices/`), §4, §5 (operaciones del puerto sobre líneas crudas, el cerrojo de los almacenes locales y la enmienda de ADR-0018 sobre las fotos completas), §6.2 (`broker_settled_eur`) y §6.3 (una sola corrección viva).
- `docs/business-rules.md` §7 (`notification_email` sale; interruptor de importes en el correo).
- `docs/fiscal-questions.md`: nota en el #4 (ADR-0030) y el **criterio nuevo** de ADR-0029 punto 10, con certeza media y riesgo **Ambas**.
- Notas fechadas en ADR-0013 (forma canónica del tipo) y ADR-0019 (Cognito y la sincronización).
- `docs/prompts/000-director-handoff.md` §6 y §9 (la Fase 4 deja de estar descartada; la verificación en dos pasos, como requisito operativo del usuario).

### Plan por etapas

**Etapa 1 — Local, sin nube** (sin cuenta de AWS; lo que cuesta es dar de alta las claves gratuitas de las fuentes de precios, tarea del usuario):

- **012 — Tipos del BCE** (ADR-0029, ADR-0030, ADR-0026 Parte C). Bloque 0, **antes de la primera operación real**: `broker_settled_eur`; la regla de una sola corrección viva, un endurecimiento que no puede invalidar ningún libro escrito por la aplicación (ADR-0026, Parte C); y el **cerrojo consultivo** de los dos almacenes locales, sin ruptura automática, más la primitiva de comparar y escribir de IndexedDB (ADR-0026, Parte B), porque la ventana que cierran ya existe hoy sin nube. Antes de escribir código, verifica si el navegador permite crear un fichero de forma exclusiva en la carpeta; si no, para y lo dice. Después: descarga desde la consola a `reference/ecb/`, resolución del tipo, calendario como comprobación, propuesta al registrar en la consola y en la web (escritorio por la carpeta, móvil importando), confirmación ante un tipo distinto, hallazgos en `check --deep` con su nota en el informe fiscal, y los borradores de la opción B para antes de la publicación, más el aviso, la nota y la corrección propuesta tras un cambio de `fiscal_date_rule`.
- **013 — Precios de cierre** (ADR-0031). **Fusionada** (PR #78, 2026-09-25). `prices/symbols.json` declarado por el usuario y contrastado con la fuente, el puerto y sus dos adaptadores (EODHD y Alpha Vantage), el almacén, la cascada, el estado de cada fuente y el presupuesto de llamadas; CoinGecko y OpenFIGI, retirados durante la feature. Falta la prueba con las claves del usuario (`docs/runbooks/013-daily-close-prices-live-test.md`). Requiere la 012 (la conversión a euros usa el histórico).

**Etapa 2 — La nube, escrita y probada sin desplegar** (sin cuenta de AWS; instalar Terraform o la CLI de AWS en local lo decide el usuario):

- **014 — Núcleo de sincronización** (ADR-0026). Las operaciones de líneas crudas del puerto en sus cuatro adaptadores, el caso de uso puro de reaplicación (parar en la primera que falla, lo que sella el prefijo, la pareja de anulación y corrección), el marcador, lo retenido y lo descartado, la negativa de `compact` en una carpeta sincronizada y un remoto de pruebas en memoria. El contrato HTTP se escribe en `docs/api.md` en el encargo, antes de implementar.
- **015 — API y acceso** (ADR-0026, ADR-0027). `apps/api`: inicio de sesión por código de autorización, sesión, lista permitida, `LedgerStore` sobre S3 con `If-Match`, rutas de sincronización y de datos de referencia; en la SPA, el inicio de sesión, la sincronización y el hash del cuerpo. Probada con dobles de S3, SSM y Google.
- **016 — Tareas programadas y correo** (§9.5 de la especificación, ADR-0029, ADR-0031, ADR-0032). Solo las que **no** dependen de los importadores: BCE diario, precios diarios, desviaciones y reglas del cubo semanales, recordatorio mensual (siempre; sin importes salvo que se activen; con los días desde el último inicio de sesión y el recordatorio de la copia fuera de AWS), volcado mensual, integridad y ensayo de restauración trimestrales, preparación de la Renta en enero y umbrales del 720/721. El puerto `Notifier` y su adaptador de SES. El destinatario y el interruptor de importes se leen de SSM (ADR-0028), y **se retira `notification_email` de la interfaz** (Ajustes de la web, que hoy todavía lo ofrece); el cargador lo sigue aceptando en las líneas `settings_changed` ya escritas (ADR-0018).
- **017 — Infraestructura como código** (ADR-0028). Módulos de Terraform, *bootstrap*, la CloudFront Function de la CSP, el guion del plan de tarifa plana y los flujos de GitHub Actions con OIDC; solo `fmt` y `validate`.

**Etapa 3 — Despliegue** (con el visto bueno del usuario):

- Tareas del usuario, con procedimiento escrito: la organización y las dos cuentas miembro, el MFA de los tres root, la verificación en dos pasos de su cuenta de Google, la petición de aumento de la cuota de concurrencia si hace falta, los clientes OAuth de `dev` y `prod`, la verificación de la dirección en SES, las claves en SSM y la lista permitida.
- **018 — Despliegue en `atlas-dev`**, con datos sintéticos: extremo a extremo (acceso, dos dispositivos sincronizando, tareas), y los ensayos de restauración y de pérdida de la cuenta.
- **019 — Promoción a `atlas-prod`**: el mismo artefacto, la primera subida del libro real desde el portátil y el ensayo de restauración en memoria.

**Bloqueadas por los importadores** (Ronda 6): la importación diaria de IBKR por Flex Query (a `imports/`, nunca al libro sin confirmación), la conciliación semanal contra IBKR y la rotación del token Flex.

## Ronda 9 — Salida fiscal

Antes de la Fase 5. Decisiones: formato de la salida (agregados por casilla + detalle por operación), cómo se marcan las reglas "verificar", estado de pérdidas pendientes por ejercicio, tratamiento de diferencias de cambio.

**Cerrada en su parte estructural** (2026-09-18, **ADR-0020**): qué queda registrado de lo declarado. El evento `tax_return_filed` guarda el modelo (`renta` / `720` / `721`), las cifras presentadas, la huella del libro ese día y el justificante; se filtra por su fecha de presentación (documento administrativo, ADR-0016); una complementaria es un evento nuevo con `supersedes`, nunca un `reversal`; y un ejercicio con presentación registrada queda **cerrado**, de modo que registrar en él avisa en vez de rechazar. Se implementa en la Fase 5, junto al motor que produce esas cifras.

Sigue abierto, y se decide al escribir el prompt de la Fase 5: el **formato de la salida** (agregados por casilla más detalle por operación) y cómo se marcan en ella las reglas de certeza media o baja de `docs/fiscal-questions.md`.

---

## Decidido sobre la marcha, sin ronda

Cosas con un valor por defecto claro que no merecen pregunta; se aplican en el plan de cada feature: identificadores ULID; fechas como `YYYY-MM-DD` sin zona horaria (`recorded_at` en ISO 8601 UTC); `LedgerStore` en memoria y en fichero local para desarrollo y tests; nombres de campos en `snake_case` en JSON y `camelCase` en TypeScript con conversión en el borde; logs JSON con `request_id`; sin API Gateway, sin Route 53, sin Secrets Manager (ya decidido en la especificación).
