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
| 2 | Esquema del libro en S3 | Fase 1 | ADR-0006, `docs/data-schema.md` | Pendiente |
| 3 | Estructura del código y toolchain | Primer commit de código | ADR-0007, ADR-0008 | Pendiente |
| 4 | Semántica de operaciones y FIFO | Fase 1 | `docs/data-schema.md` + spec de la feature 001 | Pendiente |
| 5 | Calidad, proceso y tooling del asistente | Fase 1 | Spec §11, `.claude/`, `.github/` | Pendiente |
| — | *Fase 0 (tareas manuales del usuario)* | Rondas 6-7 | — | Pendiente |
| 6 | Importadores y fuentes de precios | Fase 4 | ADRs según hallazgos de Fase 0 | Pendiente |
| 7 | Aplicación web: framework, offline, auth, API | Fase 2 | ADR-0009+ | Pendiente |
| 8 | Infraestructura, despliegue y copias de seguridad | Fase 4 | ADR-0010+ | Pendiente |
| 9 | Salida fiscal | Fase 5 | Spec de la feature fiscal | Pendiente |

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

## Fase 0 — Tareas del usuario (en paralelo, sin asistente)

Los resultados alimentan las rondas 6 y 7. Hasta tenerlos, no merece la pena decidir sobre importadores ni precios.

1. Pasar la cuenta AWS al Paid Plan y crear la alerta de presupuesto de 1$.
2. Configurar una Flex Query en IBKR, descargarla por API y guardar un ejemplo (anonimizado) en el repo.
3. Exportar un extracto de MyInvestor y guardar un ejemplo anonimizado.
4. Probar el scraping de Yahoo desde una Lambda real.
5. Decidir P1/P2/P3 del plan financiero (pesos, ETFs de referencia, umbrales del cubo): solo son valores de configuración, no cambian el diseño.

## Ronda 6 — Importadores y fuentes de precios

Depende de la Fase 0. Decisiones: mapeo de campos de cada extracto a `Transaction`, huella de duplicados por origen, política de caché de precios, respaldo si Lambda está bloqueada (recolector externo), formato del histórico de precios en S3.

## Ronda 7 — Aplicación web

Antes de la Fase 2. Decisiones: Svelte o Solid (tras prototipo); **datos en el dispositivo** para consulta sin conexión (PWA + libro cacheado: ¿cifrado local?, ¿caducidad?) frente a solo lectura en línea; flujo de autenticación con Cognito (Hosted UI o formulario propio, dónde vive el token); diseño de la API sobre Function URL; idioma de la interfaz (español, sin i18n).

## Ronda 8 — Infraestructura, despliegue y copias de seguridad

Antes de la Fase 4. Decisiones: una cuenta AWS con dos pilas o dos cuentas; distribución de Terraform (directorios por entorno, *bootstrap* del estado); mecánica de "construir una vez y promocionar"; **copia del libro fuera de AWS** (exportación periódica a disco local/otro proveedor frente a compromiso de la cuenta); alarmas (Budgets, errores de Lambda) y rotación del token de IBKR.

## Ronda 9 — Salida fiscal

Antes de la Fase 5. Decisiones: formato de la salida (agregados por casilla + detalle por operación), cómo se marcan las reglas "verificar", estado de pérdidas pendientes por ejercicio, tratamiento de diferencias de cambio.

---

## Decidido sobre la marcha, sin ronda

Cosas con un valor por defecto claro que no merecen pregunta; se aplican en el plan de cada feature: identificadores ULID; fechas como `YYYY-MM-DD` sin zona horaria (`recorded_at` en ISO 8601 UTC); `LedgerStore` en memoria y en fichero local para desarrollo y tests; nombres de campos en `snake_case` en JSON y `camelCase` en TypeScript con conversión en el borde; logs JSON con `request_id`; sin API Gateway, sin Route 53, sin Secrets Manager (ya decidido en la especificación).
