<!--
Sync Impact Report
- Version change: 1.6.1 → 1.6.2
- Modified principles: none
- Modified sections: Restricciones técnicas (Plataforma: the exceptions to "nothing created by hand" are declared in ADR-0028 and ADR-0034, the latter adding the bootstrap inside the shared account and the secrets script. ADR-0034, accepted 2026-09-25)
- Version bump rationale: PATCH, a citation of where already-allowed exceptions are written; no principle added, removed or re-scoped
- Added sections: none
- Removed sections: none
- Templates requiring updates: none
- Follow-up TODOs: advisor answers in docs/fiscal-questions.md may change Settings defaults, not this document.
- Previous: 1.6.0 → 1.6.1 (2026-09-25) clarified in Restricciones técnicas (Seguridad) where the console's device tokens live (ADR-0033); 1.5.0 → 1.6.0 (2026-09-24) re-scoped IV (configuration outside the ledger) and VI (minimum cost with a budget alarm), and amended Restricciones técnicas for ADR-0027, ADR-0028 and ADR-0031.
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
- El dinero se representa en decimal, nunca en coma flotante. Se guardan siempre importe original, divisa y el tipo del BCE **tal cual se publica** (con su fecha) de la **fecha fiscal**, que depende del tipo de activo y es configurable (ADR-0013).
- Anular un evento que otros eventos ya consumieron se **rechaza**: primero se rectifica lo que dependía de él (ADR-0003, hallazgo 3 del *challenge*).

*Razón:* estos son los errores que no se detectan hasta la primera declaración de la Renta con ventas, años después, y entonces cuestan dinero.

### III. Compartimentación estricta

- Dos libros (`book`): `core` (cartera principal: `equity`, `fixed_income`, `gold`, `crypto`) y `bucket` (cubo especulativo).
- Núcleo y cubo NUNCA se mezclan en un cálculo, vista o métrica. El cubo es un presupuesto (porcentaje de la aportación), no una asignación; no entra en los pesos objetivo.
- El patrimonio total siempre se muestra desglosado. Nunca un único número sin descomponer.
- La compartimentación es de **gestión** (pesos, métricas, vistas, presupuesto). Solo dos excepciones, acotadas y escritas:
  1. La **salida fiscal** y los umbrales informativos (Modelos 720/721) agregan los dos libros **por contribuyente**, siempre etiquetados como total fiscal, nunca como métrica de cartera.
  2. El **patrimonio total** y el **peso del cubo sobre él** (regla 18, regla de recogida) suman los dos libros como **control de presupuesto**, siempre desglosados y sin alimentar ningún peso objetivo.
  Ninguna otra vista, métrica o cálculo los mezcla.
- No se puede registrar una compra en el cubo sin una tesis (`Thesis`) creada antes.

*Razón:* las reglas de conducta del plan de inversión solo sirven si el sistema las hace imposibles de saltar.

### IV. Nada codificado que deba ser configurable

- **Lo configurable nunca se escribe en el código.**
- **Vive en `Settings`** la configuración que afecta a cifras del libro —umbrales, pesos objetivo, frecuencias, tipos impositivos, criterios fiscales y residencia fiscal—, con historial de cambios y validación.
- **Vive fuera del libro** —en SSM Parameter Store en la nube, o en configuración local fuera del repositorio— la configuración que es **dato personal o secreto** (destinatario del correo, lista permitida de acceso, claves) y la **configuración operativa que ninguna cifra lee** (las fuentes de precios con su orden y su presupuesto, el correo y su interruptor de importes). ADR-0027, ADR-0028, ADR-0031; enmienda 1.6.0.
- Un campo nuevo en un evento que guarda el estado completo (`settings_changed`, `*_updated`) sigue la enmienda de ADR-0018: o va fuera del libro o sube `schema_version`.
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
- Cero servicios de pago de terceros en el camino crítico. **Coste mínimo, con alarma de presupuesto** (ADR-0028, Ronda 8, 2026-09-24): sustituye a "coste indefinidamente dentro del *always-free* de AWS", porque la capa en la nube se apoya en créditos que se acaban; cuando se agoten, la cuenta paga el coste mínimo estimado y Budgets avisa si se sale de lo previsto.
- Prueba de restauración anual desde el backup.
- El esquema de datos y la lógica de transformación de lotes se documentan en el repositorio.

*Razón:* la cartera mediocre mantenida 30 años bate a la óptima abandonada en dos. Lo mismo vale para el software que la gestiona.

### VII. Tests primero donde un error cuesta dinero

- Prioridad por daño si fallan: motor FIFO y transformaciones de lotes, conversión de divisa por fecha valor, regla de los dos meses, reparto de la aportación mensual, parsers de extractos.
- Casos límite obligatorios: varios lotes con la misma fecha, fracciones, contrasplit con liquidación en efectivo **en dos cuentas**, recompra en el límite de la ventana, traspaso parcial, anulación de una compra ya vendida (rechazo), venta el 30/12 con liquidación el 02/01, pérdida en fondo seguida de aportación mensual dentro del año, pérdida diferida cuyos lotes se traspasan o canjean antes de liberarse (el diferimiento viaja con los lotes descendientes).
- Los parsers tienen tests de contrato contra ficheros de ejemplo anonimizados versionados en el repositorio.
- `packages/domain` mantiene **cobertura del 100% de líneas y ramas**, bloqueante en CI. Fuera del dominio no hay umbral numérico: mandan los tests de contrato e integración.
- Ninguna funcionalidad del motor fiscal se da por terminada sin sus tests.

*Razón:* un error silencioso en la fiscalidad no se detecta hasta años después y no tiene vuelta atrás.

## Restricciones técnicas

- **Plataforma:** AWS con **coste mínimo y alarma de presupuesto** (ADR-0028), no dentro del *always-free* indefinidamente (S3 + CloudFront, Lambda con Function URL, S3 versionado como único almacén de datos, **acceso solo con Google verificado en la Lambda, sin Cognito** (ADR-0027), EventBridge Scheduler, SES, SSM Parameter Store). TypeScript en todo el código, con el dominio en un paquete compartido (ADR-0001, ADR-0002). Terraform para todo; nada creado a mano, **salvo las excepciones declaradas en ADR-0028 y ADR-0034 (*bootstrap* de la cuenta compartida y guion de los secretos), cada una con su condición de retirada**. Antes de introducir un servicio nuevo, verificar que su coste es mínimo a esta escala.
- **Seguridad:** nunca credenciales de brókers. Secretos en SSM Parameter Store como `SecureString`: el token Flex de IBKR (solo lectura) y el secreto del cliente OAuth de Google y la clave de sesión (ADR-0027). Las claves de las fuentes de precios (ADR-0031): en local, en un fichero de configuración fuera del repositorio; en la nube, en SSM. El registro de los tokens de dispositivo de la consola (ADR-0033): en SSM, un `SecureString` por token con solo el hash del secreto; en local, el token vive en un fichero de credenciales fuera del repositorio y de la carpeta del libro, que solo escribe la consola. Sin analítica ni CDN de terceros; CSP restrictiva. Validación siempre en el backend. IAM de mínimo privilegio, un rol por Lambda.
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

**Version**: 1.6.2 | **Ratified**: 2026-08-30 | **Last Amended**: 2026-09-25
