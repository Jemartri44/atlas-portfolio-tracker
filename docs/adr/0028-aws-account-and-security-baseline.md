# ADR-0028 — Cuenta de AWS dedicada, entornos y línea base de seguridad

**Estado:** Propuesta (2026-09-24). Ronda 8. Las decisiones son de la dirección y van con su motivo; las cifras y los hechos de la plataforma proceden de la investigación del 2026-09-24, con su fuente. Cierra, al aceptarse, las preguntas de la Ronda 8 original sobre cuentas, *bootstrap*, promoción y alarmas, y la de §14.1 de la especificación sobre OIDC.

## Contexto

La especificación (§9-§11) describe la plataforma y la seguridad, pero no la cuenta ni la línea base concreta, y su §9.4 advierte de la trampa del Free Plan. El relevo de la dirección (`docs/prompts/000-director-handoff.md` §6 y §9) daba la Fase 4 por **descartada** porque exigía gastar dinero. La dirección la reabre con dos datos nuevos: los créditos de la cuenta y un coste estimado de **≈ 0,01-0,05 $/mes** para todo lo de esta ronda, cubierto por esos créditos (investigación del 2026-09-24). **La regla de no gastar dinero sigue en pie**: cualquier servicio con coste recurrente apreciable queda fuera.

## Opciones consideradas

1. **Cuenta.** (a) Desplegar en la cuenta actual del usuario, donde viven otras cosas suyas: sin aislamiento. (b) Una cuenta independiente nueva: aislada, pero otro correo, otra tarjeta y créditos aparte. (c) **Una cuenta miembro dedicada dentro de AWS Organizations** (decidida): aislada, y los créditos **se comparten por defecto con toda la organización** (`docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html`). Organizations y las SCP no cuestan nada.
2. **Entornos.** (a) **`dev` y `prod` en la misma cuenta miembro, separados por sufijo** (decidida, como dice `CLAUDE.md`). (b) Una cuenta miembro por entorno: el aislamiento lo da la propia cuenta, sin coste de AWS, a cambio de duplicar el *bootstrap*.
3. **Cortafuegos de aplicación.** (a) Ninguno. (b) WAF por uso: unos **7-8 $/mes**, fuera de la regla de no gastar. (c) **El plan Free de tarifa plana de CloudFront** (decidido): **0 $**, admitido en cuentas de pago, cubre **1 M de peticiones y 100 GB al mes**, incluye **una web ACL de WAF con 5 reglas, limitación de tasa por IP y protección DDoS**, las peticiones bloqueadas no cuentan y no hay cargos por exceso (`docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html`).
4. **GuardDuty.** Descartado: es de pago y no compensa a esta escala.

## Decisión

| # | Qué | Motivo |
|---|---|---|
| 1 | **Organización.** La cuenta actual del usuario pasa a ser la **cuenta de gestión** y se crea una **cuenta miembro dedicada a Atlas**. Los pasos los da el usuario, con un procedimiento escrito | Aislar Atlas de todo lo demás sin otro correo ni otra tarjeta |
| 2 | **Se aparta de la recomendación de AWS** de tener la cuenta de gestión **sin recursos**. Una persona, sus otras cosas ya viven en esa cuenta, y crear otra con otro correo y otra tarjeta no compensa. **Lo compensa:** MFA en el root de las dos cuentas; **SCP** sobre la cuenta miembro que restringen regiones e impiden desactivar o borrar CloudTrail; ninguna clave de acceso del root | Decisión consciente, no descuido |
| 3 | **Región `eu-west-1`** para todo, salvo lo que CloudFront exige en `us-east-1` (el certificado de ACM). **SES no existe en `eu-south-2`** (`docs.aws.amazon.com/general/latest/gr/ses.html`) | Una región, y con correo |
| 4 | **Todo privado salvo la SPA.** S3 con Block Public Access, servido solo por CloudFront con OAC | Lo único público ya es público: el código |
| 5 | **La Lambda, solo a través de CloudFront** (Function URL con `AuthType=AWS_IAM` y OAC), en la **misma distribución** que la SPA, bajo `/api/*`. Consecuencias de OAC —`Authorization` sobrescrita, hash del cuerpo en `POST`/`PUT`— en ADR-0027 | Mismo origen: cookie del mismo sitio y sin CORS |
| 6 | **S3:** Block Public Access, **versionado con regla de ciclo de vida** que expira las versiones no vigentes (plazo de ADR-0006), **SSE-S3** en lugar de una clave KMS propia (sin coste), política que rechaza lo que no llegue por TLS, y el rol de la API **sin ningún permiso de borrado** | Cada versión se cobra entera, y cada `append` escribe el objeto completo |
| 7 | **Concurrencia reservada baja** para la Lambda de la API (sin coste) | Acota lo que cuesta un ataque |
| 8 | **AWS Budgets** (sin coste) con aviso por correo, con el umbral de §9.4 de la especificación. **Tiene que medir el coste antes de aplicar créditos**: si no, no avisaría nunca mientras duren | Red frente a salirse de lo previsto |
| 9 | **CloudTrail**, un *trail* de eventos de gestión (sin coste salvo el S3 donde se guarda) | Saber qué se hizo en la cuenta y quién |
| 10 | **IAM Access Analyzer** de accesos externos (sin coste) | Detectar un recurso que quede abierto fuera de la cuenta |
| 11 | **Root con MFA independiente de Google**, sin claves de acceso. La administración entra desde la cuenta de gestión con MFA propia; ningún usuario IAM con claves largas | La salida de emergencia de ADR-0027 no puede depender de Google |
| 12 | **Despliegue desde GitHub Actions con OIDC**, un rol por entorno: el de `dev`, solo desde `develop`; el de `prod`, solo desde el *environment* `prod` de GitHub con aprobación obligatoria; el de `terraform plan`, de solo lectura y **nunca** para una PR que venga de un *fork* (el repositorio es público) | Sin claves largas, y sin credenciales para código ajeno |
| 13 | **Cabeceras de seguridad y CSP estricta desde CloudFront.** El plan Free **no admite políticas propias de cabeceras de respuesta**, y la gestionada `SecurityHeadersPolicy` **no pone CSP** (misma fuente que el punto 3 de las opciones). **La CSP va en una CloudFront Function de respuesta**, con `frame-ancestors 'none'`, que una etiqueta `<meta>` no puede expresar; la `<meta>` de `index.html` se queda, para el uso local | La misma política estricta de hoy, servida como cabecera |
| 14 | **WAF: el plan Free**, con una regla de tasa por IP más las reglas gestionadas que el plan admita | Protección sin coste |
| 15 | **Registros** en JSON, sin importes, posiciones ni cuentas (regla vigente), y ahora tampoco tokens, correos ni `sub` (ADR-0027). Retención de 30 días en `prod` y 7 en `dev` | CloudWatch está menos protegido que el libro |
| 16 | **Correo con SES en *sandbox***, con la dirección del usuario verificada; la dirección va en SSM, nunca en el repositorio. Para enviar solo a una dirección propia verificada no hace falta salir del *sandbox*; unos 10 correos al mes cuestan unos **0,002 $** | Correo sin trámite y sin coste apreciable |
| 17 | **DNS en el registrador**, sin zona de Route 53 (ya lo decía §9.2) | Sin coste fijo |
| 18 | **GuardDuty, no** | De pago; no compensa a esta escala |

**Aislamiento de entornos dentro de la cuenta.** Parámetros de SSM bajo `/atlas/dev/` y `/atlas/prod/`; un bucket, una Lambda, unos roles y un cliente OAuth por entorno; la política del bucket de `prod` **deniega** a cualquier principal que no sea un rol de `prod` o la administración. «Datos de producción jamás en `dev`» pasa a ser una política que se puede comprobar, no una costumbre.

**Terraform.** `infra/bootstrap/` (bucket del estado con el bloqueo nativo de S3, proveedor OIDC y roles de despliegue), aplicado **una vez** por el usuario con credenciales de administración; `infra/modules/atlas/` con la pila; `infra/envs/dev/` y `infra/envs/prod/` con sus `.tfvars` fuera del repositorio. **Construir una vez y promocionar:** la integración continua construye la SPA y el paquete de la Lambda una vez, identificados por su hash, y `prod` despliega el mismo artefacto que se validó en `dev`. Cómo se identifica el artefacto a través de la fusión de `release/*` a `main` se fija en la feature.

**Excepciones escritas a «nada creado a mano», cada una con su condición de retirada:**

- **La suscripción al plan de tarifa plana.** Terraform todavía no lo soporta (hay una PR abierta en el proveedor, según la investigación). Va en un **guion idempotente con la CLI de AWS, versionado en el repositorio**. Se retira cuando el proveedor lo soporte.
- **La organización y la cuenta miembro**: pasos del usuario, documentados.
- **El cliente OAuth de Google** (ADR-0027).
- **El *bootstrap*** de Terraform.

## Consecuencias

- **Coste estimado: ≈ 0,01-0,05 $/mes**, cubierto por los créditos (investigación del 2026-09-24). La tabla de costes de §9.3 de la especificación se rehace con esta cifra al aceptar; hoy mezcla límites de un modelo de precios anterior y cuenta con Cognito.
- **Riesgo que queda en la cuenta de gestión.** Según la documentación de AWS Organizations, las SCP **no se aplican a la cuenta de gestión** (a confirmar en la feature de despliegue), y desde ella se administra la miembro. Lo que protege a Atlas de un compromiso de la cuenta de gestión es su MFA, no las SCP.
- **Punto débil de un entorno por sufijo:** el aislamiento depende de que las políticas estén bien escritas. La opción 2(b) lo daría por construcción, sin coste de AWS; queda anotada por si la dirección la reconsidera.
- **La SCP de regiones tiene que dejar pasar `us-east-1`** para el certificado y para los servicios globales (IAM, CloudFront, Budgets, Organizations); una SCP mal escrita los bloquea.
- **Concurrencia reservada: SIN VERIFICAR** que una cuenta recién creada tenga cuota suficiente para reservarla, porque Lambda exige dejar sin reservar un mínimo de la cuota de la cuenta. Si no la tiene, o se pide una ampliación de cuota o la protección la dan la propia cuota de la cuenta y la regla de tasa del WAF.
- **El volumen de versiones del libro crece con su tamaño por el número de escrituras**, porque cada `append` sube el objeto entero. Hoy es irrelevante; cuando el libro pese megas, el plazo de expiración de ADR-0006 es lo que lo acota y conviene revisarlo con la cifra real.
- Al plan Free no le caben más de 1 M de peticiones al mes; **qué hace CloudFront al superarlas no lo dice la investigación**. Con un solo usuario solo se alcanza con un ataque, que es justo lo que el WAF filtra antes.
- El *runtime* de Node de la Lambda caduca periódicamente: actualizarlo es mantenimiento recurrente, como `.nvmrc`.
- Al aceptar: `docs/specification.md` §9.2, §9.3, §9.4, §10, §11.3-§11.8 y §14.1 (OIDC); `docs/prompts/000-director-handoff.md` §6 y §9, que siguen diciendo «Fase 4 descartada, no la propongas»; y la constitución, por las mismas líneas que ADR-0027.
- Relacionadas: ADR-0002, ADR-0006, ADR-0026, ADR-0027, ADR-0032.
