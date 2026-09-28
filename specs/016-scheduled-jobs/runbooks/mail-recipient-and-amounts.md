# El destinatario de los correos y los importes

> Borrador de la feature 016 (E4). La dirección lo pasará a `docs/runbooks/` al cerrar la feature.

**Cuándo usarlo.** Cuando quieres que los correos lleven los euros (o dejen de llevarlos), o que lleguen a otra dirección.

**Dos reglas, antes de nada:**

1. **Los dos valores tienen una sola fuente: `terraform.tfvars`**, fuera del repositorio (`~/personal/atlas/privado/terraform/<entorno>/terraform.tfvars`). Terraform escribe con ellos dos parámetros `String` de SSM que lee la función de correo:
   - `/atlas/<entorno>/mail/recipient`;
   - `/atlas/<entorno>/mail/amounts`.

   Con el destinatario escribe también la condición de IAM que impide enviar a cualquier otra dirección (ADR-0028, filas 17 y 18; ADR-0034, fila 12). **Nunca a mano en SSM**: la condición de IAM no cambiaría, y un envío a la dirección nueva lo negaría IAM. **Nunca en `Settings` ni en el repositorio.**
2. **La dirección no pasa por la línea de órdenes.** Nada de `-var 'mail_recipient=…'`, ni de `echo … >> terraform.tfvars`: se quedaría en el historial del *shell*. Se escribe con un editor, dentro del fichero, que tiene permisos `600`.

**Sin verificar**: los nombres de las variables de Terraform (`mail_recipient` y `mail_amounts`, abajo) son una **propuesta**. Los fija la 017, que escribe el módulo, y la 018 prueba el procedimiento en `dev`. Hasta entonces no hay nada que aplicar.

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
3. Guarda y cierra. Revisa el plan y aplícalo desde la carpeta de Terraform del entorno:
   ```sh
   terraform plan
   ```
   El plan tiene que cambiar **solo** el parámetro `/atlas/prod/mail/amounts`. Si cambia algo más, para.
   ```sh
   terraform apply
   ```
4. **Comprobar**: el próximo recordatorio mensual dice los euros del reparto, o deja de decirlos. La función lee el parámetro en cada envío, así que no hace falta desplegar nada más.

## 2. Cambiar el destinatario

1. Abre el fichero con tu editor, como en el paso 1 de arriba.
2. Cambia `mail_recipient = "…"` por la dirección nueva: **una sola**, sin nombre delante y sin espacios.
3. Revisa el plan:
   ```sh
   terraform plan
   ```
   Tiene que cambiar **dos cosas**:
   - el parámetro `/atlas/prod/mail/recipient`;
   - la condición `ses:Recipients` de la política del rol de correo.

   Si la cuenta de SES sigue en el *sandbox*, cambia también la identidad verificada del destinatario. Si falta alguna de las dos cosas, para: la dirección nueva no recibiría nada, porque IAM negaría el envío.
4. Aplícalo:
   ```sh
   terraform apply
   ```
5. **Comprobar**: el próximo correo llega a la dirección nueva. Hoy no hay una orden para enviar un correo de prueba. Hasta que la 018 la pruebe en `dev`, la comprobación es el siguiente recordatorio mensual.

---

**Lo que se ha probado y lo que no.**
- **Sí, con los dobles**:
  - la función solo entiende `on` (`packages/domain/test/jobs/event-config.test.ts`, el interruptor);
  - un destinatario que no es una dirección válida no envía (`packages/adapters/test/aws/mail.test.ts`).
- **No**: Terraform no existe todavía (017). Todo el procedimiento se prueba en la 018.
