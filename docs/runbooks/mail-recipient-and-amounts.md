# El destinatario de los correos y los importes

> Feature 016. Lo que necesita AWS real está sin probar hasta la feature 018: lo dice el final de este procedimiento.

**Cuándo usarlo.** Cuando quieres que los correos lleven los euros (o dejen de llevarlos), o que lleguen a otra dirección.

**Tres reglas, antes de nada:**

1. **Los dos valores tienen una sola fuente: el `terraform.tfvars` del entorno** (`mail_recipient` y `mail_amounts`, `infra/envs/<entorno>/variables.tf`; ejemplo en `terraform.tfvars.example`). La copia de trabajo vive fuera del repositorio (`~/personal/atlas/privado/terraform/<entorno>/terraform.tfvars`, permisos `600`) y **la que aplica el *pipeline* es el secreto `ATLAS_<ENTORNO>_TFVARS_B64`** (el de `prod` es del *environment* `prod`). Terraform escribe con ellos dos parámetros `String` de SSM que lee la función de correo, `/atlas/<entorno>/mail/recipient` y `/atlas/<entorno>/mail/amounts`, y la condición `ses:Recipients` de IAM que impide enviar a cualquier otra dirección (ADR-0028, filas 17 y 18; ADR-0034, fila 12). **Nunca a mano en SSM** (IAM negaría el envío) **ni en `Settings` ni en el repositorio.**
2. **La dirección no pasa por la línea de órdenes**: nada de `-var 'mail_recipient=…'` ni de `echo … >> terraform.tfvars`, que se quedaría en el historial del *shell*. Se escribe con un editor.
3. **Aplicar es publicar el secreto y dejar que el *pipeline* aplique.** `prod` solo se aplica con `deploy-prod.yml` (un empujón a `main` con la aprobación del *environment*); `dev`, con `deploy-dev.yml` en `develop`. Un `terraform apply` a mano no es el camino.

Para publicar el secreto sin que el valor toque el historial: `base64 -w0 <tfvars> | gh secret set ATLAS_PROD_TFVARS_B64 --env prod` (`dev`: `ATLAS_DEV_TFVARS_B64` sin `--env`, secreto del repositorio).

**`mail_sender` aparece también en el `terraform.tfvars` del *bootstrap* del entorno** (acota `ses:FromAddress` en el límite de permisos). Tienen que ser la misma dirección, y nada lo comprueba sobre los ficheros privados: míralo al cambiarla.

## 1. Encender o apagar los importes

Con los importes **apagados**, que es el valor por defecto (ADR-0028, fila 18), los correos no llevan euros, cantidades, precios, posiciones, nombres de activos, ISIN ni cuentas. **Encendidos**, añaden **solo**:
- los euros del reparto del recordatorio mensual;
- los euros de la regla 17 en la revisión semanal.

**Nunca** una cuenta, un ISIN ni un activo. **La Renta y los modelos 720 y 721 no llevan cifras nunca.**

1. Abre el fichero con tu editor:
   ```sh
   "${EDITOR:-nano}" ~/personal/atlas/privado/terraform/prod/terraform.tfvars
   ```
2. Pon `mail_amounts = "on"` para encenderlos, o `mail_amounts = "off"` para apagarlos. **Cualquier otro valor los deja apagados**: la función solo entiende `on` (§8.2 M2).
3. Guarda y cierra. Publica el secreto (arriba) y revisa el `plan` del *pipeline*: tiene que cambiar **solo** el parámetro `/atlas/prod/mail/amounts`. Si cambia algo más, para. Luego lo aplica el despliegue de `prod`.
4. **Comprobar**: el próximo recordatorio mensual dice los euros del reparto, o deja de decirlos. La función lee el parámetro en cada envío, así que no hace falta desplegar nada más.

## 2. Cambiar el destinatario

1. Abre el fichero con tu editor, como en el paso 1 de arriba.
2. Cambia `mail_recipient = "…"` por la dirección nueva: **una sola**, sin nombre delante y sin espacios.
3. Publica el secreto y revisa el `plan` del *pipeline*. Tiene que cambiar **dos cosas**:
   - el parámetro `/atlas/prod/mail/recipient`;
   - la condición `ses:Recipients` de la política del rol de correo.

   Si la cuenta de SES sigue en el *sandbox*, cambia también la identidad verificada del destinatario. Si falta alguna de las dos cosas, para: la dirección nueva no recibiría nada, porque IAM negaría el envío.
4. Lo aplica el despliegue del entorno.
5. **Comprobar**: el próximo correo llega a la dirección nueva. No hay una orden para enviar un correo de prueba: la comprobación es el siguiente recordatorio mensual.

---

**Lo que se ha probado y lo que no.**
- **Sí, con los dobles**:
  - la función solo entiende `on` (`packages/domain/test/jobs/event-config.test.ts`, el interruptor);
  - un destinatario que no es una dirección válida no envía (`packages/adapters/test/aws/mail.test.ts`).
- **No**: el procedimiento contra AWS real se prueba en la 018.
