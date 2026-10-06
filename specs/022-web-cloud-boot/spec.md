# Especificación — 022 La web arranca en la nube: leer y sin conexión (ADR-0035, E2a)

**Origen:** ADR-0035 (Aceptada), §2, §3 y §5, entrega E2a; `docs/api.md` §3 y §5.8; `specs/021-api-ledger-store`. **Alcance:** solo **leer** y el comportamiento **sin conexión**. Escribir (formularios sobre `ApiLedgerStore`, `412` guiado, «Descargar copia») es E2b; retirar el libro local, importar y la cola es E2b/E5. El camino local sigue en el código, solo para los tests.

## Historia

Como persona que usa Atlas, quiero que la web, al abrirse, compruebe mi sesión y cargue el libro único de la nube, para ver siempre el mismo libro en cualquier dispositivo sin que el dispositivo guarde nada de él.

## Requisitos

- **FR-001** Modo de arranque por constante (`ledger/mode.ts`, `LEDGER_MODE`): `cloud` es el producto; `local` (libro en IndexedDB) queda solo para los tests hasta E2b/E5. Ninguna pantalla lee la constante: leen la fase de la carga.
- **FR-002** Arranque en nube: `GET /api/session` → `ApiLedgerStore.load()` (`GET /api/ledger`, `ETag` = SHA-256 de los bytes, cabecera `x-atlas-expected-device` con el `device_id` de la sesión) → proyección única en el cliente.
- **FR-003** Sin sesión (`unauthenticated`, `session_invalid`, `not_allowed`, `device_forgotten`): solo la pantalla «Entrar con Google», un enlace de navegación completa a `/api/auth/login`. Nada del libro, sin navegación.
- **FR-004** Sin conexión (fallo de red en la sesión o en el libro, o el evento `offline`): pantalla «Sin conexión» con «Reintentar». Ni cifras, ni formularios, ni el último estado: el libro y las dependencias se sueltan. Al volver la conexión (`online`) o al pulsar «Reintentar», se vuelve a pedir la sesión y el libro **siempre**. Un libro que llega cuando el dispositivo ya está sin conexión no se enseña.
- **FR-005** Otro fallo de lectura (`5xx`, forma inesperada, esquema más nuevo, libro ilegible): «No se han podido leer tus datos», con su frase y «Reintentar». Nunca un libro vacío ni parcial.
- **FR-006** Caché: el *service worker* precarga solo el *shell*; sin reglas de caché en tiempo de ejecución; `navigateFallbackDenylist: [/^\/api\//]`. Toda petición de la web a su API pide `cache: "no-store"` (arranque, `signOut` y los dispositivos incluidos; el BCE público conserva `ETag`/`304`).
- **FR-007** En el dispositivo, tras una sesión de nube, solo queda lo que no es dato personal: las preferencias de la interfaz (`atlas.privacy`, `atlas.theme`) y la copia pública del BCE en IndexedDB. Ninguna clave `atlas.source`, ningún almacén con el libro o con borradores, ninguna entrada de caché. «Guardar como borrador» no se ofrece en modo nube y `saveDraft` se niega (los borradores en la nube llegan con E6). **Excepción hasta E2b:** la tarjeta de sincronización de Ajustes (`SessionCard`) sigue guardando el `device_id` en IndexedDB; E2b la retira.
- **FR-007b** Un arranque viejo nunca pisa a uno nuevo: cada arranque, y cada evento `offline`, toma un número de generación, y quien ya no es el último no publica nada (ni `ready`, ni fallo, ni `offline`).
- **FR-008** Desarrollo sin AWS: `npm run dev` lleva `/api` al servidor local de pruebas con el *proxy* de Vite (`ATLAS_API_URL`, por defecto `http://127.0.0.1:8787`), solo en desarrollo.
- **FR-009** Techos del paquete (`check-bundle.mjs`): el arranque se queda dentro; el total sube a 320.500 por decisión de la dirección (`questions.md`).

## Estado intermedio: E2a y E2b van juntas

Mientras no llegue E2b, el código conserva tres cosas que la revisión señaló y que **no se arreglan aquí**, porque E2b las retira: (I1) el camino local sigue alcanzable (`/libro`, importar, abrir el libro del navegador); (I2) `SessionCard` guarda el `device_id` en IndexedDB; (I3) los formularios escriben sin las reglas del resultado desconocido ni del `412` guiado. **`develop` no se despliega entre E2a y E2b (la 018 espera).**

## Fuera de alcance

Escribir, «Descargar copia», el aviso de sesión de 15 minutos, quitar el libro local, importar, la carpeta, la tarjeta de sincronización (E2b/E5), borradores en la nube (E6). El redireccionamiento tras el inicio de sesión (`/ajustes#sincronizacion`, `docs/api.md` §3) es de la API (E4).

## Criterios de aceptación

`apps/web/test/sync/cloud-boot.test.tsx` (contra el manejador real con dobles), `cloud-device.test.tsx`, `no-store.test.ts` y `pwa-cache.test.ts`; la comprobación del bundle; una captura en navegador real.
