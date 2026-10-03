# Especificación de la feature: infraestructura como código (`017-infrastructure-as-code`)

**Rama**: `feature/017-infrastructure-as-code`, desde `develop` (`91ceabe`, con la 015 y la 016 enteras dentro).

**Creada**: 2026-10-03 (Europe/Madrid)

**Estado**: borrador, pendiente del visto bueno de la dirección (junto con `plan.md` y `questions.md`) antes de escribir código.

**Entrada**: `docs/prompts/017-infrastructure-as-code.md` entero, con sus respuestas de §12.1 (P1-P12) y las decisiones del usuario de §12.2 (B1-B7, N1-N6); ADR-0026 a ADR-0034 con sus notas (en especial la nota de ADR-0034 del 2026-10-03); `specs/015-api-access/plan.md` §10; `specs/016-scheduled-jobs/contracts/` (`iam-permissions.md`, `ssm-and-config.md`, `scheduler-event.md`) y `specs/016-scheduled-jobs/plan.md` §6; `docs/api.md` §8 y §9; `docs/data-schema.md` §1.

---

## Resumen

Hasta hoy, Atlas funciona entero en local y la nube está solo diseñada: dos ADR (0028, 0034) dicen cómo debe ser la cuenta de AWS compartida y dos features (015, 016) dejaron escritos, fila a fila, los permisos de cada Lambda. Esta feature escribe **la infraestructura que, cuando el usuario la aplique, pondrá Atlas en esa cuenta**, y la **verifica sin cuenta de AWS**. **No despliega nada**: el primer `apply` es de la 018, con el visto bueno del usuario y la estimación de coste delante.

Lo que se construye, en **cuatro entregas** (una rama y una PR por entrega, partición confirmada en `docs/prompts/017-infrastructure-as-code.md` §12 P12):

| Entrega | Qué deja escrito y verificado |
|---|---|
| **E1** | **El aislamiento y la cuenta**: forma de `infra/`, arnés de verificación sin desplegar, *bootstrap* (parte de la cuenta y parte de cada entorno), límite de permisos, roles de despliegue, de `plan` y de administración con su confianza, buckets del estado y de artefactos, presupuesto y etiqueta, recursos compartidos de la cuenta, `.gitignore` y la casilla de la plantilla de PR |
| **E2** | **Los datos y el borde**: bucket de datos con sus dos cerraduras, bucket de la SPA, CloudFront, certificado, WAF, Lambda de la API con su Function URL y su rol, parámetros `String` del correo, registros, política del rol de administración |
| **E3** | **Las tareas y el correo**: cinco Lambdas de tareas con su rol cada una, EventBridge Scheduler, política de SES, registros y concurrencia |
| **E4** | **Lo que corre fuera de Terraform**: `atlas admin secrets`, el guion del plan de tarifa plana, los flujos de GitHub Actions (verificación activa; `plan` y despliegues preparados e inactivos), la promoción del artefacto, la tabla de coste y los procedimientos |

Seis reglas atraviesan la feature:

1. **El aislamiento es código de políticas.** En una cuenta compartida, lo que separa `dev` de `prod` y a Atlas de los otros proyectos son las políticas que se escriben aquí. Entre `dev` y `prod` hay dos cerraduras independientes (identidad y recurso); frente a los otros proyectos, el límite de permisos de cada entorno. Cualquier hueco entre `dev` y `prod` impide dar la feature por terminada.
2. **Ni AWS, ni credenciales, ni `apply`.** Todo se verifica con `fmt`, `validate`, `terraform test` sobre un proveedor simulado y un análisis estático del `plan` renderizado. Lo que solo se comprueba contra AWS queda escrito como SIN VERIFICAR, con su fuente y la prueba de la 018.
3. **Nada personal en un fichero versionado**, y los registros de GitHub Actions son públicos: ni cuenta, ni dominio, ni dirección, ni sufijo de bucket. Solo el dominio, el destinatario y los demás valores personales de salida llevan `sensitive = true`; la cuenta no, para que un cambio de IAM siga viéndose en el `plan`.
4. **Los valores de los secretos nunca pasan por Terraform.** Los crea y rota una orden de la consola; Terraform solo referencia sus rutas, y los roles de `plan` y de despliegue no los alcanzan.
5. **Cada permiso es el de su contrato**, ni uno más ni uno menos; la infraestructura nunca amplía un contrato, y si no cuadra con el código o con otro contrato, es una pregunta.
6. **Coste mínimo, con lista cerrada.** Cada tipo de recurso entra en una tabla de coste con su fuente; un tipo fuera de la tabla rompe un test.

## Escenarios de usuario y pruebas

El "usuario" de esta feature es el propietario de Atlas como operador: quien revisa un `plan`, aplica el *bootstrap* a mano y despliega desde GitHub Actions. Todo se prueba **sin AWS**.

### Historia 1 — Un `dev` comprometido o equivocado no alcanza `prod` ni a los otros proyectos (Prioridad: P1, E1)

El propietario necesita que ningún rol de `dev` pueda leer, etiquetar o modificar un recurso de `prod`, y que ningún rol de Atlas salga de sus prefijos, de sus regiones o de IAM.

**Por qué esta prioridad**: es lo más caro de equivocarse y lo que ninguna cuenta tapa ya (ADR-0034, «Consecuencias»). Un error aquí es un fallo de Atlas contra los otros proyectos de la cuenta o de `dev` contra `prod`.

**Prueba independiente**: sobre el `plan` renderizado de la parte de cada entorno del *bootstrap*, una suite estática evalúa el límite de permisos, la política de cada rol y las confianzas; cada regla se ve fallar con un mutante.

**Escenarios de aceptación**:

1. **Dado** el rol de despliegue de `dev`, **cuando** intenta etiquetar o modificar la distribución de `prod`, **entonces** la política lo deniega (escenario 1 de ADR-0034, fila 5).
2. **Dado** el rol de despliegue de `dev`, **cuando** intenta cambiar la OAC o una política de CloudFront de `prod`, **entonces** no tiene ninguna acción de cambio sobre ellas (escenario 3).
3. **Dado** un recurso ajeno sin etiquetas, **entonces** se deniega donde el servicio permite expresarlo, y donde no, el hueco queda escrito con su motivo y no es un hueco entre `dev` y `prod` (escenario 2).
4. **Dado** cualquier rol que lleva el límite, **entonces** el límite deja pasar cada acción de sus contratos (con las excepciones escritas) y niega `organizations:*`, `account:*`, la facturación y las regiones distintas de `eu-west-1` y `us-east-1`.
5. **Dado** el rol de despliegue, **entonces** solo crea roles `atlas-<entorno>-*` con su límite puesto, no puede quitarlo ni tocar un rol del *bootstrap*, y no puede cambiar ni quitar las etiquetas `project` y `env` de un recurso que ya las lleva, aunque sí crear con `default_tags`.
6. **Dado** un rol de `dev` que nombra un ARN de `prod` o un patrón `atlas-*` que cubre los dos entornos, **entonces** el test falla.
7. **Dado** el rol de `plan` o el de despliegue, **entonces** no tienen `ssm:GetParameter*` ni `kms:Decrypt` sobre ningún secreto, ni `s3:GetObject`/`s3:PutObject` sobre el bucket de datos; el de `plan` solo lee la clave exacta de su estado y no escribe en el bucket del estado.
8. **Dado** el bucket del estado y el de artefactos, **entonces** sus políticas cierran `envs/<otro entorno>/*`, dejan escribir artefactos solo a `atlas-dev-deploy` y leerlos a los dos despliegues, y **nunca** dejan fuera al principal de administración del propietario.

### Historia 2 — Se revisa un `plan` sin cuenta y sin credenciales, y nada de lo personal llega a un registro público (Prioridad: P1, E1 con el arnés; cada entrega lo amplía)

El propietario o un agente ejecuta la verificación de `infra/` en local o en CI sin ninguna credencial; la salida es reproducible y cualquier regla incumplida la hace fallar.

**Por qué esta prioridad**: sin el arnés no se verifica ninguna otra historia; y la lista de datos personales que no pueden entrar en un repositorio público es la regla más fácil de romper en silencio.

**Prueba independiente**: el arnés corre sobre una raíz vacía y se ve fallar cada guardián con un módulo que lo incumple a propósito, empezando por el que comprueba que no hay credenciales de AWS en el entorno.

**Escenarios de aceptación**:

1. **Dado** `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` o `AWS_SESSION_TOKEN` en el entorno de la suite, **entonces** la suite falla antes de ejecutar nada.
2. **Dado** un `terraform.tfvars` y un `terraform.tfstate` creados en el árbol, **entonces** `git check-ignore` los ignora.
3. **Dado** un `output` con el dominio, el sufijo de un bucket o una dirección sin `sensitive = true`, o una variable que recibe un secreto, o un `SecureString` como recurso, **entonces** un test sobre el `plan` falla.
4. **Dado** un recurso etiquetable del `plan` sin `project`, `env` o `managed_by`, o de un tipo que no está en la lista cerrada de `cost.md`, **entonces** un test falla.
5. **Dado** un comodín en `Action` o `Resource` fuera de la lista cerrada, venga de una variable, de un `concat()`, de un `dynamic` o de un `for_each`, **entonces** el guardián falla, porque mira el `plan` renderizado y no el texto.
6. **Dado** una PR que toca `infra/bootstrap/`, **entonces** la plantilla de PR trae la casilla que exige decir qué partes se aplicaron a mano y cuándo, `dev` primero y `prod` después.

### Historia 3 — Cada Lambda tiene exactamente los permisos de su contrato (Prioridad: P1, E2 y E3)

La API, las cinco tareas, el rol de administración y el de Scheduler reciben exactamente las acciones, recursos y condiciones de `specs/015-api-access/plan.md` §10 y de `specs/016-scheduled-jobs/contracts/iam-permissions.md`, más lo que añadió ADR-0034.

**Por qué esta prioridad**: un permiso de más abre una vía (borrar objetos, escribir a otros destinatarios); uno de menos rompe la primera ejecución en la 018 sin que la 017 lo vea.

**Prueba independiente**: una tabla de permisos versionada (rol, acción, recurso, condición, fila del contrato) se compara con el `plan` renderizado acción a acción y recurso a recurso, y con las variables `ATLAS_*` que acepta el código de cada función.

**Escenarios de aceptación**:

1. **Dado** el rol de la API, **entonces** tiene `s3:ListBucket` con prefijos `ledger/`, `sync/devices/`, `reference/ecb/`, `prices/` y `access/`, `ssm:AddTagsToResource` sobre `device-tokens/*`, `logs:CreateLogStream` y `logs:PutLogEvents` sobre su propio grupo, y **nunca** `s3:DeleteObject*`, `ssm:DeleteParameter*` ni `ssm:LabelParameterVersion`.
2. **Dado** el rol de precios, **entonces** `prices/symbols.json` y `prices/config.json` tienen denegación explícita de escritura; **dado** el rol de correo, **entonces** solo él tiene `ses:SendEmail`, con las condiciones `ses:FromAddress`, `ses:ApiVersion`, `ses:Recipients` y `Null`, del mismo valor que escribe el parámetro del destinatario, y no alcanza `/atlas/<entorno>/prices/*`.
3. **Dado** el bucket de datos, **entonces** niega a todo principal ajeno a los roles de Atlas de su entorno las acciones de objeto y los listados (con la excepción de `s3:ListBucket` para el despliegue y el `plan`, solo acciones de bucket), niega `backups/*` sin `If-None-Match` y es versionado, cifrado con SSE-S3, solo TLS y nunca origen de CloudFront.
4. **Dado** la Function URL, **entonces** su tipo de autorización es `AWS_IAM`; el permiso y la política del bucket de la SPA se condicionan con `AWS:SourceArn`, nunca `AWS:SourceAccount`.
5. **Dado** cada función, **entonces** sus variables `ATLAS_*` son exactamente las que acepta su analizador, `ATLAS_JOB_MAX_RUN_SECONDS` iguala al `timeout`, y las programaciones llevan el `Input`, la hora, la zona y los reintentos de sus contratos, **desactivadas en `dev`**.
6. **Dado** `prod`, **entonces** no lleva `ATLAS_PRICE_SOURCES=simulated`; **dado** `dev`, **entonces** no lleva las claves de precios.

### Historia 4 — El borde sirve la SPA y la API sin pisar su seguridad, y `dev` duerme (Prioridad: P2, E2)

Una distribución por entorno, con certificado, WAF y función de CSP propios; `dev` desactivada salvo que `dev_active` lo diga desde el pipeline.

**Por qué esta prioridad**: depende de E1 y es la superficie pública, pero se puede probar entera sobre el `plan`.

**Prueba independiente**: `run` de `terraform test` por cada salida de C11 (dos o más planes Free libres, uno, ninguno) y para los dos entornos.

**Escenarios de aceptación**:

1. **Dado** `dev_active` falsa (por defecto), **entonces** la distribución de `dev` tiene `enabled = false`; `dev_active` es la única palanca.
2. **Dado** `/api/*`, **entonces** usa `CachingDisabled` y una política de solicitud al origen que reenvía las cuatro cabeceras de `docs/api.md` §8 y `x-amz-content-sha256`.
3. **Dado** la CSP de la función, **entonces** iguala directiva a directiva la de la `<meta>` de `apps/web/index.html` más `frame-ancestors 'none'`, y no pisa la que pone la Lambda en sus páginas (la `sandbox`).
4. **Dado** la salida sin plan Free para `dev`, **entonces** no hay WAF en `dev`; **dado** la salida con plan, **entonces** hay una regla de ritmo por IP sobre `/api/*`.
5. **Dado** la SPA, **entonces** no se sirve `dist/.vite/` ni los `*.map`.

### Historia 5 — Los secretos los crea una orden con salvaguardas, y el despliegue promociona el mismo artefacto (Prioridad: P2, E4)

`atlas admin secrets` crea y rota todo `SecureString` de `/atlas/<entorno>/` salvo los registros de tokens; los flujos de CI verifican, planifican y despliegan sin volcar valores.

**Por qué esta prioridad**: cierra el ciclo y es lo último que depende de los nombres de E1-E3; los flujos del `plan` y los despliegues quedan inertes hasta la 018.

**Prueba independiente**: dobles de SSM y un `aws` simulado delante en el `PATH` con las órdenes recibidas afirmadas una a una; un test que lee los flujos.

**Escenarios de aceptación**:

1. **Dado** `atlas admin secrets`, **entonces** pide cada valor sin eco, nunca lo acepta por argumento ni por variable de entorno, rechaza `--yes`, exige teclear el entorno para sobrescribir, sale sin tocar nada sin terminal, etiqueta con `project`, `env` y `managed_by`, y no imprime ni registra ningún valor, tampoco en un camino de fallo.
2. **Dado** el flujo de `plan`, **entonces** no declara `environment:`, corre con `-lock=false`, no ejecuta `npm ci`, no vuelca valores y no sube el `plan` como artefacto.
3. **Dado** los flujos de despliegue, **entonces** `dev` despliega desde `develop`, `prod` solo desde `main` y el *environment* `prod`, el artefacto de `prod` es el mismo, por SHA-256, que escribió el despliegue de `dev`, y la salida de `terraform` va a un fichero que no se sube.
4. **Dado** el guion del plan de tarifa plana, **entonces** es idempotente, se niega con tres planes Free ya usados y solo cancela con el entorno tecleado.
5. **Dado** cada procedimiento de `specs/017-infrastructure-as-code/runbooks/`, **entonces** cada paso es ejecutable en el estado que deja el anterior, recorrido contra el `aws` simulado.

### Casos límite

- El proveedor simulado devuelve JSON inventado para `aws_iam_policy_document`: las políticas se escriben con `jsonencode()` o se sustituyen con `override_data`, y el test lo comprueba sobre el `plan` real renderizado.
- `prevent_destroy` puede no aparecer en `terraform show -json`: su test lee el HCL de forma estática, y todo `run` que toque un recurso protegido usa `command = plan`.
- Un recurso de ámbito de cuenta que puede existir ya (proveedor OIDC, analizador de accesos, identidades de SES): una variable explícita elige «usar» o «crear», nunca un `try()`; los creados llevan `prevent_destroy`.
- La denegación de una cerradura deja fuera a quien tiene que arreglarla: el principal de administración nunca queda excluido de los buckets del estado y de artefactos, y el despliegue y la administración nunca quedan fuera de la configuración del bucket de datos.
- Un cambio de IAM invisible en el `plan` por un valor `sensitive`: ningún valor que entre en una política lo lleva, salvo el destinatario.
- El `sub` de OIDC de una PR no lleva la rama de destino: cualquier rama del repositorio asume el rol de `plan`, de ahí sus límites (solo lectura, sin secretos, sin escritura en el estado).
- La etiqueta de costes tarda hasta 24 horas en aparecer: su activación es una segunda pasada del *bootstrap* de la cuenta, apagada por defecto.
- Un test, un guion o un flujo que llega a AWS por error: el guardián de credenciales lo impide.

## Requisitos

### Requisitos funcionales

- **FR-001**: La infraestructura MUST estar escrita en Terraform bajo `infra/`, con un *bootstrap* de la cuenta, un *bootstrap* por entorno, un módulo de la pila de un entorno y una raíz por entorno, y estado local fuera del repositorio para el *bootstrap*.
- **FR-002**: Cada rol de Atlas MUST llevar el límite de permisos de su entorno, que acota recursos por prefijo, regiones (`eu-west-1` y `us-east-1`) y acciones de IAM, con las excepciones escritas y cruzadas por test con la política de todo rol que lo lleva.
- **FR-003**: Los roles de despliegue, de `plan` y de administración MUST cumplir las filas 5, 14, 16 y 21 de ADR-0034 y las decisiones B1, B2, B4 y B6 de §12.2 del prompt.
- **FR-004**: Los buckets del estado, de artefactos, de datos y de la SPA MUST cumplir sus políticas (dos cerraduras, versionado `Enabled`, SSE-S3, solo TLS, Block Public Access, `force_destroy = false`, `prevent_destroy` donde corresponde).
- **FR-005**: Cada Lambda (API y cinco tareas) MUST tener exactamente los permisos, variables `ATLAS_*`, memoria, `timeout`, concurrencia y grupo de registros de sus contratos.
- **FR-006**: CloudFront, certificado, WAF, función de CSP, Function URL con `AWS_IAM` y bucket de la SPA MUST cumplir ADR-0028 y las filas 17 a 19 de ADR-0034, con `dev_active` como única palanca de `dev`.
- **FR-007**: EventBridge Scheduler MUST crear un grupo etiquetado y una programación por función, con el `Input`, la hora, la zona y los reintentos del contrato, desactivadas en `dev`, y un rol de Scheduler con confianza condicionada por `aws:SourceArn`.
- **FR-008**: El presupuesto `atlas-cost`, la activación de la etiqueta y los recursos compartidos de la cuenta MUST crearse en la parte de la cuenta con las variables y protecciones de ADR-0034 (filas 9, 11, 12, 14 y 20).
- **FR-009**: Ningún valor de secreto MUST pasar por Terraform ni por su estado; `atlas admin secrets` MUST crear y rotar los `SecureString` con las reglas de §E4 del prompt.
- **FR-010**: Los flujos de GitHub Actions MUST verificar `infra/` en toda PR sin credenciales, y el `plan` y los despliegues MUST quedar escritos, con permisos mínimos y acciones fijadas por SHA, inactivos e inertes hasta la 018.
- **FR-011**: Un guion idempotente MUST gestionar el plan de tarifa plana de CloudFront por entorno, con su condición de retirada escrita.
- **FR-012**: `.gitignore` MUST ignorar `*.tfvars` (salvo `*.tfvars.example`), `*.tfstate*`, `.terraform/` y los planes guardados, y la plantilla de PR MUST llevar la casilla del *bootstrap*.
- **FR-013**: Cada variable de entrada MUST validarse (entorno, región, sufijo, dirección, cuenta) y las que son datos personales MUST llevar `sensitive = true`, salvo la cuenta.
- **FR-014**: La verificación MUST ejecutarse sin credenciales: `terraform fmt -check`, `init -backend=false`, `validate`, `terraform test` con proveedor simulado y una suite estática sobre el `plan` renderizado, con un guardián que falla si hay credenciales de AWS en el entorno.
- **FR-015**: Todo lo que solo se compruebe contra AWS MUST quedar marcado como SIN VERIFICAR para la 018, con su fuente y su prueba, y la tabla de coste (`cost.md`) MUST ser una lista cerrada de tipos de recurso, con la suma en el orden de 0,01 a 0,05 $ al mes.
- **FR-016**: Cada afirmación de seguridad MUST tener un test visto fallar con su mutante.

### Entidades clave

- **Parte del *bootstrap* de la cuenta**: lo que no es de ningún entorno (estado, artefactos, presupuesto, etiqueta, recursos compartidos).
- **Parte del *bootstrap* de un entorno**: límite de permisos, roles de despliegue, `plan` y administración, OAC y, solo con C2, la clave KMS.
- **Pila de un entorno**: datos, SPA, borde, Lambdas, Scheduler, registros y parámetros.
- **Tabla de permisos**: por rol, acción, recurso, condición y fila del contrato; fuente de verdad de los tests.
- **Matriz de salidas de comprobaciones**: para cada salida de C2, C5, C9, C11, C12, C13/C19 y C3, la variable que la elige y el `run` que la cubre.
- **`cost.md`**: lista cerrada de tipos de recurso con coste y fuente.

## Criterios de éxito

### Resultados medibles

- **SC-001**: Los tres escenarios de ADR-0034, fila 5, se resuelven por análisis estático: 1 y 3 denegados, 2 denegado o con su hueco escrito, y **cero huecos entre `dev` y `prod`**.
- **SC-002**: Cada rol coincide con su tabla de permisos acción a acción: cero diferencias en el test de comparación.
- **SC-003**: `fmt`, `validate` y `terraform test` en verde en las cuatro raíces, con un `run` por cada salida de la matriz y para los dos entornos, ejecutados sin credenciales y sin ninguna llamada de red salvo la del registro de HashiCorp en `init`.
- **SC-004**: Cada uno de los 55 mutantes del prompt (§10) muere por un test visto morir.
- **SC-005**: La suma de `cost.md` queda entre 0,01 y 0,05 $ al mes; cero tipos de recurso fuera de la lista.
- **SC-006**: Cero ficheros versionados con datos personales; `gitleaks` limpio; cero secretos en el `plan` y en el estado simulado.
- **SC-007**: La autocomprobación de las diecisiete familias de §9 del prompt (siete heredadas de la 016 y diez nuevas, numeradas 11 a 20) está pasada y escrita en `questions.md` en cada entrega.
- **SC-008**: Cero `apply`, cero llamadas a AWS y cero credenciales en todo el historial de la rama.

## Supuestos

- Terraform está instalado en la máquina (`/home/ubuntu/.local/bin/terraform`, v1.16.5, comprobado el 2026-10-03), lo que resuelve en lo esencial la P1; **la versión exacta del proveedor `hashicorp/aws` y la de `setup-terraform` las fija el plan**, y su fila en `docs/dependencies.md` la escribe la dirección.
- Ningún analizador estático se instala (§12 P2); los guardianes son tests de `vitest` bajo `infra/test/`, sin dependencias nuevas.
- Los contratos de la 015 y la 016 son correctos; si un contrato no cuadra con el código, es una pregunta.
- `atlas admin secrets` es el único cambio de código de aplicación (apps/cli); si toca el dominio, cobertura 100 %.
- El cierre documental de la 016 puede no estar aplicado: los contratos se leen de `specs/016-scheduled-jobs/contracts/`.

## Fuera de alcance

- Todo `apply`, toda llamada a AWS y toda credencial (018 y 019); las comprobaciones C1-C19; los pasos manuales del usuario (cliente OAuth, identidades de SES, DNS, cuota de concurrencia); activar el `plan` y los despliegues en CI; cambiar el esquema del libro, `docs/api.md` o un contrato de permisos; aceptar una ADR; proteger `backups/` con Object Lock.
