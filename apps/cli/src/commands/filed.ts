// atlas filed <renta|720|721> <año> — record a return that was actually filed.
//
// **What was filed is a fact, not a calculation** (ADR-0020). The command
// starts from what the application computes, because nobody wants to type a
// dozen figures, and then lets the user replace any of them with what he really
// declared: the two are not the same thing, and the whole point of the event is
// that the ledger keeps the second one even when the application computes
// something else today.
//
// Which figures a return declares, how they are named and what event comes out
// of them live in the domain (`filingProposal`): the web records the same
// filing from the same proposal, and a key of `--set` is part of the contract
// of both.
//
// Nothing is written without an explicit confirmation (decision (l)): turning a
// calculation into "what was filed" by pressing enter is exactly what ADR-0020
// separates.

import { type FilingModel, type Money, todayInMadrid } from "@atlas/domain";
import { filingProposal } from "@atlas/domain/fiscal";
import { assertKnownFlags, type Flags, listFlag, stringFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { confirmAndRecord, loadForQuery } from "./shared.js";

const USAGE =
  "uso: atlas filed <renta|720|721> <año> [--set <clave>=<importe>]… [--filed-at YYYY-MM-DD] [--receipt <referencia>] [--notes <texto>] [--supersedes <id>]";

const MODELS: readonly FilingModel[] = ["renta", "720", "721"];

/** Two decimals always, so the column reads as money. */
const cents = (money: Money): string => {
  const [whole, fraction = ""] = money.roundToCents().amount.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

/** `--set clave=importe`, checked against the keys the return actually has. */
const overrides = (keys: ReadonlySet<string>, values: readonly string[]): Map<string, string> => {
  const declared = new Map<string, string>();
  for (const raw of values) {
    const at = raw.indexOf("=");
    if (at < 0) {
      throw new UsageError(`--set se escribe clave=importe (recibido: ${raw})`);
    }
    const key = raw.slice(0, at);
    if (!keys.has(key)) {
      throw new UsageError(
        `--set ${key}: esta declaración no tiene esa cifra. Las que tiene: ${[...keys].join(", ")}`,
      );
    }
    declared.set(key, raw.slice(at + 1));
  }
  return declared;
};

export const filedCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["set", "filed-at", "receipt", "notes", "supersedes", ...GLOBAL_FLAGS]);
  const model = positionals[1] as FilingModel | undefined;
  const year = Number(positionals[2]);
  if (model === undefined || !MODELS.includes(model) || !Number.isInteger(year)) {
    throw new UsageError(USAGE);
  }
  const today = todayInMadrid(ctx.deps.clock);
  const { events } = await loadForQuery(ctx);
  const proposal = filingProposal(events, model, year, { today });
  const computed = new Map(
    proposal.figures.map((figure) => [figure.key, cents(figure.amount_eur)]),
  );
  const declared = overrides(new Set(computed.keys()), listFlag(flags, "set"));
  ctx.io.out(
    `Lo que la aplicación calcula hoy para ${model === "renta" ? "la Renta" : `el Modelo ${model}`} de ${year}, y lo que vas a declarar:`,
  );
  ctx.io.out(
    table(
      ["clave", "calculado", "declarado"],
      [...computed].map(([key, amount]) => [key, amount, declared.get(key) ?? "="]),
    ),
  );
  const notes = stringFlag(flags, "notes");
  const supersedes = stringFlag(flags, "supersedes");
  const draft = proposal.draft(declared, {
    filed_at: stringFlag(flags, "filed-at") ?? today,
    receipt_reference: stringFlag(flags, "receipt") ?? "",
    ...(notes === undefined ? {} : { notes }),
    ...(supersedes === undefined ? {} : { supersedes }),
  });
  await confirmAndRecord(ctx, draft, [
    "Lo que se guarda es lo que declaras, aunque la aplicación calcule otra cosa: es un hecho con consecuencias legales (ADR-0020).",
    ...(proposal.supersedes === undefined && supersedes === undefined
      ? []
      : ["Es una complementaria: sustituye a la presentación que ya consta, no la anula."]),
  ]);
  return 0;
};
