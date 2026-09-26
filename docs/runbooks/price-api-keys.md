# Claves de las fuentes de precios (EODHD y Alpha Vantage)

La consola descarga los cierres diarios de tus activos desde dos APIs gratuitas con clave: **EODHD** (la principal) y **Alpha Vantage** (el respaldo). Esta guía explica cómo sacar las dos claves, dónde dejarlas y cómo comprobar que la consola las lee. Tardas unos 15 minutos. Las decisiones de fondo están en ADR-0031; el formato del fichero, en `docs/data-schema.md` §1.

Sin claves, Atlas funciona igual con las valoraciones manuales (`atlas add valuation`). Las claves solo añaden precios automáticos, que son **informativos**: ninguna cifra de la Renta ni del Modelo 720 los lee.

**Tres reglas, antes de nada:**

1. **Las claves no se le pasan a nadie.** Ni se pegan en el chat, ni se le dan a un asistente, ni a la dirección, ni se escriben en un documento o en un mensaje. **El asistente nunca las ve ni le hace falta**: tú las dejas en tu fichero, y la consola las lee de ahí. Ninguna orden de esta guía lleva una clave escrita.
2. **Nunca en el repositorio.** El repositorio es público. Una clave que llega a un *commit* hay que darla por perdida y cambiarla.
3. **Nunca dentro de la carpeta del libro.** Esa carpeta se copia, se exporta y un día se sincronizará; las claves no deben viajar con ella. La consola se niega a trabajar si la carpeta de las claves y la del libro están una dentro de la otra.

---

## 1. EODHD, plan Free

**Qué da:** 20 llamadas al día, con el día contado de medianoche a medianoche GMT (en Madrid, de 01:00 a 01:00 en invierno y de 02:00 a 02:00 en verano), y un año de histórico de cierres. Uso personal. **No pide tarjeta.** Comprobado el 2026-09-25 en `eodhd.com/pricing`, `eodhd.com/financial-apis/api-limits` y `eodhd.com/financial-apis/quick-start-with-our-financial-data-apis`.

1. Abre `https://eodhd.com/register`.
2. Regístrate con un correo y una contraseña, o con el botón de Google o de GitHub. Cualquiera sirve; si usas Google, que sea con la verificación en dos pasos activada ([guía](google-2-step-verification.md)).
3. Si te pide confirmar el correo, abre el mensaje que te llega y pulsa el enlace.
4. Entra en tu panel (*dashboard*). Tu clave es el **API token** que aparece allí. EODHD también la manda en el correo de bienvenida.
5. **No la copies todavía a ningún sitio.** La pegarás directamente en la terminal en el paso 3 de esta guía.

> La clave `demo` que sale en los ejemplos de la documentación de EODHD **no es la tuya**: solo sirve para seis símbolos de prueba. La tuya es la del panel.

## 2. Alpha Vantage, plan gratuito

**Qué da:** 25 llamadas al día; su hora de reinicio no está documentada, así que la consola cuenta una ventana de 24 horas para no pasarse nunca. El histórico gratuito son los últimos 100 días de mercado. **No pide tarjeta.** Comprobado el 2026-09-25 en `alphavantage.co/support` y `alphavantage.co/premium`.

1. Abre `https://www.alphavantage.co/support/#api-key`.
2. Rellena el formulario «Claim your free API key»:
   - **Which of the following best describes you?**: elige *Investor*.
   - **Organization**: pon tu nombre o `personal`.
   - **Email**: un correo tuyo que leas; es la vía por la que te avisan.
3. Pulsa **GET FREE API KEY**. La clave aparece en la misma página, debajo del botón.
4. **Déjala en esa pestaña** hasta el paso 3 de esta guía, y cópiala **entera y sin espacios**. Alpha Vantage **no rechaza una clave mal copiada**: contesta con un aviso en vez de con un error (ADR-0031), así que un fallo de copia no se nota hasta la primera descarga.

## 3. Guardar las claves en `~/.config/atlas/secrets.json`

### El formato

Un objeto JSON con **solo estas dos entradas**, las dos con texto:

```json
{"eodhd":"…","alpha_vantage":"…"}
```

- Los nombres son exactamente `eodhd` y `alpha_vantage`, en minúsculas. **Cualquier otro nombre hace que la consola rechace el fichero entero** (y no enseña el nombre, por si fuera la clave misma).
- Puedes poner **una sola** de las dos: la consola usará solo esa fuente.
- Un valor vacío (`""`) no vale.
- Los permisos tienen que ser `600` (solo tú lees y escribes). **Si otros usuarios de la máquina pueden leerlo, la consola no usa las claves** y te dice el `chmod` que lo arregla.
- **La aplicación nunca escribe este fichero**: lo escribes tú, y solo tú lo cambias.

Lo lee `packages/adapters/src/prices/secrets.ts` (`readSecrets`), y la consola lo busca con `secretsPath` en `~/.config/atlas/secrets.json`, o en `$XDG_CONFIG_HOME/atlas/secrets.json` si esa variable tiene una ruta absoluta.

### Crearlo (Linux)

En la terminal de la máquina donde ejecutas la consola. El fichero va en tu `HOME`, `~/.config/atlas/secrets.json`, dentro de `~/.config/atlas/`, que queda con permisos `700`.

Copia este bloque **entero, de la `{` a la `}`**, en la terminal. Las llaves hacen que la terminal lo lea completo antes de ejecutarlo, así que las preguntas no se comen las líneas siguientes del bloque. Te pide las dos claves **sin enseñarlas en pantalla**: pega cada una y pulsa Intro. Las claves no quedan en el historial de la terminal, y el fichero nace ya con permisos `600`.

```bash
{
D="${XDG_CONFIG_HOME:-$HOME/.config}/atlas"
mkdir -p "$D"
chmod 700 "$D"
read -rsp 'Clave de EODHD: ' KE; echo
read -rsp 'Clave de Alpha Vantage: ' KA; echo
( umask 077; printf '{"eodhd":"%s","alpha_vantage":"%s"}\n' "$KE" "$KA" > "$D/secrets.json" )
unset KE KA
chmod 600 "$D/secrets.json"
ls -l "$D/secrets.json"
}
```

**Cuenta como «sí»:** la última línea empieza por `-rw-------`.

- **Para cambiar una clave**, vuelve a ejecutar el bloque entero con las dos: sustituye el fichero.
- **Si solo tienes una**, cambia la línea del `printf` por la de esa fuente, por ejemplo `printf '{"eodhd":"%s"}\n' "$KE"`, y no hace falta la otra línea `read`.
- Si alguna vez tienes que mirarlo, `nano "${XDG_CONFIG_HOME:-$HOME/.config}/atlas/secrets.json"` desde la terminal.

> **Nota, solo si usas WSL:** hazlo en la terminal de WSL (Ubuntu), no en PowerShell ni en `cmd`. El fichero va en el `HOME` de Linux, `/home/<tu usuario>/.config/atlas/secrets.json`, **no** en `C:\Users\…` ni en `/mnt/c/…`: en las unidades de Windows los permisos de Linux no funcionan como aquí, el fichero suele aparecer abierto a todos y la consola no usaría las claves. **No lo abras con el Bloc de notas de Windows** a través de `\\wsl.localhost`: puede cambiar los finales de línea o dejar una copia.
>
> **El límite de WSL, dicho claro:** el `600` protege frente a otros usuarios de Linux, pero **no frente a un programa de Windows de tu mismo usuario**, que puede leer el fichero a través de `\\wsl$` o `\\wsl.localhost`. Es el mismo límite que ya tienen el libro y el token de la consola (ADR-0033). Lo que protege aquí es tu cuenta de Windows.

> **`${XDG_CONFIG_HOME:-$HOME/.config}`** es `~/.config`, salvo que la variable `XDG_CONFIG_HOME` tenga algo: entonces la consola busca las claves en `$XDG_CONFIG_HOME/atlas/secrets.json`, y el bloque las escribe ahí mismo. Lo normal es que `echo $XDG_CONFIG_HOME` no escriba nada. Las órdenes de esta guía usan esa misma expresión para dar siempre con el fichero que lee la consola.

### Windows sin WSL

El proyecto se usa desde Linux, y es lo recomendado. Si algún día ejecutas la consola directamente en Windows, el fichero va en `%USERPROFILE%\.config\atlas\secrets.json`, con el mismo contenido. **En Windows la consola no puede comprobar los permisos**, así que no hay `chmod` que valga: lo que protege el fichero es que esté dentro de tu carpeta de usuario y que nadie más use tu cuenta de Windows.

## 4. Comprobar que la consola las lee

Se hace en una **carpeta de prueba** con un libro sintético, nunca en la de tu libro. La consola no está en el `PATH`: se ejecuta con Node desde tu clon del repositorio, después de compilarlo.

### Antes: pon al día tu clon y compílalo (obligatorio)

**Hazlo siempre, aunque ya lo compilaras otro día.** Una compilación de antes de la feature 013 no conoce las órdenes de precios, y lo que sigue fallaría con «comando desconocido: prices». Si tu clon no está en `~/personal/atlas/atlas-portfolio-tracker`, cambia la primera línea.

Primero, mira si el clon tiene cambios sin guardar:

```bash
REPO=~/personal/atlas/atlas-portfolio-tracker
cd "$REPO" && git status --short
```

**Si escribe algo, para aquí**: tienes cambios sin guardar en el clon, y cambiar de rama podría mezclarlos. Si no escribe nada, trae `develop` y compila (`npm ci` reinstala las dependencias **de tu clon**, sin tocar nada fuera de él; tarda un par de minutos):

```bash
cd "$REPO" && git switch develop && git pull
npm ci && npm run build
echo "salida $?"
```

**Cuenta como «sí»:** la última línea es `salida 0`. Es el mismo paso 3 de [la prueba de la 013](013-daily-close-prices-live-test.md).

### El libro de prueba

En la misma terminal. La primera línea conserva la ruta de tu clon que pusiste en «Antes»; si abres otra terminal, vuelve a ejecutar antes la línea `REPO=…` de «Antes», con tu ruta:

```bash
REPO="${REPO:-$HOME/personal/atlas/atlas-portfolio-tracker}"
P=~/atlas-prueba-claves
atlas() { node "$REPO/apps/cli/dist/main.js" --ledger "$P/ledger.jsonl" "$@"; }
mkdir -p "$P"
atlas synth --out "$P/ledger.jsonl"
```

### 4a. Que el fichero se lee (no gasta cupo)

```bash
atlas prices update
echo "salida $?"
```

El libro de prueba no tiene ningún símbolo declarado, así que **no se llama a nadie**; la consola solo lee tus claves.

**Cuenta como «sí»:** una tabla con cada activo «sin símbolo declarado (sin gastar cupo)», la última línea **`Cupo que queda hoy: EODHD 20, Alpha Vantage 25.`** y `salida 0`. Esa última línea nombra **solo las fuentes cuya clave se ha leído**: si falta una, falta en el fichero.

Si no sale eso, lo que dice la consola (nunca enseña una clave):

| Mensaje | Qué pasa | Qué hacer |
|---|---|---|
| «Error de uso: comando desconocido: prices», con `salida 64` | La consola compilada es anterior a las órdenes de precios | Repite «Antes: pon al día tu clon y compílalo», al principio de este paso |
| «No hay claves de fuentes de precios configuradas», **solo** | No encuentra el fichero (si antes sale el aviso de permisos, manda la fila siguiente) | Comprueba la ruta con `ls -l "${XDG_CONFIG_HOME:-$HOME/.config}/atlas/secrets.json"`; si no está, créalo con el bloque del paso 3 |
| «No se usan las claves de …: otros usuarios de la máquina pueden leer ese fichero», seguido de «No hay claves…» y `salida 1` | Permisos distintos de `600`. **Este aviso manda sobre «No hay claves…»**: el fichero existe, pero la consola no lo usa | La orden `chmod 600 …` que da el propio mensaje, con la ruta del fichero |
| «… no se puede leer como JSON» | Falta una comilla, sobra una coma… | Vuelve a crearlo con el bloque del paso 3 |
| «la entrada número N no es una clave que se conozca» | Un nombre que no es `eodhd` ni `alpha_vantage` | Vuelve a crearlo con el bloque del paso 3 |
| «el valor de «eodhd» no es una clave» | Un valor vacío | Vuelve a crearlo; pega la clave antes de pulsar Intro |
| «el fichero de claves … y la carpeta del libro están uno dentro del otro» | Tu libro está dentro de `~/.config/atlas`, o al revés | Separa las dos carpetas |

### 4b. Que EODHD acepta la clave (gasta 1 llamada)

Opcional; la prueba de la 013 lo vuelve a comprobar. Le da a un activo del libro de prueba un ETF europeo real:

```bash
atlas prices symbols set ast_world --currency EUR --eodhd IWDA.AS
echo "salida $?"
```

**Cuenta como «sí»:** sale «Símbolos de ast_world guardados en prices/symbols.json (EODHD en …)», `salida 0` y **ninguna línea «Sin contrastar con EODHD»**. Si sale esa línea, la consola **no ha leído tu clave de EODHD** (o no tenía cupo) y no ha llamado a nadie, aunque diga «guardados» y salga con 0: vuelve a 4a.

Si falla, sale una línea «Error: EODHD … al confirmar el símbolo: no se ha guardado nada. Vuelve a intentarlo más tarde.» y `salida 1`. **Solo un mensaje dice que la clave está mal:**

| Lo que dice tras «Error: EODHD» | Qué significa | Qué hacer |
|---|---|---|
| «ha rechazado la clave» | **La clave está mal** (mal copiada, incompleta o de otra cuenta) | Vuelve al paso 3 y créala de nuevo. No reintentes antes: cada intento gasta una llamada |
| «no tiene ese símbolo (o la clave no da acceso a él)» | EODHD no sirve ese símbolo con tu plan. **No dice que la clave esté mal** | Anótalo y sigue con la 013 |
| «ha limitado las llamadas» | Cupo de EODHD agotado o demasiadas llamadas seguidas | Anótalo y sigue otro día |
| «no responde» | Sin conexión, o EODHD caído | Comprueba tu conexión; si sigue, anótalo y sigue con la 013 |
| «ha respondido algo que no se entiende» | EODHD ha contestado algo inesperado | Anótalo y sigue con la 013 |

Ninguno de esos mensajes enseña la clave: se pueden copiar tal cual. Si la consola dice que EODHD da otra divisa y te pide confirmar, responde `N`: aquí solo se comprueba la clave.

**Con Alpha Vantage no hay una comprobación así**: una clave mal copiada no da error (paso 2). Se sabe en la parte B de la prueba de la 013, cuando `ast_gold` sale «actualizado» desde Alpha Vantage.

### 4c. Limpiar

```bash
rm -rf ~/atlas-prueba-claves
```

Solo la carpeta de prueba. Las claves se quedan en `~/.config/atlas/secrets.json`.

## 5. El paso siguiente: la prueba real de la 013

Con las claves en su sitio, sigue [`013-daily-close-prices-live-test.md`](013-daily-close-prices-live-test.md) **desde su paso 3** (sus pasos 1 y 2 son esta guía). Son dos partes en dos días distintos, porque las dos gastan el cupo de EODHD, y la feature de precios solo se da por verificada con ella.

## Más adelante (nube)

Cuando Atlas esté desplegado, la descarga diaria la hará una tarea programada en AWS, y allí **las claves irán en SSM Parameter Store como `SecureString`** (ADR-0031; `docs/data-schema.md` §1; `docs/specification.md` §11.8), nunca en el bucket de datos ni en el repositorio. Subirlas es una tarea tuya de la etapa de despliegue (`docs/decision-roadmap.md`, Ronda 8, «Plan por etapas», etapa 3), y **la guiará otro runbook en ese momento**.

La ruta exacta de esos parámetros **aún no está fijada**. La única ruta de SSM documentada hoy es la de los tokens de dispositivo de la consola, `/atlas/<entorno>/device-tokens/` (ADR-0033), que no tiene nada que ver con estas claves.

Tu fichero local no cambia con la nube: la consola lo seguirá leyendo en tu máquina.
