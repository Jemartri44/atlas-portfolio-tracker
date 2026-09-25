// The pages of the Lambda (`docs/api.md` §3.1): **no script, nothing external**,
// `no-store` and `no-referrer`. The access-denied page shows **only the `sub`
// of the account that has just signed in, in this very request** — never the
// e-mail —, escaped, and it goes to no URL and to no log (ADR-0027; P8 (c);
// N10). Plain HTML: prose in Spanish, as the interfaces.

import type { LoginPageError } from "@atlas/domain/access";

export const PAGE_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

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
};

export const loginErrorPage = (code: LoginPageError): string =>
  document(
    "No se ha podido iniciar sesión",
    `<h1>No se ha podido iniciar sesión</h1>
<p>${escapeHtml(SENTENCES[code])}</p>
<p>Código: <code>${escapeHtml(code)}</code></p>
<p><a href="/">Volver a Atlas</a></p>`,
  );
