# Recuperar una cuenta de Google robada

**Cuándo**: alguien ha entrado en la cuenta de Google con la que entras en Atlas, o lo sospechas. **Cerrar la sesión en Google no cierra Atlas.** Atlas tiene su propia sesión web, de hasta 8 horas, y quien entró pudo sacar un token de consola que vale hasta 90 días.

**Señal**: en la web de Atlas, Ajustes › Sincronización › «Dispositivos de la consola». Las emisiones recientes van marcadas: **un token que no reconoces es la alarma**.

**El orden importa** (ADR-0033, punto 8; §7.1 bis, B3). **Sigue estos seis pasos en este orden y sin saltarte ninguno.** Si repones la cuenta antes del paso 6, los tokens y las sesiones del intruso vuelven a valer.

Lo que necesitas es el rol de administración y `admin.json`, como en «Revocar todos los tokens», apartado «Lo que necesitas».

---

## 1. Quitar tu cuenta de la lista permitida

- La lista vive en SSM, en `/atlas/<entorno>/auth/allow-list`, y la escribe el guion de secretos (ADR-0034, fila 21). Es `{"allow_list_format":1,"entries":[{"sub":"…","email":"…"}]}`.
- Quita el par `{sub, email}` de la cuenta. La API consulta la lista **en cada petición**, con una caché de como mucho 120 s (plan §6 (a)).
- Desde ahí, **ninguna** sesión ni token de esa cuenta pasa (`not_allowed`).
- Si el guion no está disponible, con la CLI de AWS y el rol de administración: `aws ssm put-parameter --name /atlas/prod/auth/allow-list --type SecureString --overwrite --value '<la lista sin ese par>'`.

## 2. Recuperar la cuenta de Google

Sigue la ayuda de Google (`g.co/recover`). Después:
- cambia la contraseña;
- revisa la verificación en dos pasos y los dispositivos con sesión abierta (`docs/runbooks/google-2-step-verification.md`).

## 3. Revocar todos los tokens de consola

```sh
AWS_PROFILE=atlas-prod-admin atlas admin revoke-all-tokens --env prod
```

Es el procedimiento «Revocar todos los tokens», que tiene también la alternativa con la CLI de AWS.

## 4. Rotar la clave de sesión y esperar

- **Rota la clave de sesión** (`/atlas/<entorno>/auth/session-key`) con el guion de secretos (ADR-0034, fila 21; llega con la 017).
- La clave nueva son 32 bytes aleatorios en base64url. Si el guion no está disponible:
  `aws ssm put-parameter --name /atlas/prod/auth/session-key --type SecureString --overwrite --value "$(head -c 32 /dev/urandom | basenc --base64url -w 0 | tr -d '=')"`.
- **Espera 5 minutos**, que es la caché de los secretos (plan §6 (c): 300 s).
- A partir de ahí, **toda cookie firmada con la clave anterior da `session_invalid`**. Eso cierra las sesiones web del intruso e invalida los códigos de consola pendientes.

*Probado con los dobles*: tras rotar la clave y vencer la caché, una cookie anterior da `session_invalid` (`apps/api/test/sign-in.test.ts`, «closes every session when the session key is rotated and its cache expires»). *Sin probar*: contra AWS real (018).

## 5. Revisar lo que se añadió y olvidar sus dispositivos

- **Las líneas añadidas en esa ventana**: `atlas sync` en tu carpeta y mira las operaciones con `recorded_at` en la ventana del robo. Rectifícalas con anulaciones (`atlas delete <id>`) o, si son muchas, **restaura** («Restaurar el libro», ADR-0032).
- **Los dispositivos que creó el intruso**: `AWS_PROFILE=atlas-prod-admin atlas admin devices --env prod`. Cada uno que no reconozcas:
  ```sh
  AWS_PROFILE=atlas-prod-admin atlas admin forget-device --env prod <dispositivo>
  ```
  - Revoca sus tokens y **después** lo marca olvidado. Nunca se borra.
  - Si publicó operaciones pendientes o retenidas se niega. Con `--force`, dice antes lo que dejarás de ver.

## 6. Solo entonces, reponer tu cuenta en la lista

- Vuelve a poner el par `{sub, email}` en la lista (paso 1, al revés).
- Inicia sesión en la web y en cada consola. Los tokens anteriores ya no valen: **cada consola saca uno nuevo** con `atlas remote login`.

---

## El caso distinto: **perder** la cuenta de Google

Si no la recuperas, porque Google la cierra o no puedes demostrar que es tuya (ADR-0033, Consecuencias):
1. **cambia la entrada de la lista permitida por otra cuenta tuya**, con la verificación en dos pasos activada;
2. haz los pasos 3 a 5 de arriba igualmente;
3. inicia sesión con la cuenta nueva en la web y en cada consola.

El libro no depende de la cuenta de Google: vive en el bucket y en las réplicas de tus dispositivos.
