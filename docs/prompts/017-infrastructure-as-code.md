# Prompt 017 — Feature `017-infrastructure-as-code`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/017-infrastructure-as-code.md`.
>
> **Requisito previo, ya cumplido.** La 015 (API y acceso) y la 016 (tareas programadas y correo) están **fusionadas enteras en `develop`**: la 016, con la PR #109 (`4a3f73e`). ADR-0034 (la cuenta compartida) está **aceptada** desde el 2026-09-25. **El cierre documental de la 016 puede no estar aplicado** cuando empieces: la hoja de ruta todavía la da «en implementación» y los contratos que usas viven en `specs/016-scheduled-jobs/contracts/`. **Lee los contratos de la 016 de ahí**, y si entretanto la dirección los traslada a `docs/`, manda lo de `docs/`.
>
> **Esta feature abre la etapa 3 de la Ronda 8 sin desplegar nada.** Escribes **toda la infraestructura en Terraform** (`infra/`), **el guion de los secretos**, **el guion del plan de tarifa plana de CloudFront**, **los flujos de GitHub Actions** con OIDC y **la casilla de la plantilla de PR** que exige volver a aplicar el *bootstrap*; y la verificas **sin cuenta de AWS**: `terraform fmt`, `validate`, `plan` contra un proveedor simulado y un análisis estático de cada política. **Ni `terraform apply`, ni una llamada a AWS, ni credenciales de AWS en ninguna parte, ni un céntimo.** El primer `apply` es de la 018, y **cualquier `apply` necesita el visto bueno del usuario con la estimación de coste de §7 delante** (`docs/decision-roadmap.md`, «Etapas pendientes», 018; ADR-0034, fila 20).
>
> **Este prompt propone partirla en cuatro entregas**, una rama y una PR por entrega, como la 015 y la 016 (§3).
>
> **Hay preguntas abiertas para la dirección en §13**, cada una con la recomendación de quien redacta. **La P1 (instalar Terraform) bloquea el primer commit de código**: sin la herramienta no se verifica nada. Hasta que la dirección y el usuario la contesten puedes hacer el `spec.md`, el `plan.md` y el bloque 0 de E1, que solo leen documentación.
>
> **Novedad de método:** §9 añade a la autocomprobación de la 016 **diez familias propias de la infraestructura como código** (comodines en IAM, recursos sin etiquetas, secretos en el estado, `prevent_destroy`, deriva…). La pasas entera antes de pedir cada revisión.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/personal/atlas/atlas-portfolio-tracker`). **Eres un implementador nuevo**: no llevas contexto de la 015 ni de la 016, y no se te pasa nada más que este documento y el repositorio (§2 quater). Vas a escribir **la infraestructura que, cuando el usuario la aplique, pondrá Atlas en una cuenta de AWS que comparte con otros proyectos**. En esa cuenta, **el aislamiento no lo da la cuenta, sino las políticas que escribes tú** (ADR-0034, «Consecuencias»). Una política demasiado ancha dejaría a `dev` leer los datos de `prod`, o a Atlas tocar los recursos de otro proyecto. Un recurso mal elegido rompería la alarma de coste. Y un valor mal marcado acabaría en el registro público de GitHub Actions. **Lo primero que construyes, en cada entrega, son los tests que demuestran que nada de eso pasa.**

## 0. Siete cosas que tienes que entender antes de leer nada más

**No hay cuenta.** Esta feature escribe y verifica; **no despliega**. Todo se comprueba sin AWS: con `terraform validate`, con `terraform test` sobre un proveedor simulado y con un análisis estático de las políticas renderizadas. Lo que solo se puede comprobar contra AWS de verdad **no se da por bueno**: se escribe como **SIN VERIFICAR, para la 018**, con su fuente y con la prueba que lo cerrará (§6). Ningún test, ningún guion y ningún flujo de esta feature puede llegar a AWS, ni por error: **el entorno de las pruebas no tiene credenciales**, y un guardián lo comprueba (§4).

**El aislamiento es código de políticas** (ADR-0034, «Consecuencias»: «un error en el límite de permisos o en la política del bucket ya no lo tapa ninguna cuenta»). Entre `dev` y `prod` hay **dos cerraduras independientes** que tendrían que fallar a la vez: la política de identidad de cada rol, que solo nombra ARN de su entorno, y la política del recurso, que niega todo lo que no sea de su entorno (ADR-0034, filas 6, 7 y 15). Frente a los otros proyectos de la cuenta, el **límite de permisos** de cada entorno (fila 4). **Cualquier hueco entre `dev` y `prod` para la feature** hasta que se cierre (fila 5).

**El repositorio es público, y los registros de GitHub Actions también** (ADR-0034, fila 1). Ni el identificador de la cuenta, ni el dominio, ni una dirección de correo, ni el sufijo de los buckets entran en un fichero versionado. Viven en `terraform.tfvars`, fuera del repositorio (`~/personal/atlas/privado/terraform/<entorno>/terraform.tfvars`; ADR-0034, nota del 2026-09-26). **Solo el dominio y el destinatario llevan `sensitive = true`**, y la cuenta no, para que un cambio de IAM siga viéndose en el `plan`. Por eso **el `plan` nunca se vuelca entero en un registro** (fila 1).

**Los valores de los secretos nunca pasan por Terraform** (ADR-0034, fila 21). Ningún `SecureString` es un recurso de Terraform, ni con un valor de relleno. Terraform solo **referencia sus ARN por ruta** en las políticas. **Los roles de `plan` y de despliegue no alcanzan ningún secreto**, porque el `sub` de OIDC de un `pull_request` no lleva la rama de destino y cualquier rama del repositorio puede asumir el rol de `plan`. Los secretos los crea y los rota **el guion de los secretos**, con el rol de administración. **Los únicos parámetros que escribe Terraform son dos `String`**: el destinatario del correo y el interruptor de importes, desde `terraform.tfvars` (ADR-0034, fila 12; `specs/016-scheduled-jobs/contracts/ssm-and-config.md` §1).

**Un recurso mal elegido rompe la alarma.** Todo Atlas cuesta **≈ 0,01-0,05 $ al mes** y la alarma `atlas-cost` salta a **1 $** (ADR-0028, fila 9; ADR-0034, fila 9). Una sola pieza de pago la rompe cada mes: una *web ACL* de WAF que no esté cubierta por el plan de tarifa plana (**7-8 $ al mes**, ADR-0028, opción 3), una clave KMS del cliente (**1 $ al mes**, ADR-0034, opción 2) o un segundo *trail* (fila 10). **Cada recurso entra en la tabla de coste de §7 con su fuente**, y la tabla es lo que el usuario tendrá delante antes del primer `apply`.

**Lo que crea el *bootstrap* no lo puede cambiar el despliegue**, y el *bootstrap* **se vuelve a aplicar a mano** cada vez que cambia: la parte de la cuenta si ha cambiado, **primero `dev`**, y **`prod` solo cuando `dev` funciona** (ADR-0034, filas 5 y 20). La casilla de la plantilla de PR lo exige, y **forma parte de la definición de terminado** de esta feature.

**La infraestructura cumple contratos que escribieron otros.** Los permisos de cada Lambda ya están escritos: los de la API, en `specs/015-api-access/plan.md` §10, más lo que añadieron la hoja de ruta y la 016; los de las cinco tareas y el rol de administración, en `specs/016-scheduled-jobs/contracts/iam-permissions.md`. Los parámetros y las variables `ATLAS_*` están en `docs/api.md` §9 y en `specs/016-scheduled-jobs/contracts/ssm-and-config.md`, y los eventos de Scheduler en `specs/016-scheduled-jobs/contracts/scheduler-event.md`. **Tu política no concede ni una acción más ni una menos que el contrato**, y un test lo compara fila a fila (§4). Donde el contrato no cuadre con el código o con otro contrato, **no lo resuelves**: va a `questions.md`.

## 1. Lee antes de hacer nada, en este orden

1. **`CLAUDE.md` entero.** Te afectan de lleno: las tablas *Stack* (*Scheduling*, *Email*, *Secrets*, *Infrastructure*, *Domain*) y *Security*; *Environments* (`dev` en reposo); *Infrastructure* (las excepciones a «nada creado a mano»); *Logging* (retención de 30 y 7 días; qué no se registra nunca); *Where things live* (los ficheros locales de Terraform); y *Working on a feature*.
2. **`.specify/memory/constitution.md` 1.6.2**: **VI** (pocas dependencias; coste mínimo con alarma de presupuesto) y «Restricciones técnicas» (Plataforma, con las excepciones de ADR-0028 y ADR-0034; Seguridad; Privacidad; Entornos: se construye una vez y se promociona, y los datos de producción jamás en `dev`).
3. **Las ADR 0026 a 0034**, con sus enmiendas y sus notas. **ADR-0028 y ADR-0034, enteras y dos veces**:
   - **ADR-0028**: las filas que siguen en pie (4 a 8, 11, 13 salvo lo de las cuentas, 14 a 16, 18 a 20); el bloque «Terraform» (construir una vez y promocionar); la «Revisión del plazo de las versiones»; las excepciones escritas (el guion del plan de tarifa plana, **cuya PR del proveedor te toca localizar**); la nota de ADR-0033 (permisos del rol de la API en SSM, la política de origen, la CSP que no pisa la `sandbox`, las cabeceras fuera de los registros del WAF); y la nota del 2026-09-25, con lo que ADR-0034 sustituye.
   - **ADR-0034, las veintiuna filas**, la opción 2 (la clave del cliente, **solo si C2 la exige**), «Riesgo que queda», las comprobaciones **C1-C19** (las hace el usuario antes de la 018; **tú diseñas para todas sus salidas**, §3), «Consecuencias», las fuentes F1-F15 y las tres notas (dónde viven los ficheros locales; los parámetros de los tokens, creados etiquetados; el *root* y el MFA del rol de administración).
   - **ADR-0033**: los puntos 1 (el identificador del token), 9 (el registro en SSM: permisos sin `DeleteParameter` ni `LabelParameterVersion`) y 10 (la cabecera fuera de los registros), «Consecuencias» (lo que es de la 017), sus fuentes F6, F7, F8 y F18, y sus notas.
   - **ADR-0027**: los dos hechos de CloudFront (OAC sobrescribe `Authorization`; `POST` y `PUT` con `x-amz-content-sha256`) y la nota del 2026-09-25 (los secretos que ya no crea Terraform).
   - **ADR-0032**: la nota del 2026-09-25 (el ensayo de la 018 **destruye `dev`**, lo que pesa en `prevent_destroy`, §13 P8).
   - **ADR-0026**, Parte A (la API solo añade; IAM no puede expresar «solo añadir», lo impone el código y lo hace reversible el versionado); **ADR-0029**, la concurrencia 1 de la tarea del BCE; **ADR-0031**, «Claves de API» y «Una sola clave, un solo presupuesto diario»; **ADR-0006**, el plazo de las versiones no vigentes.
4. **`docs/decision-roadmap.md`**: la Ronda 8 entera, con su lista de **SIN VERIFICAR**; la entrada de la **017** en «Plan por etapas»; y en «Etapas pendientes», **017** (lo que hereda), **«Lo que la 015 le deja a la 017»** y **018** (lo que se prueba en real, que tu diseño tiene que dejar posible).
5. **`docs/api.md`**: §1 (registros), §2 (credenciales y cabeceras), §5.4 (`x-atlas-expected-device`), **§8** (la fila de la 017: la política de origen y la CSP) y **§9** (parámetros de SSM y variables de la Lambda de la API).
6. **Los contratos de permisos y de configuración**:
   - `specs/015-api-access/plan.md` **§10** (las acciones de la Lambda de la API y del rol de administración);
   - `specs/016-scheduled-jobs/contracts/iam-permissions.md` **entero** (las cinco funciones, lo que la 016 añade a la API y al rol de administración, las políticas de `backups/*` y las condiciones de SES);
   - `specs/016-scheduled-jobs/contracts/ssm-and-config.md` y `scheduler-event.md`;
   - `specs/016-scheduled-jobs/plan.md` §6 (las horas de las programaciones, en `Europe/Madrid`, y sus reintentos);
   - `specs/016-scheduled-jobs/questions.md` §1 (el bloque 0 de E1 de la 016: SES, Scheduler, reintentos de Lambda, KMS con `aws/ssm`), §9 (las decisiones de la dirección sobre esos permisos) y §20.8 (lo que la 016 deja a la 017 y a la 018).
7. **`docs/specification.md`** §9.2 a §9.4 (componentes, costes, la trampa del Free Plan), §10, §11.3, §11.4, §11.6 (CI/CD), §11.7 y §11.8; y **`docs/data-schema.md` §1** (los prefijos del bucket de datos, las retenciones y los dos buckets).
8. **`docs/prompts/016-scheduled-jobs.md`**: §2 bis a §2 quater (las reglas de operación, las lecciones y el método) y **§5 entero** (las diez familias de la autocomprobación, que §9 de este prompt amplía). Y los procedimientos que tu infraestructura tiene que hacer posibles: `docs/runbooks/` y `specs/016-scheduled-jobs/runbooks/` (sobre todo `mail-recipient-and-amounts.md` y `cloud-symbols-and-budgets.md`, que **proponen nombres de variables de Terraform que tú fijas**).
9. **El código. Lo que este prompt afirma de él está comprobado sobre `develop` (`4a3f73e`) el 2026-09-28; compruébalo tú otra vez antes de apoyarte en ello.**
   - **No existe `infra/`**, ni ningún fichero de Terraform, ni ninguna regla de `.gitignore` para `*.tfvars`, `*.tfstate` o `.terraform/`.
   - **Los artefactos que despliegas** ya los construye `npm run build`, una vez y de forma determinista: `apps/api/dist-lambda/lambda.zip` y `apps/jobs/dist-lambda/jobs.zip`, cada uno con un solo `index.mjs`, manejador `index.handler`, Node 22 y ESM (`apps/api/scripts/build-lambda.mjs`, `apps/jobs/scripts/build-lambda.mjs`). La SPA, en `apps/web/dist/`.
   - **La configuración que lee cada Lambda la valida el propio código**: una variable `ATLAS_*` desconocida, o un valor que no se entiende, **impide arrancar** (`docs/api.md` §9; `ssm-and-config.md` §2). **Terraform tiene que poner exactamente las que acepta cada función**, ni una más.
   - **La CSP de la web** vive en una etiqueta `<meta>` de `apps/web/index.html`, que no puede llevar `frame-ancestors`; el comentario de ese fichero ya dice que va en una cabecera de CloudFront (ADR-0028, fila 14).
   - **Las páginas propias de la Lambda** (`/api/…`) ponen **su propia CSP**, y dos de ellas llevan `sandbox` (`apps/api/src/respond.ts`; `specs/015-api-access/contracts/api-routes.md`, §D).
   - **La CI** (`.github/workflows/ci.yml`) usa solo `actions/checkout`, `actions/setup-node` y `actions/upload-artifact`, sin credenciales ni `id-token`.
   - **En la máquina no hay `terraform`, ni `aws`, ni `tflint`, ni `checkov`, ni `trivy`** (comprobado con `command -v`). **Instalar cualquiera es decisión del usuario** (§13 P1 y P2).

Si algo es ambiguo, contradictorio o te bloquea, **no lo resuelvas**: escríbelo en `specs/017-infrastructure-as-code/questions.md` y avisa. **Nada de seguridad, de privacidad ni de coste se decide aquí.**

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` actualizado:
   ```bash
   cd ~/personal/atlas/atlas-portfolio-tracker && git fetch origin && git worktree add .claude/worktrees/017-infrastructure-as-code -b feature/017-infrastructure-as-code origin/develop
   cd .claude/worktrees/017-infrastructure-as-code && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit en `specs/017-infrastructure-as-code/` (español, identificadores en inglés): **un solo `spec.md` y un solo `plan.md`** para las entregas, con cada entrega como historia o fase, y `tasks.md` agrupado por entrega. **Para después de `spec.md` y `plan.md`**, con tus preguntas en `questions.md`, y espera el visto bueno antes de escribir código: **quien contesta es la dirección**. Tienen que llegar con ese alto:
   - **las verificaciones del bloque 0 de E1** (§3), cada una con su fuente, su fecha y lo que dice, y **la lista de las de E2 a E4**, con cuándo las harás;
   - **la tabla de permisos de cada rol**: rol, acción, recurso, condición y **la fila del contrato de la que sale** (`plan.md` §10 de la 015, `iam-permissions.md` de la 016, la hoja de ruta, ADR-0034). Una acción sin fila de contrato es una pregunta, no una línea de la política. Los roles: el límite de permisos de cada entorno; `atlas-<entorno>-deploy`, `-plan` y `-admin`; `atlas-<entorno>-api`; los cinco `atlas-<entorno>-job-*`; el de Scheduler que invoca; y las políticas de recurso (los buckets de datos, de la SPA y del estado, y los permisos de la Function URL);
   - **la matriz de las salidas de las comprobaciones de ADR-0034** que cambian la infraestructura, con la variable que elige cada una y **el `run` de `terraform test` que la cubre**: C2 (la clave KMS del cliente para los `SecureString` de `prod`, sí o no), C5 (qué principal y qué condición de MFA lleva la confianza del rol de administración), C9 (si también se verifica el destinatario en SES), C11 (dos o más planes Free libres, uno o ninguno), C12 (si cabe reservar concurrencia), C13 y C19 (el proveedor OIDC y el analizador: usarlos como `data` o crearlos como recursos compartidos) y C3 (quién activa la etiqueta);
   - **los nombres de las variables de Terraform** y de dónde sale cada una (`terraform.tfvars` de cada entorno y de cada parte del *bootstrap*), con cuáles llevan `sensitive = true`. Fijas los que proponen `specs/016-scheduled-jobs/runbooks/mail-recipient-and-amounts.md` y `cloud-symbols-and-budgets.md`, y dices si los cambias;
   - **la tabla de coste de §7**, rellena con fuentes;
   - **la tabla de los SIN VERIFICAR de §6**, con lo que harás con cada uno;
   - **cómo verificas sin desplegar** (§4), probado sobre un módulo mínimo antes del alto si la P1 ya está contestada;
   - **la partición en entregas** tal como la vas a seguir (§3), con las zonas de revisión y sus ficheros;
   - **lo que propones para cada punto de §11.2**, marcado como propuesta.
3. Implementación **por entregas, en el orden de §3**, y dentro de cada una por bloques. Commits atómicos, Conventional Commits en inglés.
4. **Cada entrega termina como en la 016** (`docs/prompts/016-scheduled-jobs.md` §2, punto 4): la tubería en verde y la rama empujada; **la autocomprobación de §9 pasada y escrita** en `questions.md`, familia a familia, con la evidencia; **un commit congelado**, con su SHA en `questions.md` y en tu informe, sobre el que la dirección lanza los revisores por zonas, cada uno en un worktree desacoplado (`git worktree add --detach .claude/worktrees/017-rev-E<n>-<zona> <sha>`); nada empujado mientras dura la revisión; los hallazgos elegidos, arreglados con el test en rojo primero; y **la PR a `develop`, que abres tú** con la plantilla rellenada con honestidad **y la casilla del *bootstrap* contestada**: en esta feature, «nada aplicado; el primer `apply` es de la 018». **No la fusionas nunca.** La entrega siguiente empieza con `git merge origin/develop` en tu rama.

## 2 bis. Reglas de operación

Siguen valiendo las de `docs/prompts/016-scheduled-jobs.md` §2 bis que tocan a esta feature: nada del SDK de AWS alcanzable desde la web ni desde el dominio; nunca se registra un secreto, un correo, un `sub`, un importe ni una cuenta; no tocar `docs/`, `.githooks/`, `.claude/`, `.specify/` ni `CLAUDE.md` (salvo proponer una ADR con `/adr`); no tocar el esquema del libro ni el contrato de `docs/api.md`; cada código con su literal; fechas de los documentos en `Europe/Madrid`; los temporales con el prefijo de la rama; y ningún `--yes` en una operación destructiva. Además:

- **Ningún `apply`, ninguna llamada a AWS y ninguna credencial.** Ni `terraform apply`, ni `terraform plan` o `import` contra una cuenta, ni `aws` contra una cuenta, **aunque el usuario tenga credenciales en la máquina**. Los guiones que llaman a la CLI de AWS se prueban con **un `aws` simulado** delante en el `PATH`, como la 015 probó sus procedimientos (`docs/decision-roadmap.md`, «Etapas pendientes», 018, «Ensayos contra `dev`»). La única red permitida es la que usa `terraform init` para bajar el proveedor del registro de HashiCorp.
- **Dependencias: ninguna sin respuesta.** Terraform, el proveedor `hashicorp/aws`, cualquier analizador estático y cualquier acción nueva de GitHub Actions **son herramientas nuevas**: esperan a §13 P1 y P2. Lo que se autorice va con **versión exacta** y con su fila en `docs/dependencies.md` (que escribe la dirección, a partir de tu lista de «Documentos»). El fichero `.terraform.lock.hcl` de cada raíz **se versiona**, con los *hashes* de las plataformas que se usen (la máquina del usuario y la CI, Linux x64). **Las acciones de GitHub, fijadas por SHA de commit**, no por etiqueta.
- **Nada personal en ningún fichero versionado**: ni la cuenta, ni el dominio, ni una dirección, ni el sufijo de los buckets, ni el nombre de otro proyecto. Los ejemplos de `terraform.tfvars` van con marcadores evidentes (`000000000000`, `example.invalid`, `atlas@example.invalid`). **`.gitignore` gana `*.tfvars` (salvo `*.tfvars.example`), `*.tfstate*`, `.terraform/` y los planes guardados** (`*.tfplan`), en el primer commit de `infra/`, con un test que lo comprueba (§9, familia 17).
- **Los ficheros locales de Terraform**, donde dice `CLAUDE.md` («Where things live»): `~/personal/atlas/privado/terraform/<entorno>/terraform.tfvars` y el estado del *bootstrap* en `~/personal/atlas/privado/terraform/bootstrap/<account|dev|prod>/terraform.tfstate`. **Esas rutas no se escriben absolutas en ningún fichero versionado**: se pasan con la configuración parcial del *backend* (`terraform init -backend-config=…`) o con `-var-file`, y el procedimiento lo dice.
- **Un recurso de ámbito de cuenta que puede existir ya no se crea a ciegas**: el proveedor OIDC de GitHub, el analizador de IAM Access Analyzer y las identidades de SES se usan como `data` si existen y se crean, **anotados como compartidos, con `prevent_destroy` y fuera de todo `destroy` de Atlas**, si no (ADR-0034, filas 11, 12 y 14). La elección es una variable, nunca un `try()` que decida en silencio.
- **Los guiones** (el de los secretos, si la dirección elige un guion de *shell*, §13 P9, y el del plan de tarifa plana) siguen las reglas de la familia 9 de la 016: **nada secreto ni personal en una línea de orden** (`file://` con un fichero `600` que se borra después, o la entrada estándar), `printf '%s\n'` y no `echo`, `set -euo pipefail`, **idempotentes** (ejecutar dos veces deja lo mismo y lo dice), **ningún `--yes`**: lo que sobrescribe pide que se teclee el nombre del entorno, y sin terminal sale sin tocar nada. **«Probado» solo con el ensayo versionado** contra el `aws` simulado.
- **Los procedimientos** que escribas (aplicar el *bootstrap* por partes, la segunda pasada que activa la etiqueta, reconstruir el estado local del *bootstrap* con `terraform import` si se pierde, el guion de los secretos, el del plan de tarifa plana y activar y desactivar `dev`) van a `specs/017-infrastructure-as-code/runbooks/`, y la dirección los traslada a `docs/runbooks/` al cerrar.

## 2 ter. Lo que las rondas anteriores aprendieron a golpes

Siguen valiendo enteras las lecciones de `docs/prompts/016-scheduled-jobs.md` §2 ter: un test que no has visto fallar no es un test; un mutante que sobrevive puede ser un mutante que nunca se aplicó (el guion **afirma** cada sustitución, restaura y **compara byte a byte**); un resultado leído a través de una tubería se come el error (redirige a un fichero y lee `$?`); **un test que no existe no falla** (cuenta los tests de guardianes contra `develop` antes de cada PR); **«la propiedad no lo mata» no es «equivalente»**; **un paso de un procedimiento que se puede probar con los dobles se prueba**; y **sube la rama a menudo**, siempre en verde.

Y dos que en la infraestructura muerden más:

- **Lo que no se ve en el `plan` no se revisa.** Una política construida con un valor `sensitive` sale en el `plan` como `(sensitive value)`, y un cambio de IAM pasaría sin que nadie lo lea. Es el motivo de ADR-0034, fila 1, para no marcar la cuenta. **Ningún valor que entre en una política lleva `sensitive = true`**, salvo el destinatario, que va en la condición de SES y así lo acepta la fila 12.
- **Un guardián sobre el texto no ve lo que Terraform calcula.** Un `grep` sobre los `.tf` no ve un comodín que llega de una variable, un `concat()`, un `dynamic` ni un `for_each`. **Los guardianes de las políticas miran el `plan` renderizado** (`terraform show -json`), nunca solo los fuentes (§9, familia 1).

## 2 quater. Método de esta feature

**Un implementador nuevo por feature.** No reutilizarás tu contexto para la 018. Lo que sepas y no esté escrito en `questions.md` se pierde. **Escríbelo según lo aprendes, no al final.**

**Revisiones por zonas y con alcance acotado**, como en la 016 (`docs/prompts/016-scheduled-jobs.md` §2 quater): cada revisor recibe su zona con la lista de ficheros (como mucho dos zonas), la profundidad, la orden de publicar lo que tenga a unas tres cuartas partes de sus turnos, con «lo que no he mirado» escrito, y **su lote de mutantes, como mucho ocho**. Las zonas de §3 son una propuesta; tu plan las fija. **Tu autocomprobación de §9 va delante**: una revisión que encuentra una familia que dabas por pasada es un hallazgo también sobre la autocomprobación.

**Reglas de memoria de la máquina**, las de la 016 enteras: la máquina es compartida y la memoria disponible oscila. **Toda ejecución de `vitest` con `--pool=forks --maxWorkers=1`**; **`free -m` antes de cada paso pesado** (`terraform test`, cobertura, `build`, lote de mutantes), y si hay menos de **1.500 MB disponibles**, se espera, con una puerta que espera y no con un aviso; **`terraform test` y `terraform validate` de una raíz cada vez**, nunca en paralelo con la tubería; **los mutantes en lotes de cuatro a ocho y de uno en uno**, guardando cada veredicto en cuanto se conoce y reanudando solo lo que falta.

## 3. Alcance, por entregas y en este orden

### La partición: cuatro entregas, una rama, cuatro PRs (propuesta, §13 P12)

| Entrega | Qué | Depende de | Zonas de revisión propuestas |
|---|---|---|---|
| **E1** | **El aislamiento y la cuenta**: la forma de `infra/`, el arnés de verificación sin desplegar (§4), el *bootstrap* (parte de la cuenta y parte de cada entorno), el límite de permisos, los roles de despliegue, de `plan` y de administración con su confianza OIDC o de MFA, el bucket del estado, el presupuesto y la etiqueta, los recursos compartidos de la cuenta, `.gitignore` y la casilla de la plantilla de PR | La P1 contestada | Z1 aislamiento (límite de permisos, roles del *bootstrap*, confianzas, bucket del estado); Z2 cuenta y arnés (presupuesto, etiqueta, recursos compartidos, `prevent_destroy`, el arnés de §4 y sus guardianes) |
| **E2** | **Los datos y el borde**: el módulo de cada entorno con el bucket de datos (política, versionado, ciclo de vida), el de la SPA, CloudFront (OAC, comportamientos, políticas, la función de la CSP, WAF, `dev_active`), el certificado, la Lambda de la API con su Function URL, su rol y su concurrencia, los parámetros `String`, los grupos de registros y **la política del rol de administración** | E1 | Z3 datos e identidad (bucket de datos, rol de la API y de administración contra el contrato, SSM y KMS); Z4 borde (CloudFront, WAF y plan, CSP, Function URL, SPA, `dev_active`) |
| **E3** | **Las tareas y el correo**: las cinco Lambdas de tareas con su rol cada una, EventBridge Scheduler (el grupo, las programaciones desactivadas en `dev`, los reintentos), la política de envío de SES con sus condiciones, sus registros y su concurrencia | E2 | Z5 tareas (roles contra el contrato de la 016, SES, Scheduler); Z6 configuración (las variables `ATLAS_*` y los eventos contra los analizadores del código) |
| **E4** | **Lo que corre fuera de Terraform**: el guion de los secretos, el guion del plan de tarifa plana, los flujos de GitHub Actions (la verificación de `infra/`, activa; el `plan` y los despliegues, preparados e inactivos, §5), la promoción del artefacto, la tabla de coste cerrada y los procedimientos | E1 a E3 | Z7 CI y promoción (flujos, `sub` de OIDC, registros públicos, artefactos); Z8 guiones, procedimientos y coste |

**Por qué partirla así.** El orden sigue las dependencias: nada del módulo de un entorno se puede escribir sin los roles y el límite que lo acotan, y las tareas usan el bucket y los registros de E2. **E1 va sola y primero** porque es la superficie más cara de equivocarse: un fallo en el límite de permisos o en la confianza de un rol es un fallo contra los otros proyectos de la cuenta o entre `dev` y `prod` (ADR-0034, «Riesgo que queda», 6). **Los guiones y la CI van al final** porque dependen de los nombres que fijan E1 a E3.

### Forma de `infra/` (ADR-0028, bloque «Terraform»; ADR-0034, filas 15 y 20; `docs/specification.md` §11.4)

- `infra/bootstrap/account/`, `infra/bootstrap/env/` (una raíz que se aplica **una vez por entorno**, con el entorno como variable) y su estado **local**, fuera del repositorio, uno por parte.
- `infra/modules/atlas/` con la pila de un entorno, y `infra/envs/dev/` e `infra/envs/prod/` que lo llaman contra la misma cuenta, cada uno con su clave de estado en el bucket del estado (`envs/dev/…`, `envs/prod/…`) y el bloqueo nativo de S3.
- `infra/scripts/` para los guiones y `infra/test/` para lo que verifica sin desplegar (§4). Tu plan puede proponer otra forma, con su motivo.

### E1 — El aislamiento y la cuenta

#### Bloque 0 — Verificar antes de escribir código

Con fuente, fecha y lo que dice, en `questions.md`. **La regla de la Ronda 8**: cada feature verifica, con fuente y antes de escribir código, los SIN VERIFICAR que dependen de ella (`docs/decision-roadmap.md`, Ronda 8). Los de esta entrega:

1. **Cómo se prueba un módulo sin cuenta**: `terraform test` con `mock_provider` (versión mínima de Terraform que lo admite), qué hace con los recursos y **con las fuentes de datos** (una política escrita con la fuente de datos `aws_iam_policy_document` puede salir con un JSON inventado bajo el proveedor simulado; si es así, las políticas se escriben con `jsonencode()` o se sustituyen con `override_data`, y lo dices), y cómo se obtiene el `plan` renderizado en JSON para el análisis de §4. **Si no hay forma de ver la política renderizada sin AWS, para**: el análisis estático es la condición de esta feature.
2. **Qué acciones de IAM admiten `aws:ResourceTag` y `aws:RequestTag`, y cuáles autorizan `TagResource` al crear**, servicio a servicio, para los que toca el rol de despliegue: S3, IAM, Lambda, CloudFront, WAF, ACM, SSM, CloudWatch Logs, EventBridge Scheduler y Budgets (*Service Authorization Reference*). Es el SIN VERIFICAR de ADR-0034, fila 5. Lo que no admita la condición se acota por ARN, y **lo que no se pueda acotar ni por etiqueta ni por nombre no lo crea el despliegue** (fila 5).
3. **Si la OAC y las políticas de caché, de solicitud al origen y de cabeceras de respuesta de CloudFront admiten etiquetas** (ADR-0034, fila 5). Si no, **las crea el *bootstrap*** de cada entorno, y el despliegue solo las referencia.
4. **Si IAM admite un solo proveedor OIDC por URL** (ADR-0034, fila 14), con fuente, y **qué reclamaciones lleva el token de GitHub** en cada caso: el `sub` de una PR (`repo:<dueño>/<repo>:pull_request`), el de una rama y **el de un trabajo que declara `environment:`**, que **cambia el `sub`** a `…:environment:<nombre>` (documentación de GitHub, *OpenID Connect reference*). De eso depende que el trabajo de `plan` **no declare ningún *environment*** (§5).
5. **Las condiciones de la confianza del rol de administración** para las dos variantes de C5 (ADR-0034, fila 16, y su nota del 2026-09-27): IAM Identity Center o un usuario IAM con MFA, y **si una sesión de Identity Center lleva `aws:MultiFactorAuthPresent`**. Si no llegas a una fuente clara, sigue SIN VERIFICAR para la 018, y el rol se escribe para las dos variantes con una variable.
6. **La política de clave de la opción 2 de ADR-0034** (solo si C2 la exige): el riesgo de una clave **inmanejable** sin delegación en IAM, con fuente (SIN VERIFICAR de ADR-0034).
7. **`aws_ce_cost_allocation_tag`** (ADR-0034, F13): qué pasa si se aplica antes de que la clave aparezca en Billing. De ahí sale **la segunda pasada** del *bootstrap* de la cuenta (una variable que la activa, por defecto apagada).
8. **Los filtros de Budgets** para una etiqueta (`user:project`) y para excluir créditos y reembolsos (ADR-0034, F2), y la forma que tienen en el recurso `aws_budgets_budget`.

**Qué se hace si sale mal**: el punto 1 para la entrega. El 2 y el 3, si no hay fuente, se resuelven por el lado seguro (acotar por ARN, o crearlo en el *bootstrap*) y se dice.

#### Bloque 1 — El arnés, antes que la infraestructura

Antes de escribir un solo recurso, **el arnés de §4 corre sobre una raíz vacía** y ves fallar cada guardián con un módulo que lo incumple a propósito: la ausencia de credenciales, `fmt`, la lista de etiquetas, el comodín, el valor `sensitive` en una política, el secreto en el estado, `.gitignore`.

#### Bloque 2 — El *bootstrap* de la cuenta (ADR-0034, fila 20)

- **El bucket del estado**, `atlas-tfstate-<sufijo>`: versionado, SSE-S3, Block Public Access, solo TLS, **el bloqueo nativo de S3** y **`prevent_destroy`**. **Su política** niega `envs/prod/*`, bloqueo incluido, a todo principal que no sea `atlas-prod-*` **o el principal de administración del usuario** (C5), y lo simétrico para `envs/dev/*` (fila 15). **Un test comprueba que el principal de administración nunca queda fuera**: una política que lo niega deja el *bootstrap* sin poder volver a aplicarse (§9, familia 20).
- **El presupuesto `atlas-cost`**, uno para la cuenta, filtrado por `user:project` = `atlas`, mensual, a **1 $** (a **2 $** si la variable de la clave del cliente está activa), con aviso por correo al 100 % real y al previsto, **excluyendo créditos y reembolsos** (ADR-0034, fila 9; ADR-0028, fila 9). La dirección del aviso sale del `terraform.tfvars` de esa parte y lleva `sensitive = true`.
- **La activación de la etiqueta** con `aws_ce_cost_allocation_tag`, en la segunda pasada (bloque 0, punto 7), salvo que C3 diga que la cuenta es de una organización ajena (una variable la apaga, y el procedimiento dice quién la activa).
- **Los recursos compartidos de la cuenta**, cada uno con la variable «usar o crear» (§2 bis): el proveedor OIDC de GitHub (fila 14), el analizador de accesos externos de IAM Access Analyzer en `eu-west-1` (fila 11) y **las identidades de SES**, **una por dirección**, nunca por entorno (fila 12): la del remitente y, si C9 dice que la cuenta sigue en el *sandbox*, la del destinatario.

#### Bloque 3 — El *bootstrap* de cada entorno (ADR-0034, filas 4, 5, 16, 20 y 21)

- **El límite de permisos `atlas-<entorno>-boundary`**, que lleva todo rol de ese entorno: solo recursos con los prefijos del entorno (fila 3), solo `eu-west-1` más `us-east-1` para ACM y los servicios globales (con `aws:RequestedRegion`), **ninguna acción de IAM** salvo las del rol de despliegue de la fila 5, y **nada de `organizations:*`, `account:*` ni facturación** (fila 4). **Tiene que dejar pasar todo lo que los contratos conceden** a la API, a las tareas y a la administración: un test cruza el límite con cada política (§4).
- **El rol de despliegue `atlas-<entorno>-deploy`** (fila 5): confianza OIDC con `sub` **exacto** (`repo:Jemartri44/atlas-portfolio-tracker:ref:refs/heads/develop` para `dev`; `…:environment:prod` para `prod`) y `aud` = `sts.amazonaws.com` (fila 14); permisos acotados por ARN y prefijo, y **por etiqueta** donde el servicio no admite ARN con nombre; **`TagResource` y `UntagResource` denegados cuando `aws:ResourceTag/env` existe y no es el suyo**, y **nadie cambia ni quita `project` ni `env`** de un recurso que ya las lleva (denegación con `aws:TagKeys`); **solo crea roles `atlas-<entorno>-*` y solo con su límite puesto** (`iam:PermissionsBoundary`); no puede quitarlo, ni cambiar la política del límite, ni tocar **ningún rol del *bootstrap*** de ningún entorno, el suyo incluido; **ningún permiso de cambio** sobre lo que crea el *bootstrap* (la OAC y las políticas de CloudFront); y **ningún `ssm:GetParameter` ni `kms:Decrypt` sobre los secretos** (fila 21).
- **El rol de `plan` `atlas-<entorno>-plan`** (filas 5 y 14): confianza por el `sub` exacto `repo:Jemartri44/atlas-portfolio-tracker:pull_request`; **solo lee**: metadatos de los recursos de su entorno y **su** clave de estado (`envs/<entorno>/*`, con el bloqueo), **sin `ReadOnlyAccess`** (leería los objetos de todos los buckets de la cuenta), **sin leer ningún objeto del bucket de datos** y **sin ningún secreto**. `repo:Jemartri44/atlas-portfolio-tracker:*` no aparece en ninguna confianza.
- **El rol de administración `atlas-<entorno>-admin`** (fila 16): confianza que nombra **el principal de administración del usuario**, nunca la cuenta entera, con la condición de MFA que diga el bloque 0, punto 5. **Su política de permisos va en E2**, cuando existan los recursos que nombra.
- **Lo que el despliegue no puede acotar**, uno por entorno (fila 5): **la OAC** del bucket de la SPA y la de la Function URL y, **si el bloque 0 dice que hace falta**, las políticas de CloudFront que no sean gestionadas (§13 P4). **La clave KMS de la opción 2**, solo con la variable de C2 activa y solo en `prod`, con la política de clave de la opción 2 (administra el principal del usuario; `atlas-prod-admin`, `Encrypt` y `Decrypt`; la API de `prod`, `Decrypt` y `Encrypt` acotado por `kms:EncryptionContext:PARAMETER_ARN` a `/atlas/prod/device-tokens/*`; las tareas, solo `Decrypt`).

#### Bloque 4 — La casilla de la plantilla de PR (ADR-0034, fila 20)

`.github/pull_request_template.md` gana una casilla, en inglés como el resto de la plantilla, que exige a **toda PR que toque `infra/bootstrap/`** decir **qué partes se aplicaron a mano y cuándo** (la de la cuenta si cambió, **`dev` primero**, y **cuándo se aplicará en `prod`**, solo cuando `dev` funcione). Forma parte de la definición de terminado. Un test comprueba que la casilla existe y nombra `infra/bootstrap/`, `dev` y `prod`.

### E2 — Los datos y el borde

#### Bloque 0 — Verificar antes de escribir código

1. **Qué exige la Function URL con `AuthType=AWS_IAM` detrás de OAC**: la documentación de CloudFront (*Restrict access to an AWS Lambda function URL origin*) y la de Lambda dicen, según fuentes secundarias consultadas el 2026-09-28, que **desde octubre de 2025 una Function URL nueva pide en su política de recurso `lambda:InvokeFunctionUrl` y además `lambda:InvokeFunction`** para el principal de CloudFront. Compruébalo con la fuente de AWS, y **los dos permisos, condicionados con `AWS:SourceArn` a la distribución de su propio entorno**, nunca con `AWS:SourceAccount` (ADR-0034, fila 19).
2. **Qué admite el plan Free de tarifa plana** (ADR-0028, opción 3 y filas 14 y 15; ADR-0034, F9): si admite **CloudFront Functions** y cuántas, si admite **políticas propias** de solicitud al origen y de cabeceras de respuesta (ADR-0028, fila 14 dice que las de cabeceras **no**), cuántas reglas trae su *web ACL*, **si una *web ACL* creada por Terraform antes de suscribir el plan se cobra por uso mientras tanto** (7-8 $ al mes, ADR-0028, opción 3) y **cómo se asocia** la *web ACL* a la suscripción (la API de Pricing Plan Manager: una suscripción cubre una distribución y una *web ACL*).
3. **Qué reenvía la política gestionada `AllViewerExceptHostHeader`** (ADR-0033, F6): las cuatro cabeceras que la API necesita en `/api/*` (`x-atlas-device-token`, `x-atlas-expected-device`, `Sec-Fetch-Site` y `Origin`; `docs/api.md` §8), las *cookies*, la cadena de consulta **y `x-amz-content-sha256`**, que el cliente calcula en `POST` y `PUT` (ADR-0027, hecho 2).
4. **Los permisos de KMS para `aws/ssm`** (ADR-0033, «Consecuencias»; nota de ADR-0033 en ADR-0028, fila 7): qué necesitan leer y escribir un `SecureString` con la clave gestionada. La 016 encontró las dos frases contrarias en la misma página (`specs/016-scheduled-jobs/questions.md` §1.7). **Se escribe por el lado seguro**: `kms:Decrypt` (y `kms:Encrypt` para quien escribe) **condicionado con `kms:ViaService` y con `kms:EncryptionContext:PARAMETER_ARN`** a las rutas de su contrato, si la documentación lo admite. **La prueba real es de la 018.**
5. **Si `dev` con CloudFront de pago por uso cabe en el nivel gratuito permanente de CloudFront**, que es de la cuenta y se comparte (ADR-0034, fila 19): con la página de precios. Es la salida de C11 con un solo plan Free libre.
6. **El precio de un parámetro avanzado de SSM y si su política vale dentro de la cuenta** (SIN VERIFICAR de ADR-0034, opción 3, que la hoja de ruta asigna a la 017): con la página de precios. No cambia nada si la opción sigue descartada; se cierra y se dice.

#### Bloque 1 — El bucket de datos (ADR-0028, fila 7; ADR-0034, filas 6, 7 y 8; `docs/data-schema.md` §1)

- `atlas-<entorno>-data-<sufijo>`: Block Public Access, **versionado**, SSE-S3 (sin clave propia en ningún caso), solo TLS, `force_destroy = false`, y **una regla de ciclo de vida** que expira las versiones no vigentes a los **365 días** (ADR-0006) y aborta las subidas multiparte a medias. **Nunca es origen de CloudFront.**
- **Su política**: **niega** las acciones sobre objetos y **los listados** (`s3:ListBucket`, `ListBucketVersions`, `ListBucketMultipartUploads`) a todo principal que no sea un rol de Atlas **de ese entorno** (la API, las cinco tareas y el de administración), con una condición sobre `aws:PrincipalArn`; **niega** los cambios de configuración del bucket (política, versionado, ciclo de vida, cifrado, bloqueo de acceso público) a todo principal salvo el de despliegue y el de administración de ese entorno; y lleva **la denegación de `backups/*` sin `If-None-Match`** con la forma aceptada en `specs/016-scheduled-jobs/contracts/iam-permissions.md` §4.
- **`prevent_destroy`** según §13 P8.

#### Bloque 2 — El rol de la API y el de administración

- **El rol `atlas-<entorno>-api`**: exactamente `specs/015-api-access/plan.md` §10, con lo que añadieron después: **`s3:ListBucket` que cubra también `ledger/`**, sin `s3:GetObject` en `archive/` (la API nunca archiva); **`ssm:AddTagsToResource`** sobre `/atlas/<entorno>/device-tokens/*` (ADR-0034, nota del 2026-09-26); `s3:GetObject` y `s3:PutObject` sobre `access/last-web-sign-in.json` (`iam-permissions.md` §6); **nunca** `s3:DeleteObject*`, `ssm:DeleteParameter*` ni `ssm:LabelParameterVersion` (ADR-0033, punto 9); y lo de KMS del bloque 0, punto 4.
- **El rol `atlas-<entorno>-admin`**: la política de `specs/015-api-access/plan.md` §10 (`s3:GetObject`, `s3:PutObject` y `s3:ListBucket` en el bucket de datos; `ssm:GetParametersByPath` y `ssm:PutParameter` en `device-tokens/`), **más `s3:GetObjectVersion`** para `atlas admin restore --from s3-version:<id>` («Lo que la 015 le deja a la 017»), **más las filas de `iam-permissions.md` §8** (las de Scheduler y `iam:PassRole` sobre la programación del BCE, `s3:ListBucketVersions`, `s3:GetObjectVersion`, **`s3:DeleteObject` solo sobre `reference/ecb/manifest.json` y `jobs/ecb/ecb_update/*`**, aceptado por la dirección, y `lambda:InvokeFunction` sobre la tarea del BCE), **más lo que necesite el guion de los secretos** (E4: `ssm:PutParameter` y `ssm:AddTagsToResource` sobre `/atlas/<entorno>/auth/*` y `/atlas/<entorno>/prices/*`, y KMS si C2). **`iam:PassRole` con `iam:PassedToService` = `scheduler.amazonaws.com`** y sobre el ARN exacto del rol de Scheduler.

#### Bloque 3 — CloudFront, la SPA y la Function URL (ADR-0028, filas 5, 6, 14 y 15; ADR-0034, filas 17 a 19)

- **Una distribución por entorno**, con su certificado de ACM **propio** en `us-east-1` validado por DNS (fila 17), su subdominio de `terraform.tfvars` (fila 18), su *web ACL* y su función de la CSP, **sin compartir ninguna** (fila 19; F9).
- **El comportamiento por defecto**, la SPA desde su bucket privado con OAC. **La política del bucket de la SPA, condicionada con `AWS:SourceArn`** a la distribución de su entorno (fila 19). **Lo que no se sirve**: `dist/.vite/` nunca, y los `*.map` según §13 P11 (`specs/015-api-access/questions.md` §15.6). Esto lo decide el paso del despliegue que sube la SPA (E4); aquí, el bucket y su política.
- **`/api/*`**, la Function URL con OAC y `AuthType=AWS_IAM`, **con la política de caché `CachingDisabled`** y la política de solicitud al origen de §13 P4, que tiene que reenviar las cuatro cabeceras de `docs/api.md` §8 y `x-amz-content-sha256`. Con `CachingDisabled` no hay compresión en `/api/*`: se dice así («Lo que la 015 le deja a la 017»).
- **La CSP, en una CloudFront Function de respuesta** (ADR-0028, fila 14): la misma política que la `<meta>` de `apps/web/index.html` **más `frame-ancestors 'none'`**, y las cabeceras de seguridad que el plan permita. **No puede pisar la CSP que pone la Lambda** en sus páginas, y sobre todo la **`sandbox`** de las páginas del código de la consola (ADR-0033, «Consecuencias»; `docs/api.md` §8). La salida recomendada es **asociarla solo al comportamiento por defecto**, nunca a `/api/*`; si la asocias a los dos, solo añade la CSP cuando el origen no trae ninguna. **Un test compara la CSP de la función con la de la `<meta>`** directiva a directiva (§9, familia 4), y otro comprueba que `/api/*` no la lleva o que la función respeta la del origen.
- **El WAF**: con el plan Free, su *web ACL* con **una regla de límite de ritmo por IP sobre `/api/*`**, que protege el cupo de lecturas de SSM **compartido con los otros proyectos** (hoja de ruta, entrada de la 017; revisión de seguridad de la PR #95, N2), más las reglas gestionadas que el plan admita (ADR-0028, fila 15). **Sin plan Free** (la salida de C11 con uno solo libre), `dev` va **sin WAF**, con CloudFront de pago por uso y solo datos sintéticos (ADR-0034, fila 19). Una variable elige, y cada salida tiene su `run`.
- **`dev` en reposo**: su distribución, **`enabled = false` salvo que `dev_active` sea verdadera**, una variable del despliegue de `dev`, **nunca a mano** (ADR-0034, filas 2 y 19). Por defecto, falsa.
- **La suscripción al plan de tarifa plana no es de Terraform**: es el guion de E4 (ADR-0028, excepciones; ADR-0034, fila 20).

#### Bloque 4 — La Lambda de la API, sus parámetros y sus registros

- **La función `atlas-<entorno>-api`**: Node 22, el artefacto `lambda.zip` con `index.handler`, **las variables `ATLAS_*` exactamente las de `docs/api.md` §9** (ningún secreto en una variable), su rol, **su grupo de registros `/aws/lambda/atlas-<entorno>-api` creado antes por Terraform** con retención de **30 días en `prod` y 7 en `dev`** (ADR-0028, fila 16; ADR-0034, fila 3), y **su concurrencia reservada** según §13 P10.
- **Cómo llega el artefacto** a la función sin reconstruirlo por entorno: §5 y §13 P7.
- **Los dos parámetros `String` de Terraform**, `/atlas/<entorno>/mail/recipient` y `/atlas/<entorno>/mail/amounts`, desde `terraform.tfvars`; **el interruptor, por defecto `off`** (`ssm-and-config.md` §1). **Ningún otro parámetro es un recurso de Terraform.** El destinatario valida su forma en un bloque `validation` con la regla del contrato.

### E3 — Las tareas y el correo (`specs/016-scheduled-jobs/contracts/`)

#### Bloque 0 — Verificar antes de escribir código

1. **Qué ARN de identidad evalúa SES** cuando se envía desde una dirección cuyo dominio es lo verificado (`specs/016-scheduled-jobs/questions.md` §1.1, que lo deja a la 017). **Aceptado por la dirección** (§9 de esas preguntas): el recurso nombra las dos, `identity/<dominio>` e `identity/<dirección>`. Si encuentras la fuente, se dice; si no, sigue SIN VERIFICAR para la 018.
2. **Cómo se configura en Terraform** la política de reintentos de una programación (`MaximumRetryAttempts = 2`, `MaximumEventAgeInSeconds = 3600`), la invocación asíncrona de la función (`aws_lambda_function_event_invoke_config`, `0` y `3600`), la zona horaria (`Europe/Madrid`), `FlexibleTimeWindow = OFF` y el estado `DISABLED` en `dev` (`specs/016-scheduled-jobs/plan.md` §6; `iam-permissions.md` §7).

#### Bloque 1 — Las cinco funciones

- `atlas-<entorno>-job-ecb`, `-prices`, `-mail`, `-backup` e `-integrity`: **un solo artefacto** (`jobs.zip`, `index.handler`) y **una función por familia de permisos, cada una con su rol** (`docs/prompts/016-scheduled-jobs.md` §8.1 P4).
- **Cada rol, exactamente su tabla** de `iam-permissions.md` §1 a §5 y §7, con **la denegación explícita** de `prices/symbols.json` y `prices/config.json` al de precios (§2); **solo el de correo con `ses:SendEmail`**, con las condiciones de §3 (`ses:FromAddress`, `ses:ApiVersion` = `2`, `ForAllValues:StringEquals` sobre `ses:Recipients` **con la condición `Null` = `false`**), y **sin alcanzar `/atlas/<entorno>/prices/*`** (`docs/prompts/016-scheduled-jobs.md` §8.2 B2). El destinatario de la condición y el del parámetro salen **de la misma variable** (ADR-0034, fila 12).
- **Tiempo y memoria**, los de `iam-permissions.md` §9; **`ATLAS_JOB_MAX_RUN_SECONDS` igual al `timeout`** de cada función, comprobado por un test; **concurrencia reservada 1** en cada una (ADR-0029; `iam-permissions.md` §7); **las variables `ATLAS_*` exactamente las de `ssm-and-config.md` §2** para cada función (una desconocida impide arrancar); **sin las claves de precios en `dev`** (ADR-0034, fila 2), y la fuente simulada solo si `ATLAS_ENV=dev`.
- **Sus grupos de registros**, creados antes, con la retención de su entorno.

#### Bloque 2 — EventBridge Scheduler

- **El grupo `atlas-<entorno>-jobs`**, etiquetado: **solo los grupos se etiquetan** (`specs/016-scheduled-jobs/questions.md` §1.6).
- **Una programación diaria por función**, a la hora de `specs/016-scheduled-jobs/plan.md` §6, con **el `Input` exacto** de `scheduler-event.md` (un test lo compara) y **en `dev`, `DISABLED`** (ADR-0034, fila 2). La 018 activa una vez una de `dev` con la fuente simulada: tu diseño lo hace posible con una variable, **nunca a mano**.
- **El rol de Scheduler**, con `lambda:InvokeFunction` sobre las cinco funciones y nada más (`iam-permissions.md` §7).

### E4 — Guiones, CI, promoción y procedimientos

#### Bloque 0 — Verificar antes de escribir código

1. **La PR del proveedor de Terraform para los planes de tarifa plana** (ADR-0028, excepciones: «la feature 017 la localiza y la enlaza aquí»). Punto de partida, consultado el 2026-09-28 por quien redacta: la PR **hashicorp/terraform-provider-aws#49235**, «New Resource: `aws_pricingplanmanager_subscription`», **abierta** desde el 2026-07-31, y las incidencias **#45450** y **#49232**; CloudFormation ya tiene `AWS::PricingPlanManager::Subscription`. **Compruébalo** y di su estado: la condición de retirada del guion es que el proveedor lo soporte en una versión publicada.
2. **Las órdenes de la CLI de AWS** para suscribir, consultar y cancelar un plan Free (Pricing Plan Manager, en `us-east-1`), y cómo se hace **idempotente**.
3. **GitHub Actions**: que un trabajo `pull_request` desde un *fork* **no recibe** el token OIDC; qué variables y secretos ve un trabajo sin *environment* (los del repositorio) y cuáles uno con `environment: prod`; y cómo **enmascara** GitHub los secretos en el registro (y cómo no lo hace con un valor transformado).

#### Bloque 1 — El guion de los secretos (ADR-0034, fila 21)

**Su forma la decide §13 P9.** En cualquiera de las dos, crea y rota, con el rol `atlas-<entorno>-admin`, **todo `SecureString` de `/atlas/<entorno>/` salvo los registros de los tokens** (que crea la API): la lista permitida, el secreto del cliente de Google, la clave de sesión, las claves de EODHD y de Alpha Vantage (**nunca en `dev`**, ADR-0034, fila 2) y, cuando exista, el token Flex de IBKR; **y el `String` `/atlas/<entorno>/auth/google-client-id`**, que `docs/api.md` §9 pone entre los que crea el guion. Los crea **etiquetados** con `project`, `env` y `managed_by` (ADR-0034, fila 3), con los nombres y formatos de `docs/api.md` §9 y `ssm-and-config.md` §1. **Nunca crea `mail/recipient` ni `mail/amounts`**, que son de Terraform (`docs/prompts/016-scheduled-jobs.md` §8.2 M3). **Retirar el acceso es quitar la entrada del `sub`** de la lista permitida, no cambiarle el correo (`docs/api.md` §2 y §7; «Lo que la 015 le deja a la 017»). La clave de sesión, 32 bytes aleatorios en base64url (`docs/api.md` §9). **Ningún valor en la línea de órdenes, en el historial, en un registro ni en la salida**; sobrescribir pide teclear el entorno. Y **`docs/runbooks/stolen-google-account.md`** y **`revoke-all-tokens.md`**, que hoy dicen «si el guion no está disponible», pasan a apuntar al guion: la redacción, en «Documentos».

#### Bloque 2 — El guion del plan de tarifa plana (ADR-0028, excepciones; ADR-0034, filas 19 y 20)

Idempotente, **por entorno**, que asocia la distribución y su *web ACL* al plan Free, **se niega** si la cuenta ya tiene tres planes Free (F9), dice el estado, y **cancela** el plan (lo que exige borrar la distribución, F9) solo con el entorno tecleado. Con su ensayo contra el `aws` simulado, y su condición de retirada escrita en la cabecera.

#### Bloque 3 — Los flujos de GitHub Actions (§5)

#### Bloque 4 — Los procedimientos y la tabla de coste

En `specs/017-infrastructure-as-code/runbooks/`: aplicar el *bootstrap* por partes, en orden (cuenta, `dev`, `prod`) y **la segunda pasada** de la etiqueta; **reconstruir el estado local del *bootstrap* con `terraform import`** si se pierde (ADR-0034, fila 15: «procedimiento en la 017»), y respaldarlo tras cada `apply` en el mismo disco que la copia fuera de AWS; activar y desactivar `dev` con `dev_active` desde el pipeline; el guion de los secretos; el del plan de tarifa plana; cambiar el destinatario, el interruptor y los presupuestos de la nube en `terraform.tfvars` (los procedimientos de la 016 los proponen: fijas los nombres). **Ninguno se ejecuta contra AWS en esta feature**: se recorren contra el `aws` simulado en el estado que deja cada paso, y lo que solo se prueba en real se dice. La tabla de coste de §7, cerrada.

## 4. Verificación sin desplegar

**Lo que tiene que quedar en la tubería**, sin cuenta y sin credenciales, y **en la CI** en cuanto la P1 lo permita (§5):

- **`terraform fmt -check -recursive`** sobre `infra/`.
- **`terraform init -backend=false` y `terraform validate`** en cada raíz (`infra/bootstrap/account`, `infra/bootstrap/env`, `infra/envs/dev`, `infra/envs/prod`).
- **`terraform plan` sin cuenta**, con **`terraform test` y un proveedor simulado** (`mock_provider`), que es lo que recomienda quien redacta: planifica sin credenciales y sin llamar a AWS. **Si el bloque 0 dice que no alcanza**, la alternativa es un `plan` con el proveedor configurado para no validar credenciales ni pedir el identificador de la cuenta, **`-refresh=false`**, sin estado previo y con credenciales falsas que no pueden valer; y **si cualquiera de las dos llega a llamar a AWS, para**. Un **`run` por cada salida de las comprobaciones de ADR-0034** que cambia la infraestructura (§2, la matriz), **para los dos entornos**, que afirma qué recursos existen en cada salida y con qué valores.
- **El análisis estático de las políticas renderizadas** (`terraform show -json` del `plan` de cada `run`), en una suite de `vitest` bajo `infra/test/`, **sin dependencias nuevas** salvo lo que responda §13 P2 y P3. Como mínimo:
  - **cada rol contra su contrato**: las acciones y los recursos de cada política, **exactamente** las filas de la tabla de permisos del alto (§2), ni una más ni una menos;
  - **ningún comodín** en `Action` ni en `Resource` salvo la lista cerrada de excepciones, cada una con la acción que no admite recurso y su fuente (§9, familia 11);
  - **cada ARN de un rol de `dev` construido para `dev`**, y lo simétrico; ningún literal `prod` en el módulo común;
  - **el límite de permisos deja pasar** cada acción de los contratos y **niega** lo que la fila 4 excluye;
  - **las confianzas**: `sub` exactos, `aud`, ningún comodín, y el de administración con su principal y su condición de MFA;
  - **las políticas de los buckets**: las denegaciones de las filas 6 y 15, la de `backups/*`, y **que el principal de administración nunca queda fuera** del bucket del estado;
  - **las variables de las Lambdas contra los analizadores del código**: el conjunto de variables `ATLAS_*` de cada función es **exactamente** el que acepta su analizador (`parseApiConfig` de la API, el de las tareas), leído del código y no copiado a mano; `ATLAS_JOB_MAX_RUN_SECONDS` igual al `timeout`; los `Input` de Scheduler, iguales a `scheduler-event.md`;
  - **las etiquetas** (§9, familia 12) y **los secretos en el estado** (familia 13).
- **Los tres escenarios de ADR-0034, fila 5**, que la fila pone en la definición de terminado de la 017 **con el simulador de políticas de IAM**. **El simulador necesita AWS de verdad**, así que, por decisión de la dirección al encargar este prompt (2026-09-28), **en la 017 se prueban con un análisis estático equivalente** y **el simulador se ejecuta en la 018, antes del primer `apply`, como condición para hacerlo**. La forma del análisis la decide §13 P3. Los escenarios:
  1. «el rol de `dev` etiqueta y modifica la distribución de `prod`»: **denegado**;
  2. «el rol de `dev` etiqueta un recurso ajeno sin etiquetas»: denegado donde el servicio permite expresarlo; donde no, **el hueco se escribe con su motivo y no para la feature**, porque no es entre `dev` y `prod`;
  3. «el rol de despliegue de `dev` cambia la OAC o una política de caché o de cabeceras de `prod`»: **denegado**.
  **Cualquier hueco entre `dev` y `prod` para la feature** (fila 5).
- **Las pruebas de B4 y NB4**, los dos hallazgos de la revisión adversarial de ADR-0034 en la PR #87 de los que salió la regla de etiquetas de la fila 5. Léelos en la PR (`gh pr view 87 --comments`); lo que piden, y cada punto con su prueba estática:
  - **B4** («las condiciones por etiqueta no impiden cambiar la etiqueta: `dev` puede apropiarse de la distribución de `prod`»): el rol de despliegue de `dev` etiqueta la distribución de `prod` con `env=dev`, hace `UpdateDistribution` y apunta `/api/*` a la Lambda de `dev`, y desde ese momento las *cookies* de sesión y los tokens de la consola de `prod` llegan a código de `develop`. Las pruebas: **(a)** `TagResource` y `UntagResource` denegados sobre un recurso cuyo `env` no es el del rol, y **`project` y `env` imposibles de cambiar o quitar** una vez puestas (denegación con `aws:TagKeys`); **(b)** los escenarios 1 y 2 de arriba; **(c)** donde un servicio no admite `aws:ResourceTag` en su acción de cambio, el ARN concreto, y **un hueco entre `dev` y `prod` para la feature**; **(d)** el rol de despliegue **no puede tocar ningún rol del *bootstrap*** (`atlas-<entorno>-admin`, `-deploy` y `-plan`, de los dos entornos, el suyo incluido).
  - **NB4** («la regla de etiquetas de la fila 5 choca con el etiquetado al crear y deja fuera recursos de CloudFront»): **(a)** se puede **crear con `default_tags`** —varios servicios autorizan `TagResource` al crear, cuando `aws:ResourceTag` todavía no existe—, así que la denegación es «cuando `aws:ResourceTag/env` existe y no es la del entorno», y no «exigir siempre la condición»: una prueba afirma las dos cosas a la vez (crear etiquetado pasa, re-etiquetar lo de `prod` no); **(b)** el escenario 3 de arriba: el despliegue de `dev` que cambia la OAC de la Lambda de `prod` para que no firme; y **(c)** la OAC y las políticas de CloudFront **las crea el *bootstrap***, una por entorno, y **ningún rol de despliegue tiene una acción de cambio sobre ellas**, ni sobre `*`.
  - Y las dos cerraduras de las filas 6, 7 y 15, cada una con su prueba **por separado** (§9, familia 16).
- **Los guiones**, con su ensayo contra el `aws` simulado, en `vitest` o en un test de *shell*, con las órdenes que recibió el `aws` simulado afirmadas **una a una y con sus argumentos**.
- **El guardián de las credenciales**: la suite corre con `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `AWS_SESSION_TOKEN` **vacíos**, `AWS_EC2_METADATA_DISABLED=true` y `AWS_CONFIG_FILE`/`AWS_SHARED_CREDENTIALS_FILE` apuntando a ficheros vacíos del *scratchpad*, y **falla si alguno viene puesto**. Así, ni el usuario con credenciales en su máquina puede hacer que un test llegue a AWS.

**La deriva no se puede medir sin cuenta.** Lo que sí se puede: que ningún procedimiento cambie a mano un recurso de Terraform salvo los escritos (el procedimiento del BCE de la 016 para la programación, que ya lo dice), que `dev_active` sea la única palanca de la distribución de `dev`, y que cada `ignore_changes` tenga su motivo escrito (§9, familia 15). **La 018 comprueba que un segundo `plan` tras el `apply` sale vacío.**

## 5. El `plan` y los despliegues en la CI

Tres flujos, o trabajos, **cada uno con permisos mínimos** (`permissions:` explícito; `id-token: write` solo donde asume un rol):

1. **La verificación de `infra/`**, **activa desde esta feature** si la P1 lo permite: `fmt`, `validate` y `terraform test` con el proveedor simulado. **Sin credenciales, sin `id-token`.** Corre en toda PR.
2. **El `plan` contra la cuenta, preparado e inactivo hasta la 018**: asume `atlas-<entorno>-plan` con OIDC y ejecuta `plan` sobre la clave de estado de su entorno. **Reglas:**
   - **no declara ningún `environment:`**: cambiaría el `sub` a `…:environment:<nombre>` y la confianza del rol, que es `…:pull_request` (ADR-0034, fila 14; bloque 0 de E1, punto 4), no lo admitiría. **La solución nunca es ensanchar la confianza**;
   - **no corre en PRs de *forks*** (no reciben el token; además, una condición explícita en el trabajo), ni con `pull_request_target`;
   - **no ejecuta código de terceros** con el token en la mano: ni `npm ci`, ni nada que no sea `terraform` y la CLI necesaria, con acciones fijadas por SHA;
   - **los valores de `terraform.tfvars` le llegan de secretos del repositorio** (un trabajo sin *environment* no ve los del *environment*), según §13 P6;
   - **nunca vuelca el `plan` entero en el registro** (ADR-0034, fila 1): el registro lleva solo **las direcciones de los recursos y la acción** de cada uno (crear, cambiar, destruir, reemplazar), sacadas de `terraform show -json`, y **ningún valor**. **Tampoco sube el `plan` como artefacto**: los artefactos de un repositorio público los descarga cualquiera con una cuenta de GitHub. El `plan` completo lo revisa el usuario en local antes de cada `apply` (018);
   - **se activa en la 018** con una variable del repositorio que hoy no existe, y **mientras tanto es inerte por construcción**: el rol que asume no existe hasta que se aplique el *bootstrap*.
3. **Los despliegues, preparados e inactivos hasta la 018**, según §13 P7: `dev` desde `develop` con el `sub` de la rama; `prod` solo desde el *environment* `prod` con aprobación obligatoria (ADR-0028, fila 13; ADR-0034, fila 5). **Construir una vez y promocionar**: el artefacto de `prod` es **el mismo, byte a byte**, que se validó en `dev`, identificado por su SHA-256 (ADR-0028, bloque «Terraform»; constitución, Entornos). El paso que sube la SPA **nunca sube `dist/.vite/`** y los `*.map` según §13 P11. **`dev_active`** solo se cambia aquí.

**Ninguna variable sensible en los registros públicos de Actions**: ni el dominio, ni una dirección, ni el sufijo de un bucket, ni el identificador de la cuenta en claro fuera de lo que AWS ya imprime en un ARN. Un test lee los flujos y comprueba cada regla de este apartado: sin `environment:` en el de `plan`, `permissions` mínimos, acciones fijadas por SHA, ningún `terraform show` sin filtro, ningún `upload-artifact` de un `plan` (§9, familia 18).

## 6. Los SIN VERIFICAR heredados: los cierra la 017 o los deja a la 018

Cada uno con su fuente. **«La 017»** significa: se verifica con fuente en el bloque 0 que se indica, y lo que se encuentre va a la lista de «Documentos» para que la dirección lo escriba en su ADR. **«La 018»** significa: la 017 lo escribe por el lado seguro, lo deja dicho en el código o en la política, y el procedimiento de la 018 lo prueba contra AWS.

| # | Qué | Fuente | Quién |
|---|---|---|---|
| 1 | El enlace de la PR del proveedor de Terraform para los planes de tarifa plana | ADR-0028, excepciones; hoja de ruta, Ronda 8 | **017**, E4 bloque 0.1 (punto de partida: #49235) |
| 2 | Qué acciones admiten condiciones por etiqueta y cuáles autorizan `TagResource` al crear | ADR-0034, fila 5 y fuentes | **017**, E1 bloque 0.2 |
| 3 | Si la OAC y las políticas de CloudFront admiten etiquetas | ADR-0034, fila 5 | **017**, E1 bloque 0.3 |
| 4 | Un solo proveedor OIDC por URL | ADR-0034, fila 14 | **017**, E1 bloque 0.4 |
| 5 | El riesgo de una clave KMS inmanejable (solo con C2) | ADR-0034, opción 2 | **017**, E1 bloque 0.6 |
| 6 | El precio de un parámetro avanzado y si su política vale dentro de la cuenta | ADR-0034, opción 3 | **017**, E2 bloque 0.6 |
| 7 | Si `dev` con CloudFront de pago por uso cabe en el nivel gratuito | ADR-0034, fila 19 | **017**, E2 bloque 0.5 (con la página de precios); el consumo real, **018** |
| 8 | Los permisos de KMS para `aws/ssm` | ADR-0033, «Consecuencias»; ADR-0028, nota de ADR-0033; `specs/016-scheduled-jobs/questions.md` §1.7 y §9 | **017** con la documentación (E2 bloque 0.4); **018** en real |
| 9 | Que la función de la CSP respete la `sandbox` de las páginas de la Lambda | ADR-0033, «Consecuencias»; `docs/api.md` §8 | **017**, por construcción y con test (E2 bloque 3); **018** lo mira en un navegador |
| 10 | Que la Function URL detrás de OAC pida también `lambda:InvokeFunction` | Nuevo; fuentes secundarias del 2026-09-28 | **017**, E2 bloque 0.1 |
| 11 | Qué admite el plan Free (funciones, políticas propias) y si una *web ACL* se cobra antes de suscribir | ADR-0028, opción 3 y fila 14; ADR-0034, F9 | **017**, E2 bloque 0.2 |
| 12 | Si las programaciones de Scheduler se etiquetan una a una | ADR-0034, fila 9 | **Cerrado por la 016** (`specs/016-scheduled-jobs/questions.md` §1.6: solo el grupo). La 017 lo aplica |
| 13 | Si los parámetros se etiquetan al crearlos con `PutParameter` | ADR-0034, fila 9 | **Cerrado por la 015** (ADR-0034, nota del 2026-09-26: sí, con `ssm:AddTagsToResource`). La 017 lo concede |
| 14 | Si Scheduler y SES se atribuyen al presupuesto por etiqueta | ADR-0034, fila 9; `specs/016-scheduled-jobs/questions.md` §1.3, §1.6 y §9 | **018**, al mes de desplegar, con Cost Explorer |
| 15 | Qué ARN de identidad evalúa SES con un dominio verificado | `specs/016-scheduled-jobs/questions.md` §1.1 y §9 | **017** si hay fuente (E3 bloque 0.1); si no, **018** |
| 16 | Si IAM Identity Center da `aws:MultiFactorAuthPresent`, y qué principal asume el rol de administración | ADR-0034, fila 16 y nota del 2026-09-27; C5 | **017** con fuente si la hay (E1 bloque 0.5); la decisión, **018** con C5 |
| 17 | Cuánta concurrencia hay que dejar sin reservar | ADR-0034, fila 13; C12 | Documentado por la 016 (`questions.md` §1.7: «hasta la no reservada menos 100»); el número, **018** con C12 |
| 18 | La duración de la petición más rápida que lee SSM, para la concurrencia de `dev` | ADR-0034, fila 13 («la 017 mide esa duración y fija la concurrencia») | **No se puede medir sin AWS.** La 017 escribe la fórmula y un valor prudente (§13 P10); **018** mide |
| 19 | El simulador de políticas de IAM con los tres escenarios | ADR-0034, fila 5 y «Consecuencias» | **018**, antes del primer `apply` (decisión de la dirección del 2026-09-28); en la **017**, el análisis estático de §4 |
| 20 | `s3:ListBucket` con `s3:prefix` y el `404` de una clave que falta | Hoja de ruta, 018; `specs/015-api-access/questions.md` §23.1 | **018**. La 017 lo escribe con la condición, y el procedimiento de la 018 dice la salida si da `403` |
| 21 | `s3:ObjectCreationOperation` en la política de `backups/*` | `specs/016-scheduled-jobs/contracts/iam-permissions.md` §4 | **018** |
| 22 | Cómo entrega la Function URL las *cookies*, y que la Lambda recibe `Sec-Fetch-Site` y `Origin` | Hoja de ruta, 018 | **018**; la 017 deja la política de origen que las reenvía |
| 23 | La atomicidad de `PutParameter`, la lectura justo después de revocar y la carrera de dos `PutObject` condicionales | Hoja de ruta, 018; ADR-0033, nota del 2026-09-26 | **018** |
| 24 | Las órdenes de `update-schedule` del procedimiento del BCE, el tiempo y la memoria reales de las funciones | `specs/016-scheduled-jobs/questions.md` §20.8 | **018** |

## 7. Coste

**Una tabla por recurso**, en `specs/017-infrastructure-as-code/cost.md`, con: el recurso, en qué entorno o parte, **su coste mensual estimado en la cuenta de pago**, **la fuente** (página de precios de AWS con la fecha de consulta, o la ADR que ya lo verificó) y **qué lo haría crecer**. **La suma tiene que salir en el orden de 0,01 a 0,05 $ al mes** (ADR-0028, «Consecuencias»; ADR-0034, «Consecuencias»); si no sale, **para** y dilo. Con estos puntos de partida, que **verificas**:

| Pieza | Lo que ya dicen los documentos | Qué vigilar |
|---|---|---|
| CloudFront con el plan Free y su *web ACL* | 0 $ (ADR-0028, opción 3; ADR-0034, F9); como mucho 3 planes Free por cuenta | **Una *web ACL* fuera del plan: 7-8 $ al mes**, y la alarma salta cada mes. El orden entre crearla y suscribir el plan (E2 bloque 0.2) |
| `dev` sin plan Free (C11 con uno libre) | Debería caber en el nivel gratuito de CloudFront, **sin techo** (ADR-0034, fila 19) | Cada petición se cobra aunque el origen falle; en reposo, desactivada |
| Lambda (API y cinco tareas) | Nivel gratuito **compartido** con los otros proyectos (`docs/specification.md` §9.3) | A precio de lista si otros lo agotan: céntimos |
| S3 (datos, SPA, estado) | Céntimos al año (`docs/specification.md` §9.3; ADR-0002) | Las versiones no vigentes sin regla de ciclo de vida; las subidas multiparte a medias |
| SSM estándar | Sin coste (ADR-0033, F1) | **El rendimiento alto** y los parámetros avanzados son de pago (C16) |
| KMS | `aws/ssm`, sin coste de clave; 20.000 peticiones gratis **compartidas** (ADR-0033, F16) | **La clave del cliente, 1 $ al mes**, solo con C2, y entonces la alarma sube a 2 $ |
| SES | 0,10 $ por 1.000 correos: unos 10 al mes, ≈ 0,001 $ (ADR-0028, fila 17) | — |
| EventBridge Scheduler | — | **A verificar**: el nivel gratuito y el precio por invocación |
| CloudWatch Logs | — | **A verificar**: ingesta y almacenamiento en `eu-west-1`; **la retención de 30 y 7 días** es lo que lo acota (ADR-0028, fila 16) |
| CloudFront Functions | — | **A verificar**: si el plan Free las incluye (E2 bloque 0.2) |
| Budgets, IAM, límites de permisos, Access Analyzer de acceso externo, ACM público, activación de la etiqueta | 0 $ (ADR-0034, F1 y «Consecuencias»; ADR-0028, filas 9 y 11) | Budgets con acciones o informes sí cuesta (F1): no se usan |
| CloudTrail | Atlas no crea ningún *trail* (ADR-0034, fila 10) | Un segundo *trail*: 2 $ por cada 100.000 eventos **de toda la cuenta** (F8) |
| DNS | En el registrador, sin zona de Route 53 (ADR-0028, fila 19) | Una zona alojada: 0,50 $ al mes (`docs/specification.md` §9.2) |

**Recuerda, y escríbelo en la cabecera de `cost.md`: cualquier `apply` necesita el visto bueno del usuario con esta estimación delante. En la 017 no hay ningún `apply`.** La 018 contrasta la estimación con Cost Explorer al mes de desplegar (ADR-0034, «Consecuencias»).

## 8. Fuera de alcance y bloqueado

- **Todo `apply`, toda llamada a AWS y toda credencial** (018 y 019). **Las comprobaciones C1-C19** de ADR-0034: las hace el usuario, con credenciales de solo lectura, antes de la 018, **y ningún agente las ejecuta**; tú diseñas para todas sus salidas.
- **Los pasos manuales del usuario**: el cliente OAuth de Google por entorno (ADR-0027), la verificación de las identidades de SES, los registros DNS en el registrador (el CNAME de la validación del certificado y el del subdominio), la petición de cuota de concurrencia si hace falta (ADR-0034, fila 20). **Tus procedimientos los describen; no los ejecuta nadie en esta feature.**
- **Activar el `plan` y los despliegues en la CI**: 018 (§5).
- **Cambiar código de las aplicaciones o del dominio**, salvo lo que decida §13 P9 para el guion de los secretos. Si la infraestructura necesita que una Lambda cambie (una variable, un permiso que el código no usa), **es una pregunta**, no un cambio.
- **Aceptar una ADR** (puedes proponerla, con `/adr`), reabrir una aceptada, cambiar el esquema del libro o el contrato de `docs/api.md`, o **cambiar un contrato de permisos** de la 015 o la 016.
- **Proteger los objetos de `backups/` con S3 Object Lock** (ADR-0032, «Consecuencias»: su coste y su encaje con Terraform, sin verificar). No se propone.

## 9. Autocomprobación antes de abrir cada PR

**Antes de congelar y de pedir revisión**, pasas **todas** las familias sobre lo que cambia esa entrega y escribes en `questions.md` una tabla: **familia, qué miraste, con qué orden o test, y lo que salió**. «No aplica» vale solo con el motivo escrito.

**De `docs/prompts/016-scheduled-jobs.md` §5 siguen valiendo, con su texto**, las familias **1** (guardianes que se pueden eludir), **2** (reglas sin su test o tests que no fijan el valor exacto), **4** (documentos desalineados con el código y la descripción de la PR desactualizada), **6** (registros con datos sensibles, también en los caminos de fallo), **7** (entradas del exterior sin validar de forma estricta), **9** (procedimientos imposibles en el estado en que se ejecutan, o que dejan secretos en el historial) y **10** (`--yes` en operaciones destructivas). En esta feature significan:

1. **Guardianes eludibles**: cada guardián de §4 mira **el `plan` renderizado**, no el texto de los `.tf`. **Compruébalo con la batería de elusiones propia de Terraform**: el comodín que llega de una variable, de un `concat()`, de un `dynamic`, de un `for_each` o de un `templatefile()`; la política en línea (`inline_policy`) frente a la adjunta; la política adjuntada con `aws_iam_role_policy_attachment` a una gestionada por AWS. Cada una, vista morir **por su regla**.
2. **Tests con el valor exacto**: una política se compara con su contrato **acción a acción y recurso a recurso**, nunca «contiene `s3:GetObject`». Una retención, `30` y `7`, no «mayor que cero».
4. **Documentos alineados**: la CSP de la función, con la `<meta>`; las variables `ATLAS_*`, con los analizadores del código; los `Input`, con `scheduler-event.md`; las horas, con `plan.md` §6 de la 016; los nombres de las variables de Terraform, con los procedimientos de la 016. **Cada afirmación de un comentario o de un procedimiento cita fichero y recurso**.
6. **Registros**: los de los guiones y los de la CI. **Ningún guion imprime un valor de un secreto, una dirección o el dominio**, tampoco en su camino de fallo (un `aws` simulado que falla con el valor en su mensaje).
7. **Entradas del exterior**: cada variable de `terraform.tfvars` con su bloque `validation` (el entorno, `dev` o `prod`; la región; el sufijo; la dirección con la regla de `ssm-and-config.md`; el identificador de la cuenta, doce cifras); los guiones, con sus argumentos leídos de forma estricta (`--env __proto__` no encuentra nada).
9. **Procedimientos**: cada paso, ejecutable en el estado que deja el anterior, recorrido contra el `aws` simulado; nada personal ni secreto en una línea de orden.
10. **`--yes`**: ningún guion que sobrescriba, cancele o destruya lo acepta.

**Y diez familias nuevas, propias de la infraestructura como código:**

11. **Comodines en IAM.** Ningún `"Action": "*"`, `"<servicio>:*"` ni `"Resource": "*"`, salvo **una lista cerrada** de acciones que AWS no deja acotar por recurso, cada una con su fuente (*Service Authorization Reference*) y, si el servicio lo admite, con una condición que la acote. `iam:PassRole` siempre con el ARN exacto y `iam:PassedToService`. **Ningún `ReadOnlyAccess`** ni otra política gestionada ancha (ADR-0034, fila 5).
12. **Recursos sin etiquetas.** `default_tags` del proveedor con `project=atlas`, `env=<entorno>` y `managed_by=terraform` (ADR-0034, fila 3), y **la lista de recursos que no las heredan o no las admiten** (los que no son etiquetables, como la activación de la etiqueta o un permiso de Lambda; los que solo se etiquetan por grupo, como las programaciones; lo que crea el *bootstrap* de la cuenta sin entorno), escrita y comprobada por un test sobre el `plan`: todo recurso etiquetable del `plan` lleva las tres.
13. **Secretos en el estado o en el `plan`.** Ningún recurso `aws_ssm_parameter` de tipo `SecureString`, ninguna fuente de datos que lea un `SecureString` (`with_decryption`), ningún secreto en una variable de entorno de una Lambda, ninguna variable de Terraform que reciba un secreto. **Un test lo busca en el `plan` de cada `run`**, y otro busca en los ficheros del estado simulado las cadenas centinela de los secretos que los tests del guion usan.
14. **`prevent_destroy` y protecciones.** Los buckets del estado y de datos con `prevent_destroy` según §13 P8 y **`force_destroy = false`**, el versionado sin posibilidad de suspenderse desde el despliegue (política del bucket, fila 6), los recursos compartidos de la cuenta con `prevent_destroy` y fuera de todo `destroy` de Atlas (filas 11 y 14). **Recuerda que `prevent_destroy` no admite variables**: lo que cambia por entorno se resuelve con la forma que decida §13 P8, y un test comprueba en qué recursos está.
15. **Deriva.** Nada de lo que crea Terraform se cambia a mano, salvo lo que un procedimiento escrito ya dice (la programación del BCE de la 016); **`dev_active` es la única palanca** de la distribución de `dev`; **cada `ignore_changes` con su motivo** en un comentario y en la tabla; ningún recurso creado por un guion que Terraform también declare.
16. **Cruce entre entornos.** Ningún literal `dev` ni `prod` en `infra/modules/`; cada ARN construido con el entorno; cada rol de un entorno solo nombra ARN de su entorno; **y las dos cerraduras**, identidad y recurso, cada una con su test **por separado**, de modo que quitar una sola haga fallar un test.
17. **Datos personales en el repositorio.** Ni la cuenta, ni el dominio, ni una dirección, ni un sufijo real en ningún fichero versionado; los ejemplos con marcadores; `.gitignore` con las reglas de §2 bis y **un test que crea un `terraform.tfvars` y un `terraform.tfstate` de mentira en el árbol y comprueba que `git check-ignore` los ignora**; `gitleaks` limpio.
18. **Registros públicos de la CI.** Las reglas de §5, cada una con su test sobre los ficheros de los flujos.
19. **Región y ámbito.** Todo en `eu-west-1` salvo el certificado de ACM, la *web ACL* de una distribución y lo que sea global (ADR-0028, fila 4); dos proveedores con alias, y un test que comprueba en qué región cae cada recurso del `plan`.
20. **Autobloqueo.** Ninguna denegación deja fuera a quien tiene que poder arreglarla: el principal de administración del usuario, en el bucket del estado (fila 15); el rol de despliegue y el de administración, en la configuración del bucket de datos (fila 6); y el *root* como última salida, escrito en el procedimiento (ADR-0034, fila 16, y F12). Un test por cada una.

## 10. Criterios de terminado

Valen **para cada entrega**, sobre lo que construye, y para la feature entera al final:

- `lint`, `typecheck`, las dos pasadas de la cobertura, `build` y la CI **en verde**, **con el trabajo de verificación de `infra/`** (§5, punto 1) si la P1 lo permite; `packages/domain` al **100 %** si esta feature lo toca (§13 P9); **los tests de arquitectura** con la cuenta de sus tests igual o mayor que en `develop`.
- **`terraform fmt -check`, `validate` y `terraform test` en verde** en cada raíz, **con un `run` por cada salida de la matriz** de las comprobaciones, para los dos entornos; **el análisis estático de §4 en verde**; **ningún `apply`, ninguna llamada a AWS y ninguna credencial** en todo el historial de la rama, comprobado por el guardián.
- **Los tres escenarios de ADR-0034, fila 5**, resueltos por el análisis estático: el 1 y el 3, denegados; el 2, denegado o con su hueco escrito; **ningún hueco entre `dev` y `prod`**.
- **La casilla de la plantilla de PR**, con su test (E1, bloque 4).
- **La autocomprobación de §9**, pasada y escrita, las diecisiete familias.
- **El bloque 0 de cada entrega**, escrito y reportado antes de su primer commit de código, cada verificación con su fuente, su fecha y su salida.
- **La tabla de §6** con cada fila cerrada o pasada a la 018 con su prueba; **la tabla de coste de §7**, cerrada y dentro del orden de magnitud.
- **Tests vistos en rojo primero**, y de cada arreglo, **cómo lo viste en rojo** y **qué volviste a mirar alrededor**, en `questions.md`.
- **Revisión por mutación**, con la disciplina de §2 ter y las reglas de memoria de §2 quater. Los mutantes se hacen **sobre los `.tf`, los guiones y los flujos**, y cada uno tiene que morir por un test, visto morir:
  - **E1**:
    1. un `sub` con comodín, o el `sub` de `plan` con `environment:`, en una confianza;
    2. `ReadOnlyAccess`, o cualquier política gestionada ancha, en el rol de `plan`;
    3. el rol de despliegue que puede crear un rol **sin** su límite de permisos, o quitárselo, o tocar un rol del *bootstrap*;
    4. quitar la denegación de `TagResource` fuera del propio `env`, o la de cambiar `project` o `env`;
    5. el límite de permisos sin `aws:RequestedRegion`, o que deja pasar `organizations:*`;
    6. la política del bucket del estado que deja a `atlas-dev-*` leer `envs/prod/*`, o que deja fuera al principal de administración;
    7. el presupuesto sin el filtro de la etiqueta, a otro umbral que 1 $ (2 $ con la clave), o sin excluir los créditos;
    8. el proveedor OIDC, el analizador o una identidad de SES creados sin `prevent_destroy`, o creados cuando la variable dice «usar»;
    9. la casilla del *bootstrap* borrada de la plantilla;
    10. `*.tfvars` o `*.tfstate` fuera de `.gitignore`;
  - **E2**:
    11. un permiso de más en el rol de la API respecto del contrato (por ejemplo `s3:DeleteObject`, o `ssm:DeleteParameter`, o `ssm:LabelParameterVersion`), o uno de menos (`ssm:AddTagsToResource`, `s3:ListBucket` sobre `ledger/`);
    12. la política del bucket de datos sin la denegación a los principales de otro entorno, o sin la de los listados;
    13. la política de `backups/*` sin la condición `s3:if-none-match`;
    14. el permiso de la Function URL o la política del bucket de la SPA con `AWS:SourceAccount` en lugar de `AWS:SourceArn`, o sin `lambda:InvokeFunction` si el bloque 0 lo confirma;
    15. `/api/*` con una política de caché que cachea, o una política de origen que no reenvía una de las cuatro cabeceras;
    16. la función de la CSP en `/api/*` pisando la del origen, o su CSP distinta de la `<meta>`, o sin `frame-ancestors 'none'`;
    17. la distribución de `dev` con `enabled = true` sin `dev_active`;
    18. una *web ACL* en `dev` en la salida sin plan Free, o ninguna regla de ritmo sobre `/api/*` en la salida con plan;
    19. el destinatario o el dominio sin `sensitive = true`, o **la cuenta con `sensitive = true`**;
    20. un `SecureString` como recurso de Terraform, o el destinatario escrito por el guion de los secretos;
    21. una retención de registros distinta de 30 y 7, o un grupo de registros que no crea Terraform;
    22. una variable `ATLAS_*` de más o de menos en la API;
  - **E3**:
    23. `ses:SendEmail` en un rol que no es el de correo, o el de correo alcanzando `P/prices/*`;
    24. la condición de SES sin `Null` = `false`, o con otro destinatario que el de la variable;
    25. el rol de precios sin la denegación de `symbols.json` y `config.json`;
    26. una programación de `dev` en `ENABLED`, un `Input` distinto del contrato o otra zona horaria;
    27. una concurrencia reservada distinta de 1 en una tarea, o reintentos distintos de los del contrato;
    28. `ATLAS_JOB_MAX_RUN_SECONDS` distinto del `timeout`, o una variable `ATLAS_*` de más o de menos en una tarea;
    29. las claves de precios, o `ATLAS_PRICE_SOURCES=simulated`, en la configuración de `prod`;
  - **E4**:
    30. el guion de los secretos que acepta el valor en un argumento, lo imprime, o sobrescribe sin que se teclee el entorno;
    31. el guion del plan que no es idempotente, o que cancela sin confirmación;
    32. el trabajo de `plan` con `environment:`, con `npm ci`, con `terraform show` sin filtro o subiendo el `plan` como artefacto;
    33. una acción de GitHub fijada por etiqueta en lugar de SHA, o `permissions` más anchos que los necesarios;
    34. el despliegue de `prod` que reconstruye el artefacto en lugar de promocionar el de `dev`, o que sube `dist/.vite/`;
    35. un paso de un procedimiento que no se puede ejecutar en el estado que deja el anterior;
  - **Siempre**: 36. **un test que llega a AWS** (el guardián de las credenciales); 37. **un comodín nuevo** fuera de la lista cerrada; 38. **un dato personal** en un fichero versionado.
- **`docs/` sin cambios**, salvo una ADR en estado `Propuesta` si la propones. Y `specs/017-infrastructure-as-code/questions.md` con: el bloque 0 de cada entrega y sus fuentes, la autocomprobación de cada entrega, lo preguntado y lo respondido, el SHA congelado, cómo viste fallar cada test, la tabla de §6, los procedimientos y su ensayo, y **la lista de documentos que la dirección tendrá que actualizar**. Como mínimo:
  - **ADR-0028**: el enlace y el estado de la PR del proveedor (excepciones); los permisos de KMS para `aws/ssm` (nota de ADR-0033); la CSP que respeta la `sandbox`; lo que admite el plan Free;
  - **ADR-0034**: lo que cierra el bloque 0 (filas 5, 14 y 16; opciones 2 y 3); **una nota fechada con el simulador de IAM movido a la 018** y el análisis estático en la 017 (fila 5 y «Consecuencias»); la duración de SSM de la fila 13, que pasa a la 018; lo que decida §13 P5 sobre el estado que lee el rol de `plan`;
  - **ADR-0033**: los permisos de KMS; **ADR-0027**: el guion de los secretos, hecho;
  - `docs/decision-roadmap.md`: la 017 hecha, la entrada de la 017 que decía «solo `fmt` y `validate`» (ahora también `plan` con el proveedor simulado), y la lista de la 018 con lo que esta feature le deja (§6);
  - `docs/specification.md` §9.3 (la tabla de costes, si cambia), §11.4 y §11.6;
  - `docs/dependencies.md`: Terraform, el proveedor y lo que autorice §13 P1 y P2;
  - `docs/runbooks/`: los procedimientos de esta feature, y la redacción que cambia en `stolen-google-account.md` y `revoke-all-tokens.md` (el guion ya existe);
  - los procedimientos de la 016 (`mail-recipient-and-amounts.md` y `cloud-symbols-and-budgets.md`), con los nombres de variables que fijes;
  - `CLAUDE.md`, si cambia algo de *Where things live* (los `terraform.tfvars` de las partes del *bootstrap*) o de *Infrastructure*;
  - `docs/prompts/README.md`.
- **`npm run lint` como último paso** de cada entrega, redirigiendo a un fichero y leyendo `$?`. Commits de una línea, sin rastro de IA, uno a uno en verde, y la rama empujada.

## 11. Decisiones

### 11.1 Lo que ya está decidido, con su fuente (este prompt no lo reabre)

- **(a) Una cuenta compartida, sin organización ni cuentas miembro**, con `dev` y `prod` permanentes y `dev` en reposo. *Fuente:* ADR-0034, Contexto y filas 1 y 2 (decisión del usuario del 2026-09-25, que no se reabre).
- **(b) Nombres, etiquetas, límite de permisos, dos cerraduras y SSE-S3.** *Fuente:* ADR-0034, filas 3, 4, 6, 7 y 8.
- **(c) Roles de despliegue y de `plan` distintos, `sub` exactos y el `plan` sin `ReadOnlyAccess` ni secretos.** *Fuente:* ADR-0034, filas 5, 14 y 21; ADR-0028, fila 13.
- **(d) El *bootstrap* por entorno más una parte de la cuenta, con el estado local fuera del repositorio, reaplicado a mano, `dev` primero, con su casilla en la plantilla de PR.** *Fuente:* ADR-0034, filas 15 y 20, y su nota del 2026-09-26; `CLAUDE.md`, *Where things live*.
- **(e) Un solo presupuesto, `atlas-cost`, filtrado por `project=atlas`, a 1 $ antes de créditos, creado por el *bootstrap***, y la activación de la etiqueta con Terraform en una segunda pasada. *Fuente:* ADR-0034, filas 9 y 20; ADR-0028, fila 9.
- **(f) Ningún *trail* propio; el analizador y el proveedor OIDC, usados o creados como compartidos.** *Fuente:* ADR-0034, filas 10, 11 y 14.
- **(g) SES: una identidad por dirección, en el *bootstrap* de la cuenta, y la condición de IAM sobre remitente y destinatario, verificada por la 016 contra la API v2.** *Fuente:* ADR-0034, fila 12; `specs/016-scheduled-jobs/questions.md` §1.1 y §9.
- **(h) CloudFront: una distribución, un certificado, una *web ACL* y una función de la CSP por entorno; `AWS:SourceArn`; el plan Free según C11; la suscripción por un guion de la CLI.** *Fuente:* ADR-0028, filas 6, 14 y 15, y excepciones; ADR-0034, filas 17 a 19.
- **(i) Los valores de los secretos nunca pasan por Terraform**; los crea un guion versionado con el rol de administración; Terraform solo escribe los dos `String` del correo. *Fuente:* ADR-0034, filas 12 y 21; ADR-0027, nota del 2026-09-25; `specs/016-scheduled-jobs/contracts/ssm-and-config.md` §1.
- **(j) Los permisos de cada Lambda son los de sus contratos.** *Fuente:* `specs/015-api-access/plan.md` §10; `specs/016-scheduled-jobs/contracts/iam-permissions.md`; `docs/decision-roadmap.md`, «Lo que la 015 le deja a la 017».
- **(k) La política de origen de `/api/*` reenvía `x-atlas-device-token`, `x-atlas-expected-device`, `Sec-Fetch-Site` y `Origin`; `/api/*` con `CachingDisabled`.** *Fuente:* `docs/api.md` §8; «Lo que la 015 le deja a la 017».
- **(l) La regla de ritmo del WAF sobre `/api/*` y la concurrencia reservada**, que protegen el cupo de SSM compartido. *Fuente:* hoja de ruta, entrada de la 017; ADR-0034, fila 13.
- **(m) Registros con retención de 30 días en `prod` y 7 en `dev`, grupos creados por Terraform.** *Fuente:* ADR-0028, fila 16; ADR-0034, fila 3.
- **(n) Construir una vez y promocionar.** *Fuente:* ADR-0028, bloque «Terraform»; constitución, Entornos.
- **(o) En esta feature no hay ningún `apply`; el simulador de IAM, en la 018; en la 017, `fmt`, `validate`, `plan` sin cuenta y análisis estático.** *Fuente:* el encargo de la dirección de este prompt (2026-09-28), que precisa la hoja de ruta («solo `fmt` y `validate`») y ADR-0034, fila 5.
- **(p) Instalar cualquier herramienta es decisión del usuario.** *Fuente:* `CLAUDE.md`, *Git*; hoja de ruta, «Etapas pendientes», 017.

### 11.2 Lo que propone el plan y confirma la dirección en el alto

Sin elegir tú: cada una, **marcada como propuesta** en el plan, con su motivo.

- **(a)** La forma exacta de `infra/` y los nombres de sus raíces y módulos.
- **(b)** Los nombres de las variables de Terraform y de los `terraform.tfvars` de las partes del *bootstrap* (propuesta de quien redacta: `~/personal/atlas/privado/terraform/bootstrap/<account|dev|prod>/terraform.tfvars`, junto a su estado).
- **(c)** La versión exacta de Terraform y del proveedor `hashicorp/aws`, con la versión mínima que exija `mock_provider`.
- **(d)** La arquitectura de las Lambdas (`arm64` o `x86_64`): los dos artefactos son JavaScript puro empaquetado por `esbuild`; si no hay nada nativo dentro, `arm64` es más barata. Con la comprobación escrita.
- **(e)** El tiempo máximo y la memoria de la Lambda de la API (los de las tareas ya están en `iam-permissions.md` §9).
- **(f)** Cómo queda la lista cerrada de comodines de la familia 11, acción a acción.
- **(g)** Las zonas de revisión de cada entrega, con sus ficheros (§2 quater).
- **(h)** Cómo recorre el `aws` simulado los guiones, y dónde viven sus ensayos.

## 12. Respuestas de la dirección, y errores de este prompt

*(Vacío.)*

## 13. Preguntas abiertas para la dirección

Lo que este prompt no puede decidir, cada una con la recomendación de quien redacta. **P1 bloquea el primer commit de código**; las demás se pueden contestar en el alto del plan.

- **P1 — Instalar Terraform** (hay que preguntárselo al usuario). Sin él no se ejecuta ni `fmt`. Incluye: **la CLI de Terraform** en la máquina del usuario, con versión exacta, desde el binario oficial de HashiCorp; **el proveedor `hashicorp/aws`**, que baja `terraform init`, con versión exacta y su `.terraform.lock.hcl` versionado; y **en la CI**, la acción `hashicorp/setup-terraform` fijada por SHA. Van a `docs/dependencies.md` como herramientas. **La CLI de AWS no hace falta** en esta feature (los guiones se prueban con un `aws` simulado); la necesitará el usuario en la 018. La licencia de Terraform (BSL desde la 1.6) no afecta a un uso personal, y el *stack* ya fija Terraform (`CLAUDE.md`), así que no se reabre. **Recomendación: sí, las tres**, porque es la única forma de cumplir §4.

- **P2 — Analizadores estáticos** (`tflint`, `checkov`, `trivy`…). Ninguno está en `docs/dependencies.md`, y cada uno es una herramienta más que mantener veinte años: `checkov` trae un árbol de Python, `tflint` necesita además su conjunto de reglas de AWS. **Recomendación: ninguno por ahora.** Las reglas que importan aquí son propias (los contratos, las dos cerraduras, la lista cerrada de comodines) y ningún analizador general las conoce; se escriben como tests sobre el `plan` renderizado (§4). Si una revisión encuentra una familia que un analizador habría visto, se reconsidera con esa evidencia.

- **P3 — La forma del análisis estático que sustituye al simulador de IAM en la 017.** (a) **Afirmaciones estructurales por escenario**: por ejemplo, que toda sentencia `Allow` del rol de `dev` sobre CloudFront lleva la condición de su `env` o un ARN de `dev`, que existe la denegación de `TagResource` fuera de su `env`, y que ninguna sentencia del rol de despliegue concede una acción de cambio sobre la OAC o las políticas; (b) **un evaluador mínimo de IAM** escrito en los tests, limitado a los operadores que usa Atlas; (c) **un simulador fuera de línea** de terceros como dependencia de desarrollo (hay paquetes de npm que evalúan políticas sin AWS), que exige verificar su fidelidad y la autorización del usuario. **Recomendación: (a)**, que no pretende evaluar IAM entero y no puede equivocarse en silencio sobre un operador que no conoce; **más el simulador real en la 018, como condición del primer `apply`**, con los tres escenarios y los que añada la revisión. La (b) promete más de lo que puede probar; la (c) añade una dependencia para algo que la 018 hará con la herramienta de AWS.

- **P4 — Las políticas de CloudFront: gestionadas o propias.** La de solicitud al origen de `/api/*`: (a) **la gestionada `AllViewerExceptHostHeader`**, pensada para orígenes Function URL (ADR-0033, F6), que reenvía todas las cabeceras del visitante salvo `Host`, las cuatro de `docs/api.md` §8 y `x-amz-content-sha256` incluidas; (b) una propia que nombra la lista. La de cabeceras de respuesta: la gestionada `SecurityHeadersPolicy` o ninguna, porque el plan Free no admite propias (ADR-0028, fila 14). **Recomendación: (a) y la gestionada de seguridad**, si el bloque 0 de E2 confirma lo que reenvía y que el plan las admite: nada que crear en el *bootstrap* salvo las OAC, nada que mantener, y ninguna cabecera que olvidar cuando la API añada otra. La Lambda valida cada cabecera, así que reenviar de más no abre nada. La (b) solo si la (a) no reenvía algo que haga falta.

- **P5 — El rol de `plan` lee el estado, y el estado guarda en claro el dominio y el destinatario.** `sensitive = true` los tapa en el `plan`, **no en el estado** (el valor del parámetro `String`, la condición de SES, los alias de CloudFront). Como el `sub` de una PR no lleva la rama de destino, **cualquier rama del repositorio** puede asumir el rol de `plan` con un flujo modificado, bajar el estado e imprimirlo en un registro público (ADR-0034, fila 21, razona lo mismo para los secretos). Solo quien puede empujar ramas al repositorio (el usuario y sus agentes) llega a hacerlo: un *fork* no recibe el token. **Opciones:** (a) aceptarlo como riesgo escrito en ADR-0034, con el trabajo de `plan` sin código de terceros; (b) el `plan` en la CI solo al empujar a `develop` y `main`, no en las PRs, con otro `sub`, lo que enmienda la fila 14; (c) sin `plan` en la CI: el usuario lo ejecuta en local antes de cada `apply`. **Recomendación: (a).** Lo que se expone es un dato personal, no un secreto; quien podría abusar ya tiene la máquina donde vive `terraform.tfvars`; y el `plan` en la PR es lo que pide `CLAUDE.md` (*Infrastructure*). Si la dirección prefiere no aceptarlo, la (c) es la que no toca ninguna ADR.

- **P6 — De dónde saca la CI los valores de `terraform.tfvars`.** El trabajo de `plan` no puede declarar *environment* (§5), así que no ve los secretos de un *environment*. **Recomendación:** **secretos del repositorio** para lo que necesitan el `plan` y el despliegue de `dev` (que tampoco declara *environment*: su confianza es por rama), y **secretos del *environment* `prod`** para el despliegue de `prod`. GitHub enmascara los secretos en los registros, lo que protege contra un `echo` accidental, no contra un flujo modificado (P5).

- **P7 — Los flujos de despliegue y la identidad del artefacto que se promociona.** ¿Los escribe la 017, inactivos, o la 018? Y ¿cómo llega a `prod` el mismo artefacto que se validó en `dev` a través de la fusión de `release/*` a `main` (ADR-0028: «se fija en la feature»)? Opciones para lo segundo: (a) **un bucket de artefactos** en la parte de la cuenta del *bootstrap*, que escribe solo el despliegue de `dev` (por SHA de commit y SHA-256 del fichero) y del que lee el de `prod`, con una regla que expira lo viejo; (b) reconstruir en `main` y comparar el SHA-256 con el que se desplegó en `dev`, que exige *builds* deterministas (lo son los dos ZIP; la SPA de Vite, sin verificar). **Recomendación: la 017 los escribe, inactivos e inertes** (el rol no existe hasta el *bootstrap*), **con (a)**: es la lectura literal de «construir una vez y promocionar», cuesta ≈ 0 y no depende de que Vite sea determinista. Si la dirección prefiere no añadir un bucket, (b) con la comprobación del hash como condición del despliegue.

- **P8 — `prevent_destroy` en el bucket de datos de `dev`.** La fila 15 y la familia 14 lo quieren en los buckets de datos, pero **el ensayo de la 018 destruye `dev`** (ADR-0032, nota del 2026-09-25; ADR-0034, «Consecuencias»), y `prevent_destroy` **no admite variables** en Terraform. **Recomendación:** **sí en el del estado y en el de datos de `prod`; no en el de datos de `dev`**, con `force_destroy = false` en todos (un bucket con objetos no se borra sin vaciarlo antes con el rol de administración, que es justo el paso del ensayo). Se resuelve con dos recursos alternativos elegidos por el entorno, y un test comprueba cuál lleva la protección.

- **P9 — La forma del guion de los secretos.** (a) **Una orden de la consola, `atlas admin secrets`**, en TypeScript, con el cliente de SSM que ya está instalado, la configuración de `~/.config/atlas/admin.json`, la sesión de administración que ya usan las demás órdenes de `atlas admin` (ADR-0034, nota del 2026-09-27), la confirmación tecleando el entorno y los valores leídos de la entrada estándar o de un fichero `600`, nunca de un argumento; (b) **un guion de *shell* con la CLI de AWS**, en `infra/scripts/`. **Recomendación: (a).** Se prueba con los dobles que ya existen, hereda las reglas de `atlas admin` (sin `--yes`, entorno tecleado, sin registrar valores) y no exige la CLI de AWS en la máquina. Toca `apps/cli` y quizá el dominio (la forma de la lista permitida), con sus reglas de cobertura, y va en E4 con su zona. ADR-0034, fila 21, dice «un guion versionado en el repositorio»; una orden versionada lo cumple. La (b), si la dirección prefiere que no sea código de la aplicación.

- **P10 — La concurrencia reservada.** ADR-0034, fila 13, pide que la 017 **mida** la duración de la petición más rápida que lee SSM y fije con ella la concurrencia de `dev`, lejos de 40 lecturas por segundo; **sin AWS no se puede medir**. **Recomendación:** la 017 deja **una variable por función**, con la fórmula escrita (lecturas por segundo ≤ concurrencia ÷ duración de la petición más rápida que lee SSM) y valores prudentes: **`dev` 1 en la API**, `prod` un número pequeño que la dirección fije (por ejemplo 5), las tareas 1 (contrato), y **una variable que omite la reserva** si C12 dice que la cuenta no tiene margen; la 018 mide y ajusta. Si ni con 1 queda lejos de 40, la defensa es la que ya dice la fila: `dev` activa solo durante las pruebas, más el ritmo del WAF.

- **P11 — Los *source maps* de la SPA.** `dist/.vite/` no se sirve nunca; los `*.map`, «si la dirección lo prefiere» (`specs/015-api-access/questions.md` §15.6). **Recomendación: no servirlos.** Nadie los necesita en producción y el código ya es público en el repositorio.

- **P12 — La partición en cuatro entregas** de §3. **Recomendación: sí**, con E1 sola y primero, porque es la superficie que, mal hecha, alcanza a los otros proyectos de la cuenta.
