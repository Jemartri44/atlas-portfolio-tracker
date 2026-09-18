# Contrato de rutas y esqueleto — feature `006-web-shell`

Rutas con `@solidjs/router`. Toda ruta es navegable, compartible y recargable: el botón atrás del teléfono hace lo que el usuario espera (FR-029).

## 1. Rutas

| Ruta | Pantalla | Parámetros | Estado de carga exigido |
|---|---|---|---|
| `/` | Resumen | — | `ready` |
| `/movimientos` | Lista del libro | `?tipo`, `?cuenta`, `?activo`, `?desde`, `?hasta`, `?q` (todos opcionales y combinables) | `ready` |
| `/movimientos/:id` | Detalle del evento | `id` = ULID del evento | `ready` |
| `/movimientos/:id/editar` | Rectificar (corregir) | `id` | `ready` y libro sin eventos inválidos |
| `/registrar` | Qué registrar | — | `ready` |
| `/registrar/:tipo` | Formulario + vista previa | `tipo` ∈ `buy`, `sell`, `cash-in`, `cash-out`, `dividend`, `valuation`, `order`, `cuenta`, `activo` | `ready` y libro sin eventos inválidos |
| `/nucleo` | Reservado (feature siguiente) | — | cualquiera |
| `/cubo` | Reservado (feature siguiente) | — | cualquiera |
| `/ajustes` | Ajustes (hub) | — | `ready` para el bloque de configuración; el bloque del libro funciona siempre |
| `/ajustes/configuracion` | Formulario de `Settings` | — | `ready` |
| `/ajustes/verificacion` | `integrity` + comprobación profunda | — | `ready` |
| `/libro` | Abrir o cambiar de libro | — | cualquiera |
| `*` | No existe | — | cualquiera |

**Nombres de ruta en español** porque son interfaz, y el usuario los lee y los teclea; los identificadores del código siguen en inglés. `:tipo` usa el mismo vocabulario que la CLI (`cash-in`, `cash-out`) para que quien use las dos no tenga que traducir.

**Puerta de arranque**: si `load.phase` es `unconfigured` o `reconnect`, cualquier ruta que exija `ready` redirige a `/libro` (con `replace`, para no ensuciar el historial). Si es `loading`, se pinta el esqueleto de carga de esa pantalla; si es `failed`, el error con su acción.

**Escritura bloqueada con libro degradado**: `/registrar/*` y `/movimientos/:id/editar` muestran, en lugar del formulario, el motivo y el enlace a `/ajustes/verificacion` (ADR-0015). La única escritura permitida sobre un libro degradado es la configuración, y va por `/ajustes/configuracion`.

## 2. Navegación

Un único `<nav aria-label="Secciones">` con una sola lista de enlaces (FR-027):

| Posición | Entrada | Destino | Notas |
|---|---|---|---|
| 1 | Resumen | `/` | |
| 2 | Movimientos | `/movimientos` | |
| 3 | **Registrar** | `/registrar` | Acción destacada, en el centro de la barra inferior; en el rail, botón primario arriba |
| 4 | Núcleo | `/nucleo` | Reservado, marcado como "llega pronto" pero navegable |
| 5 | Cubo | `/cubo` | Idem |

- `< 768 px`: la `<nav>` es una barra inferior fija (`position: fixed; inset-inline: 0; bottom: 0`), con relleno inferior seguro (`env(safe-area-inset-bottom)`).
- `≥ 768 px`: la misma `<nav>` es un rail lateral fijo a la izquierda; la barra de estado superior **no se pinta** y su contenido va al pie del rail.
- Destino activo con `aria-current="page"` y distinción visual que no depende solo del color (peso e indicador).
- Objetivo táctil ≥ 44 px en cada entrada (FR-030).

**Barra de estado** (`<header>`, solo `< 768 px`), una línea, sin título:

| Zona | Contenido |
|---|---|
| Izquierda | Chip del libro: nombre del fichero (`ledger.jsonl · Carpeta`) o "Almacenamiento del navegador"; punto de aviso si la exportación lleva más de 7 días o el permiso está pendiente. Enlaza a `/ajustes` |
| Derecha | Interruptor de privacidad (`<input type="checkbox" role="switch">`, etiquetado) y engranaje a `/ajustes` |

**Cabecera de degradación** (`<aside role="status">`): si `invalidCount > 0`, se pinta bajo la barra de estado en **todas** las rutas, con el número de eventos inválidos y enlace a `/ajustes/verificacion` (FR-018). No se puede cerrar: normalizar el estado degradado es exactamente lo que ADR-0015 quiere evitar.

## 3. Estados comunes de pantalla

Cada pantalla que dependa del libro implementa los cuatro, y ninguno es una pantalla en blanco (FR-019):

| Estado | Qué se pinta |
|---|---|
| Cargando | Título de la pantalla y bloques de esqueleto del tamaño real del contenido; sin *spinner* indefinido |
| Vacío | Una frase que dice por qué está vacío y el siguiente paso, con su enlace (por ejemplo: "Aún no hay cuentas. Da de alta la primera.") |
| Error | Mensaje en español por `code`, línea del fichero si la hay, y la acción que resuelve (reconectar, elegir otro libro, ir a verificación) |
| Listo | El contenido |

## 4. Diálogos

Siempre `<dialog>` nativo (trampa de foco y `Esc` de serie, ADR-0017), nunca un panel que rompa el botón atrás:

| Diálogo | Cuándo | Qué exige |
|---|---|---|
| Huella repetida | `DuplicateFingerprintError` al confirmar | Lista de eventos con la misma huella y confirmación explícita (equivalente a `--confirm-duplicate`) |
| Conflicto | `ConflictError` al escribir | Explica que el libro cambió por fuera, recarga y vuelve a la vista previa; no ofrece "escribir de todas formas" |
| Dependientes | `DependentEventsError` al rectificar | Tabla de dependientes con su motivo; solo cierra |
| Avisos silenciados | Cambio de configuración que apaga un aviso activo | Lista de avisos y confirmación |
| Ejercicio movido | Cambio que mueve ganancias de un ejercicio anterior | Tabla de ejercicios (antes/después) y confirmación |
| Eventos que quedan inválidos | Cambio de configuración que invalida eventos | Lista y aceptación explícita (equivalente a `--accept-invalid`) |
| Anular | Botón de eliminar de un detalle | Motivo obligatorio y confirmación |

## 5. Accesibilidad (criterios comprobables)

- Un solo `<h1>` por pantalla, alineado a la izquierda, primer elemento del contenido.
- Región principal `<main>` con `id` y enlace de salto desde el primer tabulador.
- Orden de tabulación = orden visual; foco visible con un anillo de contraste suficiente en los dos temas.
- Los controles de formulario llevan `<label>` asociado; los errores se asocian con `aria-describedby` y se anuncian (`role="alert"`).
- La barra inferior no tapa el último elemento de la página: `padding-block-end` reservado en `<main>`.
- `prefers-reduced-motion`: sin transiciones.
- Contraste mínimo AA en los dos temas, y el significado nunca solo por color (FR-026).
