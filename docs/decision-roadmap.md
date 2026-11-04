# Hoja de ruta de decisiones

Lo que **sigue pendiente**. Las rondas de decisión 1-9 (dinero, esquema del libro, estructura del código, FIFO, calidad, web, capa en la nube y salida fiscal) están cerradas y su resultado vive en los ADR ([`docs/adr/README.md`](adr/README.md)), en [`data-schema.md`](data-schema.md), en [`business-rules.md`](business-rules.md) y en [`fiscal-questions.md`](fiscal-questions.md). Su texto original está en el historial de git (`git log -- docs/decision-roadmap.md`).

Entra aquí algo que bloquea código, que cambia de forma cara de revertir cómo se escribe o que una sesión improvisaría distinto sin tenerlo escrito, y que aún no está decidido. Lo demás se decide en el plan de cada feature.

| Pendiente | Bloquea | De quién depende | Estado (2026-11-03) |
|---|---|---|---|
| **Importador de MyInvestor** (extracto de operaciones de fondos; el formato de efectivo y posición ya está en [`statements/myinvestor.md`](statements/myinvestor.md)) | Los importadores | El usuario: la exportación solo existe tras la primera suscripción | Sin empezar |
| **Importador de IBKR** (Flex Query XML, Flex Web Service, token de solo lectura) | Los importadores; conciliación semanal y rotación del token Flex | El usuario: cuenta de IBKR sin abrir | Sin empezar. Una ADR propia al empezar; lo importado queda como borradores por confirmar, nunca como operaciones |
| **Subida de `documents/` e `imports/` al bucket** | Importadores o un evento corporativo que necesite su documento en la nube | Importadores | Aplazada |
| **018 — Despliegue de `dev`** en la cuenta compartida con datos sintéticos; la lista de comprobaciones está en [`first-deploy-checks.md`](first-deploy-checks.md) | 019 | El usuario: las comprobaciones C1-C19 de ADR-0034, MFA del *root*, verificación en dos pasos de Google y reaplicar a mano el *bootstrap* (`dev` y luego `prod`) | Código e infraestructura escritos y probados sin desplegar; los runbooks, sin probar contra AWS real |
| **019 — Promoción a `prod`**: mismo artefacto, primera subida del libro real, ensayo de restauración | Uso real en la nube | 018 | Sin empezar |
| **Antigüedad del contraste de los tipos en la Renta de enero** en la nube (`CLOUD_ECB_STALE_DAYS` frente a `atlas.config.json`) | Nada: puede diferir en notas de `atlas tax`, nunca en cifras | Decisión menor | Abierta |
| **Criterios fiscales en disputa o de certeza baja** (#4, #7, #8, #13, #15, #24) | La primera declaración hecha con la aplicación | El usuario (no hay asesor fiscal) | Ver [`fiscal-questions.md`](fiscal-questions.md) |
