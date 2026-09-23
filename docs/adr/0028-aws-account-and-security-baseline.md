# ADR-0028 — Cuentas de AWS dedicadas, entornos y línea base de seguridad

**Estado:** Aceptada (2026-09-24), por decisión de la dirección, que el mismo día cambia su decisión inicial sobre los entornos (una cuenta con sufijos) por **una cuenta miembro por entorno**. Ronda 8. Las cifras y los hechos de la plataforma proceden de la investigación del 2026-09-24, con su fuente. Cierra las preguntas de la Ronda 8 original sobre cuentas, *bootstrap*, promoción y alarmas, y la de §14.1 de la especificación sobre OIDC.

## Contexto

La especificación (§9-§11) describe la plataforma y la seguridad, pero no la cuenta ni la línea base concreta, y su §9.4 advierte de la trampa del Free Plan. El relevo de la dirección (`docs/prompts/000-director-handoff.md` §6 y §9) daba la Fase 4 por **descartada** porque exigía gastar dinero. La dirección la reabre con dos datos nuevos: los créditos de la cuenta y un coste estimado de **≈ 0,01-0,05 $/mes** para todo lo de esta ronda, cubierto por esos créditos (investigación del 2026-09-24). **La regla de no gastar dinero sigue en pie**: cualquier servicio con coste recurrente apreciable queda fuera.

## Opciones consideradas

1. **Cuenta.** (a) Desplegar en la cuenta actual del usuario, donde viven otras cosas suyas: sin aislamiento. (b) Cuentas independientes nuevas: aisladas, pero otro correo, otra tarjeta y créditos aparte. (c) **Cuentas miembro dedicadas dentro de AWS Organizations** (elegida): aisladas, y los créditos **se comparten por defecto con toda la organización** (`docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html`). Organizations y las SCP no cuestan nada.
2. **Entornos.** (a) `dev` y `prod` en la misma cuenta miembro, separados por sufijo: el aislamiento depende de que todas las políticas estén bien escritas. (b) **Una cuenta miembro por entorno** (elegida): el aislamiento lo da la propia cuenta, sin coste de AWS, a cambio de duplicar el *bootstrap*.
3. **Cortafuegos de aplicación.** (a) Ninguno. (b) WAF por uso: unos **7-8 $/mes**, fuera de la regla de no gastar. (c) **El plan Free de tarifa plana de CloudFront** (elegida): **0 $**, admitido en cuentas de pago, cubre **1 M de peticiones y 100 GB al mes**, incluye **una web ACL de WAF con 5 reglas, limitación de tasa por IP y protección DDoS**, las peticiones bloqueadas no cuentan y no hay cargos por exceso (`docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html`).
4. **GuardDuty.** Descartado: es de pago y no compensa a esta escala.

## Decisión

| # | Qué | Motivo |
|---|---|---|
| 1 | **Organización.** La cuenta actual del usuario pasa a ser la **cuenta de gestión** y se crean **dos cuentas miembro**, `atlas-dev` y `atlas-prod`. Los pasos los da el usuario, con un procedimiento escrito | Aislar Atlas de todo lo demás, y cada entorno del otro, sin otro correo ni otra tarjeta |
| 2 | **Un entorno, una cuenta.** El aislamiento es **por construcción**, no por políticas bien escritas, y hace **mecánica** la regla de que los datos de producción nunca estén en desarrollo: ningún rol de `atlas-dev` existe en `atlas-prod`. Los recursos siguen llevando el sufijo del entorno para que un nombre diga dónde está | La dirección cambió aquí su primera decisión |
| 3 | **Se aparta de la recomendación de AWS** de tener la cuenta de gestión **sin recursos**. Una persona, sus otras cosas ya viven en esa cuenta, y crear otra con otro correo y otra tarjeta no compensa. **Lo compensa:** MFA en el root de las tres cuentas; **SCP** sobre las cuentas miembro que restringen regiones e impiden desactivar o borrar CloudTrail; ninguna clave de acceso del root. **Matiz escrito:** según la documentación de AWS Organizations, las SCP **no se aplican a la cuenta de gestión**; a ella la protege su MFA, no las SCP | Decisión consciente, no descuido |
| 4 | **Región `eu-west-1`** para todo, salvo lo que CloudFront exige en `us-east-1` (el certificado de ACM). **SES no existe en `eu-south-2`** (`docs.aws.amazon.com/general/latest/gr/ses.html`) | Una región, y con correo |
| 5 | **Todo privado salvo la SPA.** S3 con Block Public Access, servido solo por CloudFront con OAC | Lo único público ya es público: el código |
| 6 | **La Lambda, solo a través de CloudFront** (Function URL con `AuthType=AWS_IAM` y OAC), en la **misma distribución** que la SPA, bajo `/api/*`. Consecuencias de OAC —`Authorization` sobrescrita, hash del cuerpo en `POST`/`PUT`— en ADR-0027 | Mismo origen: cookie del mismo sitio y sin CORS |
| 7 | **S3:** Block Public Access, **versionado con regla de ciclo de vida** que expira las versiones no vigentes (plazo de ADR-0006), **SSE-S3** en lugar de una clave KMS propia (sin coste), política que rechaza lo que no llegue por TLS, y el rol de la API **sin ningún permiso de borrado** | Cada versión se cobra entera, y cada `append` escribe el objeto completo |
| 8 | **Concurrencia reservada baja** para la Lambda de la API (sin coste). Si la cuota de una cuenta recién creada no permite reservarla, **el límite bajo de la propia cuenta ya acota el coste**, y **pedir el aumento de cuota** (gratuito) es un paso documentado de la puesta en marcha. La **primera barrera** es la limitación de tasa por IP del WAF | Acotar lo que cuesta un ataque |
| 9 | **AWS Budgets** (sin coste), con **alarma a 1 $** por correo, que mide el **coste antes de aplicar créditos**. Una alarma que no suena mientras duren los créditos no protege de nada | Red frente a salirse de lo previsto |
| 10 | **CloudTrail**, un *trail* de eventos de gestión por cuenta miembro (sin coste salvo el S3 donde se guarda) | Saber qué se hizo en la cuenta y quién |
| 11 | **IAM Access Analyzer** de accesos externos (sin coste) | Detectar un recurso que quede abierto fuera de la cuenta |
| 12 | **Root con MFA independiente de Google**, sin claves de acceso. La administración entra desde la cuenta de gestión con MFA propia; ningún usuario IAM con claves largas | La salida de emergencia de ADR-0027 no puede depender de Google |
| 13 | **Despliegue desde GitHub Actions con OIDC**, un rol por cuenta: el de `atlas-dev`, solo desde `develop`; el de `atlas-prod`, solo desde el *environment* `prod` de GitHub con aprobación obligatoria; el de `terraform plan`, de solo lectura y **nunca** para una PR que venga de un *fork* (el repositorio es público) | Sin claves largas, y sin credenciales para código ajeno |
| 14 | **Cabeceras de seguridad y CSP estricta desde CloudFront.** El plan Free **no admite políticas propias de cabeceras de respuesta**, y la gestionada `SecurityHeadersPolicy` **no pone CSP** (misma fuente que la opción 3). **La CSP va en una CloudFront Function de respuesta**, con `frame-ancestors 'none'`, que una etiqueta `<meta>` no puede expresar; la `<meta>` de `index.html` se queda, para el uso local. **La CSP sigue en `'self'`, sin excepciones para terceros** | La misma política estricta de hoy, servida como cabecera |
| 15 | **WAF: el plan Free**, con una regla de tasa por IP más las reglas gestionadas que el plan admita | Protección sin coste |
| 16 | **Registros** en JSON, sin importes, posiciones ni cuentas (regla vigente), y ahora tampoco tokens, correos ni `sub` (ADR-0027). Retención de 30 días en `prod` y 7 en `dev` | CloudWatch está menos protegido que el libro |
| 17 | **Correo con SES en *sandbox***, con la dirección del usuario verificada. **El destinatario tiene una sola fuente: SSM**, nunca el repositorio y nunca `Settings`. Para enviar solo a una dirección propia verificada no hace falta salir del *sandbox*; unos 10 correos al mes cuestan unos **0,002 $** | Correo sin trámite y sin coste apreciable |
| 18 | **Los correos no llevan importes por defecto**; se puede activar. Es la misma regla que el modo privacidad: lo que sale del perímetro lo guarda el proveedor de correo | Privacidad por defecto |
| 19 | **DNS en el registrador**, sin zona de Route 53 (ya lo decía §9.2) | Sin coste fijo |
| 20 | **GuardDuty, no** | De pago; no compensa a esta escala |

**Terraform.** `infra/bootstrap/`, aplicado **una vez por cuenta miembro** por el usuario con credenciales de administración: bucket del estado con el bloqueo nativo de S3, proveedor OIDC y roles de despliegue. `infra/modules/atlas/` con la pila; `infra/envs/dev/` y `infra/envs/prod/`, cada uno contra su cuenta, con sus `.tfvars` fuera del repositorio. **Construir una vez y promocionar:** la integración continua construye la SPA y el paquete de la Lambda una vez, identificados por su hash, y `atlas-prod` despliega el mismo artefacto que se validó en `atlas-dev`. Cómo se identifica el artefacto a través de la fusión de `release/*` a `main` se fija en la feature.

**Revisión del plazo de las versiones.** La tarea trimestral de integridad informa del tamaño de `ledger/ledger.jsonl`, y **cuando pase de 1 MB** se revisa el plazo de expiración de las versiones no vigentes de ADR-0006 con el volumen real de versiones. ADR-0002 estima menos de 1-2 MB en veinte años, así que el umbral llega, si llega, a mitad de camino.

**Excepciones escritas a «nada creado a mano», cada una con su condición de retirada:**

- **La suscripción al plan de tarifa plana.** Terraform todavía no lo soporta (hay una PR abierta en el proveedor, según la investigación). Va en un **guion idempotente con la CLI de AWS, versionado en el repositorio**. Se retira cuando el proveedor lo soporte.
- **La organización y las dos cuentas miembro**: pasos del usuario, documentados.
- **El cliente OAuth de Google** (ADR-0027), uno por entorno.
- **El *bootstrap*** de Terraform de cada cuenta.
- **La petición de aumento de la cuota de concurrencia**, si hace falta.

## Consecuencias

- **Coste estimado: ≈ 0,01-0,05 $/mes**, cubierto por los créditos (investigación del 2026-09-24). La tabla de costes de §9.3 de la especificación se rehace con esta cifra; hoy mezcla límites de un modelo de precios anterior y cuenta con Cognito.
- Lo que protege a Atlas de un compromiso de la cuenta de gestión es su MFA: desde ella se administran las dos miembro y las SCP no la alcanzan. Que las SCP no se aplican a la cuenta de gestión está **SIN VERIFICAR** con fuente citada en esta ronda; lo comprueba la feature de despliegue antes de escribir nada.
- **La SCP de regiones tiene que dejar pasar `us-east-1`** para el certificado y para los servicios globales (IAM, CloudFront, Budgets, Organizations); una SCP mal escrita los bloquea.
- **`notification_email` deja de leerse.** El destinatario sale de SSM. El campo se sigue **aceptando al cargar**, para no invalidar líneas `settings_changed` ya escritas (ADR-0018: retirarlo del validador sería endurecer), y la interfaz deja de ofrecerlo.
- Al plan Free no le caben más de 1 M de peticiones al mes; **qué hace CloudFront al superarlas está SIN VERIFICAR**. Con un solo usuario solo se alcanza con un ataque, que es lo que el WAF filtra antes.
- El *runtime* de Node de la Lambda caduca periódicamente: actualizarlo es mantenimiento recurrente, como `.nvmrc`.
- Documentos que hay que actualizar: `docs/specification.md` §9.2, §9.3, §9.4, §10, §11.3-§11.8 y §14.1 (OIDC); `docs/business-rules.md` §7 (`notification_email` sale de la lista y se añade el interruptor de importes en el correo); `CLAUDE.md` (entornos: una cuenta por entorno, no solo sufijos; correo); `docs/prompts/000-director-handoff.md` §6 y §9, que siguen diciendo «Fase 4 descartada, no la propongas»; y la constitución, por las mismas líneas que ADR-0027.
- Relacionadas: ADR-0002, ADR-0006, ADR-0026, ADR-0027, ADR-0032.
