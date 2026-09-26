// The sentences of `atlas remote …` (feature 015, E2): each code of
// `docs/api.md` §4 and §7 the console can meet while signing in or out, with
// its own sentence; none is folded into another.

import type { CredentialsProblem } from "../remote/credentials-file.js";
import { describeRemoteFailure } from "./messages.js";

export const describeConsoleFailure = (code: string): string => {
  switch (code) {
    case "console_start_invalid":
      return "la API no aceptó el inicio de sesión que pidió la consola; es un fallo de la aplicación.";
    case "console_code_invalid":
      return "el código no es de este inicio de sesión o está mal copiado. Vuelve a empezar.";
    case "console_code_expired":
      return "el código ha caducado (dura 5 minutos). Vuelve a empezar.";
    case "console_code_used":
      return "ese código ya se canjeó. Vuelve a empezar para recibir otro.";
    case "pkce_mismatch":
      return "el código no corresponde a esta consola. Vuelve a empezar desde aquí.";
    case "reissue_device_missing":
      return "el dispositivo que nombra la carpeta no existe en la nube.";
    case "reissue_device_forgotten":
      return "el dispositivo que nombra la carpeta fue olvidado: no se le puede volver a dar un token.";
    case "reissue_device_not_console":
      return "el dispositivo que nombra la carpeta no es una consola.";
    case "reissue_device_unreadable":
      return "el registro del dispositivo que nombra la carpeta no se puede leer en la nube.";
    default:
      return describeRemoteFailure(code);
  }
};

/** The files of the console refused (ADR-0033, point 3; data-model §7 and §8). */
export const describeCredentialsError = (code: CredentialsProblem): string => {
  switch (code) {
    case "credentials_inside_ledger":
      return "la carpeta de credentials.json y la del libro están una dentro de la otra: el token nunca puede viajar con una copia del libro. Usa otra carpeta para el libro o XDG_CONFIG_HOME.";
    case "credentials_too_open":
      return "credentials.json tiene permisos abiertos a otros usuarios y no se usa. Ciérralos con chmod 600.";
    case "credentials_unreadable":
      return "credentials.json no se puede leer. No se ha tocado; revísalo o bórralo y vuelve a iniciar sesión.";
    case "sync_remote_unreadable":
      return "sync/remote.json de esta carpeta no se puede leer: no se sabe con qué remoto se sincroniza.";
  }
};
