# CLAUDE.md

Contexto del proyecto. No contiene tareas: las instrucciones llegan por conversación.

## Qué es esto

Aplicación personal de gestión de cartera de inversión, de un solo usuario, con horizonte de 20+ años. Registra operaciones, calcula la aportación mensual según pesos objetivo, hace seguimiento de una cuenta especulativa separada, y prepara los datos de la declaración de la Renta española.

**No ejecuta órdenes.** Todas las operaciones se hacen manualmente en las plataformas y se registran aquí.

Usuario: residente fiscal en España. Integraciones previstas: MyInvestor (extractos de fondos) e Interactive Brokers (Flex Query). El efectivo se registra a mano.

## Documentos

- `docs/specification.md` — especificación funcional y técnica completa. Es la referencia.
- `docs/business-rules.md` — reglas de dominio y mecánica fiscal española que la app implementa.

## Stack

| Capa | Elección |
|---|---|
| Frontend | SPA estática con Vite (Svelte o Solid), servida desde S3 vía CloudFront |
| Backend | Lambda con Function URL (no API Gateway) |
| Datos | DynamoDB, capacidad aprovisionada dentro del always-free |
| Auth | Cognito con MFA, un solo usuario. La Lambda valida el JWT |
| Programación | EventBridge Scheduler |
| Correo | SES |
| Secretos | SSM Parameter Store estándar (gratuito), no Secrets Manager |
| Infraestructura | Terraform |
| Dominio | Subdominio propio (valor en `terraform.tfvars`, fuera del repositorio), CNAME a CloudFront, certificado ACM en us-east-1 |

**Restricción de coste:** el proyecto debe permanecer dentro del always-free de AWS de forma indefinida. Antes de introducir un servicio nuevo, verificar que es gratuito a esta escala.

## Trampas de dominio

Errores que no se detectan hasta años después. Los detalles están en `docs/business-rules.md`.

1. **El traspaso entre fondos NO es una venta seguida de una compra.** Conserva la fecha de adquisición y el coste original. Modelarlo como venta+compra rompe la fiscalidad de forma silenciosa.
2. **Lotes, nunca posiciones agregadas.** La posición actual es una consulta derivada, no un campo almacenado. El FIFO exige el detalle lote a lote.
3. **Dinero en decimal, nunca en coma flotante.** Y las participaciones de fondos son fraccionarias con muchos decimales.
4. **Guardar siempre importe original, divisa y tipo de cambio del BCE de la fecha valor.** Convertir a euros y descartar el original pierde información que Hacienda exige.
5. **Ningún cálculo fiscal puede depender de precios de mercado.** Los precios son informativos. La fiscalidad sale exclusivamente del libro mayor.
6. **Los eventos corporativos son operaciones de primera clase**, con lógica propia de transformación de lotes. No parches manuales sobre la base de datos.
7. **El libro mayor propio es la fuente de verdad.** Los extractos de brókers sirven para conciliar, no para alimentar el sistema.

## Principios de diseño

- **Todo dato derivado debe ser recalculable** desde el libro mayor.
- **Nada codificado en el fuente que deba ser configurable**: umbrales, pesos objetivo, frecuencias, destinatarios.
- **Fallo seguro**: si una fuente de precios cae, mostrar el último valor conocido con su antigüedad marcada. Nunca interpolar ni estimar en silencio.
- **La entrada manual nunca se elimina.** La importación automática es comodidad; el sistema debe ser plenamente funcional sin ninguna fuente automática.
- **Compartimentación**: los cuatro libros (núcleo, oro, cripto, cubo) no se mezclan en cálculos ni métricas. El cubo aparece en el patrimonio total, pero nunca en el cálculo de pesos objetivo del núcleo.
- **Supervivencia a 20 años por encima de elegancia técnica**: pocas dependencias, formatos abiertos, datos exportables en cualquier momento.

## Convenciones de código

### Git

- **Git Flow**: `main` (producción), `develop` (integración), `feature/*`, `fix/*`, `release/*`, `hotfix/*`.
- **Pull requests obligatorias**. Sin push directo a `main` ni `develop`.
- **Conventional Commits**, mensajes breves, en imperativo y en español:
  - `feat(ledger): añadir evento de traspaso entre fondos`
  - `fix(fifo): corregir orden de lotes con misma fecha`
  - `test(tax): cubrir la regla de los dos meses`
- Commits atómicos: un cambio conceptual por commit.
- **Ninguna herramienta de IA puede figurar como coautora ni aparecer en los mensajes de commit, en el cuerpo, en el pie ni en las descripciones de PR.**

### Entornos

- `dev` (rama `develop`) y `prod` (rama `main`), con pilas de infraestructura completamente separadas y sufijo en todos los recursos.
- **Se construye una vez y se promociona.** El artefacto desplegado en producción es el mismo que se validó en dev.
- **Datos de producción jamás en dev.** Generador de datos sintéticos en el repositorio.

### Tests

Prioridad por orden de daño si fallan:

1. Motor FIFO y transformaciones de lotes por evento corporativo
2. Conversión de divisa por fecha valor
3. Regla de los dos meses
4. Cálculo de reparto de la aportación mensual
5. Parsers de extractos (tests de contrato con ficheros de ejemplo anonimizados versionados en el repositorio)

Casos límite obligatorios: varios lotes con la misma fecha, fracciones, contrasplit con liquidación en efectivo, recompra justo en el límite de los dos meses, traspaso parcial.

### Logging

| Nivel | Uso |
|---|---|
| `ERROR` | Requiere intervención: importación fallida, discrepancia de conciliación |
| `WARN` | Degradación: fuente de precios caída, precio obsoleto, umbral rozado |
| `INFO` | Eventos de negocio: operación registrada, aportación calculada, correo enviado |
| `DEBUG` | Detalle de ejecución, desactivado en producción |

- Logs estructurados en JSON con `request_id` para correlacionar entre Lambdas.
- **Nunca registrar importes, posiciones, saldos ni identificadores de cuenta.** CloudWatch está menos protegido que la base de datos.
- Retención: 30 días en producción, 7 en dev.

### Seguridad

- **Nunca almacenar credenciales de brókers.** El único secreto es el token Flex de IBKR, de solo lectura, en SSM Parameter Store como `SecureString`.
- S3 privado, servido solo vía CloudFront con Origin Access Control.
- IAM de mínimo privilegio: un rol por Lambda.
- **Sin analítica de terceros, sin CDN externos, sin fuentes remotas.** Todo desde el propio origen. CSP restrictiva.
- Validación siempre en el backend. El frontend es comodidad, no control de seguridad.
- Lockfile comprometido, `npm audit` en CI, presupuesto explícito de dependencias: cada paquete nuevo requiere justificación.

### Infraestructura

- Terraform para todos los recursos AWS. Nada creado a mano en la consola.
- Estado remoto en S3 con bloqueo.
- `terraform plan` en la PR, `apply` solo tras aprobación.

## Documentación

- ADRs para decisiones de arquitectura relevantes.
- El esquema de datos documentado en el repositorio, incluida la lógica de transformación de lotes de cada tipo de evento corporativo.
- Todo evento corporativo registrado guarda su fuente documental (URL o PDF del emisor).

## Fases

El orden importa: el modelo de datos de la Fase 1 debe soportar la Fase 5 desde el primer día.

0. Validación (accesos, formatos de extracto, viabilidad del scraping)
1. **Libro mayor** — modelo de datos, alta de operaciones, posiciones, FIFO, traspasos, eventos corporativos
2. Aportación mensual — reparto, desviaciones, umbrales
3. Cubo — tesis, posiciones abiertas, métricas frente a índice
4. Automatización — Lambdas programadas, correos, precios
5. Motor fiscal — FIFO consolidado, divisa, regla de los dos meses, salida agregada
