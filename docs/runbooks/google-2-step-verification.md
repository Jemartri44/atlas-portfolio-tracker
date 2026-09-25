# Verificación en dos pasos en tu cuenta personal de Google

Atlas no tendrá usuario ni contraseña propios: **se entrará solo con tu cuenta personal de Google** (ADR-0027). La web y la API aceptan a quien Google diga que eres, si figura en la lista permitida, y el token de la consola solo se emite al final de un inicio de sesión con Google (ADR-0033). **Esa cuenta es la llave de todo tu libro.**

Y hoy Atlas **no puede comprobar** que esa cuenta tenga la verificación en dos pasos activada, ni impedir que Google recuerde un navegador (ADR-0027, «Lo que se pierde frente a Cognito»). La feature 015 comprobará si Google permite exigirla al emitir el token de la consola (ADR-0033, punto 2: `amr` con `mfa`, SIN VERIFICAR); esa comprobación, si llega, es solo para emitir ese token. Por eso tenerla activada es un **requisito tuyo**, previo al despliegue (`docs/decision-roadmap.md`, Ronda 8, «Plan por etapas», etapa 3). Esta guía te lleva por ella en unos 20 minutos.

**Dos reglas:**

1. **Nada de esto va al repositorio**: ni tu dirección de correo, ni tus códigos de respaldo, ni capturas de estas pantallas. El repositorio es público.
2. **Nada de esto se le pasa a nadie**, tampoco a un asistente: ningún código, ninguna clave, ninguna captura con datos de tu cuenta. Esta guía no te pide devolver nada.

Pasos comprobados el 2026-09-25 en la ayuda oficial de Google (`support.google.com/accounts`, artículos 185839, 13548313, 1066447, 1187538, 3067630 y 13533235). Google cambia a veces el nombre de los menús; si uno no coincide, busca el más parecido.

---

## 1. Abrir la verificación en dos pasos

1. Entra en `https://myaccount.google.com` con tu cuenta personal de Google.
2. En el menú, pulsa **Seguridad** (en algunas cuentas se llama **Seguridad e inicio de sesión**).
3. En el bloque **Cómo inicias sesión en Google**, pulsa **Verificación en dos pasos**.
4. Si aún no está activada, pulsa **Activar verificación en dos pasos** y sigue los pasos de la pantalla. Te pedirá tu contraseña.

**Cuenta como «sí»:** la página de la verificación en dos pasos dice que está **activada**.

Si Google te pide un número de teléfono para activarla, dáselo: queda como método de respaldo, y en el paso 4 se pone por detrás de los buenos.

## 2. Llaves de acceso (passkeys): el método principal

Una llave de acceso vive en tu móvil, en tu ordenador o en un gestor de contraseñas, y se desbloquea con tu huella, tu cara o el PIN del dispositivo. No se puede copiar en una web falsa ni interceptar como un SMS. **Con ella, Google no pide el segundo paso**, porque ya comprueba que tienes el dispositivo.

1. Abre `https://myaccount.google.com/signinoptions/passkeys`.
2. Pulsa **Crear llave de acceso**.
3. Desbloquea el dispositivo cuando te lo pida.
4. **Crea al menos dos**: una en el móvil y otra en el ordenador (o en una llave física FIDO2, si tienes una: **Usar otro dispositivo** y la insertas). Si pierdes el único dispositivo con llave, entras por el siguiente método.

Tus datos biométricos no salen del dispositivo: Google no los recibe.

**Cuenta como «sí»:** la página de llaves de acceso enseña al menos dos, con el nombre de cada dispositivo.

## 3. App de autenticación: el segundo método

Genera códigos de seis dígitos que cambian cada 30 segundos, sin cobertura y sin depender de tu número de teléfono.

1. Instala en el móvil **Google Authenticator** u otra app de autenticación (la de tu gestor de contraseñas, si la tiene, también vale).
2. En la página de **Verificación en dos pasos** (paso 1), pulsa **App de autenticación** o **Configurar autenticador**.
3. Escanea con la app el código QR que sale en pantalla.
4. Escribe en la web el código que te da la app, para confirmar.

Google avisa de que la opción puede tardar **hasta 7 días** en aparecer disponible para iniciar sesión.

> **Ojo con la sincronización.** Google Authenticator puede guardar sus códigos en tu cuenta de Google. Es cómodo, pero si pierdes el acceso a esa cuenta, esos códigos no te sirven para recuperarla: para eso están los códigos de respaldo del paso 5. Si prefieres que no se sincronice, la app permite **Usar sin una cuenta**.

**Cuenta como «sí»:** la página de la verificación en dos pasos enseña la app de autenticación como método configurado.

## 4. El SMS, solo de respaldo

Google lo dice claro: los códigos por SMS o por llamada **pueden caer en manos de terceros** (por ejemplo, si alguien consigue un duplicado de tu tarjeta SIM). Por eso:

- Deja el teléfono **como método de respaldo**, no como el principal. Con las llaves de acceso y la app configuradas, ya no es lo que Google te ofrece primero.
- Comprueba que el número es el tuyo y que sigue activo, porque también sirve para recuperar la cuenta.
- Las **notificaciones de Google** en el móvil («¿Estás intentando iniciar sesión?») son otro método válido, y mejor que el SMS; puedes tenerlas además de los anteriores.

## 5. Códigos de respaldo

Son **10 códigos de un solo uso**: para entrar si pierdes el móvil y el ordenador a la vez. Cada código deja de valer al usarlo, y al generar un juego nuevo el anterior deja de funcionar.

1. En la página de **Verificación en dos pasos**, busca **Códigos de verificación alternativos** (o **Códigos de seguridad**) y pulsa para verlos o generarlos.
2. **Guárdalos en uno de estos dos sitios, y en ningún otro:**
   - **Tu gestor de contraseñas**, como nota segura de esa cuenta.
   - **Papel**, impreso o copiado a mano, donde guardes el pasaporte u otros documentos importantes.
3. **Nunca** en el repositorio, en `docs/`, en la carpeta del libro, en `~/.config/atlas/`, en un correo, en una captura del móvil ni en un chat.
4. Si usas uno, o sospechas que alguien los ha visto, genera un juego nuevo: el viejo deja de valer.

**Cuenta como «sí»:** tienes los 10 códigos en uno de esos dos sitios y has comprobado que se leen.

## 6. Revisar dispositivos y accesos de terceros

Hazlo ahora y repítelo de vez en cuando (por ejemplo, cuando llegue el correo mensual de Atlas, una vez desplegado).

**Dispositivos con sesión abierta:**

1. En `https://myaccount.google.com`, **Seguridad** → **Tus dispositivos** → **Gestionar todos los dispositivos** (atajo: `https://google.com/devices`).
2. Repasa la lista. Es normal ver varias sesiones en el mismo dispositivo.
3. En cualquiera que no reconozcas, o que ya no uses: púlsalo y **Cerrar sesión**. Si una no te cuadra, cambia además la contraseña.

> **Con Atlas ya desplegado, cerrar la sesión en Google no cierra Atlas.** Atlas tiene su propia sesión, y quien haya entrado en tu cuenta de Google puede haber sacado un token de consola que vale hasta 90 días. Si sospechas que alguien ha usado tu cuenta, sigue el orden de ADR-0033 (nota del 2026-09-25 sobre la cuenta robada): **quitar tu cuenta de la lista permitida, recuperar la cuenta de Google, revocar todos los tokens de consola, rotar la clave de sesión de Atlas y esperar unos minutos, revisar lo que se añadió al libro mientras tanto y olvidar los dispositivos que no reconozcas, y solo después volver a ponerla en la lista**; si la repones antes, los tokens y las sesiones del intruso vuelven a valer. Mira también las emisiones recientes de tokens en la web de Atlas. El procedimiento paso a paso llegará con el despliegue.

**Aplicaciones y servicios de terceros:**

1. Abre `https://myaccount.google.com/linkedapps` (la página de conexiones con terceros; también se llega desde **Seguridad**).
2. Repasa **Iniciar sesión con Google**, **Cuenta vinculada** y **Acceso a tu cuenta de Google**.
3. Quita lo que no uses: **Dejar de usar Iniciar sesión con Google**, **Eliminar conexión** o **Quitar acceso**, según el tipo.

Cuando Atlas esté desplegado, aparecerá aquí como una aplicación con **Iniciar sesión con Google**. Si la quitas, no pasa nada grave: la próxima vez que entres, Google te volverá a pedir permiso.

**En un ordenador que no es tuyo**, no marques que Google recuerde el dispositivo y cierra la sesión al terminar: Atlas no puede impedir que Google lo recuerde.

## 7. Comprobación final

- [ ] La verificación en dos pasos está **activada**.
- [ ] Al menos **dos llaves de acceso**, en dispositivos distintos.
- [ ] La **app de autenticación**, configurada.
- [ ] El **teléfono**, solo como respaldo, y con tu número actual.
- [ ] Los **10 códigos de respaldo**, en tu gestor de contraseñas o en papel.
- [ ] **Dispositivos y conexiones** revisados, sin nada que no reconozcas.

No hace falta devolver nada a la dirección: basta con decir «hecha» cuando el despliegue lo pida.
