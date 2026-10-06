# Plan — 022 (ADR-0035, E2a)

- **Fases de carga nuevas** (`ledger/state.ts`): `signed_out` (con motivo), `offline` y `cloud_failed`; `blocksTheApp(phase)` las agrupa. Las pantallas de datos no cambian: el marco (`shell/AppShell.tsx`) pone `shell/CloudGate.tsx` en lugar del contenido cuando la fase bloquea, así que ninguna pantalla ni formulario se pinta.
- **Origen de la fuente** (`ledger/source.ts`): `CloudSource { kind: "cloud", expiresAt }` junto a `BrowserSource`. El chip dice «Nube» sin edad ni recordatorio.
- **Arranque** (`ledger/cloud.ts`, perezoso): `bootCloud(fetch)` y `watchConnection()`. `loadInto` admite un clasificador de fallos para que un corte de red sea «Sin conexión» y no un error genérico. `main.tsx` elige por `LEDGER_MODE` y carga con `import()` tanto la nube como el camino local, para que el arranque pese menos.
- **Adaptadores por subruta** (`@atlas/adapters/api-store`, `sync-http`): alias en `vite.config.ts` y `vitest.config.ts`. La regla de arquitectura de la 015 («el cliente de la sync solo por el motor») admite `ledger/cloud.ts` como única excepción hasta E5.
- **Caché:** `WORKBOX_OPTIONS` se exporta para poder probarlo; `cache: "no-store"` añadido a `signOut` y a los dos `POST` de dispositivos.
- **Desarrollo:** `server.proxy` en Vite; el servidor local de pruebas admite `--origin` (el origen que ve el navegador) y `--ledger` (libro sintético inicial).
- **Medido** (gzip, bytes): arranque 75.949 (techo 76.055, autorizado 76.069); total 320.215 (techo 315.745): ver `questions.md`.
