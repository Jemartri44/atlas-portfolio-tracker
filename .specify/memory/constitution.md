<!--
Sync Impact Report
- Version change: 1.1.0 → 1.2.0
- Modified principles: VII (100% line and branch coverage required in packages/domain, blocking in CI)
- Modified sections: Flujo de desarrollo (git hooks, PR template, MIT licence)
- Added sections: none
- Removed sections: none
- Templates requiring updates: none
- Follow-up TODOs: none.
-->

# Constitución de Atlas Portfolio Tracker

Principios no negociables de la aplicación personal de gestión de cartera de inversión. Toda especificación, plan y tarea del proyecto DEBE respetarlos. Cuando un principio y una conveniencia técnica choquen, gana el principio.

Documentos de referencia: `docs/specification.md` (especificación de producto), `docs/business-rules.md` (reglas de dominio y fiscalidad) y `CLAUDE.md` (convenciones operativas).

## Principios fundamentales

### I. El libro mayor propio es la fuente de verdad

- Toda operación se registra en el momento de operar, con fecha, activo, cantidad, precio, comisión, divisa y tipo de cambio.
- Los extractos de brókers sirven para **conciliar**, nunca para alimentar el sistema. Nada entra en el libro sin confirmación explícita del usuario.
- Todo dato derivado (posiciones, pesos, métricas, fiscalidad) DEBE ser recalculable desde cero a partir del libro. No se almacenan agregados que no puedan regenerarse.
- La entrada manual nunca se elimina. La importación automática es comodidad, no requisito.

*Razón:* los brókers cambian formatos, cierran cuentas y desaparecen. El registro propio es lo único que sobrevive 20 años.

### II. Los lotes son la unidad; la fiscalidad sale solo del libro

- Las posiciones se modelan **lote a lote** (`Lot`), nunca como posiciones agregadas. Los lotes son una **proyección** calculada desde las operaciones, no un dato almacenado; la posición actual es una consulta.
- El libro es **append-only**: las operaciones nunca se editan ni se borran; se rectifican con `reversal` más la operación correcta (ADR-0003).
- El traspaso entre fondos conserva `acquisition_date` y `unit_cost_eur` de los lotes origen. **NUNCA se modela como venta seguida de compra.**
- Los eventos corporativos son operaciones de primera clase (`corporate_action`) con lógica propia de transformación de lotes y fuente documental obligatoria.
- Ningún cálculo fiscal DEBE depender de precios de mercado. Los precios son informativos; la fiscalidad sale exclusivamente del libro.
- El dinero se representa en decimal, nunca en coma flotante. Se guardan siempre importe original, divisa y tipo de cambio del BCE de la fecha valor.

*Razón:* estos son los errores que no se detectan hasta la primera declaración de la Renta con ventas, años después, y entonces cuestan dinero.

### III. Compartimentación estricta

- Dos libros (`book`): `core` (cartera principal: `equity`, `fixed_income`, `gold`, `crypto`) y `bucket` (cubo especulativo).
- Núcleo y cubo NUNCA se mezclan en un cálculo, vista o métrica. El cubo es un presupuesto (porcentaje de la aportación), no una asignación; no entra en los pesos objetivo.
- El patrimonio total siempre se muestra desglosado. Nunca un único número sin descomponer.
- No se puede registrar una compra en el cubo sin una tesis (`Thesis`) creada antes.

*Razón:* las reglas de conducta del plan de inversión solo sirven si el sistema las hace imposibles de saltar.

### IV. Nada codificado que deba ser configurable

- Umbrales, pesos objetivo, frecuencias, tipos impositivos, destinatarios y residencia fiscal son configuración (`Settings`), con historial de cambios y validación.
- Modificar un umbral que silencia una alerta activa DEBE advertirse explícitamente.
- Las cifras fiscales se documentan como "según se entienden en {fecha}, verificar"; nunca como constantes del código.

*Razón:* los valores cambian con la vida y con la normativa; editar código para cambiar un porcentaje garantiza que no se hará.

### V. Fallo seguro, nunca silencio

- Si una fuente de datos cae, se muestra el último valor conocido con su antigüedad marcada. Nunca se interpola ni se estima en silencio.
- El sistema DEBE ser plenamente funcional con cero fuentes automáticas de precios.
- Registrar dos veces la misma operación se detecta, no se duplica (idempotencia).
- Los avisos se envían solo cuando hay algo que hacer; el recordatorio mensual siempre.

*Razón:* un sistema que inventa datos o que envía ruido acaba ignorado; uno que degrada de forma visible sigue siendo fiable.

### VI. Supervivencia a 20 años por encima de elegancia técnica

- Pocas dependencias, con presupuesto explícito: cada paquete nuevo requiere justificación. Preferir la biblioteca estándar.
- Formatos abiertos. El libro mayor DEBE ser legible sin la aplicación, y exportable a CSV/JSON en un clic.
- Cero servicios de pago de terceros en el camino crítico. Coste indefinidamente dentro del always-free de AWS.
- Prueba de restauración anual desde el backup.
- El esquema de datos y la lógica de transformación de lotes se documentan en el repositorio.

*Razón:* la cartera mediocre mantenida 30 años bate a la óptima abandonada en dos. Lo mismo vale para el software que la gestiona.

### VII. Tests primero donde un error cuesta dinero

- Prioridad por daño si fallan: motor FIFO y transformaciones de lotes, conversión de divisa por fecha valor, regla de los dos meses, reparto de la aportación mensual, parsers de extractos.
- Casos límite obligatorios: varios lotes con la misma fecha, fracciones, contrasplit con liquidación en efectivo, recompra en el límite de los dos meses, traspaso parcial.
- Los parsers tienen tests de contrato contra ficheros de ejemplo anonimizados versionados en el repositorio.
- `packages/domain` mantiene **cobertura del 100% de líneas y ramas**, bloqueante en CI. Fuera del dominio no hay umbral numérico: mandan los tests de contrato e integración.
- Ninguna funcionalidad del motor fiscal se da por terminada sin sus tests.

*Razón:* un error silencioso en la fiscalidad no se detecta hasta años después y no tiene vuelta atrás.

## Restricciones técnicas

- **Plataforma:** AWS dentro del always-free (S3 + CloudFront, Lambda con Function URL, S3 versionado como único almacén de datos, Cognito con MFA, EventBridge Scheduler, SES, SSM Parameter Store). TypeScript en todo el código, con el dominio en un paquete compartido (ADR-0001, ADR-0002). Terraform para todo; nada creado a mano. Antes de introducir un servicio nuevo, verificar que es gratuito a esta escala.
- **Seguridad:** nunca credenciales de brókers (solo el token Flex de IBKR, de solo lectura, en SSM como `SecureString`). Sin analítica ni CDN de terceros; CSP restrictiva. Validación siempre en el backend. IAM de mínimo privilegio, un rol por Lambda.
- **Privacidad:** nunca se registran en logs importes, posiciones, saldos ni identificadores de cuenta. Nada personal en el repositorio público: ni dominio real, ni importes, ni el plan financiero (`plan-financiero.md`, ignorado por git).
- **Idioma:** todo lo técnico (código, identificadores, commits, ramas, ficheros, infraestructura) en inglés. Documentos, especificaciones y esta constitución en español con identificadores en inglés.
- **Entornos:** `dev` (rama `develop`) y `prod` (rama `main`) con pilas separadas. Se construye una vez y se promociona. Datos de producción jamás en `dev`.

## Flujo de desarrollo

- **Git flow con git básico** (sin la extensión `git-flow`): `main`, `develop`, `feature/*`, `fix/*`, `release/*`, `hotfix/*`, fusiones con `--no-ff`. Pull requests obligatorias hacia `develop` y `main`.
- **Conventional Commits** en inglés, breves, solo línea de asunto siempre que sea posible, atómicos. Ninguna herramienta de IA figura como coautora ni se menciona en commits o PRs. Lo verifican los hooks de `.githooks/` y de `.claude/settings.json`; `gitleaks` corre antes de cada commit. Cada PR usa la plantilla con la checklist de esta constitución.
- El repositorio es público bajo licencia MIT; nada personal ni sensible entra en él.
- **Spec Kit:** cada funcionalidad nace con `/speckit-specify` en `specs/NNN-<name>/` y se desarrolla en la rama `feature/NNN-<name>`; después `/speckit-plan`, `/speckit-tasks` y `/speckit-implement`. Los specs describen *qué* y *por qué*; el *cómo* va en el plan. Todo spec y plan se contrasta con esta constitución antes de implementar.
- **Decisiones de arquitectura** relevantes se registran como ADR en `docs/adr/`. Las decisiones pendientes se listan en `docs/specification.md` §14.
- **El asistente de código consulta al usuario** antes de instalar herramientas o dependencias y antes de hacer push.

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica o documento del proyecto. `CLAUDE.md` es la guía operativa diaria y DEBE mantenerse coherente con ella.
- Las enmiendas se hacen mediante `/speckit-constitution` o edición directa, siempre en una rama y mediante pull request, con el informe de sincronización actualizado en la cabecera.
- Versionado semántico: MAJOR para eliminar o redefinir principios, MINOR para añadir principios o secciones o ampliar materialmente una guía, PATCH para aclaraciones y redacción.
- Toda revisión de spec, plan o PR DEBE comprobar el cumplimiento de los principios I–VII. Cualquier complejidad que los contradiga debe justificarse por escrito o rechazarse.

**Version**: 1.2.0 | **Ratified**: 2026-08-30 | **Last Amended**: 2026-08-30
