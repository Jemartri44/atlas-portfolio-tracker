# Recuperar una cuenta de Google robada

**Cuándo**: alguien ha entrado en la cuenta de Google con la que entras en Atlas, o lo sospechas. **Cerrar la sesión en Google no cierra Atlas.** Atlas tiene su propia sesión web, de hasta 8 horas, y quien entró pudo sacar un token de consola que vale hasta 90 días.

**Señal**: en la web de Atlas, Ajustes › Sincronización › «Dispositivos de la consola». Las emisiones recientes van marcadas: **un token que no reconoces es la alarma**.

**El orden importa** (ADR-0033, punto 8; `docs/prompts/015-api-access.md` §7.1 bis, B3). **Sigue estos seis pasos en este orden y sin saltarte ninguno.** Si repones la cuenta antes de terminar el paso 5, los tokens y las sesiones del intruso vuelven a valer.

Lo que necesitas es el rol de administración y `admin.json`, como en [Revocar todos los tokens](revoke-all-tokens.md), apartado «Lo que necesitas». **Desde el paso 1, tu propia consola tampoco entra en la nube** (`not_allowed`), y desde el paso 3 su token está revocado: todo lo que se hace hasta el paso 6 va con el rol de administración.

Las órdenes que reescriben la nube u olvidan un dispositivo **no admiten `--yes`**: se confirman escribiendo el nombre del entorno, con lo que está en juego delante (ADR-0032, nota del 2026-09-27).

---

## 1. Quitar tu cuenta de la lista permitida

- La lista vive en SSM, en `/atlas/<entorno>/auth/allow-list`, y la escribe el guion de secretos (ADR-0034, fila 21). Es `{"allow_list_format":1,"entries":[{"sub":"…","email":"…"}]}`.
- Quita el par `{sub, email}` de la cuenta. La API consulta la lista **en cada petición**, con una caché de como mucho 120 s (`specs/015-api-access/plan.md` §6 (a)).
- Desde ahí, **ninguna** sesión ni token de esa cuenta pasa (`not_allowed`).
- Si el guion no está disponible, con la CLI de AWS y el rol de administración. **El par no se escribe nunca en la línea de órdenes**, que lo dejaría en el historial del shell: la lista va por un fichero con permisos `600` en `~/.config/atlas/`, que se borra en el paso 6.
  ```sh
  ( umask 077
    aws ssm get-parameter --name /atlas/prod/auth/allow-list --with-decryption \
      --query Parameter.Value --output text > ~/.config/atlas/allow-list.antes.json
    cp ~/.config/atlas/allow-list.antes.json ~/.config/atlas/allow-list.json )
  "${EDITOR:-nano}" ~/.config/atlas/allow-list.json   # quita la entrada de la cuenta
  aws ssm put-parameter --name /atlas/prod/auth/allow-list --type SecureString --overwrite \
    --value "file://$HOME/.config/atlas/allow-list.json"
  ```
  `allow-list.antes.json` es la lista de antes: la repone el paso 6.

## 2. Recuperar la cuenta de Google

Sigue la ayuda de Google (`g.co/recover`). Después:
- cambia la contraseña;
- revisa la verificación en dos pasos y los dispositivos con sesión abierta ([Verificación en dos pasos de Google](google-2-step-verification.md)).

## 3. Revocar todos los tokens de consola

```sh
AWS_PROFILE=atlas-prod-admin atlas admin revoke-all-tokens --env prod
```

Es el procedimiento [Revocar todos los tokens](revoke-all-tokens.md), que tiene también la alternativa con la CLI de AWS.

## 4. Rotar la clave de sesión y esperar

- **Rota la clave de sesión** (`/atlas/<entorno>/auth/session-key`) con el guion de secretos (ADR-0034, fila 21; llega con la 017).
- La clave nueva son 32 bytes aleatorios en base64url. Si el guion no está disponible:
  ```sh
  aws ssm put-parameter --name /atlas/prod/auth/session-key --type SecureString --overwrite \
    --value="$(head -c 32 /dev/urandom | basenc --base64url -w 0 | tr -d '=')"
  ```
  `--value=` va pegado: una clave que empezara por `-` se tomaría por una opción y no se escribiría nada.
- **Espera 5 minutos**, que es la caché de los secretos (`specs/015-api-access/plan.md` §6 (c): 300 s).
- A partir de ahí, **toda cookie firmada con la clave anterior da `session_invalid`**. Eso cierra las sesiones web del intruso e invalida los códigos de consola pendientes.

*Probado con los dobles*: tras rotar la clave y vencer la caché, una cookie anterior da `session_invalid` (`apps/api/test/sign-in.test.ts`, «closes every session when the session key is rotated and its cache expires»). *Sin probar*: contra AWS real (018).

## 5. Olvidar sus dispositivos, revisar la nube y rectificar

**En este orden.** Con los dispositivos del intruso vivos, uno que haya publicado pendientes bloquea la restauración (`rewrite_refused_pending_devices`).

**5.1. Olvida primero los dispositivos que no reconozcas.**
```sh
AWS_PROFILE=atlas-prod-admin atlas admin devices --env prod
AWS_PROFILE=atlas-prod-admin atlas admin forget-device --env prod -- <dispositivo>
```
- El identificador va **detrás de `--`**, que termina las opciones: son 22 caracteres base64url y pueden empezar por `-` o por `--`, y sin él la consola lo leería como una opción y saldría con 64. Vale también `--device <dispositivo>`; si llevas `--force`, ponlo antes del `--`.
- La confirmación enseña su tipo, su nombre y su última sincronización, y pide que escribas `prod`.
- Revoca sus tokens, **después** lo marca olvidado y vuelve a barrer los tokens que se hubieran emitido entre medias. Nunca se borra.
- Si publicó operaciones pendientes o retenidas, se niega. Con `--force`, dice antes lo que dejarás de ver.

**5.2. Revisa la nube con el rol de administración**, no con `atlas sync`, que desde el paso 1 no entra. Hay dos formas:
- **Descargar el libro de la nube** a tu carpeta privada y leerlo ahí:
  ```sh
  mkdir -p ~/personal/atlas/privado/revision
  AWS_PROFILE=atlas-prod-admin aws s3 cp s3://<bucket de datos>/ledger/ledger.jsonl \
    ~/personal/atlas/privado/revision/ledger.jsonl
  jq -c 'select(.recorded_at >= "<inicio de la ventana>")' ~/personal/atlas/privado/revision/ledger.jsonl
  ```
  El bucket es el `data_bucket` de `admin.json`. Nunca en el repositorio.
- **Compararla con tu réplica** sin tocar nada: `atlas admin restore` enseña en su paso 3 la cola que solo tiene la nube. Contesta cualquier cosa que no sea `prod` en el paso 4, y no toca nada:
  ```sh
  AWS_PROFILE=atlas-prod-admin atlas admin restore --env prod --from <tu carpeta>/ledger.jsonl
  ```
  Ejecútala **desde una carpeta vacía** (`--ledger <carpeta vacía>/ledger.jsonl`), no desde la de tu réplica: con pendientes en ella, se negaría.

**5.3. Rectifica.** Una de dos:
- **Restaura ahí mismo**, con la misma orden del 5.2, escribiendo `prod` en el paso 4 ([Restaurar el libro](restore-the-ledger.md), ADR-0032). Lo que había queda en `archive/pre-restore-…`.
- O **anula** las líneas del intruso con `atlas delete <id>`, pero cada una **cuando esté en tu carpeta**:
  - las que ya están en tu réplica, ahora mismo. Las anulaciones se quedan pendientes y **suben después del paso 6**, cuando tu consola vuelva a entrar;
  - **las que solo están en la nube**, que son justo la cola que enseña el 5.2, **después del paso 6**, una vez sincronizado. Antes, tu carpeta no las tiene y `atlas delete` dice que el evento no existe.

## 6. Solo entonces, reponer tu cuenta en la lista

- Vuelve a poner la lista de antes y borra los dos ficheros:
  ```sh
  aws ssm put-parameter --name /atlas/prod/auth/allow-list --type SecureString --overwrite \
    --value "file://$HOME/.config/atlas/allow-list.antes.json"
  rm ~/.config/atlas/allow-list.antes.json ~/.config/atlas/allow-list.json
  ```
- Espera los 2 minutos de la caché de la lista.
- Inicia sesión en la web y en cada consola. Los tokens anteriores ya no valen, y **cada consola saca uno nuevo en dos vueltas**:
  1. el primer `atlas remote login` choca con el token revocado (`device_token_revoked`) y lo quita de `credentials.json`;
  2. el segundo `atlas remote login` vuelve a dar un token **al mismo dispositivo** de la carpeta, y la página te pide confirmarlo.
- Sincroniza. Si restauraste en el 5.3, cada dispositivo verá la reescritura y se detendrá: vuelve a descargar (`atlas sync redownload`, o «Volver a descargar» en la web).

*Ensayado entero con los dobles* (`apps/cli/test/admin/stolen-account.test.ts`): los seis pasos en este orden, con tu consola y la del intruso sobre la misma nube. Tu consola no entra desde el paso 1; el intruso tampoco, ni con su token ni con su cookie; la revisión del 5.2 enseña su línea sin tocar nada; la restauración la quita; y en el paso 6 tu consola vuelve a entrar con un token nuevo para su mismo dispositivo, en las dos vueltas de `atlas remote login`, mientras el intruso sigue fuera con su token y con su cookie. *Sin probar*: contra AWS real (018), el editor y `aws s3 cp`.

---

## El caso distinto: **perder** la cuenta de Google

Si no la recuperas, porque Google la cierra o no puedes demostrar que es tuya (ADR-0033, Consecuencias):
1. **cambia la entrada de la lista permitida por otra cuenta tuya**, con la verificación en dos pasos activada;
2. haz los pasos 3 a 5 de arriba igualmente;
3. inicia sesión con la cuenta nueva en la web y en cada consola.

El libro no depende de la cuenta de Google: vive en el bucket y en las réplicas de tus dispositivos.
