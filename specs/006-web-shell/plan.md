# Plan de implementación: Esqueleto de la aplicación web, Resumen y Movimientos (`006-web-shell`)

**Rama**: `feature/006-web-shell` | **Fecha**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Entrada**: `specs/006-web-shell/spec.md` y `docs/prompts/006-web-shell.md` en su versión del 2026-09-18, que incluye las respuestas a Q1-Q11 como decisiones **(h)-(l)**. Gobiernan ADR-0017 (*stack*) y ADR-0019 (local-first).

## Resumen

Un paquete nuevo (`apps/web`), un adaptador nuevo del puerto `LedgerStore` para el navegador, y **tres** añadidos al dominio —aprobados como decisión (h)— que existen para que la web no reimplemente nada que la CLI ya sabe hacer: la vista previa de un candidato (que sale de `apps/cli`), la lista del libro ordenada con su estado, y los avisos que un cambio de configuración silencia. **La CLI pasa a consumir las tres**: una sola definición, nunca dos. Sobre eso, el esqueleto (navegación única, estado, privacidad, tema, PWA, CSP) y tres pantallas completas —Resumen, Movimientos (con registro y rectificación) y Ajustes— más dos destinos reservados que dicen la verdad sobre lo que aún no existe.

El orden de trabajo no es negociable y va de abajo arriba, porque cada capa hace comprobable la siguiente:

1. **Andamio del paquete**: `apps/web` en los *workspaces*, `tsconfig` compuesto con `noEmit`, Vite 8 + Solid, Pico vendorizada, Biome limpio, proyecto de Vitest, `build` con comprobación del *bundle*. Nada de interfaz todavía.
2. **Almacenamiento**: `BlobLedgerStore` en `packages/adapters` pasando los **tests de contrato existentes**, y los dos *handles* del navegador (carpeta del disco e IndexedDB).
3. **Añadidos al dominio** (decisión (h)): vista previa como caso de uso, lista del libro como proyección, avisos silenciados; con su cobertura al 100 % y con la CLI migrada a consumirlos en el mismo commit.
4. **Esqueleto**: *tokens* y hoja de estilo, `Amount`, navegación única, cabecera de estado del libro, estado de la aplicación, cabecera de degradación, tema y privacidad. Con sus tests de arquitectura.
5. **Pantallas**, en el orden en que aportan valor: apertura del libro → Resumen → Movimientos (lista y detalle) → Registrar → Rectificar → Catálogo → Ajustes y verificación.
6. **Remate**: PWA, CSP de producción, comprobación manual del criterio §5 del prompt a 360 px y contra el `ledger.jsonl` del *golden*, y las mediciones anotadas aquí.

## Contexto técnico

**Lenguaje/versión**: TypeScript 7.0.2 (compilador nativo) sobre Node 22 (`.nvmrc`), ESM, `tsconfig` estricto heredado de `tsconfig.base.json`. Para `apps/web`: `lib: ["ES2023","DOM","DOM.Iterable"]`, `module: "preserve"`, `moduleResolution: "bundler"`, `jsx: "preserve"`, `jsxImportSource: "solid-js"`, `composite: true` + `noEmit: true` (comprobado: `research.md` §2).

**Dependencias**: `solid-js` 1.9.15 y `@solidjs/router` 1.0.0, **con la versión exacta fijada** (runtime); `vite` 8.x, `vite-plugin-solid` 2.11.x y `vite-plugin-pwa` 1.3.x (desarrollo). `vite-plugin-solid` quedó **autorizada y registrada** en `docs/dependencies.md` (Q7). Vendorizada: `@picocss/pico` 2.1.1 (**solo** el CSS; uPlot llega con las gráficas, Q9). Ninguna más. `happy-dom` está **pre-autorizada** pero no se usa: se pediría con un caso concreto (decisión (k)).

**Almacenamiento**: el mismo `ledger.jsonl` (ADR-0002, ADR-0006). En escritorio, el fichero del disco a través de la File System Access API (solo Chrome/Edge: `research.md` §4); en el resto —incluido **todo** el móvil—, IndexedDB con importación y exportación. Esta feature **no** toca el esquema del libro: cero tipos de evento nuevos, cero cambios de forma, `schema_version` sigue en 1 y el *golden* no se regenera.

**Tests**: Vitest, proyecto nuevo `web` sin entorno de DOM (decisión (k)). `packages/domain` sigue al 100 % de líneas y ramas, bloqueante en CI, para lo que se añada en el paso 3. En `apps/web` no hay umbral numérico pero sí tests reales de la lógica de presentación y de la capa de acciones, más tres reglas nuevas en `tests/architecture.test.ts`.

**Plataforma**: navegador, móvil primero (360 px de referencia), sin servidor, sin autenticación y sin red (ADR-0019). Hasta la Fase 4 se sirve desde `localhost`, que es contexto seguro y basta para la File System Access API y para el *service worker*.

**Tipo de proyecto**: monorepo npm *workspaces* con arquitectura hexagonal; el dominio no importa nada y la web lo consume como una biblioteca más.

**Rendimiento**: medido (`research.md` §3): 200 eventos son 4 ms de decodificación y 1,2-4,6 ms de proyección; el escalado es lineal (~6 µs/evento), de modo que 5.000 eventos son decenas de milisegundos en el portátil y del orden de 100-300 ms en un teléfono, **una vez por carga**. Reglas que se derivan: una sola proyección base compartida, memoización por fecha de las proyecciones con `asOf`, y reproyección únicamente tras escribir.

**Restricciones**: sin CDNs, sin fuentes remotas, sin analítica, CSP restrictiva sin `unsafe-inline` en producción; sin directivas `use:`; ninguna regla de negocio fuera del dominio; nunca un cero donde falta un dato; el libro nunca se sobrescribe.

**Escala/alcance**: 1 paquete nuevo, 1 adaptador nuevo (+2 *handles*), 3-4 añadidos al dominio, 11 rutas, ~20 componentes, 9 formularios, 3 reglas de arquitectura nuevas.

## Verificación contra la constitución

*Puerta previa. Se vuelve a comprobar al terminar el diseño.*

| Principio | Cómo lo cumple esta feature |
|---|---|
| **I — El libro es la fuente de verdad** | La web no almacena **nada** derivado: carga el libro, proyecta y pinta. En escritorio escribe en el mismo fichero que la CLI, sin copia intermedia ni sincronización. El registro manual es precisamente lo que esta feature hace cómodo, y toda escritura es `append` con etag: los extractos no entran por ningún sitio |
| **II — Lotes y fiscalidad solo desde el libro** | La web no calcula ni un lote ni una fecha fiscal: los lee. La vista previa del efecto de un evento se obtiene proyectando el candidato con el **mismo** camino de código que `recordEvent` (caso de uso del dominio, Q1), no con una simulación propia. Los precios se muestran con su antigüedad y no alimentan nada fiscal |
| **III — Compartimentación estricta** | La única vista que suma los dos libros es el patrimonio total, que es la excepción 2 y se pinta **siempre desglosada**, como la devuelve `netWorth`. Núcleo y cubo son destinos separados (y de la feature siguiente). Una compra en el cubo exige tesis (regla 15), y como el asistente de tesis no está en el alcance, la web lo dice y remite a la CLI en lugar de permitir el atajo |
| **IV — Nada codificado que deba ser configurable** | Umbrales, pesos, porcentajes y días de caducidad salen de `Settings` y se editan en Ajustes con las validaciones del dominio. Los dos avisos caros del cambio de configuración (aviso silenciado, ejercicio movido) se muestran **antes** de escribir. Lo único fijo de la web es presentación: el punto de ruptura de 768 px, los siete días del recordatorio de exportación (que el prompt fija) y el número de movimientos del Resumen |
| **V — Fallo seguro, nunca silencio** | Sin precio, "sin dato"; sin tipo de cambio, fila sin convertir y total parcial; precio viejo, antigüedad marcada; eventos inválidos, cabecera permanente y escritura bloqueada; libro cambiado por fuera, conflicto visible y recarga; permiso caducado, mensaje y botón de reconectar; IndexedDB, aviso de exportación pendiente. Ninguna pantalla en blanco y ningún cero inventado |
| **VI — Supervivencia a 20 años** | Cinco dependencias de runtime en total (ADR-0017), Pico vendorizada como `big.js`, HTML nativo (`<dialog>`, `<select>`, `<details>`, `<datalist>`) en lugar de una librería de componentes, cero `use:` para que Solid 2 no duela, y el libro en un formato abierto que el usuario puede exportar en un toque. La aplicación funciona sin conexión y sin cuenta: es regalable |
| **VII — Tests donde un error cuesta dinero** | El adaptador nuevo pasa los **tests de contrato ya escritos** (rechazo de esquema nuevo, `append` que no re-serializa, `replace` que archiva, conflicto por etag). Lo que se añada al dominio va al 100 % de líneas y ramas. La regla de `Amount` y las dos de ADR-0017 se vigilan con tests de arquitectura, que es la única forma de que sigan vivas en 2036 |

**Sin violaciones que justificar.** La sección *Complexity Tracking* queda vacía.

## Arquitectura de información

La pregunta de diseño no es "qué pantallas tiene una aplicación de cartera", es **qué se pregunta el usuario y cuántos toques le cuesta la respuesta**. Cada ruta existe porque responde una pregunta que el usuario se hace de verdad; las que no responden ninguna no están.

| Ruta | La pregunta que responde | Contenido |
|---|---|---|
| `/` **Resumen** | ¿Cómo va y hay algo que hacer? | Patrimonio desglosado (núcleo, cubo, efectivo) con su parcialidad · lo que reclama atención, ordenado · últimos cinco movimientos |
| `/movimientos` **Movimientos** | ¿Qué he registrado? | Lista cronológica inversa, filtros en la URL, carga progresiva, recuento |
| `/movimientos/:id` | ¿Qué dice exactamente este evento y sigue vigente? | Todos los campos con nombre legible · estado (vigente, anulado, corrección) · enlaces (orden, solicitud, tesis, original/corrección) · acciones de rectificar |
| `/movimientos/:id/editar` | Lo registré mal, ¿cómo lo arreglo? | Formulario de su tipo con los valores actuales · original y corregido lado a lado · motivo · dependientes si los hay |
| `/registrar` | ¿Qué puedo registrar? | Siete operaciones del día a día + alta de cuenta y de activo, cada una con una línea de cuándo se usa |
| `/registrar/:tipo` | ¿Queda bien antes de escribirlo? | Formulario adaptado al móvil · vista previa del evento y de su efecto · avisos · confirmación |
| `/nucleo`, `/cubo` | (reservados) | Qué llegará en la feature siguiente y qué comando de la CLI lo responde hoy |
| `/ajustes` | ¿Dónde está mi libro y cómo está configurado? | Libro (dónde, exportar, importar, cambiar) · privacidad y tema · enlaces a configuración y verificación |
| `/ajustes/configuracion` | ¿Qué umbrales tengo puestos? | Formulario de `Settings` con validación del dominio y los dos avisos caros |
| `/ajustes/verificacion` | ¿Está sano mi libro? | `integrity` y comprobación profunda, con los hallazgos en español |
| `/libro` | ¿Con qué libro trabajo? | Primer arranque y cambio de libro: carpeta del disco o almacenamiento del navegador, con su limitación escrita |

**Una sola navegación, dos formas.** Un único elemento `<nav aria-label="Secciones">` con **una** lista de enlaces, conmutado por CSS:

- **Menos de 768 px**: barra **inferior** fija. Cinco huecos: Resumen · Movimientos · **Registrar** (acción destacada, en el centro, al alcance del pulgar) · Núcleo · Cubo. Icono **y** etiqueta, destino activo con `aria-current`, 44 px de objetivo.
- **768 px o más**: **rail** lateral fijo. Arriba, "Registrar" como acción primaria; debajo, los cuatro destinos; en el pie, el estado del libro, el interruptor de privacidad y el acceso a Ajustes.

**Por qué Ajustes no ocupa un hueco del pulgar.** Los cuatro destinos son de importancia equivalente y de uso diario; Ajustes se toca una vez al mes. En móvil vive en la **barra de estado** superior (una línea de 44 px: a la izquierda, el chip que dice de qué libro estamos hablando; a la derecha, el interruptor de privacidad y el engranaje). Esa barra **no es una segunda navegación**: no contiene destinos de igual rango, contiene el **estado** del libro y dos interruptores. En escritorio desaparece porque su contenido cabe en el pie del rail, de modo que **nunca hay dos barras a la vez**. Y no lleva título: el título de cada pantalla es su primer `<h1>`, alineado a la izquierda y desplazable con el contenido, que es el antídoto directo del contraejemplo de Ghostfolio (`research.md` §5).

**Orden de lectura del Resumen** (el que usan las aplicaciones de finanzas que el usuario respeta): *cuánto tengo → qué requiere acción → qué pasó últimamente*. A 360 px, el primer *scroll* muestra el total con sus tres subtotales y el recuento de avisos; el detalle de los avisos y los últimos movimientos vienen justo debajo.

## Estructura del proyecto

### Documentación de la feature

```text
specs/006-web-shell/
├── plan.md               # Este fichero
├── spec.md
├── questions.md          # Q1-Q11 con su supuesto provisional
├── research.md           # Versiones medidas, sondas de TS 7, navegador y navegación
├── data-model.md         # Estado de la aplicación, modelos de vista y registros de almacenamiento
├── quickstart.md         # Recorrido manual: abrir el golden, ver el resumen, registrar una compra
├── contracts/
│   ├── routes.md          # Rutas, qué responde cada una, navegación y estados
│   ├── storage.md         # LedgerBlob + BlobLedgerStore y los dos handles
│   └── domain.md          # Los añadidos al dominio que la web necesita (Q1-Q4)
├── checklists/requirements.md
└── tasks.md
```

### Código

```text
apps/web/
├── index.html                    CSP de producción, manifiesto, sin nada remoto
├── package.json                  @atlas/web
├── tsconfig.json                 compuesto + noEmit, DOM, jsx preserve
├── vite.config.ts                solid, pwa, alias de @atlas/*, sin minify: "esbuild"
├── scripts/check-bundle.mjs      falla el build si aparece node:*, una URL ajena o se pasa el presupuesto
├── public/                       iconos del manifiesto (propios, sin fuentes)
├── vendor/pico/                  pico.css + VENDOR.md + licencia
├── src/
│   ├── main.tsx                  único punto con onMount/efectos de arranque: tema, SW, primer load
│   ├── App.tsx                   router y composición del esqueleto
│   ├── shell/                    AppShell · Nav (la única navegación) · StatusBar · DegradedBanner · ErrorBoundary
│   ├── routes/
│   │   ├── resumen/              index + NetWorthBlock · AttentionBlock · LastMovements
│   │   ├── movimientos/          index (lista) · Filters · MovementList · detail · edit
│   │   ├── registrar/            index (qué registrar) · form · Preview
│   │   ├── ajustes/              index · configuracion · verificacion
│   │   ├── libro/                index (abrir y cambiar de libro)
│   │   └── reservado/            Núcleo y Cubo: qué llega y qué comando lo responde hoy
│   ├── components/               Amount · Figure · Field · Select · DateField · Callout · Dialog · EmptyState · Badge · DataList
│   ├── ledger/                   source.ts (elige y recuerda la vía) · store.ts (compone el adaptador) · state.ts (señales y contexto) · actions.ts (registrar, rectificar, configurar) · export.ts
│   ├── view-models/              lógica de presentación pura y probada: attention.ts · movements.ts · detail.ts · forms/ · networth.ts
│   ├── format/                   money.ts (solo lo importa Amount) · number.ts · date.ts · quantity.ts · labels.ts · messages/errors.ts · messages/warnings.ts
│   └── styles/                   tokens.css · base.css · layout.css · components.css
└── test/                         format · view-models · ledger · messages (anti-deriva)

packages/adapters/
├── src/ledger-store/blob.ts             LedgerBlob + BlobLedgerStore (bytes puros, sin node ni DOM)
├── src/ledger-store/browser/            handles del navegador: directory.ts (File System Access) · indexeddb.ts
├── tsconfig.browser.json                lib DOM, sin @types/node, para browser/
└── test/blob.test.ts                    los tests de contrato existentes sobre un handle en memoria

packages/domain/src/                     (sujeto a Q1-Q4)
├── usecases/preview-event.ts            NUEVO: vista previa de un candidato (hoy en la CLI)
├── projections/ledger-entries.ts        NUEVO: lista del libro ordenada, con estado y filtros
└── projections/settings-impact.ts       + avisos que un cambio de configuración silencia

tests/architecture.test.ts               + 3 reglas: puerta de Amount, aislamiento del bundle, sin use:
```

**Decisión de estructura**: por **responsabilidad**, no por tipo de fichero, y con dos carpetas que el árbol del prompt no nombra y que se justifican solas:

- **`shell/`**: el marco (navegación, barra de estado, cabecera de degradación, límite de errores) no es un componente reutilizable ni una ruta; mezclarlo con `components/` haría creer que se puede usar dos veces, y meterlo en `routes/` lo escondería. Es la pieza que el prompt llama "esqueleto".
- **`view-models/`**: aquí vive **toda** la lógica de presentación que se puede probar sin pintar nada — el orden de los avisos, el mapeo de una fila del libro, la especificación de cada formulario, el desglose del patrimonio en filas. Los ficheros de `routes/` quedan como composición: leen del estado, llaman a un modelo de vista y pintan. Es lo que hace que "tests de verdad" sea posible sin entorno de DOM (Q8), y lo que evita que un componente acabe conteniendo una decisión.
- Ningún fichero suelto en la raíz de `src/` salvo `main.tsx` y `App.tsx`, que son el arranque. `index.ts` solo donde aclare los imports (`components/`, `format/`), no por costumbre.

## Decisiones de diseño

**D1 — El paquete entra en la solución raíz sin emitir JavaScript.** `apps/web/tsconfig.json` es `composite` + `noEmit` (comprobado en `research.md` §2) y se referencia desde el `tsconfig.json` raíz, así `npm run typecheck` cubre la web. El JavaScript que se sirve lo genera Vite. `npm run build` raíz pasa a ser `tsc -b && npm run build -w @atlas/web`, y `npm run clean` borra también `apps/web/dist` y la caché de Vite.

**D2 — Vite resuelve `@atlas/domain` por alias al código fuente; `tsc` por referencia de proyecto.** El alias (el mismo que ya usa `vitest.config.ts`) evita tener que reconstruir `dist` para ver un cambio del dominio y deja que Rolldown sacuda el árbol sobre las fuentes. Los tipos siguen viniendo de la referencia de proyecto, que es lo que mantiene el orden de compilación correcto.

**D3 — El adaptador del navegador se parte en dos: lógica y *handle*.** `BlobLedgerStore` implementa `LedgerStore` sobre una interfaz mínima de bytes (`LedgerBlob`: leer, escribir, escribir archivo) y contiene **todo** lo que el contrato exige: etag = `sha256Hex` de los bytes (el del dominio, puro), `append` que concatena sobre los bytes originales sin re-serializar, `replace` que archiva antes y nunca sobrescribe un archivo, y `ConflictError` cuando el etag no coincide. Los *handles* reales (carpeta del disco, IndexedDB) son 20-30 líneas cada uno. Ventaja decisiva: los **tests de contrato ya escritos** corren contra `BlobLedgerStore` con un *handle* en memoria, así que el adaptador del navegador entra probado al mismo nivel que el de fichero.

**D4 — En escritorio se elige la carpeta, no el fichero** (Q5). Un `FileSystemFileHandle` no permite llegar a su directorio padre, y sin directorio no hay `archive/`, así que un `replace` —lo que necesita `compact`— sería imposible y el contrato de puerto quedaría a medias. Con `showDirectoryPicker` la aplicación abre `ledger.jsonl` dentro de la carpeta elegida, puede crear `archive/` igual que la CLI, y el permiso cubre el libro y sus archivos. Coste aceptado: el permiso es sobre una carpeta que en la práctica solo contiene el libro.

**D5 — El permiso se recupera con un gesto, y se dice.** El *handle* se guarda en IndexedDB (son serializables) pero el permiso **no** sobrevive al cierre de todas las pestañas (`research.md` §4). Al arrancar se consulta con `queryPermission()`; si no está concedido, la pantalla dice en una frase qué pasa y ofrece "Reconectar", que llama a `requestPermission()` dentro del gesto. Nunca se pide volver a elegir la carpeta.

**D6 — IndexedDB nunca se presenta como definitivo.** Al adoptarlo se solicita `navigator.storage.persist()` y se informa del resultado; se guarda la fecha de la última exportación junto al libro; el chip avisa a los siete días; y la pantalla del libro lleva escrita la limitación de ADR-0019. La exportación entrega el contenido **byte a byte**, no una reserialización.

**D7 — Una sola proyección base y una memoización por fecha.** El estado guarda un `LedgerSnapshot` (eventos, líneas, etag, estado proyectado con `collectErrors`) y un mapa memoizado `fecha → proyección con asOf`. El Resumen consume la proyección de **hoy en Europe/Madrid** (igual que `atlas networth` sin `--date`, Q11); Movimientos consume la base, sin `asOf`, porque listar el libro **incluye** lo registrado con fecha futura. Tras cada escritura se recarga y se reproyecta una vez, y la memoización se vacía.

**D8 — Un único camino a un importe y a una cantidad, vigilado por el grafo de imports.** `format/money.ts` es el único módulo que sabe formatear una cifra **sensible** (importes y cantidades), y el test de arquitectura falla si lo importa cualquier fichero que no sea `components/Amount.tsx`. Es el mismo mecanismo con el que el repositorio ya protege la puerta de precios del dominio (`prices.ts`), y por eso resistirá dos años: no depende de que alguien recuerde la regla. `Amount` recibe `Money | undefined` y `Quantity` va por el mismo componente (`<Amount quantity={…}>` o su hermano `Quantity`, ambos en el mismo módulo vigilado): `undefined` es "sin dato" (nunca cero), y con el modo privacidad activo se pinta una máscara de ancho estable con su etiqueta accesible. **Q6 resuelta**: se enmascaran importes **y cantidades**; porcentajes, pesos y desviaciones van por `Figure`, que **no** enmascara porque son la información útil en público. El enmascarado es de la presentación de datos: un `<input>` que el usuario está rellenando nunca se enmascara.

**D9 — Los números se formatean sobre la cadena decimal.** Cero `Number()`: se parte la cadena en parte entera y decimal, se agrupan los millares con punto y se une con coma. Exacto por construcción, sin coma flotante (ADR-0005) y sin `Intl`. Los decimales de una columna se fijan por columna, no por valor, y las celdas numéricas van a la derecha con `font-variant-numeric: tabular-nums`.

**D10 — *Tokens* primero, Pico después.** `styles/tokens.css` define **una** escala tipográfica (cinco tamaños), **una** de espacio (seis pasos), los radios, los pesos y los colores semánticos (positivo, negativo, aviso, neutro, "sin dato"), en claro y oscuro, redefiniendo las variables `--pico-*` que Pico ya expone. Regla dura: **ningún valor fuera de las escalas** en ningún componente; el test no lo puede comprobar, la revisión sí, y Biome mantiene el formato. El color nunca va solo: ganancia y pérdida llevan signo explícito y etiqueta textual. El tema sigue al sistema con interruptor manual (`data-theme` en `<html>`, recordado en el dispositivo) y las transiciones respetan `prefers-reduced-motion`.

**D11 — Las tablas densas se reorganizan, no se desplazan.** En móvil, cada fila del libro es una tarjeta de dos alturas (línea 1: fecha, tipo y estado; línea 2: cuenta/activo e importe alineado a la derecha) con toda la tarjeta como objetivo táctil; a partir de 768 px, la misma información es una `<table>` nativa con cabeceras. Una sola fuente de datos (`view-models/movements.ts`), dos presentaciones por CSS. Cero desplazamiento horizontal a 360 px, que es criterio de aceptación (SC-001).

**D12 — Los formularios se describen como datos.** `view-models/forms/` define, por tipo de evento, sus campos con etiqueta en español, tipo de entrada (`decimal`, `date`, `text`, `select`, `datalist`), obligatoriedad, valor por defecto y origen de las opciones (cuentas, activos, divisas, órdenes abiertas, tesis abiertas). Un componente genérico los pinta. Es el equivalente de `ADD_SPECS` en la CLI, y trae un test que compara cada especificación con `knownFieldsOf(type)` del dominio: si el esquema gana un campo y el formulario no lo contempla, el test lo dice. Las validaciones no se replican: se rellena, se completa el borrador con `completeDraft` y se deja que `validateShape` y la proyección hablen.

**D13 — La vista previa es la del dominio.** Se muestra el evento tal como se escribirá y su efecto: posiciones y lotes antes/después, ganancias que generaría y avisos propios, con el mismo caso de uso que use la CLI (Q1). Si la vista previa levanta un error del dominio, se explica en español, se marca el campo si el error lo nombra y no se deja confirmar. La huella repetida y el conflicto por etag se tratan como dos diálogos distintos: el primero pide confirmación explícita, el segundo recarga y vuelve a la vista previa.

**D14 — Mensajes en español por `code`, con test anti-deriva bidireccional** (decisión (i)). `format/messages/` traduce los códigos de error y de aviso del dominio con la remediación propia de la web (pantalla a la que ir, no comando que teclear). El test recorre los códigos que el **dominio** emite y los catálogos de las **dos** interfaces, y falla si alguno de los dos deja un código sin traducir. Un código desconocido cae al mensaje del dominio: nunca se traga un aviso nuevo.

**D15 — Seguridad y red.** `index.html` lleva la CSP de producción en `<meta http-equiv>` (`default-src 'self'`; `script-src 'self'`; `style-src 'self'`; `img-src 'self' data:`; `connect-src 'self'`; `object-src 'none'`; `base-uri 'none'`; `form-action 'none'`), y un `transformIndexHtml` la relaja **solo** en desarrollo, donde el servidor de Vite inyecta scripts en línea; la diferencia queda documentada en el README. Iconos y manifiesto propios; ni una fuente, ni un icono, ni un *script* remoto. `scripts/check-bundle.mjs` corre dentro de `npm run build` de la web y falla si aparece `node:`, una URL `http(s)://` ajena, o si el tamaño gzip pasa del presupuesto.

**D16 — Tests sin entorno de DOM** (decisión (k)). Lo que se prueba: formato y enmascarado, orden de avisos, mapeo y filtrado de movimientos, especificaciones de formulario contra el esquema, selección de vía de almacenamiento, contrato del adaptador (con los tests ya escritos), catálogo de mensajes, y los flujos completos **a nivel de acciones** (abrir un libro de prueba → proyectar → construir borrador → vista previa → escribir → releer, comprobando que el fichero gana exactamente las líneas esperadas y que las anteriores no cambian). Lo que se verifica a mano y se anota (criterio §5 del prompt): 360 px sin desplazamiento, objetivos táctiles, la aplicación abriendo el `ledger.jsonl` del *golden* y registrando una compra.

## Mediciones

Del dominio (portátil del usuario, Node 22, `tests/fixtures/ledger/synthetic-v1.jsonl`, 200 eventos):

| Qué | Valor | Cuándo |
|---|---|---|
| Decodificar y validar 200 líneas | 4,0 ms | Medido 2026-09-18 |
| Proyectar 200 eventos (`collectErrors`) | 4,6 ms en frío / 1,24 ms en caliente | Medido 2026-09-18 |
| Proyectar con `asOf` | 2,3 ms | Medido 2026-09-18 |
| `netWorth` | 1,6 ms | Medido 2026-09-18 |
| Escalado | ~6 µs/evento, lineal (prefijos 50/100/150/200) | Medido 2026-09-18 |
| Estimación a 5.000 eventos (portátil) | 30-60 ms de carga + proyección | Extrapolación lineal |

**Conclusión honesta**: el umbral de 100 ms del prompt §3.3 no se alcanza en el portátil hasta el orden de 10.000 eventos, así que no hay nada que optimizar; lo que sí se ha hecho es no desperdiciarlo (una sola proyección base y memoización por fecha). El dato del móvil real queda pendiente de la verificación del usuario.

Del *bundle* (`npm run build`, comprobado por `scripts/check-bundle.mjs`):

| Fragmento | Sin comprimir | gzip | Qué es |
|---|---|---|---|
| `assets/state-*.js` | 85,0 KB | **25,9 KB** | `@atlas/domain` entero con `big.js`: proyecciones, FIFO, dinero |
| `assets/index-*.css` | 97,8 KB | **14,2 KB** | Pico vendorizada (13,2) más nuestra capa (~1,0) |
| `assets/index-*.js` | 34,9 KB | **12,9 KB** | Arranque, esqueleto y estado |
| `assets/routing-*.js` | 31,1 KB | **12,1 KB** | `solid-js` + `@solidjs/router` |
| `workbox-*.js` + `sw.js` | 16,5 KB | **5,9 KB** | *Service worker* de la PWA (fuera del camino crítico) |
| Resto (14 fragmentos por pantalla) | — | ~26 KB | Cargados por ruta, no en el arranque |
| **TOTAL servido** | — | **109,9 KB** | Presupuesto 120 KB (SC-005) |

Lo que descarga el arranque son ~65 KB gzip (índice + rutas + dominio + CSS); el resto llega por ruta. Nota sobre ADR-0017: su estimación de "~42 KB de runtime antes de nuestro código" no contaba el **dominio** (25,9 KB), que en el navegador es código nuestro pero no de interfaz; la cifra comparable es solid+router+Pico = **25,3 KB**, por debajo de lo previsto, y el dominio se suma aparte. Es el precio de tener el motor fiscal en el dispositivo, que es justo lo que hace que la web funcione sin servidor.

## Verificación

Lo comprobado de forma automática (en CI y en cada commit):

- `npm run lint`, `npm run typecheck`, `npm test` (812 pruebas) y `npm run build` en verde; `npm run clean && npm run build` desde cero.
- El adaptador del navegador pasa los **tests de contrato ya existentes** del puerto (rechazo de esquema nuevo, `append` que conserva bytes, `replace` que archiva, conflicto por etag).
- Los flujos de escritura, sobre el *golden* real y comprobando los **bytes del fichero**: una compra añade una línea y deja las 200 anteriores intactas; corregir añade dos; anular una; la huella repetida no escribe sin confirmación; el conflicto no escribe nada.
- Cuatro reglas de arquitectura nuevas: la puerta de `Amount`, la prohibición del barril de `@atlas/adapters` y de `node:*`, la ausencia de directivas `use:` y la de orígenes ajenos en las fuentes. **Se ha comprobado que fallan** introduciendo una violación a propósito.
- El test anti-deriva de mensajes: todos los códigos del dominio traducidos en las **dos** interfaces.
- El `build` comprueba sobre el resultado que no hay `node:`, ni URL ajena, ni exceso de presupuesto.
- El servidor de desarrollo transforma las 17 pantallas y componentes con el *pipeline* real (`curl` a cada módulo: 200 y transformación correcta), y `vite preview` sirve el `index.html` con la CSP **estricta**, el manifiesto y el *service worker*.
- **El paso 6 de `quickstart.md`, por el camino de código de la web**: sobre una copia del *golden*, `previewEvent` mostró la posición 127,4196 → 129,4196 y 27 → 28 lotes, y `recordEvent` escribió a través de `BlobLedgerStore` (el mismo adaptador del navegador, con el blob respaldado por un fichero real). Resultado comprobado desde fuera: el fichero pasa de 200 a **201 líneas**, las 200 anteriores son **idénticas byte a byte** (`diff` limpio), `atlas check --deep` devuelve **0 hallazgos** (los 21 avisos son los que el *golden* ya traía) y `atlas positions` refleja la compra. Es la garantía de que la web y la CLI comparten un solo libro; lo único que no se ha ejercitado es el *handle* de la File System Access API, que necesita navegador.

Lo que **no** se ha podido comprobar en este entorno, y queda para la revisión del usuario (no hay navegador aquí):

- El recorrido visual de `quickstart.md` a 360 px: desplazamiento horizontal, objetivos táctiles y orden de lectura.
- Abrir la carpeta del disco con la File System Access API, el ciclo de «Reconectar» y la escritura sobre el `ledger.jsonl` real desde el navegador.
- La instalación como PWA y el arranque sin conexión.
- El tiempo de carga y de proyección en un móvil real.

El módulo de pantallas **no** se puede cargar en un test sin DOM: `@solidjs/router` lee `window.history` en el momento de importarse. Es el caso concreto que justificaría `happy-dom` (decisión (k)), anotado en `questions.md`.

## Riesgos y cómo se cortan

| Riesgo | Corte |
|---|---|
| El *bundle* arrastra `node:fs` por importar el barril de `@atlas/adapters` | La web importa **solo** subrutas (`@atlas/adapters/blob`, `@atlas/adapters/browser`); regla de arquitectura que prohíbe el barril en `apps/web` y comprobación del contenido del *bundle* en el `build` |
| Dos pestañas o la CLI escribiendo a la vez | Etag en toda escritura; conflicto visible con recarga y nueva vista previa; nunca se pisa |
| El usuario pierde el libro de IndexedDB al limpiar el navegador | `persist()`, fecha de la última exportación, aviso a los siete días, limitación escrita, y la copia de la CLI (`atlas backup`) |
| El permiso del fichero se pierde al cerrar el navegador y parece un error | Se consulta con `queryPermission()`, se explica y se ofrece "Reconectar" (D5) |
| Una regla de negocio se cuela en un componente por comodidad | Q1-Q4 la mueven al dominio antes de escribir la pantalla; revisión explícita en la lista de tareas y en la checklist |
| El diseño se desalinea con el tiempo (valores fuera de la escala) | *Tokens* únicos, Pico como base, revisión en la checklist; Biome mantiene el formato |
| Solid 2.0 rompe la aplicación | Versión fijada, cero directivas `use:` (con test), efectos concentrados en el arranque; la migración será su propio ADR |
| La PWA cachea una versión antigua que escribe sobre un libro más nuevo | El cargador rechaza `schema_version` superior (`docs/data-schema.md` §5); el *service worker* se actualiza al abrir |

## Complexity Tracking

Sin violaciones de la constitución que justificar.
