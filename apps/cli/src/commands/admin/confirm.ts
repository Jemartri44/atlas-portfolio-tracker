// The confirmation every order of `atlas admin` that writes asks for.

import { ConfirmationRequired, type Context } from "../../context.js";

/**
 * The confirmation of an order that rewrites the remote or forgets a device
 * (ADR-0032, note of 2026-09-27): never `--yes`, which
 * is written before the list is on screen, and never a plain yes — the user
 * types the name of the environment, with what is at stake in front.
 */
export const confirmEnvironment = async (
  ctx: Context,
  environment: string,
  question: string,
): Promise<boolean> => {
  const typed = await ctx.io.ask?.(`${question} Escribe «${environment}» para seguir: `, {
    aside: ctx.json,
  });
  if (typed === undefined) {
    throw new ConfirmationRequired(
      "hace falta confirmar escribiendo el nombre del entorno, y no hay terminal interactiva",
    );
  }
  return typed === environment;
};
