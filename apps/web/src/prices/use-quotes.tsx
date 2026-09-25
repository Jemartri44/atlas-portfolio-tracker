// The automatic prices of a screen (feature 013, block 5): loaded after the
// first paint, from the folder or from what was imported, and passed to the
// domain through the one gate. Until they arrive — or without any — every
// screen works exactly as before, with the manual prices.

import type { AssetId, ExternalPrices, LedgerState } from "@atlas/domain";
import { type Accessor, createResource, type JSX, Show } from "solid-js";
import { Notice } from "../components/index.js";
import type { WebQuotes } from "./quotes.js";

// Imported when the screen asks, not with it: a static import made every
// screen that shows prices name the chunks of the folder, the ECB and the
// quotes in the table of preloads of the entry, which is on the boot path
// (+33 bytes measured, review of PR #78).
const quotesModule = () => import("./quotes.js");

export interface ScreenQuotes {
  readonly quotes: Accessor<WebQuotes | undefined>;
  /** The quotes for the ledger cut at a date (`asOf`): the gate takes them as they are. */
  readonly external: (state: LedgerState) => ExternalPrices | undefined;
}

/** Loads the closes of the assets of `state` once, for one screen. */
export const useQuotes = (state: LedgerState): ScreenQuotes => {
  const ids: AssetId[] = [...state.assets.keys()];
  const [loaded] = createResource(async () => {
    const module = await quotesModule();
    return { quotes: await module.loadWebQuotes(ids), externalOf: module.externalOf };
  });
  return {
    quotes: () => loaded()?.quotes,
    external: (dated) => {
      const current = loaded();
      return current === undefined ? undefined : current.externalOf(current.quotes, dated);
    },
  };
};

const PROBLEMS = {
  permission:
    "Hay una carpeta enlazada, pero el navegador ha perdido el permiso para leerla: los precios automáticos no se leen. Vuelve a enlazarla en Ajustes.",
  storage:
    "Este navegador no permite leer datos guardados del sitio: no hay precios automáticos importados.",
} as const;

/** What a screen says about its automatic prices when something is wrong: never silent. */
export const QuotesNotice = (props: { quotes: WebQuotes | undefined }): JSX.Element => (
  <Show when={props.quotes}>
    {(quotes) => (
      <>
        <Show when={quotes().problem}>
          {(problem) => <Notice severity="caution">{PROBLEMS[problem()]}</Notice>}
        </Show>
        <Show when={quotes().unreadable.length > 0}>
          <Notice severity="caution">
            {`Los precios automáticos de ${quotes().unreadable.length === 1 ? "un activo no se pueden leer" : `${quotes().unreadable.length} activos no se pueden leer`}: esos activos se quedan sin precio automático, porque nunca se leen a medias. Descárgalos otra vez con la consola.`}
          </Notice>
        </Show>
      </>
    )}
  </Show>
);
