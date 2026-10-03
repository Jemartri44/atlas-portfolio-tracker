// atlas admin secrets --env <e> (feature 017, E4; ADR-0034, row 21; P9, P-3): the
// secrets of `/atlas/<env>/` are created and rotated **here**, with the role of
// administration, and never by Terraform (their value would sit in its state).
//
// What it never does, so a value cannot leak:
// - it asks each value **with no echo** and never takes it from an argument, a
//   flag or a variable of the environment (any positional is refused without
//   being quoted);
// - it never prints a value, nor reads one back: the existence of a parameter is
//   asked of SSM with no decryption (`SecretStore.exists`);
// - it never copies the message of an error of AWS: a failure says the name of
//   the parameter and nothing else;
// - it never takes `--yes`, and overwriting asks to type the name of the environment;
// - with no terminal it leaves **before touching anything**.

import { DomainError } from "@atlas/domain";
import type { AdminClients } from "../admin/environment.js";
import {
  allowListOf,
  checkedToken,
  SECRETS,
  type SecretSpec,
  sessionKeyOf,
  tagsOf,
} from "../admin/secrets.js";
import { type Flags, UsageError } from "../args.js";
import { ConfirmationRequired, type Context, EXIT } from "../context.js";
import { render } from "./shared.js";

type Outcome = "created" | "rotated" | "skipped" | "not_for_this_environment" | "conflict";

const OUTCOME_TEXT: Record<Outcome, string> = {
  created: "creado",
  rotated: "sobrescrito",
  skipped: "no se toca",
  not_for_this_environment: "este entorno no lo lleva",
  conflict: "ha aparecido mientras tanto: no se ha escrito, repite la orden",
};

/** The orders that take no flag of their own beyond `--env`: nothing here is a way in for a value. */
const refuseValues = (positionals: readonly string[], flags: Flags): void => {
  if (positionals.length > 2) {
    // Never quoted: whatever it is, it may be a value that was typed where it must not be.
    throw new UsageError(
      "«atlas admin secrets» no recibe ningún valor en la línea de órdenes: los pide uno a uno, sin eco",
    );
  }
  for (const name of ["force", "from", "accept-unverified", "device"]) {
    if (flags.has(name)) {
      throw new UsageError(`--${name} no vale en «atlas admin secrets»`);
    }
  }
};

/** What the order borrows from `atlas admin`: the confirmation and the reading of a failure of AWS. */
export interface AdminHelpers {
  confirm(ctx: Context, environment: string, question: string): Promise<boolean>;
  translate(error: unknown): unknown;
}

export const secretsOrder = async (
  ctx: Context,
  clients: AdminClients,
  environment: string,
  positionals: readonly string[],
  flags: Flags,
  helpers: AdminHelpers,
): Promise<number> => {
  /**
   * A failure while talking to SSM says what `atlas admin` says of AWS (unavailable,
   * refused: by name) or, for anything else, which parameter and nothing more: what
   * AWS answered may copy the value that was sent.
   */
  const failedWrite = (path: string, error: unknown): DomainError => {
    const said = helpers.translate(error);
    return said instanceof DomainError
      ? said
      : new DomainError("admin_secret_write_failed", "the parameter was not written", {
          parameter: path,
        });
  };
  refuseValues(positionals, flags);
  const { askSecret, ask } = ctx.io;
  if (askSecret === undefined || ask === undefined) {
    throw new ConfirmationRequired(
      "«atlas admin secrets» pide cada valor sin eco y no hay terminal interactiva: no se ha tocado nada",
    );
  }
  const tags = tagsOf(environment);
  const results: { parameter: string; outcome: Outcome }[] = [];

  /** The value of one parameter, or `undefined` to leave it as it is. */
  const askValue = async (spec: SecretSpec, exists: boolean): Promise<string | undefined> => {
    const here = exists ? "ya existe" : "no existe";
    switch (spec.source) {
      case "generated": {
        // Generated here, never typed and never shown: what is asked is the go-ahead.
        const verb = exists
          ? "Rotarla cierra todas las sesiones abiertas"
          : "Se genera aquí, nunca se muestra";
        const typed = await ask(
          `${spec.path}: ${here}. ${verb}. Escribe «${environment}» para ${exists ? "rotarla" : "crearla"}, o Enter para dejarla: `,
        );
        return typed === environment ? sessionKeyOf(ctx.deps.random) : undefined;
      }
      case "allow-list": {
        ctx.io.out(
          `${spec.path}: ${here}. Se escribe entera (retirar el acceso es no incluir la entrada) y no se puede leer lo que había.`,
        );
        const entries: { sub: string; email: string }[] = [];
        for (;;) {
          const sub = await askSecret(
            `  sub de la entrada ${entries.length + 1} (Enter para terminar): `,
          );
          if (sub === undefined || sub === "") {
            break;
          }
          const email = await askSecret(`  correo de la entrada ${entries.length + 1}: `);
          entries.push({ sub, email: email ?? "" });
        }
        return entries.length === 0 ? undefined : allowListOf(spec.path, entries);
      }
      default: {
        const typed = await askSecret(
          `${spec.path}: ${here}. Valor de ${spec.label} (Enter para dejarlo): `,
        );
        return typed === undefined || typed === "" ? undefined : checkedToken(spec.path, typed);
      }
    }
  };

  for (const spec of SECRETS) {
    if (spec.never === environment) {
      results.push({ parameter: spec.path, outcome: "not_for_this_environment" });
      continue;
    }
    const name = `${clients.ssmPrefix}${spec.path}`;
    let exists: boolean;
    try {
      exists = await clients.secrets.exists(name);
    } catch (error) {
      throw failedWrite(spec.path, error);
    }
    const value = await askValue(spec, exists);
    if (value === undefined) {
      results.push({ parameter: spec.path, outcome: "skipped" });
      continue;
    }
    // A generated key already asked for the name of the environment.
    if (exists && spec.source !== "generated") {
      const confirmed = await helpers.confirm(
        ctx,
        environment,
        `${spec.path} ya existe y se sobrescribe: lo anterior no se puede leer de vuelta.`,
      );
      if (!confirmed) {
        results.push({ parameter: spec.path, outcome: "skipped" });
        continue;
      }
    }
    try {
      if (exists) {
        await clients.secrets.rotate(name, value, spec.kind, tags);
        results.push({ parameter: spec.path, outcome: "rotated" });
      } else {
        const written = await clients.secrets.create(name, value, spec.kind, tags);
        results.push({
          parameter: spec.path,
          outcome: written === "created" ? "created" : "conflict",
        });
      }
    } catch (error) {
      throw failedWrite(spec.path, error);
    }
  }
  render(
    ctx,
    { environment, parameters: results },
    [
      `Secretos de ${environment}:`,
      ...results.map((result) => `  ${result.parameter}: ${OUTCOME_TEXT[result.outcome]}`),
    ].join("\n"),
  );
  return results.some((result) => result.outcome === "conflict") ? EXIT.conflict : EXIT.ok;
};
