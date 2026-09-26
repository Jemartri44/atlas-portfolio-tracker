// The pages of the Lambda (`docs/api.md` §3.1): **no script, nothing external**,
// `no-store` and `no-referrer`. The access-denied page shows **only the `sub`
// of the account that has just signed in, in this very request** — never the
// e-mail —, escaped, and it goes to no URL and to no log (ADR-0027; P8 (c);
// N10). Plain HTML: prose in Spanish, as the interfaces.

import type { LoginPageError } from "@atlas/domain/access";

export const PAGE_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/**
 * The pages that show a code of the console (`docs/api.md` §4.2): the same,
 * plus `sandbox` without `allow-same-origin`, so the page has an opaque origin
 * and nothing of the SPA can read it (block 0 of E2, §18.5, checked in
 * Chromium).
 */
export const CODE_PAGE_CSP = `${PAGE_CSP}; sandbox`;

export const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const document = (title: string, body: string): string =>
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · Atlas</title>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

export const accessDeniedPage = (sub: string): string =>
  document(
    "Acceso denegado",
    `<h1>Acceso denegado</h1>
<p>Esta cuenta de Google no tiene acceso a Atlas en este entorno.</p>
<p>Si es la tuya, el identificador de esta cuenta (su <code>sub</code>) es:</p>
<p><code>${escapeHtml(sub)}</code></p>
<p>Para darla de alta, añádelo a la lista permitida con el guion de secretos, junto con el correo de la cuenta tal como lo muestra Google. Esta página no lo guarda en ningún sitio.</p>
<p><a href="/">Volver a Atlas</a></p>`,
  );

const SENTENCES: Record<LoginPageError, string> = {
  login_attempt_missing:
    "El intento de inicio de sesión no está o ha caducado. Vuelve a empezar desde Atlas.",
  login_attempt_invalid:
    "El intento de inicio de sesión no es válido. Vuelve a empezar desde Atlas.",
  login_state_mismatch:
    "La vuelta de Google no corresponde a este intento. Vuelve a empezar desde Atlas.",
  google_error: "Google no completó el inicio de sesión.",
  google_exchange_failed:
    "No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo en unos minutos.",
  id_token_invalid: "La respuesta de Google no se pudo verificar.",
  id_token_audience: "La respuesta de Google es para otra aplicación o para otro entorno.",
  id_token_issuer: "La respuesta no viene de Google.",
  id_token_expired: "La respuesta de Google ha caducado. Vuelve a empezar desde Atlas.",
  id_token_nonce:
    "La respuesta de Google no corresponde a este intento. Vuelve a empezar desde Atlas.",
  email_not_verified: "El correo de esta cuenta de Google no está verificado.",
  remote_unavailable:
    "Atlas no puede comprobar el acceso ahora mismo. Inténtalo de nuevo en unos minutos.",
  internal:
    "Atlas ha tenido un fallo inesperado y no ha iniciado la sesión. Vuelve a empezar desde Atlas.",
  reissue_device_missing:
    "El dispositivo que nombra la carpeta no existe en la nube. Inicia sesión desde la consola sin reemitir.",
  reissue_device_forgotten:
    "El dispositivo que nombra la carpeta fue olvidado: no se le puede volver a dar un token.",
  reissue_device_not_console:
    "El dispositivo que nombra la carpeta no es una consola: no se le puede dar un token.",
  reissue_device_unreadable:
    "El registro del dispositivo que nombra la carpeta no se puede leer. No se ha emitido nada.",
};

export const loginErrorPage = (code: LoginPageError): string =>
  document(
    "No se ha podido iniciar sesión",
    `<h1>No se ha podido iniciar sesión</h1>
<p>${escapeHtml(SENTENCES[code])}</p>
<p>Código: <code>${escapeHtml(code)}</code></p>
<p><a href="/">Volver a Atlas</a></p>`,
  );

/** An instant as the page says it, in UTC and without seconds: what the user compares with the clock. */
const when = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

const WARNING = `<p><strong>Solo pega este código en una consola que acabas de abrir tú mismo</strong> para iniciar sesión en Atlas. Si no has sido tú, cierra esta página: el código no sirve sin la consola que abrió el intento, y caduca en minutos.</p>`;

/**
 * The code, **only inside a `<details>`** whose `<summary>` is the explicit
 * confirmation (plan §6.2 (i bis)): no script and no form — the sandbox would
 * block them — and the code is not text on the page until the user opens it.
 */
const revealed = (confirmation: string, code: string): string =>
  `<details>
<summary>${escapeHtml(confirmation)}</summary>
<p>Pega este código en la consola; no se muestra al escribirlo:</p>
<p><code>${escapeHtml(code)}</code></p>
</details>`;

/** `mode=manual`, a new device or a renewal: confirm the name, then the code (§4.2). */
export const manualCodePage = (fields: {
  code: string;
  deviceName: string;
  attemptedAt: string;
}): string =>
  document(
    "Código para la consola",
    `<h1>Código para la consola</h1>
<p>Intento de inicio de sesión abierto a las ${escapeHtml(when(fields.attemptedAt))}.</p>
${WARNING}
${revealed(
  `Confirmo que he abierto yo este inicio de sesión desde la consola, en el dispositivo «${fields.deviceName}»: enseñar el código`,
  fields.code,
)}`,
  );

/**
 * The reissue for a device without a credential (N5; R2-N1): the data **of
 * the server** — its name, its last publication and its pending lines, if
 * known — and the explicit confirmation. Without it there is no code.
 */
export const reissueConfirmPage = (fields: {
  deviceName: string | undefined;
  publishedAt: string | undefined;
  pending: number;
  attemptedAt: string;
  next: { readonly loopback: string } | { readonly code: string };
}): string => {
  const name = fields.deviceName ?? "(sin nombre guardado)";
  const confirmation = `Sí, es este dispositivo: «${name}»`;
  return document(
    "Volver a dar un token a este dispositivo",
    `<h1>Volver a dar un token a este dispositivo</h1>
<p>La carpeta desde la que inicias sesión nombra un dispositivo que ya existe en la nube y no tiene token. Comprueba que es el tuyo:</p>
<ul>
<li>Nombre: <strong>${escapeHtml(name)}</strong></li>
<li>Última publicación: ${fields.publishedAt === undefined ? "nunca" : escapeHtml(when(fields.publishedAt))}</li>
<li>Líneas pendientes que publicó: ${escapeHtml(String(fields.pending))}</li>
</ul>
<p>Si es una copia de la carpeta en otra máquina, el token de la original dejará de valer. Intento abierto a las ${escapeHtml(when(fields.attemptedAt))}.</p>
${WARNING}
${
  "loopback" in fields.next
    ? `<p><a href="${escapeHtml(fields.next.loopback)}">${escapeHtml(`${confirmation}: continuar`)}</a></p>`
    : revealed(`${confirmation}: enseñar el código`, fields.next.code)
}`,
  );
};
